# 日志适配器（provider）契约 —— 引擎唯一认识的"日志"长相
#
# 为什么是这份常量表，而不是 typing.Protocol：
#   · 构建期**不执行** Python（web/scripts/build-knowledge.mjs 只把源码当文本搬运），
#     Pyodide 里也没有 mypy —— 两端都没有类型检查器，写 Protocol 只是"看着有约束、实际没人管"。
#   · 所以契约做成**可执行的**：这份表既是文档，也是三道机器检查的输入。
#
# 三道检查（分工是"构建期挡住漏写、运行期挡住类型与缺席、测试挡住语义"）：
#   1. 构建期：web/scripts/build-knowledge.mjs 用 ast 解析 providers/*.py，
#      查 REQUIRED 的方法有没有定义、builtin_variables() 返回的字典字面量键齐不齐
#   2. 运行期：下面的 check_provider()，引擎建好 provider 之后立刻跑一次
#   3. 契约测试：tools/engine/guard_provider_contract.py，对每个 provider 跑同一套断言
#      （失败语义、get_topic_meta() 与 get_series() 自洽、armed_intervals 的形状……）
#
# 加一个适配器（如 ardupilot.py）要做的事：实现 REQUIRED，按需实现 OPTIONAL，
# 把工厂追加进 FORMATS，然后跑通 guard_provider_contract.py —— 引擎一行都不用改。

