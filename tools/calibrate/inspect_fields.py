"""临时排查：dump 指定消息在 .ulg 中的真实字段名、实例数与数据形状。"""

import sys
from pyulog import ULog

WANT = {"vehicle_imu_status", "estimator_status", "battery_status", "sensor_imu"}

path = sys.argv[1]
ulog = ULog(path)
for d in ulog.data_list:
    if d.name in WANT:
        print(f"\n== {d.name} (multi_id={d.multi_id}) n={len(d.data['timestamp'])} ==")
        for k, v in d.data.items():
            shape = getattr(v, "shape", None)
            print(f"  {k}: {getattr(v, 'dtype', type(v))} {shape if shape and len(shape) > 1 else ''}")
