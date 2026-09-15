
import json, io, ast, re
import numpy as np
from pyulog import ULog


# 故障知识库（构建期内联，第三层检索用）
FAULT_KB = __FAULT_KB__

# ---------------- 经验规则（rules/*.yaml 编译而来）----------------
RULES = json.loads(r'''__RULES__''')

# ---------------- 事实层的数据绑定与码表（knowledge/px4/facts.yaml 编译而来）----------------
# 引擎只提供机制：字段名、码值、执行顺序都在 YAML 里，改数据不用碰 Python。
FACTS = __FACTS__
_VS = FACTS["bindings"]["vehicle_status"]
_NAV_GROUPS = [(g["phase"], set(int(c) for c in g["codes"])) for g in FACTS["nav_groups"]]

# 同一 slot 内多条规则按 order 字段排序（缺省 100000，再按 id 兜底）。
# **跨 slot 的顺序不在这里决定**：由 facts.yaml 的 slot_order 决定（见文件末尾的执行循环），
# 而 finding 的 id（F01、F02…）按发射顺序生成，所以改 slot_order 会改报告里的编号。
RULES.sort(key=lambda r: (r.get("order", 100000), r.get("id", "")))

# 阈值不再集中存放：每条经验的判定阈值都写在它自己的 rules/*.yaml 里
# （px4-thresholds.toml 已退场）。本文件只保留引擎级格式常量。

# ULog 日志级别：PX4 在 log_level 里填 ASCII 数字，映射与 pyulog Message.log_level_str() 一致
# （见 pyulog/core.py）。经验文件按 level_name 判定，避免再犯“拿 3/4 去比 51/52”的错。
_LOG_LEVEL_NAMES = {int(k): v for k, v in FACTS["log_levels"].items()}

findings = []
checks_run = []
checks_skipped = []
tags = []          # 第二层异常标签（喂给第三层故障库匹配）
guard_tags = []    # 数据质量/边界标签
_fid = [0]

def add_tag(t):
    if t not in tags:
        tags.append(t)

def add(severity, rule_id, tag, title, field, value, threshold=None, unit=None,
        doc=None, suggestion=None, tags_extra=None):
    _fid[0] += 1
    ev = {"field": field, "value": value}
    if threshold is not None: ev["threshold"] = threshold
    if unit is not None: ev["unit"] = unit
    f = {"id": "F%02d" % _fid[0], "severity": severity, "ruleId": rule_id,
         "tag": tag, "title": title, "evidence": ev}
    if doc: f["docUrl"] = doc
    if suggestion: f["suggestion"] = suggestion
    findings.append(f)
    if tag: add_tag(tag)
    for te in (tags_extra or []):
        add_tag(te)

def skipped(check, reason):
    item = {"check": check, "reason": reason}
    if item not in checks_skipped:
        checks_skipped.append(item)

def ran(check):
    if check not in checks_run:
        checks_run.append(check)

def find_all(ulog, name):
    return [d for d in ulog.data_list if d.name == name]

def getf(ds, *names):
    for n in names:
        try:
            v = ds.data[n]
            if v is not None: return v
        except Exception:
            pass
    return None

def pick(ds, *names):
    for n in names:
        try:
            v = ds.data[n]
            if v is not None: return n, v
        except Exception:
            pass
    return None, None

def edge_indices(arr):
    """值发生变化的索引列表（边沿检测，避免扫全数组判断状态）。"""
    a = np.asarray(arr)
    if len(a) < 2: return []
    return [i for i in range(1, len(a)) if int(a[i]) != int(a[i - 1])]

buf = io.BytesIO(bytes(ulog_bytes))
ulog = ULog(buf)

