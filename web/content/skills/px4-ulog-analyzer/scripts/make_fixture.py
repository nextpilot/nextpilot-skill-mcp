#!/usr/bin/env python3
"""ULog fixture 生成器 —— 造回归测试用的 .ulg，地面真值已知。

    python3 scripts/make_fixture.py               # 生成到 ../assets/
    python3 scripts/make_fixture.py --outdir DIR
    python3 scripts/make_fixture.py --verify      # 生成后读回来自检

为什么是合成的、而不是录一段真机日志？

  1. 隐私问题：真实的坠机日志带着别人的飞行数据和 GPS 轨迹，不能进公共仓库。
  2. 地面真值：合成日志"根因是什么"是写死在代码里的。振动超标就是振动超标，
     eval 才有东西可以对账。真人日志的根因往往连当事人在争吵。
  3. 可复现：种子固定，任何机器上生成的字节都一样。日志变了就是脚本变了，
     不是"恰好那天风大"。
  4. 能覆盖反例：健康日志、欠压日志这种"应该什么都不报"的样本，
     靠等别人上传是等不来的。

（文档里常建议用 SITL 仿真生成。SITL 好处是字段全真，坏处是要编译一整套
 PX4 固件——为了几 KB 的测试素材不值当。等需要验证某个 SITL 特有的引脚行为时再换。）

输出的三个场景：

  sample_crash_vibration.ulg   振动超标 → 削波 → EKF 创新被拒 → 电机饱和
                               （secondary：电源、GPS、操作输入的健康 - 用于排除误报）
  sample_healthy.ulg           全程正常一份。存在的意义是验证脚本不乱报。
  sample_undervoltage.ulg      46S 电池被拉到 3.05V → 欠压。
                               考验脚本"找最差电芯而非看平均"的逻辑。
"""

import argparse
import math
import os
import struct
import sys

# 注意这里的 7 个字节，官方文档只写了 "ULog" + version + timestamp（13 字节），
# 但实现里 magic 后面还跟了 0x01 0x12 0x35 —— 加起来 7+1+8=16 才是解析器认的头。
# 照文档写 13 字节会解析失败，这个坑花了我一轮。
HEADER_BYTES = b"\x55\x4c\x6f\x67\x01\x12\x35"  # "ULog" + 0x01 0x12 0x35
FILE_VERSION = 1

MSG_FLAG_BITS = ord("B")
MSG_FORMAT = ord("F")
MSG_INFO = ord("I")
MSG_PARAMETER = ord("P")
MSG_ADD_LOGGED = ord("A")
MSG_DATA = ord("D")
MSG_LOGGING = ord("L")

# 与 pyulog 的 _UNPACK_TYPES 保持一致
UNPACK_CODES = {
    "int8_t": "b",
    "uint8_t": "B",
    "int16_t": "h",
    "uint16_t": "H",
    "int32_t": "i",
    "uint32_t": "I",
    "int64_t": "q",
    "uint64_t": "Q",
    "float": "f",
    "double": "d",
    "bool": "?",
}

# 刻意选一个明显的过去时间，让日志看起来像默认打开的样子
START_TS = 1_700_000_000_000_000  # us
STEP = 200_000  # us → 5 Hz
SAMPLES = 201  # → 40 秒

MOTOR_COUNT = 6
CELL_COUNT = 6  # 6S 电池，但 ULog 中 cell_voltage 恒定是 10 元素数组
CELL_ARRAY_LEN = 10  # 后 4 个是未使用的 0 —— 这是给脚本挖的坑，见 README

