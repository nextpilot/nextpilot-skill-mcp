// ⚠️ 自动生成，请勿手改。源文件在 engine/ 与 knowledge/px4/，改完跑 `pnpm build:kb`（dev/build 自动执行）。
export const PY_ULG_DATA_HELPERS = String.raw`
# ============================================================================
# 报告页数据层 —— 与日志格式无关
#
# 只做三件事：按需抽时序（+ LTTB 降采样）、交给前端、把格式专有的整块内容转出去。
# 取数一律走 provider（契约见 providers/api.py）——本文件不碰 pyulog，
# 也不出现任何 topic 名 / 字段名（那些在 providers/<格式>.py 与 facts.yaml 里）。
#
# 与 providers 的关系：本文件与 ulog-check-script.ts 跑在**同一个 __main__ globals** 里
# （ulog-worker.ts 把两段拼起来执行），所以直接用那边建好的 \`provider\`。
# ============================================================================

import json
import numpy as np


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
        ts = min(ts, n - 1); te = min(te, n)
        if te <= ts:
            te = ts + 1
        # 下一桶均值点
        nx = np.mean(np.arange(ts, te))
        ny = float(np.mean(r[ts:te])) if te > ts else float(r[ts])
        best, best_d = ts, -1.0
        for j in range(ts, te):
            area = abs((a - nx) * (float(r[j]) - float(r[a])) -
                       (a - j) * (ny - float(r[a])))
            if area > best_d:
                best, best_d = j, area
        idx.append(best)
        a = best
    idx.append(n - 1)
    return idx


# ============ np_report：判定产物（跑规则 + 组装报告头）============
def np_report():
    """跑完全部规则，把判定产物摆到 \`__result\`（= 前端那份 report）。

    为什么这个入口在这里、而不是在 rule_engine 里：本文件是**对前端的门面**（见文件头
    "交给前端"）。跑规则仍是 rule_engine 的活（\`run_all()\`），这里只负责把结果交出去，
    与 np_manifest / np_series / np_track / np_log_info 同一形状——
    前端面对的 Python 面因此是 5 个对称的具名入口，没有"谁先读 __result"的隐含顺序。
    """
    global __result
    __result = json.dumps(run_all(), ensure_ascii=False)


# ============ np_manifest：话题清单（驱动前端预设可用性）============
def np_manifest():
    global __result
    items = provider.messages()
    __result = json.dumps({"topics": items}, ensure_ascii=False)


# ============ np_series：按需抽取 + LTTB 降采样 ============
def np_series(topic, instance, fields_json, max_points=3000, op_json=None):
    """按需抽取时序并 LTTB 降采样。

    op_json：图上要做换算时的**预处理算子**（如 {"name": "quat_to_euler"}），
    与经验用的同一套算子；给了 op 就只返回算子的输出（键为算子的 out_names），
    换算在引擎侧做，前端只画。
    """
    global __result
    fields = json.loads(fields_json)
    op = json.loads(op_json) if op_json else None
    cols = provider.columns(topic, int(instance))
    if cols is None:
        __result = json.dumps({"error": "topic not found: %s#%d" % (topic, instance)})
        return
    ts = np.asarray(cols["timestamp"], dtype=np.int64)
    n = len(ts)
    ref = None
    for f in fields:
        if f in cols:
            ref = cols[f]
            break
    idx = _lttb_indices(n, int(max_points), ref)

    if op:
        name = op.get("name")
        if name not in OPERATORS:
            __result = json.dumps({"error": "未注册的预处理算子：%s" % name})
            return
        args = [np.asarray(cols[f], dtype=float) if f in cols else None for f in fields]
        if any(a is None for a in args):
            __result = json.dumps({"error": "预处理算子 %s 的输入字段缺失" % name})
            return
        opts = {k: v for k, v in op.items() if k not in ("name", "labels")}
        res = OPERATORS[name](*args, **opts)
        if res is None:
            __result = json.dumps({"error": "预处理算子 %s 无结果（数据不足）" % name})
            return
        outs = list(res) if isinstance(res, tuple) else [res]
        names = SIGNATURES.get(name, {}).get("out_names") or [
            "out%d" % i for i in range(len(outs))
        ]
        out = {
            "topic": topic,
            "instance": int(instance),
            "t": [_since_boot(ts[i], 3) for i in idx],
            "series": {
                names[i]: [_clean(np.asarray(o, dtype=float)[j]) for j in idx]
                for i, o in enumerate(outs)
            },
            "fullCount": n,
            "op": name,
        }
        __result = json.dumps(out, ensure_ascii=False)
        return

    out = {
        "topic": topic, "instance": int(instance),
        "t": [_since_boot(ts[i], 3) for i in idx],
        "series": {},
        "fullCount": n,
    }
    for f in fields:
        if f in cols:
            vv = np.asarray(cols[f], dtype=float)
            out["series"][f] = [_clean(vv[i]) for i in idx]
        else:
            out["series"][f] = None
    __result = json.dumps(out, ensure_ascii=False)


# ============ np_track：GPS 轨迹 ============
# 取哪些字段、怎么按固件版本挑候选、量纲怎么换算——全是格式专有知识，
# 由 provider 提供（见 providers/api.py 的可选能力表）。
def np_track(max_points=None):
    global __result
    data = provider.track(max_points)
    __result = json.dumps(data, ensure_ascii=False)


# ============ np_log_info：系统信息 / 事件 / 丢包 / 参数 / 阶段 ============
# 这一块全是"某种日志的消息形态"的展示（'I' 信息字典、事件与文本消息合并、
# 'M' 多值信息怎么拼、'Q' 默认值怎么推、逐字节的消息类型统计），换格式就是另一套，
# 所以整块由 provider 的 log_info() 提供（可选能力）。
def np_log_info():
    global __result
    __result = json.dumps(provider.log_info(), ensure_ascii=False)
`;
