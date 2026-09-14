/**
 * 在 Pyodide 中执行的 Python 检查脚本（确定性引擎，CLAUDE.md 4.2 第一、二层）。
 *
 * 工程方法论见 docs/rules/knowledge-authoring.md：
 * - 第一层 pyulog 解析；第二层信号预处理/特征提取/数据质量 guard，产出异常标签；
 * - 第三层按标签+飞行阶段+exclude 匹配 px4-fault-kb（确定性检索，非生成式）；
 * - 第四层 LLM 只按 GJB-841 组装，不做数值/时序/根因判断。
 *
 * 所有数值阈值只允许出现在本文件。
 *
 * 字段依据：PX4 msg 定义 + Flight Review 配置（Vibration 色带 4.905/9.81 m/s^2）
 * + robotto ai-drone-toolkit diagnose_flight 经验（8 条检查、failsafe 边沿、checks_skipped）。
 */

// 故障知识库由 scripts/build-fault-kb.mjs 从 engine/.../px4-fault-kb.yaml 生成。
// 单一数据源：工程师只编辑 YAML，这里内联其 JSON，避免双份维护。
import faultKbJson from "./fault-kb.generated.json";

export const PY_ULG_CHECKS = String.raw`
import json, io
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

# ---------------- 阈值（有来源标注；其余为暂定，待 10-20 真实日志校准）----------------
VIBE_WARN, VIBE_CRIT = 4.905, 9.81                 # Flight Review Vibration 色带 m/s^2
VIBE_STDDEV_WARN, VIBE_STDDEV_CRIT = 0.5, 1.0     # 旧固件 stddev_accel RSS，暂定 m/s^2
CLIP_WARN, CLIP_CRIT = 100, 1000                  # 全日志削波累计次数，暂定
EKF_WARN, EKF_CRIT = 0.01, 0.05                   # ratio>=1 被拒样本占比
EKF_PEAK_WARN, EKF_PEAK_CRIT = 0.5, 1.0           # robotto：瞬时最大 test ratio
CELL_WARN, CELL_CRIT = 3.70, 3.55                 # 单电芯电压 V（暂定）
CELL_SAG_V = 0.30                                 # 飞行中单芯持续压降（扣下降落），暂定
REMAIN_WARN, REMAIN_CRIT = 0.20, 0.10             # battery_status.remaining 余量
CPU_WARN, CPU_CRIT = 0.90, 0.95                   # cpuload.load 峰值，robotto 阈值
EPH_WARN, EPH_CRIT = 5.0, 10.0                    # GPS 水平位置误差 m（暂定）
SATS_WARN, SATS_CRIT = 8, 6                       # 卫星数 warning/crit 门限（暂定）
MODE_THRASH_WARN = 12                             # nav_state 切换次数，robotto
MIN_FLIGHT_SEC = 60                               # 短于此时长不做深度诊断（guard）

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
    checks_skipped.append({"check": check, "reason": reason})

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
            if n_bad < 3: continue   # 偶发尖峰/未启用传感器，避免误报
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
                lo = np.searchsorted(vts_b, s + int(5e6))
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

    # 剩余电量（robotto 经验）
    rem = getf(b0, "remaining")
    if rem is not None and len(rem) > 0:
        rarr = np.asarray(rem, dtype=float)
        valid = rarr[(rarr >= 0) & np.isfinite(rarr)]   # -1 = 未知
        if len(valid) > 0:
            rmin = float(np.min(valid))
            stats["batteryRemainingMin"] = round(rmin, 3)
            if rmin <= REMAIN_CRIT:
                add("critical", "px4-power-remaining", "battery_voltage_drop",
                    "电池剩余电量极低（%.0f%%）" % (rmin * 100),
                    "battery_status.remaining(min)", round(rmin, 3), REMAIN_CRIT, None,
                    PX4_DOC_BATTERY, "剩余电量低于 10%，应立即返航；检查电量估算与电池健康。")
            elif rmin <= REMAIN_WARN:
                add("warning", "px4-power-remaining", "battery_voltage_drop",
                    "电池剩余电量偏低（%.0f%%）" % (rmin * 100),
                    "battery_status.remaining(min)", round(rmin, 3), REMAIN_WARN, None,
                    PX4_DOC_BATTERY, "剩余电量低于 20%，注意返航裕度。")
else:
    skipped("battery", "battery_status not in log")

# ---------------- 规则 4：CPU 负载（robotto）----------------
cpu_list = find_all(ulog, "cpuload")
if cpu_list:
    ran("cpu_load")
    cpu_max = 0.0
    for d in cpu_list:
        load = getf(d, "load")
        if load is not None and len(load) > 0:
            cpu_max = max(cpu_max, float(np.max(np.asarray(load, dtype=float))))
    stats["cpuLoadMax"] = round(cpu_max, 3)
    if cpu_max >= CPU_CRIT:
        add("critical", "px4-cpu-load", None,
            "CPU 负载峰值 %.0f%% 超阈值" % (cpu_max * 100),
            "cpuload.load(max)", round(cpu_max, 3), CPU_CRIT, None, PX4_DOC_LOG,
            "CPU 长期接近满载会导致控制环丢步；检查高耗率模块与日志流配置。")
    elif cpu_max >= CPU_WARN:
        add("warning", "px4-cpu-load", None,
            "CPU 负载峰值 %.0f%% 偏高" % (cpu_max * 100),
            "cpuload.load(max)", round(cpu_max, 3), CPU_WARN, None, PX4_DOC_LOG,
            "关注 CPU 余量，必要时降低消息发布率。")
else:
    skipped("cpu_load", "cpuload not in log")

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
    # 明显跳变：相邻位置差分速度异常（>50 m/s 视为跳点）
    lat = getf(g0, "lat"); lon = getf(g0, "lon"); gt = getf(g0, "timestamp")
    if lat is not None and lon is not None and gt is not None and len(gt) > 2:
        lat_r = np.radians(np.asarray(lat, dtype=float) / 1e7)
        lon_r = np.radians(np.asarray(lon, dtype=float) / 1e7)
        dt = np.diff(np.asarray(gt, dtype=float)) / 1e6
        dlat = np.diff(lat_r) * 6371000.0
        dlon = np.diff(lon_r) * 6371000.0 * np.cos(lat_r[:-1])
        step = np.sqrt(dlat ** 2 + dlon ** 2) / np.maximum(dt, 1e-3)
        njump = int(np.count_nonzero(step > 50))
        stats["gpsJumpCount"] = njump
        if njump >= 3:
            gps_bad = True
            add("warning", "px4-gps-jump", "gps_jump",
                "GPS 位置出现 %d 次异常跳变（>50 m/s）" % njump,
                "vehicle_gps_position lat/lon 相邻差分", njump, 3, "次",
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

# ---------------- 规则 8：日志消息聚合（robotto：ERR+ 冒烟的枪）----------------
severe_msgs, warning_msgs = [], []
for m in getattr(ulog, "logged_messages", []):
    lvl = int(getattr(m, "log_level", 6))
    try:
        ts_s = round((int(m.timestamp) - t0) / 1e6, 2)
    except Exception:
        ts_s = None
    entry = {"tSec": ts_s, "message": str(m.message).strip()[:200]}
    if lvl <= 3: severe_msgs.append(entry)
    elif lvl == 4: warning_msgs.append(entry)
ran("logged_messages")
if severe_msgs:
    samples = severe_msgs[:5]
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
    findings[-1]["evidence"]["samples"] = warning_msgs[:5]

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
if dropout_total_ms > 1000:
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
`.replace("__FAULT_KB__", JSON.stringify(faultKbJson.entries));
