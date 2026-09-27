# ArduPilot .bin（AP_Logger）适配器 —— **本项目唯一认识 ArduPilot 的地方**
#
# 契约见 providers/api.py。格式是**自描述**的：文件开头是一串 FMT 消息，声明每种消息的
# 名字、长度、字段与格式字符——所以解析器按 FMT 表通解，不逐消息类型硬编码；
# MSG/PARM/EV/MODE/GPS 一律按 **FMT 名字**查表，不写死消息 ID（不同固件版本的 ID 会变）。
#
# 分工（与 px4.py 同一条纪律）：
#   · 本文件：怎么从 AP_Logger 字节流里把数据取出来——FMT 解析、格式字符缩放、消息名定位
#   · engine/*.py：与格式无关的机制；契约常量在 api.py
#
# 与 PX4 适配器的两个约定差异（消费方要知情）：
#   · 时基：TimeUS 是开机以来的 µs（与 PX4 同为"开机起"，但两者不共享同一块表）
#   · 列名：TimeUS 在 get_dataset() 里改名为 timestamp（规则与曲线统一写 timestamp；
#     get_dataset_description() 仍给日志原始字段名，那是格式声明）
#
# 数据源核对情况（2026-09-24，36 份 autotest SITL 日志对账，Copter/Plane/Rover）：
#   · EV 事件码 10=ARMED / 11=DISARMED：经 AP_Logger.h 官方源码核对无误
#     （真实 Copter 日志里的 [25, 62] = SET_HOME / EKF_YAW_RESET）；但 autotest Copter
#     日志**不写** ARMED/DISARMED 事件且无 ARM topic → armed 还要回退 STAT.Armed 状态沿
#   · ⚠️ FORMAT_VERSION 参数是 **DataFlash 日志格式版本**（Copter 120 / Plane 13），
#     不是固件版本——绝不可当固件版本回退（踩过，已删）；固件版本从 MSG 横幅 / VER 消息取
#   · 仍未逐字段验证（v1 只解析不应用，应用了才是猜数）：
#     格式字符缩放、FRAME_CLASS 全表（且 Copter/Rover 语境同码不同义）、FMTU 乘子
#   · 消息 Length 字段是否含 3 字节头——已做自校准（见 _calibrate_len_hdr），但兜底逻辑本身要样本验

import struct as _struct

import numpy as np

# 文件头 magic 与 FMT 消息（保留 ID：所有版本都一样，这两个可以写死）。
# 命名带 _APM_ 前缀：构建期各 provider 拼进**同一个命名空间**，顶层名字撞了就是
# 静默互踩（_MAGIC 曾被 px4.py 的同名常量覆盖，探测永远 False）——有守卫拦同名。
_APM_MAGIC = b"\xa3\x95"
_FMT_TYPE = 128
# FMT 消息自身的 payload 恒为 86 字节：Type(1) + Length(1) + Name(4) + Format(16) + Columns(64)
_FMT_PAYLOAD = 86

# 格式字符 → (struct 格式, 字节数)。缩放另见 _SCALED。
# n/N/Z 是定长文本（char[4]/[16]/[64]），用 s 格式整体取，解出来再剥 \x00。
_FMT_CHARS = {
    "b": ("<b", 1),
    "B": ("<B", 1),
    "M": ("<B", 1),  # 飞行模式（uint8）
    "h": ("<h", 2),
    "H": ("<H", 2),
    "i": ("<i", 4),
    "I": ("<I", 4),
    "f": ("<f", 4),
    "d": ("<d", 8),
    "q": ("<q", 8),
    "Q": ("<Q", 8),
    "n": ("4s", 4),
    "N": ("16s", 16),
    "Z": ("64s", 64),
    "c": ("<h", 2),  # int16 × 0.01
    "C": ("<H", 2),  # uint16 × 0.01
    "e": ("<H", 2),  # uint16 × 0.01
    "E": ("<I", 4),  # uint32 × 0.01
    "L": ("<i", 4),  # int32 × 1e-7（经纬度）
}
_SCALED = {"c": 0.01, "C": 0.01, "e": 0.01, "E": 0.01, "L": 1e-7}

# 格式字符 → dtype 名（get_field_dtype 用；文本给 str）
_FMT_DTYPES = {
    "b": "int8",
    "B": "uint8",
    "M": "uint8",
    "h": "int16",
    "H": "uint16",
    "i": "int32",
    "I": "uint32",
    "f": "float32",
    "d": "float64",
    "q": "int64",
    "Q": "uint64",
    "c": "int16",
    "C": "uint16",
    "e": "uint16",
    "E": "uint32",
    "L": "int32",
    "n": "str",
    "N": "str",
    "Z": "str",
}

