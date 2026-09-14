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
    a = _finite(values)
    return float(a.max()) if a.size else None


@operator("min", doc="最小值（忽略 NaN）")
def op_min(values, **kw):
    a = _finite(values)
    return float(a.min()) if a.size else None


@operator("min_ge", doc="有限且 >= ge 的最小值（排除无效值，如 remaining=-1 表示未知）")
def op_min_ge(values, ge=None, **kw):
    a = _finite(values)
    if ge is not None:
        a = a[a >= float(ge)]
    return float(a.min()) if a.size else None


@operator("scale", in_arity=1, out_arity=1, doc="标量乘以系数（如比例 → 百分比）")
def op_scale(x, factor=1.0, **kw):
    return float(x) * float(factor) if x is not None else None


@operator("mean", doc="均值（忽略 NaN）")
def op_mean(values, **kw):
    a = _finite(values)
    return float(a.mean()) if a.size else None
