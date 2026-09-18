// ⚠️ 自动生成，请勿手改。源文件在 engine/ 与 knowledge/px4/，改完跑 `pnpm build:kb`（dev/build 自动执行）。
export const PY_ULG_DATA_HELPERS = String.raw`# ============================================================================
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
    items = provider.get_topic_meta()
    __result = json.dumps({"topics": items}, ensure_ascii=False)


# ============ np_series：按需抽取 + LTTB 降采样 ============
def np_series(request_json, max_points=3000):
    """按需抽取时序并降采样。**要哪几条线由构建期编译好的预设声明决定**（本函数只执行）。

    request（前端从预设拼出来，JSON）：

      instance  面板要第几个实例——声明里写 \`[:]\` 的引用按它取（"每实例一个面板"用）
      ydata     每条线一项：\`{"kind":"field","fields":[…],"unit":…}\`（字段引用，含候选组与单位）
                            \`{"kind":"var","name":…}\`（预设 compute 节点的输出）
      xdata     可选：\`mode: xyplot\` 的横轴。不给就用**命中字段那个 topic 的 timestamp**
      compute   可选：预设的换算节点（与规则 compute 同一套表达式与算子），在取 ydata **之前**求值

    返回 \`{t, x, series:[…], fullCount}\`：\`series\` 与 ydata **同序等长**（取不到的那条是
    \`null\`），前端按预设里的 label/color 逐项对齐即可；\`x\` 为 null 表示横轴就是 \`t\`。
    一条都取不到、或拿到的是一组实例（\`[:]\` 没配 \`per_instance\`），给 \`{"error": …}\`。

    换算（四元数→欧拉角、单位、多字段合成）都在这里做，前端只画——"前端不写数学"。
    """
    global __result
    req = json.loads(request_json)
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
        },
        ensure_ascii=False,
    )


def _panel_series(spec, env, inst):
    """一条线 → (序列, 命中的 bare 字段名)。

    · \`{"kind":"var"}\` 取换算节点的输出（标量由调用方铺成常量线）
    · \`{"kind":"field"}\` 走 \`_pick_ref\`（候选组 + 单位换算 + 实例覆盖）

    分组结果（\`[:]\` 且容器没写 \`per_instance\`）是**用错了**：报错，别把一组数据画成一条线。
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
            "%s 取到的是所有实例（[:]），图上画不了——要么给容器加 per_instance: true、要么在引用里指定第几个实例" % bare
        )
    return series, bare


def _first_ref_bare(stmts):
    """换算节点里第一个"topic 在日志里存在"的字段引用（只用来定时间戳的 topic，不求值）。

    两种写法都要认：\`ref("topic.field")\`，以及**裸写的** \`topic.field\`——后者在
    \`_compile_compute\` 里才会被改写成 ref（见 rule_engine 的 \`_ComputeRefs\`），这里看的是
    原文，所以得自己认一遍（踩过：\`quat_to_euler(vehicle_attitude.q)\` 因为只认 ref，
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


# ============ np_log_info：系统信息 / 事件 / 丢包 / 参数 / 阶段 ============
# 这一块全是"某种日志的消息形态"的展示（'I' 信息字典、事件与文本消息合并、
# 'M' 多值信息怎么拼、'Q' 默认值怎么推、逐字节的消息类型统计），换格式就是另一套，
# 所以整块由 provider 的 report_materials() 提供（可选能力）。
def np_log_info():
    global __result
    __result = json.dumps(provider.report_materials(), ensure_ascii=False)
`;
