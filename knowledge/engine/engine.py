# ============================================================================
# 引擎本体 —— 规则框架 + 报告页数据层，**与日志格式无关**
#
# 第一部分（规则框架）做四件事：调度规则、求值表达式、调算子、发射 finding。
# 第二部分（报告页数据层）做三件事：按需抽时序（+ LTTB 降采样）、交给前端、
# 把格式专有的整块内容转出去。两部分都不认识任何 topic 名 / 字段名 / 码值 ——
# 那些全在 providers/<格式>.py 与 knowledge/<格式>/facts.yaml 里。判据：本文件里
# grep 不到 `vehicle_` / `ver_sw` / `cpuload` 之类的名字
# （tools/engine/check_rules_fields.py 有一条检查盯着）。
#
# 数据从哪来：providers/api.py 的契约。provider 由 open_log() 按文件头挑出来，
# 本文件只调它的 get_topic_meta/get_dataset/get_series/has_topic/match_version/
# get_info_dict/get_initial_parameters/get_logged_events/
# builtin_variables/get_report_facts 与可选能力，不碰 pyulog 对象。
#
# 装载方式：本文件与 operators/providers 跑在**同一个 __main__ globals** 里——
# 浏览器由 analysis-worker.ts 整段执行拼接产物，本地由 loader.py 同序拼接，
# 所以直接用那边建好的 `provider`。
# ============================================================================

import json
import ast
import math
import re
from types import SimpleNamespace as _SimpleNamespace
import numpy as np


# ============================================================================
# 第一部分：规则框架
# ============================================================================

# ---------------- 这一份日志该用哪一套知识 ----------------
# 知识是**按固件族分开**的：knowledge/px4/ 与 knowledge/ardupilot/ 各有自己的规则、
# 数据文件、故障库与单位表，构建期把它们内联成 `{log_type: ...}` 的形状。
# 而"用哪一套"取决于这份日志是什么格式——所以先看文件头（detect_log_type），再取下标。
# 顺序不能倒：open_log() 要拿 FACTS 去构造 provider，而 FACTS 又得先知道格式。
_LOG_TYPE = detect_log_type(bytes(ulog_bytes))
if _LOG_TYPE is None:
    raise ValueError("不认识的日志格式（连探测器都没认出来）——见 providers/api.py 的 FORMATS")

_LOG_TYPE_KNOWLEDGE = {
    "fault_kb": __FAULT_KB__,
    "rules": json.loads(r"""__RULES__"""),
    "facts": json.loads(r"""__FACTS__"""),
    "field_units": __FIELD_UNITS__,
}

# 故障知识库（构建期内联，第三层检索用）
FAULT_KB = _LOG_TYPE_KNOWLEDGE["fault_kb"].get(_LOG_TYPE, [])

# ---------------- 经验规则（rules/*.yaml 编译而来）----------------
RULES = _LOG_TYPE_KNOWLEDGE["rules"].get(_LOG_TYPE, [])

# ---------------- 那一份数据文件（knowledge/<格式>/facts.yaml 编译而来）----------------
# 码表、文案、展示口径、规则元数据、执行顺序都在里面；引擎只提供机制。
# 它同时也是 provider 的数据源（随 open_log 一起传进去）。
# **按 JSON 解析**（与 RULES 同款）：它里面可能有 true / false / null（绘图预设的开关），
# 那些不是合法的 Python 字面量——当字面量注入会直接 NameError。
FACTS = _LOG_TYPE_KNOWLEDGE["facts"].get(_LOG_TYPE, {})

# ---------------- 字段单位表（构建期查好的，只含写了 unit= 的引用涉及的字段）----------------
# 源单位从 meta/<tag>.json 查（经 meta/topic-map.yaml 换字典键）、meta/topic-overrides.yaml
# 可补/纠。查不到的构建期会告警并在产物里留空——这里拿不到就**不换算**。
# 键是 `topic.field`（日志里的名字，不是字典键），值是规范化后的单位名（见 _UNIT_FACTORS）。
# **换算是"声明了才做"**：APM 那份是空的（它的单位声明在 FMTU 里、没核对过），
# 于是 APM 规则取到什么就是什么——不换算比换算错好。
FIELD_UNITS = _LOG_TYPE_KNOWLEDGE["field_units"].get(_LOG_TYPE, {})

# 同一 group 内多条规则按 order 字段排序（缺省 100000，再按 id 兜底）。
# **跨 group 的顺序不在这里决定**：由 facts.yaml 的 group_order 决定（见文件末尾的执行循环），
# 而 finding 的 id（F01、F02…）按发射顺序生成，所以改 group_order 会改报告里的编号。
RULES.sort(key=lambda r: (r.get("order", 100000), r.get("id", "")))

# 阈值不再集中存放：每条经验的判定阈值都写在它自己的 rules/*.yaml 里
# （px4-thresholds.toml 已退场）。本文件只保留引擎级格式常量。

# ---------------- 打开日志（挑适配器 + 契约自检）----------------
provider = open_log(bytes(ulog_bytes), FACTS)

# 下面这批累加器由 run_all()（文件末尾）在入口**重置**。声明留在模块级是因为
# add / add_tag / ran / skipped / _run_rules 都直接往它们里追加（靠模块名字找）——
# 入口只重绑，不改变这些辅助函数的写法。
findings = []
checks_run = []
checks_skipped = []
tags = []  # 第二层异常标签（喂给第三层故障库匹配）
guard_tags = []  # 数据质量/边界标签
_fid = [0]
# 阶段集合来自 provider（故障库按 flight_phase 匹配用它）——在 run_all() 里填充
phases_present = set()
# 规则顺带产出的实测值（概览指标优先用它们，见 run_all 里的指标组装）
metrics = {}


def add_tag(t):
    if t not in tags:
        tags.append(t)


def add(rule_id, severity, label, description, evidence, suggestion=None, docurl=None):
    _fid[0] += 1
    f = {
        "id": "F%02d" % _fid[0],
        "severity": severity,
        "ruleId": rule_id,
        "label": label,
        "description": description,
        "evidence": evidence,
    }
    if docurl:
        f["docUrl"] = docurl
    if suggestion:
        f["suggestion"] = suggestion
    findings.append(f)
    if label:
        add_tag(label)


def skipped(rule_id, reason):
    item = {"ruleId": rule_id, "reason": reason}
    if item not in checks_skipped:
        checks_skipped.append(item)


def ran(rule_id):
    if rule_id not in checks_run:
        checks_run.append(rule_id)


# ---------------- 受限表达式求值 ----------------
_ALLOWED_NODES = (
    ast.Expression,
    ast.BoolOp,
    ast.And,
    ast.Or,
    ast.UnaryOp,
    ast.Not,
    ast.USub,
    ast.Compare,
    ast.Lt,
    ast.LtE,
    ast.Gt,
    ast.GtE,
    ast.Eq,
    ast.NotEq,
    ast.In,
    ast.NotIn,
    ast.Is,
    ast.IsNot,
    ast.BinOp,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.Mod,
    ast.BitAnd,
    ast.BitOr,
    # 下标：arr[mask]（布尔索引替换 apply_mask）、arr[0] / arr[-1]（单元素）、arr[:] 等
    ast.Subscript,
    ast.Slice,
    ast.Name,
    ast.Load,
    ast.Constant,
    ast.List,
    ast.Tuple,
    ast.Set,
    # f-string（证据值用：`value: f"{vibe_mean:.3f}"`）。它的占位符里还是普通表达式，
    # 求值仍在同一个空 __builtins__ 环境下，没有新能力。
    ast.JoinedStr,
    ast.FormattedValue,
)