TOPICS = {
    "vehicle_imu_status": (
        "uint64_t timestamp;uint64_t timestamp_sample;"
        "uint32_t[3] gyro_clipping;float accel_vibration_metric;"
        "float gyro_vibration_metric"
    ),
    "estimator_status": (
        "uint64_t timestamp;uint64_t timestamp_sample;uint16_t innovation_check_flags;float[24] states;float[3] vibe"
    ),
    "actuator_outputs": ("uint64_t timestamp;uint64_t timestamp_sample;uint16_t noutputs;float[16] output"),
    "vehicle_gps_position": (
        "uint64_t timestamp;uint64_t timestamp_sample;uint8_t fix_type;float eph;float epv;uint8_t satellites_used"
    ),
    "battery_status": (
        "uint64_t timestamp;uint64_t timestamp_sample;float voltage_v;float current_a;float remaining;float[10] cell_voltage"
    ),
    "manual_control_setpoint": ("uint64_t timestamp;float x;float y;float z;float r;bool valid"),
}


def parse_fields(defn):
    """'uint64_t timestamp;uint32_t[3] gyro_clipping'
    → [('uint64_t', 0, 'timestamp'), ('uint32_t', 3, 'gyro_clipping')]"""
    fields = []
    for part in defn.split(";"):
        part = part.strip()
        if not part:
            continue
        ftype, name = part.split(" ")
        size = 0
        if "[" in ftype:
            base = ftype[: ftype.index("[")]
            size = int(ftype[ftype.index("[") + 1 : ftype.index("]")])
            ftype = base
        fields.append((ftype, size, name))
    return fields


def pack_msg(msg_type, payload):
    """ULog 统一消息封格式：uint16 msg_size + uint8 msg_type + payload。
    msg_size 只算 payload，不含它自身那 2 字节，也不含 msg_type。"""
    return struct.pack("<HB", len(payload), msg_type) + payload


def flatten(row):
    """允把数组字段写成嵌套元组（如 float[16] output → outputs），这里自动摊平。
    调用点就能写 `add(t, outputs)` 而不必手写 `*outputs`。"""
    out = []
    for v in row:
        if isinstance(v, (list, tuple)):
            out.extend(flatten(v))
        else:
            out.append(v)
    return out


def pack_fields(fields, row):
    """把一行值按字段定义打包。数组字段按元素连续展开。"""
    row = flatten(row)
    out = bytearray()
    i = 0
    for ftype, size, _name in fields:
        code = "<" + UNPACK_CODES[ftype]
        n = size if size > 0 else 1
        for _ in range(n):
            out.extend(struct.pack(code, row[i]))
            i += 1
    return bytes(out)


def ts(n):
    return START_TS + n * STEP


def elapsed(n):
    return n * STEP / 1e6


