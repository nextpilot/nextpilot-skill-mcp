
# ============ 通用工具 ============
# 时间基准：**开机以来的秒数**。PX4 的时间戳本身就是"开机起的微秒"，直接用即可；
# 之前减过 ulog.start_timestamp（那是"日志开始记录的时刻"，通常比开机晚几秒到几分钟），
# 于是同一份日志在本站与 Flight Review 上差出那一段——FR 的 Logged Messages 与曲线横轴
# 用的都是开机时间（plotted_tables.time_str 直接除 timestamp）。这里对齐它。
def _since_boot(t_us, digits=2):
    return round(int(t_us) / 1e6, digits)

def _np_find(topic, instance):
    for d in ulog.data_list:
        if d.name == topic and d.multi_id == instance:
            return d
    return None

def _clean(v):
    """numpy / NaN / Inf -> JSON 安全的 Python 原生结构（NaN 转 None）。"""
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and not np.isfinite(v):
        return None
    return v

def _lttb_indices(n, max_points, ref=None):
    """LTTB 降采样索引（含首尾）。ref 为参考信号（NaN 安全，仅用于选点）。"""
    if n <= max_points or max_points < 3:
        return list(range(n))
    if ref is None:
        ref = np.zeros(n)
    r = np.asarray(ref, dtype=float)
    finite = np.isfinite(r)
    if finite.any():
        r = np.where(finite, r, np.nanmean(r[finite]))
    else:
        r = np.zeros(n)
    bucket = n / (max_points - 2)
    idx = [0]
    a = 0
    for i in range(max_points - 2):
        ts = int(np.floor((i + 1) * bucket))
        te = int(np.floor((i + 2) * bucket))
        ts = min(ts, n - 1); te = min(te, n)
        if te <= ts:
            te = ts + 1
        # 下一桶均值点
        nx = np.mean(np.arange(ts, te))
        ny = float(np.mean(r[ts:te])) if te > ts else float(r[ts])
        best, best_d = ts, -1.0
        for j in range(ts, te):
            area = abs((a - nx) * (float(r[j]) - float(r[a])) -
                       (a - j) * (ny - float(r[a])))
            if area > best_d:
                best, best_d = j, area
        idx.append(best)
        a = best
    idx.append(n - 1)
    return idx

# ============ np_manifest：话题清单（驱动前端预设可用性）============
def np_manifest():
    global __result
    items = []
    for d in ulog.data_list:
        items.append({
            "topic": d.name,
            "instance": int(d.multi_id),
            "n": int(len(d.data["timestamp"])),
            "fields": [{"name": k, "dtype": str(getattr(v, "dtype", type(v).__name__))}
                       for k, v in d.data.items() if k != "timestamp"],
        })
    __result = json.dumps({"topics": items}, ensure_ascii=False)

# ============ np_series：按需抽取 + LTTB 降采样 ============
def np_series(topic, instance, fields_json, max_points=3000, op_json=None):
    """按需抽取时序并 LTTB 降采样。

    op_json：图上要做换算时的**预处理算子**（如 {"name": "quat_to_euler"}），
    与经验用的同一套算子；给了 op 就只返回算子的输出（键为算子的 out_names），
    换算在引擎侧做，前端只画。
    """
    global __result
    fields = json.loads(fields_json)
    op = json.loads(op_json) if op_json else None
    d = _np_find(topic, int(instance))
    if d is None:
        __result = json.dumps({"error": "topic not found: %s#%d" % (topic, instance)})
        return
    ts = np.asarray(d.data["timestamp"], dtype=np.int64)
    n = len(ts)
    ref = None
    for f in fields:
        if f in d.data:
            ref = d.data[f]
            break
    idx = _lttb_indices(n, int(max_points), ref)

    if op:
        name = op.get("name")
        if name not in OPERATORS:
            __result = json.dumps({"error": "未注册的预处理算子：%s" % name})
            return
        args = [np.asarray(d.data[f], dtype=float) if f in d.data else None for f in fields]
        if any(a is None for a in args):
            __result = json.dumps({"error": "预处理算子 %s 的输入字段缺失" % name})
            return
        opts = {k: v for k, v in op.items() if k not in ("name", "labels")}
        res = OPERATORS[name](*args, **opts)
        if res is None:
            __result = json.dumps({"error": "预处理算子 %s 无结果（数据不足）" % name})
            return
        outs = list(res) if isinstance(res, tuple) else [res]
        names = SIGNATURES.get(name, {}).get("out_names") or [
            "out%d" % i for i in range(len(outs))
        ]
        out = {
            "topic": topic,
            "instance": int(instance),
            "t": [_since_boot(ts[i], 3) for i in idx],
            "series": {
                names[i]: [_clean(np.asarray(o, dtype=float)[j]) for j in idx]
                for i, o in enumerate(outs)
            },
            "fullCount": n,
            "op": name,
        }
        __result = json.dumps(out, ensure_ascii=False)
        return

    out = {
        "topic": topic, "instance": int(instance),
        "t": [_since_boot(ts[i], 3) for i in idx],
        "series": {},
        "fullCount": n,
    }
    for f in fields:
        if f in d.data:
            v = d.data[f]
            vv = np.asarray(v, dtype=float)
            out["series"][f] = [_clean(vv[i]) for i in idx]
        else:
            out["series"][f] = None
    __result = json.dumps(out, ensure_ascii=False)

