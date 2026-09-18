# PX4 .ulg（ULog）适配器 —— **本项目唯一认识 PX4 的地方**
#
# 契约见 providers/api.py。引擎（rule_engine.py / operators.py / report_data.py）不认识
# topic 名、字段名、info 键名、码值，只认这份契约给的东西；要加一种日志格式（ArduPilot .bin）
# 就是再加一个这样的文件，引擎一行不改。
#
# 分工（别混）：
#   · 本文件：怎么从 PX4 日志里把数据取出来——字段名、位解码、版本候选、异常回退、载具身份……
#   · knowledge/px4/facts.yaml：随上游变的**纯数据**（码表、文案、展示口径、规则元数据）
#   · engine/*.py：与格式无关的机制
#
# 注意本文件是**文本拼接**进产物里的（没有 import 机制）：直接用 api.py 的
# FORMATS / check_provider，以及 rule_engine.py 注入的那份数据配置（FACTS，由 open_log 传进来）。
# 这里**别写出构建期那四个哨兵名**（两下划线夹的名字，如 rules/facts/单位表/KB 的占位符原文）：
# 拼接后 JS 的 replace 只换第一处，注释里先出现一次就会把真正的赋值漏掉、浏览器直接报 NameError
# （构建期有"每个哨兵恰好一次"的护栏，写进去就构建失败）。

import io as _io
import re as _re

import numpy as np
import pyulog
from pyulog import ULog

# 解锁判定的码值：PX4 vehicle_status.arming_state 的 ARMING_STATE_ARMED
# （0=init 1=standby 2=armed 3=standby_error 4=shutdown）
_ARMING_STATE_ARMED = 2

# ULog 文件头：magic 'ULog' + 版本字节。用 magic 判格式，不用扩展名（上传的文件名不可信）
_MAGIC = b"ULog"

# 软件版本展示的类型码后缀（对齐 Flight Review 的 `_format_sw_version`）。
# **别凭直觉改**：只有类型码 0（未打标签的开发版）才附 git 短哈希，alpha/beta/RC 不附。
_RELEASE_TYPE_SUFFIX = {64: "-alpha", 128: "-beta", 192: "-rc", 255: ""}

# 地图轨迹的取数**声明**（读哪个 topic 的哪几列、各按什么量纲换算）在
# knowledge/px4/plot/track.yml —— 它按「要画什么、从哪几列画」归在 plot/ 下，
# 构建期并进引擎内联的那份数据配置（FACTS，见 rule_engine.py），这里从 `self._cfg["track"]` 读。
# **解析逻辑留在本文件**（get_flight_track()）：按顺序取第一个存在的候选、剔未定位点、等距抽样——
# 这些是分支，写进 YAML 只能再造一门小语言（见 track.yml 的说明）。

# 列名里像经纬度／高度的：**关键词必须独立成段**（`^` / `.` / `_` 起，`.` / `_` / `$` 止）。
# 不能用裸子串——`relative_test_ratio`、`accelerometer_timestamp_relative` 里都含 "lat"，
# 于是 `estimator_selector_status` / `sensor_combined` 会被列成"带经纬度字段的 topic"，
# 而它们跟坐标毫无关系。`alt` 同理：`mode_req_local_alt`、`fd_alt` 是**布尔标志**，不是高度。
# 这类"听起来合理但是错的"输出正是本节要消灭的东西（见 CLAUDE.md §6.8）。
# 分隔符带上 `.`：嵌套字段写成 `previous.lat` / `current.lon`（position_setpoint_triplet）。
_LATLON_FIELD_RE = _re.compile(r"(^|[._])(latitude|longitude|lng|lat|lon)([._]|$)")
_ALT_FIELD_RE = _re.compile(r"(^|[._])(altitude|alt)([._]|$)")


def _latlon_fields(columns):
    """列名里像**经纬度**的。

    「这份日志到底有没有坐标」只该看经纬度：高度到处都有（气压计、EKF、失效保护标志位），
    把它们算进来会让对照物里混进一堆与轨迹无关的 topic，反而看不出真答案。
    """
    return [c for c in columns if _LATLON_FIELD_RE.search(str(c).lower())]


def _coord_like_fields(columns):
    """经纬度或高度——「这个 topic 能不能给出坐标」的宽判据（`_one_track` 的缺字段文案用）。

    那里说的是"这个 topic 的坐标相关字段实际叫什么"，高度是轨迹三轴之一，该算。
    """
    return [c for c in columns if _LATLON_FIELD_RE.search(str(c).lower()) or _ALT_FIELD_RE.search(str(c).lower())]