# 日志级别的数字语义与 PX4 对齐（3=ERROR 4=WARNING 6=INFO），名字给固定的英文串：
# PX4 的 level_name 来自 facts.yaml（那份码表是 PX4 的），APM 不借用别人的码表
_LEVEL_NAMES = {3: "ERROR", 4: "WARNING", 6: "INFO"}

# FRAME_CLASS → 机型。**上游权威源码**（AP_Motors / AP_Parameters）：
#  1=Quad 2=Tri 3=Octa 4=Coax 5=Hexa 6=Y6 7=Heli 8=OctaQuad
#  9=Single 10=HeliDual 11=Dodeca 12=Deca
# Plane / Rover 没有 FRAME_CLASS 参数，由 _read_vehicle_type() 按固件名识别。
_FRAME_CLASS_MAP = {
    1: "quad",
    2: "tri",
    3: "octa",
    4: "coax",
    5: "hexa",
    6: "y6",
    7: "heli",
    8: "octa_quad",
    9: "single",
    10: "heli_dual",
    11: "dodeca",
    12: "deca",
}

# 类别名 → 精确名集合。规则写 vehicle: [copter] 时引擎展开匹配。
_VEHICLE_CATEGORIES = {
    "copter": {"quad", "hexa", "octa", "tri", "coax", "y6", "heli", "heli_dual", "octa_quad", "single", "dodeca", "deca"},
    "plane": {"plane"},
    "rover": {"rover"},
}

# EV 事件码 → 解锁/上锁（待真实样本核对，见文件头）
_EV_ARMED = 10
_EV_DISARMED = 11


def _text(raw):
    """定长 char[N] → 去掉 \x00 与首尾空白的文本。"""
    return raw.decode("ascii", "replace").rstrip("\x00").strip()


