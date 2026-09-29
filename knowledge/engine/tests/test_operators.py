"""operators.py 的单元测试，不需要真实日志，纯算子求值。

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


# 以下覆盖 2026-09 补的那批算子


def test_std_cv_median_sum():
    a = np.array([1.0, 2.0, 3.0, 4.0])
    assert _op("std")(a) == 1.118033988749895
    assert _op("mean")(a) == 2.5
    assert abs(_op("cv")(a) - 0.4472135954999579) < 1e-12
    assert _op("median")(np.array([1.0, 5.0, 2.0])) == 2.0
    assert _op("sum")(np.array([1.0, 2.0, float("nan")])) == 3.0
    # 均值非正 → 变异系数无意义（不是 0，是 None）
    assert _op("cv")(np.array([-1.0, 1.0])) is None
    assert _op("std")(None) is None
    assert _op("sum")(np.array([])) is None


def test_scalar_arithmetic_and_series_arithmetic():
    # 标量进 → 标量出（电机通道均值极差、电芯数 x+0.5 这类场合）
    assert _op("add")(2.0, 0.5) == 2.5
    assert _op("sub")(1950.0, 1000.0) == 950.0
    assert _op("abs")(-3.0) == 3.0
    assert _op("mod")(7.0, 3.0) == 1.0
    assert _op("mod")(7.0, 0.0) is None
    # 序列进 → 序列出，长度取较短者
    assert list(_op("sub")(np.array([5.0, 7.0, 9.0]), np.array([1.0, 2.0]))) == [4.0, 5.0]
    assert list(_op("abs")(np.array([-1.0, 2.0]))) == [1.0, 2.0]
    # 缺失传播
    assert _op("add")(None, 1.0) is None


def test_abs_diff_and_sum_abs_accept_scalars():
    # 回归：旧实现对标量输入 IndexError（0-d 数组切不了）
    assert _op("abs_diff")(2.0, 5.0) == 3.0
    assert _op("sum_abs")(2.0, -5.0) == 7.0
    # 序列语义不变
    assert list(_op("abs_diff")(np.array([1.0, 5.0]), np.array([3.0, 3.0]))) == [2.0, 2.0]


def test_diff_and_wrap_degrees():
    assert list(_op("diff")(np.array([1.0, 2.0, 5.0]))) == [1.0, 3.0]
    assert _op("diff")(np.array([1.0])) is None  # 样本不够 → None
    # 航向误差跨 ±180° 时不能给出约 360° 的假误差
    wrapped = _op("wrap_degrees")(np.array([0.0, 190.0, -190.0, 359.0]))
    assert list(wrapped) == [0.0, -170.0, 170.0, -1.0]


def test_stack_columns_and_column_ratio_events():
    c1 = np.full(10, 1500.0)
    c2 = np.full(10, 1400.0)
    c3 = np.full(10, 1900.0)
    c3[5:] = 1980.0
    # C5..C8 缺失：跳过的列不占位
    cols = _op("stack_columns")(c1, c2, c3, None, None, None, None, None)
    assert len(cols) == 3
    # 全缺失 → None（不算"三列全空"这种假矩阵）
    assert _op("stack_columns")(None, None) is None
    # 全时段只看 C3 有一半样本饱和
    ev = _op("column_ratio_events")(cols, 1950.0, min_frac=0.2)
    assert ev == [{"channel": 3, "frac": 0.5, "mean": 1940.0}]
    # 加掩码后只看后半段 → 全饱和
    mask = np.zeros(10, dtype=bool)
    mask[5:] = True
    assert _op("column_ratio_events")(cols, 1950.0, mask, min_frac=0.2)[0]["frac"] == 1.0
    # 没有通道够格 → None
    assert _op("column_ratio_events")(cols, 1950.0, min_frac=0.9) is None


def test_excursion_events_and_longest_true_run():
    v = np.array([0.0, 5.0, 20.0, 30.0, 28.0, 3.0, 0.0, 40.0, 41.0, 2.0])
    ts = np.arange(v.size, dtype=np.int64) * 1_000_000
    ev = _op("excursion_events")(v, ts, 0, threshold=15.0, min_duration_s=1.0)
    # 两段：2~4s（峰 30）、7~8s（峰 41）；按超出幅度降序
    assert [e["peak"] for e in ev] == [41.0, 30.0]
    assert ev[0]["dur_s"] == 1.0 and ev[1]["dur_s"] == 2.0
    # 时长不到 1s 的段被丢掉（上面那两段都 >=1s，这里换成 3s 只剩 2~4s? 不，2s<3s → 全丢）
    assert _op("excursion_events")(v, ts, 0, threshold=15.0, min_duration_s=3.0) is None
    # abs_above：负值也按幅度算
    ev_abs = _op("excursion_events")(-v, ts, 0, threshold=15.0, mode="abs_above", min_duration_s=1.0)
    assert [e["peak"] for e in ev_abs] == [41.0, 30.0]
    # 最长连续为真：20/30/28 那段的起止时间差 2s
    assert _op("longest_true_run")(v > 15.0, ts) == 2.0
    # 全假 → 0（"从未满足"是有结论，不是缺数据）
    assert _op("longest_true_run")(v > 100.0, ts) == 0.0


def test_gap_events():
    # 名义间隔 0.1s；阈值 = max(0.5, 10×0.1) = 1.0s
    ts = np.array([0, 100_000, 200_000, 3_200_000, 3_300_000, 20_000_000], dtype=np.int64)
    ev = _op("gap_events")(ts, 0)
    assert [e["gap_s"] for e in ev] == [16.7, 3.0]
    assert ev[0]["nominal_dt_s"] == 0.1 and ev[0]["threshold_s"] == 1.0
    # 采样太稀（名义间隔大）时绝对下限兜底：不会把慢速日志的正常间隔算成间隙
    slow = np.arange(0, 10, dtype=np.int64) * 2_000_000
    assert _op("gap_events")(slow, 0) is None
    # 样本太少 → None
    assert _op("gap_events")(np.array([0, 1], dtype=np.int64), 0) is None


def test_step_drop_events_recovery_flag():
    ts = np.arange(7, dtype=np.int64) * 100_000
    # 跌下去不回来 → recovered False（真掉电/接触不良）
    persist = np.array([16.0, 15.9, 15.8, 12.0, 11.9, 11.8, 11.7])
    ev = _op("step_drop_events")(persist, ts, 0, min_drop=2.0)
    assert abs(ev[0]["drop"] - 3.8) < 1e-9 and ev[0]["recovered"] is False
    # 跌一拍就弹回 → recovered True（采样毛刺）
    bounce = np.array([16.0, 15.9, 12.0, 15.9, 15.8, 15.7, 15.6])
    assert _op("step_drop_events")(bounce, ts, 0, min_drop=2.0)[0]["recovered"] is True
    # 跌幅不够 → 没有事件
    assert _op("step_drop_events")(np.array([16.0, 15.9, 15.0, 15.8]), ts[:4], 0, min_drop=2.0) is None
    # 间隔超过 max_dt_s 的落差不算"快速跌落"（那是正常放电）
    slow = np.array([16.0, 15.9, 11.0])
    assert _op("step_drop_events")(slow, np.arange(3, dtype=np.int64) * 1_000_000, 0) is None


def test_count_items_contains_text():
    items = [
        {"level": 3, "text": "PreArm: Throttle below Failsafe"},
        {"level": 3, "text": "PreArm: GPS horizontal accuracy low"},
        {"level": 5, "text": "EKF2 IMU0 emergency yaw reset"},
    ]
    # 子串匹配、大小写不敏感（日志里的拼写不统一）
    assert _op("count_items")(items, key="text", contains="prearm") == 2
    assert _op("count_items")(items, key="text", contains="yaw reset") == 1
    assert _op("count_items")(items, key="text", contains="nothing") == 0
    # take_items 同样支持
    assert len(_op("take_items")(items, key="text", contains="prearm", limit=5)) == 2
    # 数值判定不受影响
    assert _op("count_items")(items, key="level", gte=5) == 1