# ============ np_track：GPS 轨迹（地图用，字段候选与量纲写在 facts.yaml 的 track）============
def np_track(max_points=None):
    global __result
    cfg = FACTS.get("track") or {}
    topic = cfg.get("topic")
    d = _np_find(topic, int(cfg.get("instance", 0))) if topic else None
    if d is None:
        __result = json.dumps({"error": "日志里没有 %s 话题" % topic})
        return
    limit = int(max_points or cfg.get("max_points") or 1500)

    cols = {}
    scales = {}
    for name in ("lat", "lon", "alt"):
        for cand in cfg.get(name) or []:
            col = d.data.get(cand.get("field"))
            if col is not None:
                cols[name] = np.asarray(col, dtype=float)
                scales[name] = float(cand.get("scale", 1))
                break
        if name not in cols:
            __result = json.dumps({"error": "轨迹缺少 %s（候选字段都不在日志里）" % name})
            return

    ts = np.asarray(d.data["timestamp"], dtype=np.int64)
    lat = cols["lat"] * scales["lat"]
    lon = cols["lon"] * scales["lon"]
    n = len(ts)

    # GPS 没定位时的采样必须剔掉：PX4 在拿到定位前会连着记 lat=lon=0（几内亚湾那个"空岛"），
    # 一条直线就从那儿连到真正的航迹上——地图上看着完全不对（实测用户日志就是这样）。
    # 判据：坐标在合法范围、不是 (0,0)、且（有 fix_type 时）fix_type ≥ 3 才算 3D 定位。
    valid = np.isfinite(lat) & np.isfinite(lon)
    valid &= (np.abs(lat) <= 90.0) & (np.abs(lon) <= 180.0)
    valid &= ~((np.abs(lat) < 1e-7) & (np.abs(lon) < 1e-7))
    fix = d.data.get("fix_type")
    if fix is not None:
        valid &= np.asarray(fix) >= 3
    idx_valid = np.nonzero(valid)[0]
    if len(idx_valid) < 2:
        __result = json.dumps({"error": "这段日志没有有效的 GPS 定位点（未定位的采样已剔除）"})
        return

    dropped = int(n - len(idx_valid))
    # 轨迹用等距抽样：路径形状比峰值更需要均匀（在有效点里抽，别把 invalid 又抽回来）
    step = max(1, int(np.ceil(len(idx_valid) / limit)))
    idx = [int(i) for i in idx_valid[::step]]
    __result = json.dumps({
        "t": [_since_boot(ts[i]) for i in idx],
        "lat": [_clean(lat[i]) for i in idx],
        "lon": [_clean(lon[i]) for i in idx],
        "alt": [_clean(cols["alt"][i] * scales["alt"]) for i in idx],
        "fullCount": len(idx_valid),
        # 剔掉了多少未定位采样：界面据此说明"点数为什么比采样数少"
        "dropped": dropped,
    }, ensure_ascii=False)