# ---------------- 必需能力：规则与曲线会直接依赖 ----------------
REQUIRED = {
    "log_type": {
        "kind": "attr",
        "doc": "格式标识（如 px4-ulog），进报告与错误信息",
    },
    "parser_version": {
        "kind": "method",
        "sig": "() -> str",
        "doc": "解析这一份日志用的解析器版本串（如 pyulog/1.1.0），进报告头的 parserVersion。"
        "**为什么由 provider 给而不是引擎写死**：引擎不认识任何一种日志的解析器，"
        "写死就等于把某个格式的名字钉进了格式无关层。"
        "浏览器里解析器版本不受本站控制（PyPI 当时的最新版），所以它必须如实记录",
    },
    "get_topic_meta": {
        "kind": "method",
        "sig": "() -> list[dict]",
        "doc": "有哪些消息/话题：[{name, instance, n, fields:[{name, dtype}]}]。"
        "驱动 np_manifest（曲线可用性）与契约测试的自洽校验",
    },
    "get_first_existing_column": {
        "kind": "method",
        "sig": "(topic, names) -> array|None",
        "doc": "只取第一个实例、按候选名取第一个存在的原样列（概览指标兜底取数）—— 取不到返回 None",
    },
    "get_series": {
        "kind": "method",
        "sig": "(ref, instance=slice(None), alias=None)",
        "doc": "按 'topic.field' 取一条序列（1-D 数组 / 每实例一组 / 定长数组按列）。"
        "**取不到一律返回 None，不抛异常**——引擎按'数据不足'处理",
    },
    "has_topic": {
        "kind": "method",
        "sig": "(name) -> bool",
        "doc": "有没有这个消息/话题。表达式里的 has_topic('x') 直接指向它",
    },
    "match_version": {
        "kind": "method",
        "sig": "(spec) -> bool",
        "doc": "固件约束串是否满足（规则级 conditions.firmware 用）。约束串的语法由格式自己定，引擎不解释",
    },
    "get_info_dict": {
        "kind": "method",
        "sig": "() -> (dict, dict)",
        "doc": "日志自带的键值信息：`(info, info_multi)` 二元组——"
        "第一样是键值对（PX4 是 Information Message，如 ver_sw），第二样是多值信息（'M' 消息，如多组件版本）。"
        "没有就返回 ({}, {})",
    },
    "get_initial_parameters": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "初始参数表。没有就返回 {}",
    },
    "builtin_variables": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "内置变量表，**每次调用返回一个新 dict**（引擎会往里写 compute 的输出）。键必须覆盖下面的 BUILTIN_VARIABLES",
    },
    "get_report_facts": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "报告头的离散事实：机型 / 固件 / 时长 / 模式 / 载具身份……键名见各 provider",
    },
    # ---- 知识引擎查询 API（docs/develop/engine-api-rework.md 并入契约）----
    # 这组方法就是 provider 的**正式名字**（2026-09-24 迁移：get_topic_data→get_dataset、
    # get_logged_information→get_info_dict、get_logged_messages→get_logged_events、
    # get_flight_phases→get_mode_changed，旧名一律退场，不搞双轨）。
    # 取不到一律返回 None / [] / {}（不抛异常），与上面同一套失败语义。
    "get_start_timestamp": {
        "kind": "method",
        "sig": "() -> int|None",
        "doc": "日志第一条消息的时间戳（µs，格式各自的时基：PX4 是开机起，APM 是 TimeUS）",
    },
    "get_last_timestamp": {
        "kind": "method",
        "sig": "() -> int|None",
        "doc": "日志最后一条消息的时间戳（µs）",
    },
    "get_time_bounds": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "时间边界 {start_us, end_us, duration_s, has_wraparound}；has_wraparound=有 topic 时间戳回退（疑似中途重启）",
    },
    "get_dataset": {
        "kind": "method",
        "sig": "(topic, instance=0) -> dict|None",
        "doc": "某个 topic 某实例的**原样列** {列名: 数组}（含 'field[0]' 这种数组列）。"
        "报告页抽时序、概览指标兜底取数用它。取不到返回 None（原 get_topic_data 迁移到此名）",
    },
    "get_dataset_description": {
        "kind": "method",
        "sig": "(topic=None) -> dict|None",
        "doc": "消息格式定义 {name: {name, fields:[{name, type}]}}——是**格式声明**（含这份日志没录到的消息）；topic 给了就只回那一个。取不到返回 None",
    },
    "get_field_dtype": {
        "kind": "method",
        "sig": "(topic, field) -> str|None",
        "doc": "字段的 dtype 名（如 float32 / uint8）。取不到返回 None",
    },
    "get_field_sizeof": {
        "kind": "method",
        "sig": "(topic, field) -> int|None",
        "doc": "字段的单元素字节数（数组字段是每元素的大小，不是整列）。取不到返回 None",
    },
    "get_field_unit": {
        "kind": "method",
        "sig": "(topic, field) -> str|None",
        "doc": "字段的源单位（规范名）。**查不到返回 None**——单位表只含构建期收录的字段，不许编一个空的糊弄",
    },
    "get_changed_parameters": {
        "kind": "method",
        "sig": "() -> list[dict]",
        "doc": "运行中变更的参数 [{tSec, name, value}]。没有就返回 []",
    },
    "get_home_position": {
        "kind": "method",
        "sig": "() -> dict|None",
        "doc": "Home 点 {lat, lon, alt, ...}。这份日志给不出（没定位）就返回 None",
    },
    "get_ref_position": {
        "kind": "method",
        "sig": "() -> dict|None",
        "doc": "参考原点（局部 NED 原点，与 Home 不是一回事）{lat, lon, alt}。给不出返回 None",
    },
    "get_logged_events": {
        "kind": "method",
        "sig": "(t_start=None, t_end=None, level=None, pattern=None) -> list[dict]",
        "doc": "[{tSec, message, level, level_name}]：日志消息条目（tSec 是相对日志起点的秒数）；"
        "四个过滤参数都可省——省了就是全量。原 get_logged_messages 迁移到此名",
    },
    "get_mode_changed": {
        "kind": "method",
        "sig": "() -> list[dict]",
        "doc": "模式变化的连续区间 [{t_start_us, t_end_us, mode, ...}]（µs，格式各自时基）",
    },
    "get_armed_changed": {
        "kind": "method",
        "sig": "() -> list[dict]",
        "doc": "解锁/上锁的连续区间 [{t_start_us, t_end_us}]（µs；end 不会是 None，日志截止就用最后时间戳封口）",
    },
    "get_firmware_version": {
        "kind": "method",
        "sig": "() -> str",
        "doc": "固件版本号串（如 1.15.4 / 4.5.7）。这份日志没写版本号要如实说（返回带「未知」字样的串）",
    },
    "get_version_info": {
        "kind": "method",
        "sig": "() -> tuple|None",
        "doc": "(major, minor, patch, release_type)。解析不出返回 None",
    },
    "get_version_info_str": {
        "kind": "method",
        "sig": "() -> str",
        "doc": "版本号的展示串（含 alpha/beta/rc 后缀的完整写法）",
    },
    "get_vehicle_identity": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "载具身份 {vehicle_type, uid, hardware, ...}。没有的键给空串，不给省略——形态稳定",
    },
    "get_log_integrity": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "日志完整性 {total_dropout_ms, n_gaps, gaps, end_reached, ...}。没有丢包概念的格式给 0/[]，别装作查过",
    },
    "has_file_corruption": {
        "kind": "method",
        "sig": "() -> bool",
        "doc": "文件里有没有解析器认不出的字节段（截断/损坏旁证）",
    },
}

