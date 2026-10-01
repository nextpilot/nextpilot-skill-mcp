# ============================================================================
# 引擎本体：第一部分规则框架（调度规则、求值表达式、调算子、发射 finding），
# 第二部分报告页数据层（按需抽时序 + LTTB 降采样、组装前端数据）。与日志格式
# 无关：不认识 topic/字段/码值、不碰 pyulog 对象，数据全走 providers/api.py 的
# provider 契约（open_log() 按文件头挑出）；格式专有内容在 providers/<格式>.py
# 与 knowledge/<格式>/facts.yaml（tools/engine/check_rules_fields.py 盯着这条）。
# 与 operators/providers 同跑一个 __main__ globals（浏览器/本地同序拼接），直接用 `provider`。
# ============================================================================

import json
import ast
import math
import re
import numpy as np

# ============================================================================
# 第一部分：规则框架
# ============================================================================

# ---------------- 这一份日志该用哪一套知识 ----------------
# 知识按固件族内联成 {log_type: ...}；先 detect_log_type 再取下标，顺序不能倒：
# open_log() 要拿 FACTS 构造 provider，FACTS 又得先知道格式。
_LOG_TYPE = detect_log_type(bytes(ulog_bytes))
if _LOG_TYPE is None:
    raise ValueError("不认识的日志格式（连探测器都没认出来），见 providers/api.py 的 FORMATS")

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
# 码表/文案/展示口径/执行顺序都在里面，引擎只提供机制；也是 provider 的数据源。
# 按 JSON 解析（与 RULES 同款）：里面可能有 true/false/null，不是合法 Python 字面量，
# 当字面量注入会直接 NameError。
FACTS = _LOG_TYPE_KNOWLEDGE["facts"].get(_LOG_TYPE, {})

# ---------------- 字段单位表（构建期查好的，只含写了 unit= 的引用涉及的字段）----------------
# 键是 `topic.field`（日志里的名字），值是规范化单位名（见 _UNIT_FACTORS）；查不到的
# 构建期已告警并留空。换算"声明了才做"：APM 那份是空的，取到什么就是什么——不换算比换算错好。
FIELD_UNITS = _LOG_TYPE_KNOWLEDGE["field_units"].get(_LOG_TYPE, {})

# group 内按 order（缺省 100000）再按 id 排序；跨 group 顺序由 facts.yaml 的 group_order
# 决定（见文件末尾执行循环），finding 编号（F01、F02…）按发射顺序生成，改 group_order 会改编号。
RULES.sort(key=lambda r: (r.get("order", 100000), r.get("id", "")))

# 预分组：避免 _run_rules 每次遍历全部 RULES（O(n×m) → O(n)）
_RULES_BY_GROUP = {}
for _rule in RULES:
    _g = _rule.get("group")
    if _g not in _RULES_BY_GROUP:
        _RULES_BY_GROUP[_g] = []
    _RULES_BY_GROUP[_g].append(_rule)

# 阈值在各条经验自己的 rules/*.yaml 里（px4-thresholds.toml 已退场），本文件只留引擎级格式常量。

# ---------------- 打开日志（挑适配器 + 契约自检）----------------
provider = open_log(bytes(ulog_bytes), FACTS)

# 这批累加器由 run_all()（文件末尾）在入口重置；声明留在模块级是因为
# add / add_tag / ran / skipped / _run_rules 都按模块名直接往里追加。
findings = []
checks_run = []
checks_skipped = []
tags = []  # 第二层异常标签（喂给第三层故障库匹配）
guard_tags = []  # 数据质量/边界标签
_fid = [0]
# 阶段集合来自 provider（规则层 phase 判定用），在 run_all() 里填充
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
    # f-string（证据值用：`value: f"{vibe_mean:.3f}"`）：占位符仍在同一个空 __builtins__ 环境下求值，没有新能力
    ast.JoinedStr,
    ast.FormattedValue,
)

# 表达式里唯一放行的函数调用：做成函数就要开"允许调用"的口子，白名单只此一项、
# 实参须为字符串字面量；其余能力（属性/下标/推导式）一律不给。
_EXPR_CALLABLE = {"has_topic", "log_ok"}


