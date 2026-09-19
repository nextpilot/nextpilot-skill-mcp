"""operators.py 的单元测试 —— 不需要真实日志，纯算子求值。

加载方式：engine/ 不是包，用 importlib 按路径加载 operators.py 真实源码，
避免"在测试里重写一份逻辑"造成的假绿。operators.py 顶层无外部依赖
（numpy 在算子内部局部 import），exec_module 即可，无需改动 engine/ 结构。
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np

ENGINE = Path(__file__).resolve().parents[1]
_SPEC = importlib.util.spec_from_file_location("_operators_ut", ENGINE / "operators.py")
operators = importlib.util.module_from_spec(_SPEC)
sys.modules["_operators_ut"] = operators
_SPEC.loader.exec_module(operators)
OPERATORS = operators.OPERATORS
SIGNATURES = operators.SIGNATURES


def _op(name):
    return OPERATORS[name]


def test_operator_registry_basics():
    # 注册表非空，且签名元信息齐全（in/out arity、out_names）
    assert "max" in OPERATORS and "mean" in OPERATORS and "quat_to_euler" in OPERATORS
    for n in ("max", "mean", "div", "gt", "quat_to_euler"):
        sig = SIGNATURES[n]
        assert "in_arity" in sig and "out_arity" in sig


def test_max_mean_min_ignore_nan_and_none():
    assert _op("max")([1.0, 2.0, float("nan"), 3.0]) == 3.0
    assert _op("max")(None) is None
    # 全 NaN → 没有有限值 → None
    assert _op("max")([float("nan"), float("nan")]) is None
    assert _op("min")([3.0, 1.0, 2.0]) == 1.0
    assert _op("mean")([1.0, 2.0, 3.0]) == 2.0
    assert _op("mean")(None) is None


def test_gt_none_propagation():
    assert _op("gt")(5.0, 3.0) is True
    assert _op("gt")(1.0, 3.0) is False
    # 任一输入缺失 → None（不抛异常，显式传播）
    assert _op("gt")(None, 3.0) is None
    assert _op("gt")(5.0, None) is None


def test_div_zero_guard_and_require_positive():
    assert _op("div")(10.0, 2.0) == 5.0
    assert _op("div")(10.0, 0.0) is None  # 除零守卫
    assert _op("div")(None, 2.0) is None  # 缺失输入
    assert _op("div")(10.0, 2.0, require_positive=True) == 5.0
    assert _op("div")(-1.0, 2.0, require_positive=True) is None


def test_logical_operators():
    assert _op("is_none")(None) is True
    assert _op("is_none")(5.0) is False
    assert _op("is_not_none")(5.0) is True
    assert _op("coalesce")(None, 7.0) == 7.0
    assert _op("coalesce")(3.0, 7.0) == 3.0
    assert _op("value_if")(True, 9.0) == 9.0
    assert _op("value_if")(False, 9.0) is None
    assert _op("both")(True, True) is True
    assert _op("both")(True, False) is False


def test_quat_to_euler_multi_output():
    roll, pitch, yaw = _op("quat_to_euler")([1.0, 0.0, 0.0, 0.0])
    # 单位四元数 → 零姿态
    assert (roll, pitch, yaw) == (0.0, 0.0, 0.0)
    # 输入不足（<4 列）→ 三路 None
    assert _op("quat_to_euler")([1.0, 0.0]) == (None, None, None)
    # 非单位四元数也应给出有限角度（先归一化）
    r, p, y = _op("quat_to_euler")([2.0, 0.0, 0.0, 0.0])
    assert np.isfinite(r) and np.isfinite(p) and np.isfinite(y)


def test_worst_mean_stats_picks_worst_instance():
    groups = [np.array([1.0, 2.0, 3.0]), np.array([10.0, 20.0, 30.0])]
    mean, p95, vmax, instance = _op("worst_mean_stats")(groups)
    assert instance == 1  # 取均值最大的实例
    assert mean == 20.0
    assert vmax == 30.0
    # 无有效实例 → None
    assert _op("worst_mean_stats")([np.array([]), None]) is None


def test_columns_aggregate():
    # 两列，各取 min 再跨列 min
    matrix = [np.array([5.0, 6.0]), np.array([3.0, 4.0])]
    assert _op("columns_aggregate")(matrix) == 3.0
    # gt 排除占位 0
    assert _op("columns_aggregate")([np.array([0.0, 0.0]), np.array([2.0, 3.0])], gt=0) == 2.0
    # 全部被 gt 排除 → None
    assert _op("columns_aggregate")([np.array([0.0, 0.0])], gt=0) is None