# 表达式里**唯一**放行的函数调用。`has_topic('x')` 比 `'x' in topics` 直白，
# 但把它做成函数就意味着要开"允许调用"这个口子，所以白名单只此一项、
# 且要求实参是字符串字面量。其余能力（属性/下标/推导式）一律不给。
_EXPR_CALLABLE = {"has_topic"}


def _eval_expr(expr, env):
    """受限表达式求值：先按白名单遍历 AST，再在空 __builtins__ 下求值。

    绝不 eval 用户可控代码：不允许属性访问、下标、推导式；函数调用只放行
    `_EXPR_CALLABLE` 里的那几个，且实参必须是字符串字面量。
    """
    tree = ast.parse(expr, mode="eval")
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            ok = isinstance(node.func, ast.Name) and node.func.id in _EXPR_CALLABLE
            arg_ok = len(node.args) == 1 and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str)
            if not (ok and arg_ok and not node.keywords):
                raise ValueError("表达式里只允许 %s('字符串')：%s" % ("/".join(sorted(_EXPR_CALLABLE)), expr))
            continue
        if not isinstance(node, _ALLOWED_NODES):
            raise ValueError("表达式含不允许的语法 %s：%s" % (type(node).__name__, expr))
    return eval(compile(tree, "<rule>", "eval"), {"__builtins__": {}}, env)


def _placeholder_reason(spec):
    """`conditions.placeholder`：这条经验**还没实现**，引擎别跑它。

    为什么要有这个一等字段：2026-09 之前占位是把一句字符串字面量塞进 `precheck`
    （构建期剥引号放行、运行期恒真）——能工作，但把"未实现"伪装成"先决条件命中"，
    报告里那句原因看着像判据，其实是施工告示。`precheck` 退役后占位单独成字段，
    语义和文案都对得上了。

    写法就是一个字符串（原因文案），`true` 给一句缺省文案。没写 → None。
    """
    if isinstance(spec, str) and spec.strip():
        return spec.strip()
    if spec is True:
        return "本条尚未实现"
    return None


def _match_mode(spec, env):
    """`conditions.mode`：与 `topics` **同形**——每项是「候选模式」，项间是「都要出现」。

    一项里写 `AUTO || LOITER` 表示任一出现过即满足；写成两项就要求都出现过。
    匹配的是"日志里出现过"（`MODES_PRESENT`），不是"当前处于"——规则看的是
    整段日志，不是一个时刻。

    返回缺失项的原因文案（`"AUTO / LOITER 未在日志中出现"`），满足则返回 None。
    ⚠ 日志没有模式段时 `MODES_PRESENT` 是空列表，写了 mode 约束就会跳过——
    这是**故意**的：拿不到模式就去跑只适用于某模式的阈值，只会误报。
    """
    present = set(env.get("MODES_PRESENT") or [])
    for candidates in spec or []:
        if isinstance(candidates, str):
            candidates = [t.strip() for t in candidates.split("||")]
        if not any(m in present for m in candidates):
            return " / ".join(str(c) for c in candidates) + " 未在日志中出现"
    return None


def _match_armed(spec, env):
    """`conditions.armed`：解锁条件（取代原先写在 `precheck` 里的 `HAS_ARMED` 那半）。

    - 不写 / `any`：不限（缺省）
    - `true`：必须有 armed 段；`false`：必须全程未解锁
    - `">12"` / `">=12"` 这类带比较符的串：对 `ARMED_S`（解锁**总时长**，秒）求值
    - 写数字 `12`：等价 `>= 12`

    判据算不出来（语法写错、`ARMED_S` 是 None）当作**不满足**并跳过——这里与当初
    `precheck` 的取向相反（那边是"宁可多跑一条"）：门槛是作者明确写的，拿不到数还跑，
    等于在没解锁的日志上套用只适用于飞行段的阈值，会误报。

    返回原因文案，满足则返回 None。
    """
    if spec is None:
        return None
    # 布尔与字符串 "true"/"false" 同义（YAML 里两种写法都会出现，别让作者猜）
    want = None
    if isinstance(spec, bool):
        want = spec
    elif isinstance(spec, str) and spec.strip().lower() in ("true", "false"):
        want = spec.strip().lower() == "true"
    if want is not None:
        if want == bool(env.get("HAS_ARMED")):
            return None
        return "本条只在有解锁段时适用" if want else "本条只在全程未解锁时适用"
    txt = str(spec).strip()
    if txt == "" or txt.lower() == "any":
        return None
    expr = "ARMED_S %s" % txt if txt[0] in "<>=!" else "ARMED_S >= %s" % txt
    try:
        if _eval_expr(expr, env):
            return None
    except Exception:
        return "解锁时长判据算不出来：%s" % txt
    return "解锁时长不满足 %s（实际 %s s）" % (txt, env.get("ARMED_S"))


def _vehicle_label(spec):
    """机架约束的展示写法（只用于 skipped 文案）：列表用 ` / ` 连接。"""
    if isinstance(spec, list):
        return " / ".join(str(s).strip() for s in spec)
    return str(spec).strip()


def _match_vehicle(spec, env):
    """机架适用范围：`any` ｜ 单个机架名 ｜ 列表（如 `[fixed_wing, unknown]`）。

    **只做字符串精确比对，不解释语义**：拿 provider 在 `builtin_variables()` 里报的
    `VEHICLE` 值去比（PX4 报 rotary_wing / fixed_wing / vtol / rover / unknown）。
    所以换一种日志格式不用改这里——它的机架词表由它自己的适配器定义。

    写成 `IS_FIXED_WING or VEHICLE == 'unknown'` 那种表达式是旧写法，构建期已拦。
    """
    if isinstance(spec, str):
        name = spec.strip()
        if name == "any":
            return True
        wanted = [name]
    elif isinstance(spec, list):
        if not spec:
            raise ValueError("vehicle 列表为空（不限就写 any）")
        wanted = [str(s).strip() for s in spec]
    else:
        raise ValueError("vehicle 必须是 any / 机架名 / 列表，收到 %r" % (spec,))
    current = (env or {}).get("VEHICLE")
    return current is not None and str(current) in wanted


def _missing_topics(spec):
    """`conditions.topics` 的判定：每项是「候选 topic」，项间是「都要有」。

    一项里有多个候选（YAML 里写成 `vehicle_gps_position || sensor_gps`）时，
    **其中任意一个在日志里就算满足**；两个都不在才跳过。命中第一项即中止——
    与过去 skip 列表命中第一条的语义相同。

    返回缺失项的原因文案（`"a / b not in log"`），全都有则返回 None。
    文案只在这里生成一处：构建期只负责把 `a || b` 拆成候选列表，不认识语义。
    """
    for candidates in spec or []:
        if not any(provider.has_topic(t) for t in candidates):
            return " / ".join(candidates) + " not in log"
    return None