def _eval_expr(expr, env):
    """受限表达式求值：先按白名单遍历 AST，再在空 __builtins__ 下求值。
    安全边界：不允许属性访问、下标、推导式；调用只放行 _EXPR_CALLABLE
    （has_topic 实参须为字符串字面量，log_ok 无参），不 eval 用户可控代码。
    """
    tree = ast.parse(expr, mode="eval")
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise ValueError("表达式含不允许的语法 Call.unknown_func：%s" % expr)
            ok = node.func.id in _EXPR_CALLABLE
            if node.func.id == "log_ok":
                arg_ok = len(node.args) == 0
            else:
                arg_ok = len(node.args) == 1 and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str)
            if not (ok and arg_ok and not node.keywords):
                raise ValueError("表达式里只允许 %s：%s" % ("/".join(sorted(_EXPR_CALLABLE)), expr))
            continue
        if not isinstance(node, _ALLOWED_NODES):
            raise ValueError("表达式含不允许的语法 %s：%s" % (type(node).__name__, expr))
    return eval(compile(tree, "<rule>", "eval"), {"__builtins__": {}}, env)


def _placeholder_reason(spec):
    """`conditions.placeholder`：这条经验还没实现，引擎别跑它（一等字段，不伪装成先决条件命中）。
    写法是一个字符串（原因文案）；`true` 给一句缺省文案；没写 → None。
    """
    if isinstance(spec, str) and spec.strip():
        return spec.strip()
    if spec is True:
        return "本条尚未实现"
    return None


def _match_mode(spec):
    """conditions.mode：要求日志里出现过某模式（名）。一项写 `AUTO || LOITER` 为任一满足，
    多项则都要出现；匹配"日志里出现过"而非"当前处于"。日志没有模式段时直接跳过
    （拿不到模式不跑只适用于某模式的阈值，防误报）。返回缺失原因文案，满足则 None。
    """
    present = set(provider.get_mode_present() or [])
    for candidates in spec or []:
        if isinstance(candidates, str):
            candidates = [t.strip() for t in candidates.split("||")]
        if not any(m in present for m in candidates):
            return " / ".join(str(c) for c in candidates) + " 未在日志中出现"
    return None


def _match_armed(spec, env):
    """conditions.armed：解锁条件。不写/`any` 不限；`true` 要有 armed 段、`false` 要全程未解锁；
    `">12"` 这类带比较符的串对 ARMED_S（解锁总时长秒）求值，写数字等价 `>= 12`。
    判据算不出（语法错、ARMED_S 为 None）当作不满足并跳过——门槛是作者明确写的，
    拿不到数还跑会在未解锁日志上套用飞行段阈值而误报。返回原因文案，满足则 None。
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
    """机架适用范围：`any` ｜ 单个机架名 ｜ 列表（如 `[quad, hexa]`）；支持类别简写
    （copter/plane/rover，经 provider 的 `vehicle_categories` 映射到精确名集合）。
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
        raise ValueError("vehicle 只能是 any / 机架名 / 列表，收到 %r" % (spec,))
    current = (env or {}).get("VEHICLE")
    if current is None:
        return False
    current = str(current)
    categories = getattr(provider, "vehicle_categories", {})
    for w in wanted:
        if w in categories:
            if current in categories[w]:
                return True
        elif current == w:
            return True
    return False


def _missing_topics(spec):
    """规则依赖的 topic 是否都在日志里（spec = 规则对象的 `message` 键，来自
    `conditions.message` 归一）。每项是「候选 topic」（`a || b` 任一在即满足），项间都要有；
    命中第一项即中止。全缺则返回原因文案（`"a / b not in log"`）。文案只在这里生成一处，
    构建期只把 `a || b` 拆成候选列表、不认识语义。
    """
    for candidates in spec or []:
        if not any(provider.has_topic(t) for t in candidates):
            return " / ".join(candidates) + " not in log"
    return None


