"""预定函数（算子）注册表 —— 经验文件里的 `op:` 只能引用这里注册的算子。

约定：
- 算子签名用 @operator 声明 in_arity / out_arity / out_names，
  构建期按签名校验规则文件里 in/out 的数量（多输入/多输出不靠约定，靠校验）。
- 调用形式 fn(*args, **opts)：args 是按 `in` 顺序取到的值（numpy 数组或标量），
  opts 是节点上的其他键（unit / per_instance / scope 等），算子用 **kw 吸收不关心的项。
- 返回：out_arity==1 时返回标量；>1 时返回与 out_names 等长的元组。
- 数据不足时返回 None，框架据此跳过该规则（不产出 finding）。
"""

OPERATORS: dict[str, object] = {}
SIGNATURES: dict[str, dict] = {}


def operator(name: str, in_arity: int = 1, out_arity: int = 1, out_names=None, doc: str = ""):
    """把一个函数注册为经验可引用的算子。"""

    def deco(fn):
        OPERATORS[name] = fn
        SIGNATURES[name] = {
            "in_arity": in_arity,
            "out_arity": out_arity,
            "out_names": list(out_names or []),
            "doc": doc or (fn.__doc__ or "").strip().split("\n")[0],
        }
        return fn

    return deco


def _finite(values):
    """过滤非有限值（NaN/Inf），返回 np 数组。"""
    import numpy as np

    a = np.asarray(values, dtype=float)
    return a[np.isfinite(a)]


# ─────────────────────────── 标量统计 ───────────────────────────

@operator("max", doc="最大值（忽略 NaN）")
def op_max(values, **kw):
    if values is None: return None
    a = _finite(values)
    return float(a.max()) if a.size else None


@operator("min", doc="最小值（忽略 NaN）")
def op_min(values, **kw):
    if values is None: return None
    a = _finite(values)
    return float(a.min()) if a.size else None


@operator("min_ge", doc="有限且 >= ge 的最小值（排除无效值，如 remaining=-1 表示未知）")
def op_min_ge(values, ge=None, **kw):
    if values is None: return None
    a = _finite(values)
    if ge is not None:
        a = a[a >= float(ge)]
    return float(a.min()) if a.size else None


@operator("scale", in_arity=1, out_arity=1, doc="标量乘以系数（如比例 → 百分比）")
def op_scale(x, factor=1.0, **kw):
    return float(x) * float(factor) if x is not None else None


@operator("mean", doc="均值（忽略 NaN）")
def op_mean(values, **kw):
    if values is None: return None
    a = _finite(values)
    return float(a.mean()) if a.size else None


# ─────────────────────────── 空值 / 逻辑 / 算术（通用积木）───────────────────────────

@operator("is_none", doc="值是否为 None（数据缺失在数据流里显式传播，而不是断链）")
def op_is_none(x, **kw):
    return x is None


@operator("is_not_none", doc="值是否非 None")
def op_is_not_none(x, **kw):
    return x is not None


@operator("gt", in_arity=2, doc="a > b 的布尔结果（把阈值条件变成可喂给 value_if 的标记）")
def op_gt(a, b, **kw):
    if a is None or b is None:
        return None
    return float(a) > float(b)


@operator("both", in_arity=2, doc="逻辑与：两个布尔量皆真")
def op_both(a, b, **kw):
    return bool(a) and bool(b)


@operator("coalesce", in_arity=2, doc="返回第一个非 None 的值，都缺失则 None")
def op_coalesce(a, b, **kw):
    return a if a is not None else b


@operator("value_if", in_arity=2, doc="cond 为真返回 x，否则 None（条件性产出统计值）")
def op_value_if(cond, x, **kw):
    return x if cond else None


@operator("div", in_arity=2, doc="a / b；b 为 0 或任一输入缺失返回 None；require_positive 时要求两者 >0")
def op_div(a, b, require_positive=False, **kw):
    if a is None or b is None or float(b) == 0:
        return None
    if require_positive and not (float(a) > 0 and float(b) > 0):
        return None
    return float(a) / float(b)


# ─────────────────────────── 定长数组字段（任意 float32[n] 时间序列列集合）───────────────────────────

def _as_columns(matrix):
    """数组字段经 _read_field_ref 收集后是“每元素一列”的列表（各列为等长时间序列）；
    单序列输入也兼容。跳过 None 占位列。"""
    import numpy as np

    if matrix is None:
        return []
    if not isinstance(matrix, (list, tuple)):
        matrix = [matrix]
    return [np.asarray(c, dtype=float) for c in matrix if c is not None]


@operator(
    "columns_aggregate",
    doc="先对每列做 column_op 标量归约，再用 combine 跨列归约（如各电芯最小值中的最小值，gt=0 排除占位 0）",
)
def op_columns_aggregate(matrix, column_op="min", combine="min", gt=None, ge=None, **kw):
    import numpy as np

    scalars = []
    for a in _as_columns(matrix):
        a = _finite(a)
        if gt is not None:
            a = a[a > float(gt)]
        if ge is not None:
            a = a[a >= float(ge)]
        if a.size:
            scalars.append(float(getattr(np, str(column_op))(a)))
    if not scalars:
        return None
    return float(getattr(np, str(combine))(scalars))


@operator(
    "rows_aggregate",
    doc="跨列逐时刻归约成一条时间序列（如每个时刻各电芯的最低电压）；gt/ge 之外处置 NaN",
)
def op_rows_aggregate(matrix, agg="min", gt=None, ge=None, **kw):
    import numpy as np

    cols = _as_columns(matrix)
    if not cols:
        return None
    stack = np.vstack(cols)
    if gt is not None:
        stack = np.where(stack > float(gt), stack, np.nan)
    if ge is not None:
        stack = np.where(stack >= float(ge), stack, np.nan)
    return getattr(np, str(agg))(stack, axis=0)


