#!/usr/bin/env python3
"""
ULog 快速体检：把 .ulg 里的关键字段按固定顺序拉出来，输出 JSON。

    python3 scripts/quick_check.py flight.ulg
    python3 scripts/quick_check.py flight.ulg --top 3      # 只看最差的 3 个电芯

设计原则（见 SKILL.md）：
    **数值判断交给规则，模型只做解释。**

这个脚本负责"拿到确定的数"，不负责"解释发生了什么"。
它不会说"你炸机是因为振动"——它只说 gyro_clipping[0] = 1847，阈值 0，
然后由 SKILL.md 描述的判断逻辑（或模型）去解释。

依赖：pip install pyulog
"""

import argparse
import json
import math
import re
import sys

# 阈值集中在这里，改机架就改这里。
# 注意：穿越机与 1m 轴距六轴的振动基线差一个量级，别照抄。
THRESHOLDS = {
    "accel_vibration_metric": 20.0,  # 一般机架；穿越机可放宽到 30
    "gyro_clipping": 0,  # >0 即量程打满，比振动指标更严重
    "voltage_v_min": 3.3,  # 单片电芯最低电压 V
    "voltage_v_warn": 3.4,  # 低于此开始留意；定在 3.5 会把正常负载压降也报成告警
    "cell_plausible_min": 0.5,  # 低于此视为"槽位未使用"而非"电芯坏了"
    "fix_type_min": 3,  # <3 定位不可用
    "eph_max": 2.0,  # 水平定位精度 m
}

# pyulog 会把 ULog 的数组字段摊平成 name[0]..name[9]，不存在裸名 key。
CELL_RE = re.compile(r"^cell_voltage\[(\d+)\]$")


def fail(msg):
    print(json.dumps({"status": "无法判定", "reason": msg}, ensure_ascii=False))
    sys.exit(2)


try:
    from pyulog import ULog
except ImportError:
    fail("未安装 pyulog，请先 pip install pyulog")


def last(data):
    """取字段序列的最后一个值（末态通常最有诊断价值）"""
    return data[-1] if len(data) else None


def max_of(data):
    return max(data) if len(data) else None


def min_of(data):
    return min(data) if len(data) else None


