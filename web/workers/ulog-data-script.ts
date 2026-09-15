// ⚠️ 自动生成，请勿手改。源文件在 engine/ 与 knowledge/px4/，改完跑 `pnpm build:kb`（dev/build 自动执行）。
export const PY_ULG_DATA_HELPERS = String.raw`
# ============ 通用工具 ============
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
def np_series(topic, instance, fields_json, max_points=3000):
    global __result
    fields = json.loads(fields_json)
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
    t0 = int(ulog.start_timestamp) if getattr(ulog, "start_timestamp", 0) else int(ts[0])
    out = {
        "topic": topic, "instance": int(instance),
        "t0us": t0,
        "t": [round((int(ts[i]) - t0) / 1e6, 3) for i in idx],
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

# ============ 飞行模式枚举（数据在 knowledge/px4/facts.yaml）============
# 码表都在 facts.yaml（引擎只提供机制）：改名字/加码值不用动 Python。
_VS = FACTS["bindings"]["vehicle_status"]
NAV_STATE_NAMES = {int(k): v for k, v in FACTS["nav_state_names"].items()}

def _phases():
    d = _np_find(_VS["topic"], 0)
    if d is None:
        return []
    ts = np.asarray(d.data["timestamp"], dtype=np.int64)
    t0 = int(ulog.start_timestamp) if getattr(ulog, "start_timestamp", 0) else int(ts[0])
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
            "startSec": round((int(ts[a]) - t0) / 1e6, 2),
            "endSec": round((int(ts[b]) - t0) / 1e6, 2),
            "navState": code,
            "mode": NAV_STATE_NAMES.get(code, "Mode %d" % code),
            "armed": seg_arm == _VS["armed_value"],
        })
    return phases

# ============ np_log_info：系统信息 / 事件 / 丢包 / 参数 / 阶段 ============
# 日志级别与「系统信息」字段清单同样来自 facts.yaml
LOG_LEVEL_NAMES = {int(k): v for k, v in FACTS["log_levels"].items()}
SYS_INFO_KEYS = FACTS["sys_info_keys"]

def np_log_info():
    t0 = int(getattr(ulog, "start_timestamp", 0) or 0)
    info = ulog.msg_info_dict if hasattr(ulog, "msg_info_dict") else {}
    sys_info = {k: str(info[k]) for k in SYS_INFO_KEYS if k in info}

    messages = []
    for m in ulog.logged_messages:
        lvl = int(getattr(m, "log_level", 6))
        try:
            lstr = m.log_level_str()
        except Exception:
            lstr = LOG_LEVEL_NAMES.get(lvl, "LEVEL %d" % lvl)
        messages.append({
            "tSec": round((int(m.timestamp) - t0) / 1e6, 2),
            "level": lvl,
            "levelStr": str(lstr),
            "message": str(m.message).strip(),
        })

    dropouts = [{"tSec": round((int(d.timestamp) - t0) / 1e6, 2), "durationMs": int(d.duration)}
                for d in ulog.dropouts]

    params = {str(k): _clean(np.asarray(v).reshape(-1)[0]) if hasattr(v, "reshape") else _clean(v)
              for k, v in ulog.initial_parameters.items()}

    changed = []
    cp = getattr(ulog, "changed_parameters", None)
    if cp is None:
        cp = getattr(ulog, "_changed_parameters", [])
    for p in cp:
        changed.append({
            "tSec": round((int(getattr(p, "timestamp", t0)) - t0) / 1e6, 2),
            "name": str(getattr(p, "name", "")),
            "value": _clean(getattr(p, "value", None)),
        })

    global __result
    __result = json.dumps({
        "sysInfo": sys_info,
        "messages": messages,
        "dropouts": dropouts,
        "params": params,
        "changedParams": changed,
        "phases": _phases(),
    }, ensure_ascii=False)
`;