@operator(
    "head_tail_median_drop",
    in_arity=3,
    out_arity=2,
    out_names=["drop", "tail_median"],
    doc="第一个区间内（跳过前 skip_first_s 秒）头段中位数 - 尾段中位数；任意 (序列, 时间戳, 区间) 通用",
)
def op_head_tail_median_drop(x, vts, intervals, skip_first_s=5, min_seg=20,
                             head_frac=0.1, tail_frac=0.2, **kw):
    """intervals 为 (start_us, end_us) 列表，只取第一个；seg 长度须 > min_seg。
    返回 (落差, 尾段中位数)，数据不足返回 None。"""
    import numpy as np

    if x is None or vts is None or not intervals:
        return None
    x = np.asarray(x, dtype=float)
    vts = np.asarray(vts, dtype=np.int64)
    if len(x) != len(vts):
        return None
    start_us = int(intervals[0][0])
    lo = int(np.searchsorted(vts, start_us + int(float(skip_first_s) * 1e6)))
    seg = x[lo:]
    seg = seg[np.isfinite(seg)]
    if len(seg) <= int(min_seg):
        return None
    tail = float(np.median(seg[-max(5, int(len(seg) * float(tail_frac))):]))
    head = float(np.median(seg[: max(5, int(len(seg) * float(head_frac)))]))
    return float(head - tail), tail


# ─────────────────────────── 多实例传感器（per-instance）───────────────────────────
# 这类算子的输入是「每个传感器实例一组数据」的列表（框架对 per_instance 节点按
# topic dataset 分组喂入）。数组字段（如 float32[3]）每组是「每元素一列」的列表。
# 全部通用：不认识任何具体 topic/字段，只做跨实例归约，取「最差实例」并回传其序号。

def _groups(groups):
    return [g for g in (groups or []) if g is not None]


def _as_group_list(x):
    """per_instance 分组 → 列表，**保留 None 占位**。

    实例序号（标题里的 “IMU #1”、estimator #2）必须与原始 dataset 顺序一致，
    所以这里不能过滤 None——过滤会让后面的实例序号整体前移。
    """
    if x is None:
        return []
    if isinstance(x, (list, tuple)):
        return list(x)
    return [x]


def _pick(lst, i):
    return lst[i] if i < len(lst) else None


@operator(
    "worst_mean_stats",
    out_arity=4,
    out_names=["mean", "p95", "vmax", "instance"],
    doc="每个实例一条标量序列：取均值最大的实例，回传其均值/p95/最大值/实例序号；"
        "均值不超过 min_mean 的实例视作无效（缺省 0，即要求确有有效样本）",
)
def op_worst_mean_stats(groups, min_mean=0.0, **kw):
    import numpy as np

    best = None
    for i, g in enumerate(_as_group_list(groups)):
        if g is None or isinstance(g, (list, tuple)):
            continue
        a = _finite(g)
        if not a.size:
            continue
        m = float(a.mean())
        if m <= float(min_mean):
            continue
        if best is None or m > best[0]:      # 严格大于：并列时保留首个实例
            best = (m, float(np.percentile(a, 95)), float(a.max()), i)
    return best                                # 无有效实例时返回 None


@operator(
    "worst_rss_mean",
    in_arity=3,
    out_arity=2,
    out_names=["rss", "instance"],
    doc="每个实例三轴序列：mean(sqrt(x^2+y^2+z^2))，取 RSS 最大的实例及序号；"
        "不超过 min_mean 的实例视作无效（缺省 0，与迁移前初值 0 的严格比较大一致）",
)
def op_worst_rss_mean(gx, gy, gz, min_mean=0.0, **kw):
    import numpy as np

    xs, ys, zs = _as_group_list(gx), _as_group_list(gy), _as_group_list(gz)
    best = None
    for i in range(max(len(xs), len(ys), len(zs))):
        x, y, z = _pick(xs, i), _pick(ys, i), _pick(zs, i)
        if x is None or y is None or z is None:
            continue
        if isinstance(x, (list, tuple)) or isinstance(y, (list, tuple)) or isinstance(z, (list, tuple)):
            continue
        rss = float(np.mean(np.sqrt(
            np.asarray(x, float) ** 2 + np.asarray(y, float) ** 2 + np.asarray(z, float) ** 2)))
        if rss <= float(min_mean):
            continue
        if best is None or rss > best[0]:
            best = (rss, i)
    return best


@operator(
    "worst_column_delta",
    out_arity=3,
    out_names=["count", "instance", "axis"],
    doc="每个实例一组等长列（如 float32[3] 计数序列）：逐列取 max-min，回传全局最大差值及其实例/列序号",
)
def op_worst_column_delta(groups, **kw):
    import numpy as np

    best = None
    for i, g in enumerate(_as_group_list(groups)):
        if not isinstance(g, (list, tuple)):
            continue
        for axis, col in enumerate(g):
            if col is None:
                continue
            delta = int(np.max(col)) - int(np.min(col))
            if best is None or delta > best[0]:
                best = (delta, i, axis)
    return best


# ─────────────────────────── 位掩码 / 跨实例归约（通用）───────────────────────────

@operator("has_bits", in_arity=2, doc="value 是否置起了 mask 中的任意一位（mask 传 -1 表示“任意位非零”）")
def op_has_bits(value, mask, **kw):
    if value is None or mask is None:
        return None
    return bool(int(value) & int(mask))


@operator("to_int", doc="取整（位掩码/计数类字段：保证证据与文案里按整数呈现，而不是 1.0）")
def op_to_int(x, **kw):
    return None if x is None else int(x)


@operator("bit_or_max", doc="位掩码序列按实例分组：每实例取最大值后按位或（跨实例合并置位）")
def op_bit_or_max(groups, **kw):
    acc = 0
    seen = False
    for g in _groups(groups):
        if g is None or isinstance(g, (list, tuple)) or not len(g):
            continue
        seen = True
        acc |= int(max(int(v) for v in g))
    return acc if seen else None


@operator("max_of_max", doc="数值序列按实例分组：每实例取最大值，再跨实例取最大（忽略缺失实例）")
def op_max_of_max(groups, **kw):
    best = None
    for g in _groups(groups):
        if g is None or isinstance(g, (list, tuple)):
            continue
        a = _finite(g)
        if not a.size:
            continue
        m = float(a.max())
        if best is None or m > best:
            best = m
    return best