def _pick_ref(name, *more, alias=None, unit=None, instance=None):
    """候选组按顺序取第一个存在的 → `(序列, 命中的 bare "topic.field")`；都没有 → `(None, None)`。

    与 `_ref` 是同一件事，区别只在**回传命中的是哪个字段**——地图轨迹要用它去同一 topic 上
    取时间戳与定位类型（`fix_type`），图上的时间轴也要。`instance` 非 None 时**覆盖**引用里
    写的实例**切片**（图上"每实例一个面板"用：声明里写 `[:]`，具体画第几个由这一层定）；
    写死的 `[N]`、以及**不写下标**（= 实例 0）都不受它影响。
    """
    for cand in (name, *more):
        bare, inst = _split_ref(cand)
        if instance is not None and isinstance(inst, slice):
            inst = instance
        series = provider.get_series(bare, instance=inst, alias=alias)
        if series is None:
            continue
        if unit is not None:
            scale = _unit_scale(FIELD_UNITS.get(bare), unit)
            if scale is not None:
                series = _scale_series(series, scale)
        return series, bare
    return None, None


def _ref(name, *more, alias=None, unit=None):
    """字段取数：表达式里的 `ref("topic.field", ...)` 与裸写的 `topic.field` 都走这里。

    字段名有两种下标，别混：
      `topic.field`     —— **只取第 0 个实例**（与 `topic[0].field` 同义）。要别的实例
                          就写明；要"所有实例"必须写 `[:]`
      `topic[:].field`  —— **所有实例**。多实例时给「每实例一组」的列表，交给需要分组
                          的算子；**只有一个实例时就是那一条序列**（与写 `[0]` 同形）
      `topic[a:b].field`—— 闭区间，实例 a~b（**含 b**），如 `[1:3]` = 1、2、3
      `topic[N].field`  —— 只取第 N 个实例（N 可为负，按 Python 语义从末尾数）
      `topic.field[N]`  —— 数组字段的元素下标（如 `vehicle_attitude.q[0]`）

    **位置参数可以给多个**：`ref("新名", "旧名")` 是候选组——按顺序取第一个在日志里
    存在的；都没有返回 None，由数据流自己中止。改名的场合一律用它，**没有"这个引用只
    适用于某版本"这种写法**（升级换代就是"老名字没了、新名字在"，按存在性挑就够——
    真需要按版本分流的语义差异，交给算子或拆成两条规则）。

    修饰：
      alias    —— 字段的备用命名（旧固件改过名），等价于放进候选组
      unit     —— **期望输出的单位**：源单位由构建期从 meta/override 查好，这里只做一次
                  乘法。不写就是不换算（无量纲字段）。源单位查不到时构建期已告警，这里
                  按原样给——宁可不换算，也别悄悄乘错系数。

    取数本身由 provider 实现（契约：取不到返回 None，不抛异常）——存在性判据就是它。
    **要回传"命中的是哪个字段"用 `_pick_ref`**（图与地图用），这里只是它的薄壳。
    """
    return _pick_ref(name, *more, alias=alias, unit=unit)[0]


def _split_ref(ref):
    """`"topic[:].field"` → ("topic.field", 所有实例)；`[N]` → int；**不写下标 → 0**。

    实例说明交给 provider 直接用下标取（Python 的 int/切片语义），这里只负责拆开。
    """
    m = re.match(r"^([a-z][a-z0-9_]*)(?:\[([-]?\d*(?::-?\d*)?)\])?\.(.+)$", str(ref))
    if not m:
        return str(ref), 0
    return "%s.%s" % (m.group(1), m.group(3)), _parse_inst(m.group(2))


def _parse_inst(txt):
    """`[2]` → int；`[1:3]` → slice（**闭区间**，含 3）；**不写** → 0（只取第 0 个实例）。

    区间按**闭区间**算（`[1:3]` = 实例 1、2、3）——这是知识库的写法约定，与 Python 切片
    "含头不含尾"相反，所以转 Python slice 时**上界要 +1**：这里返回的 slice 打印出来
    比写的多 1，**别照着它的数字读实例号**（报错文案里也不打 slice，只打闭区间）。
    """
    if txt is None or txt == "":
        return 0
    if ":" in txt:
        a, _, b = txt.partition(":")
        start = int(a) if a else None
        stop = int(b) if b else None
        if stop is not None:
            # 闭区间 → 半开：上界 +1。`[:-1]` 那一端 +1 得 0（取空），改用 None（到末尾）
            stop = None if stop + 1 == 0 else stop + 1
        return slice(start, stop)
    return int(txt)


# ---------------- 单位换算 ----------------
# 只服务 `ref(..., unit="期望单位")`。按「到族基准单位的因子」定义：族内可换、跨族不行
# （跨族在构建期就报错了）。键是**规范化后**的单位名——构建期把 meta 里那些自由文本
# （"metres" / "radians" / "us"…）统一成这一套，运行期不再认别名的拼法。
_UNIT_FACTORS = {
    # 长度（基准 m）
    "m": ("len", 1.0),
    "mm": ("len", 1e-3),
    "cm": ("len", 1e-2),
    # 角度（基准 rad）。degE7 = 度 × 1e7，PX4 经纬度的老口径
    "rad": ("angle", 1.0),
    "deg": ("angle", math.pi / 180),
    "dege7": ("angle", 1e-7 * math.pi / 180),
    # 时间（基准 s）
    "s": ("time", 1.0),
    "ms": ("time", 1e-3),
    "us": ("time", 1e-6),
}


def _unit_scale(src, dst):
    """从 src 换到 dst 的乘数；任一边认不出、或跨族 → None（构建期已经查过一遍）。"""
    a = _UNIT_FACTORS.get(str(src or "").strip().lower())
    b = _UNIT_FACTORS.get(str(dst or "").strip().lower())
    if not a or not b or a[0] != b[0]:
        return None
    return a[1] / b[1]


def _scale_series(x, scale):
    """按因子缩放一条序列。数组字段是「每元素一列」，分组取数是「每实例一组」——都递归下去。"""
    if x is None:
        return None
    if isinstance(x, list):
        return [_scale_series(v, scale) for v in x]
    return np.asarray(x, dtype=float) * scale


# ---------------- compute 表达式求值 ----------------
# 产物里存的**就是作者写的原文**：
#   vibe_mean, vibe_p95, ..., imu_idx = worst_mean_stats(ref("...[:]"), min_mean=0)
#   pct = frac * 100
#   p99_stat = p99 if seg_n > 50 else None
#
# 求值用 Python 自带的 ast，**不 eval 作者原文**：先按白名单遍历、把 topic.field 重写成
# 取数调用，再在空 __builtins__ 下 exec。构建期（web/scripts/lib/rule-expr.mjs）已经把
# 算子名/入参/变量声明校验过一遍，这里再查一遍是为了防"构建期放行、运行期能执行任意代码"
# 这类缝——两道关卡的判据不同，不能只留一道。

# compute 里放行的**直接调用**：注册过的算子 + 这四个框架函数。
#   ref("topic.field")  取一列
#   _try(expr)          容错：内层出错时整条赋值结果为 None
#   has_topic("name")   这个消息在不在（与 when 里同一个函数，语义一致）
#   param("NAME")       读飞控参数（**不是算子**，见下面 `_param_fn` 的说明）
_COMPUTE_CALLABLE = ("ref", "_try", "has_topic", "param", "len", "int")

# compute 里允许的**模块名**：裸 Name.attr 碰到这些名字不重写为 ref()，
# 而是保留为模块.函数 调用（如 np.ptp / np.hypot / np.isin）。
_COMPUTE_MODULES = {"np"}

# 比 _ALLOWED_NODES 多出：赋值语句、调用、属性（字段引用）、三元、字典（算子选项）
_ALLOWED_COMPUTE = _ALLOWED_NODES + (
    ast.Module,
    ast.Assign,
    ast.Expr,
    ast.Store,
    ast.Call,
    ast.Attribute,
    ast.keyword,
    ast.IfExp,
    ast.Dict,
)


