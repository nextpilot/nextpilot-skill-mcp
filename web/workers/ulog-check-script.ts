/**
 * 在 Pyodide 中执行的 Python 检查脚本。
 * 规则与阈值需在冲刺 2 用 10-20 个真实 .ulg 校准（见 CLAUDE.md 4.3 / 8）。
 *
 * 架构约定（CLAUDE.md 4.2）：
 * - 本脚本是"确定性引擎 + 规则检查库"，所有数值判断只在这里发生；
 * - 输出 findings 后由服务端 DeepSeek 翻译为自然语言，LLM 不得改动数值。
 *
 * 字段依据（PX4 msg 定义 + Flight Review 绘图配置）：
 * - vehicle_imu_status（PX4 1.14 起）：accel_vibration_metric（高频振动 m/s^2）、
 *   accel_clipping[3]（累计削波次数，"total clipping per axis"，理想为 0）；
 *   旧固件为 stddev_accel_{x,y,z}[_m_s2]。
 * - estimator_status：1.15 起移除 innovation_check_flags，改为 *_test_ratio
 *   （ratio > 1 表示该路观测被 EKF 拒绝）；旧位定义：0 速度 / 1 水平位置 /
 *   2 垂直位置 / 3-5 磁罗盘 XYZ / 6 航向 / 7 空速 / 8 侧滑 / 9 离地高度 / 10-11 光流。
 * - battery_status：优先用 voltage_cell_v[14] 实测单电芯电压，缺失时用
 *   voltage_v / cell_count 估算，cell_count=0 不做判断。
 */