@operator(
    "worst_reject_ratio",
    in_arity=9,
    out_arity=3,
    out_names=["frac", "names", "instance"],
    doc="按实例扫描“拒绝占比”：主信号（位掩码，如创新检验标志）非空时用它（非零样本占比、"
        "按位或展开位名），否则逐一比较候选通道（有限样本中 >= ge 的占比，需 >= channel_min 个）；"
        "取全局最大占比，返回占比/命中名称/实例序号。字段名与标签全部由经验文件提供。",
)
def op_worst_reject_ratio(primary, ch0, ch1, ch2, ch3, ch4, ch5, ch6, ch7,
                          primary_min=3, primary_names=None, ge=1.0, channel_min=3,
                          channel_labels=None, fallback_label="未知通道", **kw):
    import numpy as np

    bit_names = list(primary_names or [])
    chan_labels = list(channel_labels or [])
    # 保留 None 占位：主信号整列缺失时仍要按实例序号继续扫通道（否则不产出任何候选）
    primary_groups = _as_group_list(primary)
    chan_groups = [_as_group_list(c) for c in (ch0, ch1, ch2, ch3, ch4, ch5, ch6, ch7)]
    n_inst = max([len(primary_groups)] + [len(cg) for cg in chan_groups])
    best = None
    for i in range(n_inst):
        g = _pick(primary_groups, i)
        # 主信号存在且非空：该实例只用主信号（与迁移前一致，不再回落扫通道）
        if g is not None and not isinstance(g, (list, tuple)) and len(g):
            bad = int(np.count_nonzero(g))
            if bad < int(primary_min):
                continue
            union = 0
            for v in np.asarray(g):          # 不转 float：位掩码必须按位精确
                union |= int(v)
            fired = "、".join(bit_names[b] for b in range(len(bit_names)) if union & (1 << b))
            frac = bad / float(len(g))
            if best is None or frac > best[0]:
                best = (frac, fired or fallback_label, i)
            continue
        for ci, cg in enumerate(chan_groups):
            if cg is None or i >= len(cg) or cg[i] is None:
                continue
            arr = _finite(cg[i])
            if not arr.size:
                continue
            n_bad = int(np.count_nonzero(arr >= float(ge)))
            if n_bad < int(channel_min):
                continue
            frac = n_bad / float(arr.size)
            label = chan_labels[ci] if ci < len(chan_labels) else ""
            if best is None or frac > best[0]:
                best = (frac, label or fallback_label, i)
    return best


# ─────────────────────────── 序列统计 / 边沿 / 地理（通用）───────────────────────────

@operator("percentile", doc="有限值的第 p 百分位（如 p=95）；无有效值则 None")
def op_percentile(values, p=95, **kw):
    import numpy as np

    if values is None:
        return None
    a = _finite(values)
    return float(np.percentile(a, float(p))) if a.size else None


@operator("count_above", doc="有限值中 > gt 的样本个数")
def op_count_above(values, gt=0.0, **kw):
    import numpy as np

    if values is None:
        return None
    a = _finite(values)
    return int(np.count_nonzero(a > float(gt)))


@operator("edges_count", doc="相邻样本取值发生变化（不等于）的次数：状态/模式切换计数")
def op_edges_count(values, **kw):
    import numpy as np

    if values is None:
        return None
    a = np.asarray(values)
    if a.size < 2:
        return 0
    return int(np.count_nonzero(a[1:] != a[:-1]))


@operator("is_zero", doc="是否等于 0（未置位/无效计数类字段的判据）")
def op_is_zero(x, **kw):
    return None if x is None else float(x) == 0.0


@operator("keep_gt", doc="只保留有限且 > gt 的样本（如排除 eph<=0 的无效值），返回序列")
def op_keep_gt(values, gt=0.0, **kw):
    if values is None:
        return None
    a = _finite(values)
    a = a[a > float(gt)]
    return a if a.size else None


@operator("scale_series", doc="整条序列乘系数（如 mm → m），与标量版 scale 互补")
def op_scale_series(values, factor=1.0, **kw):
    import numpy as np

    if values is None:
        return None
    return np.asarray(values, dtype=float) * float(factor)


@operator(
    "adjacent_speed_mps",
    in_arity=3,
    doc="经纬度与时间戳（us）→ 相邻样本地面速度序列（m/s）；等距柱状近似。"
        "unit 说明经纬度口径：degE7（旧字段 lat/lon 的 1e7 度）或 deg（新字段 latitude_deg），"
        "由经验文件按固件版本给出",
)
def op_adjacent_speed_mps(lat_in, lon_in, ts_us, unit="degE7", **kw):
    import numpy as np

    if lat_in is None or lon_in is None or ts_us is None:
        return None
    div = 1e7 if str(unit).lower() in ("dege7", "1e7") else 1.0
    lat = np.radians(np.asarray(lat_in, dtype=float) / div)
    lon = np.radians(np.asarray(lon_in, dtype=float) / div)
    if lat.size < 3 or lat.size != lon.size or lat.size != len(ts_us):
        return None
    dt = np.diff(np.asarray(ts_us, dtype=float)) / 1e6
    dlat = np.diff(lat) * 6371000.0
    dlon = np.diff(lon) * 6371000.0 * np.cos(lat[:-1])
    return np.sqrt(dlat ** 2 + dlon ** 2) / np.maximum(dt, 1e-3)


@operator("read", doc="显式取数/透传：把字段原样放进环境（供 coalesce 等后续节点使用）")
def op_read(values, **kw):
    return values


