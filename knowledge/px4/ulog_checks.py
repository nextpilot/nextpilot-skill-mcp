
import json, io, ast
import numpy as np
from pyulog import ULog

PX4_DOC_LOG = "https://docs.px4.io/main/en/log/flight_log_analysis.html"
PX4_DOC_BATTERY = "https://docs.px4.io/main/en/config/battery.html"
PX4_DOC_VIBRATION = "https://docs.px4.io/main/en/assembly/vibration_isolation.html"
PX4_DOC_EKF = "https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"
PX4_DOC_GPS = "https://docs.px4.io/main/en/gps_compass/"
PX4_DOC_FAILSAFE = "https://docs.px4.io/main/en/config/safety.html"

# 故障知识库（构建期内联，第三层检索用）
FAULT_KB = __FAULT_KB__

# ---------------- 阈值（唯一数值来源：px4-thresholds.toml，构建期内联为 JSON）----
# 本地用 python 跑（run_checks_locally.py）时由注入的 JSON 字面量提供；
# Pyodide 端同样内联。改阈值只编辑 knowledge/px4/px4-thresholds.toml。
TH = json.loads(r'''__THRESHOLDS__''')

# 经验规则（rules/*.yaml 编译而来；见 knowledge/px4/rule-schema-design.md）
RULES = json.loads(r'''__RULES__''')

# 执行位置必须与原过程式检查一致（finding.id 按发射顺序生成）。同一 slot 内多条规则
# 按 order 字段排序（缺省 100000，再按 id 兜底）。迁移期未声明的 slot 排到最后。
_SLOT_ORDER = [
    "vibration", "ekf_innovations", "ekf_faults", "battery", "cpu",
    "gps_health", "failsafe", "mode_thrash", "motor_balance", "imu_bias",
    "attitude_tracking", "airspeed", "vtol_transition", "wind_estimate",
    "logged_messages",
]


def _rule_pos(rule):
    slot = rule.get("slot")
    idx = _SLOT_ORDER.index(slot) if slot in _SLOT_ORDER else len(_SLOT_ORDER)
    return (idx, rule.get("order", 100000), rule.get("id", ""))


RULES.sort(key=_rule_pos)

VIBE_WARN, VIBE_CRIT = TH["vibration"]["vibe_warn"], TH["vibration"]["vibe_crit"]
VIBE_STDDEV_WARN, VIBE_STDDEV_CRIT = TH["vibration"]["stddev_warn"], TH["vibration"]["stddev_crit"]
CLIP_WARN, CLIP_CRIT = TH["vibration"]["clip_warn"], TH["vibration"]["clip_crit"]
EKF_WARN, EKF_CRIT = TH["ekf"]["reject_ratio_warn"], TH["ekf"]["reject_ratio_crit"]
EKF_PEAK_WARN, EKF_PEAK_CRIT = TH["ekf"]["peak_warn"], TH["ekf"]["peak_crit"]
EKF_REJECT_MIN = TH["ekf"]["reject_min_count"]
CELL_WARN, CELL_CRIT = TH["power"]["cell_warn"], TH["power"]["cell_crit"]
CELL_SAG_V = TH["power"]["sag_volts"]
SAG_SKIP_TAKEOFF_US = int(TH["power"]["sag_skip_takeoff_sec"] * 1e6)
REMAIN_WARN, REMAIN_CRIT = TH["power"]["remaining_warn"], TH["power"]["remaining_crit"]
CPU_WARN, CPU_CRIT = TH["cpu"]["load_warn"], TH["cpu"]["load_crit"]
EPH_WARN, EPH_CRIT = TH["gps"]["eph_warn"], TH["gps"]["eph_crit"]
SATS_WARN, SATS_CRIT = TH["gps"]["sats_warn"], TH["gps"]["sats_crit"]
GPS_JUMP_SPEED, GPS_JUMP_MIN = TH["gps"]["jump_speed_mps"], TH["gps"]["jump_min_count"]
MODE_THRASH_WARN = TH["mode"]["thrash_changes"]
MIN_FLIGHT_SEC = TH["guard"]["min_flight_sec"]
DROPOUT_LIMIT_MS = TH["guard"]["dropout_ms"]
MOTOR_SPREAD_WARN, MOTOR_SPREAD_CRIT = TH["motor"]["spread_warn"], TH["motor"]["spread_crit"]
GYRO_BIAS_ABS_WARN, GYRO_BIAS_ABS_CRIT = TH["gyro_bias"]["abs_warn"], TH["gyro_bias"]["abs_crit"]
GYRO_BIAS_DRIFT_WARN, GYRO_BIAS_DRIFT_CRIT = TH["gyro_bias"]["drift_warn"], TH["gyro_bias"]["drift_crit"]
TEMP_RANGE_WARN, TEMP_RANGE_CRIT = TH["gyro_bias"]["temp_range_warn"], TH["gyro_bias"]["temp_range_crit"]
ATT_ERR_WARN, ATT_ERR_CRIT = TH["attitude"]["err_warn_rotary"], TH["attitude"]["err_crit_rotary"]
ATT_ERR_WARN_FW, ATT_ERR_CRIT_FW = TH["attitude"]["err_warn_fixedwing"], TH["attitude"]["err_crit_fixedwing"]
ATT_OSC_WARN = TH["attitude"]["osc_hz"]
ATT_RATE_HZ = TH["attitude"]["sample_rate_hz"]
ATT_MIN_SAMPLES = TH["attitude"]["min_seg_samples"]
AIRSPEED_INVALID_WARN, AIRSPEED_INVALID_CRIT = TH["airspeed"]["invalid_ratio_warn"], TH["airspeed"]["invalid_ratio_crit"]
VTOL_ATT_LIMIT = TH["vtol"]["transition_tilt_deg"]
WIND_WARN, WIND_CRIT = TH["wind"]["speed_warn"], TH["wind"]["speed_crit"]
LOG_LEVEL_CRIT_MAX = TH["messages"]["critical_max_level"]
LOG_LEVEL_WARN = TH["messages"]["warn_level"]
MSG_MAX_EXAMPLES = TH["messages"]["max_examples"]
MSG_CLIP_LEN = TH["messages"]["message_clip_len"]

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
VEHICLE_TYPES = {1: "rotary_wing", 2: "fixed_wing", 3: "rover", 4: "airship"}
vehicle_type = "unknown"
vs_list = find_all(ulog, "vehicle_status")
vs = vs_list[0] if vs_list else None
if vs is not None:
    vt = getf(vs, "vehicle_type")
    if vt is not None and len(vt) > 0:
        vehicle_type = VEHICLE_TYPES.get(int(vt[-1]), "unknown(%d)" % int(vt[-1]))
    else:
        rw = getf(vs, "is_rotary_wing")
        if rw is not None and len(rw) > 0:
            vehicle_type = "rotary_wing" if int(rw[-1]) else "fixed_wing"
stats["vehicleType"] = vehicle_type
stats["firmware"] = FW_LABEL
stats["firmwareProfile"] = FW_PROFILE
if FW["hw"]:
    stats["hardware"] = FW["hw"]