# ---------------- 固件版本识别（PX4 1.15 起 topic 与字段名有破坏性变化）----------------
# ver_sw_release 打包格式：major<<24 | minor<<16 | patch<<8 | type
def detect_firmware(ulog):
    info = getattr(ulog, "msg_info_dict", {}) or {}
    rel = info.get("ver_sw_release")
    fw = {"release": None, "major": None, "minor": None, "patch": None,
          "git": str(info.get("ver_sw", ""))[:12], "hw": str(info.get("ver_hw", ""))}
    if rel is not None:
        try:
            v = int(rel)
            fw.update({"release": v, "major": (v >> 24) & 0xFF,
                       "minor": (v >> 16) & 0xFF, "patch": (v >> 8) & 0xFF})
        except Exception:
            pass
    return fw

FW = detect_firmware(ulog)
FW_MINOR = FW["minor"]
FW_LABEL = ("%d.%d.%d" % (FW["major"], FW["minor"], FW["patch"])) if FW_MINOR is not None else "未知（旧固件或无版本号）"
FW_PROFILE = "px4-1.15+" if (FW_MINOR is not None and FW_MINOR >= 15) else "px4-legacy"

def pick_versioned(*candidates):
    """按固件版本优先取字段来源；版本未知时退化为“字段存在性”判定。
    candidates 形如 (最低 minor 版本或 None, 值)。"""
    known = FW_MINOR is not None
    ordered = sorted(candidates, key=lambda c: (c[0] is None, -(c[0] or 0)))
    for mm, val in ordered:
        if val is None:
            continue
        if mm is None or not known or FW_MINOR >= mm:
            return val
    for _mm, val in candidates:   # 定制固件容错
        if val is not None:
            return val
    return None

# ---------------- 总时长 / 时间基准 ----------------
t_min, t_max = None, None
for d in ulog.data_list:
    t = getf(d, "timestamp")
    if t is not None and len(t) > 1:
        a, b = float(t[0]), float(t[-1])
        t_min = a if t_min is None else min(t_min, a)
        t_max = b if t_max is None else max(t_max, b)
t0 = int(getattr(ulog, "start_timestamp", 0) or (t_min or 0))
duration_s = round((t_max - t_min) / 1e6, 1) if t_min is not None else None
stats = {"durationSec": duration_s if duration_s is not None else 0}

# ---------------- 机型识别 ----------------
VEHICLE_TYPES = {int(k): v for k, v in FACTS["vehicle_types"].items()}
vehicle_type = "unknown"
vs_list = find_all(ulog, _VS["topic"])
vs = vs_list[0] if vs_list else None
if vs is not None:
    vt = getf(vs, _VS["vehicle_type"])
    if vt is not None and len(vt) > 0:
        vehicle_type = VEHICLE_TYPES.get(int(vt[-1]), "unknown(%d)" % int(vt[-1]))
    else:
        rw = getf(vs, _VS["is_rotary_wing"])
        if rw is not None and len(rw) > 0:
            vehicle_type = "rotary_wing" if int(rw[-1]) else "fixed_wing"
stats["vehicleType"] = vehicle_type
stats["firmware"] = FW_LABEL
stats["firmwareProfile"] = FW_PROFILE
if FW["hw"]:
    stats["hardware"] = FW["hw"]

# ---------------- 飞行阶段识别（第二层，用于故障库 phase 匹配）----------------
# nav_state 码值 → 飞行阶段的分组写在 facts.yaml 的 nav_groups（_NAV_GROUPS 已按它构建）

phases_present = set()
armed_intervals = []      # (start_us, end_us)，end=None 表示持续到日志结束
armed_duration_s = 0.0