class LogBuilder:
    def __init__(self, start_ts=START_TS, samples=SAMPLES):
        self.start_ts = start_ts
        self.data = {name: [] for name in TOPICS}
        self.messages = []  # (timestamp, log_level, text)
        self.info = [
            ("char[25]", "sys_name", "PX4"),
            ("uint32_t", "ver_sw", 0x010E0200),  # v1.14.2
            ("char[50]", "ver_sw_release", "v1.14.2"),
            ("uint32_t", "n_cells", CELL_COUNT),
        ]
        self.params = [
            ("MC_ROLLRATE_P", 0.15),
            ("MC_PITCHRATE_P", 0.15),
            ("MPC_TILTMAX_AIR", 45.0),
            ("COM_ARM_WO_GPS", 0),
        ]

    # ---------- 行构造器 ----------

    def add_imu(self, t, clipping, accel_vib):
        self.data["vehicle_imu_status"].append((t, t, clipping[0], clipping[1], clipping[2], accel_vib, accel_vib / 3.0))

    def add_estimator(self, t, innov_flags):
        self.data["estimator_status"].append((t, t, innov_flags, (0.0,) * 24, (0.0, 0.0, 0.0)))

    def add_actuator(self, t, outputs):
        flat = tuple(outputs[i] if i < len(outputs) else 0.0 for i in range(16))
        self.data["actuator_outputs"].append((t, t, len(outputs), flat))

    def add_gps(self, t, fix_type, eph, epv, sats):
        self.data["vehicle_gps_position"].append((t, t, fix_type, eph, epv, sats))

    def add_battery(self, t, voltage, current, cells):
        flat = tuple(cells[i] if i < len(cells) else 0.0 for i in range(CELL_ARRAY_LEN))
        self.data["battery_status"].append((t, t, voltage, current, 0.0, flat))

    def add_manual(self, t, x, y, z, r, valid=True):
        self.data["manual_control_setpoint"].append((t, x, y, z, r, valid))

    # ---------- 写文件 ----------

    def write(self, path):
        buf = bytearray()

        # 文件头：magic(3) + version(1) + timestamp(8) = 16 字节
        buf.extend(HEADER_BYTES)
        buf.extend(struct.pack("B", FILE_VERSION))
        buf.extend(struct.pack("<Q", self.start_ts))
        assert len(buf) == 16

        # 'B' 兼容位：compat[8] + incompat[8] + appended_offsets[3]
        flags = struct.pack("<" + "B" * 8, *([0] * 8))
        flags += struct.pack("<" + "B" * 8, *([0] * 8))
        flags += struct.pack("<" + "Q" * 3, 0, 0, 0)
        buf.extend(pack_msg(MSG_FLAG_BITS, flags))

        # 'F' 字段表
        for name, defn in TOPICS.items():
            payload = bytes(name + ":", "utf-8")
            for ftype, size, fname in parse_fields(defn):
                if size > 0:
                    payload += bytes("%s[%d] %s;" % (ftype, size, fname), "utf-8")
                else:
                    payload += bytes("%s %s;" % (ftype, fname), "utf-8")
            buf.extend(pack_msg(MSG_FORMAT, payload))

        # 'I' 信息消息：key 是 "<type> <name>"
        for vtype, name, value in self.info:
            key = bytes("%s %s" % (vtype, name), "utf-8")
            payload = struct.pack("B", len(key)) + key
            if vtype.startswith("char["):
                payload += bytes(value, "utf-8")
            else:
                payload += struct.pack("<" + UNPACK_CODES[vtype], value)
            buf.extend(pack_msg(MSG_INFO, payload))

        # 'P' 初始参数
        for name, value in self.params:
            vtype = "float" if isinstance(value, float) else "int32_t"
            key = bytes("%s %s" % (vtype, name), "utf-8")
            payload = struct.pack("B", len(key)) + key
            payload += struct.pack("<" + UNPACK_CODES[vtype], value)
            buf.extend(pack_msg(MSG_PARAMETER, payload))

        # 'A' 订阅记录，同时分配 msg_id
        msg_ids = {}
        for mid, name in enumerate(TOPICS):
            msg_ids[name] = mid
            payload = struct.pack("<BH", 0, mid) + bytes(name, "utf-8")
            buf.extend(pack_msg(MSG_ADD_LOGGED, payload))

        # 'D' 数据 + 'L' 机载文本，按时间戳排序写入（ULog 要求单调）
        items = []
        for name, rows in self.data.items():
            fields = parse_fields(TOPICS[name])
            for row in rows:
                payload = struct.pack("<H", msg_ids[name]) + pack_fields(fields, row)
                items.append((row[0], pack_msg(MSG_DATA, payload)))
        for t, level, text in self.messages:
            payload = struct.pack("<BQ", level, t) + bytes(text, "utf-8")
            items.append((t, pack_msg(MSG_LOGGING, payload)))

        items.sort(key=lambda x: x[0])
        for _, chunk in items:
            buf.extend(chunk)

        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "wb") as f:
            f.write(bytes(buf))
        return len(buf)


# ---------------------------------------------------------------- 场景