def _pick_ref(name, *more, alias=None, unit=None, instance=None):
    """候选组按顺序取第一个存在的 → `(序列, 命中的 bare "topic.field")`；都没有 → `(None, None)`。
    与 _ref 是同一件事，区别只在回传命中的字段：地图轨迹要用它去同一 topic 取时间戳与
    fix_type，图时间轴同理。instance 非 None 时覆盖引用里的区间切片（图"每实例一个面板"用）；
    写死的 `[N]` 与不写下标（= 实例 0）不受影响。
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
    """字段取数：表达式里的 `ref("topic.field", ...)` 与裸写的 `topic.field` 都走这里。下标语法：
    `topic.field` 只取实例 0；`topic[:].field` 所有实例（多实例时给「每实例一组」列表，与写 `[0]` 同形）；
    `topic[a:b].field` 闭区间（含 b）；`topic[N].field` 第 N 个（N 可负）；`topic.field[N]` 数组字段元素下标。
    位置参数是候选组，按顺序取第一个在日志里存在的，都没有返回 None（由数据流自己中止）；
    改名场合一律用候选组，没有"只适用于某版本"的写法（真要按版本分流交给算子或拆两条规则）。
    alias=备用命名（旧固件改过名）；unit=期望输出单位（源单位构建期查好，这里只做一次乘法；
    源单位查不到按原样给，宁可不换算也别乘错系数）。取数由 provider 实现（契约：取不到返回 None）；
    要回传命中字段用 _pick_ref（这里只是它的薄壳）。
    """
    return _pick_ref(name, *more, alias=alias, unit=unit)[0]


def _split_ref(ref):
    """`"topic[:].field"` → ("topic.field", 所有实例)；`[N]` → int；不写下标 → 0。
    实例说明交给 provider 直接用下标取（Python 的 int/切片语义），这里只负责拆开。
    """
    m = re.match(r"^([a-z][a-z0-9_]*)(?:\[([-]?\d*(?::-?\d*)?)\])?\.(.+)$", str(ref))
    if not m:
        return str(ref), 0
    return "%s.%s" % (m.group(1), m.group(3)), _parse_inst(m.group(2))


def _parse_inst(txt):
    """`[2]` → int；`[1:3]` → slice；不写 → 0（只取实例 0）。
    知识库写法约定区间是闭区间（`[1:3]` = 实例 1、2、3），与 Python 相反，转 slice 时上界 +1，
    所以返回的 slice 打印出来比写的多 1，别照它的数字读实例号（报错文案也只打闭区间）。
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
# 只服务 `ref(..., unit="期望单位")`。按「到族基准单位的因子」定义：族内可换、跨族不行（构建期已报错）。
# 键是规范化单位名：构建期把 meta 的自由文本统一成这套，运行期不认别名拼法。
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
    """按因子缩放一条序列。数组字段是「每元素一列」，分组取数是「每实例一组」，都递归下去。"""
    if x is None:
        return None
    if isinstance(x, list):
        return [_scale_series(v, scale) for v in x]
    return np.asarray(x, dtype=float) * scale


# ---------------- compute 表达式求值 ----------------
# 产物里存的是作者写的原文（如 `pct = frac * 100`）。求值用 ast 不 eval 原文：
# 按白名单遍历、把 topic.field 重写成取数调用，再在空 __builtins__ 下 exec。
# 构建期（web/scripts/lib/rule-expr.mjs）已校验一遍，这里再查一遍是防"构建期放行、
# 运行期执行任意代码"的缝：两道关卡判据不同，不能只留一道。

# compute 里放行的直接调用：注册过的算子 + 框架函数：
#   _ref("topic.field") 取一列（支持多候选 + alias/unit）｜ _try(expr) 容错（内层出错整个赋 None）
#   has_topic("name") 消息在不在 ｜ _cfg("NAME") 读飞控参数（见 _cfg）｜ log_ok() 日志完整性
_COMPUTE_CALLABLE = ("_ref", "_try", "has_topic", "_cfg", "log_ok", "len", "int")

