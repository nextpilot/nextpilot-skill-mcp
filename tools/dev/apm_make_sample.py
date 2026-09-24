"""合成一份最小 ArduPilot .bin（AP_Logger）样本 —— 给契约测试当夹具。

为什么独立实现打包、不复用 knowledge/engine/providers/ardupilot.py 的解析：
夹具的**写入端**与被测的**读取端**是两份独立实现——两边对"格式"的理解必须各自
站得住才能对上；复用同一份代码就成了自证（写错读错，测试照样绿）。

只写契约测试需要的最小集合：FMT 声明 + PARM/MSG/EV/MODE/GPS 各几行，
覆盖：版本解析、参数、armed 区间（EV 10/11）、模式切段、GPS 轨迹与 Home。

用法：
  from apm_make_sample import build_sample_bytes
  data = build_sample_bytes()          # -> bytes
  python apm_make_sample.py out.bin    # 落盘
"""

import struct

MAGIC = b"\xa3\x95"


def _fmt_row(mtype, length, name, fmt, columns):
    """FMT 消息（type 恒 128）：payload 恒 86B = Type(1)+Length(1)+Name(4)+Format(16)+Columns(64)。"""
    payload = struct.pack("<BB", mtype, length)
    payload += name.encode("ascii").ljust(4, b"\x00")
    payload += fmt.encode("ascii").ljust(16, b"\x00")
    payload += columns.encode("ascii").ljust(64, b"\x00")
    assert len(payload) == 86, len(payload)
    return MAGIC + bytes([128]) + payload


def _msg(mtype, fmt, values, scaled):
    """一条数据消息：magic + length + type + 按 fmt 打包的 payload（缩放字符在写入端同样要乘回去）。"""
    payload = b""
    for ch, v in zip(fmt, values):
        if ch == "Q":
            payload += struct.pack("<Q", int(v))
        elif ch == "B":
            payload += struct.pack("<B", int(v))
        elif ch == "H":
            payload += struct.pack("<H", int(v))
        elif ch == "f":
            payload += struct.pack("<f", float(v))
        elif ch == "n":  # char[4]
            payload += str(v).encode("ascii")[:4].ljust(4, b"\x00")
        elif ch == "N":  # char[16]
            payload += str(v).encode("ascii")[:16].ljust(16, b"\x00")
        elif ch == "Z":  # char[64]
            payload += str(v).encode("ascii")[:64].ljust(64, b"\x00")
        elif ch == "L":  # int32 × 1e-7：写入端按 ×1e7 存
            payload += struct.pack("<i", int(round(float(v) * 1e7)))
        elif ch in scaled:  # ×0.01 系：写入端按 ×100 存
            payload += struct.pack("<h" if ch in "ce" else "<I", int(round(float(v) * 100)))
        else:
            raise ValueError("样本生成器不认识格式字符 %r" % ch)
    return MAGIC + bytes([mtype]) + payload


# 消息类型 ID：解析器按**名字**查表，ID 本身随便给（这正是要自证的点之一）
IDS = {"FMT": 128, "PARM": 132, "MSG": 133, "EV": 134, "MODE": 135, "GPS": 136}

# (名字, 格式串, 列名)。长度 = 3 + 各字段字节数之和（Length 含 3 字节头，与主流固件一致；
# 解析器有自校准，就算约定反了也该解对——这本身就是被测行为）
STRUCTS = {
    "PARM": ("QNf", "TimeUS,Name,Value"),
    "MSG": ("QZ", "TimeUS,Message"),
    "EV": ("QB", "TimeUS,Id"),
    "MODE": ("Qn", "TimeUS,Mode"),
    "GPS": ("QBHLLf", "TimeUS,Status,NSats,Lat,Lng,Alt"),
}


def _fmt_len(fmt):
    size = {"Q": 8, "B": 1, "H": 2, "f": 4, "n": 4, "N": 16, "Z": 64, "L": 4}
    return 3 + sum(size[ch] for ch in fmt)


def build_sample_bytes() -> bytes:
    out = bytearray()
    # FMT 声明先写（含 FMT 自己的声明——真实日志也是如此，解析器的长度约定校准靠它）
    out += _fmt_row(128, 89, "FMT", "BBnNZ", "Type,Length,Name,Format,Columns")
    for name, (fmt, columns) in STRUCTS.items():
        out += _fmt_row(IDS[name], _fmt_len(fmt), name, fmt, columns)

    # 参数：版本 + 机架
    out += _msg(IDS["PARM"], "QNf", (50_000, "FORMAT_VERSION", 4.5), scaled=set())
    out += _msg(IDS["PARM"], "QNf", (51_000, "FRAME_CLASS", 1), scaled=set())
    out += _msg(IDS["PARM"], "QNf", (52_000, "DISARMED_PARAM_KEEP", 1), scaled=set())

    # 文本消息：版本串（解析器从这行取固件版本与 git 哈希）
    out += _msg(IDS["MSG"], "QZ", (100_000, "ArduPilot Version 4.5.7 (abcd1234)"), scaled=set())
    out += _msg(IDS["MSG"], "QZ", (110_000, "Frame: QUAD"), scaled=set())

    # armed 区间：1s 解锁、6s 上锁（EV 码值 10/11）
    out += _msg(IDS["EV"], "QB", (1_000_000, 10), scaled=set())
    out += _msg(IDS["EV"], "QB", (6_000_000, 11), scaled=set())

    # 模式：0.5s STAB -> 2s AUTO -> 7s STAB（三段）
    out += _msg(IDS["MODE"], "Qn", (500_000, "STAB"), scaled=set())
    out += _msg(IDS["MODE"], "Qn", (2_000_000, "AUTO"), scaled=set())
    out += _msg(IDS["MODE"], "Qn", (7_000_000, "STAB"), scaled=set())

    # GPS 轨迹：5 个有效定位（39.90N 116.40E 起步向北挪）
    for i in range(5):
        out += _msg(
            IDS["GPS"],
            "QBHLLf",
            ((2_000_000 + i * 1_000_000, 3, 14, 39.90 + i * 0.0001, 116.40 + i * 0.0001, 50.0 + i)),
            scaled=set(),
        )
    # 一个未定位样本（Status=0、坐标 0）：必须被轨迹与 Home 剔掉
    out += _msg(IDS["GPS"], "QBHLLf", (7_500_000, 0, 0, 0, 0, 0.0), scaled=set())

    return bytes(out)


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    with open(sys.argv[1], "wb") as f:
        f.write(build_sample_bytes())
    print("written:", sys.argv[1])