if vs is not None:
    nav = getf(vs, _VS["nav_state"])
    arm = getf(vs, _VS["arming_state"])
    vts = np.asarray(getf(vs, _VS["timestamp"]), dtype=np.int64)

    # armed 区间（failsafe 失联只在 armed 区间内才报）
    if arm is not None:
        a = np.asarray(arm)
        start_i = None
        for i in range(len(a)):
            if int(a[i]) == _VS["armed_value"] and start_i is None:
                start_i = i
            elif int(a[i]) != _VS["armed_value"] and start_i is not None:
                armed_intervals.append((int(vts[start_i]), int(vts[i])))
                start_i = None
        if start_i is not None:
            armed_intervals.append((int(vts[start_i]), None))
        total_us = 0
        for s, e in armed_intervals:
            total_us += ((e if e is not None else int(vts[-1])) - s)
        armed_duration_s = round(total_us / 1e6, 1)

    trans_mode = getf(vs, _VS["vtol_in_trans_mode"])
    if nav is not None:
        nav_arr = np.asarray(nav)
        # 只统计 armed 段内的状态；未解锁的地面操作不产生飞行阶段
        if armed_intervals:
            amask = np.zeros(len(nav_arr), dtype=bool)
            for s, e in armed_intervals:
                lo = int(np.searchsorted(vts, s))
                hi = len(vts) if e is None else int(np.searchsorted(vts, e))
                amask[lo:hi] = True
            codes = set(int(c) for c in nav_arr[amask])
            for _phase, _codes in _NAV_GROUPS:
                if codes & _codes:
                    phases_present.add(_phase)
if vs is not None and trans_mode is not None:
    if int(np.max(np.asarray(trans_mode))) > 0:
        phases_present.add("vtol_transition")
# 无 armed 段时，短日志 guard 之外不做任何故障库匹配
stats["armedDurationSec"] = armed_duration_s
stats["phases"] = sorted(phases_present)

# 短日志 guard 的标签由 rules/guard-short-log.yaml 给出；调用放在框架定义之后
# （见下方 _run_rules("guards_early")），以保证它是第一个 guard 标签。

# ---------------- 数据质量事实（供 guards 类经验判定）----------------
# 中途重启：同一 topic 时间戳出现回退（样本 > 10 才算）
restart_topics = 0
for _d in ulog.data_list:
    _t = getf(_d, "timestamp")
    if _t is not None and len(_t) > 10:
        _a = np.asarray(_t, dtype=np.int64)
        if int(np.count_nonzero(np.diff(_a) < 0)) > 0:
            restart_topics += 1
# 日志丢包累计
dropout_total_ms = int(sum(getattr(d, "duration", 0) for d in getattr(ulog, "dropouts", [])))
stats["dropoutTotalMs"] = dropout_total_ms

def in_armed(ts_us):
    for s, e in armed_intervals:
        if ts_us >= s and (e is None or ts_us <= e):
            return True
    return False

# ---------------- 经验规则框架（rules/*.yaml 驱动）----------------
# 位置说明：本段位于原「规则 4：CPU 负载」处。迁移期的顺序约束——规则按 RULES 顺序
# 在此执行，而 finding.id（F01、F02…）按发射顺序生成，所以**必须按与原检查相同的次序
# 迁移**（vibration → ekf → power → cpu → gps → failsafe …），否则 id 会与冻结基线错位。
_ALLOWED_NODES = (
    ast.Expression, ast.BoolOp, ast.And, ast.Or, ast.UnaryOp, ast.Not, ast.USub,
    ast.Compare, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.Eq, ast.NotEq, ast.In, ast.NotIn,
    ast.Is, ast.IsNot,
    ast.BinOp, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod,
    ast.Name, ast.Load, ast.Constant, ast.List, ast.Tuple, ast.Set,
)


def _eval_expr(expr, env):
    """受限表达式求值：先按白名单遍历 AST，再在空 __builtins__ 下求值。

    绝不 eval 用户可控代码：不允许属性访问、下标、函数调用、推导式等。
    """
    tree = ast.parse(expr, mode="eval")
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_NODES):
            raise ValueError("表达式含不允许的语法 %s：%s" % (type(node).__name__, expr))
    return eval(compile(tree, "<rule>", "eval"), {"__builtins__": {}}, env)