@operator("hypot", in_arity=2, doc="逐样本 sqrt(a^2 + b^2)（如由北/东风分量合成风速）")
def op_hypot(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    return np.sqrt(np.asarray(a, dtype=float) ** 2 + np.asarray(b, dtype=float) ** 2)


# 四元数先**归一化**再转欧拉角：日志里的四元数可能因插值/截断略偏离单位长度，
# 不归一化会放大 atan2 误差。2026-09-17 之前这里有一个同名的第二个定义（不归一化、带
# 一个从未被调用方用过的 degrees 开关）静默覆盖了本实现，两个消费者（plot/attitude.yml
# 的图表换算与 vtol-transition 规则）实际拿到的都是那个不归一化的版本——已删除。
# 教训：OPERATORS[name] = fn 是赋值，**算子名重复注册不报错、后者静默胜出**；
# 用 ruff 的 F811 在提交前拦住（见仓库根 pyproject.toml）。
@operator(
    "quat_to_euler",
    in_arity=4,
    out_arity=3,
    out_names=["roll", "pitch", "yaw"],
    doc="四元数四列（w, x, y, z，先归一化）→ 欧拉角（度）；图上的姿态换算走这个，别在前端写",
)
def op_quat_to_euler(w, x, y, z, **kw):
    import numpy as np

    if w is None or x is None or y is None or z is None:
        return None, None, None
    w, x, y, z = (np.asarray(v, dtype=float) for v in (w, x, y, z))
    # 归一化：日志里的四元数可能因插值/截断略偏离单位长度，不归一化会放大 atan2 误差
    n = np.sqrt(w * w + x * x + y * y + z * z)
    n = np.where(n > 0, n, np.nan)
    w, x, y, z = w / n, x / n, y / n, z / n
    roll = np.degrees(np.arctan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)))
    pitch = np.degrees(np.arcsin(np.clip(2 * (w * y - z * x), -1.0, 1.0)))
    yaw = np.degrees(np.arctan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)))
    return roll, pitch, yaw


@operator("ratio_equal", doc="取值为 value 的样本占比（如无效标志 == 0 的比例）；分母为全部样本")
def op_ratio_equal(values, value=0.0, **kw):
    import numpy as np

    if values is None:
        return None
    a = np.asarray(values, dtype=float)
    if not a.size:
        return None
    return float(np.count_nonzero(a == float(value))) / max(len(a), 1)


@operator(
    "masked_any_in",
    in_arity=3,
    doc="时间轴上的“区间内取值为集合之一”判定：在 intervals（us 区间列表）内是否存在取值"
        "落在 codes 中的样本；codes 由经验文件给出，任意状态字段通用",
)
def op_masked_any_in(values, ts_us, intervals, codes=None, **kw):
    import numpy as np

    if values is None or ts_us is None or not intervals or not codes:
        return None
    vals = np.asarray(values)
    ts = np.asarray(ts_us, dtype=np.int64)
    if vals.size != ts.size:
        return None
    mask = np.zeros(ts.size, dtype=bool)
    for s, e in intervals:
        lo = int(np.searchsorted(ts, int(s)))
        hi = ts.size if e is None else int(np.searchsorted(ts, int(e)))
        mask[lo:hi] = True
    if not np.any(mask):
        return False
    return bool(np.any(np.isin(vals[mask], list(codes))))


@operator("require_true", doc="门控：条件为真返回 True，否则 None（使数据流在此中止，等效于原 if 分支）")
def op_require_true(cond, **kw):
    if cond is None:
        return None
    return True if cond else None


# ─────────────────────────── 事件（一个规则 → 多条 finding）───────────────────────────
# 返回「事件列表」（每项一个 dict）。配合规则级 `foreach:`：框架对每个事件按同一套
# trigger 模板发一条 finding，因此文案仍写在经验文件里，算子只负责找事件。

@operator(
    "rising_edge_events",
    in_arity=4,
    doc="上升沿事件（前一拍 != 1 且当前 == 1）且落在 intervals 内："
        "返回 [{t_s: 相对日志起点秒数}, ...]；t0_us 一般传内置变量 t0_us",
)
def op_rising_edge_events(values, ts_us, intervals, t0_us, **kw):
    import numpy as np

    if values is None or ts_us is None or not intervals:
        return None
    a = np.asarray(values)
    ts = np.asarray(ts_us, dtype=np.int64)
    if a.size != ts.size or a.size < 2:
        return None
    t0 = int(t0_us or 0)
    events = []
    for i in range(1, a.size):
        if int(a[i]) != 1 or int(a[i - 1]) == 1:
            continue
        t = int(ts[i])
        if not any(t >= int(s) and (e is None or t <= int(e)) for s, e in intervals):
            continue
        events.append({"t_s": (t - t0) / 1e6})
    return events


@operator(
    "step_into_events",
    in_arity=4,
    doc="状态切换到 codes 集合内的取值、且落在 intervals 内的事件："
        "返回 [{t_s, code, name}, ...]，codes 形如 {5: AUTO_RTL}（名称由经验文件给出）",
)
def op_step_into_events(values, ts_us, intervals, t0_us, codes=None, **kw):
    import numpy as np

    if values is None or ts_us is None or not intervals or not codes:
        return None
    a = np.asarray(values)
    ts = np.asarray(ts_us, dtype=np.int64)
    if a.size != ts.size or a.size < 2:
        return None
    t0 = int(t0_us or 0)
    wanted = {int(k): str(v) for k, v in dict(codes).items()}
    events = []
    for i in range(1, a.size):
        code = int(a[i])
        if code == int(a[i - 1]) or code not in wanted:
            continue
        t = int(ts[i])
        if not any(t >= int(s) and (e is None or t <= int(e)) for s, e in intervals):
            continue
        events.append({"t_s": (t - t0) / 1e6, "code": code, "name": wanted[code]})
    return events


# ─────────────────────────── 结构化条目列表（日志消息等）───────────────────────────

def _item_hit(it, key, eq, lte, gte, in_list):
    if not isinstance(it, dict):
        return False
    if eq is None and lte is None and gte is None and in_list is None:
        return True                      # 无条件 = 全选（可当计数器用）
    v = it.get(key)
    if v is None:
        return False
    if in_list is not None:
        return v in list(in_list)
    return (eq is not None and v == eq) or (lte is not None and v <= lte) \
        or (gte is not None and v >= gte)