# ---------------- 可选能力：缺席时报告页对应 tab 自动隐藏 ----------------
# 不同格式能给的东西本来就不一样（PX4 的 ULog 有事件解码与逐字节消息统计，
# ArduPilot 的 .bin 是另一套消息流），所以可选能力由格式自己决定。
OPTIONAL = {
    # get_flight_phases 已并入 get_mode_changed（REQUIRED，µs 形态）——旧键名退场，勿再添加
    "get_logged_dropouts": {"sig": "() -> list[dict]", "doc": "[{tSec, durationMs}] 丢包记录"},
    "get_message_type_counts": {
        "sig": "() -> dict | None",
        "doc": "逐字节的消息类型统计（**只对能按帧走的格式有意义**）+ 走到文件末尾没有",
    },
    "get_decoded_events": {
        "sig": "(t_start=None, t_end=None, level=None, pattern=None) -> list[dict] | None",
        "doc": "事件解码（PX4 靠日志自带的 metadata_events；过滤参数与 get_logged_events 同义）。None = 这份日志解不出",
    },
    "has_default_parameters": {
        "sig": "() -> bool",
        "doc": "日志里带不带默认参数表（ULog 的 'Q' 消息机制）。没有这个概念的格式不必实现",
    },
    "get_default_parameters": {
        "sig": "() -> dict | None",
        "doc": "默认参数表 {param: value}。没有就返回 None（「没记录」与「没这机制」是两回事，前端要能区分）",
    },
    "report_materials": {
        "sig": "() -> dict",
        "doc": "报告页要的几块原料的打包——**不是某一个 tab 的 payload**："
        "infoDict/msgTypeStats 给「系统消息」、messages/messagesMulti 给「事件消息」、"
        "params/defaultParams/changedParams 给「飞控参数」、phases 给阶段条，"
        "四个 tab 各取所需。边界是「该格式能提供哪些原料」，"
        "而原料的形态是格式专有的（合并事件与文本、多值信息怎么拼……），"
        "换格式就是另一套，所以由格式提供而不是数据层拼",
    },
    "get_flight_track": {
        "sig": "(...) -> dict | None",
        "doc": "地图轨迹（取数字段候选与量纲也是格式专有）",
    },
    # ---- 知识引擎查询 API（可选部分：格式间差异大，缺席就隐藏对应能力）----
    "has_data_appended": {
        "sig": "() -> bool",
        "doc": "日志是否带追加数据段（ULog 的 append 机制；没有这个概念的格式不必实现）",
    },
    "get_parameter_description": {
        "sig": "(name=None) -> dict|None",
        "doc": "参数说明 {param: {min, max, desc}}。**v1 无数据源（参数字典是前端按需拉的静态 JSON）→ 返回 None**",
    },
    "platform_label": {
        "sig": "() -> str",
        "doc": "报告头里的固件族名（如 PX4 / ArduPilot）——给读者看的名字，不是 `log_type` 那种机器标识。"
        "**没有这个方法就退回 log_type**：引擎不替任何格式猜它该叫什么",
    },
}