def _read_field_ref(ref):
    """'topic.field' → 该字段在各实例上的值（多实例拼接）；topic/字段缺失返回 None。

    数组字段（如 float32[14] voltage_cell_v）pyulog 按 'field[i]' 暴露，
    直接 getf(field) 拿不到，这里尝试下标 0..31，返回**每元素一列的列表**；
    缺的元素位置为 None。
    """
    topic, _, field = ref.partition(".")
    ds = find_all(ulog, topic)
    if not ds:
        return None

    def gather(get_one):
        vals = []
        for d in ds:
            v = get_one(d)
            if v is not None and len(v):
                vals.append(np.asarray(v, dtype=float))
        if not vals:
            return None
        return np.concatenate(vals) if len(vals) > 1 else vals[0]

    direct = gather(lambda d: getf(d, field))
    if direct is not None:
        return direct
    def gather_cell(idx):
        # pyulog 对定长数组通常暴露为 'field[0]'，个别构建为 'field_0'
        return gather(lambda d: getf(d, f"{field}[{idx}]", f"{field}_{idx}"))

    col0 = gather_cell(0)
    if col0 is None:
        return None
    columns = []
    for i in range(32):
        columns.append(gather_cell(i))
    while columns and columns[-1] is None:
        columns.pop()
    return columns


def _read_field_ref_grouped(ref, aliases=None):
    """per_instance 取数：返回「每个 topic 实例一组」的列表（不跨实例拼接）。

    每组是：标量字段 → 一维数组；定长数组字段 → 每元素一列的列表；缺失 → None。
    aliases 为该字段的备用命名（pyulog 字段改名/旧固件）：标量按整名回退，
    数组字段按 'stem[i]' / 'stem_i' 两种形态按下标展开。
    """
    topic, _, field = ref.partition(".")
    ds = find_all(ulog, topic)
    if not ds:
        return None
    aliases = list(aliases or [])
    groups = []
    for d in ds:
        direct = getf(d, field, *aliases)
        if direct is not None and len(direct):
            groups.append(np.asarray(direct, dtype=float))
            continue
        stems = [field] + aliases
        cols = []
        for idx in range(32):
            col = None
            for stem in stems:
                v = getf(d, f"{stem}[{idx}]", f"{stem}_{idx}")
                if v is not None and len(v):
                    col = np.asarray(v, dtype=float)
                    break
            cols.append(col)
        while cols and cols[-1] is None:
            cols.pop()
        groups.append(cols if cols else None)
    return groups


def _collect_log_messages():
    """ulog.logged_messages → [{tSec, message, level, level_name}]。

    level 是 ULog 里的原始字节，PX4 填的是 **ASCII 数字**（'3'=51 才是 ERROR），
    与 pyulog 的 Message.log_level_str() 一致；因此经验文件按 level_name 判定，
    不要直接和 3/4 这种数字比（迁移前就是这么比错的，导致消息类经验从不命中）。
    """
    out = []
    for m in getattr(ulog, "logged_messages", []):
        try:
            ts_s = round((int(m.timestamp) - t0) / 1e6, 2)
        except Exception:
            ts_s = None
        lvl = int(getattr(m, "log_level", ord("6")))
        out.append({
            "tSec": ts_s,
            "message": str(m.message).strip(),
            "level": lvl,
            "level_name": _LOG_LEVEL_NAMES.get(lvl, "UNKNOWN"),
        })
    return out