# ============ 飞行模式枚举（数据在 knowledge/px4/facts.yaml）============
# 码表都在 facts.yaml（引擎只提供机制）：改名字/加码值不用动 Python。
_VS = FACTS["bindings"]["vehicle_status"]
NAV_STATE_NAMES = {int(k): v for k, v in FACTS["nav_state_names"].items()}

def _phases():
    d = _np_find(_VS["topic"], 0)
    if d is None:
        return []
    ts = np.asarray(d.data["timestamp"], dtype=np.int64)
    nav = d.data.get(_VS["nav_state"])
    arm = d.data.get(_VS["arming_state"])
    if nav is None:
        return []
    nav = np.asarray(nav)
    arm = np.asarray(arm) if arm is not None else None
    runs = []
    start = 0
    for i in range(1, len(nav)):
        if int(nav[i]) != int(nav[start]):
            runs.append((start, i - 1))
            start = i
    runs.append((start, len(nav) - 1))
    phases = []
    for a, b in runs:
        code = int(nav[a])
        seg_arm = int(np.median(arm[a:b + 1])) if arm is not None else None
        phases.append({
            "startSec": _since_boot(ts[a]),
            "endSec": _since_boot(ts[b]),
            "navState": code,
            "mode": NAV_STATE_NAMES.get(code, "Mode %d" % code),
            "armed": seg_arm == _VS["armed_value"],
        })
    return phases

# ============ np_log_info：系统信息 / 事件 / 丢包 / 参数 / 阶段 ============
# 日志级别与「系统信息」字段清单同样来自 facts.yaml
LOG_LEVEL_NAMES = {int(k): v for k, v in FACTS["log_levels"].items()}
SYS_INFO_KEYS = FACTS["sys_info_keys"]
MSG_TYPES = FACTS["ulog_msg_types"]

def _msg_type_stats(raw):
    """逐条走 ULog 的 [uint16 消息长度][uint8 消息类型] 序列，统计每类消息的条数。

    刻意不走 pyulog 的解析结果：pyulog 只留它认得的东西（把 M 的续行并进同一组、按话题聚合 D…），
    这里要回答的是"文件里究竟有多少条"，顺带当"文件是否被截断"的旁证——走到尾部长度对不上就
    停下并标记，不硬猜。返回 (计数, 是否正好走到文件末尾, 走到哪, 文件多大)。
    """
    counts = {}
    n = len(raw)
    off = 16            # 16 字节文件头：magic 'ULog' + 版本号 + 起始时间戳
    while off + 3 <= n:
        size = raw[off] | (raw[off + 1] << 8)
        if off + 3 + size > n:
            return counts, False, off, n
        code = chr(raw[off + 2])
        counts[code] = counts.get(code, 0) + 1
        off += 3 + size
    return counts, off == n, off, n

def _level_str(m, lvl):
    try:
        return str(m.log_level_str())
    except Exception:
        return LOG_LEVEL_NAMES.get(lvl, "LEVEL %d" % lvl)

