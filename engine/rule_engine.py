# ============================================================================
# 规则框架 —— **与日志格式无关**
#
# 这里只做四件事：调度规则、求值表达式、调算子、发射 finding。
# 它不认识任何 topic 名 / 字段名 / 码值 —— 那些全在 providers/<格式>.py 与
# knowledge/<格式>/facts.yaml 里。判据：本文件里 grep 不到 `vehicle_` / `ver_sw` / `cpuload`
# 之类的名字（tools/calibrate/lint_rules.py 有一条检查盯着）。
#
# 数据从哪来：providers/api.py 的契约。provider 由 open_log() 按文件头挑出来，
# 本文件只调它的 get_topic_meta/get_topic_data/get_series/has_topic/match_version/
# get_logged_information/get_initial_parameters/get_logged_messages/
# builtin_variables/get_report_facts 与可选能力，不碰 pyulog 对象。
# ============================================================================

import json
import ast
import math
import re
import numpy as np


# 故障知识库（构建期内联，第三层检索用）
FAULT_KB = __FAULT_KB__

# ---------------- 经验规则（rules/*.yaml 编译而来）----------------
RULES = json.loads(r"""__RULES__""")

# ---------------- 那一份数据文件（knowledge/<格式>/facts.yaml 编译而来）----------------
# 码表、文案、展示口径、规则元数据、执行顺序都在里面；引擎只提供机制。
# 它同时也是 provider 的数据源（随 open_log 一起传进去）。
FACTS = __FACTS__

# ---------------- 字段单位表（构建期查好的，只含写了 unit= 的引用涉及的字段）----------------
# 源单位从 meta/<tag>.json 查（经 meta/topic-map.yaml 换字典键）、meta/topic-overrides.yaml
# 可补/纠。查不到的构建期会告警并在产物里留空——这里拿不到就**不换算**。
# 键是 `topic.field`（日志里的名字，不是字典键），值是规范化后的单位名（见 _UNIT_FACTORS）。
FIELD_UNITS = __FIELD_UNITS__

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


def add(
    severity,
    rule_id,
    tag,
    title,
    field,
    value,
    threshold=None,
    unit=None,
    doc=None,
    suggestion=None,
    tags_extra=None,
):
    _fid[0] += 1
    ev = {"field": field, "value": value}
    if threshold is not None:
        ev["threshold"] = threshold
    if unit is not None:
        ev["unit"] = unit
    f = {
        "id": "F%02d" % _fid[0],
        "severity": severity,
        "ruleId": rule_id,
        "tag": tag,
        "title": title,
        "evidence": ev,
    }
    if doc:
        f["docUrl"] = doc
    if suggestion:
        f["suggestion"] = suggestion
    findings.append(f)
    if tag:
        add_tag(tag)
    for te in tags_extra or []:
        add_tag(te)


def skipped(check, reason):
    item = {"check": check, "reason": reason}
    if item not in checks_skipped:
        checks_skipped.append(item)


def ran(check):
    if check not in checks_run:
        checks_run.append(check)


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


def _precheck_hit(spec, env):
    """`conditions.precheck`：一串先决条件，命中任意一条就不跑本条。

    与 `topics` 的分工：`topics` 只回答"日志里有没有这个 topic"，这里放**要算一遍才知道的
    适用范围**——如 `not HAS_ARMED`（没有 armed 段就谈不上零偏判定、机动段统计）。
    在 compute **之前**求值，所以只认内置变量与 `has_topic()`，拿不到 compute 的输出。

    **返回命中的那条表达式原文**（没命中返回 None）——它就是 skipped 的原因文案：作者写的
    本来就是一句可读的判据，不必再翻译一遍。表达式本身出错（名字写错、取值缺失）当作
    **未命中**：宁可多跑一条，也别把整条误杀。

    注意这里**没有**"数据不足"这条：compute 算不出来本来就会留痕，见 `_run_rules`。
    """
    for when in spec or []:
        try:
            if _eval_expr(when, env):
                return when
        except Exception:
            continue
    return None


def _airframe_label(spec):
    """机架约束的展示写法（只用于 skipped 文案）：列表用 ` / ` 连接。"""
    if isinstance(spec, list):
        return " / ".join(str(s).strip() for s in spec)
    return str(spec).strip()


def _match_airframe(spec, env):
    """机架适用范围：`any` ｜ 单个机架名 ｜ 列表（如 `[fixed_wing, unknown]`）。

    **只做字符串精确比对，不解释语义**：拿 provider 在 `builtin_variables()` 里报的
    `AIRFRAME` 值去比（PX4 报 rotary_wing / fixed_wing / vtol / rover / unknown）。
    所以换一种日志格式不用改这里——它的机架词表由它自己的适配器定义。

    写成 `IS_FIXED_WING or AIRFRAME == 'unknown'` 那种表达式是旧写法，构建期已拦。
    """
    if isinstance(spec, str):
        name = spec.strip()
        if name == "any":
            return True
        wanted = [name]
    elif isinstance(spec, list):
        if not spec:
            raise ValueError("airframe 列表为空（不限就写 any）")
        wanted = [str(s).strip() for s in spec]
    else:
        raise ValueError("airframe 必须是 any / 机架名 / 列表，收到 %r" % (spec,))
    current = (env or {}).get("AIRFRAME")
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


