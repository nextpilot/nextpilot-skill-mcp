"""engine.py 的 CEL 沙箱与 compute 估值单元测试，不需要真实日志。

加载方式：与 web/scripts/build-knowledge.mjs 的拼接顺序一致（operators → engine），
把 engine/ 里的占位符替换成安全桩，再用一个桩 provider 顶替 `open_log(...)`，
exec 进独立命名空间——测的是拼进 Pyodide 的那份代码，而不是被测试改写的复制。
"""

from __future__ import annotations

from pathlib import Path

ENGINE = Path(__file__).resolve().parents[1]


def _load_engine() -> dict:
    operators_src = (ENGINE / "operators.py").read_text(encoding="utf-8")
    rule_src = (ENGINE / "engine.py").read_text(encoding="utf-8")
    # 占位符替换（与 build-knowledge.mjs 的 .replace 链等价）。
    # 四样知识在产物里都是 {log_type: ...}（引擎按文件头挑一套），桩也要给这个形状，
    # 下标用 `stub`，与下面 `detect_log_type` 桩的返回值对上。
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


# 表达式沙箱（_eval_expr）


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


# compute 估值（_eval_compute）


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


def test_compute_spectrum_outputs_freq_and_mag_axes():
    # 频谱算子走的多输出赋值：f/p 两条等长数组都要进 env（图上 ydata 当 kind:"var" 取 p）
    env: dict = {}
    _eval_compute("f, p = spectrum([0.0, 1.0, 0.0, -1.0] * 16, sample_rate=1000.0)", env)
    assert env["f"] is not None and env["p"] is not None
    assert len(env["f"]) == len(env["p"])
    # 退化输入 → 两个名字都是 None，不抛异常（规则据此 skip）
    env2: dict = {}
    _eval_compute("f2, p2 = spectrum([1.0, 1.0, 1.0], sample_rate=100.0)", env2)
    assert env2["f2"] is None and env2["p2"] is None


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


def test_missing_topics_reads_message_key_not_topics():
    """依赖 topic 的闸门要读规则对象的 `message` 键。

    `message` 由构建期从 `conditions.message` 归一而来（见 build-knowledge.mjs 的
    normalizeConditions）。历史上这里误读过 `topics`——那是改名前的旧键，导致闸门对
    所有规则恒不触发：缺 topic 的规则不报"未录制"，而是溜到 compute 后要么静默跑过、
    要么误报成"数据不足"。这条测试把键名钉死，改名或改回旧键都会当场红。
    """
    eng = _load_engine()
    rule = {
        "id": "t",
        "message": [["never_recorded_topic"], ["also_absent", "absent"]],
    }
    # 桩 provider 的 has_topic 恒 False → 第一项候选全缺，应命中并回报
    reason = eng["_missing_topics"](rule.get("message"))
    assert reason == "never_recorded_topic not in log"

    # 旧键名 topics 不再被读：即便塞了值也不该被当成依赖
    legs = {"topics": [["whatever"]]}
    assert eng["_missing_topics"](legs.get("message")) is None


def _load_engine_with_series(fs: float, n: int) -> dict:
    """带一个能吐出正弦序列 + 时间戳的桩 provider 的引擎命名空间。

    频谱要跑通 `compute 里 spectrum(...) → env → np_spectrum 取频率轴/幅度轴` 这条链，
    需要 get_series 真能回数据，而 `_load_engine` 的桩恒回 None。这里按同一套拼接方式
    再装一份，只把 get_series 换成合成信号（50 Hz 正弦 @ fs）。
    """
    operators_src = (ENGINE / "operators.py").read_text(encoding="utf-8")
    rule_src = (ENGINE / "engine.py").read_text(encoding="utf-8")
    rule_src = (
        rule_src.replace("__FAULT_KB__", "{}")
        .replace('r"""__RULES__"""', "'{\"stub\": []}'")
        .replace('r"""__FACTS__"""', "'{\"stub\": {}}'")
        .replace("__FIELD_UNITS__", "{}")
    )
    combined = operators_src + "\n" + rule_src
    stub = (
        "import numpy as _np\n"
        f"_FS, _N = {fs}, {n}\n"
        "_SIG = _np.sin(2 * _np.pi * 50.0 * _np.arange(_N) / _FS)\n"
        "_TS = (_np.arange(_N) * (1e6 / _FS)).astype('int64')\n"
        "class _StubProvider:\n"
        "    log_type = 'stub'\n"
        "    def has_topic(self, t):\n"
        "        return t == 'sensor_combined'\n"
        "    def is_log_ok(self):\n"
        "        return True\n"
        "    def get_mode_present(self):\n"
        "        return []\n"
        "    def builtin_variables(self):\n"
        "        return {}\n"
        "    def get_initial_parameters(self):\n"
        "        return {}\n"
        "    def armed_intervals(self):\n"
        "        return []\n"
        "    def get_series(self, bare, instance=None, alias=None):\n"
        "        if bare == 'sensor_combined.gyro_rad[0]':\n"
        "            return [_np.asarray(_SIG)]\n"
        "        if bare == 'sensor_combined.timestamp':\n"
        "            return _TS\n"
        "        return None\n"
        "def detect_log_type(b):\n"
        "    return 'stub'\n"
        "def open_log(b, facts):\n"
        "    return _StubProvider()\n"
        "ulog_bytes = b''\n"
    )
    ns: dict = {}
    exec(compile(stub + combined, "<engine_ut_series>", "exec"), ns)
    return ns


