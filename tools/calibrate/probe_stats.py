"""临时：统计三个关键消息在真实日志上的实际数值，用于校准阈值。"""

import sys
from pathlib import Path

import numpy as np
from pyulog import ULog

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

for path in sys.argv[1:]:
    log.info(f"\n########## {path}")
    ulog = ULog(path)
    groups = {}
    for d in ulog.data_list:
        groups.setdefault(d.name, []).append(d)

    for d in groups.get("vehicle_imu_status", []):
        data = d.data
        pre = "accel_clipping[" if "accel_clipping[0]" in data else None
        log.info(
            f"[imu multi_id={d.multi_id}] keys={[k for k in data if 'vibration' in k or 'clipping' in k or 'var_accel' in k or 'stddev' in k][:12]}"
        )
        if "accel_vibration_metric" in data:
            v = data["accel_vibration_metric"]
            log.info(f"  vibration_metric: mean={np.mean(v):.3f} p95={np.percentile(v, 95):.3f} max={np.max(v):.3f}")
        for pat in ("var_accel[", "stddev_accel_"):
            axes = [k for k in data if k.startswith(pat)]
            if axes:
                if pat.startswith("var"):
                    rss_mean = np.mean(np.sqrt(sum(data[k] ** 2 if False else data[k] for k in axes)))
                    log.info(f"  stddev RSS(mean of sqrt(sum var))={rss_mean:.4f} axes={axes}")
                else:
                    rss = np.sqrt(sum(data[k] ** 2 for k in axes))
                    log.info(f"  stddev RSS mean={np.mean(rss):.4f} max={np.max(rss):.4f} axes={axes}")
        for i in range(3):
            for name in (f"accel_clipping[{i}]", f"accel_clipping_{i}", f"clipping_{i}"):
                if name in data:
                    c = data[name]
                    log.info(f"  {name}: first={int(c[0])} last={int(c[-1])} max={int(c.max())} n={len(c)}")
                    break

    for d in groups.get("estimator_status", []):
        data = d.data
        n = len(data["timestamp"])
        dur = (data["timestamp"][-1] - data["timestamp"][0]) / 1e6
        log.info(f"[estimator multi_id={d.multi_id}] n={n} dur={dur:.0f}s")
        if "innovation_check_flags" in data:
            f = data["innovation_check_flags"]
            log.info(
                f"  innovation_check_flags set ratio={np.count_nonzero(f) / len(f):.3%} union={int(np.bitwise_or.reduce([int(x) for x in f])):#06x}"
            )
        for r in (
            "vel_test_ratio",
            "pos_test_ratio",
            "hgt_test_ratio",
            "hdg_test_ratio",
            "mag_test_ratio",
            "tas_test_ratio",
            "hagl_test_ratio",
            "beta_test_ratio",
        ):
            if r in data:
                v = data[r]
                log.info(
                    f"  {r}: mean={np.mean(v):.3f} max={np.max(v):.3f} frac>=1={np.mean(v >= 1):.3%} frac>=0.5={np.mean(v >= 0.5):.3%}"
                )

    for d in groups.get("battery_status", [])[:1]:
        data = d.data
        v = data.get("voltage_v")
        if v is not None:
            log.info(f"[battery] voltage_v min={np.min(v):.2f} cells={np.max(data.get('cell_count', [0]))}")
        cells = [k for k in data if k.startswith("voltage_cell_v[")]
        vals = [np.min(data[k]) for k in cells if np.any(data[k] > 0)]
        if vals:
            log.info(f"  per-cell min={min(vals):.3f} (nonzero cells={len(vals)})")