@operator("count_items", doc="条目列表里满足条件的条数：按 key 字段判定，in_list / eq / lte / gte")
def op_count_items(items, key="level", eq=None, lte=None, gte=None, in_list=None, **kw):
    if not items:
        return 0
    return sum(1 for it in items if _item_hit(it, key, eq, lte, gte, in_list))


@operator("take_items", doc="条目列表里满足条件的前 limit 条（drop 可去掉辅助键；clip 可按字段截断文本）")
def op_take_items(items, key="level", eq=None, lte=None, gte=None, in_list=None,
                  limit=5, drop=None, clip=None, **kw):
    out = []
    clips = {str(k): int(v) for k, v in dict(clip or {}).items()}
    for it in (items or []):
        if not _item_hit(it, key, eq, lte, gte, in_list):
            continue
        item = dict(it)
        for k in (drop if isinstance(drop, (list, tuple)) else [drop] if drop else []):
            item.pop(k, None)
        for k, n in clips.items():
            if isinstance(item.get(k), str):
                item[k] = item[k][:n]
        out.append(item)
        if len(out) >= int(limit):
            break
    return out


# ─────────────────────────── 姿态 / 时间轴（通用）───────────────────────────

@operator(
    "interp_to",
    in_arity=3,
    doc="把 src_ts 上的取值线性插值到 dst_ts 时间轴（如姿态指令对齐到姿态时间轴）",
)
def op_interp_to(values, src_ts, dst_ts, **kw):
    import numpy as np

    if values is None or src_ts is None or dst_ts is None:
        return None
    v = np.asarray(values, dtype=float)
    s = np.asarray(src_ts, dtype=np.int64)
    d = np.asarray(dst_ts, dtype=np.int64)
    if v.size < 2 or s.size != v.size or not d.size:
        return None
    return np.interp(d, s[:v.size], v)


@operator(
    "fill_to",
    in_arity=3,
    doc="把 src_ts 上的取值按“向前保持”映射到 dst_ts（如转换段标志采样到姿态时间轴）",
)
def op_fill_to(values, src_ts, dst_ts, **kw):
    import numpy as np

    if values is None or src_ts is None or dst_ts is None:
        return None
    v = np.asarray(values)
    s = np.asarray(src_ts, dtype=np.int64)
    d = np.asarray(dst_ts, dtype=np.int64)
    if not v.size or s.size != v.size or not d.size:
        return None
    idx = np.clip(np.searchsorted(s, d, side="right") - 1, 0, v.size - 1)
    return v[idx]


@operator("abs_values", doc="逐样本绝对值")
def op_abs_values(values, **kw):
    import numpy as np

    if values is None:
        return None
    return np.abs(np.asarray(values, dtype=float))