def test_np_spectrum_end_to_end_from_compute():
    """频谱算子经 compute 求值、再被 np_spectrum 取出频率轴与幅度轴（W4/W5 的引擎链路）。"""
    import json

    ns = _load_engine_with_series(fs=1000.0, n=4096)
    request = {
        "instance": 0,
        "ydata": [{"kind": "var", "name": "px", "unit": None}],
        "compute": [
            "gx = sensor_combined.gyro_rad[0]",
            'f, px = spectrum(gx, sample_rate=1000.0, norm="amplitude")',
        ],
        "series": [{"label": "Gyro X", "style": None, "color": None}],
        "kind": "spectrum",
        "freq": "f",
    }
    ns["__result"] = None
    ns["np_spectrum"](json.dumps(request))
    out = json.loads(ns["__result"])
    assert "error" not in out, out
    assert len(out["f"]) == len(out["series"][0]["p"])
    # 主频落在 50 Hz（误差 < 1 bin）、采样率标成显式
    peak = out["f"][max(range(len(out["series"][0]["p"])), key=lambda i: out["series"][0]["p"][i] or 0)]
    assert abs(peak - 50.0) < 1000.0 / 4096
    assert out["fs"] == 1000.0 and out["fsSource"] == "explicit"

    # 缺 freq 名 → 取不到频率轴，明确报错而不是画错图
    bad = dict(request)
    bad.pop("freq")
    ns["__result"] = None
    ns["np_spectrum"](json.dumps(bad))
    assert "error" in json.loads(ns["__result"])


def test_np_spectrum_infers_fs_from_timestamp():
    """没写 sample_rate 时，引擎从命中话题的 timestamp 自推 fs 并注入重算。

    这条链是 W5 的关键：作者不该在 preset 里写死 fs（有版本/机架差异），而算子本身拿不到
    时间戳，只能由 `np_spectrum` → `_inject_spectrum_fs` 补。注入要在实参表**末尾**追加关键字
    实参——插到开头会得到 `spectrum(sample_rate=…, gx, …)`，Python 语法错误，而异常被 `_try`
    吞掉后的表现是"整张图没数据"，从报错里看不出是注入位置错了（踩过）。
    """
    import json

    ns = _load_engine_with_series(fs=1000.0, n=4096)
    request = {
        "instance": 0,
        "ydata": [{"kind": "var", "name": "px", "unit": None}],
        "compute": [
            "gx = sensor_combined.gyro_rad[0]",
            'f, px = spectrum(gx, norm="amplitude")',
        ],
        "kind": "spectrum",
        "freq": "f",
    }
    ns["__result"] = None
    ns["np_spectrum"](json.dumps(request))
    out = json.loads(ns["__result"])
    assert "error" not in out, out
    # 桩时间戳就是按 fs=1000 造的，自推值应当回到 1000
    assert out["fsSource"] == "inferred"
    assert abs(out["fs"] - 1000.0) < 1e-6, out["fs"]
    # 自推之后幅度轴也要真算出来（注入位置写错时这里是全 None / error）
    assert len(out["f"]) == len(out["series"][0]["p"])
    peak = out["f"][max(range(len(out["series"][0]["p"])), key=lambda i: out["series"][0]["p"][i] or 0)]
    assert abs(peak - 50.0) < 1000.0 / 4096


def test_append_spectrum_kwarg_places_after_positional():
    """`_append_spectrum_kwarg` 把关键字实参插在实参表末尾，且不碰字符串里的括号。"""
    eng = _load_engine()
    fn = eng["_append_spectrum_kwarg"]
    assert fn('f, px = spectrum(gx, norm="amplitude")', "sample_rate", 204.5) == (
        'f, px = spectrum(gx, norm="amplitude", sample_rate=204.5)'
    )
    # 没有别的实参：直接补一个，不能多出逗号
    assert fn("f, px = spectrum(px0)", "sample_rate", 100.0) == "f, px = spectrum(px0, sample_rate=100.0)"
    # 字符串里的括号不能让扫描提前收尾
    assert fn('f, px = spectrum(gx, label="a)b", norm="psd")', "sample_rate", 1.0) == (
        'f, px = spectrum(gx, label="a)b", norm="psd", sample_rate=1.0)'
    )
    assert fn("x = 1 + 2", "sample_rate", 1.0) is None
