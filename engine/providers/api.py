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
#   3. 契约测试：tools/calibrate/check_provider.py，对每个 provider 跑同一套断言
#      （失败语义、get_topic_meta() 与 get_series() 自洽、armed_intervals 的形状……）
#
# 加一个适配器（如 ardupilot.py）要做的事：实现 REQUIRED，按需实现 OPTIONAL，
# 把工厂追加进 FORMATS，然后跑通 check_provider.py —— 引擎一行都不用改。

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
    "get_topic_data": {
        "kind": "method",
        "sig": "(topic, instance=0) -> dict|None",
        "doc": "某个 topic 某实例的**原样列** {列名: 数组}（含 'field[0]' 这种数组列）。"
        "报告页抽时序、概览指标兜底取数用它。取不到返回 None",
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
    "get_logged_information": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "日志自带的键值信息（PX4 是 Information Message）。没有就返回 {}",
    },
    "get_initial_parameters": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "初始参数表。没有就返回 {}",
    },
    "get_logged_messages": {
        "kind": "method",
        "sig": "() -> list[dict]",
        "doc": "[{tSec, message, level, level_name}]：日志消息条目（tSec 是相对日志起点的秒数）",
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
}

# ---------------- 可选能力：缺席时报告页对应 tab 自动隐藏 ----------------
# 不同格式能给的东西本来就不一样（PX4 的 ULog 有事件解码与逐字节消息统计，
# ArduPilot 的 .bin 是另一套消息流），所以可选能力由格式自己决定。
OPTIONAL = {
    "get_flight_phases": {
        "sig": "() -> list[dict]",
        "doc": "连续飞行阶段（报告页阶段条）。缺席则该条不显示",
    },
    "get_logged_dropouts": {"sig": "() -> list[dict]", "doc": "[{tSec, durationMs}] 丢包记录"},
    "get_message_type_counts": {
        "sig": "() -> dict | None",
        "doc": "逐字节的消息类型统计（**只对能按帧走的格式有意义**）+ 走到文件末尾没有",
    },
    "get_decoded_events": {
        "sig": "() -> list[dict] | None",
        "doc": "事件解码（PX4 靠日志自带的 metadata_events）。None = 这份日志解不出",
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
}

# ---------------- builtin_variables() 必须给的键（= 规则与 plot 能引用的内置变量）----------------
# 这份表就是"作者能引用什么"的权威清单，站内指南的内置变量表由 tools/px4/gen_rule_reference.py
# 从这里生成。加名字 = 改契约；删名字 = 破坏兼容（老规则会构建失败，这是有意的）。
# **名字一律大写**：规则里自己赋的变量是小写，一眼就能分出"这个数是引擎给的还是自己算的"。
BUILTIN_VARIABLES = {
    "FW_MINOR": {
        "type": "int|None",
        "doc": "固件次版本号。**版本分支唯一常用的量**；None = 这份日志没写版本号",
    },
    "AIRFRAME": {
        "type": "str",
        "doc": "机型：rotary_wing / fixed_wing / rover / airship / unknown",
    },
    "IS_FIXED_WING": {"type": "bool", "doc": "机型别名（比 AIRFRAME == 'fixed_wing' 好读）"},
    "DURATION_S": {"type": "float", "doc": "日志总时长（秒）"},
    "ARMED_S": {"type": "float", "doc": "armed 总时长（秒）"},
    "ARMED_INTERVALS": {
        "type": "list[(us,us)]",
        "doc": "armed 区间，升序不重叠；end=None 表示持续到日志结束。时序算子按它切窗",
    },
    "T0_US": {"type": "int", "doc": "日志起点时间戳（us），事件类算子算相对时刻的基准"},
    "HAS_ARMED": {"type": "bool", "doc": "是否存在 armed 段"},
    "RESTART_DETECTED": {"type": "bool", "doc": "是否有 topic 时间戳回退（疑似中途重启）"},
    "DROPOUT_MS": {"type": "int", "doc": "全日志丢包累计（毫秒）"},
    "MESSAGES": {"type": "list[dict]", "doc": "日志消息条目（供消息类经验按级别筛选）"},
}

# 框架自己往 env 里补的名字（**不属于** provider）：
#   has_topic() —— 表达式里唯一放行的函数调用，指向 provider.has_topic


# ---------------- 格式注册表 ----------------
# 各 providers/<格式>.py 在文件末尾把 (探测器, 工厂, 说明) 追加进来。探测靠文件头 magic，
# 不靠扩展名（用户上传的文件名不可信）。
#   探测器  detect(raw) -> bool
#   工厂    make(raw, facts_cfg) -> provider（facts_cfg 是那一份数据 YAML，由引擎传进来；
#           之所以显式传而不是读全局，是为了让"这个 provider 用哪份数据"一目了然）
FORMATS = []

_VALUE_TYPES = {
    "int": (int,),
    "float": (int, float),
    "bool": (bool,),
    "str": (str,),
    "list": (list, tuple),
    "dict": (dict,),
}


def open_log(raw, facts_cfg=None):
    """按文件头挑一个适配器打开日志，并立刻做一次契约自检；挑不出来就报人话错误。"""
    for detect, make, label in FORMATS:
        if detect(raw):
            return check_provider(make(raw, facts_cfg), label)
    known = "、".join(label for _, _, label in FORMATS) or "（无）"
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
    return provider