class _ComputeRefs(ast.NodeTransformer):
    """把表达式里裸写的 `topic.field` / `topic[N].field` / `topic[i].field[j]`
    重写成 `ref("topic.field")` / `ref("topic[N].field")` / `ref("topic[i].field[j]")`。

    只接受 `Name.attr` / `Name[N].attr` / `Name[N].attr[M]` 形态，且这个 Name
    **不能是已声明的变量**——否则 `变量.属性` 会去访问对象属性（那是任意能力，白名单不给）。
    """

    def __init__(self, env_keys):
        self.env_keys = env_keys

    # ---- helpers ----

    def _is_topic_name(self, name):
        if name in _COMPUTE_MODULES:
            return False
        if name in self.env_keys:
            raise ValueError("%s 是变量名，不能当 topic 用" % name)
        return True

    def _format_slice(self, slc):
        """ast 下标节点 → ref 字符串里的下标片段（如 ``i`` / ``0`` / ``:``）"""
        if isinstance(slc, ast.Constant):
            return str(slc.value)
        if isinstance(slc, ast.Name):
            return slc.id
        if isinstance(slc, ast.Slice):

            def _fmt(s):
                if s is None:
                    return ""
                if isinstance(s, ast.Constant):
                    return str(s.value)
                if isinstance(s, ast.Name):
                    return s.id
                if isinstance(s, ast.UnaryOp) and isinstance(s.op, ast.USub) and isinstance(s.operand, ast.Constant):
                    return "-" + str(s.operand.value)
                return "..."

            return "%s:%s" % (_fmt(slc.lower), _fmt(slc.upper))
        return "..."

    def _build_ref(self, node, prefix):
        """构造 ref("prefix.attr") 调用节点"""
        key = "%s.%s" % (prefix, node.attr)
        return ast.copy_location(
            ast.Call(
                func=ast.Name(id="ref", ctx=ast.Load()),
                args=[ast.Constant(value=key)],
                keywords=[],
            ),
            node,
        )

    # ---- visitors ----

    def visit_Attribute(self, node):
        self.generic_visit(node)

        # 情况 1：topic.field（当前支持）
        if isinstance(node.value, ast.Name):
            if self._is_topic_name(node.value.id):
                return self._build_ref(node, node.value.id)
            return node

        # 情况 2：topic[N].field（新增 —— 下标在属性左边）
        if isinstance(node.value, ast.Subscript) and isinstance(node.value.value, ast.Name):
            name = node.value.value.id
            if self._is_topic_name(name):
                idx = self._format_slice(node.value.slice)
                return self._build_ref(node, "%s[%s]" % (name, idx))
            return node

        return node

    def _is_simple_slice(self, slc):
        """下标是否为简单索引（常数/变量/切片），可安全并入 ref 字符串。"""
        return isinstance(slc, (ast.Constant, ast.Name, ast.Slice, ast.Tuple))

    def visit_Subscript(self, node):
        self.generic_visit(node)

        # 情况 3：ref(...) 被 visit_Attribute 转换后又被下标 —— topic.field[j]
        # 但只对简单下标合并；布尔掩码等复杂表达式留给 Python 运行时评估
        if (
            isinstance(node.value, ast.Call)
            and isinstance(node.value.func, ast.Name)
            and node.value.func.id == "ref"
            and node.value.args
            and self._is_simple_slice(node.slice)
        ):
            if not isinstance(node.value.args[0], ast.Constant) or not isinstance(node.value.args[0].value, str):
                return node
            old_key = node.value.args[0].value
            idx = self._format_slice(node.slice)
            new_key = "%s[%s]" % (old_key, idx)
            return ast.copy_location(
                ast.Call(
                    func=ast.Name(id="ref", ctx=ast.Load()),
                    args=[ast.Constant(value=new_key)],
                    keywords=[],
                ),
                node,
            )

        return node


def _compile_compute(stmt, env_keys):
    """一条 compute 表达式 → (code, guarded, targets)。校验不通过就抛异常。"""
    try:
        tree = ast.parse(stmt, mode="exec")
    except SyntaxError as err:
        raise ValueError("compute 表达式语法错误：%s" % err)
    if len(tree.body) != 1 or not isinstance(tree.body[0], ast.Assign):
        raise ValueError("compute 必须是一条赋值")
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_COMPUTE):
            raise ValueError("compute 表达式含不允许的语法 %s" % type(node).__name__)
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                if not isinstance(node.func.value, ast.Name) or node.func.value.id not in _COMPUTE_MODULES:
                    raise ValueError("compute 只允许 %s.函数名(...) 或直接调用算子" % "/".join(sorted(_COMPUTE_MODULES)))
            elif isinstance(node.func, ast.Name):
                if node.func.id not in OPERATORS and node.func.id not in _COMPUTE_CALLABLE:
                    raise ValueError("compute 调用了未注册的算子 %s" % node.func.id)
            else:
                raise ValueError("compute 只允许直接调用算子或模块方法")

    assign = tree.body[0]
    if not isinstance(assign.targets[0], ast.Tuple):
        if not isinstance(assign.targets[0], ast.Name):
            raise ValueError("compute 的赋值目标只能是变量名")
        targets = [assign.targets[0].id]
    else:
        if not all(isinstance(e, ast.Name) for e in assign.targets[0].elts):
            raise ValueError("compute 的赋值目标只能是变量名")
        targets = [e.id for e in assign.targets[0].elts]

    # _try(...)：容错求值，等价于老节点的 optional: true——内层出错就整个赋 None，
    # 而不是中止整条规则。
    guarded = False
    val = assign.value
    if isinstance(val, ast.Call) and isinstance(val.func, ast.Name) and val.func.id == "_try":
        if len(val.args) != 1 or val.keywords:
            raise ValueError("_try() 只接受一个参数")
        guarded = True
        assign.value = val.args[0]

    tree = _ComputeRefs(set(env_keys)).visit(tree)
    ast.fix_missing_locations(tree)
    return compile(tree, "<compute>", "exec"), guarded, targets


# 表达式求值的名字表：算子按注册名直接可调用，另加 ref（取数）与 has_topic。
# __builtins__ 置空——表达式里不该有任意 Python 内置能力；按需逐类放行。
_COMPUTE_GLOBALS = {
    "__builtins__": {},
    "ref": None,
    "len": lambda x: None if x is None else len(x),
    "int": lambda x: None if x is None else int(x),
}
_COMPUTE_GLOBALS.update(OPERATORS)

# np 子集：只给纯数学运算，不给 I/O（load/save/savetxt 等）。用 types.SimpleNamespace
# 是因为 ast.Attribute 会按 obj.attr 查属性，dict 不行。
_COMPUTE_GLOBALS["np"] = _SimpleNamespace(
    # ── 基本的 ──
    abs=np.abs,
    sum=np.sum,
    mean=np.mean,
    std=np.std,
    median=np.median,
    min=np.min,
    max=np.max,
    ptp=np.ptp,
    percentile=np.percentile,
    diff=np.diff,
    count_nonzero=np.count_nonzero,
    # ── NaN 安全的 ──
    nanmean=np.nanmean,
    nanstd=np.nanstd,
    nanmedian=np.nanmedian,
    nanmin=np.nanmin,
    nanmax=np.nanmax,
    nansum=np.nansum,
    # ── 集合 ──
    isin=np.isin,
    # ── 三角 ──
    hypot=np.hypot,
    degrees=np.degrees,
    radians=np.radians,
    arctan2=np.arctan2,
    # ── 逐元素 ──
    maximum=np.maximum,
    minimum=np.minimum,
    clip=np.clip,
    sign=np.sign,
    # ── 数组工具 ──
    isfinite=np.isfinite,
    asarray=np.asarray,
    where=np.where,
    concatenate=np.concatenate,
)