def cell_minima(dataset):
    """返回 {cell_index: 全程最低电压}，已剔除未使用的槽位。

    两个坑，都踩过：
      1. key 是 cell_voltage[0]..cell_voltage[9]，不是 cell_voltage。
         （pyulog 把数组摊平了。写 "cell_voltage" in data 永远不会命中，
          于是欠压检查静默失效——不报错，只是从来不检查。）
      2. PX4 恒定写 10 元素数组，只填前 ncells 个，剩下是 0。
         若不过滤，最差电芯永远是那一节不存在的电池：0.000V。
    """
    out = {}
    for key, series in dataset.data.items():
        m = CELL_RE.match(key)
        if not m:
            continue
        vals = []
        for v in series:
            try:
                fv = float(v)
            except (TypeError, ValueError):
                continue
            if math.isnan(fv) or fv < THRESHOLDS["cell_plausible_min"]:
                continue
            vals.append(fv)
        if vals:
            out[int(m.group(1))] = min(vals)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ulg")
    ap.add_argument("--top", type=int, default=0, help="只列出最差的 N 个电芯")
    args = ap.parse_args()

    try:
        ulog = ULog(args.ulg)
    except Exception as e:
        fail(f"无法解析 {args.ulg}: {e}")

    topics = {d.name: d for d in ulog.data_list}
    findings = []

    def add(rule, severity, topic, field, value, threshold, note=""):
        findings.append(
            {
                "rule": rule,
                "severity": severity,
                "field": f"{topic}.{field}",
                "value": value,
                "threshold": threshold,
                "note": note,
            }
        )

    # 1. 飞控自己说了什么 —— 最高优先级
    if "logged_message" in topics:
        d = topics["logged_message"]
        msgs = list(zip(d.data.get("severity", []), d.data.get("message", [])))
        critical = [m for s, m in msgs if isinstance(s, (int, float)) and s <= 3]
        if critical:
            add(
                "logged_message_critical",
                "critical",
                "logged_message",
                "severity",
                len(critical),
                0,
                "机载上报的告警，优先级高于一切推断",
            )

    # 2. 振动 / 削波 —— 数据不可信的话后面全白看
    if "vehicle_imu_status" in topics:
        d = topics["vehicle_imu_status"]
        vib = max_of(d.data.get("accel_vibration_metric", []))
        if vib is not None:
            add(
                "accel_vibration",
                "critical" if vib > THRESHOLDS["accel_vibration_metric"] else "ok",
                "vehicle_imu_status",
                "accel_vibration_metric",
                round(float(vib), 3),
                THRESHOLDS["accel_vibration_metric"],
            )
        for i in range(3):
            key = f"gyro_clipping[{i}]"
            if key in d.data:
                c = max_of(d.data[key])
                if c:
                    add(
                        "gyro_clipping",
                        "critical",
                        "vehicle_imu_status",
                        key,
                        int(c),
                        THRESHOLDS["gyro_clipping"],
                        "陀螺仪量程打满，基于 IMU 的结论不可信",
                    )

    # 3. EKF
    for t in ("estimator_status", "estimator_status_flags"):
        if t in topics:
            d = topics[t]
            if "innovation_check_flags" in d.data:
                f = max_of(d.data["innovation_check_flags"])
                add(
                    "ekf_innovation",
                    "critical" if f else "ok",
                    t,
                    "innovation_check_flags",
                    int(f),
                    0,
                    "非零需按位解析：bit0 拒绝水平位置 等",
                )

    # 4. 电源 —— 欠压能同时解释 GPS 丢星、重启、失控
    if "battery_status" in topics:
        d = topics["battery_status"]
        cells = cell_minima(d)
        if cells:
            ranked = sorted(cells.items(), key=lambda kv: kv[1])
            limit = args.top or min(3, len(cells))
            worst_idx, worst_v = ranked[0]

            # 单位自洽性检查：万一遇到 mV（老固件/第三方 CAN 电池），别算出荒谬结论
            unit_note = ""
            if worst_v > 100:
                unit_note = "数值疑似 mV 而非 V —— 本脚本按 V 判定，结论不可信，请核对固件单位"

            add(
                "cell_voltage_min",
                "ok",
                "battery_status",
                f"cell_voltage[{worst_idx}]",
                round(float(worst_v), 3),
                THRESHOLDS["voltage_v_min"],
                f"最差电芯（共 {len(cells)} 节有效）; " + unit_note,
            )

            for idx, v in ranked[:limit]:
                if v < THRESHOLDS["voltage_v_min"]:
                    sev, rule = "critical", "cell_undervoltage"
                elif v < THRESHOLDS["voltage_v_warn"]:
                    sev, rule = "warning", "cell_voltage_low"
                else:
                    continue
                add(
                    rule,
                    sev,
                    "battery_status",
                    f"cell_voltage[{idx}]",
                    round(float(v), 3),
                    THRESHOLDS["voltage_v_min"],
                    "找最差电芯，不看总电压——均值会把单节故障掩盖过去",
                )
        else:
            findings.append(
                {
                    "rule": "cell_voltage_missing",
                    "severity": "unknown",
                    "field": "battery_status.cell_voltage",
                    "value": None,
                    "threshold": THRESHOLDS["voltage_v_min"],
                    "note": "日志里没有电芯数据：可能未配置 BATn_CAPACITY / 电源模块不带电芯检测",
                }
            )

    # 5. GPS
    if "vehicle_gps_position" in topics:
        d = topics["vehicle_gps_position"]
        ft = min_of(d.data.get("fix_type", []))
        if ft is not None and ft < THRESHOLDS["fix_type_min"]:
            add("gps_fix", "critical", "vehicle_gps_position", "fix_type", int(ft), THRESHOLDS["fix_type_min"], "<3 定位不可用")
        eph = max_of(d.data.get("eph", []))
        if eph is not None and eph > THRESHOLDS["eph_max"]:
            add("gps_eph", "warning", "vehicle_gps_position", "eph", round(float(eph), 2), THRESHOLDS["eph_max"])

    missing = [t for t in ("vehicle_imu_status", "battery_status", "vehicle_gps_position") if t not in topics]
    print(
        json.dumps(
            {
                "status": "ok",
                "file": args.ulg,
                "missing_topics": missing,
                "findings": findings,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
