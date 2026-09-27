"""engine.py 的 CEL 沙箱与 compute 估值单元测试 —— 不需要真实日志。

加载方式：与 web/scripts/build-knowledge.mjs 的拼接顺序一致（operators → engine），
把 engine/ 里的占位符 __FAULT_KB__ / __RULES__ / __FACTS__ / __FIELD_UNITS__ 替换成
安全桩，再用一个桩 provider 顶替 `open_log(...)`，exec 进一个独立命名空间。

这样测的是**拼进 Pyodide 的那份代码**，而不是一份被测试改写的复制：
- _eval_expr：条件表达式沙箱（白名单 AST + 空 __builtins__）
- _eval_compute：compute 表达式求值（只允许算子 / ref / _try / has_topic）
"""

from __future__ import annotations

from pathlib import Path

ENGINE = Path(__file__).resolve().parents[1]


def _load_engine() -> dict:
    operators_src = (ENGINE / "operators.py").read_text(encoding="utf-8")
    rule_src = (ENGINE / "engine.py").read_text(encoding="utf-8")
    # 占位符替换（与 build-knowledge.mjs 的 .replace 链等价）。
    # 四样知识在产物里都是 **{log_type: ...}**（引擎按文件头挑一套），所以桩也要给这个形状，
    # 下标用 `stub` —— 与下面 `detect_log_type` 桩的返回值对上。
    rule_src = (
        rule_src.replace("__FAULT_KB__", "{}")
        .replace('r"""__RULES__"""', "'{\"stub\": []}'")
        .replace('r"""__FACTS__"""', "'{\"stub\": {}}'")
        .replace("__FIELD_UNITS__", "{}")
    )
    # 拼接顺序即执行顺序：算子注册表在前，引擎本体在后（与产物一致）
    combined = operators_src + "\n" + rule_src
    # 桩 provider：open_log 返回带 has_topic 的对象；本测试不触发 ref/_ref。
    # detect_log_type 同样要桩：引擎靠它决定"用哪一套知识"，而这里没有真实文件头。
    stub = (
        "class _StubProvider:\n"
        "    log_type = 'stub'\n"
        "    def has_topic(self, t):\n"
        "        return False\n"
        "    def is_log_ok(self):\n"
        "        return True\n"
        "    def get_mode_present(self):\n"
        "        return []\n"
        "    def builtin_variables(self):\n"
        "        return {}\n"
        "    def get_initial_parameters(self):\n"
        "        return {}\n"
        "    def get_series(self, bare, instance=None, alias=None):\n"
        "        return None\n"
        "def detect_log_type(b):\n"
        "    return 'stub'\n"
        "def open_log(b, facts):\n"
        "    return _StubProvider()\n"
        "ulog_bytes = b''\n"
    )
    ns: dict = {}
    exec(compile(stub + combined, "<engine_ut>", "exec"), ns)
    return ns


ENG = _load_engine()
_eval_expr = ENG["_eval_expr"]
_eval_compute = ENG["_eval_compute"]
OPERATORS = ENG["OPERATORS"]


# ───────────────────────── 表达式沙箱（_eval_expr）─────────────────────────


def test_eval_expr_allows_arithmetic_compare_and_has_topic():
    known = {"vehicle_attitude", "x"}
    env = {"a": 5, "b": 3, "topics": known, "has_topic": lambda t: t in known}
    assert _eval_expr("a > b", env) is True
    assert _eval_expr("a + b * 2", env) == 11
    assert _eval_expr("a == 5 and b == 3", env) is True
    assert _eval_expr("not (a < b)", env) is True
    assert _eval_expr('has_topic("vehicle_attitude")', env) is True
    assert _eval_expr('"x" in topics', env) is True


def test_eval_expr_rejects_unsafe_nodes():
    env = {"topics": set(), "has_topic": lambda t: False}
    for bad in (
        "vehicle_attitude.q",  # 属性访问
        "[x for x in range(3)]",  # 推导式
        'open("x")',  # 任意函数调用（非白名单）
        '__import__("os")',
        'eval("1")',
    ):
        try:
            _eval_expr(bad, env)
            raise AssertionError("应拒绝：%s" % bad)
        except ValueError:
            pass


# ───────────────────────── compute 估值（_eval_compute）─────────────────────────


def test_compute_runs_operators_and_assigns():
    env: dict = {}
    _eval_compute("m = max([1.0, 2.0, 3.0])", env)
    assert env["m"] == 3.0
    _eval_compute("d = div(10.0, 2.0)", env)
    assert env["d"] == 5.0
    _eval_compute("g = gt(5.0, 3.0)", env)
    assert env["g"] is True
    _eval_compute("c = coalesce(None, 7.0)", env)
    assert env["c"] == 7.0


def test_compute_multi_output_assignment():
    env: dict = {}
    _eval_compute("roll, pitch, yaw = quat_to_euler([1.0, 0.0, 0.0, 0.0])", env)
    assert (env["roll"], env["pitch"], env["yaw"]) == (0.0, 0.0, 0.0)


def test_compute_zero_division_propagates_none():
    env: dict = {}
    _eval_compute("d = div(10.0, 0.0)", env)
    assert env["d"] is None


def test_compute_rejects_non_assign():
    try:
        _eval_compute("max([1.0, 2.0, 3.0])", {})
        raise AssertionError("非赋值应被拒")
    except ValueError:
        pass


def test_compute_rejects_unregistered_call():
    try:
        _eval_compute("x = os.system('echo hi')", {})
        raise AssertionError("未注册函数应被拒")
    except ValueError:
        pass


def test_compute_rejects_import():
    try:
        _eval_compute("import os", {})
        raise AssertionError("import 应被拒")
    except ValueError:
        pass


def test_compute_try_guard_swallows_errors():
    # _try 包裹：内层抛异常整条赋 None，而不是中止整条规则
    env: dict = {}
    _eval_compute("x = _try(1 + None)", env)
    assert env["x"] is None


def test_operators_present_in_compute_namespace():
    # 记录性断言：compute 命名空间里确实带了一整批算子
    assert len(OPERATORS) >= 50