# ---------------- 飞行阶段识别（第二层，用于故障库 phase 匹配）----------------
# nav_state 枚举（Flight Review config_tables / PX4 commander）
NAV_TAKEOFF = {17, 22}
NAV_HOVERISH = {2, 4, 6, 14, 21}           # Position/Hold/PositionSlow/Offboard/Orbit（多为悬停/定点）
NAV_MANEUVER = {0, 1, 10, 15}              # Manual/Altitude/Acro/Stabilized（视为机动）
NAV_FW_CRUISE = {3, 8}                     # Mission / Altitude Cruise（固定翼巡航近似）
NAV_LAND = {18, 20}
NAV_VTOL_TRANSITION = None                 # 由 vtol_in_trans_mode 字段判断
NAV_RTL_DESCEND = {5, 12, 13}

phases_present = set()
armed_intervals = []      # (start_us, end_us)，end=None 表示持续到日志结束
armed_duration_s = 0.0

if vs is not None:
    nav = getf(vs, "nav_state")
    arm = getf(vs, "arming_state")
    vts = np.asarray(getf(vs, "timestamp"), dtype=np.int64)

    # armed 区间（failsafe 失联只在 armed 区间内才报）
    if arm is not None:
        a = np.asarray(arm)
        start_i = None
        for i in range(len(a)):
            if int(a[i]) == 2 and start_i is None:
                start_i = i
            elif int(a[i]) != 2 and start_i is not None:
                armed_intervals.append((int(vts[start_i]), int(vts[i])))
                start_i = None
        if start_i is not None:
            armed_intervals.append((int(vts[start_i]), None))
        total_us = 0
        for s, e in armed_intervals:
            total_us += ((e if e is not None else int(vts[-1])) - s)
        armed_duration_s = round(total_us / 1e6, 1)

    trans_mode = getf(vs, "vtol_in_trans_mode")
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
            if codes & NAV_TAKEOFF: phases_present.add("takeoff")
            if codes & NAV_HOVERISH: phases_present.add("hover")
            if codes & NAV_MANEUVER: phases_present.add("maneuver")
            if codes & NAV_FW_CRUISE: phases_present.add("fw_cruise")
            if codes & (NAV_LAND | NAV_RTL_DESCEND): phases_present.add("landing")
if vs is not None and trans_mode is not None:
    if int(np.max(np.asarray(trans_mode))) > 0:
        phases_present.add("vtol_transition")
# 无 armed 段时，短日志 guard 之外不做任何故障库匹配
stats["armedDurationSec"] = armed_duration_s
stats["phases"] = sorted(phases_present)

# 短日志 guard：不做需要时间累积的深度诊断（PID/振动根源等），但仍跑瞬时安全项
short_log = (armed_duration_s > 0 and armed_duration_s < MIN_FLIGHT_SEC) or \
            (armed_duration_s == 0 and (duration_s or 0) < MIN_FLIGHT_SEC)
if short_log:
    guard_tags.append("insufficient_data")

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
    col0 = gather(lambda d: getf(d, f"{field}[0]"))
    if col0 is None:
        return None
    columns = []
    for i in range(32):
        columns.append(gather(lambda d, i=i: getf(d, f"{field}[{i}]")))
    while columns and columns[-1] is None:
        columns.pop()
    return columns


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
    }


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
        _checks = _rule["emit"]["check"]
        _checks = _checks if isinstance(_checks, list) else [_checks]
        _need = (_rule.get("requires") or {}).get("any_of") or []
        _missing = bool(_need) and not all(find_all(ulog, t) for t in _need)
        if _missing:
            for _check in _checks:
                skipped(_check, _rule.get("skip_reason") or ("缺少依赖 topic：%s" % ", ".join(_need)))
            continue
        _env = _rule_env()
        _ok = True
        for _node in _rule["compute"]:
            # 归一化：单输入可用短写法 from:（字符串或列表），单输出可直接写 out: 名字
            _ins = _node.get("in")
            if _ins is None:
                _ins = _node["from"] if isinstance(_node["from"], list) else [_node["from"]]
            _outs = _node["out"] if isinstance(_node["out"], list) else [_node["out"]]
            _args = []
            for _ref in _ins:
                _args.append(_env[_ref] if _ref in _env else _read_field_ref(_ref))
            if any(_a is None for _a in _args):
                _ok = False
                break
            _res = OPERATORS[_node["op"]](*_args, **_node)
            if _res is None:
                _ok = False
                break
            if not isinstance(_res, tuple):
                _res = (_res,)
            for _name, _v in zip(_outs, _res):
                _env[_name] = _v
        if not _ok:
            for _check in _checks:
                skipped(_check, _rule.get("skip_reason") or "数据不足，未做判定")
            continue
        for _check in _checks:
            ran(_check)

        _emit = _rule["emit"]
        for _key, _spec in (_emit.get("stats") or {}).items():
            _v = _env.get(_spec["var"])
            if _v is None:
                continue
            stats[_key] = round(float(_v), int(_spec["round"])) if "round" in _spec else _v

        for _trig in _rule["triggers"]:
            if _eval_expr(_trig["expr"], _env):
                _val = _env.get(_trig["value"]) if _trig.get("value") else None
                if _val is not None and _trig.get("round") is not None:
                    _val = round(float(_val), int(_trig["round"]))
                add(_trig["severity"], _rid, _trig.get("tag", _emit.get("tag")),
                    _trig["title"].format_map(_env), _trig["field"], _val,
                    _trig.get("threshold"), _trig.get("unit"),
                    _emit.get("doc"), _trig.get("suggestion"))
                break