def _rule_env():
    """日志级内置变量：经验里可直接引用，无需在 compute 里声明。"""
    return {
        "firmware": FW_LABEL,
        "fw_major": FW["major"], "fw_minor": FW["minor"], "fw_profile": FW_PROFILE,
        "airframe": vehicle_type,
        "is_rotary_wing": vehicle_type == "rotary_wing",
        "is_fixed_wing": vehicle_type == "fixed_wing",
        "is_vtol": "vtol" in vehicle_type,
        "is_rover": vehicle_type == "rover",
        "duration_s": duration_s if duration_s is not None else 0,
        "armed_s": armed_duration_s,
        "phases": phases_present,
        "tags": set(tags),
        "guard_tags": set(guard_tags),
        # 时序算子（如 head_tail_median_drop）按 armed 区间切窗用
        "armed_intervals": armed_intervals,
        # 事件类算子的相对时间（t=xx.x s）基准
        "t0_us": t0,
        # 是否有 armed 段（原过程式大量用 `if armed_intervals:` 做外层门控）
        "has_armed": bool(armed_intervals),
        # 本日志实际存在的 topic 名集合（表达式里可写 "'xxx' in topics"）
        "topics": set(d.name for d in ulog.data_list),
        # 数据质量事实（guards 类经验用）
        "restart_detected": restart_topics > 0,
        "dropout_ms": dropout_total_ms,
        # 日志消息（ulog.logged_messages）：供「日志消息聚合」类经验按级别筛选
        "messages": _collect_log_messages(),
    }


def _match_firmware(spec):
    """适用范围轴①：固件版本。any / ">=1.15" / "<1.15" / ">=1.14,<1.15"（逗号=与）。"""
    if not spec or spec == "any":
        return True
    if FW_MINOR is None:
        return True          # 版本未知不因版本排除（与迁移前“按字段存在性判定”一致）
    cur = (FW["major"] if FW["major"] is not None else 0, FW_MINOR)
    for part in str(spec).split(","):
        m = re.match(r"^\s*(>=|<=|==|>|<)?\s*(\d+)\.?(\d+)?\s*$", part)
        if not m:
            raise ValueError("无法解析 firmware 约束：%r" % spec)
        op, maj, mi = m.group(1) or "==", int(m.group(2)), int(m.group(3) or 0)
        want = (maj, mi)
        ok = {">=": cur >= want, "<=": cur <= want, ">": cur > want,
              "<": cur < want, "==": cur == want}[op]
        if not ok:
            return False
    return True


def _match_airframe(spec):
    """适用范围轴②：机架。any / rotary_wing / [fixed_wing, vtol]；vtol 按子串匹配。"""
    if not spec or spec == "any":
        return True
    wanted = spec if isinstance(spec, (list, tuple)) else [spec]
    for w in wanted:
        w = str(w)
        if w == "vtol" and "vtol" in vehicle_type:
            return True
        if w == vehicle_type:
            return True
    return False