def _eval_compute(stmt, env, ref_fn=None):
    """求值一条 compute 表达式，结果写进 env。

    ref_fn：把表达式里的 `ref(...)` 换成别的实现（图上"每实例一个面板"要覆盖实例切片，
    见 `_pick_ref` 的 instance）。不传就是规则那套 `_ref`。

    空值语义（与老节点链的唯一差别，**有意为之**）：
      老写法里 `optional: false` 的节点拿到 None 就整条规则中止，`optional: true` 的才允许
      None 继续传播。表达式写法里只有一条规则：**None 是值，照常传播**；要中止就让异常发生
      （拿 None 去比较/四则会抛 TypeError）。老写法靠 `_try(...)` 保留"允许 None"的那半边，
      另一半（无谓的中止）不保留——因为它只是让同样的结论晚一步消失，而"None 传播"更好读。

      实际影响面很窄：只有当某个表达式产出 None、而**下游又把这个 None 变成了别的值**
      （coalesce / choose / 三元）时才会看到差别；现有规则里这类位置都带 _try 守卫
      （6 条日志的冻结基线逐字段比对可证）。新写规则时若真的依赖"缺失即中止"，
      就显式写 `require_true(is_not_none(x))`——那正是它的用途。
    """
    code, guarded, targets = _compile_compute(stmt, env)
    glb = _COMPUTE_GLOBALS if ref_fn is None else {**_COMPUTE_GLOBALS, "ref": ref_fn}
    try:
        exec(code, glb, env)
    except Exception:
        if not guarded:
            raise
        for name in targets:
            env[name] = None


_COMPUTE_GLOBALS["ref"] = _ref
_COMPUTE_GLOBALS["has_topic"] = provider.has_topic


def _param_fn(env):
    """`param('NAME')`：读飞控参数。compute 里放行的第四个调用（与 ref / has_topic 同级）。

    为什么不把它做成算子：算子只收数据、看不见 provider 与内置变量表，而参数是
    **一份日志一个值的离散事实**（不是从列里算出来的）。它属于 `builtin_variables()`
    给的 PARAMS 字典，取单个值本来就只是"查表"这件事本身——做成算子反而要开一个
    "算子能读環境"的口子。

    参数缺失（这份日志没录 / 名字写错）返回 `default`（默认 None）而**不抛异常**：
    "没这个参数"与"参数等于 0"是两件事，挑哪个由规则自己说——要兜底就把 default 写上
    （`param('RNGFND_TYPE', 0.0)` 的语义是"没声明就等于没配"，正是这类检查想要的）。
    """

    def param(name, default=None):
        val = (env.get("PARAMS") or {}).get(str(name))
        return default if val is None else val

    return param


def _rule_env():
    """一条规则求值时的名字空间：内置变量（provider 给）+ 框架补的这几个。

    每次都要新的一份：compute 的输出直接写进这个 dict。
      has_topic() —— 这个消息在不在
      param()     —— 读飞控参数（按本 env 的 PARAMS 查表）
    """
    env = provider.builtin_variables()
    env["has_topic"] = provider.has_topic
    env["param"] = _param_fn(env)
    return env


def _run_rules(group):
    """执行声明了该 group 的经验规则。

    finding 的 id 是按发射顺序（F01、F02…）生成的，所以每条规则的 group **必须与
    它所替换的原过程式检查的位置一致**；同一 group 内按 order / id 排序执行。
    """
    for _rule in RULES:
        if _rule.get("group") != group:
            continue
        _rid = _rule["id"]
        _env = _rule_env()
        _not_applicable = None
        _ph = _placeholder_reason(_rule.get("placeholder"))
        if _ph:
            _not_applicable = "未实现：%s" % _ph
        else:
            try:
                if not provider.match_version(_rule["firmware"]):
                    _not_applicable = "固件不满足 %s" % _rule["firmware"]
                elif not _match_vehicle(_rule["vehicle"], _env):
                    _not_applicable = "机架不适用 %s" % _vehicle_label(_rule["vehicle"])
            except Exception:
                _not_applicable = None
        if _not_applicable:
            skipped(_rid, _not_applicable)
            continue
        _missing = _missing_topics(_rule.get("topics"))
        if _missing:
            skipped(_rid, _missing)
            continue
        _mode_miss = _match_mode(_rule.get("mode"), _env)
        if _mode_miss:
            skipped(_rid, _mode_miss)
            continue
        _armed_miss = _match_armed(_rule.get("armed"), _env)
        if _armed_miss:
            skipped(_rid, _armed_miss)
            continue
        _ok = True
        for _stmt in _rule.get("compute") or []:
            try:
                _eval_compute(_stmt, _env)
            except Exception:
                _ok = False
                break
        if not _ok:
            skipped(_rid, "数据不足，本条没算出结论")
            continue
        _ran_ok = True
        if _rule.get("ran_when") is not None:
            try:
                _ran_ok = bool(_eval_expr(_rule["ran_when"], _env))
            except Exception:
                _ran_ok = False
        if _ran_ok:
            ran(_rid)

        # outputs：指标输出（纯数据，数组）
        for _out_item in _rule.get("outputs") or []:
            _v = _env.get(_out_item.get("value"))
            if _v is not None:
                metrics[_out_item["name"]] = _v

        # foreach: 把一条规则算出的「事件列表」展开成多条 finding（如 failsafe 的每次边沿）。
        # 事件 dict 的键会叠加进模板环境，所以文案仍写在经验文件里；
        # 每个事件最多命中一条 trigger（自上而下第一条），与单事件规则一致。
        # foreach 支持两种写法：`foreach: events` 或
        # `foreach: {var: events, keys: [t_s]}`（后者让构建期能校验事件键的占位符）
        _for_spec = _rule.get("foreach")
        _for_key = _for_spec.get("var") if isinstance(_for_spec, dict) else _for_spec
        if _for_key:
            _items = _env.get(_for_key) or []
        else:
            _items = [None]

        _rule_tag = _rule.get("tag")
        _rule_docurl = _rule.get("docurl")

        for _item in _items:
            _tenv = _env
            if _item is not None:
                if not isinstance(_item, dict):
                    continue
                _tenv = dict(_env)
                _tenv.update(_item)

            for _trig in _rule.get("triggers") or []:
                # when 缺省 = True；单值/数组归一化成列表
                _when_raw = _trig.get("when", "True")
                _when_list = _when_raw if isinstance(_when_raw, list) else [_when_raw]

                _sev_raw = _trig.get("severity")
                if _sev_raw is None:
                    continue
                _sev_list = _sev_raw if isinstance(_sev_raw, list) else [_sev_raw]

                _n = len(_when_list)

                def _expand(val, n):
                    if val is None:
                        return [None] * n
                    if isinstance(val, list):
                        return val
                    return [val] * n

                _desc_list = _expand(_trig.get("description"), _n)
                _label_list = _expand(_trig.get("label", _rule_tag), _n)
                _sugg_list = _expand(_trig.get("suggestion"), _n)

                # evidence sub-object
                _ev_spec = _trig.get("evidence") or {}
                _ev_thr_raw = _ev_spec.get("threshold")
                if _ev_thr_raw is None:
                    _ev_thr_list = [None] * _n
                elif isinstance(_ev_thr_raw, list):
                    _ev_thr_list = _ev_thr_raw
                else:
                    _ev_thr_list = [_ev_thr_raw] * _n

                # when[] 内部短路：命中第一条即停
                for _i in range(_n):
                    try:
                        _hit = _eval_expr(_when_list[_i], _tenv)
                    except Exception:
                        _hit = False
                    if not _hit:
                        continue

                    _sev = _sev_list[_i] if _i < len(_sev_list) else _sev_list[-1]
                    _label = _label_list[_i] if _i < len(_label_list) else _label_list[-1]
                    _desc = _desc_list[_i] if _i < len(_desc_list) else _desc_list[-1]
                    _sugg = _sugg_list[_i] if _i < len(_sugg_list) else _sugg_list[-1]

                    # construct evidence dict
                    _ev = {}
                    _src = _ev_spec.get("source", "")
                    if _src and "{" in _src:
                        _src = _src.format_map(_tenv)
                    _ev["source"] = _src

                    _val_raw = _ev_spec.get("value")
                    if _val_raw is not None:
                        try:
                            _ev["value"] = _eval_expr(str(_val_raw), _tenv)
                        except Exception:
                            _ev["value"] = None
                    else:
                        _ev["value"] = None

                    _thr = _ev_thr_list[_i] if _i < len(_ev_thr_list) else _ev_thr_list[-1]
                    if _thr is not None:
                        _ev["threshold"] = _thr

                    # copy remaining evidence keys (unit, docurl, custom)
                    for _ek in _ev_spec:
                        if _ek in ("source", "value", "threshold"):
                            continue
                        _ev[_ek] = _ev_spec[_ek]

                    _docurl = _ev.get("docurl") or _rule_docurl

                    # format description/suggestion with template vars
                    if _desc and "{" in _desc:
                        _desc = _desc.format_map(_tenv)
                    if _sugg and "{" in _sugg:
                        _sugg = _sugg.format_map(_tenv)

                    if _sev == "guard":
                        # guard: label -> guard_tags[], still emit finding
                        if _label and _label not in guard_tags:
                            guard_tags.append(_label)
                        _fid[0] += 1
                        _f = {
                            "id": "F%02d" % _fid[0],
                            "severity": "guard",
                            "ruleId": _rid,
                            "label": _label,
                            "description": _desc,
                            "evidence": _ev,
                        }
                        if _docurl:
                            _f["docUrl"] = _docurl
                        if _sugg:
                            _f["suggestion"] = _sugg
                        findings.append(_f)
                    else:
                        add(_rid, _sev, _label, _desc, _ev, _sugg, _docurl)
                    break  # when[] short-circuit