# ---------------- 规则 1：振动 / IMU 削波 ----------------
imu_list = find_all(ulog, "vehicle_imu_status")
if imu_list:
    ran("vibration")
    worst = {"mean": 0.0, "p95": 0.0, "max": 0.0, "imu": -1}
    worst_stddev = {"rss": 0.0, "imu": -1}
    worst_clip = {"count": 0, "axis": -1, "imu": -1}
    for i, d in enumerate(imu_list):
        vm = getf(d, "accel_vibration_metric")
        if vm is not None:
            v = np.asarray(vm, dtype=float); v = v[np.isfinite(v)]
            if len(v) > 0:
                m = float(np.mean(v))
                if m > worst["mean"]:
                    worst = {"mean": m, "p95": float(np.percentile(v, 95)),
                             "max": float(np.max(v)), "imu": i}
        sx = getf(d, "stddev_accel_x_m_s2", "stddev_accel_x")
        sy = getf(d, "stddev_accel_y_m_s2", "stddev_accel_y")
        sz = getf(d, "stddev_accel_z_m_s2", "stddev_accel_z")
        if sx is not None and sy is not None and sz is not None:
            rss = float(np.mean(np.sqrt(
                np.asarray(sx, float) ** 2 + np.asarray(sy, float) ** 2 +
                np.asarray(sz, float) ** 2)))
            if rss > worst_stddev["rss"]:
                worst_stddev = {"rss": rss, "imu": i}
        for axis in range(3):
            _, c = pick(d, "accel_clipping[%d]" % axis, "accel_clipping_%d" % axis,
                        "clipping_%d" % axis)
            if c is not None and len(c) > 0:
                delta = int(np.max(c)) - int(np.min(c))
                if delta > worst_clip["count"]:
                    worst_clip = {"count": delta, "axis": axis, "imu": i}

    if worst["imu"] >= 0:
        stats["imuAccelVibrationMean"] = round(worst["mean"], 3)
        stats["imuAccelVibrationP95"] = round(worst["p95"], 3)
        stats["imuAccelVibrationMax"] = round(worst["max"], 3)
        if worst["mean"] >= VIBE_CRIT:
            add("critical", "px4-vibration", "high_vibration",
                "高频振动严重超标（IMU #%d）" % worst["imu"],
                "vehicle_imu_status.accel_vibration_metric(均值)",
                round(worst["mean"], 3), VIBE_CRIT, "m/s^2", PX4_DOC_VIBRATION,
                "Flight Review 红色区间（>9.81 m/s^2）。结合故障库条目排查桨叶/电机/机架/减震。")
        elif worst["mean"] >= VIBE_WARN:
            add("warning", "px4-vibration", "high_vibration",
                "高频振动偏大（IMU #%d）" % worst["imu"],
                "vehicle_imu_status.accel_vibration_metric(均值)",
                round(worst["mean"], 3), VIBE_WARN, "m/s^2", PX4_DOC_VIBRATION,
                "Flight Review 橙色区间（4.905~9.81 m/s^2）。结合故障库条目排查桨叶动平衡/电机/IMU 减震。")

    if worst_stddev["imu"] >= 0:
        stats["imuStddevAccelRssMax"] = round(worst_stddev["rss"], 3)
        rss = worst_stddev["rss"]
        if rss >= VIBE_STDDEV_CRIT:
            add("critical", "px4-vibration", "high_vibration",
                "IMU 加速度标准差严重超标（IMU #%d）" % worst_stddev["imu"],
                "vehicle_imu_status.stddev_accel_*_m_s2(RSS 均值)",
                round(rss, 3), VIBE_STDDEV_CRIT, "m/s^2", PX4_DOC_VIBRATION,
                "结合故障库条目排查桨叶/电机轴承/机架紧固/减震。")
        elif rss >= VIBE_STDDEV_WARN:
            add("warning", "px4-vibration", "high_vibration",
                "IMU 加速度标准差偏大（IMU #%d）" % worst_stddev["imu"],
                "vehicle_imu_status.stddev_accel_*_m_s2(RSS 均值)",
                round(rss, 3), VIBE_STDDEV_WARN, "m/s^2", PX4_DOC_VIBRATION,
                "关注桨叶损伤、电机动平衡与 IMU 减震。")

    if worst_clip["imu"] >= 0 and worst_clip["count"] > 0:
        stats["imuAccelClippingCountMax"] = worst_clip["count"]
        desc = "IMU #%d 轴 %d 全日志累计削波 %d 次（理想值为 0）" % (
            worst_clip["imu"], worst_clip["axis"], worst_clip["count"])
        field = "vehicle_imu_status.accel_clipping[%d](末值-首值)" % worst_clip["axis"]
        if worst_clip["count"] >= CLIP_CRIT:
            add("critical", "px4-imu-clipping", "high_vibration",
                "加速度计削波严重：" + desc, field, worst_clip["count"], CLIP_CRIT,
                "count", PX4_DOC_VIBRATION, "持续削波会破坏 EKF 估计，请优先排除机械振动源。")
        elif worst_clip["count"] >= CLIP_WARN:
            add("warning", "px4-imu-clipping", "high_vibration",
                "检测到明显加速度计削波：" + desc, field, worst_clip["count"], CLIP_WARN,
                "count", PX4_DOC_VIBRATION, "削波表明振动峰值已超出传感器量程，建议排查机械振动源。")
        else:
            add("info", "px4-imu-clipping", None,
                "偶发加速度计削波：" + desc, field, worst_clip["count"], 0,
                "count", PX4_DOC_VIBRATION, "少量削波可先观察；频次升高或伴随振动告警需排查机械问题。")
else:
    skipped("vibration", "vehicle_imu_status not in log")

# ---------------- 规则 2：EKF 创新检验 + 硬故障位 ----------------
FLAG_BITS = {0: "速度", 1: "水平位置", 2: "垂直位置", 3: "磁罗盘 X", 4: "磁罗盘 Y",
             5: "磁罗盘 Z", 6: "航向", 7: "空速", 8: "侧滑", 9: "离地高度",
             10: "光流 X", 11: "光流 Y"}
RATIO_CHANNELS = [
    ("vel_test_ratio", "速度"), ("pos_test_ratio", "水平位置"),
    ("hgt_test_ratio", "垂直高度"), ("hdg_test_ratio", "航向"),
    ("mag_test_ratio", "磁罗盘"), ("tas_test_ratio", "空速"),
    ("hagl_test_ratio", "离地高度"), ("beta_test_ratio", "侧滑"),
]
est_list = find_all(ulog, "estimator_status")
if est_list:
    ran("ekf_innovations")
    ekf_worst = None
    for ei, d in enumerate(est_list):
        flags = getf(d, "innovation_check_flags")
        if flags is not None and len(flags) > 0:
            bad = int(np.count_nonzero(flags))
            if bad < 3:
                continue
            ratio = bad / len(flags)
            union = int(np.bitwise_or.reduce([int(x) for x in flags]))
            fired = sorted(FLAG_BITS[b] for b in FLAG_BITS if union & (1 << b))
            cand = (ratio, "、".join(fired), ei)
            if ekf_worst is None or ratio > ekf_worst[0]:
                ekf_worst = cand
            continue
        for name, label in RATIO_CHANNELS:
            v = getf(d, name)
            if v is None: continue
            arr = np.asarray(v, dtype=float); arr = arr[np.isfinite(arr)]
            if len(arr) == 0: continue
            n_bad = int(np.count_nonzero(arr >= 1.0))
            if n_bad < EKF_REJECT_MIN: continue   # 偶发尖峰/未启用传感器，避免误报
            frac = n_bad / len(arr)
            if ekf_worst is None or frac > ekf_worst[0]:
                ekf_worst = (frac, label, ei)
    if ekf_worst is not None:
        frac, labels, ei = ekf_worst
        pct = round(frac * 100, 2)
        stats["ekfRejectRatioPct"] = pct
        if frac >= EKF_CRIT:
            add("critical", "px4-ekf-innovation", "ekf_innovation_failure",
                "EKF 创新检验持续失败（estimator #%s：%s）" % (ei, labels or "未知通道"),
                "estimator_status 创新检验拒绝样本占比", pct, EKF_CRIT * 100, "%",
                PX4_DOC_EKF, "涉及：%s。检查对应传感器健康度、安装与校准。" % (labels or "未知通道"))
        elif frac >= EKF_WARN:
            add("warning", "px4-ekf-innovation", "ekf_innovation_failure",
                "EKF 创新检验偶发失败（estimator #%s：%s）" % (ei, labels or "未知通道"),
                "estimator_status 创新检验拒绝样本占比", pct, EKF_WARN * 100, "%",
                PX4_DOC_EKF, "涉及：%s。关注 GPS 卫星数、磁罗盘干扰、振动与气压计异常。" % (labels or "未知通道"))

    # EKF 硬故障位（robotto 经验）。filter_fault_flags 为位掩码，不能"任一非零即严重"：
    # bit 0-5 为位置/速度/高度/偏航等核心融合故障（critical）；
    # bit 10 视觉速度融合拒绝在未用 VIO 的飞机上为正常，避免误报。
    ran("ekf_faults")
    CRITICAL_FAULT_BITS = {0, 1, 2, 3, 4, 5}
    fault_union, nan_max, benign_only = 0, 0, True
    have_fault = False
    for d in est_list:
        ff = getf(d, "filter_fault_flags")
        nf = getf(d, "nan_flags")
        if ff is not None and len(ff) > 0:
            have_fault = True; fmax = int(np.max(np.asarray(ff)))
            fault_union |= fmax
            if any(fmax & (1 << b) for b in CRITICAL_FAULT_BITS):
                benign_only = False
        if nf is not None and len(nf) > 0:
            have_fault = True; nan_max = max(nan_max, int(np.max(np.asarray(nf))))
            if nan_max: benign_only = False
    if have_fault and (nan_max or any(fault_union & (1 << b) for b in CRITICAL_FAULT_BITS)):
        add("critical", "px4-ekf-fault", "ekf_innovation_failure",
            "EKF 报告核心融合硬故障（filter_fault_flags=%d, nan_flags=%d）" % (fault_union, nan_max),
            "estimator_status.filter_fault_flags/nan_flags",
            "fault=%d,nan=%d" % (fault_union, nan_max), 0, None,
            PX4_DOC_EKF, "估计器出现硬故障/NaN，建议停飞排查传感器与振动后重新标定。")
    elif have_fault and fault_union and benign_only:
        add("info", "px4-ekf-fault", None,
            "EKF 报告非核心辅助传感器融合拒绝（filter_fault_flags=%d，常见为未使用视觉/光流）" % fault_union,
            "estimator_status.filter_fault_flags", fault_union, 0, None,
            PX4_DOC_EKF, "若该机确实未启用视觉/光流定位，此位可忽略；否则检查对应传感器。")