@operator("larger", in_arity=2, doc="逐样本取较大者（如 max(|roll|, |pitch|)）")
def op_larger(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    return np.maximum(np.asarray(a, dtype=float), np.asarray(b, dtype=float))


@operator("masked_absmax", in_arity=2, doc="掩码为真的样本里 |值| 的最大值；无样本则 None")
def op_masked_absmax(values, mask, **kw):
    import numpy as np

    if values is None or mask is None:
        return None
    v = np.asarray(values, dtype=float)
    m = np.asarray(mask, dtype=bool)
    n = min(v.size, m.size)
    sel = np.abs(v[:n])[m[:n]]
    sel = sel[np.isfinite(sel)]
    return float(sel.max()) if sel.size else None


@operator("count_true", doc="布尔掩码里为真的样本数")
def op_count_true(mask, **kw):
    import numpy as np

    if mask is None:
        return None
    return int(np.count_nonzero(np.asarray(mask, dtype=bool)))


# ─────────────────────────── 掩码 / 多通道（通用）───────────────────────────

@operator("interval_mask", in_arity=2, doc="时间戳落在 intervals 内的布尔掩码（armed 段等）")
def op_interval_mask(ts_us, intervals, **kw):
    import numpy as np

    if ts_us is None or not intervals:
        return None
    ts = np.asarray(ts_us, dtype=np.int64)
    mask = np.zeros(ts.size, dtype=bool)
    for s, e in intervals:
        lo = int(np.searchsorted(ts, int(s)))
        hi = ts.size if e is None else int(np.searchsorted(ts, int(e)))
        mask[lo:hi] = True
    return mask


@operator("values_in", in_arity=2, doc="逐样本判定取值是否落在 codes 集合内，返回布尔掩码")
def op_values_in(values, codes, **kw):
    import numpy as np

    if values is None or not codes:
        return None
    return np.isin(np.asarray(values), list(codes))


@operator("mask_and", in_arity=2, doc="两个布尔掩码逐样本取与")
def op_mask_and(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    x, y = np.asarray(a, dtype=bool), np.asarray(b, dtype=bool)
    n = min(x.size, y.size)
    return x[:n] & y[:n]


@operator("choose", in_arity=3, doc="cond 为真取 a，否则取 b（数据流里的分支合并）")
def op_choose(cond, a, b, **kw):
    return a if cond else b


@operator("count_columns", doc="数组字段的有效列数（跳过 None/空占位列）")
def op_count_columns(matrix, **kw):
    return len(_as_columns(matrix))


@operator(
    "active_column_means",
    in_arity=2,
    doc="掩码内逐通道均值，只保留均值 > min_mean 的通道（未接/未用通道均值≈0，排除）；"
        "返回 [{index, mean}, ...]；列长与掩码不一致时退化为前 N 个样本",
)
def op_active_column_means(matrix, mask, min_mean=0.01, **kw):
    import numpy as np

    if matrix is None or mask is None:
        return None
    m = np.asarray(mask, dtype=bool)
    n_on = int(np.count_nonzero(m))
    out = []
    for i, col in enumerate(matrix if isinstance(matrix, (list, tuple)) else [matrix]):
        if col is None:
            continue
        v = np.asarray(col, dtype=float)
        if v.size == m.size:
            v = v[m]
        else:
            v = v[:n_on]                 # 与原实现一致：长度不匹配时取前 N 个
        v = v[np.isfinite(v)]
        if v.size and float(np.mean(v)) > float(min_mean):
            out.append({"index": i, "mean": float(np.mean(v))})
    return out


@operator(
    "items_spread",
    out_arity=3,
    out_names=["spread", "max_index", "min_index"],
    doc="条目列表按 value_key 求极差，并回传取最大/最小者（并列取先出现者）的 index_key",
)
def op_items_spread(items, value_key="mean", index_key="index", **kw):
    if not items:
        return None
    best = worst = items[0]
    for it in items[1:]:
        if it[value_key] > best[value_key]:
            best = it
        if it[value_key] < worst[value_key]:
            worst = it
    return (float(best[value_key] - worst[value_key]), best.get(index_key), worst.get(index_key))


# ─────────────────────────── 多轴传感器（通用）───────────────────────────

@operator("apply_mask", in_arity=2, doc="按布尔掩码筛选序列（如只保留 armed 段样本），返回新序列")
def op_apply_mask(values, mask, **kw):
    import numpy as np

    if values is None or mask is None:
        return None
    v = np.asarray(values, dtype=float)
    m = np.asarray(mask, dtype=bool)
    if v.size != m.size:
        return None
    return v[m]


@operator("range_of", doc="有限样本的极差 max-min（样本 < 2 个时 None）")
def op_range_of(values, **kw):
    if values is None:
        return None
    a = _finite(values)
    return float(a.max() - a.min()) if a.size > 1 else None


@operator(
    "worst_named",
    in_arity=3,
    out_arity=2,
    out_names=["value", "name"],
    doc="三路序列各做一次归约（reduce: absmax | range | max | min | mean），"
        "回传归约值最大的一路及名称（labels 由经验文件给出）；"
        "样本数 < min_count 或归约值不超过 min_value 的路不参与（严格大于）",
)
def op_worst_named(a, b, c, reduce="absmax", labels=None, min_value=0.0, min_count=10, **kw):
    import numpy as np

    names = list(labels or [])
    best = None
    for i, s in enumerate((a, b, c)):
        if s is None:
            continue
        arr = _finite(s)
        if arr.size < int(min_count):
            continue
        if reduce == "absmax":
            val = float(np.max(np.abs(arr)))
        elif reduce == "range":
            val = float(arr.max() - arr.min())
        else:
            val = float(getattr(np, reduce)(arr))
        if val <= float(min_value):
            continue
        if best is None or val > best[0]:
            best = (val, names[i] if i < len(names) else str(i))
    return best


@operator(
    "label_if",
    doc="cond 为真取 label_true，否则取 label_false（文案以节点选项给出；缺省 None，便于 coalesce 串联）。"
        "注意参数名不用 yes/no：YAML 1.1 会把裸 yes/no 解析成布尔，PyYAML 与浏览器侧 yaml 库行为不一致。",
)
def op_label_if(cond, label_true=None, label_false=None, **kw):
    return label_true if cond else label_false


# ─────────────────────────── 逐样本数组运算（通用）───────────────────────────

@operator("either", in_arity=2, doc="逻辑或（None 视作假）")
def op_either(a, b, **kw):
    return bool(a) or bool(b)


@operator("abs_diff", in_arity=2, doc="逐样本 |a - b|（长度取较短者）")
def op_abs_diff(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    x, y = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    n = min(x.size, y.size)
    return np.abs(x[:n] - y[:n])


@operator("sum_abs", in_arity=2, doc="逐样本 |a| + |b|")
def op_sum_abs(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    x, y = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    n = min(x.size, y.size)
    return np.abs(x[:n]) + np.abs(y[:n])


@operator("greater", in_arity=2, doc="逐样本 a > b，返回布尔掩码")
def op_greater(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    x = np.asarray(a, dtype=float)
    if np.isscalar(b):
        return x > float(b)
    y = np.asarray(b, dtype=float)
    n = min(x.size, y.size)
    return x[:n] > y[:n]


@operator("degrees", doc="弧度序列 → 角度序列")
def op_degrees(values, **kw):
    import numpy as np

    if values is None:
        return None
    return np.degrees(np.asarray(values, dtype=float))


@operator("head", in_arity=2, doc="取序列前 count 个样本（用于按最短长度对齐多条时间序列）")
def op_head(values, count, **kw):
    import numpy as np

    if values is None or count is None:
        return None
    a = np.asarray(values)
    return a[: max(int(count), 0)]


@operator("length_of", doc="序列长度（标量）")
def op_length_of(values, **kw):
    if values is None:
        return None
    try:
        return int(len(values))
    except TypeError:
        return None


@operator("smaller", in_arity=2, doc="两值取较小者")
def op_smaller(a, b, **kw):
    if a is None or b is None:
        return None
    return float(a) if float(a) <= float(b) else float(b)


@operator(
    "zero_cross_hz",
    doc="相对中位数符号翻转频率（Hz）：翻转次数 / 2 / (样本数 / sample_rate)；"
        "样本 < 3 时 None。用于判定“误差高频振荡”",
)
def op_zero_cross_hz(values, sample_rate=50.0, **kw):
    import numpy as np

    if values is None:
        return None
    a = _finite(values)
    if a.size < 3:
        return None
    sign = np.sign(a - np.median(a))
    sign = sign[sign != 0]
    if sign.size < 2:
        return 0.0
    flips = int(np.count_nonzero(np.diff(sign) != 0))
    dur = float(a.size) / float(sample_rate)
    return flips / 2.0 / max(dur, 1e-3)


# ─────────────────────────── 复合算子：整段分析（多入多出）───────────────────────────
# 说明：多个小节点串起来的链条读起来太长（姿态那条曾是 30 个节点）。这类「取数 → 对齐 →
# 掩码 → 统计」的固定套路可以收成一个算子：输入仍是 YAML 里写明的字段引用（算子不认识
# 具体 topic/字段），参数（阈值/最少样本/采样率）也来自 YAML。

@operator(
    "att_tracking_stats",
    in_arity=8,
    out_arity=3,
    out_names=["p99", "osc_hz", "seg_n"],
    doc="姿态跟踪统计：把姿态与姿态指令在时间轴上对齐（取较短长度、指令线性插值到姿态时间轴），"
        "只在 armed 且非悬停（指令倾角 > tilt_min_deg）样本上算跟踪误差，输出 p99（度）、"
        "误差过零频率（Hz）、参与统计的样本数。指令源在 q_d 四元数与 roll/pitch_body 之间自动选择"
        "（fw_minor >= 15 或有四元数而无 body 字段时用四元数）。核心数据缺失返回 None。",
)
def op_att_tracking_stats(att_q, sp_q, sp_roll, sp_pitch, att_ts, sp_ts, intervals,
                          fw_minor=None, tilt_min_deg=10.0, min_samples=50,
                          sample_rate=50.0, **kw):
    import numpy as np

    q = _as_columns(att_q)
    if att_ts is None or len(q) < 4 or sp_ts is None or not intervals:
        return None
    ts = np.asarray(att_ts, dtype=np.int64)
    sp_ts = np.asarray(sp_ts, dtype=np.int64)

    w, x, y, z = (np.asarray(c, dtype=float) for c in q[:4])
    n_q = min(len(w), len(x), len(y), len(z))
    w, x, y, z = w[:n_q], x[:n_q], y[:n_q], z[:n_q]
    roll = np.arctan2(2 * (w * x + y * z), 1 - 2 * (x ** 2 + y ** 2))          # 弧度
    pitch = np.arcsin(np.clip(2 * (w * y - z * x), -1, 1))

    # 指令源：1.15+ 只记四元数；旧固件记 roll/pitch_body（弧度）
    qd = _as_columns(sp_q)
    has_qd = len(qd) >= 4
    use_q = has_qd and (sp_roll is None or fw_minor is None or int(fw_minor) >= 15)
    if not use_q and sp_roll is None and has_qd:
        use_q = True                       # 定制固件容错
    if use_q:
        d0, d1, d2, d3 = (np.asarray(c, dtype=float) for c in qd[:4])
        ns = min(len(d0), len(d1), len(d2), len(d3))
        d0, d1, d2, d3 = d0[:ns], d1[:ns], d2[:ns], d3[:ns]
        r_sp_raw = np.arctan2(2 * (d0 * d1 + d2 * d3), 1 - 2 * (d1 ** 2 + d2 ** 2))
        p_sp_raw = np.arcsin(np.clip(2 * (d0 * d2 - d3 * d1), -1, 1))
    else:
        if sp_roll is None:
            return None
        r_sp_raw = np.asarray(sp_roll, dtype=float)
        p_sp_raw = (np.asarray(sp_pitch, dtype=float) if sp_pitch is not None
                    else np.zeros(len(r_sp_raw)))

    n = min(n_q, len(r_sp_raw), len(p_sp_raw))
    if n < 1:
        return None
    ts_n = ts[:n]
    r_sp = np.interp(ts_n, sp_ts[:len(r_sp_raw)], r_sp_raw)
    p_sp = np.interp(ts_n, sp_ts[:len(p_sp_raw)], p_sp_raw)
    err = np.degrees(np.maximum(np.abs(roll[:n] - r_sp), np.abs(pitch[:n] - p_sp)))

    amask = np.zeros(n, dtype=bool)
    for s, e in intervals:
        lo = int(np.searchsorted(ts_n, int(s)))
        hi = n if e is None else int(np.searchsorted(ts_n, int(e)))
        amask[lo:hi] = True
    active = amask & (np.degrees(np.abs(r_sp)) + np.degrees(np.abs(p_sp)) > float(tilt_min_deg))
    seg = err[active] if int(np.count_nonzero(active)) > int(min_samples) else err[amask]
    if seg.size <= int(min_samples):
        return (None, None, int(seg.size))      # 样本不足：不出结论，但把样本数带出去

    p99 = float(np.percentile(seg, 99))
    sign = np.sign(seg - np.median(seg))
    sign = sign[sign != 0]
    flips = int(np.count_nonzero(np.diff(sign) != 0)) if sign.size >= 2 else 0
    osc = flips / 2.0 / max(float(seg.size) / float(sample_rate), 1e-3)
    return (p99, float(osc), int(seg.size))


@operator(
    "gyro_bias_series",
    in_arity=7,
    out_arity=5,
    out_names=["bx", "by", "bz", "bts", "src_text"],
    doc="零偏取源（三取一）：① 直读零偏列（fw_minor >= 15 时优先）② 状态槽 A ③ 状态槽 A 缺失"
        "时用状态槽 B。输入都是「数组字段的多列」或 None。"
        "返回 三轴序列 + 时间戳 + 数据来源说明（用于 evidence.field）；主数据缺失返回 None。"
        "来源说明是**展示文案**，由调用方用 sources=[直读, 槽A, 槽B] 给出——算子不认识字段名。",
)
def op_gyro_bias_series(new_cols, new_ts, states_a_cols, states_a_ts,
                        states_b_cols, states_b_ts, fw_minor, slot=10,
                        sources=None, **kw):
    nb = _as_columns(new_cols)
    la = _as_columns(states_a_cols)
    lb = _as_columns(states_b_cols)
    s = int(slot)
    # 三个来源的展示名（经验文件给；没给就用中性说法，反正算子不认识具体字段）
    names = list(sources or []) + ["零偏直读列", "状态槽（优先）", "状态槽（兜底）"]

    def pick3(cols):
        return [cols[s], cols[s + 1], cols[s + 2]] if len(cols) >= s + 3 else None

    leg_a, leg_b = pick3(la), pick3(lb)
    use_new = len(nb) >= 3 and new_ts is not None and (fw_minor is None or int(fw_minor) >= 15)
    if not use_new and leg_a is None and leg_b is None and len(nb) >= 3:
        use_new = True                       # 定制固件容错：没有旧槽就用直读
    if use_new:
        return (nb[0], nb[1], nb[2], new_ts, names[0])
    if leg_a is not None and states_a_ts is not None:
        return (leg_a[0], leg_a[1], leg_a[2], states_a_ts, names[1])
    if leg_b is not None and states_b_ts is not None:
        return (leg_b[0], leg_b[1], leg_b[2], states_b_ts, names[2])
    return None


@operator(
    "gyro_bias_worst",
    in_arity=5,
    out_arity=4,
    out_names=["abs_max", "abs_axis", "drift", "drift_axis"],
    doc="三轴零偏在 armed 区间内逐轴取 |最大值| 与极差（漂移），回传各自最差的轴名。"
        "样本 < min_count 的轴不参与；|零偏| 严格 > 0 才算有效；轴名由经验文件给出。",
)
def op_gyro_bias_worst(bx, by, bz, bts, intervals, labels=None, min_count=10, **kw):
    import numpy as np

    names = list(labels or ["X", "Y", "Z"])
    if bts is None or not intervals:
        return None
    ts = np.asarray(bts, dtype=np.int64)
    mask = np.zeros(ts.size, dtype=bool)
    for s, e in intervals:
        lo = int(np.searchsorted(ts, int(s)))
        hi = ts.size if e is None else int(np.searchsorted(ts, int(e)))
        mask[lo:hi] = True

    worst_abs, worst_axis, worst_drift, drift_axis = 0.0, None, 0.0, None
    for i, series in enumerate((bx, by, bz)):
        if series is None:
            continue
        v = np.asarray(series, dtype=float)
        if v.size == ts.size:
            v = v[mask]
        v = v[np.isfinite(v)]
        if v.size < int(min_count):
            continue
        a_max = float(np.max(np.abs(v)))
        rng = float(v.max() - v.min())
        if a_max > worst_abs:
            worst_abs, worst_axis = a_max, names[i] if i < len(names) else str(i)
        if rng > worst_drift:
            worst_drift, drift_axis = rng, names[i] if i < len(names) else str(i)
    return (worst_abs if worst_axis else None, worst_axis, worst_drift, drift_axis)


@operator(
    "max_temp_range",
    in_arity=2,
    doc="两个温度来源各自取极差（样本 < 2 的来源忽略），返回较大者；都不可用则 None",
)
def op_max_temp_range(t_a, t_b, **kw):
    best = None
    for t in (t_a, t_b):
        if t is None:
            continue
        a = _finite(t)
        if a.size > 1:
            rng = float(a.max() - a.min())
            best = rng if best is None else max(best, rng)
    return best


@operator(
    "active_window_mask",
    in_arity=4,
    doc="活动窗口掩码：armed 区间 ∩ 状态取值落在 codes 内的样本；若交集样本 <= min_active，"
        "退回整个 armed 区间（原实现“悬停样本太少就退用 armed 段”）。任意状态字段通用。",
)
def op_active_window_mask(ts_us, intervals, values, values_ts, codes=None, min_active=20, **kw):
    import numpy as np

    if ts_us is None or not intervals:
        return None
    ts = np.asarray(ts_us, dtype=np.int64)
    mask = np.zeros(ts.size, dtype=bool)
    for s, e in intervals:
        lo = int(np.searchsorted(ts, int(s)))
        hi = ts.size if e is None else int(np.searchsorted(ts, int(e)))
        mask[lo:hi] = True
    if values is None or values_ts is None or not codes:
        return mask
    vs = np.asarray(values)
    vts = np.asarray(values_ts, dtype=np.int64)
    if not vs.size or not vts.size:
        return mask
    idx = np.clip(np.searchsorted(vts, ts), 0, vs.size - 1)
    narrow = mask & np.isin(vs[idx], list(codes))
    return narrow if int(np.count_nonzero(narrow)) > int(min_active) else mask


@operator(
    "column_spread_stats",
    in_arity=2,
    out_arity=4,
    out_names=["spread", "busiest", "idlest", "n_active"],
    doc="多通道均值极差：掩码内逐通道求均值，只保留均值 > min_mean 的通道（排除未接/未用），"
        "活跃通道数不足 min_channels 时返回 None；回传 极差 / 最大通道号 / 最小通道号 / 活跃数。",
)
def op_column_spread_stats(matrix, mask, min_mean=0.01, min_channels=4, **kw):
    means = op_active_column_means(matrix, mask, min_mean=min_mean)
    if means is None or len(means) < int(min_channels):
        return None
    best = worst = means[0]
    for it in means[1:]:
        if it["mean"] > best["mean"]:
            best = it
        if it["mean"] < worst["mean"]:
            worst = it
    return (float(best["mean"] - worst["mean"]), best["index"], worst["index"], len(means))


@operator(
    "cell_voltage_min",
    in_arity=4,
    out_arity=6,
    out_names=["vmin", "cell_min", "cells", "have_measured", "have_fallback", "no_cell"],
    doc="单电芯最低电压：优先 voltage_cell_v[] 实测（各列 > 0 的最小值中的最小值），"
        "缺失时回退 总压最小值 / 电芯数（两者都 > 0 才成立）；两者都没有但有总压 → no_cell 为真。"
        "cells 只在回退路径给出（与迁移前一致）。",
)
def op_cell_voltage_min(cell_cols, volt_v, volt_filtered, cell_count, **kw):
    import numpy as np

    volt = volt_v if volt_v is not None else volt_filtered
    vmin = None
    if volt is not None:
        a = _finite(volt)
        vmin = float(a.min()) if a.size else None

    measured = None
    for col in _as_columns(cell_cols):
        pos = col[col > 0]
        if pos.size:
            m = float(pos.min())
            measured = m if measured is None else min(measured, m)

    cells = None
    fallback = None
    if measured is None and cell_count is not None and len(cell_count):
        c = int(np.max(np.asarray(cell_count)))
        if c > 0 and vmin is not None and vmin > 0:
            fallback = vmin / c
            cells = c

    have_measured = measured is not None
    have_fallback = fallback is not None
    cell_min = measured if have_measured else fallback
    no_cell = (not have_measured and not have_fallback and vmin is not None)
    return (vmin, cell_min, cells, have_measured, have_fallback, no_cell)