# ---------------- builtin_variables() 必须给的键（= 规则与 plot 能引用的内置变量）----------------
# 这份表就是"作者能引用什么"的权威清单，站内指南的内置变量表由 build-knowledge.mjs
# 从这里生成。加名字 = 改契约；删名字 = 破坏兼容（老规则会构建失败，这是有意的）。
# **名字一律大写**：规则里自己赋的变量是小写，一眼就能分出"这个数是引擎给的还是自己算的"。
BUILTIN_VARIABLES = {
    "VEHICLE": {
        "type": "str",
        "doc": "机型：rotary_wing / fixed_wing / rover / airship / unknown",
    },
    "DURATION_S": {"type": "float", "doc": "日志总时长（秒）"},
    "ARMED_S": {"type": "float", "doc": "armed 总时长（秒）"},
    "T0_US": {"type": "int", "doc": "日志起点时间戳（us），事件类算子算相对时刻的基准"},
    "DROPOUT_MS": {"type": "int", "doc": "全日志丢包累计（毫秒）"},
    # ---- 知识引擎内置变量（docs/develop/engine-api-rework.md 并入）----
    # 缺什么给 None / ""（类型里写明 |None 或直接给空串），**不许编值**。
    "SYS_UUID": {"type": "str", "doc": "系统唯一 ID。这份日志没写就给空串"},
    "AIRFRAME_ID": {
        "type": "int|None",
        "doc": "机架编号（PX4: SYS_AUTOSTART；APM: FRAME_CLASS）。没有就 None——与 AIRFRAME（机型字符串）是两个东西",
    },
    "HOME_LAT": {"type": "float|None", "doc": "Home 点纬度（度）。给不出定位就 None"},
    "HOME_LON": {"type": "float|None", "doc": "Home 点经度（度）"},
    "HOME_ALT": {"type": "float|None", "doc": "Home 点高度（米）"},
    "SW_VER": {"type": "str", "doc": "软件版本号串（如 1.15.4）。没写版本号给「未知」字样的串"},
    "SW_VER_HASH": {"type": "str", "doc": "软件版本 git 哈希。没写就空串"},
    "HW_VER": {"type": "str", "doc": "硬件版本名。没写就空串"},
    "HW_VER_SUBTYPE": {"type": "str", "doc": "硬件版本子型号。没写就空串"},
    "FLIGHT_TIME_S": {"type": "float|None", "doc": "载具累计飞行时长（秒，参数里的计数器）。没有就 None"},
}

# 框架提供的函数（engine.py 注入 _COMPUTE_GLOBALS + env）：
#   has_topic()  —— 消息存在判定，指向 provider.has_topic
#   _cfg()       —— 读飞控参数，查 provider.get_initial_parameters()
#   log_ok()     —— 日志完整性，指向 provider.is_log_ok


# ---------------- 格式注册表 ----------------
# 各 providers/<格式>.py 在文件末尾把 (探测器, 工厂, 说明, log_type) 追加进来。探测靠文件头
# magic，不靠扩展名（用户上传的文件名不可信）。
#   探测器  detect(raw) -> bool
#   工厂    make(raw, facts_cfg) -> provider（facts_cfg 是那一份数据 YAML，由引擎传进来；
#           之所以显式传而不是读全局，是为了让"这个 provider 用哪份数据"一目了然）
#   log_type  格式标识（如 px4-ulog），**与适配器类上的 `log_type` 是同一个串**。
#
# 为什么把它塞进注册表而不是"引擎从 provider 实例上读"：引擎同时装着好几套知识
# （knowledge/px4 与 knowledge/ardupilot 各自的规则 / 数据 / 故障库），而**挑知识必须先
# 知道格式、挑格式又发生在打开日志之前**——探测器是唯一能在"还没构造 provider"时就回答
# 这一步的东西。有了它 `open_log()` 一行都不用改。
FORMATS = []

_VALUE_TYPES = {
    "int": (int,),
    "float": (int, float),
    "bool": (bool,),
    "str": (str,),
    "list": (list, tuple),
    "dict": (dict,),
}


def match_version_spec(cur, spec):
    """固件约束串的**共享解释器**（各 provider 的 match_version 都走这里，别各写一份）。

    语法：any / ">=1.15" / "<1.15" / ">=1.14,<1.15"（逗号=与）。cur 是 (major, minor)
    二元组；None = 版本未知。
    解析失败**一律抛 ValueError**——那是规则作者的笔误，与这份日志有没有版本号无关，
    不能被"版本未知就放行"盖过去；版本未知时按"不因版本排除"处理（返回 True）。
    """
    import re as _re

    if not spec or spec == "any":
        return True
    conds = []
    for part in str(spec).split(","):
        m = _re.match(r"^\s*(>=|<=|==|>|<)?\s*(\d+)\.?(\d+)?\s*$", part)
        if not m:
            raise ValueError("无法解析 firmware 约束：%r" % spec)
        conds.append((m.group(1) or ">=", (int(m.group(2)), int(m.group(3) or 0))))
    if cur is None:
        return True
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