class Px4Provider:
    """PX4 .ulg 适配器。契约见 providers/api.py。"""

    log_type = "px4-ulog"

    def __init__(self, raw, facts_cfg):
        self._cfg = facts_cfg or {}
        self.raw = bytes(raw)
        self.ulog = ULog(_io.BytesIO(self.raw))

        self._level_names = {int(k): v for k, v in (self._cfg.get("log_levels") or {}).items()}
        self._nav_names = {int(k): v for k, v in (self._cfg.get("nav_state_names") or {}).items()}
        self._nav_groups = [(g["phase"], set(int(c) for c in g["codes"])) for g in (self._cfg.get("nav_state_groups") or [])]
        self._vehicle_types = {int(k): v for k, v in (self._cfg.get("vehicle_types") or {}).items()}

        # 本日志实际录到的 topic 名集合
        self._topics = set(d.name for d in self.ulog.data_list)

        # 按 pyulog 的**数据来源**分组读：各段只读自己那一种来源，都只往 self 上放结果、
        # 不碰 facts。顺序有一处硬约束——`_read_logged_messages()` 要用 `_read_data_list()` 算出的
        # `t0_us` 把消息时间换成**相对日志起点**的秒数，所以它必须排最后；其余互不依赖。
        #   ulog.msg_info_dict      → `_read_msg_info_dict()`：版本、载具身份
        #   ulog.initial_parameters → `_read_initial_parameters()`：参数里的事实（累计飞行、机架编号）
        #   ulog.data_list          → `_read_data_list()`：基准 topic（机型/模式/armed/阶段）
        #                             与全量扫描（时长、轨迹起点、重启、丢包）
        #   ulog.logged_messages    → `_read_logged_messages()`：日志消息（含警告/错误级别）
        self._read_msg_info_dict()
        self._read_initial_parameters()
        self._read_data_list()
        self._read_logged_messages()

    # ================= 数据访问层 =================

    def parser_version(self):
        """解析这份日志用的解析器版本（见 `_read_versions`）。"""
        return self.parser_version_str

    def get_topic_meta(self):
        """[{name, instance, n, fields:[{name, dtype}]}]（驱动 np_manifest 与曲线可用性）"""
        out = []
        for d in self.ulog.data_list:
            out.append(
                {
                    "topic": d.name,
                    "instance": int(d.multi_id),
                    "n": int(len(d.data["timestamp"])),
                    "fields": [
                        {"name": k, "dtype": str(getattr(v, "dtype", type(v).__name__))}
                        for k, v in d.data.items()
                        if k != "timestamp"
                    ],
                }
            )
        return out

    def get_topic_data(self, topic, instance=0):
        """某个 topic 某个实例的**原样列**：{列名: 数组}（含 'field[0]' 这种数组列）。

        取不到返回 None（不抛异常——契约要求）。
        """
        d = self._find_topic(topic, instance)
        return d.data if d is not None else None

    def get_series(self, ref, instance=slice(None, None), alias=None):
        """按 `"topic.field"` 取一条序列（与规则里写的引用形一致）。

        **取不到或字段不存在一律返回 None，不抛异常。** 形态：
          · instance=slice（规则里写 `topic[:].field`，**不写下标也一样**）—— 所有实例。
            多实例时返回「每实例一组」的列表；**只有一个实例时返回那一条序列本身**
            （否则单实例字段就得处处写 `[0]`，而且 `q` 这种"每元素一列"的数组字段会被
            多包一层而读不出来）
          · instance=N（规则里写 `topic[N].field`，N 可为负，按 Python 语义从末尾数）
            —— 只取第 N 个实例
          · alias —— 该字段的备用命名（旧固件改过名），可给字符串或字符串列表
        定长数组字段（如 float32[3] accel_clipping）：pyulog 按 'field[i]' 暴露，
        这里返回**每元素一列的列表**，缺的元素位置为 None。

        **没有"把所有实例拼成一条"这个形态**（曾经有，默认就是它）：一条曲线里混着几个
        传感器的数据，读的人看不出来。要哪个实例就写哪个；多实例归约用 `[:]`
        交给会分组的算子。
        """
        aliases = None
        if alias is not None:
            aliases = [alias] if isinstance(alias, str) else list(alias)
        if instance is None:
            instance = slice(None, None)
        groups = self._read_grouped(ref, aliases)
        if not groups:
            return None
        try:
            picked = groups[instance]
        except (IndexError, TypeError):
            return None
        if isinstance(instance, slice):
            # 单实例：直接给那一条（与 `[0]` 同形），别让调用方无谓地拆一层
            return picked[0] if len(picked) == 1 else picked
        return picked

    def get_first_existing_column(self, topic, names):
        """只取第一个实例、按候选名取第一个存在的**原样列**（概览指标兜底取数用）。"""
        cols = self.get_topic_data(topic, 0)
        if not cols:
            return None
        for n in names if isinstance(names, (list, tuple)) else [names]:
            if n in cols:
                return cols[n]
        return None

    def has_topic(self, name):
        """日志里有没有这个 topic（表达式里写成 has_topic('x')）。"""
        return name in self._topics

    def match_version(self, spec):
        """固件约束串：any / ">=1.15" / "<1.15" / ">=1.14,<1.15"（逗号=与）。

        规则级的适用范围轴与节点级 `ref(..., when_fw=)` **共用这一个**（同一个概念、
        同一套语法）；写错了先抛出来，别被下面"版本未知就放行"盖过去。
        版本未知（老日志没写版本号）时不因版本排除——与迁移前"按字段存在性判定"一致。
        """
        if not spec or spec == "any":
            return True
        # 先把约束串解析完：写得不对是**作者的笔误**，与这份日志有没有版本号无关，
        # 所以先抛出来，而不是被"版本未知就放行"盖过去。
        conds = []
        for part in str(spec).split(","):
            m = _re.match(r"^\s*(>=|<=|==|>|<)?\s*(\d+)\.?(\d+)?\s*$", part)
            if not m:
                raise ValueError("无法解析 firmware 约束：%r" % spec)
            conds.append((m.group(1) or ">=", (int(m.group(2)), int(m.group(3) or 0))))
        if self.fw_minor is None:
            return True
        cur = (self.fw["major"] if self.fw["major"] is not None else 0, self.fw_minor)
        for op, want in conds:
            if not {
                ">=": cur >= want,
                "<=": cur <= want,
                "==": cur == want,
                ">": cur > want,
                "<": cur < want,
            }[op]:
                return False
        return True

    def get_logged_information(self):
        return dict(self.ulog.msg_info_dict)

    def get_initial_parameters(self):
        return getattr(self.ulog, "initial_parameters", {}) or {}

    def get_logged_messages(self):
        """[{tSec, message, level, level_name}]（tSec = 相对日志起点的秒数）。

        内容在构造时由 `_read_logged_messages()` 算好一次——`builtin_variables()` 每条规则都要它，
        每次重建纯属白干。这里返回逐条复制的新 dict：调用方拿到的不能是内部状态。
        """
        return [dict(m) for m in self._logged_messages]

    def builtin_variables(self):
        """内置变量表。**每次返回新 dict**（引擎会往里写 compute 的输出）。

        键一律大写（见 api.py 的 BUILTIN_VARIABLES）：规则里自己赋的变量是小写。
        """
        return {
            "FW_MINOR": self.fw_minor,
            "AIRFRAME": self.vehicle_type,
            "IS_FIXED_WING": self.vehicle_type == "fixed_wing",
            "DURATION_S": self.duration_s if self.duration_s is not None else 0,
            "ARMED_S": self.armed_duration_s,
            # 时序算子（如 head_tail_median_drop）按 armed 区间切窗用
            "ARMED_INTERVALS": list(self.armed_intervals),
            # 事件类算子的相对时间（t=xx.x s）基准
            "T0_US": self.t0_us,
            "HAS_ARMED": bool(self.armed_intervals),
            # 数据质量事实（guards 类经验用）
            "RESTART_DETECTED": self.restart_topics > 0,
            "DROPOUT_MS": self.dropout_total_ms,
            # 日志消息：供「日志消息聚合」类经验按级别筛选
            "MESSAGES": self.get_logged_messages(),
        }

    def get_report_facts(self):
        """报告头的离散事实（机型 / 固件 / 时长 / 模式 / 载具身份……）。"""
        return self._collect_facts()

    # ================= 可选能力 =================

    def get_flight_phases(self):
        """连续的飞行阶段区间（报告页阶段条用）：按 nav_state 变化切段。

        数据在 `_read_data_list()` 里就一起算好了（同一批数组），这里只交出去。
        返回逐段复制的新 dict：调用方拿到的不能是 provider 的内部状态。
        """
        return [dict(seg) for seg in self.phase_intervals]

    def get_logged_dropouts(self):
        return [
            {"tSec": round(int(d.timestamp) / 1e6, 2), "durationMs": int(d.duration)}
            for d in getattr(self.ulog, "dropouts", [])
        ]

    def get_message_type_counts(self):
        """逐条走 ULog 的 [uint16 消息长度][uint8 消息类型] 序列，统计每类消息的条数。

        刻意不走 pyulog 的解析结果：pyulog 只留它认得的东西（把 M 的续行并进同一组、
        按话题聚合 D…），这里要回答的是"文件里究竟有多少条"，顺带当"文件是否被截断"的旁证
        ——走到尾部长度对不上就停下并标记，不硬猜。
        """
        raw, n = self.raw, len(self.raw)
        counts = {}
        off = 16  # 16 字节文件头：magic 'ULog' + 版本号 + 起始时间戳
        while off + 3 <= n:
            size = raw[off] | (raw[off + 1] << 8)
            if off + 3 + size > n:
                return counts, False, off, n
            code = chr(raw[off + 2])
            counts[code] = counts.get(code, 0) + 1
            off += 3 + size
        return counts, off == n, off, n

    def get_decoded_events(self):
        """PX4 事件（`event` topic）解码。解不出返回 None。

        pyulog 的 PX4Events 用**日志自带**的 metadata_events（那个 xz blob 就是这份固件的
        事件定义），所以不联网、与固件版本严格对应；定义里没有的 ID 显示
        [Unknown event with ID N]。Flight Review 的 Logged Messages 表就是
        "解码事件 + 文本消息"两路合并，这里对齐它。
        """
        try:
            from pyulog.px4_events import PX4Events

            event_parser = PX4Events()
            # 不外网兜底：日志没带事件定义时宁可不解码，也不去悄悄下载一份"最新的"定义
            event_parser.set_default_json_definitions_cb(lambda _already_has_default: None)
            name_to_lvl = {v: k for k, v in self._level_names.items()}
            out = []
            for t_us, level_str, text in event_parser.get_logged_events(self.ulog):
                out.append(
                    {
                        "tSec": round(int(t_us) / 1e6, 2),
                        "level": name_to_lvl.get(str(level_str), 6),
                        "levelStr": str(level_str),
                        "kind": "event",
                        "message": str(text).strip(),
                    }
                )
            return out
        except Exception:
            return None

    def get_flight_track(self, max_points=None):
        """地图轨迹（**可以多条**）：每条轨道按声明取数、换算、剔除未定位采样、等距抽样。

        声明来自 `knowledge/px4/plot/` 里 `container: map` 的那个预设（构建期编译进数据配置）：

            children:
              - label: gps                 # 图例名
                max_points: 1500
                lat: {cands: ["sensor_gps[0].latitude_deg", …], unit: "deg"}
                lon / alt 同形

        坐标取数走引擎的 `_pick_ref`（候选组按存在性挑、单位换算）——与规则、曲线**同一套**。
        单条轨道取不到就跳过它；一条都没有才返回 `error`（保留 `tracks: []`，形状稳定）。

        **取不到时必须说清"缺什么"**（`errorReasons` 逐条列出：哪个 topic 不在、缺哪个字段、
        还是"有采样但全程未定位"）。以前这里只给一句"声明里的坐标候选都不在日志里"，
        而那只对应其中一种原因——日志里有 `vehicle_gps_position` 但全程没拿到 3D 定位时，
        这句话是**错的**，用户还拿不到任何能自己判断的线索。见 CLAUDE.md §6.8。
        """
        cfg = self._cfg.get("track")
        if not cfg or not cfg.get("children"):
            return {"error": "这份格式没有声明轨迹取数来源（knowledge/px4/plot/track.yml）"}
        # ① 先过声明里的闸门（`conditions.topics`，构建期从预设搬到 facts.track）：一个都不在
        #    日志里时，这份预设**本就不适用**，该说的是"缺哪个 topic"而不是"坐标候选取不到"。
        #    文案复用 `rule_engine._missing_topics`——规则与绘图预设共用这一处，别在这儿再写
        #    第二份（它给的正是缺什么：`sensor_gps / vehicle_gps_position not in log`）。
        missing = _missing_topics((cfg.get("conditions") or {}).get("topics"))
        if missing:
            return self._track_failure(cfg, ["轨迹声明要的 topic 不在日志里：%s" % missing])
        # ② 闸门过了（至少一个候选 topic 在）却还是取不到，再逐候选说清为什么。这些原因
        #    `conditions.topics` 看不出来：字段改了名，或者有 GPS 采样但全程没拿到 3D 定位。
        tracks = []
        reasons = []
        for child in cfg["children"]:
            one, why = self._one_track(child, max_points)
            if one is not None:
                tracks.append(one)
            else:
                reasons.extend(why)
        if not tracks:
            return self._track_failure(cfg, reasons or ["声明里的候选一条都没取到坐标"])
        return {
            "title": cfg.get("title") or "轨迹",
            "legend": cfg.get("legend", True),
            "tracks": tracks,
        }

    def _track_failure(self, cfg, reasons):
        """轨迹取不到的返回体。

        `error` 带上**最后一条**原因（给"只看一行"的消费方：日志、非界面接口），完整清单在
        `errorReasons`（界面按列表渲染）。为什么是最后一条：候选按优先级依次试，**最后试的
        那个才是把整串试完的那一个**，它前面几条只是"为什么跳过了它"——把第一条当结论，
        会指着"日志里没有 sensor_gps"去解释"有 GPS 但全程没定位"。
        """
        headline = reasons[-1]
        declared = {
            _split_ref(c)[0].partition(".")[0]
            for ch in cfg["children"]
            for ax in ("lat", "lon", "alt")
            for c in (ch.get(ax) or {}).get("cands", [])
        }
        # 声明的 topic 一个都不在日志里时，补一句"日志里实际有什么"：只说"缺了东西"用户
        # 无从下手——有对照物才看得出是固件版本不同，还是字段改了名
        if declared and not any(self.has_topic(t) for t in declared):
            reasons = reasons + [self._coord_field_topics_note()]
        return {
            "title": cfg.get("title") or "轨迹",
            "legend": cfg.get("legend", True),
            "tracks": [],
            "error": "这段日志里没有可用的定位轨迹——" + headline,
            "errorReasons": reasons,
        }

    def _coord_field_topics_note(self):
        """日志里"带经纬度字段"的 topic 一句话清单（给 `errorReasons` 当对照物）。

        挑判据用**字段**而不是 topic 名：用户真正要问的是"这份日志里到底有没有坐标"，
        只列 `vehicle_local_position` 这种名字看不出它只有参考原点 `ref_lat/ref_lon`、
        没有逐点经纬度——而那恰恰是"为什么画不出轨迹"的答案。

        判据见 `_latlon_fields`（关键词独立成段、只看经纬度不看高度）。**写成裸子串 `"lat" in name`
        会让 `relative_test_ratio` 里的 "lat" 混进来**，列出 `estimator_selector_status` 这种
        与坐标无关的 topic——比不给对照物更糟，因为它听起来很具体。
        """
        hits = []
        for m in self.get_topic_meta():
            coord = _latlon_fields([f["name"] for f in m["fields"]])
            if coord:
                hits.append("%s[%d]（%s）" % (m["topic"], int(m["instance"]), ", ".join(coord[:4])))
        if not hits:
            return "这份日志里没有任何带经纬度字段的 topic"
        more = "，另有 %d 个" % (len(hits) - 6) if len(hits) > 6 else ""
        return "这份日志里带经纬度字段的 topic 有：" + "；".join(hits[:6]) + more

    def _one_track(self, child, max_points=None):
        """一条轨道 → `(轨道, [])`；取不到返回 `(None, [原因…])`。

        **三个坐标与时间戳必须来自同一个 topic 的同一个实例**：候选顺序即优先级，取第一个
        "lat / lon / alt 三样都能给齐"的 topic 生效。不这么定的话，三路的采样率不同、数组
        长度不同，`lat[i]` 与 `alt[i]` 根本不是同一时刻，画出来是错的。

        失败原因是要**给用户看**的，所以每一句都得落到具体的 topic / 字段上：
        "缺字段"要说缺哪个、这个 topic 的坐标字段实际叫什么；"全是未定位"要说清几个采样、
        几个有效——用户据此才能判断是固件版本不同、字段改了名，还是这次飞行压根没上星。
        """
        limit = int(max_points or child.get("max_points") or 1500)
        why = []
        for cand in child["lat"]["cands"]:
            bare, inst = _split_ref(cand)
            topic = bare.partition(".")[0]
            if isinstance(inst, slice):
                continue  # 构建期就要求写死实例；这里防御性跳过
            cols = self.get_topic_data(topic, inst)
            if not cols:
                why.append("%s[%s]：日志里没有这个 topic" % (topic, inst))
                continue
            axes, ok, missing = {}, True, {}
            for name in ("lat", "lon", "alt"):
                spec = child.get(name) or {}
                same = [c for c in spec.get("cands", []) if _split_ref(c)[0].partition(".")[0] == topic]
                fields = [c.partition(".")[2] for c in same]
                hit = next((f for f in fields if f in cols), None)
                if hit is None:
                    missing[name] = fields
                    ok = False
                else:
                    axes[name] = (same[fields.index(hit)], spec.get("unit"))
            if not ok:
                coordish = _coord_like_fields(cols)
                why.append(
                    "%s[%s]：缺 %s 字段——声明找的是 %s，该 topic 的坐标相关字段是 %s（共 %d 列）"
                    % (
                        topic,
                        inst,
                        "/".join(missing),
                        "、".join("%s→%s" % (k, "/".join(v) or "（声明里没有同 topic 的候选）") for k, v in missing.items()),
                        ", ".join(coordish) if coordish else "（一个都没有）",
                        len(cols),
                    )
                )
                continue

            series, ok = {}, True
            for name, (cand_str, unit) in axes.items():
                got, _bare = _pick_ref(cand_str, unit=unit)
                if got is None:
                    why.append("%s[%s]：%s 取不出值（候选 %s，unit=%s）" % (topic, inst, name, cand_str, unit))
                    ok = False
                    break
                series[name] = np.asarray(got, dtype=float)
            if not ok:
                continue
            ts = self.get_series("%s.timestamp" % topic, instance=inst)
            if ts is None:
                why.append("%s[%s]：没有 timestamp 字段（轨迹点的时间轴取自它）" % (topic, inst))
                continue
            ts = np.asarray(ts, dtype=np.int64)
            n = len(ts)
            if any(len(series[k]) != n for k in ("lat", "lon", "alt")):
                why.append(
                    "%s[%s]：采样数对不上——timestamp %d 个，lat/lon/alt 分别 %d/%d/%d 个"
                    % (topic, inst, n, len(series["lat"]), len(series["lon"]), len(series["alt"]))
                )
                continue  # 同 topic 同实例却长度不同：宁可这条不画，也不硬凑坐标

            lat, lon, alt = series["lat"], series["lon"], series["alt"]
            # GPS 没定位时的采样必须剔掉：PX4 在拿到定位前会连着记 lat=lon=0（几内亚湾那个"空岛"），
            # 一条直线就从那儿连到真正的航迹上——地图上看着完全不对（实测用户日志就是这样）。
            # 判据：坐标在合法范围、不是 (0,0)、且（有 fix_type 时）fix_type ≥ 3 才算 3D 定位。
            valid = np.isfinite(lat) & np.isfinite(lon) & np.isfinite(alt)
            valid &= (np.abs(lat) <= 90.0) & (np.abs(lon) <= 180.0)
            valid &= ~((np.abs(lat) < 1e-7) & (np.abs(lon) < 1e-7))
            fix = self.get_series("%s.fix_type" % topic, instance=inst)
            fix_note = ""
            if fix is not None:
                fx = np.asarray(fix)
                valid &= fx >= 3
                kinds = {}
                for v in fx:
                    kinds[int(v)] = kinds.get(int(v), 0) + 1
                fix_note = "，fix_type 分布 %s" % " ".join("%d×%d" % (k, v) for k, v in sorted(kinds.items()))
            idx_valid = np.nonzero(valid)[0]
            if len(idx_valid) < 2:
                # "字段都在、但整段没定位"是另一回事：不说清的话用户会以为日志里没这个字段，
                # 而真相是这次飞行没上星（或飞控没进 3D fix）
                why.append(
                    "%s[%s]：%d 个采样里只有 %d 个有效定位（要 fix_type≥3、坐标非 0 非 NaN）%s"
                    % (topic, inst, n, len(idx_valid), fix_note)
                )
                continue

            # 轨迹用等距抽样：路径形状比峰值更需要均匀（在有效点里抽，别把 invalid 又抽回来）
            step = max(1, int(np.ceil(len(idx_valid) / limit)))
            idx = [int(i) for i in idx_valid[::step]]
            clean = _json_clean
            return {
                "label": child.get("label") or topic,
                "t": [round(int(ts[i]) / 1e6, 2) for i in idx],
                "lat": [clean(lat[i]) for i in idx],
                "lon": [clean(lon[i]) for i in idx],
                "alt": [clean(alt[i]) for i in idx],
                "fullCount": len(idx_valid),
                # 剔掉了多少未定位采样：界面据此说明"点数为什么比采样数少"
                "dropped": int(n - len(idx_valid)),
            }, []
        return None, why

    def report_materials(self):
        """报告页要的几块原料（**不是某一个 tab 的 payload**，四个 tab 各取所需）。

        系统消息取 infoDict / msgTypeStats / msgTypeWalkOk；事件消息取 messages / messagesMulti；
        飞控参数取 params / defaultParams / changedParams；阶段条取 phases。

        所以这个方法的边界是「该格式能提供哪些原料」，由前端按 tab 取用。为什么不由数据层拼：
        原料的形态是格式专有的——'I' 信息字典、'L' 文本消息与 event 解码结果合并成一条时间轴、
        'M' 多值信息怎么拼回文本、'Q' 默认值怎么推、逐字节的消息类型统计……换一种日志格式
        就是另一套。
        """
        info = self.get_logged_information()  # 走契约能力取，别再直读 self.ulog（同一份数据两处知识）
        cfgsys = self._cfg.get("sys_info_keys") or []
        info_types = getattr(self.ulog, "_msg_info_dict_types", None) or {}
        info_docs = self._cfg.get("info_key_docs") or {}
        clean = _json_clean

        def boot(t_us):
            return round(int(t_us) / 1e6, 2)

        sys_info = {k: str(info[k]) for k in cfgsys if k in info}
        info_dict = []
        for k, v in sorted(info.items()):
            doc = info_docs.get(k) or {}
            info_dict.append(
                {
                    "key": str(k),
                    "name": str(doc.get("name", "")),
                    "type": str(info_types.get(k, "")),
                    "value": str(v),
                    "desc": str(doc.get("desc", "")),
                }
            )

        # Logged String Message（'L'）。PX4 对**事件**会同时写两样：一条事件（二进制，进
        # `event` topic）和一条等价的旧格式文本（以 \t 结尾）。先分开收，等解码出事件后再决定
        # 要不要留那份重复文本。
        messages, legacy_dupes = [], []
        for m in getattr(self.ulog, "logged_messages", []):
            lvl = int(getattr(m, "log_level", 6))
            text = str(m.message)
            item = {
                "tSec": boot(m.timestamp),
                "level": lvl,
                "levelStr": self._level_str(m, lvl),
                "kind": "log",
                "message": text.strip(),
            }
            (legacy_dupes if text.endswith("\t") else messages).append(item)

        events = self.get_decoded_events() or []

        # Tagged Logged String（'C'）：与 'L' 同形，多一个 tag = 消息来源（进程/线程/类），
        # 由机载系统自己定义含义（PX4 主线固件一般不写）。按时间并入同一时间轴，tag 原样带上。
        tagged_src = getattr(self.ulog, "logged_messages_tagged", None) or {}
        messages_tagged = []
        for tag, msgs in tagged_src.items():
            for m in msgs:
                lvl = int(getattr(m, "log_level", 6))
                messages_tagged.append(
                    {
                        "tSec": boot(m.timestamp),
                        "level": lvl,
                        "levelStr": self._level_str(m, lvl),
                        "kind": "log",
                        "tag": int(tag),
                        "message": str(m.message).strip(),
                    }
                )
        messages_tagged.sort(key=lambda m: m["tSec"])

        # 解码出事件了：那些 \t 结尾的旧格式文本就是同一件事的另一种说法，丢掉（FR 也如此）。
        # 没有解码结果（固件没带事件定义）就保留——否则 armed / takeoff 这类关键节点会凭空消失。
        if not events:
            messages += legacy_dupes
        all_messages = sorted(messages + events + messages_tagged, key=lambda m: m["tSec"])

        # Multi Information：键 → 多组值，没有时间戳。组内怎么拼回文本要看**形态**：
        #   · 逐行型（perf_counter / perf_top…）：每段是一行完整文本，PX4 不给行尾换行
        #     —— 段之间补 \n，否则所有行黏成一行；
        #   · 流式型（boot_console_output）：一整段控制台文本按定长切片，换行在段**内部**，
        #     一行还可能跨段 —— 只能直接拼接，补 \n 会凭空断行。
        # 判据：任一段自带换行 → 流式；否则逐行。实机日志两种键都出现过，别按一种写死。
        multi_src = getattr(self.ulog, "msg_info_multiple_dict", None) or {}
        multi_types = getattr(self.ulog, "msg_info_multiple_dict_types", None) or {}

        def _fmt(v):
            # metadata_events 之类是原始字节，别把 b'ý7zXZ...' 当文本铺出来
            if isinstance(v, (bytes, bytearray)):
                return "（二进制数据 %d 字节）" % len(v)
            return str(v)

        def _fmt_group(grp):
            if not isinstance(grp, list):
                return _fmt(grp)
            # 整组都是原始字节（metadata_events 就是）：只报总字节数，不铺十几行同样的提示
            if grp and all(isinstance(x, (bytes, bytearray)) for x in grp):
                return "（二进制数据 %d 字节，已省略）" % sum(len(x) for x in grp)
            texts = [_fmt(x) for x in grp]
            return "".join(texts) if any("\n" in t for t in texts) else "\n".join(texts)

        messages_multi = [
            {
                "key": str(k),
                "type": str(multi_types.get(k, "")),
                "values": [_fmt_group(g) for g in (multi_src[k] or [])],
            }
            for k in sorted(multi_src)
        ]

        params = {
            str(k): (clean(np.asarray(v).reshape(-1)[0]) if hasattr(v, "reshape") else clean(v))
            for k, v in self.get_initial_parameters().items()
        }

        # Parameter Default（ULog 的 'Q' 消息）。PX4 的 logger 逐参数比较「当前值 / 机架默认 /
        # 固件默认」三者，**只写与当前值不同的那个**（logger.cpp: write_parameter_defaults）
        # —— 于是「有记录」等价于「该参数被改过」，且记录里的默认值必然与当前值不同；
        # 反过来「没记录」表示当前值与两个默认都相同。
        # 位含义见 ulog_parameter_default_type_t：bit0 = system（固件出厂默认），
        # bit1 = current_setup（机架配置 + 自定义默认文件）。
        default_params = {}
        get_defaults = getattr(self.ulog, "get_default_parameters", None)
        if get_defaults is not None:
            for bit, field in ((0, "system"), (1, "setup")):
                for key, val in (get_defaults(bit) or {}).items():
                    default_params.setdefault(str(key), {})[field] = clean(val)

        changed = []
        cp = getattr(self.ulog, "changed_parameters", None)
        if cp is None:
            cp = getattr(self.ulog, "_changed_parameters", [])
        for p in cp:
            changed.append(
                {
                    "tSec": boot(getattr(p, "timestamp", 0) or 0),
                    "name": str(getattr(p, "name", "")),
                    "value": clean(getattr(p, "value", None)),
                }
            )

        # ULog 消息类型统计：顺序与名字来自 facts.yaml 的 ulog_msg_types，没出现过的类型计 0
        counts, walked_to_end, walked_off, file_size = self.get_message_type_counts()
        msg_types = self._cfg.get("ulog_msg_types") or []
        known = {str(t["code"]) for t in msg_types}
        msg_type_stats = [
            {
                "code": str(t["code"]),
                "name": str(t.get("name", "")),
                "en": str(t.get("en", "")),
                "desc": str(t.get("desc", "")),
                "count": int(counts.get(str(t["code"]), 0)),
            }
            for t in msg_types
        ]
        unknown = sum(c for k, c in counts.items() if k not in known)
        if unknown:
            msg_type_stats.append(
                {
                    "code": "?",
                    "name": "不在码表里的类型",
                    "en": "Unknown",
                    "count": int(unknown),
                    "desc": "固件比本站的码表新，或文件被改过",
                }
            )

        return {
            "sysInfo": sys_info,
            "infoDict": info_dict,
            "msgTypeStats": msg_type_stats,
            # 逐字节统计有没有正好走到文件末尾：false = 尾部有截断/追加段
            "msgTypeWalkOk": bool(walked_to_end),
            "msgTypeWalkedBytes": int(walked_off),
            "fileSizeBytes": int(file_size),
            # 事件解码结果、文本消息、带 tag 的消息已经并成一条时间轴（按 kind 区分来源）
            "messages": all_messages,
            "messagesMulti": messages_multi,
            "dropouts": self.get_logged_dropouts(),
            "params": params,
            "defaultParams": default_params,
            # 老固件没设 DEFAULT_PARAMETERS compat flag 时整段缺失：此时「没记录」不能当成
            # 「与默认一致」，前端要区别对待，不能替它下结论。
            "defaultParamsKnown": bool(getattr(self.ulog, "has_default_parameters", False)),
            "changedParams": changed,
            "phases": self.get_flight_phases(),
        }

    # ================= 内部：解析与事实 =================

    def _find_topic(self, topic, instance):
        """该 topic 该实例那份数据；没有就 None。"""
        for d in self.ulog.data_list:
            if d.name == topic and d.multi_id == instance:
                return d
        return None

    def _find_topic_all(self, topic):
        """该 topic 的**全部实例**（多实例拼接用）。"""
        return [d for d in self.ulog.data_list if d.name == topic]

    @staticmethod
    def _first_field(ds, *names):
        """按 names 的顺序取**第一个存在**的字段（旧固件改过名时靠它回退）。

        取不到（名字不在这份日志里）返回 None，不抛异常——契约要求"取不到一律 None"，
        引擎按"数据不足"处理。**只咽 KeyError**：静默留给"数据缺失"，不留给编程错误
        （传了个 None 的 dataset 之类该当场炸，否则表现成"这条经验静默不生效"，最难查）。
        """
        for n in names:
            try:
                v = ds.data[n]
            except KeyError:
                continue
            if v is not None:
                return v
        return None

    def _read_grouped(self, ref, aliases):
        """'topic.field' → 「每个 topic 实例一组」的列表；topic 不存在返回 None。

        实例顺序 = `_find_topic_all()` 的顺序（与 topic meta 一致），所以 `instance=N` 的
        N 就是标题里那个实例序号。缺字段的实例留一个 None 占位，**不剔除**——剔了会让
        后面的实例序号整体前移。
        """
        topic, _, field = ref.partition(".")
        ds = self._find_topic_all(topic)
        if not ds:
            return None
        aliases = list(aliases or [])
        groups = []
        for d in ds:
            direct = self._first_field(d, field, *aliases)
            if direct is not None and len(direct):
                groups.append(np.asarray(direct, dtype=float))
                continue
            cols = []
            for idx in range(32):
                col = None
                for stem in [field] + aliases:
                    v = self._first_field(d, f"{stem}[{idx}]", f"{stem}_{idx}")
                    if v is not None and len(v):
                        col = np.asarray(v, dtype=float)
                        break
                cols.append(col)
            while cols and cols[-1] is None:
                cols.pop()
            groups.append(cols if cols else None)
        return groups

    def _level_str(self, m, lvl):
        try:
            return str(m.log_level_str())
        except Exception:
            return self._level_names.get(lvl, "LEVEL %d" % lvl)

    def _read_msg_info_dict(self):
        """从 `ulog.msg_info_dict`（PX4 的 Information Message）读版本与载具身份。

        ver_sw_release 的打包：major<<24 | minor<<16 | patch<<8 | 类型。
        """
        self.parser_version_str = "pyulog/%s" % getattr(pyulog, "__version__", "unknown")

        info = self.ulog.msg_info_dict
        rel = info.get("ver_sw_release")
        fw = {
            "release": None,
            "major": None,
            "minor": None,
            "patch": None,
            "git": str(info.get("ver_sw", ""))[:12],
            "hw": str(info.get("ver_hw", "")),
        }
        if rel is not None:
            try:
                v = int(rel)
                fw.update(
                    {
                        "release": v,
                        "major": (v >> 24) & 0xFF,
                        "minor": (v >> 16) & 0xFF,
                        "patch": (v >> 8) & 0xFF,
                    }
                )
            except Exception:
                pass
        self.fw = fw
        self.fw_minor = fw["minor"]
        self.fw_label = (
            "%d.%d.%d" % (fw["major"], fw["minor"], fw["patch"]) if fw["minor"] is not None else "未知（旧固件或无版本号）"
        )

        self.hw_subtype = str(info.get("ver_hw_subtype", ""))

        # 软件版本的展示串：对齐 Flight Review 的 `_format_sw_version`（见 _RELEASE_TYPE_SUFFIX
        # 的注释：只有未打标签的开发版才附 git 短哈希）。类型码另存一份，前端能凭它重算。
        # 用 fw["release"]（已 int 化）而不是 info 里的原值：解析不出数字时它才是 None。
        self.ver_sw = str(info.get("ver_sw", ""))
        short_sw = self.ver_sw[:6] if len(self.ver_sw) > 10 else self.ver_sw
        rel = fw["release"]
        self.fw_release_type = None if rel is None else int(rel) & 0xFF
        if rel is None:
            self.fw_display = short_sw
        else:
            rtype = int(rel) & 0xFF
            disp = "v%d.%d.%d%s" % (
                fw["major"],
                fw["minor"],
                fw["patch"],
                _RELEASE_TYPE_SUFFIX.get(rtype, ""),
            )
            if rtype not in _RELEASE_TYPE_SUFFIX and self.ver_sw:  # 未打标签的开发版：附短哈希
                disp += " (%s)" % short_sw
            self.fw_display = disp

        # 载具身份：与判定无关，但历史卡片与报告概况要用，且必须**随 report 存档**
        # （派生数据 info 不进存档）。用**分支/标签**（如 damiao_dm-fc01_v1.15.0）比 commit
        # 号可读；新固件才有这个键
        self.uuid = str(info.get("sys_uuid", ""))
        self.ver_sw_branch = str(info.get("ver_sw_branch", ""))

    def _read_initial_parameters(self):
        """从 `ulog.initial_parameters` 读参数里的事实。"""
        p = getattr(self.ulog, "initial_parameters", {}) or {}
        # 载具累计飞行时长：LND_FLIGHT_T_HI/LO 拼成的 64 位 µs 计数器
        # （两个都是 int32，可能读成负数）
        hi, lo = p.get("LND_FLIGHT_T_HI"), p.get("LND_FLIGHT_T_LO")
        self.vehicle_life_s = (
            round((((int(hi) & 0xFFFFFFFF) << 32) | (int(lo) & 0xFFFFFFFF)) / 1e6, 1)
            if hi is not None and lo is not None
            else None
        )
        # 机架编号（SYS_AUTOSTART，如 4040）——机型之外再给一个可查的标识
        af = p.get("SYS_AUTOSTART")
        self.airframe_id = int(af) if af is not None else None

    def _read_data_list(self):
        """读 `ulog.data_list`（各 topic 的时序）与 `ulog.dropouts`，得出报告头的离散量。

        分两部分：先读**基准 topic** `vehicle_status`（机型 / 模式 / armed 区间 / 飞行阶段），
        再**扫全局**（总时长与时间基准、记录起始 UTC、数据质量）。这个 topic 只读这一处，
        需要切段的都在同一批数组上算完——原先 `get_flight_phases()` 要为此把整份 dataset 留到运行期再切。
        条件值（这份日志没有的）统一用 None / "" 表示，由 `_collect_facts()` 决定给不给键。
        """
        ulog = self.ulog

        # ---- 基准 topic：vehicle_status ----
        vs = self._find_topic("vehicle_status", 0)

        # ---- 机型识别 ----
        vehicle_type = "unknown"
        if vs is not None:
            vt = self._first_field(vs, "vehicle_type")
            if vt is not None and len(vt) > 0:
                vehicle_type = self._vehicle_types.get(int(vt[-1]), "unknown(%d)" % int(vt[-1]))
            else:
                rw = self._first_field(vs, "is_rotary_wing")
                if rw is not None and len(rw) > 0:
                    vehicle_type = "rotary_wing" if int(rw[-1]) else "fixed_wing"
        self.vehicle_type = vehicle_type

        # ---- 飞行模式 ----
        # 这次日志里出现过的 nav_state 模式，按占样本数从多到少（名字取 facts.yaml 的
        # nav_state_names）——列表的"飞行模式"列按 Flight Review 的口径列出**全部**模式。
        self.modes = None
        if vs is not None:
            nav = self._first_field(vs, "nav_state")
            if nav is not None and len(nav) > 0:
                counts = {}
                for code in nav:
                    counts[int(code)] = counts.get(int(code), 0) + 1
                ordered = sorted(counts, key=lambda c: -counts[c])
                self.modes = [str(self._nav_names.get(c, "Mode %d" % c)) for c in ordered]

        # ---- armed 区间与飞行阶段 ----
        # 三样东西都从同一批数组切出来：armed 区间（时序算子按它切窗）、这次日志出现过的
        # 阶段集合（喂故障库）、连续阶段区间（报告页阶段条）。一起算，同一批数据不必切两遍。
        armed_intervals, phases_present, phase_intervals = [], set(), []
        armed_duration_s = 0.0
        if vs is not None:
            nav = self._first_field(vs, "nav_state")
            nav_arr = np.asarray(nav) if nav is not None else None
            arm = self._first_field(vs, "arming_state")
            arm_arr = np.asarray(arm) if arm is not None else None
            vts = np.asarray(self._first_field(vs, "timestamp"), dtype=np.int64)

            # armed 区间（failsafe 失联只在 armed 区间内才报）
            if arm_arr is not None:
                start_i = None
                for i in range(len(arm_arr)):
                    if int(arm_arr[i]) == _ARMING_STATE_ARMED and start_i is None:
                        start_i = i
                    elif int(arm_arr[i]) != _ARMING_STATE_ARMED and start_i is not None:
                        armed_intervals.append((int(vts[start_i]), int(vts[i])))
                        start_i = None
                if start_i is not None:
                    armed_intervals.append((int(vts[start_i]), None))
                total_us = sum(((e if e is not None else int(vts[-1])) - s) for s, e in armed_intervals)
                armed_duration_s = round(total_us / 1e6, 1)

            if nav_arr is not None:
                # 只统计 armed 段内的状态；未解锁的地面操作不产生飞行阶段
                if armed_intervals:
                    amask = np.zeros(len(nav_arr), dtype=bool)
                    for s, e in armed_intervals:
                        lo = int(np.searchsorted(vts, s))
                        hi = len(vts) if e is None else int(np.searchsorted(vts, e))
                        amask[lo:hi] = True
                    codes = set(int(c) for c in nav_arr[amask])
                    for phase, phase_codes in self._nav_groups:
                        if codes & phase_codes:
                            phases_present.add(phase)

                # 连续阶段区间：按 nav_state 变化切段，每段取段内 arming_state 的中位数
                # 判"这段算不算在飞"。与上面那个集合不是一回事：那个答"出现过哪些阶段"，
                # 这个答"几点到几点在哪个阶段"。
                runs, run_start = [], 0
                for i in range(1, len(nav_arr)):
                    if int(nav_arr[i]) != int(nav_arr[run_start]):
                        runs.append((run_start, i - 1))
                        run_start = i
                runs.append((run_start, len(nav_arr) - 1))
                for lo_i, hi_i in runs:
                    code = int(nav_arr[lo_i])
                    seg_arm = int(np.median(arm_arr[lo_i : hi_i + 1])) if arm_arr is not None else None
                    phase_intervals.append(
                        {
                            "startSec": round(int(vts[lo_i]) / 1e6, 2),
                            "endSec": round(int(vts[hi_i]) / 1e6, 2),
                            "navState": code,
                            "mode": self._nav_names.get(code, "Mode %d" % code),
                            "armed": seg_arm == _ARMING_STATE_ARMED,
                        }
                    )

            trans_mode = self._first_field(vs, "vtol_in_trans_mode")
            if trans_mode is not None and int(np.max(np.asarray(trans_mode))) > 0:
                phases_present.add("vtol_transition")

        self.armed_intervals = armed_intervals
        self.armed_duration_s = armed_duration_s
        self.phases_present = phases_present
        self.phase_intervals = phase_intervals

        # ---- 扫全局：总时长与时间基准 ----
        # 时间基准是**开机以来的秒数**（PX4 时间戳本身就是开机起的微秒），这里不换算，
        # 只记录起点供事件类算子算相对时刻。
        t_min, t_max = None, None
        for d in ulog.data_list:
            t = self._first_field(d, "timestamp")
            if t is not None and len(t) > 1:
                a, b = float(t[0]), float(t[-1])
                t_min = a if t_min is None else min(t_min, a)
                t_max = b if t_max is None else max(t_max, b)
        self.t0_us = int(getattr(ulog, "start_timestamp", 0) or (t_min or 0))
        self.duration_s = round((t_max - t_min) / 1e6, 1) if t_min is not None else None

        # ---- 扫全局：记录起始的 UTC 时刻 ----
        # 取 GPS 首次给出有效时间的那一刻（比 boot_time_utc_us 可靠，后者要飞控对过时）。
        # topic 按 plot/ 里地图声明的**候选顺序**取第一个存在的（构建期已按声明编译好 topics），
        # 与 get_flight_track() 同一优先级——两处别各挑各的。
        self.start_utc = None
        for topic, inst in (self._cfg.get("track") or {}).get("children", [{}])[0].get("topics", []):
            gps = self._find_topic(topic, int(inst))
            if gps is None or "time_utc_usec" not in gps.data:
                continue
            t = np.asarray(gps.data["time_utc_usec"], dtype=np.int64)
            nz = np.nonzero(t > 0)[0]
            if len(nz):
                self.start_utc = int(t[nz[0]] // 1000000)
                break

        # ---- 扫全局：数据质量事实 ----
        # 中途重启：同一 topic 时间戳出现回退（样本 > 10 才算）
        restart = 0
        for d in ulog.data_list:
            t = self._first_field(d, "timestamp")
            if t is not None and len(t) > 10:
                a = np.asarray(t, dtype=np.int64)
                if int(np.count_nonzero(np.diff(a) < 0)) > 0:
                    restart += 1
        self.restart_topics = restart
        # 丢包累计
        self.dropout_total_ms = int(sum(getattr(d, "duration", 0) for d in getattr(ulog, "dropouts", [])))

    def _read_logged_messages(self):
        """读 `ulog.logged_messages`：日志消息（PX4 的 `[模块] 文案`，含警告 / 错误级别）。

        **必须排在 `_read_data_list()` 之后**：tSec 是相对日志起点的秒数，要用它算出的 `t0_us`。
        为什么在构造期算而不是每次现算：`builtin_variables()` 里就有 `messages`，而 `builtin_variables()`
        被 `_rule_env()` **每条规则各调一次**——不缓存就是每条规则重建一遍同一份列表。

        level 是 ULog 里的原始字节，PX4 填的是 **ASCII 数字**（'3'=51 才是 ERROR），
        与 pyulog 的 Message.log_level_str() 一致；因此经验文件按 level_name 判定，
        不要直接和 3/4 这种数字比（迁移前就是这么比错的，导致消息类经验从不命中）。
        """
        out = []
        for m in getattr(self.ulog, "logged_messages", []):
            try:
                ts_s = round((int(m.timestamp) - self.t0_us) / 1e6, 2)
            except (AttributeError, TypeError, ValueError):
                # 这条消息没有可用的 timestamp（pyulog 各版本给的东西不一致）：只丢相对时刻，
                # 消息本身照留。**不写 except Exception**——`t0_us` 要是设错了，那是 bug，
                # 应该炸出来，而不是让全部消息悄悄变成 tSec=None。
                ts_s = None
            lvl = int(getattr(m, "log_level", ord("6")))
            out.append(
                {
                    "tSec": ts_s,
                    "message": str(m.message).strip(),
                    "level": lvl,
                    "level_name": self._level_names.get(lvl, "UNKNOWN"),
                }
            )
        self._logged_messages = out

    def _collect_facts(self):
        """把三段读到的量汇成报告头的离散事实。

        **facts 的键名只在这一个地方出现**：三段各管"从日志里读什么"（只往 self 上放），
        这里管"报告头叫什么名字"（含"有才给"的条件键）。分开的好处是改键名不必翻三段代码，
        也能一眼看全报告头到底有哪些字段。
        """
        facts = {
            "durationSec": self.duration_s if self.duration_s is not None else 0,
            "vehicleType": self.vehicle_type,
            "firmware": self.fw_label,
            "firmwareProfile": ("px4-1.15+" if (self.fw_minor is not None and self.fw_minor >= 15) else "px4-legacy"),
            "firmwareDisplay": self.fw_display,
            "fwReleaseType": self.fw_release_type,
            "armedDurationSec": self.armed_duration_s,
            "phases": sorted(self.phases_present),
            "dropoutTotalMs": self.dropout_total_ms,
        }
        # 条件键：这份日志没有的就不给（前端按"缺哪项不显示哪行"处理）
        if self.fw["hw"]:
            facts["hardware"] = self.fw["hw"]
        if self.hw_subtype:
            facts["hardwareSubtype"] = self.hw_subtype
        if self.ver_sw:
            facts["verSw"] = self.ver_sw
        if self.modes:
            facts["modes"] = list(self.modes)
            facts["mainMode"] = self.modes[0]  # 已按占样本数排序，第一个就是主模式
        if self.uuid:
            facts["uuid"] = self.uuid
        if self.ver_sw_branch:
            facts["verSwBranch"] = self.ver_sw_branch
        if self.vehicle_life_s is not None:
            facts["vehicleLifeS"] = self.vehicle_life_s
        if self.airframe_id is not None:
            facts["airframeId"] = self.airframe_id
        if self.start_utc is not None:
            facts["startUtc"] = self.start_utc
        return facts


def _json_clean(v):
    """numpy / NaN / Inf → JSON 安全的 Python 原生结构（NaN 转 None）。"""
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and not np.isfinite(v):
        return None
    return v


def _is_ulog(raw):
    return bytes(raw[:4]) == _MAGIC


def _make_px4(raw, facts_cfg):
    return Px4Provider(raw, facts_cfg)


FORMATS.append((_is_ulog, _make_px4, "PX4 ULog（.ulg）"))