# ---------------- 概览指标（knowledge/<格式>/facts.yaml 的 metrics）----------------
# 规则顺带产出的实测值优先（更贴合判定口径）；规则没跑（缺字段 / 机型不适用）时按声明兜底现算，
# 这样用户在「关键数据」里始终看得到数，不会因为某条规则 skip 就凭空少几项。
# （累加器 metrics 在文件开头声明，由 run_all() 重置。）
_M_RESERVED = {"key", "label", "unit", "topic", "field", "fields", "op", "pick", "scale", "round"}


def _metric_fallback(m):
    """按声明现算一个概览指标；任何一步缺失都返回 None（这一项就不显示）"""
    try:
        topic = m.get("topic")
        if not topic:
            return None
        fields = m.get("fields") or ([m["field"]] if m.get("field") is not None else [])
        if not isinstance(fields, list):
            fields = [fields]
        args = []
        for cand in fields:
            names = cand if isinstance(cand, list) else [cand]  # 候选字段名：取第一个存在的
            col = provider.get_first_existing_column(topic, names)
            if col is None:
                return None
            args.append(np.asarray(col, dtype=float))
        name = m.get("op")
        if name not in OPERATORS:
            return None
        res = OPERATORS[name](*args, **{k: v for k, v in m.items() if k not in _M_RESERVED})
        if res is None:
            return None
        pick = m.get("pick")
        if pick:
            outs = list(res) if isinstance(res, tuple) else [res]
            out_names = SIGNATURES.get(name, {}).get("out_names") or []
            if pick not in out_names:
                return None
            res = outs[out_names.index(pick)]
        val = float(res)
        if m.get("scale") is not None:
            val = val * float(m["scale"])
        if "round" in m:
            _r = int(m["round"])
            val = round(val, _r)
            return int(val) if _r == 0 else val  # round(x, 0) 仍是 float，整数量要转回 int
        return val
    except Exception:
        return None


# ---------------- 第三层：故障知识库确定性匹配 ----------------
def match_fault_kb():
    phases = phases_present
    active_tags = set(tags)
    matched = []
    for e in FAULT_KB:
        trig = e.get("trigger_tags", [])
        e_phases = e.get("flight_phase", ["all"])
        excl = e.get("exclude_tags", [])
        if not any(t in active_tags for t in trig):
            continue
        if any(x in guard_tags or x in active_tags for x in excl):
            continue
        if "all" not in e_phases:
            if not any(p in phases for p in e_phases):
                continue
        matched.append(
            {
                "faultId": e["fault_id"],
                "faultTag": e["fault_tag"],
                "riskLevel": e.get("risk_level", ""),
                "possibleRootCause": e.get("possible_root_cause", []),
                "troubleshootingSteps": e.get("troubleshooting_steps", []),
                "note": e.get("note", ""),
                "matchedPhases": [p for p in e_phases if p == "all" or p in phases],
            }
        )
    return matched