def _run_rules(slot):
    """执行声明了该 slot 的经验规则。

    finding 的 id 是按发射顺序（F01、F02…）生成的，所以每条规则的 slot **必须与
    它所替换的原过程式检查的位置一致**（vibration → ekf → power → cpu → gps →
    failsafe → mode_thrash …）；同一 slot 内按 rules/*.yaml 的文件名顺序执行。
    """
    for _rule in RULES:
        if _rule.get("slot") != slot:
            continue
        _rid = _rule["id"]
        _checks = (_rule.get("emit") or {}).get("check")
        if _checks is None:
            _checks = []            # guards 类经验没有 check 名（不记 ran/skipped）
        elif not isinstance(_checks, list):
            _checks = [_checks]
        # not_applicable.when：声明式表达“该经验对本日志不适用”（如机型未知）。
        # 必须在 firmware/airframe 轴判定**之前**：轴不匹配是静默的，而这里要留下
        # skip 记录（如机型未知要写明原因，机型是旋翼却什么都不记——与原实现一致）。
        _na = _rule.get("not_applicable") or {}
        if _na.get("when") and _eval_expr(_na["when"], _rule_env()):
            for _check in _checks:
                skipped(_check, _na.get("skip_reason") or "不适用")
            continue
        # silent_when：静默不适用——既不 ran 也不 skipped（对应原过程式“外层 if 不成立”）
        _sw = _rule.get("silent_when")
        if _sw and _eval_expr(_sw, _rule_env()):
            continue
        # 适用范围三轴：固件 / 机架（不适用则默认静默——既不 ran 也不 skipped，
        # 与原过程式“外层 if 不成立”一致；确需留痕时用 skip_reason_axis 单独声明，
        # 不要复用 not_applicable.skip_reason：那是给 not_applicable.when 用的，
        # 两者混用会让“机型不匹配”也带上“机型未知”的原因。）
        if not _match_firmware(_rule.get("firmware")) or not _match_airframe(_rule.get("airframe")):
            if _rule.get("skip_reason_axis"):
                for _check in _checks:
                    skipped(_check, _rule["skip_reason_axis"])
            continue
        # requires.any_of / all_of：分别表示“任一存在即可”与“必须都存在”的依赖 topic
        # （多版本同义 topic 用 any_of，如 estimator_wind / wind_estimate）。缺则 skipped。
        _req = _rule.get("requires") or {}
        _need_any = _req.get("any_of") or []
        _need_all = _req.get("all_of") or []
        _missing = (bool(_need_any) and not any(find_all(ulog, t) for t in _need_any)) or \
                   (bool(_need_all) and not all(find_all(ulog, t) for t in _need_all))
        if _missing:
            _need_txt = list(_need_any) + list(_need_all)
            for _check in _checks:
                skipped(_check, _rule.get("skip_reason") or ("缺少依赖 topic：%s" % ", ".join(_need_txt)))
            continue
        # topic 在就 ran（与原过程式块一致：ran() 在块首，数据不足只代表不发射 finding）。
        # ran_on_success：原实现把 ran() 放在数据判定**之后**（如 motor_balance 只在
        # 活跃通道 >= 4 时才算“跑过”），这类规则改为 compute 成功后再记 ran。
        _ran_late = bool(_rule.get("ran_on_success")) or _rule.get("ran_when") is not None
        if not _ran_late:
            for _check in _checks:
                ran(_check)

        _env = _rule_env()
        _ok = True
        for _node in (_rule.get("compute") or []):
            # 归一化：单输入可用短写法 from:（字符串或列表），单输出可直接写 out: 名字
            _ins = _node.get("in")
            if _ins is None:
                _ins = _node["from"] if isinstance(_node["from"], list) else [_node["from"]]
            _outs = _node["out"] if isinstance(_node["out"], list) else [_node["out"]]
            # when_fw：节点级版本条件（如 when_fw: ">=1.15"）。不满足就跳过该节点、
            # 输出置 None，交给后续 coalesce/choose 选另一版本的分支 —— 于是"同一字段
            # 在不同固件里换了名字/topic"这件事在经验文件里是显式可读、可校验的。
            _wf = _node.get("when_fw")
            if _wf is not None and not _match_firmware(_wf):
                for _name in _outs:
                    _env[_name] = None
                continue
            _args = []
            _per_inst = bool(_node.get("per_instance"))
            _node_aliases = _node.get("aliases") or {}
            for _ref in _ins:
                if not isinstance(_ref, str):
                    _args.append(_ref)          # YAML 字面量（数字/布尔），直接作为算子入参
                elif _ref in _env:
                    _args.append(_env[_ref])
                elif _node.get("instance") is not None:
                    # instance: N —— 只取第 N 个实例（对应原过程式的 xxx_list[0]；
                    # 多实例 topic（如每 IMU 一个 estimator_sensor_bias）必须显式指定，
                    # 否则默认读取会把各实例拼接起来，语义就变了
                    _grp = _read_field_ref_grouped(_ref, _node_aliases.get(_ref))
                    _idx = int(_node["instance"])
                    _args.append(_grp[_idx] if _grp and len(_grp) > _idx else None)
                elif _per_inst:
                    _args.append(_read_field_ref_grouped(_ref, _node_aliases.get(_ref)))
                else:
                    _args.append(_read_field_ref(_ref))
            # optional: true 的节点允许 None 输入与 None 输出（缺失沿数据流显式传播）
            if any(_a is None for _a in _args) and not _node.get("optional"):
                _ok = False
                break
            try:
                _res = OPERATORS[_node["op"]](*_args, **_node)
            except Exception:
                # 算子内部异常（脏数据/字段形态意外）不该中断整份日志：按“数据不足”中止本条规则
                _ok = False
                break
            if _res is None and not _node.get("optional"):
                _ok = False
                break
            if _res is None:
                for _name in _outs:
                    _env[_name] = None
                continue
            if not isinstance(_res, tuple):
                _res = (_res,)
            for _name, _v in zip(_outs, _res):
                _env[_name] = _v
        if not _ok:
            # 数据不足：默认不发射、不补 skipped（与原过程式语义一致）；规则显式声明
            # skip_reason_no_data 时额外记一条（如 airspeed 的“无固定翼巡航段”）
            if _rule.get("skip_reason_no_data"):
                for _check in _checks:
                    skipped(_check, _rule["skip_reason_no_data"])
            continue
        if _ran_late:
            # 原实现把 ran() 放在数据判定**之后**（如 motor_balance 只在活跃通道 >= 4 时
            # 才算“跑过”、attitude 只在机动段样本足够时才算）。ran_when 可再给条件。
            _ran_ok = True
            if _rule.get("ran_when") is not None:
                try:
                    _ran_ok = bool(_eval_expr(_rule["ran_when"], _env))
                except Exception:
                    _ran_ok = False
            if _ran_ok:
                for _check in _checks:
                    ran(_check)

        _emit = _rule["emit"]
        # emit.guard_tags：按条件产生的数据质量标签（等价于原过程式的 guard_tags.append，
        # 不依赖是否发出 finding——如陀螺零偏的“温度变化大”）
        for _gspec in (_emit.get("guard_tags") or []):
            try:
                _g_hit = _eval_expr(_gspec["when"], _env)
            except Exception:
                _g_hit = False
            if _g_hit and _gspec.get("tag") and _gspec["tag"] not in guard_tags:
                guard_tags.append(_gspec["tag"])
        for _key, _spec in (_emit.get("stats") or {}).items():
            _v = _env.get(_spec["var"])
            if _v is None:
                continue
            stats[_key] = round(float(_v), int(_spec["round"])) if "round" in _spec else _v

        # foreach: 把一条规则算出的「事件列表」展开成多条 finding（如 failsafe 的每次边沿）。
        # 事件 dict 的键会叠加进模板环境，所以文案仍写在经验文件里；
        # 每个事件最多命中一条 trigger（自上而下第一条），与单事件规则一致。
        # foreach 支持两种写法：`foreach: events` 或
        # `foreach: {var: events, keys: [t_s]}`（后者让构建期能校验事件键的占位符）
        _for_spec = _rule.get("foreach")
        _for_key = _for_spec.get("var") if isinstance(_for_spec, dict) else _for_spec
        if _for_key:
            _items = _env.get(_for_key) or []
        else:
            _items = [None]
        for _item in _items:
            _tenv = _env
            if _item is not None:
                if not isinstance(_item, dict):
                    continue
                _tenv = dict(_env)
                _tenv.update(_item)
            for _trig in (_rule.get("triggers") or []):
                # 单条触发条件出错（例如表达式把缺失值 None 与数值比较）不应让整份日志
                # 的分析崩掉：视为未命中，继续下一条。这类错误应当在基线回归里暴露。
                try:
                    _hit = _eval_expr(_trig["expr"], _tenv)
                except Exception:
                    _hit = False
                if not _hit:
                    continue
                # 数据质量标签副作用（如强风 wind_strong）：必须在 add() 之前追加，
                # 顺序与原过程式代码一致（guardTags 数组顺序也参与基线比对）
                _gt = _trig.get("guard_tag", _emit.get("guard_tag"))
                if _gt and _gt not in guard_tags:
                    guard_tags.append(_gt)
                if "value_const" in _trig:
                    _val = _trig["value_const"]
                elif "value_text" in _trig:
                    # 证据值本身是带占位符的文案（如 "fault=1024,nan=0"、"set at 25.6s"）
                    _val = _trig["value_text"].format_map(_tenv)
                else:
                    _val = _tenv.get(_trig["value"]) if _trig.get("value") else None
                    if _val is not None and _trig.get("round") is not None:
                        _val = round(float(_val), int(_trig["round"]))
                _field = _trig["field"]
                if "{" in _field:
                    _field = _field.format_map(_tenv)
                # suggestion 同样允许占位符（如 "涉及：{names}。"），与 title 一致
                _sugg = _trig.get("suggestion")
                if _sugg and "{" in _sugg:
                    _sugg = _sugg.format_map(_tenv)
                add(_trig["severity"], _rid, _trig.get("tag", _emit.get("tag")),
                    _trig["title"].format_map(_tenv), _field, _val,
                    _trig.get("threshold"), _trig.get("unit"),
                    _emit.get("doc"), _sugg)
                # evidence_extra: {evidence 键: 变量名}，把额外证据挂到刚发出的 finding 上
                # （如日志消息的 samples 原文列表）
                for _ek, _evn in (_trig.get("evidence_extra") or {}).items():
                    _evv = _tenv.get(_evn)
                    if _evv is not None:
                        findings[-1]["evidence"][_ek] = _evv
                break