def detect_log_type(raw):
    """按文件头认出这是哪种日志，**不构造 provider**（只跑探测器）。

    引擎拿它当"该用哪一套知识"的开关：规则 / 数据 / 故障库 / 单位表在产物里都是
    `{log_type: ...}` 的形状，先认格式才能取出对应那一套。认不出来返回 None。
    """
    for detect, _make, _label, log_type in FORMATS:
        if detect(raw):
            return log_type
    return None


def open_log(raw, facts_cfg=None):
    """按文件头挑一个适配器打开日志，并立刻做一次契约自检；挑不出来就报人话错误。

    facts_cfg 是**已经挑好的那一份**数据（多格式时代由引擎按 `detect_log_type()` 挑，
    见 engine.py）——这里不做挑选，因为挑知识要先知道格式，而格式是探测器说了算。
    """
    for detect, make, label, _log_type in FORMATS:
        if detect(raw):
            return check_provider(make(raw, facts_cfg), label)
    known = "、".join(label for _, _, label, _ in FORMATS) or "（无）"
    raise ValueError("不认识的日志格式：本站目前只支持 %s。扩展名不作数，判据是文件头 magic" % known)


def _type_matches_spec(value, spec):
    want = spec.get("type")
    if want is None:
        return True
    if value is None:
        return "None" in want  # 只有写明允许 None 的才接受 None
    for part in want.replace("|None", "").split("|"):
        part = part.strip()
        base = part.split("[")[0]
        if isinstance(value, _VALUE_TYPES.get(base, ())):
            return True
    return False


def check_provider(provider, where="provider"):
    """运行期自检：契约里要求的东西，这个 provider 真的给了吗、类型对吗。

    为什么还要这一道（构建期不是已经查过 AST 了吗）：AST 只看"有没有定义"，
    看不了"跑起来给的是什么"——比如 builtin_variables() 少返回一个键、FW_MINOR 给了字符串。
    这类问题如果放过，表现是**静默失效**（规则算不出数据 → 不发射 finding），很难查。
    """
    for name, spec in REQUIRED.items():
        if not hasattr(provider, name):
            raise ValueError("%s 缺少契约要求的能力：%s（%s）" % (where, name, spec["doc"]))

    sem = provider.builtin_variables()
    if not isinstance(sem, dict):
        raise ValueError("%s.semantics() 必须返回 dict" % where)
    for key, spec in BUILTIN_VARIABLES.items():
        if key not in sem:
            raise ValueError("%s.semantics() 缺少内置变量 %s（%s）—— 规则里引用它会静默算不出数据" % (where, key, spec["doc"]))
        if not _type_matches_spec(sem[key], spec):
            raise ValueError("%s.semantics()[%s] 类型不对：期望 %s，得到 %r" % (where, key, spec["type"], sem[key]))
    # 每个 provider 都要能独立喂给多个规则：返回的必须是新 dict（引擎会往里写 compute 输出）
    sem2 = provider.builtin_variables()
    if sem2 is sem:
        raise ValueError("%s.semantics() 每次都必须返回新的 dict（引擎会往里写变量）" % where)

    if not isinstance(provider.get_report_facts(), dict):
        raise ValueError("%s.facts() 必须返回 dict" % where)
    if not isinstance(provider.get_topic_meta(), list):
        raise ValueError("%s.messages() 必须返回 list" % where)
    if not isinstance(provider.parser_version(), str):
        raise ValueError("%s.parser_version() 必须返回 str" % where)
    # 时间边界是这批查询 API 里唯一被其他断言拿来做基准的聚合（guard 用它核对 duration），
    # 形状错了要让所有下游跟着错——在这里先拦住
    tb = provider.get_time_bounds()
    if not isinstance(tb, dict) or not {"start_us", "end_us", "duration_s", "has_wraparound"} <= set(tb):
        raise ValueError("%s.get_time_bounds() 必须返回含 start_us/end_us/duration_s/has_wraparound 的 dict" % where)
    return provider