def run_all():
    """跑完全部规则，返回报告头的判定产物（= 交给前端的 report）。

    为什么是具名入口而不是模块级代码：原先它靠"执行脚本的副作用"——谁去读全局 `__result`
    谁就顺手把规则跑了，调用顺序还被隐式约束着（`__result` 是同一个全局，读 report 必须早于
    读 manifest）。现在交付边界有具名用例，由第二部分数据层的 `np_report()` 调这个函数。

    **入口先重置累加器**：`add` / `add_tag` / `ran` / `skipped` / `_run_rules` 都是往模块级的
    它们里追加的，不重置就会二次调用时累加。
    """
    global findings, checks_run, checks_skipped, tags, guard_tags, _fid, phases_present, metrics
    findings = []
    checks_run = []
    checks_skipped = []
    tags = []
    guard_tags = []
    _fid = [0]
    metrics = {}
    # 阶段集合来自 provider（故障库按 flight_phase 匹配用它）
    phases_present = set(provider.get_report_facts().get("phases") or [])

    # guards_early：必须在其它规则之前跑，保证 insufficient_data 是第一个 guard 标签
    # ---------------- 按 group_order 顺序执行各 group ----------------
    # 顺序即 finding 编号（F01、F02…）的生成顺序，也决定 guard 标签的先后
    # （guards_early 排第一，insufficient_data 才会是第一个 guard 标签）。
    # 新增经验只需把 group 写进 facts.yaml 的 group_order（或复用已有 group）
    # 并让经验里的 group 对上——**不用改这个文件**；构建期会校验 group 是否都已登记。
    for _group in FACTS["group_order"]:
        _run_rules(_group)

    # 短日志由 guard 标签派生（阈值的唯一来源是 guard-short-log.yaml）
    short_log = "insufficient_data" in guard_tags
    matched_faults = [] if short_log else match_fault_kb()

    _metric_entries = []
    _declared = set()
    for _m in FACTS.get("metrics", []):
        _key = _m.get("key")
        if not _key:
            continue
        _declared.add(_key)
        _val = metrics.get(_key)
        if _val is None:
            _val = _metric_fallback(_m)
        if _val is None:
            continue
        _entry = {"key": _key, "label": _m.get("label", _key), "value": _val}
        if _m.get("unit"):
            _entry["unit"] = _m["unit"]
        _metric_entries.append(_entry)
    # 规则产出、但没在 facts.yaml 里声明的（别丢，直接用键名当名字）
    for _key, _val in metrics.items():
        if _key not in _declared:
            _metric_entries.append({"key": _key, "label": _key, "value": _val})

    order = {"critical": 0, "warning": 1, "info": 2}
    findings.sort(key=lambda f: order.get(f["severity"], 9))

    return {
        # 固件族名**问 provider**：引擎不认识任何一种固件，写死一个就是把"本站只支持 PX4"
        # 这个结论钉进了格式无关层（ArduPilot 日志会顶着 PX4 的名义出报告）。
        # 没有 platform_label() 的格式退回 log_type——至少那是真的、只是不好读。
        "platform": provider.platform_label() if hasattr(provider, "platform_label") else provider.log_type,
        "logType": provider.log_type,
        "parserVersion": provider.parser_version(),
        # 事实层产出：facts=日志是什么（离散，驱动判定）；metrics=关键数字（有序，带中文名与单位）
        "facts": provider.get_report_facts(),
        "metrics": _metric_entries,
        # 判定层产出（规则与故障库）
        "tags": tags,
        "guardTags": guard_tags,
        "checksRun": checks_run,
        "checksSkipped": checks_skipped,
        "matchedFaults": matched_faults,
        "findings": findings,
    }


# ============================================================================
# 第二部分：报告页数据层（np_* 具名入口是对前端的门面）
# ============================================================================


# ============ 通用工具 ============
# 时间基准：**开机以来的秒数**。PX4 的时间戳本身就是"开机起的微秒"，直接用即可；
# 之前减过 ulog.start_timestamp（那是"日志开始记录的时刻"，通常比开机晚几秒到几分钟），
# 于是同一份日志在本站与 Flight Review 上差出那一段——FR 的 Logged Messages 与曲线横轴
# 用的都是开机时间（plotted_tables.time_str 直接除 timestamp）。这里对齐它。
def _since_boot(t_us, digits=2):
    return round(int(t_us) / 1e6, digits)


def _clean(v):
    """numpy / NaN / Inf -> JSON 安全的 Python 原生结构（NaN 转 None）。"""
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and not np.isfinite(v):
        return None
    return v


def _lttb_indices(n, max_points, ref=None):
    """LTTB 降采样索引（含首尾）。ref 为参考信号（NaN 安全，仅用于选点）。"""
    if n <= max_points or max_points < 3:
        return list(range(n))
    if ref is None:
        ref = np.zeros(n)
    r = np.asarray(ref, dtype=float)
    finite = np.isfinite(r)
    if finite.any():
        r = np.where(finite, r, np.nanmean(r[finite]))
    else:
        r = np.zeros(n)
    bucket = n / (max_points - 2)
    idx = [0]
    a = 0
    for i in range(max_points - 2):
        ts = int(np.floor((i + 1) * bucket))
        te = int(np.floor((i + 2) * bucket))
        ts = min(ts, n - 1)
        te = min(te, n)
        if te <= ts:
            te = ts + 1
        # 下一桶均值点
        nx = np.mean(np.arange(ts, te))
        ny = float(np.mean(r[ts:te])) if te > ts else float(r[ts])
        best, best_d = ts, -1.0
        for j in range(ts, te):
            area = abs((a - nx) * (float(r[j]) - float(r[a])) - (a - j) * (ny - float(r[a])))
            if area > best_d:
                best, best_d = j, area
        idx.append(best)
        a = best
    idx.append(n - 1)
    return idx


# ============ np_report：判定产物（跑规则 + 组装报告头）============
def np_report():
    """跑完全部规则，把判定产物摆到 `__result`（= 前端那份 report）。

    跑规则是第一部分 `run_all()` 的活，这里只负责把结果交出去；
    np_report 与 np_manifest / np_series / np_track / np_materials 同一形状——
    前端面对的 Python 面因此是 5 个对称的具名入口，没有"谁先读 __result"的隐含顺序。

    取数过程中"要的实例超出日志里有的"这类说明在这里一并带出（规则侧没人取走会攒着，
    跑完统一收）；图侧由 `np_series` 自己带。
    """
    global __result
    take_notes = getattr(provider, "take_inst_notes", None)
    if take_notes:
        take_notes()  # 别把上一次的带进来
    report = run_all()
    if take_notes:
        notes = take_notes()
        if notes:
            report["instanceNotes"] = notes
    __result = json.dumps(report, ensure_ascii=False, default=_json_default)


class _NumpyEncoder(json.JSONEncoder):
    """把 numpy 数值转成 Python 原生类型，使得 json.dumps 不抛 TypeError。

    引擎产出的 _metric_entries 可能含有 np.int64 / np.float64 等类型——一旦规则
    用 np.sum/max/mean 之类归约，返回值就是 numpy 标量，而标准 json 模块不认识它们。
    """

    def default(self, o):
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return float(o)
        if isinstance(o, (np.ndarray,)):
            return o.tolist()
        return super().default(o)


def _json_default(o):
    """json.dumps 的 default 回调：借用 _NumpyEncoder 的逻辑。"""
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, (np.ndarray,)):
        return o.tolist()
    raise TypeError("Object of type %s is not JSON serializable" % o.__class__.__name__)


# ============ np_manifest：话题清单（驱动前端预设可用性）============
def np_manifest():
    global __result
    items = provider.get_topic_meta()
    __result = json.dumps({"topics": items}, ensure_ascii=False)