# compute 里允许的模块名：裸 Name.attr 碰到这些名字不重写为 ref()，保留为模块.函数 调用（如 np.ptp）
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
    """把表达式里裸写的 `topic.field` / `topic[N].field` / `topic[i].field[j]` 重写成 _ref(...) 调用。
    只接受 `Name.attr` / `Name[N].attr` / `Name[N].attr[M]` 形态，且 Name 不能是已声明变量
    （否则 `变量.属性` 会去访问对象属性，那是任意能力，白名单不给）。
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
        """构造 _ref("prefix.attr") 调用节点"""
        key = "%s.%s" % (prefix, node.attr)
        return ast.copy_location(
            ast.Call(
                func=ast.Name(id="_ref", ctx=ast.Load()),
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

        # 情况 2：topic[N].field（新增，下标在属性左边）
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

    def visit_Name(self, node):
        """ALL_CAPS 内置变量 → _cfg("NAME") 调用（不在 env 声明过的才转）。
        小写/混名保持原样，算 compute 变量。"""
        if re.match(r"^[A-Z][A-Z0-9_]*$", node.id) and node.id not in self.env_keys:
            return ast.copy_location(
                ast.Call(
                    func=ast.Name(id="_cfg", ctx=ast.Load()),
                    args=[ast.Constant(value=node.id)],
                    keywords=[],
                ),
                node,
            )
        return node

    def visit_Subscript(self, node):
        self.generic_visit(node)

        # 情况 3：ref(...) 被转换后又被下标（topic.field[j]）；只合并简单下标，
        # 布尔掩码等复杂表达式留给 Python 运行时评估
        if (
            isinstance(node.value, ast.Call)
            and isinstance(node.value.func, ast.Name)
            and node.value.func.id == "_ref"
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
                    func=ast.Name(id="_ref", ctx=ast.Load()),
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
        raise ValueError("compute 只能是一条赋值")
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

    # _try(...)：容错求值（等价老节点的 optional: true），内层出错整个赋 None 而不是中止整条规则。
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


# 表达式求值的名字表：算子本体来自 operators.py 的 COMPUTE_GLOBALS，这里只补引擎负责的 _ref。
_COMPUTE_GLOBALS = COMPUTE_GLOBALS


def _eval_compute(stmt, env, ref_fn=None):
    """求值一条 compute 表达式，结果写进 env。ref_fn：替换表达式里 `_ref(...)` 的实现
    （图上"每实例一个面板"覆盖实例切片，见 _pick_ref），不传就是规则那套 _ref。
    空值语义（与老节点链的唯一差别，有意为之）：None 是值、照常传播；要中止就让异常发生
    （拿 None 比较会抛 TypeError）。老写法靠 optional/`_try(...)` 保留"允许 None"的那半边；
    新写规则若真依赖"缺失即中止"，显式写 `require_true(is_not_none(x))`。
    """
    code, guarded, targets = _compile_compute(stmt, env)
    glb = _COMPUTE_GLOBALS if ref_fn is None else {**_COMPUTE_GLOBALS, "_ref": ref_fn}
    try:
        exec(code, glb, env)
    except Exception:
        if not guarded:
            raise
        for name in targets:
            env[name] = None


def _cfg(name, default=None):
    """读飞控参数。全大写裸名自动走这个函数。
    参数缺失（没录 / 名字写错）返回 `default`（默认 None）不抛异常："没这个参数"与
    "参数等于 0"是两件事，要兜底就把 default 写上（如 `_cfg('RNGFND_TYPE', 0.0)`）。
    """
    params = provider.get_initial_parameters()
    val = (params or {}).get(str(name))
    return default if val is None else val


_COMPUTE_GLOBALS["_ref"] = _ref
_COMPUTE_GLOBALS["_cfg"] = _cfg
_COMPUTE_GLOBALS["has_topic"] = provider.has_topic
_COMPUTE_GLOBALS["log_ok"] = provider.is_log_ok


def _rule_env():
    """一条规则求值时的名字空间：内置变量（provider 给）+ compute 输出存储，每次新的一份
    （compute 的输出直接写进这个 dict）。has_topic/log_ok 同时在 env 与 _COMPUTE_GLOBALS：
    _eval_expr（when 条件）只走 env，exec 里 globals 优先。
    """
    env = provider.builtin_variables()
    env["has_topic"] = provider.has_topic
    env["log_ok"] = provider.is_log_ok
    env["ARMED_INTERVALS"] = provider.armed_intervals
    return env


def _run_rules(group):
    """执行声明了该 group 的经验规则。finding 的 id 按发射顺序生成（F01、F02…），
    所以每条规则的 group 要与它所替换的原过程式检查的位置一致；同 group 内按 order/id 排序执行。
    """
    for _rule in _RULES_BY_GROUP.get(group, ()):
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
            except Exception as _spec_exc:
                # 规格解析失败（firmware/vehicle 写错类型等）要跳过并说明，不能吞成"适用"：
                # 否则错误规则会在所有日志上照跑，误报且无提示。
                _not_applicable = "规则规格解析失败：%s" % _spec_exc
        if _not_applicable:
            skipped(_rid, _not_applicable)
            continue
        # 声明的依赖 topic：构建期把 conditions.message 归一成规则对象的 message 键
        # （项内候选组，见 build-knowledge.mjs 的 normalizeConditions）。**别写成 topics**——
        # 那个键在"适用范围收进 conditions"那次改名后就没了，写成 topics 等于这道闸门
        # 对所有规则失效：缺 topic 的规则会溜到 compute，然后要么静默跑过、要么误报成
        # "数据不足"，用户看不到"这条日志根本没录这个 topic"。
        _missing = _missing_topics(_rule.get("message"))
        if _missing:
            skipped(_rid, _missing)
            continue
        _mode_miss = _match_mode(_rule.get("mode"))
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
        for _out_item in _rule.get("output") or []:
            _v = _env.get(_out_item.get("value"))
            if _v is not None:
                metrics[_out_item["name"]] = _v

        # foreach：把一条规则算出的「事件列表」展开成多条 finding（如 failsafe 的每次边沿）；
        # 事件 dict 的键叠加进模板环境，文案仍写在经验文件里；每事件最多命中一条 trigger（自上而下）。
        # 写法：`foreach: events` 或 `{var: events, keys: [t_s]}`（后者供构建期校验事件键占位符）。
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

            for _trig in _rule.get("trigger") or []:
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

                    for _ek in _ev_spec:
                        if _ek in ("source", "value", "threshold"):
                            continue
                        _ev[_ek] = _ev_spec[_ek]

                    _docurl = _ev.get("docurl") or _rule_docurl

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
# 规则顺带产出的实测值优先（更贴合判定口径）；规则没跑时按声明兜底现算，
# 关键数据不因某条规则 skip 凭空少几项。（累加器 metrics 在文件开头声明，由 run_all() 重置。）
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
    """按 active_tags / guard_tags 匹配故障知识库，返回命中的故障条目。
    两层关卡：trigger 任一命中 active_tags → 进入；exclude 任一命中 guard_tags/active_tags → 本条失效。
    飞行阶段判定已上移到规则层（rules/*.yaml），故障库不再重复判断。
    """
    active_tags = set(tags)
    matched = []
    for e in FAULT_KB:
        trig = e.get("trigger", [])
        excl = e.get("exclude", [])
        if not any(t in active_tags for t in trig):
            continue
        if any(x in guard_tags or x in active_tags for x in excl):
            continue
        matched.append(
            {
                "id": e["id"],
                "name": e["name"],
                "description": e.get("description", ""),
                "riskLevel": e.get("risk_level", ""),
                "possibleRootCause": e.get("possible_root_cause", []),
                "troubleshootingSteps": e.get("troubleshooting_steps", []),
                "docUrls": e.get("doc_urls", []),
                "excludeNotes": e.get("exclude_notes", {}),
            }
        )
    return matched


def run_all():
    """跑完全部规则，返回报告头的判定产物（= 交给前端的 report）。
    具名入口而非模块级副作用：交付边界有具名用例，由第二部分的 np_report() 调用，
    调用顺序不再被"谁先读 __result"隐式约束。入口先重置模块级累加器（add/ran/skipped/
    _run_rules 直接往里追加，不重置二次调用会累加）。
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

    # 按 group_order 顺序执行各 group：顺序即 finding 编号（F01、F02…）的生成顺序，
    # 也决定 guard 标签先后（guards_early 排第一，insufficient_data 才是第一个 guard 标签）。
    # 新增经验只需把 group 登记进 facts.yaml 的 group_order，不用改这个文件（构建期校验登记）。
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
        # 固件族名问 provider：写死一个就是把"本站只支持 PX4"钉进格式无关层；
        # 没有 platform_label() 的格式退回 log_type，至少那是真的、只是不好读。
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
# 时间基准：开机以来的秒数。PX4 时间戳本身就是"开机起的微秒"，不再减 start_timestamp
# （之前减过，导致与 Flight Review 的曲线横轴/消息表差出一段），这里对齐 FR。
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
    """跑完全部规则，把判定产物摆到 `__result`（= 前端那份 report）。跑规则是 run_all() 的活，
    这里只把结果交出去；5 个 np_* 具名入口形状对称，前端没有"谁先读 __result"的隐含顺序。
    "要的实例超出日志里有的"这类说明在这里一并带出（规则侧没人取走会攒着，跑完统一收）。
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
    """numpy 数值 → Python 原生类型（规则用 np.sum/max 等归约后返回 numpy 标量，标准 json 不认识）。"""

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
    """按需抽取时序并降采样。要哪几条线由构建期编译好的预设声明决定（本函数只执行）。
    request：instance=面板实例号；ydata=[{"kind":"field","fields":[…],"unit":…}（字段引用）
    或 {"kind":"var","name":…}（compute 节点输出）]；xdata=可选横轴（不给用命中字段 topic 的
    timestamp）；compute=可选换算节点（与规则同一套表达式，在取 ydata 前求值）。
    返回 {t, x, series, fullCount, warnings}：series 与 ydata 同序等长（取不到为 null），
    x 为 null 表示横轴就是 t；一条都取不到给 {"error": …}。
    换算（四元数→欧拉角、单位、多字段合成）都在这里做，前端只画。
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

    # 3) 横轴：显式给了就用它，否则用命中字段 topic 的 timestamp（阶段底色、tooltip 都要）；
    #    整张图都靠 compute 算出来时，命中字段从节点里的 ref 反推（只定 topic，不求值）
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
    # 横轴与曲线必须来自同一份采样：compute 跨话题（采样率不同）时按横轴降采样会越界，
    # 给一句能照着改的话，别抛 numpy 的 IndexError
    for a in arrs:
        if a is not None and len(a) < n:
            __result = json.dumps(
                {
                    "error": "横轴与某条线的采样数对不上（横轴 %d 点、那条线 %d 点），"
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
    """一条线 → (序列, 命中的 bare 字段名)。kind=var 取 compute 输出（标量由调用方铺成常量线）；
    kind=field 走 _pick_ref（候选组 + 单位换算 + 实例覆盖）。区间引用（`[:]` / `[a:b]`）由前端
    处理成单实例（拆图发 instance= 或展开成多条单实例引用），所以这里只应见到单条序列；
    见到一组是解析器漏了展开，不是预设写错。
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
            "%s 取到的是一组实例（%d 条），区间引用应该在前端就展开成每条一个实例，"
            "这里是解析器的问题，不是预设写错了" % (bare, len(series))
        )
    return series, bare


def _first_ref_bare(stmts):
    """换算节点里第一个"topic 在日志里存在"的字段引用（只用来定时间戳的 topic，不求值）。
    `_ref("topic.field")` 与裸写 `topic.field` 两种写法都要认：这里看的是改写前的原文
    （踩过：只认 ref 时 quat_to_euler(vehicle_attitude.q) 整张图报"取不到时间戳"）。
    """
    for stmt in stmts:
        try:
            tree = ast.parse(stmt)
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "_ref":
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
# 取哪些字段、怎么挑候选、量纲怎么换算，全是格式专有知识，由 provider 提供（见 providers/api.py 可选能力表）。
def np_track(max_points=None):
    global __result
    data = provider.get_flight_track(max_points)
    __result = json.dumps(data, ensure_ascii=False)


# ============ np_materials：系统信息 / 事件 / 丢包 / 参数 / 阶段 ============
# 这一块全是"某种日志的消息形态"的展示，换格式就是另一套，
# 整块由 provider 的 report_materials() 提供（可选能力）。
def np_materials():
    global __result
    __result = json.dumps(provider.report_materials(), ensure_ascii=False)
