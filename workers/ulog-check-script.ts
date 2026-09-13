/**
 * 在 Pyodide 中执行的 Python 检查脚本。
 * 规则与阈值需在冲刺 2 用 10-20 个真实 .ulg 校准（见 CLAUDE.md 4.3 / 8）。
 *
 * 架构约定（CLAUDE.md 4.2）：
 * - 本脚本是"确定性引擎 + 规则检查库"，所有数值判断只在这里发生；
 * - 输出 findings 后由服务端 DeepSeek 翻译为自然语言，LLM 不得改动数值。
 */
export const PY_ULG_CHECKS = String.raw`
import json, io
import numpy as np
from pyulog.ulog import ULog

PX4_DOC_LOG = "https://docs.px4.io/main/en/log/flight_log_analysis.html"
PX4_DOC_BATTERY = "https://docs.px4.io/main/en/config/battery.html"

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

# ---- 规则 1：振动 / IMU 削波（vehicle_imu_status）----
# 阈值（待真实日志校准）：加速度计标准差 RSS 均值 >0.5 m/s^2 警告，>1.0 严重；
# 集成削波占比 >20% 警告，>50% 严重。
imu_list = find_all(ulog, "vehicle_imu_status")
if imu_list:
    worst_vib, worst_clip, worst_i = 0.0, 0.0, 0
    for i, d in enumerate(imu_list):
        sx = getf(d, "stddev_accel_x_m_s2", "stddev_accel_x")
        sy = getf(d, "stddev_accel_y_m_s2", "stddev_accel_y")
        sz = getf(d, "stddev_accel_z_m_s2", "stddev_accel_z")
        if sx is not None and sy is not None and sz is not None:
            rss = float(np.mean(np.sqrt(sx**2 + sy**2 + sz**2)))
            if rss > worst_vib:
                worst_vib, worst_i = rss, i
        clips = []
        for axis in range(3):
            c = getf(d, "accel_clipping_%d" % axis, "clipping_%d" % axis)
            if c is not None:
                clips.append(float(np.mean(c)))
        if clips:
            worst_clip = max(worst_clip, max(clips))
    stats["imuStddevAccelRssMax"] = round(worst_vib, 3)
    stats["imuClippingPctMax"] = round(worst_clip, 1)
    if worst_vib >= 1.0:
        add("critical", "px4-vibration", "IMU 振动严重超标（IMU #%d）" % worst_i,
            "vehicle_imu_status.stddev_accel_*_m_s2(RSS 均值)", round(worst_vib, 3),
            1.0, "m/s^2", PX4_DOC_LOG,
            "检查桨叶平衡、电机轴承与机架紧固，必要时更换减震方案。")
    elif worst_vib >= 0.5:
        add("warning", "px4-vibration", "IMU 振动偏大（IMU #%d）" % worst_i,
            "vehicle_imu_status.stddev_accel_*_m_s2(RSS 均值)", round(worst_vib, 3),
            0.5, "m/s^2", PX4_DOC_LOG,
            "关注桨叶损伤、电机动平衡与 IMU 减震。")
    if worst_clip >= 50:
        add("critical", "px4-imu-clipping", "加速度计削波严重",
            "vehicle_imu_status.accel_clipping_*(均值)", round(worst_clip, 1),
            50, "%", PX4_DOC_LOG, "削波会破坏 EKF 估计，请优先排除机械振动源。")
    elif worst_clip >= 20:
        add("warning", "px4-imu-clipping", "检测到加速度计削波",
            "vehicle_imu_status.accel_clipping_*(均值)", round(worst_clip, 1),
            20, "%", PX4_DOC_LOG, "削波表明振动已超出传感器量程。")

# ---- 规则 2：EKF 创新检验（estimator_status.innovation_check_flags）----
FLAG_BITS = {
    0: "GPS 位置", 1: "垂直速度/高度", 2: "水平位置", 3: "垂直位置",
    4: "高度", 5: "空速", 7: "光流", 8: "磁罗盘航向",
    10: "磁场模值", 11: "测距仪", 15: "气压计高度",
}
est = find_all(ulog, "estimator_status")
flags = getf(est[0], "innovation_check_flags") if est else None
if flags is not None and len(flags) > 0:
    bad = int(np.count_nonzero(flags))
    ratio = bad / len(flags)
    fired = set()
    union = int(np.bitwise_or.reduce([int(x) for x in flags]))
    for bit, label in FLAG_BITS.items():
        if union & (1 << bit):
            fired.add(label)
    stats["ekfInnovationBadRatioPct"] = round(ratio * 100, 2)
    if ratio >= 0.05:
        add("critical", "px4-ekf-innovation", "EKF 创新检验持续失败",
            "estimator_status.innovation_check_flags(置位占比)", round(ratio * 100, 2),
            5, "%", PX4_DOC_LOG,
            "涉及：%s。检查对应传感器健康度与安装校准。" % "、".join(sorted(fired)))
    elif ratio >= 0.01:
        add("warning", "px4-ekf-innovation", "EKF 创新检验偶发置位",
            "estimator_status.innovation_check_flags(置位占比)", round(ratio * 100, 2),
            1, "%", PX4_DOC_LOG,
            "涉及：%s。关注 GPS 卫星数、磁罗盘干扰与振动。" % "、".join(sorted(fired)))

# ---- 规则 3：电源（battery_status，按电芯电压判断）----
bat = find_all(ulog, "battery_status")
volt = getf(bat[0], "voltage_v", "voltage_filtered_v") if bat else None
cell_count = getf(bat[0], "cell_count") if bat else None
if volt is not None and len(volt) > 0:
    vmin = float(np.min(volt))
    stats["batteryVoltageMin"] = round(vmin, 2)
    cells = int(np.max(cell_count)) if cell_count is not None and len(cell_count) > 0 else 0
    if cells > 0:
        per = vmin / cells
        stats["batteryCellCount"] = cells
        stats["batteryCellVoltageMin"] = round(per, 3)
        if per < 3.55:
            add("critical", "px4-power-cell-voltage", "电芯电压严重过低",
                "battery_status.voltage_v(min)/cell_count", round(per, 3),
                3.55, "V/cell", PX4_DOC_BATTERY,
                "存在过放风险，检查电池老化、放电倍率匹配与低压告警阈值。")
        elif per < 3.70:
            add("warning", "px4-power-cell-voltage", "电芯电压偏低",
                "battery_status.voltage_v(min)/cell_count", round(per, 3),
                3.70, "V/cell", PX4_DOC_BATTERY,
                "建议核对剩余容量估计与返航电压裕度。")
    else:
        add("info", "px4-power-cell-voltage", "日志缺少 cell_count，未做单电芯判断",
            "battery_status.cell_count", "missing", None, None, PX4_DOC_BATTERY)

order = {"critical": 0, "warning": 1, "info": 2}
findings.sort(key=lambda f: order[f["severity"]])

json.dumps({
    "platform": "PX4",
    "parserVersion": "pyulog/pyodide-0.1.0",
    "durationSec": duration_s,
    "stats": stats,
    "findings": findings,
})
`;