def np_log_info():
    info = ulog.msg_info_dict if hasattr(ulog, "msg_info_dict") else {}
    sys_info = {k: str(info[k]) for k in SYS_INFO_KEYS if k in info}

    # Information Message（'I' 消息）的**完整**字典：不止 facts.yaml 里那几个「系统信息」字段。
    # 带上是哪种类型（char[40] / uint32_t…），因为 ver_sw_release 这类整数编码值不写类型看不懂；
    # 中文名与说明取 facts.yaml 的 info_key_docs，表里没有的键留空（不猜）。
    info_types = getattr(ulog, "_msg_info_dict_types", None) or {}
    info_docs = FACTS.get("info_key_docs", {})
    info_dict = []
    for k, v in sorted(info.items()):
        doc = info_docs.get(k) or {}
        info_dict.append({
            "key": str(k),
            "name": str(doc.get("name", "")),
            "type": str(info_types.get(k, "")),
            "value": str(v),
            "desc": str(doc.get("desc", "")),
        })

    # Logged String Message（'L'）：固件打印的文本行。
    # PX4 对**事件**会同时写两样东西：一条事件（二进制，进 `event` topic）和一条等价的
    # 旧格式文本（以 \t 结尾，如 '[commander] Armed by Stick gesture\t'）。这两条先分开收，
    # 等下面解码出事件后再决定要不要留那份重复文本。
    messages = []
    legacy_dupes = []
    for m in ulog.logged_messages:
        lvl = int(getattr(m, "log_level", 6))
        text = str(m.message)
        item = {
            "tSec": _since_boot(m.timestamp),
            "level": lvl,
            "levelStr": _level_str(m, lvl),
            "kind": "log",
            "message": text.strip(),
        }
        (legacy_dupes if text.endswith("\t") else messages).append(item)

    # PX4 事件（`event` topic）解码：pyulog 的 PX4Events 用**日志自带**的 metadata_events
    # （那个 xz blob 就是这份固件的事件定义），所以不联网、且与固件版本严格对应；
    # 定义里没有的 ID 显示 [Unknown event with ID N]。Flight Review 的 Logged Messages 表
    # 就是"解码事件 + 文本消息"两路合并，这里对齐它。
    events = []
    try:
        from pyulog.px4_events import PX4Events
        event_parser = PX4Events()
        # 不外网兜底：日志没带事件定义时宁可不解码，也不去悄悄下载一份"最新的"定义
        event_parser.set_default_json_definitions_cb(lambda _already_has_default: None)
        name_to_lvl = {v: k for k, v in LOG_LEVEL_NAMES.items()}
        for t_us, level_str, text in event_parser.get_logged_events(ulog):
            events.append({
                "tSec": _since_boot(t_us),
                "level": name_to_lvl.get(str(level_str), 6),
                "levelStr": str(level_str),
                "kind": "event",
                "message": str(text).strip(),
            })
    except Exception:
        events = []

    # Tagged Logged String（'C' 消息）：与 'L' 同形，多一个 tag = 消息来源（进程/线程/类），
    # 由机载系统自己定义含义（PX4 主线的固件日志一般不写）。这里按时间并入同一时间轴，
    # tag 原样带上，不猜它的含义。
    tagged_src = getattr(ulog, "logged_messages_tagged", None) or {}
    messages_tagged = []
    for tag, msgs in tagged_src.items():
        for m in msgs:
            lvl = int(getattr(m, "log_level", 6))
            messages_tagged.append({
                "tSec": _since_boot(m.timestamp),
                "level": lvl,
                "levelStr": _level_str(m, lvl),
                "kind": "log",
                "tag": int(tag),
                "message": str(m.message).strip(),
            })
    messages_tagged.sort(key=lambda m: m["tSec"])

    # 解码出事件了：那些 \t 结尾的旧格式文本就是同一件事的另一种说法，丢掉（Flight Review 也如此）。
    # 没有解码结果（固件没带事件定义）就保留它们——否则 armed / takeoff 这类关键节点会凭空消失。
    if not events:
        messages += legacy_dupes
    all_messages = sorted(messages + events + messages_tagged, key=lambda m: m["tSec"])

    dropouts = [{"tSec": _since_boot(d.timestamp), "durationMs": int(d.duration)}
                for d in ulog.dropouts]

    # Multi Information（pyulog 的 msg_info_multiple_dict）：键 → 多组值，没有时间戳。
    # 一组 = 一次记录（pyulog 已把 is_continued 的续段并进同一组），组内怎么拼回文本要看**形态**：
    #   · 逐行型（perf_counter / perf_top / excluded_optional_topics…）：每段就是一行完整文本，
    #     PX4 不给行尾换行 —— 段之间补 \n，否则所有行黏成一行；
    #   · 流式型（boot_console_output）：一整段控制台文本按定长切片，换行在段**内部**，
    #     一行的内容还可能跨段（上段结尾 "…rotation" + 下段开头 " 10\n"）—— 只能直接拼接，
    #     补 \n 会凭空断行。
    # 判据：任一段自带换行 → 流式；否则逐行。实机日志两种键都出现过，别只按一种写死。
    multi_src = getattr(ulog, "msg_info_multiple_dict", None) or {}
    multi_types = getattr(ulog, "msg_info_multiple_dict_types", None) or {}

    def _fmt(v):
        # metadata_events 之类是原始字节，别把 b'ý7zXZ...' 当文本铺出来
        if isinstance(v, (bytes, bytearray)):
            return "（二进制数据 %d 字节）" % len(v)
        return str(v)

    def _fmt_group(grp):
        if not isinstance(grp, list):
            return _fmt(grp)
        # 整组都是原始字节（metadata_events 就是）：只报总字节数，不铺十几行同样的「（二进制数据 …）」
        if grp and all(isinstance(x, (bytes, bytearray)) for x in grp):
            return "（二进制数据 %d 字节，已省略）" % sum(len(x) for x in grp)
        texts = [_fmt(x) for x in grp]
        return "".join(texts) if any("\n" in t for t in texts) else "\n".join(texts)

    messages_multi = []
    for key in sorted(multi_src):
        groups = multi_src[key] or []
        values = [_fmt_group(grp) for grp in groups]
        messages_multi.append({
            "key": str(key),
            "type": str(multi_types.get(key, "")),
            "values": values,
        })

    params = {str(k): _clean(np.asarray(v).reshape(-1)[0]) if hasattr(v, "reshape") else _clean(v)
              for k, v in ulog.initial_parameters.items()}

    # Parameter Default（ULog 的 'Q' 消息）。PX4 的 logger 逐参数比较「当前值 / 机架默认 /
    # 固件默认」三者，**只写与当前值不同的那个**（logger.cpp: write_parameter_defaults）——
    # 于是「有记录」等价于「该参数被改过」，且记录里的默认值必然与当前值不同；
    # 反过来「没记录」表示当前值与两个默认都相同（易失参数不写默认值，也落进「没记录」）。
    # 位含义见 ulog_parameter_default_type_t：bit0 = system（固件出厂默认），
    # bit1 = current_setup（机架配置 + 自定义默认文件）。
    default_params = {}
    get_defaults = getattr(ulog, "get_default_parameters", None)
    if get_defaults is not None:
        for bit, field in ((0, "system"), (1, "setup")):
            for key, val in (get_defaults(bit) or {}).items():
                default_params.setdefault(str(key), {})[field] = _clean(val)

    changed = []
    cp = getattr(ulog, "changed_parameters", None)
    if cp is None:
        cp = getattr(ulog, "_changed_parameters", [])
    for p in cp:
        changed.append({
            "tSec": _since_boot(getattr(p, "timestamp", 0) or 0),
            "name": str(getattr(p, "name", "")),
            "value": _clean(getattr(p, "value", None)),
        })

    # ULog 消息类型统计：顺序与名字来自 facts.yaml 的 ulog_msg_types，没出现过的类型计 0
    counts, walked_to_end, walked_off, file_size = _msg_type_stats(bytes(ulog_bytes))
    known = {str(t["code"]) for t in MSG_TYPES}
    msg_type_stats = [{
        "code": str(t["code"]),
        "name": str(t.get("name", "")),
        "en": str(t.get("en", "")),
        "desc": str(t.get("desc", "")),
        "count": int(counts.get(str(t["code"]), 0)),
    } for t in MSG_TYPES]
    unknown = sum(c for k, c in counts.items() if k not in known)
    if unknown:
        msg_type_stats.append({
            "code": "?", "name": "不在码表里的类型", "en": "Unknown", "count": int(unknown),
            "desc": "固件比本站的码表新，或文件被改过",
        })

    global __result
    __result = json.dumps({
        "sysInfo": sys_info,
        "infoDict": info_dict,
        "msgTypeStats": msg_type_stats,
        # 逐字节统计有没有正好走到文件末尾：false = 尾部有截断/追加段，类型统计只是"读到多少算多少"
        "msgTypeWalkOk": bool(walked_to_end),
        "msgTypeWalkedBytes": int(walked_off),
        "fileSizeBytes": int(file_size),
        # 事件解码结果、文本消息、带 tag 的消息已经并成一条时间轴（按 kind 区分来源）
        "messages": all_messages,
        "messagesMulti": messages_multi,
        "dropouts": dropouts,
        "params": params,
        "defaultParams": default_params,
        # 老固件没设 DEFAULT_PARAMETERS compat flag 时整段缺失：此时「没记录」不能当成
        # 「与默认一致」，前端要区别对待，不能替它下结论。
        "defaultParamsKnown": bool(getattr(ulog, "has_default_parameters", False)),
        "changedParams": changed,
        "phases": _phases(),
    }, ensure_ascii=False)