def scenario_crash_vibration():
    """振动超标 → 削波 → EKF 创新被拒 → 电机饱和 → 侧翻。

    地面真值（写进用例里的就是这几个数）：
      gyro_clipping[0]  0 → 1847
      accel_vibration_metric  3 → 45
      innovation_check_flags  0 → 6（bit1|bit2：拒绝水平速度 + 拒绝高度）
      actuator_outputs.output[1]  1520 → 2000（饱和）
    电源/GPS/操作输入全程正常 —— 这是刻意的：用来验证脚本不会把
    下游代价当成根因，也不会因为 motor 饱和就怀疑飞行员操作。
    """
    log = LogBuilder()
    for n in range(SAMPLES):
        t = ts(n)
        sec = elapsed(n)

        if sec < 20.0:
            # 平静阶段：基线偏移
            vib = 3.0 + 0.4 * math.sin(sec * 1.7)
            clipping = (0, 0, 0)
            innov = 0
            out1 = 1520.0 + 8 * math.sin(sec * 2.1)
        elif sec < 28.0:
            # 振动爬升：二次曲线，让"什么时候越过阈值"在图上清晰可见
            p = (sec - 20.0) / 8.0
            vib = 3.0 + 42.0 * p * p
            clipping = (int(1847 * p * p), 0, int(200 * p * p))
            innov = 2 if sec > 24.0 else 0
            out1 = 1520.0 + 300.0 * p
        else:
            # 失效：EKF 开始拒估计值，1 号通道打到上限
            vib = 45.0 + 1.5 * math.sin(sec * 3.3)
            clipping = (1847, 12, 388)
            innov = 6
            out1 = 2000.0

        log.add_imu(t, clipping, vib)
        log.add_estimator(t, innov)
        outputs = [out1] + [1510.0 + 6 * math.sin(sec + i) for i in range(MOTOR_COUNT - 1)]
        log.add_actuator(t, outputs)

        log.add_gps(t, 3, 0.7 + 0.1 * math.sin(sec), 1.1, 16)
        # 全程轻微压降，但必须停在 3.4V 之上 —— 这份日志里电源不是嫌疑对象，
        # 若它也报欠压，就分不清"脚本抓到根因"还是"脚本见谁咬谁"。
        sag = 0.35 * (sec / 40.0)
        cells = [4.05 - sag - 0.012 * (i % 3) for i in range(CELL_COUNT)]
        log.add_battery(t, sum(cells), 14.0 + 6 * math.sin(sec), cells)

        # 中杆：排除"飞行员拉满"这个解释
        log.add_manual(t, 0.0, 0.0, 0.5, 0.0)

    log.messages = [
        (START_TS + 2_000_000, 6, "Preflight check passed"),
        (START_TS + 4_000_000, 6, "Armed by external means"),
        (START_TS + 26_000_000, 4, "Failsafe: attitude divergence"),
    ]
    return log, {
        "root_cause": "gyro_clipping",
        "accel_vibration_metric": 45.0,
        "gyro_clipping": [1847, 12, 388],
        "innovation_check_flags": 6,
        "expected_severity": "critical",
        "must_not_flag": ["battery_status", "vehicle_gps_position"],
    }


def scenario_healthy():
    """全程正常。存在的唯一目的是验证脚本不乱报。

    最容易被忽略的一类测试：一个只会报 critical 的脚本，
    在 healthy 日志上会输出满屏告警，用起来比重构还累。
    """
    log = LogBuilder()
    for n in range(SAMPLES):
        t, sec = ts(n), elapsed(n)
        vib = 2.6 + 0.5 * math.sin(sec * 1.3)
        log.add_imu(t, (0, 0, 0), vib)
        log.add_estimator(t, 0)
        outputs = [1530.0 + 25 * math.sin(sec * 1.9 + i) for i in range(MOTOR_COUNT)]
        log.add_actuator(t, outputs)
        log.add_gps(t, 3, 0.8, 1.2, 15)
        sag = 0.30 * (sec / 40.0)
        cells = [4.10 - sag - 0.008 * (i % 3) for i in range(CELL_COUNT)]
        log.add_battery(t, sum(cells), 11.0 + 3 * math.sin(sec), cells)
        log.add_manual(t, 0.1 * math.sin(sec), 0.05 * math.sin(sec * 1.3), 0.5, 0.0)

    log.messages = [
        (START_TS + 2_000_000, 6, "Preflight check passed"),
        (START_TS + 38_000_000, 6, "Disarmed"),
    ]
    return log, {
        "root_cause": None,
        "expected_severity": "none",
        "must_not_flag": [
            "vehicle_imu_status",
            "estimator_status",
            "battery_status",
            "vehicle_gps_position",
            "logged_message",
        ],
    }