else:
    skipped("ekf_innovations", "estimator_status not in log")
    skipped("ekf_faults", "estimator_status not in log")

# ---------------- 规则 3：电源（单芯电压 + 余量 + 飞行中持续压降）----------------
bat_list = find_all(ulog, "battery_status")
if bat_list:
    ran("battery")
    b0 = bat_list[0]
    vts_b = np.asarray(getf(b0, "timestamp"), dtype=np.int64) if getf(b0, "timestamp") is not None else None
    volt = getf(b0, "voltage_v", "voltage_filtered_v")
    vmin = float(np.min(np.asarray(volt, dtype=float))) if volt is not None and len(volt) else None
    if vmin is not None: stats["batteryVoltageMin"] = round(vmin, 2)

    per_cell_min = None; source = None; cell_voltages = []
    for idx in range(14):
        vv = getf(b0, "voltage_cell_v[%d]" % idx, "voltage_cell_v_%d" % idx)
        if vv is not None and len(vv) > 0:
            cell_voltages.append(np.asarray(vv, dtype=float))
    measured = [float(np.min(a[a > 0])) for a in cell_voltages if np.any(a > 0)]
    if measured:
        per_cell_min = min(measured); source = "battery_status.voltage_cell_v[](实测最小值)"
    else:
        cell_count = getf(b0, "cell_count")
        if cell_count is not None and len(cell_count) > 0:
            cells = int(np.max(cell_count))
            if volt is not None and cells > 0 and vmin and vmin > 0:
                per_cell_min = vmin / cells; source = "battery_status.voltage_v(min)/cell_count"
                stats["batteryCellCount"] = cells
    if per_cell_min is not None:
        stats["batteryCellVoltageMin"] = round(per_cell_min, 3)
        if per_cell_min < CELL_CRIT:
            add("critical", "px4-power-cell-voltage", "battery_voltage_drop",
                "电芯电压严重过低", source, round(per_cell_min, 3), CELL_CRIT, "V/cell",
                PX4_DOC_BATTERY, "存在过放风险，检查电池老化、放电倍率匹配与低压告警阈值。")
        elif per_cell_min < CELL_WARN:
            add("warning", "px4-power-cell-voltage", "battery_voltage_drop",
                "电芯电压偏低", source, round(per_cell_min, 3), CELL_WARN, "V/cell",
                PX4_DOC_BATTERY, "建议核对剩余容量估计与返航电压裕度。")
    elif volt is not None:
        add("info", "px4-power-cell-voltage", None,
            "日志缺少电芯电压与 cell_count，未做单电芯判断",
            "battery_status.voltage_cell_v / cell_count", "missing", None, None,
            PX4_DOC_BATTERY)

    # 飞行中持续压降（剔除起飞冲击：armed 后 5s 起到结束，避免与瞬时机动混淆）
    if cell_voltages and vts_b is not None and armed_intervals:
        try:
            stack = np.vstack([a for a in cell_voltages if len(a) == len(vts_b)])
            per_cell_min_t = np.min(np.where(stack > 0, stack, np.nan), axis=0)
            for s, _e in armed_intervals:
                lo = np.searchsorted(vts_b, s + SAG_SKIP_TAKEOFF_US)
                hi = len(vts_b)
                seg = per_cell_min_t[lo:hi]
                seg = seg[np.isfinite(seg)]
                # 用末段 20% 中位数作为"持续低"参考，避免大机动瞬时点
                if len(seg) > 20:
                    tail = np.median(seg[-max(5, len(seg) // 5):])
                    head = np.median(seg[: max(5, len(seg) // 10)])
                    sag = float(head - tail)
                    stats.setdefault("batteryCellSagFlight", round(sag, 3))
                    if sag >= CELL_SAG_V and tail < CELL_WARN:
                        add("warning", "px4-power-sag", "battery_voltage_drop",
                            "飞行中单电芯持续压降 %.2f V（尾段中位 %.2f V）" % (sag, tail),
                            "battery_status.voltage_cell_v[] armed 段趋势",
                            round(sag, 3), CELL_SAG_V, "V", PX4_DOC_BATTERY,
                            "持续压降区别于大机动瞬时压降：排查电芯老化内阻、插头虚接、线缆线径与负载匹配。")
                break
        except Exception:
            pass

    # 剩余电量（px4-power-remaining 已迁至 rules/，由末尾 _run_rules("battery") 执行）
else:
    skipped("battery", "battery_status not in log")

# battery slot：cell-voltage/sag 仍是过程式（在上面），remaining 已是规则
_run_rules("battery")

# cpu slot（px4-cpu-load 已迁至 rules/；原过程式 CPU 段已删除）
_run_rules("cpu")


# ---------------- 规则 5：GPS 健康（F002）----------------
gps_list = find_all(ulog, "vehicle_gps_position")
if gps_list:
    ran("gps_health")
    g0 = gps_list[0]
    eph = getf(g0, "eph", "eph_m")
    sats = getf(g0, "satellites_used")
    gps_bad = False
    if eph is not None and len(eph) > 0:
        # eph 单位 mm（PX4 vehicle_gps_position.eph），转 m；取 armed 段 p95，抗瞬时
        earr = np.asarray(eph, dtype=float) / 1000.0
        earr = earr[np.isfinite(earr) & (earr > 0)]
        if len(earr) > 0:
            e_p95 = float(np.percentile(earr, 95)); e_max = float(np.max(earr))
            stats["gpsEphP95M"] = round(e_p95, 2); stats["gpsEphMaxM"] = round(e_max, 2)
            if e_p95 >= EPH_CRIT:
                gps_bad = True
                add("warning", "px4-gps-eph", "gps_eph_high",
                    "GPS 水平位置误差持续偏大（p95 %.1f m）" % e_p95,
                    "vehicle_gps_position.eph(armed p95)", round(e_p95, 2), EPH_CRIT, "m",
                    PX4_DOC_GPS, "结合故障库 F002：排查天线电磁干扰/遮挡/馈线虚接/多路径。")
            elif e_p95 >= EPH_WARN:
                gps_bad = True
                add("info", "px4-gps-eph", "gps_eph_high",
                    "GPS 水平位置误差偶发偏大（p95 %.1f m）" % e_p95,
                    "vehicle_gps_position.eph(armed p95)", round(e_p95, 2), EPH_WARN, "m",
                    PX4_DOC_GPS, "关注天线安装位置与遮挡。")
    if sats is not None and len(sats) > 0:
        sarr = np.asarray(sats, dtype=float)
        s_min = int(np.min(sarr)); stats["gpsSatellitesMin"] = s_min
        if s_min <= SATS_CRIT:
            gps_bad = True
            add("warning", "px4-gps-sats", "gps_eph_high",
                "GPS 卫星数最少仅 %d 颗" % s_min,
                "vehicle_gps_position.satellites_used(min)", s_min, SATS_WARN, "颗",
                PX4_DOC_GPS, "卫星数不足时定位易跳变；排查遮挡与天线。")
    # 明显跳变：相邻位置差分速度异常（阈值见 thresholds.toml [gps] jump_speed_mps）
    lat = getf(g0, "lat"); lon = getf(g0, "lon"); gt = getf(g0, "timestamp")
    if lat is not None and lon is not None and gt is not None and len(gt) > 2:
        lat_r = np.radians(np.asarray(lat, dtype=float) / 1e7)
        lon_r = np.radians(np.asarray(lon, dtype=float) / 1e7)
        dt = np.diff(np.asarray(gt, dtype=float)) / 1e6
        dlat = np.diff(lat_r) * 6371000.0
        dlon = np.diff(lon_r) * 6371000.0 * np.cos(lat_r[:-1])
        step = np.sqrt(dlat ** 2 + dlon ** 2) / np.maximum(dt, 1e-3)
        njump = int(np.count_nonzero(step > GPS_JUMP_SPEED))
        stats["gpsJumpCount"] = njump
        if njump >= GPS_JUMP_MIN:
            gps_bad = True
            add("warning", "px4-gps-jump", "gps_jump",
                "GPS 位置出现 %d 次异常跳变（>%g m/s）" % (njump, GPS_JUMP_SPEED),
                "vehicle_gps_position lat/lon 相邻差分", njump, GPS_JUMP_MIN, "次",
                PX4_DOC_GPS, "结合故障库 F002：排查多路径、馈线与电磁干扰；室内跳变为正常现象。")
else:
    skipped("gps_health", "vehicle_gps_position not in log")

# ---------------- 规则 6：failsafe / 失联边沿（robotto + F007，仅 armed 段）----------------
if vs is not None:
    ran("failsafe")
    vts_vs = np.asarray(getf(vs, "timestamp"), dtype=np.int64)
    bool_fields = [
        ("failsafe", "failsafe", "critical", "触发失效保护"),
        ("rc_signal_lost", "rc_lost", "warning", "遥控信号丢失"),
        ("data_link_lost", None, "warning", "数据链路丢失"),
        ("engine_failure", None, "critical", "发动机/动力故障保护"),
        ("mission_failure", None, "critical", "任务失效保护"),
    ]
    for field, tag, sev, label in bool_fields:
        v = getf(vs, field)
        if v is None: continue
        arr = np.asarray(v)
        for i in edge_indices(arr):
            if int(arr[i]) != 1: continue   # 只报置位沿
            ts_us = int(vts_vs[i])
            if not in_armed(ts_us): continue
            if tag: add_tag(tag)
            add(sev, "px4-failsafe-%s" % field, tag,
                "%s（飞行中，t=%.1fs）" % (label, (ts_us - t0) / 1e6),
                "vehicle_status.%s" % field, "set at %.1fs" % ((ts_us - t0) / 1e6),
                None, None, PX4_DOC_FAILSAFE,
                "结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。")
    # nav_state 进入 RTL/DESCEND/TERMINATION/LAND
    nav = getf(vs, "nav_state")
    if nav is not None:
        nav_arr = np.asarray(nav)
        for i in edge_indices(nav_arr):
            code = int(nav_arr[i]); ts_us = int(vts_vs[i])
            if code in (5, 12, 13, 18) and in_armed(ts_us):
                name = {5: "AUTO_RTL", 12: "DESCEND", 13: "TERMINATION", 18: "LAND"}[code]
                add("critical", "px4-failsafe-nav", "failsafe",
                    "飞行中导航状态切换为 %s（t=%.1fs）" % (name, (ts_us - t0) / 1e6),
                    "vehicle_status.nav_state", name, None, None, PX4_DOC_FAILSAFE,
                    "说明飞控进入失效保护状态，需结合前文事件定位触发原因。")
else:
    skipped("failsafe", "vehicle_status not in log")

# ---------------- 规则 7：模式抖动（robotto）----------------
if vs is not None:
    ran("mode_thrash")
    nav = getf(vs, "nav_state")
    if nav is not None:
        n_changes = len(edge_indices(nav))
        stats["navStateChanges"] = n_changes
        if n_changes > MODE_THRASH_WARN:
            add("warning", "px4-mode-thrash", None,
                "飞行模式切换 %d 次（>%d），可能存在模式抖动" % (n_changes, MODE_THRASH_WARN),
                "vehicle_status.nav_state 变化次数", n_changes, MODE_THRASH_WARN, "次",
                PX4_DOC_LOG, "频繁切模式易诱发操纵混乱；检查遥控器开关与失效保护反复触发。")
else:
    skipped("mode_thrash", "vehicle_status not in log")

# ---------------- 规则 9：电机输出不平衡（F008）----------------
# 只在 armed 且悬停/定点段判定；要求 ≥4 个活跃通道，否则跳过（单通道日志无从比较）。
mot = find_all(ulog, "actuator_motors")
if mot and armed_intervals:
    d = mot[0]
    mts = getf(d, "timestamp")
    cols = []
    for i in range(12):
        c = getf(d, "control[%d]" % i)
        if c is not None and len(c):
            cols.append((i, np.asarray(c, dtype=float)))
    # armed 段内、悬停/定点阶段（nav_state 在 HOVERISH 集合内）的样本才比较
    if mts is not None and len(cols) >= 4:
        mts = np.asarray(mts, dtype=np.int64)
        mask = np.zeros(len(mts), dtype=bool)
        for s, e in armed_intervals:
            lo = int(np.searchsorted(mts, s))
            hi = len(mts) if e is None else int(np.searchsorted(mts, e))
            mask[lo:hi] = True
        hover_mask = mask.copy()
        nav = getf(vs, "nav_state") if vs is not None else None
        if nav is not None:
            vts_vs = np.asarray(getf(vs, "timestamp"), dtype=np.int64)
            nav_arr = np.asarray(nav)
            # 采样到电机时间轴上，取悬停/定点状态
            idx = np.clip(np.searchsorted(vts_vs, mts), 0, len(nav_arr) - 1)
            state_at = nav_arr[idx]
            hover_mask &= np.isin(state_at, list(NAV_HOVERISH))
        seg = hover_mask if np.count_nonzero(hover_mask) > 20 else mask
        means = []
        for i, c in cols:
            v = c[seg] if len(c) == len(mts) else c[:np.count_nonzero(seg)]
            v = v[np.isfinite(v)]
            if v.size and float(np.mean(v)) > 0.01:   # 未接/未用通道均值≈0，排除
                means.append((i, float(np.mean(v))))
        if len(means) >= 4:
            ran("motor_balance")
            vals = [m for _, m in means]
            spread = max(vals) - min(vals)
            stats["motorControlSpread"] = round(spread, 3)
            stats["motorCountActive"] = len(means)
            busiest = max(means, key=lambda x: x[1])
            idlest = min(means, key=lambda x: x[1])
            if spread >= MOTOR_SPREAD_CRIT:
                add("critical", "px4-motor-unbalance", "motor_output_unbalance",
                    "电机输出不平衡（悬停段通道 %d 与 %d 差 %.3f）" % (busiest[0], idlest[0], spread),
                    "actuator_motors.control[](悬停段均值极差)", round(spread, 3),
                    MOTOR_SPREAD_WARN, None, PX4_DOC_LOG,
                    "结合故障库 F008：检查桨叶型号/正反桨是否一致、单电机效率、机架形变。")
            elif spread >= MOTOR_SPREAD_WARN:
                add("warning", "px4-motor-unbalance", "motor_output_unbalance",
                    "电机输出差异偏大（通道 %d 与 %d 差 %.3f）" % (busiest[0], idlest[0], spread),
                    "actuator_motors.control[](悬停段均值极差)", round(spread, 3),
                    MOTOR_SPREAD_WARN, None, PX4_DOC_LOG,
                    "结合故障库 F008 排查动力一致性；偶发差异可先观察。")
        else:
            skipped("motor_balance", "active motor channels < 4 (非多旋翼或未记录全部电机)")
    else:
        skipped("motor_balance", "actuator_motors 通道不足或无 armed 段")
else:
    skipped("motor_balance", "actuator_motors not in log")

# ---------------- 规则 10：IMU 角速度零偏漂移（F005）----------------
# 跨固件版本取源（PX4 1.15+ 拆分 topic）：
#   新：estimator_sensor_bias.gyro_bias[]（直读零偏）
#   旧：estimator_status.states[10..12] / 新：estimator_states.states[10..12]（EKF 状态里的零偏）

def _imu_bias_series():
    """返回 (来源说明, [(轴名, 数组), ...])，按固件版本优先取直读零偏。"""
    sb = find_all(ulog, "estimator_sensor_bias") if FW_PROFILE == "px4-1.15+" else None
    if sb:
        d = sb[0]
        series = [(n, getf(d, "gyro_bias[%d]" % i), getf(d, "timestamp")) for i, n in
                  enumerate(("X", "Y", "Z"))]
        if any(x[1] is not None and len(x[1]) for x in series):
            return "estimator_sensor_bias.gyro_bias[]", series
    for topic in (("estimator_states", "estimator_status") if FW_PROFILE == "px4-1.15+"
                  else ("estimator_status", "estimator_states")):
        ds = find_all(ulog, topic)
        if not ds:
            continue
        d = ds[0]
        series = [(n, getf(d, "states[%d]" % (10 + i)), getf(d, "timestamp")) for i, n in
                  enumerate(("X", "Y", "Z"))]
        if any(x[1] is not None and len(x[1]) for x in series):
            return "%s.states[10..12]" % topic, series
    return None, None

if armed_intervals:
    bias_source, bias_series = _imu_bias_series()
    if bias_source and bias_series:
        ran("imu_bias")
        bts = bias_series[0][2]
        if bts is not None and len(bts):
            bts = np.asarray(bts, dtype=np.int64)
            amask = np.zeros(len(bts), dtype=bool)
            for s_, e_ in armed_intervals:
                lo = int(np.searchsorted(bts, s_))
                hi = len(bts) if e_ is None else int(np.searchsorted(bts, e_))
                amask[lo:hi] = True
            worst_abs, worst_abs_axis = 0.0, None
            worst_drift, worst_drift_axis = 0.0, None
            for axis, b, _t in bias_series:
                if b is None or not len(b):
                    continue
                v = np.asarray(b, dtype=float)[amask] if len(b) == len(bts) else np.asarray(b, dtype=float)
                v = v[np.isfinite(v)]
                if v.size < 10:
                    continue
                if float(np.max(np.abs(v))) > worst_abs:
                    worst_abs, worst_abs_axis = float(np.max(np.abs(v))), axis
                if float(np.max(v) - np.min(v)) > worst_drift:
                    worst_drift, worst_drift_axis = float(np.max(v) - np.min(v)), axis
            if worst_abs_axis:
                stats["gyroBiasMaxRadS"] = round(worst_abs, 4)
                stats["gyroBiasDriftRadS"] = round(worst_drift, 4)
                stats["gyroBiasSource"] = bias_source
                # 温度跨度：判定漂移是否可由温度解释
                temp_range = None
                for topic, field in (("vehicle_imu_status", "temperature_gyro"),
                                      ("vehicle_air_data", "ambient_temperature")):
                    ds = find_all(ulog, topic)
                    if not ds:
                        continue
                    tv = getf(ds[0], field)
                    if tv is None or not len(tv):
                        continue
                    t = np.asarray(tv, dtype=float); t = t[np.isfinite(t)]
                    if t.size > 1:
                        rng = float(np.max(t) - np.min(t))
                        temp_range = rng if temp_range is None else max(temp_range, rng)
                if temp_range is not None:
                    stats["imuTempRangeC"] = round(temp_range, 1)
                    if temp_range >= TEMP_RANGE_CRIT:
                        guard_tags.append("temperature_change_large")
                sev = None
                if worst_abs >= GYRO_BIAS_ABS_CRIT or worst_drift >= GYRO_BIAS_DRIFT_CRIT:
                    sev = "critical"
                elif worst_abs >= GYRO_BIAS_ABS_WARN or worst_drift >= GYRO_BIAS_DRIFT_WARN:
                    sev = "warning"
                if sev:
                    add(sev, "px4-imu-bias-drift", "imu_bias_drift",
                        "陀螺零偏异常（轴 %s：绝对值 %.4f rad/s，漂移 %.4f rad/s）" % (
                            worst_abs_axis, worst_abs, worst_drift),
                        bias_source, round(max(worst_abs, worst_drift), 4),
                        GYRO_BIAS_ABS_WARN, "rad/s", PX4_DOC_EKF,
                        "结合故障库 F005：检查 IMU 安装紧固、执行陀螺/加计标定；"
                        "若温度跨度大，优先按温度漂移解释。")
    else:
        skipped("imu_bias", "无陀螺零偏数据（无 estimator_sensor_bias / estimator_status.states）")
else:
    skipped("imu_bias", "无 armed 段，不做零偏判定")

# ---------------- 规则 11：姿态跟踪超调 / 振荡（F006）----------------
# 只统计 armed 且非悬停的机动段，避免把悬停微调当作超调。
# 跟踪误差阈值按机型区分：固定翼在手动/机动段天然误差更大，用更宽门限
att = find_all(ulog, "vehicle_attitude")
att_sp = find_all(ulog, "vehicle_attitude_setpoint")
if att and att_sp and armed_intervals:
    d, dsp = att[0], att_sp[0]
    ts = getf(d, "timestamp")
    q = [getf(d, "q[%d]" % i) for i in range(4)]
    sp_ts = getf(dsp, "timestamp")
    # 姿态指令：旧固件 roll_body/pitch_body；新固件只有 q_d 四元数
    roll_sp = getf(dsp, "roll_body")
    pitch_sp = getf(dsp, "pitch_body")
    qd = [getf(dsp, "q_d[%d]" % i) for i in range(4)]
    has_quat_sp = all(x is not None and len(x) for x in qd)
    # 1.15+ 只记录四元数指令；旧固件记录 roll/pitch_body。版本未知时按字段存在性判定。
    use_quat_sp = has_quat_sp if FW_MINOR is None else (FW_MINOR >= 15 and has_quat_sp)
    if not use_quat_sp and roll_sp is None and has_quat_sp:
        use_quat_sp = True   # 定制固件容错
    if ts is not None and all(x is not None and len(x) for x in q) and sp_ts is not None and (
            roll_sp is not None or use_quat_sp):
        ts = np.asarray(ts, dtype=np.int64)
        # 采样长度取姿态与该版本可用的姿态指令来源中的最小值
        sp_lens = [len(x) for x in qd] if use_quat_sp else [
            len(roll_sp)] + ([len(pitch_sp)] if pitch_sp is not None else [])
        n = min([len(x) for x in q] + sp_lens)
        q0, q1, q2, q3 = (np.asarray(x, dtype=float)[:n] for x in q)
        roll = np.arctan2(2 * (q0 * q1 + q2 * q3), 1 - 2 * (q1 ** 2 + q2 ** 2))
        pitch = np.arcsin(np.clip(2 * (q0 * q2 - q3 * q1), -1, 1))
        # 将 setpoint 插值到姿态时间轴
        sp_ts = np.asarray(sp_ts, dtype=np.int64)
        if use_quat_sp:
            ns = min(len(x) for x in qd)
            d0, d1, d2, d3 = (np.asarray(x, dtype=float)[:ns] for x in qd)
            r_sp_raw = np.arctan2(2 * (d0 * d1 + d2 * d3), 1 - 2 * (d1 ** 2 + d2 ** 2))
            p_sp_raw = np.arcsin(np.clip(2 * (d0 * d2 - d3 * d1), -1, 1))
        else:
            r_sp_raw = np.asarray(roll_sp, dtype=float)
            p_sp_raw = (np.asarray(pitch_sp, dtype=float) if pitch_sp is not None
                        else np.zeros(len(r_sp_raw)))
        r_sp = np.interp(ts[:n], sp_ts[:len(r_sp_raw)], r_sp_raw)
        p_sp = np.interp(ts[:n], sp_ts[:len(p_sp_raw)], p_sp_raw)
        err = np.degrees(np.maximum(np.abs(roll - r_sp), np.abs(pitch - p_sp)))
        # 机动段掩码：armed 且姿态指令角速度/角度变化明显（用 setpoint 角速度近似）
        amask = np.zeros(n, dtype=bool)
        for s, e in armed_intervals:
            lo = int(np.searchsorted(ts, s))
            hi = n if e is None else int(np.searchsorted(ts, e))
            amask[lo:hi] = True
        # 排除近悬停：指令角接近 0 的样本不计
        active = amask & (np.degrees(np.abs(r_sp)) + np.degrees(np.abs(p_sp)) > 10.0)
        seg = err[active] if np.count_nonzero(active) > ATT_MIN_SAMPLES else err[amask]
        if seg.size > ATT_MIN_SAMPLES:
            ran("attitude_tracking")
            p99 = float(np.percentile(seg, 99))
            stats["attitudeErrDegP99"] = round(p99, 1)
            # 振荡：误差过零频率
            sign = np.sign(seg - np.median(seg))
            flips = int(np.count_nonzero(np.diff(sign[sign != 0]) != 0))
            dur = float(seg.size) / ATT_RATE_HZ     # 姿态约 50Hz 记录
            osc_hz = flips / 2.0 / max(dur, 1e-3)
            stats["attitudeOscHz"] = round(osc_hz, 2)
            err_warn, err_crit = ((ATT_ERR_WARN_FW, ATT_ERR_CRIT_FW)
                                  if vehicle_type == "fixed_wing"
                                  else (ATT_ERR_WARN, ATT_ERR_CRIT))
            if p99 >= err_crit:
                add("critical", "px4-attitude-overshoot", "attitude_overshoot",
                    "姿态跟踪误差过大（p99 %.1f°）" % p99,
                    "vehicle_attitude vs vehicle_attitude_setpoint（机动段）", round(p99, 1),
                    err_warn, "°", PX4_DOC_LOG,
                    "结合故障库 F006：检查姿态环增益、机架共振；避免直接大幅降 PID。")
            elif p99 >= err_warn:
                add("warning", "px4-attitude-overshoot", "attitude_overshoot",
                    "姿态跟踪误差偏大（p99 %.1f°）" % p99,
                    "vehicle_attitude vs vehicle_attitude_setpoint（机动段）", round(p99, 1),
                    err_warn, "°", PX4_DOC_LOG,
                    "结合故障库 F006 排查；大风环境下优先归因环境扰动。")
            if osc_hz >= ATT_OSC_WARN and p99 >= err_warn:
                add("warning", "px4-attitude-oscillation", "attitude_overshoot",
                    "姿态误差高频振荡（约 %.1f Hz）" % osc_hz,
                    "姿态跟踪误差符号翻转频率", round(osc_hz, 2), ATT_OSC_WARN, "Hz",
                    PX4_DOC_LOG, "振荡多与控制增益/机架共振相关，禁用大幅调参，先做频响检查。")
    else:
        skipped("attitude_tracking", "姿态或姿态指令字段缺失")
else:
    skipped("attitude_tracking", "vehicle_attitude(_setpoint) 或 armed 段缺失")

# ---------------- 规则 12：空速健康（F009，固定翼/垂直起降巡航）----------------
if att_sp and (vehicle_type in ("fixed_wing",)):
    ran("airspeed")
    av = find_all(ulog, "airspeed_validated")
    fw_armed = False
    if nav is not None:
        nav_arr2 = np.asarray(nav)
        vts2 = np.asarray(getf(vs, "timestamp"), dtype=np.int64)
        m2 = np.zeros(len(nav_arr2), dtype=bool)
        for s, e in armed_intervals:
            lo = int(np.searchsorted(vts2, s))
            hi = len(vts2) if e is None else int(np.searchsorted(vts2, e))
            m2[lo:hi] = True
        fw_armed = bool(np.any(np.isin(nav_arr2[m2], list(NAV_FW_CRUISE))))
    if av and fw_armed:
        d = av[0]
        valid = getf(d, "airspeed_sensor_measurement_valid")
        tas = getf(d, "true_airspeed_m_s")
        if valid is not None and len(valid):
            va = np.asarray(valid, dtype=float)
            invalid_frac = float(np.count_nonzero(va == 0)) / max(len(va), 1)
            stats["airspeedInvalidRatio"] = round(invalid_frac, 3)
            if invalid_frac >= AIRSPEED_INVALID_CRIT:
                add("critical", "px4-airspeed-invalid", "low_airspeed",
                    "空速传感器在固定翼段大部分时间无效（%.0f%% 样本）" % (invalid_frac * 100),
                    "airspeed_validated.airspeed_sensor_measurement_valid", round(invalid_frac, 3),
                    AIRSPEED_INVALID_CRIT, None, PX4_DOC_LOG,
                    "结合故障库 F009：空速失效极易引发失速，检查空速管堵塞/积水、管路漏气与校准。")
            elif invalid_frac >= AIRSPEED_INVALID_WARN:
                add("warning", "px4-airspeed-invalid", "low_airspeed",
                    "空速传感器间歇无效（%.0f%% 样本）" % (invalid_frac * 100),
                    "airspeed_validated.airspeed_sensor_measurement_valid", round(invalid_frac, 3),
                    AIRSPEED_INVALID_WARN, None, PX4_DOC_LOG, "结合故障库 F009 检查空速管与管路密封。")
        if tas is not None and len(tas):
            t = np.asarray(tas, dtype=float); t = t[np.isfinite(t)]
            if t.size:
                stats["airspeedMinM"] = round(float(np.min(t)), 1)
    else:
        skipped("airspeed", "无固定翼巡航段或未记录 airspeed_validated")
elif vehicle_type == "unknown":
    skipped("airspeed", "机型未知，无法判定固定翼巡航段")

# ---------------- 规则 13：VTOL 转换姿态越限（F003）----------------
if vs is not None and armed_intervals:
    vtsv = find_all(ulog, "vtol_vehicle_status")
    if vtsv:
        ran("vtol_transition")
        d = vtsv[0]
        tr = getf(d, "vtol_in_trans_mode")
        tts = getf(d, "timestamp")
        in_trans = False
        if tr is not None and len(tr):
            tr_arr = np.asarray(tr, dtype=float)
            in_trans = bool(np.count_nonzero(tr_arr) > 0)
            stats["vtolTransitionSamples"] = int(np.count_nonzero(tr_arr))
        if in_trans and att:
            datt = att[0]
            ats = getf(datt, "timestamp")
            qq = [getf(datt, "q[%d]" % i) for i in range(4)]
            if tts is not None and ats is not None and all(x is not None and len(x) for x in qq):
                # 姿态时间轴上的转换掩码（向前填充转换状态）
                a_ts = np.asarray(ats, dtype=np.int64)
                tr_ts = np.asarray(tts, dtype=np.int64)
                idx = np.clip(np.searchsorted(tr_ts, a_ts), 0, len(tr_arr) - 1)
                trans_mask = tr_arr[idx] > 0
                if np.count_nonzero(trans_mask) > 5:
                    n2 = min(len(x) for x in qq)
                    q0, q1, q2, q3 = (np.asarray(x, dtype=float)[:n2] for x in qq)
                    roll = np.degrees(np.arctan2(2 * (q0 * q1 + q2 * q3), 1 - 2 * (q1 ** 2 + q2 ** 2)))
                    pitch = np.degrees(np.arcsin(np.clip(2 * (q0 * q2 - q3 * q1), -1, 1)))
                    tm = trans_mask[:n2]
                    max_tilt = float(np.max(np.maximum(np.abs(roll[tm]), np.abs(pitch[tm]))))
                    stats["vtolTransitionMaxTiltDeg"] = round(max_tilt, 1)
                    if max_tilt > VTOL_ATT_LIMIT:
                        add("warning", "px4-vtol-transition-attitude", "vtol_convert_attitude_over",
                            "VTOL 转换阶段姿态越限（最大 %.1f°，限值 %.0f°）" % (max_tilt, VTOL_ATT_LIMIT),
                            "vehicle_attitude（vtol_in_trans_mode 段）", round(max_tilt, 1),
                            VTOL_ATT_LIMIT, "°", PX4_DOC_LOG,
                            "结合故障库 F003：复盘转换时序与推力匹配，强风环境优先归因环境扰动。")
    else:
        skipped("vtol_transition", "vtol_vehicle_status not in log")

# ---------------- 规则 14：风扰估计（F010，作为 guard 影响其他结论）----------------
we = pick_versioned((15, find_all(ulog, "estimator_wind")),
                    (None, find_all(ulog, "wind_estimate")))
if we:
    ran("wind_estimate")
    d = we[0]
    wn = getf(d, "windspeed_north")
    ww = getf(d, "windspeed_east")
    if wn is not None and ww is not None and len(wn):
        w = np.sqrt(np.asarray(wn, dtype=float) ** 2 + np.asarray(ww, dtype=float) ** 2)
        w = w[np.isfinite(w)]
        if w.size:
            w_p95 = float(np.percentile(w, 95))
            stats["windSpeedP95M"] = round(w_p95, 1)
            if w_p95 >= WIND_CRIT:
                guard_tags.append("wind_strong")
                add("warning", "px4-wind-strong", "wind_disturb",
                    "估计风速较大（p95 %.1f m/s）" % w_p95,
                    "estimator_wind.windspeed_north/east", round(w_p95, 1), WIND_WARN, "m/s",
                    PX4_DOC_LOG,
                    "结合故障库 F010：强风属环境扰动，姿态超调/转换越限优先归因风，不要直接改 PID。")
            elif w_p95 >= WIND_WARN:
                guard_tags.append("wind_strong")
                add("info", "px4-wind-moderate", "wind_disturb",
                    "估计风速偏大（p95 %.1f m/s）" % w_p95,
                    "estimator_wind.windspeed_north/east", round(w_p95, 1), WIND_WARN, "m/s",
                    PX4_DOC_LOG, "解释姿态类异常时需考虑风扰因素。")
else:
    skipped("wind_estimate", "estimator_wind / wind_estimate not in log")

# ---------------- 规则 8：日志消息聚合（robotto：ERR+ 冒烟的枪）----------------
severe_msgs, warning_msgs = [], []
for m in getattr(ulog, "logged_messages", []):
    lvl = int(getattr(m, "log_level", 6))
    try:
        ts_s = round((int(m.timestamp) - t0) / 1e6, 2)
    except Exception:
        ts_s = None
    entry = {"tSec": ts_s, "message": str(m.message).strip()[:MSG_CLIP_LEN]}
    if lvl <= LOG_LEVEL_CRIT_MAX: severe_msgs.append(entry)
    elif lvl == LOG_LEVEL_WARN: warning_msgs.append(entry)
ran("logged_messages")
if severe_msgs:
    samples = severe_msgs[:MSG_MAX_EXAMPLES]
    add("critical", "px4-log-errors", None,
        "日志中出现 %d 条 ERROR 及以上消息" % len(severe_msgs),
        "ulog.logged_messages(log_level<=3)", len(severe_msgs), 0, "条",
        PX4_DOC_LOG, "按时间顺序核对错误原文，这通常是定位根因最直接的证据。",
        tags_extra=None)
    findings[-1]["evidence"]["samples"] = samples
if warning_msgs:
    add("warning", "px4-log-warnings", None,
        "日志中出现 %d 条 WARNING 消息" % len(warning_msgs),
        "ulog.logged_messages(log_level=4)", len(warning_msgs), 0, "条",
        PX4_DOC_LOG)
    findings[-1]["evidence"]["samples"] = warning_msgs[:MSG_MAX_EXAMPLES]

# ---------------- 数据质量 guard（第 2 层，不直接算故障）----------------
# 中途重启：同一 topic 时间戳回退 或 dropouts
restart_hints = 0
for d in ulog.data_list:
    t = getf(d, "timestamp")
    if t is not None and len(t) > 10:
        a = np.asarray(t, dtype=np.int64)
        if int(np.count_nonzero(np.diff(a) < 0)) > 0:
            restart_hints += 1
if restart_hints > 0:
    guard_tags.append("restart_detected")
# 关键 topic 缺失
for req_topic, gname in [("vehicle_status", "vehicle_status"),
                         ("battery_status", "battery_status"),
                         ("estimator_status", "estimator_status")]:
    if not find_all(ulog, req_topic):
        guard_tags.append("topic_missing:%s" % gname)
# 日志丢包
dropout_total_ms = int(sum(getattr(d, "duration", 0) for d in getattr(ulog, "dropouts", [])))
stats["dropoutTotalMs"] = dropout_total_ms
if dropout_total_ms > DROPOUT_LIMIT_MS:
    guard_tags.append("log_dropouts_high")

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