class ApmProvider:
    """ArduPilot .bin 适配器。契约见 providers/api.py。"""

    log_type = "ardupilot-bin"
    vehicle_categories = _VEHICLE_CATEGORIES

    def __init__(self, raw, facts_cfg):
        # facts_cfg 是 PX4 的数据配置（构建期只有一份 facts.yaml）——本适配器**不读它**，
        # 码表都在本文件里（待迁 knowledge/ardupilot/）。参数保留只为与工厂签名一致。
        # 迁移未完成的原因不是懒：动这里的任何一条常量都会让
        # tools/engine/guard_apm_parser_version.py 的 AST 指纹变红，必须同步升
        # parser_version() 并重冻基线。等接线改动一起做，别单独动。
        self._cfg = facts_cfg or {}
        self.raw = bytes(raw)
        self._parse_errors = 0  # 认不出的字节段数（has_file_corruption 的判据）
        self._parse()

    # ================= 解析 =================

    def _parse(self):
        """两遍扫描：先收 FMT 声明，再按格式解码。都从文件头顺序走，认不出就重同步到下一个 magic。"""
        raw, n = self.raw, len(self.raw)
        by_id, by_name = {}, {}
        self._len_hdr = 3  # 消息 Length 字段是否含 3 字节头：第一条 FMT 解出来后校准

        # ---- 第一遍：FMT 声明（payload 恒 86 字节，不依赖长度约定）----
        off = 0
        while off + 3 <= n:
            if raw[off] != _APM_MAGIC[0] or raw[off + 1] != _APM_MAGIC[1]:
                nxt = raw.find(_APM_MAGIC, off + 1)
                if nxt == -1:
                    break
                off = nxt
                continue
            mtype = raw[off + 2]
            if mtype == _FMT_TYPE:
                if off + 3 + _FMT_PAYLOAD > n:
                    self._parse_errors += 1
                    break
                f = self._parse_fmt_row(raw[off + 3 : off + 3 + _FMT_PAYLOAD])
                if f is not None:
                    by_id[f["id"]] = f
                    by_name[f["name"]] = f
                    if f["name"] == "FMT":
                        # 自校准：FMT 自己的 Length 字段值 - 86 = 头部长度（89 → 含头；86 → 不含）
                        self._len_hdr = 3 if f["len"] > _FMT_PAYLOAD else 0
                off += 3 + _FMT_PAYLOAD
                continue
            f = by_id.get(mtype)
            if f is None or f.get("unsupported"):
                # 还没见到定义（或解不了的消息）：只能按字节找下一个头
                nxt = raw.find(_APM_MAGIC, off + 3)
                if nxt == -1:
                    break
                off = nxt
                continue
            plen = f["len"] - self._len_hdr
            if plen <= 0 or off + 3 + plen > n:
                self._parse_errors += 1
                break
            off += 3 + plen

        self._fmt_by_id, self._fmt_by_name = by_id, by_name

        # ---- 第二遍：按格式解码数据消息 ----
        rows = {}  # name → list[tuple]（顺序 = fmt["fields"]）
        walked_ok = True
        off = 0
        while off + 3 <= n:
            if raw[off] != _APM_MAGIC[0] or raw[off + 1] != _APM_MAGIC[1]:
                nxt = raw.find(_APM_MAGIC, off + 1)
                if nxt == -1:
                    walked_ok = False
                    break
                off = nxt
                continue
            mtype = raw[off + 2]
            f = by_id.get(mtype)
            if f is None or f.get("unsupported"):
                if f is None:
                    self._parse_errors += 1
                nxt = raw.find(_APM_MAGIC, off + 3)
                if nxt == -1:
                    walked_ok = False
                    break
                off = nxt
                continue
            plen = f["len"] - self._len_hdr
            if plen <= 0 or off + 3 + plen > n:
                self._parse_errors += 1
                walked_ok = False
                break
            payload = raw[off + 3 : off + 3 + plen]
            off += 3 + plen
            if mtype in (_FMT_TYPE, 129):  # FMT 已收；FMTU 只解析不应用（见文件头）
                continue
            row = self._decode_row(f, payload)
            if row is None:
                self._parse_errors += 1
                continue
            rows.setdefault(f["name"], []).append(row)
        self._rows = rows
        self._walked_ok = walked_ok

        # ---- 行 → 列（TimeUS 改名 timestamp；见文件头的约定差异说明）----
        self._cols = {}
        for name, fmt in by_name.items():
            rws = rows.get(name)
            if not rws:
                continue
            cols = {}
            for i, fld in enumerate(fmt["fields"]):
                key = "timestamp" if fld == "TimeUS" else fld
                cols[key] = np.array([r[i] for r in rws])
            self._cols[name] = cols

        # ---- 时间基准与数据质量 ----
        t_min, t_max = None, None
        restart = 0
        for cols in self._cols.values():
            ts = cols.get("timestamp")
            if ts is None or len(ts) == 0:
                continue
            a = np.asarray(ts, dtype=np.int64)
            t_min = int(a[0]) if t_min is None else min(t_min, int(a[0]))
            t_max = int(a[-1]) if t_max is None else max(t_max, int(a[-1]))
            if len(a) > 10 and int(np.count_nonzero(np.diff(a) < 0)) > 0:
                restart += 1
        self.t0_us = t_min or 0
        self.t_max_us = t_max if t_max is not None else self.t0_us
        self.duration_s = round((self.t_max_us - self.t0_us) / 1e6, 1) if t_min is not None else None
        self.restart_topics = restart

        self._read_params()
        self._read_version()
        self._read_vehicle_type()
        self._read_armed()
        self._read_home()

    def _parse_fmt_row(self, payload):
        """FMT payload（86B）→ 声明 {id, len, name, format, fields}。格式字符解不了标记 unsupported。"""
        try:
            mtype = payload[0]
            length = payload[1]
            name = _text(payload[2:6])
            fstr = _text(payload[6:22])
            fields = [_text(c) for c in payload[22:86].split(b",")]
            fields = [f for f in fields if f]
        except Exception:
            self._parse_errors += 1
            return None
        if not name or len(fstr) != len(fields):
            # 格式串与列数对不上：这份 FMT 没法可靠解码，标记后跳过它的消息（不硬猜）
            self._parse_errors += 1
            return None
        unsupported = any(ch not in _FMT_CHARS for ch in fstr)
        return {
            "id": int(mtype),
            "len": int(length),
            "name": name,
            "format": fstr,
            "fields": fields,
            "unsupported": unsupported,
        }

    def _decode_row(self, fmt, payload):
        """按格式声明解一行 → tuple（顺序与 fmt["fields"] 一致）。解不了返回 None。"""
        out = []
        off = 0
        try:
            for ch, fld in zip(fmt["format"], fmt["fields"]):
                sf, size = _FMT_CHARS[ch]
                chunk = payload[off : off + size]
                if len(chunk) < size:
                    return None
                # _FMT_CHARS 的 sf 已带字节序前缀（"<Q"）；字符串格式（"16s"）无需前缀。
                # 别再拼一个 "<"——会变成 "<<Q"，struct 直接报 bad char（静默吞掉后整行解不出）
                (v,) = _struct.unpack(sf, chunk)
                off += size
                if sf.endswith("s"):
                    out.append(_text(v))
                elif ch in _SCALED:
                    out.append(float(v) * _SCALED[ch])
                else:
                    out.append(v)
        except Exception:
            return None
        return tuple(out)

    def _read_params(self):
        """PARM 消息：首现值 = 初始参数，后续不同值 = 运行中变更。"""
        params, changed = {}, []
        for row in self._iter_named("PARM"):
            rec = dict(zip(self._fmt_by_name.get("PARM", {}).get("fields", []), row))
            name = str(rec.get("Name") or "")
            if not name:
                continue
            value = rec.get("Value")
            t_us = rec.get("TimeUS")
            if name not in params:
                params[name] = value
            elif params[name] != value:
                t_sec = round((int(t_us) - self.t0_us) / 1e6, 2) if t_us is not None else None
                changed.append({"tSec": t_sec, "name": name, "value": value})
                params[name] = value
        self._params = params
        self._changed = changed

    def _read_version(self):
        """固件版本：MSG 横幅 / VER 消息。

        真实横幅长这样：`ArduCopter V4.8.0-dev (665c0dee)`——正则要兼容 `-dev` 之类的
        后缀与可选哈希。**绝不回退 FORMAT_VERSION 参数**：那是 DataFlash 日志格式版本
        （Copter 120 / Plane 13），不是固件版本，拿它当版本号是把"容器格式"读成"固件"。
        """
        import re as _re

        self.fw = {"major": None, "minor": None, "patch": None, "git": "", "vehicle": ""}
        texts = [
            str(dict(zip(self._fmt_by_name.get("MSG", {}).get("fields", []), r)).get("Message") or "")
            for r in self._iter_named("MSG")
        ]
        if self._fmt_by_name.get("VER"):
            texts += [
                " ".join(str(v) for v in dict(zip(self._fmt_by_name["VER"].get("fields", []), r)).values())
                for r in self._iter_named("VER")
            ]
        for text in texts:
            # 车型名后的 `V<major>.<minor>.<patch>`；后缀（-dev 等）与 (hash) 都可选
            m = _re.search(r"\bV(\d+)\.(\d+)\.(\d+)(?:[-.\w]*)?(?:\s*\((\w+)\))?", text)
            if m:
                self.fw = {
                    "major": int(m.group(1)),
                    "minor": int(m.group(2)),
                    "patch": int(m.group(3)),
                    "git": m.group(4) or "",
                    "vehicle": text.split(" ")[0],
                }
                break
        self.fw_minor = self.fw["minor"]
        self.fw_label = (
            "%d.%d.%d" % (self.fw["major"], self.fw["minor"], self.fw["patch"])
            if self.fw["minor"] is not None
            else "未知（未解析到版本）"
        )
        self.fw_display = self.fw_label if self.fw["minor"] is not None else "未知"

    def _read_vehicle_type(self):
        """机型：固件名优先（Plane/Rover 无 FRAME_CLASS），再回退 FRAME_CLASS 映射。"""
        fw_name = self.fw.get("vehicle", "")
        if "Plane" in fw_name:
            self.vehicle_type = "plane"
            self.airframe_id = None
            return
        if "Rover" in fw_name:
            self.vehicle_type = "rover"
            self.airframe_id = None
            return
        fc = self._params.get("FRAME_CLASS")
        try:
            fc = int(fc)
        except (TypeError, ValueError):
            fc = None
        self.airframe_id = fc
        if fc is None:
            self.vehicle_type = "unknown"
        elif fc in _FRAME_CLASS_MAP:
            self.vehicle_type = _FRAME_CLASS_MAP[fc]
        else:
            self.vehicle_type = "unknown(%d)" % fc

    def _read_armed(self):
        """armed 区间：EV 事件的 10/11（码值经 AP_Logger.h 核对）→ STAT.Armed 状态沿回退。

        autotest Copter 日志不写 ARMED/DISARMED 事件、也无 ARM/STAT——那就如实给空，
        不编造；Plane 有低频 STAT.Armed（0/1 状态量），取跳变沿切区间。
        """
        intervals = []
        start = None
        for row in self._iter_named("EV"):
            rec = dict(zip(self._fmt_by_name.get("EV", {}).get("fields", []), row))
            t_us = rec.get("TimeUS")
            if t_us is None:
                continue
            code = rec.get("Id")
            if code == _EV_ARMED and start is None:
                start = int(t_us)
            elif code == _EV_DISARMED and start is not None:
                intervals.append((start, int(t_us)))
                start = None
        if start is not None:
            intervals.append((start, None))
        if not intervals:
            # EV 没给：STAT.Armed 状态沿（前值 0 → 1 是解锁，1 → 0 是上锁）
            stat = self._fmt_by_name.get("STAT")
            if stat and "Armed" in stat.get("fields", []):
                prev = None
                seg_start = None
                for row in self._iter_named("STAT"):
                    rec = dict(zip(stat.get("fields", []), row))
                    t_us = rec.get("TimeUS")
                    if t_us is None:
                        continue
                    cur = 1 if rec.get("Armed") else 0
                    if prev is not None and cur != prev:
                        if cur == 1:
                            seg_start = int(t_us)
                        elif seg_start is not None:
                            intervals.append((seg_start, int(t_us)))
                            seg_start = None
                    prev = cur
                if seg_start is not None:
                    intervals.append((seg_start, None))
        self.armed_intervals = intervals
        total = sum(((e if e is not None else self.t_max_us) - s) for s, e in intervals)
        self.armed_duration_s = round(total / 1e6, 1)

    def _read_home(self):
        """Home 点：GPS 首个有效定位（Status>=3、坐标合法非零）。APM 没有 ref 原点概念，ref 给 None。"""
        self.home_position = None
        for row in self._iter_named("GPS"):
            rec = dict(zip(self._fmt_by_name.get("GPS", {}).get("fields", []), row))
            lat, lon = rec.get("Lat"), rec.get("Lng")
            alt = rec.get("Alt")
            status = rec.get("Status")
            if None in (lat, lon, alt) or (status is not None and int(status) < 3):
                continue
            if abs(lat) <= 90 and abs(lon) <= 180 and not (abs(lat) < 1e-7 and abs(lon) < 1e-7):
                self.home_position = {"lat": float(lat), "lon": float(lon), "alt": float(alt), "source": "GPS"}
                break

    def _iter_named(self, name):
        return self._rows.get(name, [])

    # ================= 数据访问层 =================

    def platform_label(self):
        """报告头里的固件族名（人读的名字，与 `log_type` 那个机器标识不是一个东西）。"""
        return "ArduPilot"

    def parser_version(self):
        """自研解析器（不依赖 pymavlink）：版本号在这里维护，进报告头的 parserVersion。"""
        return "apm-bin-parser/1.3.0"  # 1.3.0：ARMED_INTERVALS 迁移到引擎注入；builtin_variables() 瘦身；新增 get_mode_present

    def get_topic_meta(self):
        out = []
        for name, fmt in sorted(self._fmt_by_name.items()):
            cols = self._cols.get(name)
            if not cols:
                continue  # 声明了但一条都没录到（或解不了）：不进 meta
            ts = cols.get("timestamp")
            out.append(
                {
                    "topic": name,
                    "instance": 0,
                    "n": int(len(ts)) if ts is not None else 0,
                    "fields": [{"name": k, "dtype": str(v.dtype)} for k, v in cols.items() if k != "timestamp"],
                }
            )
        return out

    def get_dataset(self, topic, instance=0):
        """某消息类型的原样列（TimeUS 已改名 timestamp，见文件头）。APM 无多实例：instance≠0 给 None。"""
        if instance not in (0, slice(None, None), None):
            return None
        cols = self._cols.get(topic)
        return dict(cols) if cols else None

    def get_series(self, ref, instance=slice(None, None), alias=None):
        """按 'topic.field' 取一条序列；取不到一律返回 None。APM 单实例，instance 只认 0 / 全部。

        FMT 声明为文本列（n/N/Z）的字段直接返回原始字符串序列，不做 float 转换；
        数值列仍走 np.asarray(v, dtype=float)。"""
        if isinstance(instance, int) and instance != 0:
            return None
        topic, _, field = ref.partition(".")
        cols = self._cols.get(topic)
        if not cols:
            return None
        aliases = [alias] if isinstance(alias, str) else list(alias or [])
        for name in [field] + aliases:
            v = cols.get(name)
            if v is None or len(v) == 0:
                continue
            dtype = self.get_field_dtype(topic, name)
            if dtype == "str":
                return v  # 文本列：直接返回，不做 float 转换
            try:
                return np.asarray(v, dtype=float)
            except (TypeError, ValueError):
                return None
        return None

    def get_first_existing_column(self, topic, names):
        cols = self.get_dataset(topic, 0)
        if not cols:
            return None
        for nm in names if isinstance(names, (list, tuple)) else [names]:
            if nm in cols:
                return cols[nm]
        return None

    def has_topic(self, name):
        return name in self._cols

    def match_version(self, spec):
        cur = None
        if self.fw_minor is not None:
            cur = (self.fw["major"] if self.fw["major"] is not None else 0, self.fw_minor)
        return match_version_spec(cur, spec)

    def get_info_dict(self):
        """APM 日志没有键值信息消息：如实给空二元组（版本/身份走 get_report_facts 与专用方法）。"""
        return ({}, {})

    def get_initial_parameters(self):
        return dict(self._params)

    def get_logged_events(self, t_start=None, t_end=None, level=None, pattern=None):
        """MSG 文本 + ERR 错误合成的时间轴。MSG 无级别给 INFO；ERR 给 ERROR（子系统和码值原样进文本）。

        TimeUS 缺失的消息 tSec 给 None——如实说"不知道几点"，不编 0。
        """
        out = []
        for row in self._iter_named("MSG"):
            rec = dict(zip(self._fmt_by_name.get("MSG", {}).get("fields", []), row))
            t_us = rec.get("TimeUS")
            out.append(
                {
                    "tSec": round((int(t_us) - self.t0_us) / 1e6, 2) if t_us is not None else None,
                    "message": str(rec.get("Message") or "").strip(),
                    "level": 6,
                    "level_name": _LEVEL_NAMES[6],
                }
            )
        err_fields = self._fmt_by_name.get("ERR", {}).get("fields", [])
        for row in self._iter_named("ERR"):
            rec = dict(zip(err_fields, row))
            t_us = rec.get("TimeUS")
            out.append(
                {
                    "tSec": round((int(t_us) - self.t0_us) / 1e6, 2) if t_us is not None else None,
                    "message": "ERR subsys=%s code=%s" % (rec.get("Subsys"), rec.get("ECode")),
                    "level": 3,
                    "level_name": _LEVEL_NAMES[3],
                }
            )
        out.sort(key=lambda m: (m["tSec"] is None, m["tSec"] if m["tSec"] is not None else 0))
        if t_start is not None:
            out = [m for m in out if m["tSec"] is not None and m["tSec"] >= t_start]
        if t_end is not None:
            out = [m for m in out if m["tSec"] is not None and m["tSec"] <= t_end]
        if level is not None:
            lv = set(level) if isinstance(level, (list, tuple)) else {level}
            out = [m for m in out if m["level"] in lv]
        if pattern:
            out = [m for m in out if str(pattern).lower() in m["message"].lower()]
        return out

    def builtin_variables(self):
        """内置变量表。**每次返回新 dict**（引擎会往里写 compute 的输出）。

        键一律大写；APM 给不出的值给 None / 空串（不编值）。"""
        home = self.home_position or {}
        return {
            "VEHICLE": self.vehicle_type,
            "DURATION_S": self.duration_s if self.duration_s is not None else 0,
            "ARMED_S": self.armed_duration_s,
            "T0_US": self.t0_us,
            "DROPOUT_MS": 0,  # .bin 没有丢包记录的概念：给 0，不装作查过
            # ---- 知识引擎内置变量 ----
            "SYS_UUID": "",  # v1 无来源（APM 的 UID 在 INFO 多值消息里，解析待真实样本）
            "AIRFRAME_ID": self.airframe_id,
            "HOME_LAT": home.get("lat"),
            "HOME_LON": home.get("lon"),
            "HOME_ALT": home.get("alt"),
            "SW_VER": self.fw_label,
            "SW_VER_HASH": self.fw["git"],
            "HW_VER": "",  # 板名在 MSG "Frame: ..." 文本里，格式不保证，v1 不猜
            "HW_VER_SUBTYPE": "",
            "FLIGHT_TIME_S": None,  # 累计飞行时长 v1 无对应参数
        }

    def get_report_facts(self):
        """报告头的离散事实。键与 PX4 版本保持同一套（前端按同一张表渲染）。"""
        facts = {
            "durationSec": self.duration_s if self.duration_s is not None else 0,
            "vehicleType": self.vehicle_type,
            "firmware": self.fw_label,
            "firmwareDisplay": self.fw_display,
            "armedDurationSec": self.armed_duration_s,
            "phases": [],
            "dropoutTotalMs": 0,
        }
        if self.fw["git"]:
            facts["verSw"] = self.fw["git"]
        if self.airframe_id is not None:
            facts["airframeId"] = self.airframe_id
        return facts

    # ================= 知识引擎查询 API =================

    def get_start_timestamp(self):
        return int(self.t0_us)

    def get_last_timestamp(self):
        return int(self.t_max_us)

    def get_time_bounds(self):
        return {
            "start_us": int(self.t0_us),
            "end_us": int(self.t_max_us),
            "duration_s": self.duration_s,
            "has_wraparound": self.restart_topics > 0,
        }

    def get_dataset_description(self, topic=None):
        """FMT 表就是格式声明：含这份日志没录到的消息（声明在、数据没来）。"""

        def one(fmt):
            return {
                "name": fmt["name"],
                "fields": [{"name": fn, "type": ch} for ch, fn in zip(fmt["format"], fmt["fields"])],
            }

        if topic is not None:
            fmt = self._fmt_by_name.get(topic)
            return one(fmt) if fmt is not None else None
        return {name: one(fmt) for name, fmt in self._fmt_by_name.items()}

    def get_field_dtype(self, topic, field):
        fmt = self._fmt_by_name.get(topic)
        if fmt is None:
            return None
        for ch, fn in zip(fmt["format"], fmt["fields"]):
            if fn == field:
                return _FMT_DTYPES.get(ch)
        return None

    def get_field_sizeof(self, topic, field):
        fmt = self._fmt_by_name.get(topic)
        if fmt is None:
            return None
        for ch, fn in zip(fmt["format"], fmt["fields"]):
            if fn == field:
                size = _FMT_CHARS.get(ch)
                return int(size[1]) if size is not None else None
        return None

    def get_field_unit(self, topic, field):
        """FMTU 里有单位声明但乘子/单位表没核对（文件头）：给 None，不用猜的数冒充。"""
        return None

    def get_changed_parameters(self):
        return list(self._changed)

    def get_home_position(self):
        return dict(self.home_position) if self.home_position else None

    def get_ref_position(self):
        """APM 日志没有局部 NED 参考原点的等价物：如实 None。"""
        return None

    def get_mode_changed(self):
        """MODE 消息切段（µs）。APM 没有 nav_state 数值轴：nav_state 给 -1，mode 用日志原文。"""
        segs = []
        last_mode, seg_start, seg_end = None, None, None
        for row in self._iter_named("MODE"):
            rec = dict(zip(self._fmt_by_name.get("MODE", {}).get("fields", []), row))
            t_us = rec.get("TimeUS")
            mode = str(rec.get("Mode") or rec.get("CMode") or rec.get("ModeNum") or "")
            if t_us is None or not mode:
                continue
            t_us = int(t_us)
            if mode != last_mode:
                if last_mode is not None:
                    segs.append(
                        {
                            "t_start_us": seg_start,
                            "t_end_us": t_us,
                            "nav_state": -1,
                            "mode": last_mode,
                            "armed": self._armed_at(seg_start),
                        }
                    )
                last_mode, seg_start = mode, t_us
            seg_end = t_us
        if last_mode is not None:
            segs.append(
                {
                    "t_start_us": seg_start,
                    "t_end_us": seg_end or seg_start,
                    "nav_state": -1,
                    "mode": last_mode,
                    "armed": self._armed_at(seg_start),
                }
            )
        return segs

    def get_mode_present(self):
        """日志里出现过的所有模式名（用于 conditions.mode 匹配）。"""
        modes = set()
        for row in self._iter_named("MODE"):
            rec = dict(zip(self._fmt_by_name.get("MODE", {}).get("fields", []), row))
            mode = str(rec.get("Mode") or rec.get("CMode") or rec.get("ModeNum") or "")
            if mode:
                modes.add(mode)
        return sorted(modes)

    def _armed_at(self, t_us):
        """时刻是否落在 armed 区间内（MODE 段没有 armed 字段，用区间折算）。"""
        for s, e in self.armed_intervals:
            if s <= t_us and (e is None or t_us < e):
                return True
        return False

    def get_armed_changed(self):
        """解锁/上锁区间（µs）。end 不会是 None：日志截止就用最后时间戳封口。"""
        return [{"t_start_us": int(s), "t_end_us": int(e if e is not None else self.t_max_us)} for s, e in self.armed_intervals]

    def get_firmware_version(self):
        return self.fw_label

    def get_version_info(self):
        if self.fw["minor"] is None:
            return None
        return (self.fw["major"], self.fw["minor"], self.fw["patch"], None)

    def get_version_info_str(self):
        return self.fw_display

    def get_vehicle_identity(self):
        return {
            "vehicle_type": self.vehicle_type,
            "uid": None,
            "hardware": None,
            "hardware_subtype": None,
            "airframe_id": self.airframe_id,
            "ver_sw_branch": None,
        }

    def get_log_integrity(self):
        """.bin 没有丢包记录：n_gaps/total 给 0；完整性看"有没有走到文件尾"与解析错误数。"""
        return {
            "total_dropout_ms": 0,
            "n_gaps": 0,
            "gaps": [],
            "end_reached": bool(self._walked_ok),
            "restart_topics": self.restart_topics,
            "has_file_corruption": self._parse_errors > 0,
        }

    def has_file_corruption(self):
        return self._parse_errors > 0

    def is_log_ok(self):
        """日志完整性：文件无损坏 且 解析走到文件尾。"""
        return not self.has_file_corruption() and self._walked_ok

    # ================= 可选能力 ================

    def get_message_type_counts(self):
        """按 FMT 名计数（.bin 按帧走，天然自描述）。走到尾 = walked_ok。"""
        counts = {name: len(rows) for name, rows in self._rows.items()}
        return counts, self._walked_ok, 0, len(self.raw)

    def get_flight_track(self, max_points=None):
        """地图轨迹：GPS 消息（Status>=3、坐标合法非零），等距抽样。取不到给 error + 原因。"""
        cols = self._cols.get("GPS")
        if not cols:
            return {
                "title": "轨迹",
                "legend": True,
                "tracks": [],
                "error": "这份日志里没有 GPS 消息",
                "errorReasons": ["日志里没有名为 GPS 的消息类型"],
            }
        lat, lon = cols.get("Lat"), cols.get("Lng")
        alt, status = cols.get("Alt"), cols.get("Status")
        ts = cols.get("timestamp")
        if lat is None or lon is None or alt is None or ts is None:
            missing = "/".join(nm for nm, v in (("Lat", lat), ("Lng", lon), ("Alt", alt), ("timestamp", ts)) if v is None)
            return {
                "title": "轨迹",
                "legend": True,
                "tracks": [],
                "error": "GPS 消息缺坐标字段（%s）" % missing,
                "errorReasons": ["GPS 缺 %s 列" % missing],
            }
        lat = np.asarray(lat, dtype=float)
        lon = np.asarray(lon, dtype=float)
        alt = np.asarray(alt, dtype=float)
        ts = np.asarray(ts, dtype=np.int64)
        valid = np.isfinite(lat) & np.isfinite(lon) & np.isfinite(alt)
        valid &= (np.abs(lat) <= 90.0) & (np.abs(lon) <= 180.0)
        valid &= ~((np.abs(lat) < 1e-7) & (np.abs(lon) < 1e-7))
        if status is not None:
            valid &= np.asarray(status, dtype=float) >= 3  # 3 = 3D fix（MAVLink GPS_FIX_TYPE）
        idx_valid = np.nonzero(valid)[0]
        if len(idx_valid) < 2:
            return {
                "title": "轨迹",
                "legend": True,
                "tracks": [],
                "error": "GPS %d 个采样里只有 %d 个有效定位（要 Status>=3、坐标非 0 非 NaN）" % (len(ts), len(idx_valid)),
                "errorReasons": ["有效定位不足"],
            }
        limit = int(max_points or 1500)
        step = max(1, int(np.ceil(len(idx_valid) / limit)))
        idx = [int(i) for i in idx_valid[::step]]
        return {
            "title": "轨迹",
            "legend": True,
            "tracks": [
                {
                    "label": "gps",
                    "t": [round(int(ts[i]) / 1e6, 2) for i in idx],
                    "lat": [float(lat[i]) for i in idx],
                    "lon": [float(lon[i]) for i in idx],
                    "alt": [float(alt[i]) for i in idx],
                    "fullCount": int(len(idx_valid)),
                    "dropped": int(len(ts) - len(idx_valid)),
                }
            ],
        }

    def report_materials(self):
        """报告页原料。形态与 PX4 版本对齐（前端同一张表渲染）：能给的给，给不了给空。"""
        counts, walked_ok, _off, file_size = self.get_message_type_counts()
        return {
            "sysInfo": {},
            "infoDict": [],
            "msgTypeStats": [
                {"code": name, "name": name, "en": "", "desc": "", "count": n} for name, n in sorted(counts.items())
            ],
            "msgTypeWalkOk": bool(walked_ok),
            "msgTypeWalkedBytes": 0,
            "fileSizeBytes": int(file_size),
            "messages": self.get_logged_events(),
            "messagesMulti": [],
            "dropouts": [],
            "params": {str(k): v for k, v in self._params.items()},
            "defaultParams": {},
            # PARM 没有"默认值"机制：前端要按 False 处理（「没记录」≠「与默认一致」）
            "defaultParamsKnown": False,
            "changedParams": self.get_changed_parameters(),
            "phases": [
                {
                    "startSec": round(seg["t_start_us"] / 1e6, 2),
                    "endSec": round(seg["t_end_us"] / 1e6, 2),
                    "navState": seg["nav_state"],
                    "mode": seg["mode"],
                    "armed": seg["armed"],
                }
                for seg in self.get_mode_changed()
            ],
        }


def _is_apm(raw):
    return bytes(raw[:2]) == _APM_MAGIC


def _make_apm(raw, facts_cfg):
    return ApmProvider(raw, facts_cfg)


FORMATS.append((_is_apm, _make_apm, "ArduPilot .bin（AP_Logger）", ApmProvider.log_type))