# ============ np_series：按需抽取 + LTTB 降采样 ============
def np_series(request_json, max_points=3000):
    """按需抽取时序并降采样。**要哪几条线由构建期编译好的预设声明决定**（本函数只执行）。

    request（前端从预设拼出来，JSON）：

      instance  面板要第几个实例——声明里写 `[:]` 的引用按它取（"每实例一个面板"用）
      ydata     每条线一项：`{"kind":"field","fields":[…],"unit":…}`（字段引用，含候选组与单位）
                            `{"kind":"var","name":…}`（预设 compute 节点的输出）
      xdata     可选：`mode: xyplot` 的横轴。不给就用**命中字段那个 topic 的 timestamp**
      compute   可选：预设的换算节点（与规则 compute 同一套表达式与算子），在取 ydata **之前**求值

    返回 `{t, x, series:[…], fullCount, warnings:[…]}`：`series` 与 ydata **同序等长**
    （取不到的那条是 `null`），前端按预设里的 label/color 逐项对齐即可；`x` 为 null 表示
    横轴就是 `t`；`warnings` 是取数过程中的提示（如"要实例 1~5，日志里只有 0~2"）。
    一条都取不到、或区间引用没在前端展开成单条，给 `{"error": …}`。

    换算（四元数→欧拉角、单位、多字段合成）都在这里做，前端只画——"前端不写数学"。
    """
    global __result
    req = json.loads(request_json)
    # 上一条请求留下的越界说明不能串到这条（规则侧没人取走，会一直攒着）
    take_notes = getattr(provider, "take_inst_notes", None)
    if take_notes:
        take_notes()
    inst = int(req.get("instance") or 0)
    yspec = req.get("ydata") or []
    if not yspec:
        __result = json.dumps({"error": "这张图没有声明任何一条数据（ydata 为空）"}, ensure_ascii=False)
        return

    # 1) 换算节点：与规则同一套求值器，只把 ref 换成"按本面板的实例取"
    env = _rule_env()
    if req.get("compute"):

        def panel_ref(*args, **kwargs):
            return _pick_ref(*args, instance=inst, **kwargs)[0]

        try:
            for stmt in req["compute"]:
                _eval_compute(stmt, env, ref_fn=panel_ref)
        except Exception as exc:
            __result = json.dumps({"error": "换算节点算不出来：%s" % exc}, ensure_ascii=False)
            return

    # 2) 逐条取数（字段引用 / 换算节点的输出）
    hit_bare = None
    values = []
    try:
        for spec in yspec:
            got, bare = _panel_series(spec, env, inst)
            if bare and hit_bare is None:
                hit_bare = bare
            values.append(got)
        if req.get("xdata"):
            x_vals, bare_x = _panel_series(req["xdata"], env, inst)
            if bare_x and hit_bare is None:
                hit_bare = bare_x
            if x_vals is None:
                __result = json.dumps({"error": "横轴那个字段在日志里没有"}, ensure_ascii=False)
                return
        else:
            x_vals = None
    except Exception as exc:
        __result = json.dumps({"error": str(exc)}, ensure_ascii=False)
        return
    if all(v is None for v in values):
        __result = json.dumps({"error": "这张图的数据在日志里都没有"}, ensure_ascii=False)
        return

    # 3) 横轴：显式给了就用它，否则用命中字段那个 topic 的时间戳（阶段底色、tooltip 都要）。
    #    整张图都靠换算节点算出来时，命中字段要从节点里的 ref 反推（只定 topic，不求值）。
    if hit_bare is None and req.get("compute"):
        hit_bare = _first_ref_bare(req["compute"])
    ts = None
    if hit_bare:
        topic = hit_bare.partition(".")[0]
        _, inst_hit = _split_ref(hit_bare)
        ts = provider.get_series(
            "%s.timestamp" % topic,
            instance=inst if isinstance(inst_hit, slice) else inst_hit,
        )
    if ts is None:
        __result = json.dumps(
            {"error": "取不到时间戳（%s 里没有 timestamp 列）" % (hit_bare or "任何命中的字段")},
            ensure_ascii=False,
        )
        return

    n = len(np.asarray(ts, dtype=np.int64))
    arrs = []
    for v in values:
        if v is None:
            arrs.append(None)
        elif np.ndim(v) == 0:
            arrs.append(np.full(n, float(v)))  # 换算出的是标量：铺成常量线（门限线是正当用法）
        else:
            arrs.append(np.asarray(v, dtype=float))
    # 横轴与曲线必须来自同一份采样：一张图的 compute 若横跨了两个话题（采样率不同），
    # 降采样按横轴长度走，索引到较短的那条会越界——给一句能照着改的话，别抛 numpy 的 IndexError
    for a in arrs:
        if a is not None and len(a) < n:
            __result = json.dumps(
                {
                    "error": "横轴与某条线的采样数对不上（横轴 %d 点、那条线 %d 点）——"
                    "一张图的 compute 横跨了多个话题时，请显式写 xdata，"
                    "或用 fill_to / head 把序列对齐" % (n, len(a))
                },
                ensure_ascii=False,
            )
            return
    ref = next((a for a in arrs if a is not None), None)
    idx = _lttb_indices(n, int(max_points), ref)
    __result = json.dumps(
        {
            "t": [_since_boot(ts[i], 3) for i in idx],
            "x": None if x_vals is None else [_clean(np.asarray(x_vals, dtype=float)[i]) for i in idx],
            "series": [None if a is None else [_clean(a[i]) for i in idx] for a in arrs],
            "fullCount": n,
            "warnings": take_notes() if take_notes else [],
        },
        ensure_ascii=False,
    )


def _panel_series(spec, env, inst):
    """一条线 → (序列, 命中的 bare 字段名)。

    · `{"kind":"var"}` 取换算节点的输出（标量由调用方铺成常量线）
    · `{"kind":"field"}` 走 `_pick_ref`（候选组 + 单位换算 + 实例覆盖）

    区间引用（`[:]` / `[a:b]`）有两种去向，都由**前端**决定，这里只见到结果：
      · 容器 `split_by_instance: true` → 按实例拆成多张图，每张图把实例号放在 `instance=` 里
        发过来，`_pick_ref` 用它盖掉引用里的区间 → 拿到单条序列
      · 容器不拆 → 前端自己把 `a[:].b` 展开成 `a[0].b`、`a[1].b`… 再发过来 → 也是单条
    所以这里**只会**见到单条序列。万一见到一组，那不是预设写错了，是解析器漏了展开。
    """
    if spec.get("kind") == "var":
        return env.get(spec.get("name")), None
    if spec.get("kind") != "field":
        raise ValueError("不认识的取数声明：%s" % json.dumps(spec, ensure_ascii=False))
    series, bare = _pick_ref(*spec.get("fields") or [], unit=spec.get("unit"), instance=inst)
    if series is None:
        return None, None
    if isinstance(series, list) and series and isinstance(series[0], (list, tuple)):
        raise ValueError(
            "%s 取到的是一组实例（%d 条）——区间引用应该在前端就展开成每条一个实例，"
            "这里是解析器的问题，不是预设写错了" % (bare, len(series))
        )
    return series, bare


def _first_ref_bare(stmts):
    """换算节点里第一个"topic 在日志里存在"的字段引用（只用来定时间戳的 topic，不求值）。

    两种写法都要认：`ref("topic.field")`，以及**裸写的** `topic.field`——后者在
    `_compile_compute` 里才会被改写成 ref（见第一部分的 `_ComputeRefs`），这里看的是
    原文，所以得自己认一遍（踩过：`quat_to_euler(vehicle_attitude.q)` 因为只认 ref，
    整张图报"取不到时间戳"）。
    """
    for stmt in stmts:
        try:
            tree = ast.parse(stmt)
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "ref":
                for arg in node.args:
                    if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                        bare, _ = _split_ref(arg.value)
                        if provider.has_topic(bare.partition(".")[0]):
                            return bare
            elif isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
                bare = "%s.%s" % (node.value.id, node.attr)
                if provider.has_topic(bare.partition(".")[0]):
                    return bare
    return None


# ============ np_track：GPS 轨迹 ============
# 取哪些字段、怎么按固件版本挑候选、量纲怎么换算——全是格式专有知识，
# 由 provider 提供（见 providers/api.py 的可选能力表）。
def np_track(max_points=None):
    global __result
    data = provider.get_flight_track(max_points)
    __result = json.dumps(data, ensure_ascii=False)


# ============ np_materials：系统信息 / 事件 / 丢包 / 参数 / 阶段 ============
# 这一块全是"某种日志的消息形态"的展示（'I' 信息字典、事件与文本消息合并、
# 'M' 多值信息怎么拼、'Q' 默认值怎么推、逐字节的消息类型统计），换格式就是另一套，
# 所以整块由 provider 的 report_materials() 提供（可选能力）。
def np_materials():
    global __result
    __result = json.dumps(provider.report_materials(), ensure_ascii=False)