def scenario_undervoltage():
    """6S 电池被拉到单节 3.05V。

    考验两件事：
      1. 找最差电芯，不是看平均 —— 均值仍有 3.52V（总电压 21.1V，看着挺健康）
      2. 忽略数组里未使用的那 4 个 0.0 —— PX4 恒定写 10 元素数组，
         只填前 n_cells 个。若脚本原样取 min，会把 0 当成最差电芯。
    """
    log = LogBuilder()
    for n in range(SAMPLES):
        t, sec = ts(n), elapsed(n)
        vib = 3.2 + 0.3 * math.sin(sec * 1.1)
        log.add_imu(t, (0, 0, 0), vib)
        log.add_estimator(t, 0)
        outputs = [1540.0 + 20 * math.sin(sec * 1.5 + i) for i in range(MOTOR_COUNT)]
        log.add_actuator(t, outputs)
        log.add_gps(t, 3, 0.9, 1.3, 14)
        log.add_manual(t, 0.0, 0.0, 0.5, 0.0)

        # 2 号电芯（index 2）内阻偏大，大电流下压降远高于其他几个
        drain = sec / 40.0
        cells = [4.10 - 0.5 * drain - (0.0 if i % 3 else 0.02) for i in range(CELL_COUNT)]
        cells[2] = max(3.05, 4.10 - 1.05 * drain - 0.03)  # 老化的一节
        log.add_battery(t, sum(cells), 26.0 + 4 * math.sin(sec), cells)

    log.messages = [
        (START_TS + 2_000_000, 6, "Preflight check passed"),
        (START_TS + 34_000_000, 5, "Battery warns low"),
    ]
    return log, {
        "root_cause": "cell_voltage",
        "worst_cell_index": 2,
        "worst_cell_voltage": 3.05,
        "pack_voltage_end": 21.1,
        "expected_severity": "critical",
        "must_not_flag": ["vehicle_imu_status"],
    }


SCENARIOS = {
    "sample_crash_vibration.ulg": scenario_crash_vibration,
    "sample_healthy.ulg": scenario_healthy,
    "sample_undervoltage.ulg": scenario_undervoltage,
}


def verify(path):
    """读回来确认不是一堆废字节。缺 pyulog 就跳过，不阻塞生成。"""
    try:
        from pyulog import ULog
    except ImportError:
        print("  (跳过校验：未安装 pyulog)")
        return True
    try:
        ulog = ULog(path)
    except Exception as e:
        print("  校验失败：%s" % e)
        return False
    topics = {d.name: len(d.data["timestamp"]) for d in ulog.data_list}
    print("  主题 %d 个，%s" % (len(topics), topics))
    print("  参数 %d 个，机载消息 %d 条" % (len(ulog.initial_parameters), len(ulog.logged_messages)))
    return len(topics) == len(TOPICS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--outdir", default=os.path.join(os.path.dirname(__file__), "..", "assets"))
    ap.add_argument("--verify", action="store_true")
    args = ap.parse_args()

    outdir = os.path.abspath(args.outdir)
    ok = True
    for filename, factory in SCENARIOS.items():
        log, truth = factory()
        path = os.path.join(outdir, filename)
        size = log.write(path)
        print("%s  %6.1f KB" % (filename, size / 1024))
        print("  地面真值: 根因=%s 预期=%s" % (truth["root_cause"], truth["expected_severity"]))
        if args.verify:
            ok = verify(path) and ok

    print("\n下一步：")
    print("  python3 scripts/quick_check.py ../assets/sample_crash_vibration.ulg")
    print("  python3 scripts/quick_check.py ../assets/sample_healthy.ulg")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