export const PY_ULG_CHECKS = String.raw`
import json, io
import numpy as np
from pyulog import ULog

PX4_DOC_LOG = "https://docs.px4.io/main/en/log/flight_log_analysis.html"
PX4_DOC_BATTERY = "https://docs.px4.io/main/en/config/battery.html"
PX4_DOC_VIBRATION = "https://docs.px4.io/main/en/assembly/vibration_isolation.html"

# ---- 阈值（有官方来源的标注来源；其余为暂定值，冲刺 2 用 10-20 个真实日志校准）----
# Flight Review "Vibration Metrics" 图背景色带：green < 4.905，orange 4.905~9.81，red > 9.81 m/s^2
VIBE_WARN, VIBE_CRIT = 4.905, 9.81
# 旧固件 stddev_accel RSS 阈值（暂定，沿用 0.5/1.0 m/s^2）
VIBE_STDDEV_WARN, VIBE_STDDEV_CRIT = 0.5, 1.0
# accel_clipping 为全日志累计次数，理想值 0；按全飞行总次数分级（暂定，待校准）
CLIP_WARN, CLIP_CRIT = 100, 1000
# EKF：ratio>=1（被拒绝）样本占比，沿用 1% / 5%
EKF_WARN, EKF_CRIT = 0.01, 0.05
# 单电芯欠压阈值 V/cell（暂定）
CELL_WARN, CELL_CRIT = 3.70, 3.55

findings = []
_fid = [0]
def add(severity, rule_id, title, field, value, threshold=None, unit=None,
        doc=None, suggestion=None):
    _fid[0] += 1
    ev = {"field": field, "value": value}
    if threshold is not None:
        ev["threshold"] = threshold
    if unit is not None:
        ev["unit"] = unit
    f = {"id": "F%02d" % _fid[0], "severity": severity, "ruleId": rule_id,
         "title": title, "evidence": ev}
    if doc: f["docUrl"] = doc
    if suggestion: f["suggestion"] = suggestion
    findings.append(f)

def find_all(ulog, name):
    return [d for d in ulog.data_list if d.name == name]

def getf(ds, *names):
    for n in names:
        try:
            v = ds.data[n]
            if v is not None:
                return v
        except Exception:
            pass
    return None

def pick(ds, *names):
    """同 getf，但返回 (实际字段名, 值)。"""
    for n in names:
        try:
            v = ds.data[n]
            if v is not None:
                return n, v
        except Exception:
            pass
    return None, None

buf = io.BytesIO(bytes(ulog_bytes))
ulog = ULog(buf)

# ---- 总时长 / 基本统计 ----
t_min, t_max = None, None
for d in ulog.data_list:
    t = getf(d, "timestamp")
    if t is not None and len(t) > 1:
        a, b = float(t[0]), float(t[-1])
        t_min = a if t_min is None else min(t_min, a)
        t_max = b if t_max is None else max(t_max, b)
duration_s = round((t_max - t_min) / 1e6, 1) if t_min is not None else None

stats = {"durationSec": duration_s if duration_s is not None else 0}

# ---- 机型识别（多旋翼 / 固定翼 / rover 等，建议措辞与阈值校准需按机型区分）----
# vehicle_status.vehicle_type 枚举（PX4 msg）：1 旋翼类 / 2 固定翼 / 10 rover / 11 飞艇
VEHICLE_TYPES = {1: "rotary_wing", 2: "fixed_wing", 3: "rover", 4: "airship"}
vehicle_type = "unknown"
vs = find_all(ulog, "vehicle_status")
if vs:
    vt = getf(vs[0], "vehicle_type")
    if vt is not None and len(vt) > 0:
        vehicle_type = VEHICLE_TYPES.get(int(vt[-1]), "unknown(%d)" % int(vt[-1]))
    else:
        # 极旧固件：is_rotary_wing 布尔
        rw = getf(vs[0], "is_rotary_wing")
        if rw is not None and len(rw) > 0:
            vehicle_type = "rotary_wing" if int(rw[-1]) else "fixed_wing"
stats["vehicleType"] = vehicle_type

# ---- 规则 1：振动 / IMU 削波（vehicle_imu_status，遍历所有 IMU 实例取最差）----
imu_list = find_all(ulog, "vehicle_imu_status")
if imu_list:
    # 新指标：accel_vibration_metric
    worst = {"mean": 0.0, "p95": 0.0, "max": 0.0, "imu": -1}
    # 旧指标：stddev_accel_* RSS 均值
    worst_stddev = {"rss": 0.0, "imu": -1}
    # 削波：全日志累计增量（万一日志中段清零，用 max-min 仍成立）
    worst_clip = {"count": 0, "axis": -1, "imu": -1}

    for i, d in enumerate(imu_list):
        vm = getf(d, "accel_vibration_metric")
        if vm is not None:
            v = np.asarray(vm, dtype=float)
            v = v[np.isfinite(v)]
            if len(v) > 0:
                m = float(np.mean(v))
                if m > worst["mean"]:
                    worst = {"mean": m,
                             "p95": float(np.percentile(v, 95)),
                             "max": float(np.max(v)), "imu": i}

        sx = getf(d, "stddev_accel_x_m_s2", "stddev_accel_x")
        sy = getf(d, "stddev_accel_y_m_s2", "stddev_accel_y")
        sz = getf(d, "stddev_accel_z_m_s2", "stddev_accel_z")
        if sx is not None and sy is not None and sz is not None:
            rss = float(np.mean(np.sqrt(
                np.asarray(sx, float) ** 2 +
                np.asarray(sy, float) ** 2 +
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
            add("critical", "px4-vibration",
                "高频振动严重超标（IMU #%d）" % worst["imu"],
                "vehicle_imu_status.accel_vibration_metric(均值)",
                round(worst["mean"], 3), VIBE_CRIT, "m/s^2", PX4_DOC_VIBRATION,
                "Flight Review 红色区间（>9.81 m/s^2）。检查桨叶平衡、电机轴承与机架紧固，必要时更换减震方案。")
        elif worst["mean"] >= VIBE_WARN:
            add("warning", "px4-vibration",
                "高频振动偏大（IMU #%d）" % worst["imu"],
                "vehicle_imu_status.accel_vibration_metric(均值)",
                round(worst["mean"], 3), VIBE_WARN, "m/s^2", PX4_DOC_VIBRATION,
                "Flight Review 橙色区间（4.905~9.81 m/s^2）。关注桨叶损伤、电机动平衡与 IMU 减震。")

    if worst_stddev["imu"] >= 0:
        stats["imuStddevAccelRssMax"] = round(worst_stddev["rss"], 3)
        rss = worst_stddev["rss"]
        if rss >= VIBE_STDDEV_CRIT:
            add("critical", "px4-vibration",
                "IMU 加速度标准差严重超标（IMU #%d）" % worst_stddev["imu"],
                "vehicle_imu_status.stddev_accel_*_m_s2(RSS 均值)",
                round(rss, 3), VIBE_STDDEV_CRIT, "m/s^2", PX4_DOC_VIBRATION,
                "检查桨叶平衡、电机轴承与机架紧固，必要时更换减震方案。")
        elif rss >= VIBE_STDDEV_WARN:
            add("warning", "px4-vibration",
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
            add("critical", "px4-imu-clipping", "加速度计削波严重：" + desc,
                field, worst_clip["count"], CLIP_CRIT, "count", PX4_DOC_VIBRATION,
                "持续削波会破坏 EKF 估计，请优先排除机械振动源。")
        elif worst_clip["count"] >= CLIP_WARN:
            add("warning", "px4-imu-clipping", "检测到明显加速度计削波：" + desc,
                field, worst_clip["count"], CLIP_WARN, "count", PX4_DOC_VIBRATION,
                "削波表明振动峰值已超出传感器量程，建议排查机械振动源。")
        else:
            add("info", "px4-imu-clipping", "偶发加速度计削波：" + desc,
                field, worst_clip["count"], 0, "count", PX4_DOC_VIBRATION,
                "少量削波可先观察；若频次升高或伴随振动告警需排查机械问题。")

# ---- 规则 2：EKF 创新检验（遍历所有 estimator_status 实例取最差）----
# 旧固件：innovation_check_flags 位掩码（位定义见 PX4 v1.14 EstimatorStatus.msg）
FLAG_BITS = {
    0: "速度", 1: "水平位置", 2: "垂直位置",
    3: "磁罗盘 X", 4: "磁罗盘 Y", 5: "磁罗盘 Z",
    6: "航向", 7: "空速", 8: "侧滑", 9: "离地高度",
    10: "光流 X", 11: "光流 Y",
}
# 新固件：连续 test ratio（>=1 表示该路观测创新超过检验门限被拒绝）
RATIO_CHANNELS = [
    ("vel_test_ratio", "速度"),
    ("pos_test_ratio", "水平位置"),
    ("hgt_test_ratio", "垂直高度"),
    ("hdg_test_ratio", "航向"),
    ("mag_test_ratio", "磁罗盘"),
    ("tas_test_ratio", "空速"),
    ("hagl_test_ratio", "离地高度"),
    ("beta_test_ratio", "侧滑"),
]
est_list = find_all(ulog, "estimator_status")
ekf_worst = None  # (frac, label, maxratio/union, ekf_index)
for ei, d in enumerate(est_list):
    flags = getf(d, "innovation_check_flags")
    if flags is not None and len(flags) > 0:
        bad = int(np.count_nonzero(flags))
        ratio = bad / len(flags)
        if bad < 3:
            # 样本太少（偶发 1~2 个采样点）不构成趋势性结论
            continue
        union = int(np.bitwise_or.reduce([int(x) for x in flags]))
        fired = sorted(FLAG_BITS[b] for b in FLAG_BITS if union & (1 << b))
        cand = (ratio, "、".join(fired), union, ei)
        if ekf_worst is None or ratio > ekf_worst[0]:
            ekf_worst = cand
        continue
    for name, label in RATIO_CHANNELS:
        v = getf(d, name)
        if v is None:
            continue
        arr = np.asarray(v, dtype=float)
        arr = arr[np.isfinite(arr)]
        if len(arr) == 0:
            continue
        n_bad = int(np.count_nonzero(arr >= 1.0))
        if n_bad < 3:
            # 拒绝样本少于 3 个视为偶发尖峰，避免未启用的传感器（如空速）误报
            continue
        frac = n_bad / len(arr)
        if ekf_worst is None or frac > ekf_worst[0]:
            ekf_worst = (frac, label, float(np.max(arr)), ei)

if ekf_worst is not None:
    frac, labels, extra, ei = ekf_worst
    pct = round(frac * 100, 2)
    stats["ekfRejectRatioPct"] = pct
    if frac >= EKF_CRIT:
        add("critical", "px4-ekf-innovation",
            "EKF 创新检验持续失败（estimator #%s：%s）" % (ei, labels or "未知通道"),
            "estimator_status 创新检验拒绝样本占比", pct, EKF_CRIT * 100, "%",
            PX4_DOC_LOG,
            "涉及：%s。检查对应传感器健康度、安装与校准（GPS / 磁罗盘 / 气压计等）。" % (labels or "未知通道"))
    elif frac >= EKF_WARN:
        add("warning", "px4-ekf-innovation",
            "EKF 创新检验偶发失败（estimator #%s：%s）" % (ei, labels or "未知通道"),
            "estimator_status 创新检验拒绝样本占比", pct, EKF_WARN * 100, "%",
            PX4_DOC_LOG,
            "涉及：%s。关注 GPS 卫星数、磁罗盘干扰、振动与气压计异常。" % (labels or "未知通道"))

# ---- 规则 3：电源（battery_status，优先实测单电芯电压）----
bat = find_all(ulog, "battery_status")
if bat:
    b0 = bat[0]
    volt = getf(b0, "voltage_v", "voltage_filtered_v")
    if volt is not None and len(volt) > 0:
        vmin = float(np.min(volt))
        stats["batteryVoltageMin"] = round(vmin, 2)

    per_cell_min = None
    source = None
    cell_voltages = []
    for idx in range(14):
        vv = getf(b0, "voltage_cell_v[%d]" % idx, "voltage_cell_v_%d" % idx)
        if vv is not None and len(vv) > 0:
            cell_voltages.append(np.asarray(vv, dtype=float))
    measured = [float(np.min(a[a > 0])) for a in cell_voltages if np.any(a > 0)]
    if measured:
        per_cell_min = min(measured)
        source = "battery_status.voltage_cell_v[](实测最小值)"
    else:
        cell_count = getf(b0, "cell_count")
        if cell_count is not None and len(cell_count) > 0:
            cells = int(np.max(cell_count))
            if volt is not None and cells > 0 and vmin > 0:
                per_cell_min = vmin / cells
                source = "battery_status.voltage_v(min)/cell_count"
                stats["batteryCellCount"] = cells

    if per_cell_min is not None:
        stats["batteryCellVoltageMin"] = round(per_cell_min, 3)
        if per_cell_min < CELL_CRIT:
            add("critical", "px4-power-cell-voltage", "电芯电压严重过低",
                source, round(per_cell_min, 3), CELL_CRIT, "V/cell", PX4_DOC_BATTERY,
                "存在过放风险，检查电池老化、放电倍率匹配与低压告警阈值。")
        elif per_cell_min < CELL_WARN:
            add("warning", "px4-power-cell-voltage", "电芯电压偏低",
                source, round(per_cell_min, 3), CELL_WARN, "V/cell", PX4_DOC_BATTERY,
                "建议核对剩余容量估计与返航电压裕度。")
    elif volt is not None:
        add("info", "px4-power-cell-voltage", "日志缺少电芯电压与 cell_count，未做单电芯判断",
            "battery_status.voltage_cell_v / cell_count", "missing", None, None,
            PX4_DOC_BATTERY)

order = {"critical": 0, "warning": 1, "info": 2}
findings.sort(key=lambda f: order[f["severity"]])

__result = json.dumps({
    "platform": "PX4",
    "vehicleType": vehicle_type,
    "parserVersion": "pyulog/pyodide-0.2.0",
    "durationSec": duration_s,
    "stats": stats,
    "findings": findings,
}, ensure_ascii=False)
`;