def _ref(name, *more, alias=None, unit=None):
    """字段取数：表达式里的 `ref("topic.field", ...)` 与裸写的 `topic.field` 都走这里。

    字段名有两种下标，别混：
      `topic.field` / `topic[:].field` —— **所有实例**（两种写法等效）。多实例时给
                          「每实例一组」的列表，交给需要分组的算子；**只有一个实例时
                          就是那一条序列**（与写 `[0]` 同形），所以单实例字段照旧直接算
      `topic[N].field` —— 只取第 N 个实例（N 可为负）
      `topic.field[N]` —— 数组字段的元素下标（如 `vehicle_attitude.q[0]`）

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
    """
    for cand in (name, *more):
        bare, inst = _split_ref(cand)
        series = provider.get_series(bare, instance=inst, alias=alias)
        if series is None:
            continue
        if unit is not None:
            scale = _unit_scale(FIELD_UNITS.get(bare), unit)
            if scale is not None:
                series = _scale_series(series, scale)
        return series
    return None


def _split_ref(ref):
    """`"topic[:].field"` → ("topic.field", slice(None, None))；`[N]` → int；不写 → 0。

    实例说明交给 provider 直接用下标取（Python 的 int/切片语义），这里只负责拆开。
    """
    m = re.match(r"^([a-z][a-z0-9_]*)(?:\[([-]?\d*(?::-?\d*)?)\])?\.(.+)$", str(ref))
    if not m:
        return str(ref), 0
    return "%s.%s" % (m.group(1), m.group(3)), _parse_inst(m.group(2))


def _parse_inst(txt):
    """`[2]` → int；`[:]` / `[1:3]` / **不写** → slice（不写就是"所有实例"）。形状由构建期保证。"""
    if txt is None or txt == "":
        return slice(None, None)
    if ":" in txt:
        a, _, b = txt.partition(":")
        return slice(int(a) if a else None, int(b) if b else None)
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
    """把表达式里裸写的 `topic.field` 重写成 `ref("topic.field")`。

    只接受 `Name.attr` 形态，且这个 Name **不能是已声明的变量**——否则 `变量.属性` 会去
    访问对象属性（那是任意能力，白名单不给）。构建期已经拦过一遍，这里是运行期的那道。
    """

    def __init__(self, env_keys):
        self.env_keys = env_keys

    def visit_Attribute(self, node):
        if not isinstance(node.value, ast.Name):
            raise ValueError("字段引用必须是 topic.field 形式")
        if node.value.id in self.env_keys:
            raise ValueError("%s 是变量名，不能当 topic 用" % node.value.id)
        return ast.copy_location(
            ast.Call(
                func=ast.Name(id="ref", ctx=ast.Load()),
                args=[ast.Constant(value="%s.%s" % (node.value.id, node.attr))],
                keywords=[],
            ),
            node,
        )


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
            if not isinstance(node.func, ast.Name):
                raise ValueError("compute 只允许直接调用算子")
            if node.func.id not in OPERATORS and node.func.id not in ("ref", "_try", "has_topic"):
                raise ValueError("compute 调用了未注册的算子 %s" % node.func.id)

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
# __builtins__ 置空——表达式里不该有任何 Python 内置能力。
_COMPUTE_GLOBALS = {"__builtins__": {}, "ref": None}
_COMPUTE_GLOBALS.update(OPERATORS)


