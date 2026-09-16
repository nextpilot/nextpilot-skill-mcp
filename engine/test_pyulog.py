"""
pyulog 读取 PX4 `.ulg` 文件的 demo。

用法：
    python engine/test-pyulog.py [path/to/log.ulg]

默认会在 tools/calibrate/logs/ 和 .cache/px4/ulog/ 中查找。
"""

import sys
from pathlib import Path

from pyulog import ULog

# 默认查找目录
LOOKUP_DIRS = [
    Path(__file__).resolve().parent.parent / "tools" / "calibrate" / "logs",
    Path(__file__).resolve().parent.parent / ".cache" / "px4" / "ulog",
]


def find_ulg() -> Path:
    """从默认目录中找第一个 .ulg 文件。"""
    for d in LOOKUP_DIRS:
        if d.is_dir():
            files = sorted(d.glob("*.ulg"))
            if files:
                print(f"[auto] 使用默认日志: {files[0]}")
                return files[0]
    print("未找到 .ulg 文件，请在以下目录放置日志：")
    for d in LOOKUP_DIRS:
        print(f"  {d}")
    print("或: python engine/test-pyulog.py <path/to/log.ulg>")
    sys.exit(1)


def print_info(ulog: ULog) -> None:
    print("=" * 60)
    print("  PX4 ULG 日志信息")
    print("=" * 60)
    # print(f"  文件名      : {Path(ulog.file_name).name}")
    print(f"  日志格式版本: {ulog.msg_info_dict['ver_sw_release']}")
    print(f"  硬件        : {ulog.msg_info_dict['ver_hw']}")
    if ulog.start_timestamp > 0:
        duration_s = (ulog.last_timestamp - ulog.start_timestamp) / 1_000_000
        print(f"  开始时间戳  : {ulog.start_timestamp} μs")
        print(f"  结束时间戳  : {ulog.last_timestamp} μs")
        print(f"  持续时间    : {duration_s:.2f} s")


def print_params(ulog: ULog) -> None:
    print(f"\n  参数数量    : {len(ulog.initial_parameters)}")
    keys = ["SYS_AUTOSTART", "SYS_AUTOCONFIG", "MAV_TYPE", "SENS_BOARD_X_OFF"]
    for k in keys:
        if k in ulog.initial_parameters:
            print(f"  {k:<24s} = {ulog.initial_parameters[k]}")


def print_topics(ulog: ULog) -> None:
    print(f"\n  Topic 数量  : {len(ulog.data_list)}")
    print(f"  {'Topic':<32s} {'字段':>5s}  {'数据点':>8s}")
    print("  " + "-" * 50)
    for d in ulog.data_list:
        n_fields = len(d.field_data)
        n_pts = len(next(iter(d.field_data.values()), []))
        print(f"  {d.name:<32s} {n_fields:>5d}  {n_pts:>8d}")
    print("  " + "-" * 50)


def print_head(d, label: str) -> None:
    fs = list(d.field_data.keys())
    n = min(5, len(d.field_data[fs[0]]))
    print(f"\n  [{label}] 前 {n} 行:")
    header = "  " + " ".join(f"{f:>14s}" for f in fs)
    print(header)
    print("  " + "-" * len(header))
    for i in range(n):
        row = "  " + " ".join(f"{d.field_data[f][i]:14.4f}" for f in fs)
        print(row)


def print_messages(ulog: ULog) -> None:
    print(f"\n  日志消息数  : {len(ulog.logged_messages)}")
    for m in ulog.logged_messages[:10]:
        print(f"  [{m.log_level}] {m.message}")


def main() -> None:
    if len(sys.argv) >= 2:
        path = sys.argv[1]
    else:
        path = str(find_ulg())

    ulog = ULog(path)
    print_info(ulog)
    print_params(ulog)
    print_topics(ulog)

    targets = {
        "vehicle_attitude": "姿态",
        "vehicle_local_position": "本地位置",
        "battery_status": "电池",
    }
    for d in ulog.data_list:
        if d.name in targets:
            print_head(d, f"{d.name} ({targets[d.name]})")

    print_messages(ulog)
    print()


if __name__ == "__main__":
    main()