# guards_early：必须在其它规则之前跑，保证 insufficient_data 是第一个 guard 标签
# ---------------- 按 facts.yaml 的 slot_order 顺序执行各 slot ----------------
# 顺序即 finding 编号（F01、F02…）的生成顺序，也决定 guard 标签的先后
# （guards_early 排第一，insufficient_data 才会是第一个 guard 标签）。
# 新增经验只需把 slot 写进 knowledge/px4/facts.yaml 的 slot_order（或复用已有 slot）
# 并让经验里的 slot 对上——**不用改这个文件**；构建期会校验 slot 是否都已登记。
for _slot in FACTS["slot_order"]:
    _run_rules(_slot)

# ---------------- 第三层：故障知识库确定性匹配 ----------------
def match_fault_kb():
    active_tags = set(tags)
    matched = []
    for e in FAULT_KB:
        trig = e.get("trigger_tags", [])
        phases = e.get("flight_phase", ["all"])
        excl = e.get("exclude_tags", [])
        if not any(t in active_tags for t in trig):
            continue
        if any(x in guard_tags or x in active_tags for x in excl):
            continue
        if "all" not in phases:
            if not any(p in phases_present for p in phases):
                continue
        matched.append({
            "faultId": e["fault_id"],
            "faultTag": e["fault_tag"],
            "riskLevel": e.get("risk_level", ""),
            "possibleRootCause": e.get("possible_root_cause", []),
            "troubleshootingSteps": e.get("troubleshooting_steps", []),
            "note": e.get("note", ""),
            "matchedPhases": [p for p in phases if p == "all" or p in phases_present],
        })
    return matched

# 短日志由 guard 标签派生（阈值的唯一来源是 guard-short-log.yaml）
short_log = "insufficient_data" in guard_tags
matched_faults = [] if short_log else match_fault_kb()

order = {"critical": 0, "warning": 1, "info": 2}
findings.sort(key=lambda f: order.get(f["severity"], 9))

__result = json.dumps({
    "platform": "PX4",
    "vehicleType": vehicle_type,
    "parserVersion": "pyulog/pyodide-0.3.0",
    "durationSec": duration_s,
    "stats": stats,
    "tags": tags,
    "guardTags": guard_tags,
    "phases": sorted(phases_present),
    "checksRun": checks_run,
    "checksSkipped": checks_skipped,
    "matchedFaults": matched_faults,
    "findings": findings,
}, ensure_ascii=False)