def _eval_compute(stmt, env):
    """求值一条 compute 表达式，结果写进 env。

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
    try:
        exec(code, _COMPUTE_GLOBALS, env)
    except Exception:
        if not guarded:
            raise
        for name in targets:
            env[name] = None


_COMPUTE_GLOBALS["ref"] = _ref
_COMPUTE_GLOBALS["has_topic"] = provider.has_topic


def _rule_env():
    """一条规则求值时的名字空间：内置变量（provider 给）+ 框架补的一个。

    每次都要新的一份：compute 的输出直接写进这个 dict。
      has_topic() —— 表达式里唯一放行的函数调用，指向 provider.has_topic
    """
    env = provider.builtin_variables()
    env["has_topic"] = provider.has_topic
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
        _checks = (_rule.get("outputs") or {}).get("check")
        if _checks is None:
            _checks = []  # guards 类经验没有 check 名（不记 ran/skipped）
        elif not isinstance(_checks, list):
            _checks = [_checks]
        _env = _rule_env()
        # 适用范围（`conditions`）依次判：固件 / 机架 / 先决条件 / 依赖的 topic。
        # 固件那轴与 provider.match_version 同一套语法（any / ">=1.15" / ">=1.14,<1.15"），
        # 机架那轴是 `any` / 机架名 / 列表。
        # **不满足一律记一条 skipped 并带上自动文案**：报告里要能看出"这条为什么没跑"，
        # 而不是让读者以为它跑过了、或者根本没人写过这条经验。
        # （轴约束写成了解析不了的串时静默退出——那是规则的笔误，构建期本来就会拦。）
        _not_applicable = None
        try:
            if not provider.match_version(_rule["firmware"]):
                _not_applicable = "固件不满足 %s" % _rule["firmware"]
            elif not _match_airframe(_rule["airframe"], _env):
                _not_applicable = "机架不适用 %s" % _airframe_label(_rule["airframe"])
        except Exception:
            _not_applicable = None
        if _not_applicable:
            for _check in _checks:
                skipped(_check, _not_applicable)
            continue
        # 依赖的 topic：缺了记一条（文案自动生成，见 _missing_topics）
        _missing = _missing_topics(_rule.get("topics"))
        if _missing:
            for _check in _checks:
                skipped(_check, _missing)
            continue
        # 先决条件：命中的那条条件原文就是原因（它本来就是作者写的一句判据）
        _pre = _precheck_hit(_rule.get("precheck"), _env)
        if _pre:
            for _check in _checks:
                skipped(_check, "先决条件命中：%s" % _pre)
            continue
        # ── 三步里的第二步：算 ──
        # 算不出来就记一条 skipped（"数据不足"），所以 ran() 只能放在 compute **成功之后**——
        # 同一条 check 不能既是 ran 又是 skipped。原先靠 `ran_on_success` 表达的那半边
        # （原实现把 ran() 放在数据判定之后）现在成了默认，那个字段已删。
        _ok = True
        for _stmt in _rule.get("compute") or []:
            # compute 是**表达式**，求值出来的名字进 _env，供后面的表达式与 triggers / outputs 引用。
            try:
                _eval_compute(_stmt, _env)
            except Exception:
                _ok = False
                break
        if not _ok:
            for _check in _checks:
                skipped(_check, "数据不足，本条没算出结论")
            continue
        # ran_when：算出来了、但还不算"跑过"（如姿态那条要有足够的机动段样本）。
        # 不满足就静默——它跟"数据不足"不是一回事。
        _ran_ok = True
        if _rule.get("ran_when") is not None:
            try:
                _ran_ok = bool(_eval_expr(_rule["ran_when"], _env))
            except Exception:
                _ran_ok = False
        if _ran_ok:
            for _check in _checks:
                ran(_check)

        _out = _rule["outputs"]
        # outputs.guard_tags：按条件产生的数据质量标签（等价于原过程式的 guard_tags.append，
        # 不依赖是否发出 finding——如陀螺零偏的“温度变化大”）
        for _gspec in _out.get("guard_tags") or []:
            try:
                _g_hit = _eval_expr(_gspec["when"], _env)
            except Exception:
                _g_hit = False
            if _g_hit and _gspec.get("tag") and _gspec["tag"] not in guard_tags:
                guard_tags.append(_gspec["tag"])
        for _key, _spec in (_out.get("stats") or {}).items():
            _v = _env.get(_spec["var"])
            if _v is None:
                continue
            metrics[_key] = round(float(_v), int(_spec["round"])) if "round" in _spec else _v

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
        for _item in _items:
            _tenv = _env
            if _item is not None:
                if not isinstance(_item, dict):
                    continue
                _tenv = dict(_env)
                _tenv.update(_item)
            for _trig in _rule.get("triggers") or []:
                # 单条触发条件出错（例如表达式把缺失值 None 与数值比较）不应让整份日志
                # 的分析崩掉：视为未命中，继续下一条。这类错误应当在基线回归里暴露。
                try:
                    _hit = _eval_expr(_trig["when"], _tenv)
                except Exception:
                    _hit = False
                if not _hit:
                    continue
                # 证据值就是一个**表达式**：写变量得原值、写 f"{x:.3f}" 得格式化后的串、
                # 写常量就得到常量。
                _val = None
                if _trig.get("value") is not None:
                    try:
                        _val = _eval_expr(str(_trig["value"]), _tenv)
                    except Exception:
                        _val = None
                _field = _trig["field"]
                if "{" in _field:
                    _field = _field.format_map(_tenv)
                # suggestion 同样允许占位符（如 "涉及：{names}。"），与 title 一致
                _sugg = _trig.get("suggestion")
                if _sugg and "{" in _sugg:
                    _sugg = _sugg.format_map(_tenv)
                add(
                    _trig["severity"],
                    _rid,
                    _trig.get("tag", _out.get("tag")),
                    _trig["title"].format_map(_tenv),
                    _field,
                    _val,
                    _trig.get("threshold"),
                    _trig.get("unit"),
                    _rule.get("doc"),
                    _sugg,
                )
                # evidence_extra: {evidence 键: 变量名}，把额外证据挂到刚发出的 finding 上
                # （如日志消息的 samples 原文列表）
                for _ek, _evn in (_trig.get("evidence_extra") or {}).items():
                    _evv = _tenv.get(_evn)
                    if _evv is not None:
                        findings[-1]["evidence"][_ek] = _evv
                break


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
    读 manifest）。现在交付边界有具名用例，由 `report_data.np_report()` 调这个函数。

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
        "platform": "PX4",
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
