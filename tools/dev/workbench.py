"""单条规则体检：在一份真实日志上跑一条规则，给出结论 + 一张图 + 说清「缺什么」的报错。

用法：
  python tools/dev/workbench.py                          # 不给参数 = 打开网页选日志和规则
  python tools/dev/workbench.py <log.ulg> <rule_id|规则文件名>
  python tools/dev/workbench.py .cache/px4/logs/sample.ulg px4-vibration --open

网页模式：**一个都不给**时起一个只听 127.0.0.1 的临时服务并打开浏览器（`--port` 指定端口，
`--no-browser` 不自动弹窗，Ctrl+C 结束）。为什么用下拉框而不是 `<input type=file>`：
浏览器出于安全**不会把选中文件的真实路径给页面**（只给文件名），而本脚本要的是磁盘路径。
要用仓库外的日志，填页面上那个绝对路径框。

为什么另起一份、而不是扩 `check_rules_compute.py`：那边是**表达式级**调试（把 compute 拆成子表达式
逐个求值，回答「这一层为什么算不出来」），输出是纯文本；这边回答的是另一组问题——
「这条规则在这份日志上到底触发了吗」「触发的时候数据长什么样」「缺的是哪个 topic / 哪个
字段」。两边共用 `probe_rule.probe_expr`（见下面 import），不重复实现同一件事。

图从哪来：**优先复用浏览器那张图**。`knowledge/px4/plot/*.yml` 编译进
`web/lib/knowledge/plots.generated.ts`（`PLOT_PRESETS`），里面已经写好了画哪几条线、
阈值线画在哪。本脚本按 `rule.group` 找同名预设，找不到就按 topics 交集退而求其次，
再找不到就用规则 `compute` 里的 `ref(...)` 自己拼一张；取数走引擎的 `np_series()`——
**与浏览器同一条取数路径**，所以图上看到的点和线上报告里的是同一批。

为什么图是手写 SVG：本机没有 matplotlib / PIL，为一个画图库去动 anaconda 基础环境不值
（见用户级记忆：装工具包一律走 venv）。HTML + 内联 SVG 零第三方依赖、浏览器直接打开，
还能把「规则算出什么值 vs 阈值」和曲线放在同一屏里——判读一条规则时真正要看的就是这个。

网页模式是**三个工具**，首页各一个入口：

  ① `/ulog` —— 看日志：列出一份 .ulg 里有哪些 topic（含实例数与采样数），点开一个 topic
     看它有哪些字段，勾上字段就看取值摘要（最小/最大/均值/首尾）与曲线。
  ② `/rule` —— 日志 + 规则：左栏选一份 `knowledge/px4/rules/*.yaml` 并改，右栏出这个文件
     里装的规则在这份日志上的执行效果。
  ③ `/plot` —— 日志 + 图：左栏选一份 `knowledge/px4/plot/*.yml` 并改，右栏出这张图画出来
     什么样。

②③ 的共同约定：改 YAML → 保存 → 写回源文件 → 跑一次全量构建 → 出效果。
为什么按**文件**编、而不是按规则 id 拆开编：按 id 编辑要「解析 → 改一条 → 反序化回
YAML」，那会冲掉注释与 `>-` 折叠写法；而一个文件本来就可以装多条规则（`failsafe.yaml`
有 6 条），所以保存后是**把这个文件里的规则全跑一遍**，改一条顺手改崩隔壁能立刻看见。
编译不过时右栏给出精确到「第几项 / 第几列」的报错，并**自动还原源文件**（备份在
`.cache/px4/kb-backup/`）——`knowledge/` 里不会留下一个让 `pnpm build:kb` 红掉的文件。

保存是**局部刷新**：前端只把右栏那一段换掉，编辑框的滚动位置与光标不动——左右分栏的意义
就是边改边看，每次保存都把编辑框弹回顶部就白做了。服务端按请求头 `X-Partial` 决定回 JSON
（只有右栏那段）还是整页，没有 JS 的浏览器走整页也能用。

⚠️ 规则读的是**构建产物**：`compute` 由构建期的编译器（`web/scripts/lib/rule-expr.mjs`）
编译成表达式，Python 侧不重复实现。所以改完 `knowledge/px4/rules/*.yaml` 必须先
`cd web && pnpm build:kb`，本脚本才会看到新规则；产物比源旧时它会直接报错并退出 2。

退出码（以后要接 CI，别改成「只打印不计数」）：
  0 = 规则跑通了（触发与不触发都算跑通）
  2 = 用错了 / 规则不存在 / 构建产物比 rules/*.yaml 旧
  3 = 跑不通：缺 topic、缺字段、compute 抛异常、取数失败
"""

from __future__ import annotations

import ast
import contextlib
import difflib
import io
import json
import logging
import math
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

import yaml

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

sys.path.insert(0, str(Path(__file__).resolve().parent))
from probe_rule import describe, probe_expr, targets_of  # noqa: E402
from px4log_engine_runner import _load_rules, build_namespace, call  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
RULES_DIR = REPO_ROOT / "knowledge" / "px4" / "rules"
PLOTS_TS = REPO_ROOT / "web" / "lib" / "knowledge" / "plots.generated.ts"
REPORT_DIR = REPO_ROOT / ".cache" / "px4" / "rule-reports"
LOG_DIR = REPO_ROOT / ".cache" / "px4" / "logs"
ARTIFACT_TS = REPO_ROOT / "web" / "workers" / "pyodide-px4log-engine.ts"
PLOT_DIR = REPO_ROOT / "knowledge" / "px4" / "plot"
# 编辑时**保存前**的原文落在这里：编译不过要能还原，不能把坏文件留在 knowledge/ 里。
# rules 与 plot 共用一个备份目录：分开的话「改坏了要去哪个目录找」就多了一个要记的地方。
KB_BACKUP_DIR = REPO_ROOT / ".cache" / "px4" / "kb-backup"
NODE_BIN = shutil.which("node") or "node"

# 线的配色：与数据条数无关的固定循环，保证同一条线在不同日志里颜色一致
LINE_COLORS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"]
LEVEL_COLORS = {"critical": "#dc2626", "warning": "#d97706", "info": "#64748b", "ok": "#059669"}
MAX_POINTS = 3000
# 一张图最多画这么多点：引擎已降采样到 3000，再抽稀一遍是为了不让 HTML 长到打不开
SVG_MAX_POINTS = 1500

HTML = "text/html; charset=utf-8"
JSON = "application/json; charset=utf-8"

ANSI_RE = re.compile(r"\033\[[0-9;]*m")
# 终端是 tty 时 logger 会往每行塞颜色控制符；那段文本要原样放进 HTML，得先剥掉
REF_RE = re.compile(r'ref\(\s*"([^"]+)"')
# `vehicle_imu_status[:].accel_vibration_metric` / `...[0].field` → (topic, field)
FIELD_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\])?\s*\.\s*([A-Za-z0-9_]+)\s*$")
# 区间引用：`topic[:].field` / `topic[a:b].field`（`[0]` 是单实例，不算）。
# 线上会把它们按实例展开成多条，这个预览不展开（见 spread_notes）——识别出来才能提醒。
RANGE_REF_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*(-?\d*)\s*:\s*(-?\d*)\s*\]\s*\.\s*(.+?)\s*$")


# --------------------------------------------------------------------------- 取声明


def load_presets() -> list[dict]:
    """读浏览器侧的绘图预设（`PLOT_PRESETS`）。

    用 `raw_decode` 而不是切到文件尾：这个文件在数组后面还挂着 ` as const;`，硬切尾巴会把
    它一起吞进来（第一版就是这么写的，json.loads 直接报错）。
    """
    if not PLOTS_TS.exists():
        return []
    src = PLOTS_TS.read_text(encoding="utf-8")
    i = src.find("PLOT_PRESETS = ")
    if i < 0:
        return []
    try:
        presets, _ = json.JSONDecoder().raw_decode(src[i + len("PLOT_PRESETS = ") :])
    except ValueError:
        return []
    return presets if isinstance(presets, list) else []


def flat_topics(topics) -> list[str]:
    """把 `[[a, b], [c]]` 这种「候选组」摊平成 [a, b, c]（组内是或、组间是且）。"""
    out: list[str] = []
    for group in topics or []:
        if isinstance(group, list):
            out.extend(str(t) for t in group)
        elif group:
            out.append(str(group))
    return out


def pick_preset(rule: dict, presets: list[dict]) -> tuple[dict | None, str]:
    """挑一张能说明这条规则的图。返回 (预设, 为什么挑它)。"""
    group = rule.get("group") or ""
    for preset in presets:
        if preset.get("id") == group:
            return preset, "与规则的 group 同名（浏览器里就是这张图）"
    wanted = set(flat_topics(rule.get("topics")))
    best, best_hit = None, 0
    for preset in presets:
        hit = len(wanted & set(flat_topics((preset.get("conditions") or {}).get("topics"))))
        if hit > best_hit:
            best, best_hit = preset, hit
    if best is not None:
        return best, "没有同名预设，按 topics 交集挑的（命中 %d 个 topic）" % best_hit
    return None, ""


def fallback_axes(rule: dict) -> dict:
    """没有可用预设时的兜底图：把规则 compute 里引用到的字段画出来，阈值当水平线。

    阈值线取自 triggers——这正是判读时要比的东西：曲线在阈值线上方多少。
    """
    fields = []
    for expr in rule.get("compute") or []:
        for raw in REF_RE.findall(expr):
            m = FIELD_RE.match(raw)
            if m and "]" not in raw.split(".")[0][-1:]:
                fields.append("%s[0].%s" % (m.group(1), m.group(2)))
    hlines = [
        {"value": t["threshold"], "level": t.get("severity", "info"), "label": str(t["threshold"])}
        for t in (rule.get("triggers") or [])
        if t.get("threshold") is not None
    ]
    return {
        "container": "axes",
        "title": "%s（规则引用的字段，兜底图）" % (rule.get("name") or rule.get("id")),
        "ylabel": (rule.get("triggers") or [{}])[0].get("unit") or "",
        "xlabel": "秒（相对日志开始）",
        "hlines": hlines or None,
        "children": [
            {
                "mode": "TimeSeries",
                "xdata": None,
                "ydata": [{"kind": "field", "fields": [f]} for f in fields],
                "labels": fields,
            }
        ]
        if fields
        else [],
    }


# --------------------------------------------------------------------------- 前置检查


def manifest_fields(ns: dict) -> dict[str, set[str]]:
    """日志里每个 topic 有哪些字段（用来判断「规则要的东西日志里有没有」）。"""
    manifest = call(ns, "np_manifest()")
    out: dict[str, set[str]] = {}
    for t in manifest.get("topics") or []:
        name = str(t.get("topic"))
        out.setdefault(name, set()).update(str(f.get("name")) for f in (t.get("fields") or []))
    return out


def check_prereq(rule: dict, have: dict[str, set[str]]) -> list[str]:
    """规则声明要的东西 vs 日志里实际有的东西。返回**人话**的报错（说清缺什么）。"""
    problems: list[str] = []
    for group in rule.get("topics") or []:
        names = [str(t) for t in group] if isinstance(group, list) else [str(group)]
        if not names:
            continue
        if any(n in have for n in names):
            continue
        near = difflib.get_close_matches(names[0], sorted(have), n=3, cutoff=0.5)
        problems.append(
            "日志里没有这个 topic（这条规则要 %s 里的任意一个）：%s%s"
            % ("/".join(names), names[0], "；相近的 topic：%s" % "、".join(near) if near else "（连相近的都没有）")
        )
    for expr in rule.get("compute") or []:
        for raw in REF_RE.findall(expr):
            m = FIELD_RE.match(raw)
            if not m:
                continue
            topic, field = m.group(1), m.group(2)
            if topic not in have:
                continue  # topic 缺失已在上面报过，不重复
            # 四元数这类字段在日志里是展开的（`q_d[0]`..`q_d[3]`），而规则里写 `q_d`——
            # 不认这个就会把好规则报成"字段取不到"（第一版在 attitude-overshoot 上误报过）。
            present = field in have[topic] or any(f.startswith(field + "[") for f in have[topic])
            if not present:
                near = difflib.get_close_matches(field, sorted(have[topic]), n=3, cutoff=0.5)
                problems.append(
                    "字段取不到：%s.%s —— 这份日志里 %s 只有 %d 个字段%s"
                    % (
                        topic,
                        field,
                        topic,
                        len(have[topic]),
                        "（相近的：%s）" % "、".join(near) if near else "（没有相近的字段名）",
                    )
                )
    return problems


# --------------------------------------------------------------------------- 画 SVG


def _finite(vals):
    for v in vals or []:
        if v is None:
            continue
        try:
            f = float(v)
        except (TypeError, ValueError):
            continue
        if math.isfinite(f):
            yield f


def _fmt(v: float) -> str:
    if abs(v) >= 1000 or (abs(v) < 0.01 and v != 0):
        return "%.2g" % v
    return "%.3g" % v


def svg_chart(axes: dict, panels: list[dict], stat_lines: list[tuple[str, float]]) -> str:
    """把一个 axes 画成一张 SVG。`panels` 是它下面每条线的取数结果。"""
    W, H = 940, 300
    pad_l, pad_r, pad_t, pad_b = 62, 130, 26, 44
    plot_w, plot_h = W - pad_l - pad_r, H - pad_t - pad_b

    xs_all, ys_all = [], []
    for p in panels:
        xs_all.extend(_finite(p["xs"]))
        for line in p["lines"]:
            ys_all.extend(_finite(line["ys"]))
    hlines = axes.get("hlines") or []
    for h in hlines:
        ys_all.extend(_finite([h.get("value")]))
    if not ys_all:
        return '<p class="empty">这张图一条数据都没取到。</p>'

    y_min, y_max = min(ys_all), max(ys_all)
    for _, v in stat_lines:
        # 规则算出的值也纳入值域：它就是用来跟阈值比的，画不进去等于白算
        y_min, y_max = min(y_min, v), max(y_max, v)
    if y_max - y_min < 1e-9:
        y_min, y_max = y_min - 1.0, y_max + 1.0
    span = y_max - y_min
    y_min, y_max = y_min - span * 0.06, y_max + span * 0.06
    x_min, x_max = (min(xs_all), max(xs_all)) if xs_all else (0.0, 1.0)
    if x_max - x_min < 1e-9:
        x_min, x_max = x_min - 1.0, x_max + 1.0

    def sx(v):
        return pad_l + (float(v) - x_min) / (x_max - x_min) * plot_w

    def sy(v):
        return pad_t + plot_h - (float(v) - y_min) / (y_max - y_min) * plot_h

    out = [
        '<svg viewBox="0 0 %d %d" width="100%%" role="img" xmlns="http://www.w3.org/2000/svg">' % (W, H),
        '<rect x="0" y="0" width="%d" height="%d" fill="#ffffff"/>' % (W, H),
    ]
    # 网格与 y 轴刻度
    for i in range(5):
        v = y_min + (y_max - y_min) * i / 4
        y = sy(v)
        out.append(
            '<line x1="%d" y1="%.1f" x2="%d" y2="%.1f" stroke="#e2e8f0" stroke-width="1"/>' % (pad_l, y, pad_l + plot_w, y)
        )
        out.append(
            '<text x="%d" y="%.1f" font-size="11" fill="#64748b" text-anchor="end">%s</text>' % (pad_l - 6, y + 4, _fmt(v))
        )
    for i in range(5):
        v = x_min + (x_max - x_min) * i / 4
        x = sx(v)
        out.append(
            '<line x1="%.1f" y1="%d" x2="%.1f" y2="%d" stroke="#f1f5f9" stroke-width="1"/>' % (x, pad_t, x, pad_t + plot_h)
        )
        out.append(
            '<text x="%.1f" y="%d" font-size="11" fill="#64748b" text-anchor="middle">%s</text>'
            % (x, pad_t + plot_h + 18, _fmt(v))
        )
    out.append(
        '<text x="%d" y="%d" font-size="11" fill="#94a3b8" text-anchor="middle">%s</text>'
        % (pad_l + plot_w // 2, H - 6, _esc(axes.get("xlabel") or "时间"))
    )
    if axes.get("ylabel"):
        out.append('<text x="14" y="%d" font-size="11" fill="#94a3b8">%s</text>' % (pad_t + 6, _esc(axes["ylabel"])))

    # 阈值线
    for h in hlines:
        v = h.get("value")
        if v is None or not math.isfinite(float(v)):
            continue
        y = sy(float(v))
        color = LEVEL_COLORS.get(h.get("level") or "info", "#64748b")
        out.append(
            '<line x1="%d" y1="%.1f" x2="%d" y2="%.1f" stroke="%s" stroke-width="1.4" stroke-dasharray="6 4"/>'
            % (pad_l, y, pad_l + plot_w, y, color)
        )
        out.append(
            '<text x="%d" y="%.1f" font-size="11" fill="%s">%s</text>'
            % (pad_l + plot_w + 6, y + 4, color, _esc(h.get("label") or _fmt(float(v))))
        )
    # 规则算出的值（与阈值同屏对比，这是判读的关键）
    for label, v in stat_lines:
        if not (y_min <= v <= y_max):
            continue
        y = sy(v)
        out.append(
            '<line x1="%d" y1="%.1f" x2="%d" y2="%.1f" stroke="#7c3aed" stroke-width="1.8"/>' % (pad_l, y, pad_l + plot_w, y)
        )
        out.append(
            '<text x="%d" y="%.1f" font-size="11" fill="#7c3aed">%s = %s</text>'
            % (pad_l + plot_w + 6, y + 4, _esc(label), _fmt(v))
        )

    # 曲线
    color_i = 0
    legend: list[tuple[str, str, bool]] = []
    for p in panels:
        for line in p["lines"]:
            if not line["ys"]:
                legend.append((line["label"], "#94a3b8", False))
                continue
            color = LINE_COLORS[color_i % len(LINE_COLORS)]
            color_i += 1
            n = min(len(line["ys"]), len(line["xs"] or []))
            stride = max(1, n // SVG_MAX_POINTS)
            pts = []
            for i in range(0, n, stride):
                yv = line["ys"][i]
                xv = line["xs"][i]
                if yv is None or xv is None:
                    continue
                try:
                    fy, fx = float(yv), float(xv)
                except (TypeError, ValueError):
                    continue
                if not (math.isfinite(fy) and math.isfinite(fx)):
                    continue
                pts.append("%.1f,%.1f" % (sx(fx), sy(fy)))
            if pts:
                out.append('<polyline fill="none" stroke="%s" stroke-width="1.4" points="%s"/>' % (color, " ".join(pts)))
            legend.append((line["label"], color, True))

    # 图例（放图下方，避免盖住曲线）
    out.append("</svg>")
    if legend:
        items = "".join(
            '<span class="lg"><i style="background:%s"></i>%s%s</span>' % (c, _esc(label), "" if ok else "（日志里没有）")
            for label, c, ok in legend
        )
        out.append('<div class="legend">%s</div>' % items)
    return "".join(out)


def _esc(text) -> str:
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


# --------------------------------------------------------------------------- 取数


def instance_count(ns: dict, topic: str) -> int:
    """这个 topic 在日志里有几个实例。

    **只看 manifest 里有没有这一行**：`n` 是"这一路采了多少个点"，不是"有几个实例"——
    按 `n > 1` 筛会把只采到一个点的实例静默丢掉（前端 `topicInstances` 就栽过这一条）。
    """
    man = call(ns, "np_manifest()") or {}
    return sum(1 for t in man.get("topics") or [] if t.get("topic") == topic)


def spread_notes(ns: dict, yspec) -> list[str]:
    """区间引用在这个预览里**只画实例 0**，线上却会按实例展开成多条 —— 两边不是一回事。

    引擎 `_pick_ref` 收到 `instance=` 会盖掉引用里的区间，所以这条路径既不报错也不展开：
    `sensor_accel[:].x` 在这里画出的是实例 0 一条（实测 28174ed8 确认），而线上是 3 条。
    静默少画又不说，等于让作者照着一张不准的图调预设，所以必须点破。
    """
    out = []
    for spec in yspec or []:
        for ref in spec.get("fields") or []:
            m = RANGE_REF_RE.match(str(ref))
            if not m:
                continue
            topic, field = m.group(1), m.group(4)
            n = instance_count(ns, topic)
            if n == 0:
                out.append("`%s` 是区间引用，但这份日志里没有 %s —— 预览和线上都画不出来" % (ref, topic))
            elif n == 1:
                out.append("`%s` 是区间引用：这份日志里 %s 只有 1 个实例，预览与线上都是 1 条" % (ref, topic))
            else:
                out.append(
                    "`%s` 是区间引用：预览只画实例 0，线上会展开成 %d 条（%s）"
                    % (ref, n, "、".join("%s[%d].%s" % (topic, k, field) for k in range(n)))
                )
    return out


def fetch_child(ns: dict, child: dict, compute=None) -> dict:
    """按一个 child 的声明取数。返回 {xs, lines:[{label, ys}], error, notes}。

    `compute` 必须跟着传：很多图的 ydata 是 `{"kind":"var"}`（四元数转欧拉角这类换算节点的
    输出），不把预设的换算节点一起交给 np_series，变量算不出来 → 整张图静默变空
    （roll-angle 就是这种，第一版漏了它，报告里只剩一句"数据都没有"）。
    """
    yspec = child.get("ydata") or []
    labels = child.get("labels") or []
    # 区间引用在这条路径上会被 `instance: 0` 盖掉（见 spread_notes），先算出提示再取数
    notes = spread_notes(ns, yspec)
    req = {"instance": 0, "ydata": yspec}
    if compute:
        req["compute"] = compute
    if child.get("xdata"):
        req["xdata"] = child["xdata"]
    try:
        got = call(ns, "np_series(%s, %d)" % (json.dumps(json.dumps(req, ensure_ascii=False)), MAX_POINTS))
    except Exception as exc:  # noqa: BLE001 —— 取数失败要变成图上的一句话，而不是让脚本崩掉
        return {"xs": [], "lines": [], "error": "%s: %s" % (type(exc).__name__, exc), "notes": notes}
    if got.get("error"):
        return {"xs": [], "lines": [], "error": got["error"], "notes": notes}
    xs = got.get("x") or got.get("t") or []
    series = got.get("series") or []
    lines = []
    for i, spec in enumerate(yspec):
        label = labels[i] if i < len(labels) else "/".join(spec.get("fields") or [])
        ys = series[i] if i < len(series) else None
        # 横轴是整张面板共用的（np_series 只回一个 t / x），每条线各存一份，画图时不用跨层取
        lines.append(
            {
                "label": label,
                "ys": ys or [],
                "xs": xs,
                # 取没取到必须单独记：`ys` 为空有可能是"这条没取到"、也有可能是"取到了但
                # 一个点都没有"，前者要报警。np_series 对单条取不到**不给 error**，只把
                # series[i] 置 null——不记下来就是静默丢线
                "got": ys is not None,
                "stats": series_stats(ys) if ys is not None else None,
            }
        )
    return {"xs": xs, "lines": lines, "error": "", "notes": notes}


# --------------------------------------------------------------------------- HTML

# 三个页面（规则体检 / 选日志 / 绘图预设编辑）共用这一份样式：每页各写一套的话，
# 改一处忘了另一处就是"同一份外观有两个真相"，最后谁都记不清哪个是新的。
PAGE_CSS = """body{font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;margin:0;padding:14px;background:#f8fafc;color:#0f172a}
/* 全屏铺满：1040px 那个上限是给首页卡片看的，三个工具页要看清单 + 图 + 信息，越宽越好 */
.wrap{max-width:none;margin:0}
h1{font-size:19px;margin:0 0 4px}
h2{font-size:15px;margin:22px 0 8px;color:#334155}
p.sub{color:#64748b;font-size:12px;margin:0 0 16px}
.meta{color:#64748b;font-size:12px;margin-bottom:14px}
.badge{display:inline-block;color:#fff;font-size:12px;padding:2px 10px;border-radius:11px;margin-left:8px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:14px}
label{display:block;font-size:13px;font-weight:600;margin:14px 0 5px}
select,input[type=text]{width:100%;box-sizing:border-box;font-size:13px;padding:7px 9px;
border:1px solid #cbd5e1;border-radius:7px;background:#fff}
input[type=text]{font-family:ui-monospace,Menlo,Consolas,monospace}
textarea{width:100%;box-sizing:border-box;font-family:ui-monospace,Menlo,Consolas,monospace;
font-size:12.5px;line-height:1.6;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff}
button{margin-top:14px;font-size:14px;font-weight:600;color:#fff;background:#2563eb;border:0;
border-radius:8px;padding:9px 20px;cursor:pointer}
.hint{color:#94a3b8;font-size:12px;margin-top:5px;line-height:1.6}
table{border-collapse:collapse;width:100%;font-size:13px}
td,th{border-bottom:1px solid #eef2f7;padding:5px 8px;text-align:left;vertical-align:top}
td.k{font-family:ui-monospace,Menlo,Consolas,monospace;color:#334155;white-space:nowrap}
.hit{color:#dc2626;font-weight:600}.miss{color:#64748b}.exc{color:#d97706;font-weight:600}
.err,.notice{background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 16px;
margin-bottom:14px;color:#991b1b;font-size:13px;line-height:1.6}
.err ul{margin:8px 0 0;padding-left:20px}
ul.plots{margin:8px 0 0;padding-left:20px;font-size:13px;line-height:1.85}
span.cnt{color:#94a3b8;font-size:12px}
.ok-note{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:11px 14px;
margin-bottom:14px;color:#166534;font-size:13px;line-height:1.6}
.legend{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:#475569;margin-top:6px}
.lg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px}
.empty{color:#94a3b8;font-size:13px}
pre.term{white-space:pre-wrap;word-break:break-all;font-size:12px;line-height:1.55;color:#334155;
background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin:8px 0 0;
max-height:420px;overflow:auto}
/* 规则编辑页一页要放多条规则的结果，卡片之间得有比 .card 更重的分隔——否则 6 条规则的
   表格连成一片，看不出「这条的结论到哪儿为止」 */
div.rule-result{border-top:2px solid #cbd5e1;margin-top:22px;padding-top:16px}
details{margin-top:8px}
summary{cursor:pointer;font-size:13px;font-weight:600;color:#334155}
footer{color:#94a3b8;font-size:12px;margin:22px 0;line-height:1.7}
a{color:#2563eb}
code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px}
/* 左右分栏：左栏是编辑器（保存时不动），右栏是效果（整体替换）。
   窄屏时退化成上下，免得两栏都被挤成一条 */
.split{display:flex;gap:14px;align-items:flex-start;margin-top:4px}
/* 右栏更大：左栏只要够放一个编辑框 + 两个下拉，剩下的全给效果区（图、规则结论、日志信息） */
.pane-left{flex:0 0 32%;min-width:340px}
.pane-right{flex:1;min-width:0}
/* 两栏各自滚到底：整页滚的话，右栏看第 6 条规则时左栏编辑框已经滚没了，改完没法立刻保存 */
.scroll-pane{max-height:calc(100vh - 108px);overflow:auto;padding-right:4px}
textarea.fill{height:calc(100vh - 420px);min-height:300px}
@media(max-width:900px){.split{flex-direction:column}.pane-left,.pane-right{flex:1 1 auto;width:100%}}
/* 首页三个工具的入口卡片 */
/* 一行三列：用 grid 而不是 flex-wrap——flex 靠 flex-basis 猜宽度，窗口一窄就掉成两行，
   三列是这三个入口的既定排布，不该随宽度变 */
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:6px}
.tile{min-height:150px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;text-decoration:none;color:inherit;display:flex;flex-direction:column}
.tile:hover{border-color:#93c5fd;background:#f8fbff}
.tile b{display:block;font-size:16px;margin-bottom:8px}
.tile span{display:block;font-size:13px;color:#64748b;line-height:1.8}
.tile strong{display:block;margin-top:auto;font-size:13px;color:#2563eb;font-weight:600}
/* ulog 字段清单：topic 一行，点开才是它的字段 */
ul.topics{list-style:none;margin:6px 0 0;padding:0;font-size:13px}
ul.topics>li{border-bottom:1px solid #f1f5f9}
ul.topics a.tname{display:block;padding:5px 7px;text-decoration:none;color:#0f172a;border-radius:6px}
ul.topics a.tname:hover{background:#f1f5f9}
ul.topics li.open>a.tname{background:#eff6ff;color:#1d4ed8;font-weight:600}
span.n{color:#94a3b8;font-size:12px;margin-left:6px}
ul.fields{list-style:none;margin:4px 0 10px;padding:0 0 0 14px;font-size:12.5px}
ul.fields li{padding:2px 0;color:#334155}
span.dtype{color:#94a3b8;font-size:11.5px;margin-left:5px}
/* 顶部导航：回首页 + 三个工具互跳。sticky 是因为右栏能滚很长（failsafe 一个文件 6 条规则），
   链接放页脚的话每次切工具都得先滚到底 */
nav.topbar{position:sticky;top:0;z-index:5;background:#f8fafc;padding:8px 0 9px;margin:0 0 10px;
border-bottom:1px solid #e2e8f0;font-size:13px}
nav.topbar a{margin-right:14px;text-decoration:none}
nav.topbar a:hover{text-decoration:underline}
nav.topbar b{color:#0f172a;margin-right:14px}
/* 元信息块里的过滤框（上千条参数靠它找）。只过滤 tbody 的行，表头不动 */
input.filter{margin:8px 0 6px}
/* 元信息 tab 栏：横排、可换行、当前那个高亮。整块占满右栏宽度，省得一行挤不下 6 个 */
nav.tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
button.tab{font-size:12.5px;font-weight:600;color:#334155;background:#fff;border:1px solid #e2e8f0;
border-radius:999px;padding:5px 13px;cursor:pointer;margin:0}
button.tab:hover{border-color:#93c5fd;color:#1d4ed8}
button.tab.active{background:#2563eb;border-color:#2563eb;color:#fff}
button.tab span.n{margin-left:6px;color:#94a3b8}
button.tab.active span.n{color:#dbeafe}
section.tab-panel{display:none}
section.tab-panel.active{display:block}
/* 运行清单：默认折叠。summary 上就写着结论（几项正常 / 几项警告），
   所以折起来也不至于"不知道里面是什么"——不像元信息那十几块，得挨个点开才知道 */
details.diag{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;margin:0 0 14px}
details.diag>summary{cursor:pointer;font-size:13px;font-weight:600;color:#334155}
details.diag h4{font-size:12px;color:#64748b;margin:14px 0 4px;font-weight:600}
details.diag code{font-size:12px;color:#0f172a}
span.warn{color:#b45309;font-weight:600}
section.tab-panel h3{font-size:13px;color:#64748b;font-weight:600;margin:0 0 8px}
"""


def result_card(
    *,
    rule: dict,
    log_path: Path,
    verdict: str,
    verdict_level: str,
    problems: list[str],
    variables: list[tuple[str, object]],
    trigger_rows: list[dict],
    charts: list[tuple[str, str]],
    transcript: str = "",
    title_tag: str = "h1",
    collapse_transcript: bool = False,
) -> str:
    """一条规则的体检结果 —— 只出片段，不含 `<html>` 外壳。

    为什么把外壳拆开：规则编辑页要在**同一页里并排放多条规则**的结果（`failsafe.yaml`
    一个文件装 6 条，一次保存 6 条都得看得见），而单条体检页是整页只有一条。
    外壳归外壳、正文归正文，两个页面共用同一份正文 —— 否则「编辑页里看到的结论」与
    「单独体检看到的结论」就是两份可以各自漂移的实现。
    `title_tag` 让编辑页用 `h2`（它是页面的一部分，不是页面标题）；
    `collapse_transcript` 让编辑页把过程日志折起来（6 条规则各来一份，全展开就没人看了）。
    """
    trans_html = ""
    if transcript.strip():
        inner = '<pre class="term">%s</pre>' % _esc(ANSI_RE.sub("", transcript))
        if collapse_transcript:
            trans_html = "<details><summary>执行过程（终端原样）</summary>%s</details>" % inner
        else:
            trans_html = '<div class="card"><b>执行过程（终端原样）</b>%s</div>' % inner

    def badge():
        color = LEVEL_COLORS.get(verdict_level, "#64748b")
        return '<span class="badge" style="background:%s">%s</span>' % (color, _esc(verdict))

    prob_html = ""
    if problems:
        prob_html = '<div class="err"><b>跑不通：缺的东西</b><ul>%s</ul></div>' % "".join(
            "<li>%s</li>" % _esc(p) for p in problems
        )
    var_html = "".join(
        '<tr><td class="k">%s</td><td>%s</td></tr>'
        % (_esc(k), _esc(describe(v) if not isinstance(v, (int, float, str)) else v))
        for k, v in variables
    )
    trig_html = "".join(
        '<tr><td class="k">%s</td><td class="%s">%s</td><td>%s</td><td>%s</td></tr>'
        % (
            _esc(t["when"]),
            "hit" if t["hit"] else ("exc" if t["exc"] else "miss"),
            _esc(t["state"]),
            _esc(t.get("severity") or "-"),
            _esc(t.get("title") or "-"),
        )
        for t in trigger_rows
    )
    charts_html = "".join("<h2>%s</h2>%s" % (_esc(title), body) for title, body in charts)
    return """<%(tag)s>%(name)s <span style="color:#94a3b8;font-weight:400">%(rid)s</span>%(badge)s</%(tag)s>
<div class="meta">group %(group)s · 日志 %(logname)s</div>
%(prob)s
<div class="card"><b>规则算出来的量</b><table>%(vars)s</table></div>
<div class="card"><b>触发判定</b><table><tr><th>when</th><th>结果</th><th>级别</th><th>标题</th></tr>%(trigs)s</table></div>
%(charts)s
%(transcript)s
""" % {
        "tag": title_tag,
        "name": _esc(rule.get("name") or rule.get("id")),
        "rid": _esc(rule.get("id")),
        "badge": badge(),
        "group": _esc(rule.get("group") or "-"),
        "logname": _esc(log_path.name),
        "prob": prob_html,
        "vars": var_html or '<tr><td colspan="2" class="empty">没算出任何量</td></tr>',
        "trigs": trig_html,
        "charts": charts_html,
        "transcript": trans_html,
    }


def html_page(
    *,
    rule: dict,
    log_path: Path,
    verdict: str,
    verdict_level: str,
    problems: list[str],
    variables: list[tuple[str, object]],
    trigger_rows: list[dict],
    charts: list[tuple[str, str]],
    transcript: str = "",
    back_href: str = "",
) -> str:
    """单条规则体检的整页：正文就是 `result_card`，外面套一层 HTML 外壳。"""
    back_html = '<a href="%s">&larr; 改选日志 / 规则</a> · ' % _esc(back_href) if back_href else ""
    title = _esc(rule.get("name") or rule.get("id"))
    return """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>%(title)s · 规则体检</title>
<style>%(css)s</style></head><body><div class="wrap">
%(body)s
<footer>%(back)s改了 <code>knowledge/px4/rules/*.yaml</code> 之后要先 <code>cd web &amp;&amp; pnpm build:kb</code>，
本脚本读的是构建产物。</footer>
</div></body></html>
""" % {
        "title": title,
        "body": result_card(
            rule=rule,
            log_path=log_path,
            verdict=verdict,
            verdict_level=verdict_level,
            problems=problems,
            variables=variables,
            trigger_rows=trigger_rows,
            charts=charts,
            transcript=transcript,
        ),
        "back": back_html,
        "css": PAGE_CSS,
    }


# --------------------------------------------------------------------------- 主流程


def find_rule(ns: dict, wanted: str) -> tuple[dict | None, str]:
    """按 id / 文件名 / 模糊匹配找规则。返回 (规则, 找不到时的提示)。"""
    rules = ns["RULES"]
    for r in rules:
        if r["id"] == wanted:
            return r, ""
        if wanted.startswith("px4-") and r["id"] == wanted:
            return r, ""
    stem = Path(wanted).stem
    for r in rules:
        if r["id"] == stem or r["id"] == "px4-" + stem or r["id"].endswith("-" + stem):
            return r, ""
    near = difflib.get_close_matches(wanted, [r["id"] for r in rules], n=5, cutoff=0.4)
    hint = "；相近的规则 id：%s" % "、".join(near) if near else ""
    # 源里有、产物里没有 —— 最常见的成因就是忘了 build:kb
    src = RULES_DIR / (stem + ".yaml")
    if not src.exists():
        src = RULES_DIR / (stem + ".yml")
    if src.exists():
        hint += "。源文件 %s 存在但产物里没有这条 —— 先 `cd web && pnpm build:kb`" % src.name
    return None, "产物里没有这条规则（共 %d 条）：%s%s" % (len(rules), wanted, hint)


@contextlib.contextmanager
def _muted(logger):
    """把 logger 的输出暂时接走（网页模式的输出目标是 HTTP 响应，不是终端）。

    不能只靠 `contextlib.redirect_stdout`：logging 的 `StreamHandler` 在**创建时**就把
    `sys.stdout` 那个对象存进了 `self.stream`，之后再换 `sys.stdout` 对它无效。要换的是
    handler 自己的 stream —— `probe_rule` 里的 `log` 与本模块是同一个 logger 实例
    （`get_logger()` 不带名字 → 都是 `logging.getLogger("ci")`），所以换一次两边都静音。
    """
    sink = io.StringIO()
    handlers = [h for h in logger.handlers if isinstance(h, logging.StreamHandler)]
    saved = [h.stream for h in handlers]
    for h in handlers:
        h.setStream(sink)
    try:
        yield sink
    finally:
        for h, stream in zip(handlers, saved):
            h.setStream(stream)


def _probe_body(ns: dict, rule: dict) -> dict:
    """跑一条规则的**实现体**：前置检查 → compute → triggers → 取数画图。结果一律打进 log。"""
    have = manifest_fields(ns)
    problems = check_prereq(rule, have)
    for p in problems:
        log.error("  缺: %s" % p)

    env = ns["_rule_env"]()
    declared: list[str] = []
    compute_ok = True
    # 下面几行是 probe_rule 的逐子表达式求值：子表达式被单独 eval，`_try(...)` 这类由求值器
    # 注入的名字会报 NameError——那是**求值方式的产物**，不是规则的错；看 `->` 那一行才准。
    log.info("  （子表达式逐层求值；其中的 NameError 是单独 eval 的产物，以 `->` 那一行为准）")
    for i, expr in enumerate(rule.get("compute") or [], 1):
        log.info("\n  compute [%d] %s" % (i, expr))
        ok, guarded = probe_expr(ns, expr, env)
        if not ok:
            compute_ok = False
            if guarded:
                log.warning("  （_try 包裹，实际会置 None）")
            break
        declared.extend(targets_of(expr))

    variables = [(k, env.get(k)) for k in declared]
    if variables:
        log.info("\n  变量：")
        for k, v in variables:
            log.info("    %-22s = %s" % (k, round(v, 4) if isinstance(v, float) else describe(v)))

    trigger_rows: list[dict] = []
    hits = 0
    compute_failed = not compute_ok
    for t in rule.get("triggers") or []:
        row = {"when": t["when"], "severity": t.get("severity"), "title": t.get("title"), "exc": "", "hit": False}
        if compute_failed:
            row["state"] = "没算（compute 失败）"
        else:
            try:
                hit = bool(ns["_eval_expr"](t["when"], env))
            except Exception as exc:  # noqa: BLE001
                # 引擎在这里是静默的（trigger 出错视为未命中），体检工具必须把它喊出来
                hit = False
                row["exc"] = "%s: %s" % (type(exc).__name__, exc)
                log.warning("  trigger %s -> 表达式抛异常：%s（引擎会静默当成未命中）" % (t["when"], row["exc"]))
            row["hit"] = hit
            row["state"] = "命中" if hit else ("异常（引擎当未命中）" if row["exc"] else "未命中")
            if hit:
                hits += 1
        trigger_rows.append(row)
        log.info("  trigger %-34s -> %s" % (t["when"], row["state"]))

    exc_n = sum(1 for t in trigger_rows if t["exc"])
    if compute_failed:
        verdict, level = "数据不足，没算出结论", "warning"
    elif hits:
        worst = next((t for t in trigger_rows if t["hit"] and t.get("severity") == "critical"), None)
        verdict, level = ("触发 %d 条" % hits, "critical" if worst else "warning")
    elif exc_n:
        # 值缺失（None 与数值比较）在引擎里是"静默未命中"，体检必须把话说出来，
        # 否则"没报警"会被当成"数据没问题"
        verdict, level = "未触发（%d 条 trigger 因值缺失抛异常，引擎视为未命中）" % exc_n, "info"
    else:
        verdict, level = "未触发", "ok"

    # 图：优先浏览器那张（预设），没有就用规则自己引用到的字段兜底
    preset, why = pick_preset(rule, load_presets())
    if preset is not None:
        axes_list, source = preset.get("outputs") or [], "预设 %s（%s）" % (preset.get("id"), why)
    else:
        fb = fallback_axes(rule)
        axes_list, source = ([fb] if fb.get("children") else []), "没有可用预设，用规则 compute 里的字段兜底"
    log.info("\n  图来自：%s" % source)

    stat_lines: list[tuple[str, float]] = []
    for k, v in variables:
        if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(float(v)):
            stat_lines.append((k, float(v)))

    charts: list[tuple[str, str]] = []
    preset_compute = (preset or {}).get("compute") or []
    for axes in axes_list:
        if not axes.get("children"):
            continue
        panels, notes = [], []
        for child in axes["children"]:
            res = fetch_child(ns, child, preset_compute)
            if res["error"]:
                # 引擎那句"这张图的数据都没有"是按**一次请求**说的，而请求是逐 child 发的——
                # 不点名是哪条线，就会让人以为整张图都废了
                who = "、".join(child.get("labels") or []) or "未命名线"
                notes.append("%s：%s" % (who, res["error"]))
            notes.extend(res.get("notes") or [])
            panels.append({"xs": res["xs"], "lines": res["lines"]})
        body = svg_chart(axes, panels, stat_lines)
        for n in dict.fromkeys(notes):
            body += '<p class="empty">%s</p>' % _esc(n)
        charts.append((axes.get("title") or "未命名图", body))

    return {
        "problems": problems,
        "variables": variables,
        "trigger_rows": trigger_rows,
        "charts": charts,
        "verdict": verdict,
        "level": level,
        "compute_failed": compute_failed,
        "chart_source": source,
    }


def run_probe(ns: dict, rule: dict, *, quiet: bool = False) -> dict:
    """在一**已加载**的 namespace 上跑一条规则，结果装进一个 dict。

    抽成函数是为了让 CLI 与网页模式跑**同一份**逻辑（改一处两边都变，不会跑偏）。
    `quiet=True` 时过程日志不进终端，而是原样收进返回值的 `transcript`（网页模式显示它）；
    `quiet=False` 时照旧打到终端，`transcript` 是空串。
    """
    if not quiet:
        out = _probe_body(ns, rule)
        out["transcript"] = ""
        return out
    with _muted(log) as sink:
        out = _probe_body(ns, rule)
    out["transcript"] = sink.getvalue()
    return out


def main(argv: list[str]) -> int:
    import argparse

    ap = argparse.ArgumentParser(
        prog="workbench.py",
        description="在一份真实日志上跑一条规则：给结论、给图、说清缺什么。不给参数则打开网页选。",
    )
    ap.add_argument("log", nargs="?", help=".ulg 日志路径")
    ap.add_argument("rule", nargs="?", help="规则 id（如 px4-vibration）或规则文件名（如 vibration / vibration.yaml）")
    ap.add_argument("--out", default="", help="HTML 输出路径（默认 .cache/px4/rule-reports/ 下）")
    ap.add_argument("--open", action="store_true", help="生成后用系统默认浏览器打开")
    ap.add_argument("--serve", action="store_true", help="强制进网页模式（不给参数时本来就会进）")
    ap.add_argument("--port", type=int, default=0, help="网页模式端口（默认 0 = 让系统挑一个空闲的）")
    ap.add_argument("--no-browser", action="store_true", help="网页模式不要自动打开浏览器")
    args = ap.parse_args(argv[1:])

    if args.serve or not (args.log or args.rule):
        return serve(port=args.port, open_browser=not args.no_browser)
    if not (args.log and args.rule):
        # 只给一半时进网页模式会让人以为"它认了我填的那个"，不如直接说清楚
        log.error("FAIL 日志与规则要么**都给**、要么**都不给**（都不给 = 打开网页选）")
        return 2

    log_path = Path(args.log)
    if not log_path.exists():
        log.error("FAIL 日志不存在：%s" % log_path)
        return 2
    if not PLOTS_TS.exists():
        log.error("FAIL 找不到绘图产物 %s —— 先 cd web && pnpm build:kb" % PLOTS_TS.name)
        return 2

    log.print_header("单条规则体检", "python tools/dev/workbench.py %s %s" % (args.log, args.rule))
    try:
        ns = build_namespace(log_path)
    except RuntimeError as exc:
        # build_namespace 会自己查"产物比 rules/*.yaml 旧"，这里只把它翻成人话
        log.error("FAIL %s" % exc)
        return 2
    except Exception as exc:  # noqa: BLE001
        log.error("FAIL 引擎起不来（%s: %s）" % (type(exc).__name__, exc))
        return 2

    rule, hint = find_rule(ns, args.rule)
    if rule is None:
        log.error("FAIL %s" % hint)
        return 2

    out = run_probe(ns, rule)

    out_path = Path(args.out) if args.out else REPORT_DIR / ("%s-%s.html" % (rule["id"], log_path.stem))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        html_page(
            rule=rule,
            log_path=log_path,
            verdict=out["verdict"],
            verdict_level=out["level"],
            problems=out["problems"],
            variables=out["variables"],
            trigger_rows=out["trigger_rows"],
            charts=out["charts"],
        ),
        encoding="utf-8",
    )

    log.info("\n  结论：%s" % out["verdict"])
    log.info("  报告：%s" % out_path)
    if args.open and os.name == "nt":
        os.startfile(str(out_path))  # noqa: S606 —— 仅 --open 时由用户显式触发

    if out["problems"] or out["compute_failed"]:
        log.error("\n=== 这条规则在这份日志上跑不通（退出 3）===")
        return 3
    log.info("\n=== 体检完成（退出 0）===")
    return 0


# --------------------------------------------------------------------------- 网页模式


def discover_logs() -> list[Path]:
    """首页列出的候选日志（大的在前——真实日志比 sample 更能说明问题）。"""
    if not LOG_DIR.is_dir():
        return []
    return sorted(LOG_DIR.glob("*.ulg"), key=lambda p: p.stat().st_size, reverse=True)


def built_rules() -> tuple[list[dict], str]:
    """首页要列规则，可那时还没选日志、也就没有 namespace（规则表挂在 namespace 上）。

    直接复用 `px4log_engine_runner._load_rules`：产物里那份规则表**只该有一处实现**，
    在这里再写一遍正则就是给自己埋一个「两处漂移」的坑（这个仓库已经在别的地
    方为这种事付过账单）。返回 (规则列表, 读不到时的原因)。
    """
    try:
        return _load_rules(), ""
    except Exception as exc:  # noqa: BLE001 —— 产物缺失/陈旧要在页面上说，不是崩掉
        return [], str(exc)


def plot_source_path(preset_id: str) -> Path | None:
    """预设 id 对应的源文件（约定：文件名与 id 同名）。"""
    path = PLOT_DIR / ("%s.yml" % preset_id)
    return path if path.is_file() else None


def rule_source_files() -> list[Path]:
    """`knowledge/px4/rules/` 下的规则源文件。只收 `.yaml`——编译器也是这个口径
    （`build-knowledge.mjs` 的 `loadRules` 里 `f.endsWith(".yaml")`），收 `.yml` 会列
    出一批编译器根本不读的文件，点进去改完毫无反应。"""
    if not RULES_DIR.is_dir():
        return []
    return sorted(RULES_DIR.glob("*.yaml"))


def rule_source_path(name: str) -> Path | None:
    """规则编辑页的源文件（只认 `knowledge/px4/rules/` 下的**文件名**）。

    为什么只取 basename：`name` 直接来自 URL 查询串，不夹一层就拼进路径等于给网页
    开一个任意读文件的口子（`?file=../../web/.env`）。只留文件名，`../` 无处可去。
    """
    path = RULES_DIR / Path(name).name
    return path if path.is_file() else None


def rule_ids_in(path: Path) -> list[str]:
    """一个规则文件里装了哪几条规则（按 YAML 里出现的顺序）。

    产物里的规则**不带源文件名**（`loadRules` 内部那个 `sources` 只喂给了规则清单页
    `rule-catalogue.mdx`，没进 `pyodide-px4log-engine.ts`），所以「这个文件对应哪几条
    规则」只能回源里读。一个文件可以装多条：顶层写成数组就是多条（`failsafe.yaml`
    有 6 条），写成对象就是一条。
    """
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 —— 正在编辑的文件可能语法是坏的，那时候不展示结果就是了
        return []
    items = data if isinstance(data, list) else [data]
    return [str(it["id"]) for it in items if isinstance(it, dict) and it.get("id")]


def compile_knowledge() -> tuple[bool, str]:
    """编译整个 `knowledge/`（规则 + 绘图预设 + facts）：直接跑构建脚本，不做第二份实现。

    为什么不在 Python 里重写编译：编译器只有构建期那一份（`web/scripts/build-knowledge.mjs`
    的 `loadPresets` / `loadRules`），重实现一遍就是「同一件事两个真相」，必然漂移——这个
    项目已经为这种事付过账单（facts.yaml 本地装配 vs 产物）。实测全量构建约 1 秒，够快，
    所以改一个规则文件也把 plot 一起重编，不值得为此做增量。
    返回 (是否通过, 失败原因)。
    """
    try:
        proc = subprocess.run(
            [NODE_BIN, "scripts/build-knowledge.mjs"],
            cwd=str(REPO_ROOT / "web"),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
        )
    except Exception as exc:  # noqa: BLE001 —— 跑不动也要变成页面上的一句话
        return False, "跑不动构建脚本（%s: %s）" % (type(exc).__name__, exc)
    if proc.returncode == 0:
        return True, ""
    # node 的堆栈很长，有用的只有 Error: 那行到第一个 `    at ` 之前
    msg = proc.stderr or proc.stdout or ""
    i = msg.find("Error:")
    if i >= 0:
        tail = msg[i:]
        cut = tail.find("\n    at ")
        msg = tail[:cut] if cut > 0 else tail
    return False, msg.strip() or "构建失败（exit %d），但没抓到错误信息" % proc.returncode


def save_knowledge_file(path: Path, text: str) -> Path:
    """把编辑框的内容写回 `knowledge/` 下的源文件，返回**原文备份**的路径。

    为什么必须先备份：写完立刻就要编译，而编译失败时源文件已经是坏的——
    `knowledge/` 是这个项目的本体，不能留一个让 `pnpm build:kb` 红掉的文件在里面。
    调用方拿到备份路径，在编译失败时还原（编辑框里的内容由页面自己回填，不丢）。

    备份名带父目录名（`rules.xxx` / `plot.xxx`）：两个目录下有同名字文件
    （`vibration.yml` 与 `vibration.yaml` 都在），只按 stem 存会互相盖掉。
    """
    KB_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup = KB_BACKUP_DIR / ("%s.%s.%s%s" % (path.parent.name, path.stem, stamp, path.suffix))
    if path.is_file():
        backup.write_bytes(path.read_bytes())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    return backup


def restore_knowledge_file(backup: Path, path: Path) -> None:
    if backup.is_file():
        path.write_bytes(backup.read_bytes())


# 逐条诊断 compute 要用引擎内部这三个名字。它们是**内部**实现，引擎重构改了名就会失效，
# 所以调用前先确认还在（见 `diagnose_compute`），不在就整段降级而不是让页面 500。
ENGINE_INTERNALS = ("_eval_compute", "_rule_env", "_pick_ref")

# 一句 exec 进引擎 namespace 的代码：只求值**一条** compute，回报它赋值给的那些变量。
# 为什么要逐条、而不是整块一起算：整块里任何一条炸了，np_series 只给一句笼统的
# "换算节点算不出来"，说不出是第几条；更糟的是引用了不存在的 topic 时它**不报错**、
# 静默产出 None（实测 `foo = nonexistent_topic.x` → ok=True、foo=None），图变空而页面
# 一句解释都没有。逐条求值才能把这两类都点名。
_EVAL_ONE_STMT = """
import json as _json
_sent = object()
_env = _rule_env()
_ok, _err = True, ""
try:
    _eval_compute(__STMT__, _env, ref_fn=lambda *a, **k: _pick_ref(*a, instance=__INST__, **k)[0])
except Exception as _e:
    _ok, _err = False, "%s: %s" % (type(_e).__name__, _e)
_out = {}
for _n in __NAMES__:
    _v = _env.get(_n, _sent)
    if _v is _sent:
        _out[_n] = ["没赋值", None, None]
    elif _v is None:
        _out[_n] = ["空", None, None]      # 不报错但产出 None = 引用了不存在的 topic / 字段
    elif isinstance(_v, (int, float)):
        _out[_n] = ["标量", float(_v), None]
    else:
        try:
            _n0 = len(_v)
            _sub = len(_v[0]) if _n0 and hasattr(_v[0], "__len__") else None
            _out[_n] = ["序列", _n0, _sub]
        except Exception:
            _out[_n] = [type(_v).__name__, None, None]
__result = _json.dumps({"ok": _ok, "err": _err, "out": _out}, ensure_ascii=False)
"""


def compute_targets(stmt: str) -> list[str]:
    """一条 compute 赋值给哪些变量（`roll, pitch, yaw = ...` → [roll, pitch, yaw]）。

    为什么看赋值左边、而不是比 eval 前后 env 的差集：env 里本来就装了一堆预置变量
    （FW_MINOR、DURATION_S…），算差集得先空跑一次；而左边**就是**这条要产出的东西。
    """
    try:
        tree = ast.parse(str(stmt).strip())
    except SyntaxError:
        return []
    names: list[str] = []
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        for tgt in node.targets:
            if isinstance(tgt, ast.Name):
                names.append(tgt.id)
            elif isinstance(tgt, (ast.Tuple, ast.List)):
                names.extend(e.id for e in tgt.elts if isinstance(e, ast.Name))
    return names


def diagnose_conditions(ns: dict, preset: dict) -> list[dict]:
    """`conditions.topics` 是**候选组**（组内或、组间且）：每组报它命中的 topic 与采样数。

    ⚠️ 这里只报 **topic 在不在**，不报字段在不在——实测 `sensor_gps` 这个 topic 在、
    但它底下的 `alt` 字段并不在，候选组是字段级的。字段那层由「取数」那段报，
    两边各说各的，别在这里下"这条线取得到"的结论。
    """
    try:
        man = call(ns, "np_manifest()")
    except Exception as exc:  # noqa: BLE001 —— 诊断失败只让这一段缺席，不该带崩整页
        return [{"group": [], "hits": [], "ok": False, "error": "%s: %s" % (type(exc).__name__, exc)}]
    have: dict[str, int] = {}
    for t in man.get("topics") or []:
        name = str(t.get("topic"))
        have[name] = max(have.get(name, 0), int(t.get("n") or 0))
    rows = []
    for group in (preset.get("conditions") or {}).get("topics") or []:
        names = [str(g) for g in group] if isinstance(group, list) else [str(group)]
        hits = [(n, have.get(n, 0)) for n in names if have.get(n, 0)]
        rows.append({"group": names, "hits": hits, "ok": bool(hits), "error": ""})
    return rows


def diagnose_compute(ns: dict, preset: dict) -> tuple[bool, list[dict]]:
    """逐条跑预设的 compute。返回 (引擎内部接口还在吗, 每行的结果)。

    `available=False` 时 rows 为空——那是**降级**信号，页面据此说"逐条诊断不可用"，
    而不是把"全都正常"当成诊断结论（这两者看起来一样，差别是致命的）。
    """
    stmts = preset.get("compute") or []
    if not stmts:
        return True, []
    if any(n not in ns for n in ENGINE_INTERNALS):
        return False, []
    rows = []
    for i, stmt in enumerate(stmts, 1):
        names = compute_targets(stmt)
        code = _EVAL_ONE_STMT.replace("__STMT__", repr(stmt)).replace("__INST__", "0").replace("__NAMES__", repr(names))
        try:
            got = call(ns, code)
        except Exception as exc:  # noqa: BLE001
            rows.append({"i": i, "stmt": stmt, "ok": False, "err": "%s: %s" % (type(exc).__name__, exc), "out": {}})
            continue
        rows.append(
            {
                "i": i,
                "stmt": stmt,
                "ok": bool(got.get("ok")),
                "err": got.get("err") or "",
                "out": got.get("out") or {},
            }
        )
    return True, rows


def run_preset(ns: dict, preset: dict) -> dict:
    """把一个绘图预设画出来。与规则体检共用 `fetch_child` / `svg_chart`——
    怎么取数、怎么画只有一处实现，所以两边看到的点必然是同一批。

    除了图，还回一份 `diag`（逐语句的运行结果）：最终那张图只回答"画出来没有"，
    而改 YAML 时真正要的是"哪一句没跑成、哪条线没取到"。
    """
    charts: list[tuple[str, str]] = []
    notes: list[str] = []
    figures: list[dict] = []
    preset_compute = preset.get("compute") or []
    compute_available, compute_rows = diagnose_compute(ns, preset)
    for axes in preset.get("outputs") or []:
        if axes.get("container") != "axes":
            continue  # `map` 走 provider 的 get_flight_track，不是时间序列图
        if not axes.get("children"):
            continue
        panels, panel_notes, line_rows = [], [], []
        for child in axes["children"]:
            res = fetch_child(ns, child, preset_compute)
            if res["error"]:
                who = "、".join(child.get("labels") or []) or "未命名线"
                panel_notes.append("%s：%s" % (who, res["error"]))
            panel_notes.extend(res.get("notes") or [])
            panels.append({"xs": res["xs"], "lines": res["lines"]})
            line_rows.append(
                {
                    "labels": child.get("labels") or [],
                    "error": res["error"],
                    "mode": child.get("mode") or "",
                    "lines": [{"label": ln["label"], "got": ln["got"], "stats": ln["stats"]} for ln in res["lines"]],
                }
            )
        body = svg_chart(axes, panels, [])
        for n in dict.fromkeys(panel_notes):
            body += '<p class="empty">%s</p>' % _esc(n)
        charts.append((axes.get("title") or "未命名图", body))
        notes.extend(panel_notes)
        figures.append({"title": axes.get("title") or "未命名图", "error": "", "children": line_rows})
    return {
        "charts": charts,
        "notes": notes,
        "diag": {
            "conditions": diagnose_conditions(ns, preset),
            "compute_available": compute_available,
            "compute": compute_rows,
            "figures": figures,
        },
    }


def _log_picker(pick_log: str) -> str:
    """编辑页上的「在这份日志上看效果」选择框（与首页规则体检那套是同一份候选）。"""
    logs = discover_logs()
    picked = Path(pick_log) if pick_log else None
    matched = next((p for p in logs if p == picked), None)
    sel = str(matched) if matched else ""
    txt = "" if sel else pick_log
    opts = "".join(_option(str(p), "%s · %.1f MB" % (p.name, p.stat().st_size / 1048576), sel) for p in logs)
    if not logs:
        opts = '<option value="">（%s 下没有 .ulg，用下面的输入框填路径）' % LOG_DIR
    return (
        '<label for="log">在这份日志上看效果</label><select id="log" name="log">'
        + '<option value="">（不选 = 只保存、不画图）</option>'
        + opts
        + '</select><label for="log_path">或填绝对路径</label>'
        + '<input id="log_path" name="log_path" type="text" placeholder="D:\\some\\log.ulg" value="%s"/>' % _esc(txt)
    )


# --------------------------------------------------------------------------- ① probe ulog


def group_topics(manifest: list[dict]) -> list[dict]:
    """把同一 topic 的多个实例并成一行。

    `np_manifest()` 里 `vehicle_imu_status` 会出现 4 次（instance 0..3），直接铺开就是 4 行
    同名条目；清单要的是「这个 topic 有几个实例、各采了多少点」。字段取**实例 0** 的——
    同一 topic 各实例的字段是一样的，列四遍没有意义。
    """
    by_name: dict[str, dict] = {}
    for t in manifest:
        name, inst = str(t.get("topic")), int(t.get("instance") or 0)
        entry = by_name.setdefault(name, {"topic": name, "inst_n": {}, "fields": []})
        entry["inst_n"][inst] = int(t.get("n") or 0)
        if inst == 0:
            entry["fields"] = [(str(f.get("name")), str(f.get("dtype") or "")) for f in (t.get("fields") or [])]
    for entry in by_name.values():
        if not entry["fields"]:  # 极端情况：这个 topic 没有 instance 0，拿第一个有的实例顶上
            first = next(t for t in manifest if str(t.get("topic")) == entry["topic"])
            entry["fields"] = [(str(f.get("name")), str(f.get("dtype") or "")) for f in (first.get("fields") or [])]
    return sorted(by_name.values(), key=lambda e: e["topic"])


def series_stats(ys) -> dict:
    """一段序列的摘要。NaN/inf 单独计数——它们在日志里是真的会出现的（除零、未初始化），
    混进 min/max 会让人以为传感器真的测到了那个值。"""
    vals = [v for v in (ys or []) if isinstance(v, (int, float)) and math.isfinite(v)]
    if not vals:
        return {"n": 0, "bad": len(ys or [])}
    return {
        "n": len(vals),
        "bad": len(ys or []) - len(vals),
        "min": min(vals),
        "max": max(vals),
        "mean": sum(vals) / len(vals),
        "first": vals[0],
        "last": vals[-1],
    }


def split_pick(p: str) -> tuple[str, str]:
    """拆 `topic|field`。用 `|` 分隔而不是 `.`：字段名本身可以带点（嵌套字段），
    topic 名里不会有 `|`——按第一个点切会把 `a.b` 这种字段切坏。"""
    t, _, f = str(p).partition("|")
    return t, f


def group_picks(picked: list[str]) -> dict[str, list[str]]:
    """勾上的字段按 topic 分组（保持勾选顺序，去重）。

    **为什么要分组**：实测把不同 topic 的字段塞进同一次 `np_series`，横轴只回第一个
    topic 的，其余 topic 的序列返回空数组且 `error` 是空——勾三个字段只画出一条线，
    页面一句话都不说。分组是这个引擎当前能力的诚实用法，不是偷懒。
    """
    out: dict[str, list[str]] = {}
    for p in picked:
        topic, field = split_pick(p)
        if topic and field and field not in out.get(topic, []):
            out.setdefault(topic, []).append(field)
    return out


def _kv_rows(pairs: list[tuple[str, str]]) -> str:
    return "".join('<tr><td class="k">%s</td><td>%s</td></tr>' % (_esc(k), _esc(v)) for k, v in pairs)


def _log_info_block(title: str, body: str, panel: str, active: bool) -> str:
    """元信息的一块，渲染成一个 tab 页。

    为什么从折叠块改成 tab：折叠块得挨个点开才能看到里面是什么，而且**展不开的那块是
    全空的**——一列折叠条既不告诉你内容，也占满右栏高度。tab 只显示当前这一块，
    切换是纯前端的（所有 panel 都在 HTML 里），不刷新、不丢勾选。
    """
    return '<section class="tab-panel%s" data-panel="%s"><h3>%s</h3>%s</section>' % (
        " active" if active else "",
        _esc(panel),
        _esc(title),
        body,
    )


def _log_info_tabs(blocks: list[tuple[str, str]]) -> str:
    """把元信息各块拼成 tab 栏 + 面板。**不包 `.card`**：卡片外壳归 `log_info_card`。

    tab 与面板靠 `data-tab` / `data-panel` 配对（同一个短名），不是靠下标 ——
    下标在 `log_info_card` 里加了禁用块（空块要跳过）之后会错位。

    tab 上只写**契约键名**，不写面板标题：标题里还带着「是 ULog 原始消息还是加工结果」
    的说明，铺到 tab 栏上会把 8 个按钮撑成一长条。要点名的字段名就是键名本身。
    """
    if not blocks:
        return '<div class="card"><p class="empty">这份日志没有可显示的元信息。</p></div>'
    bar = "".join(
        '<button type="button" class="tab%s" data-tab="%s">%s<span class="n">%d</span></button>'
        % (" active" if i == 0 else "", _esc(key), _esc(key), n)
        for i, (key, _title, n, _body) in enumerate(blocks)
    )
    panels = "".join(_log_info_block(title, body, key, i == 0) for i, (key, title, _n, body) in enumerate(blocks))
    return '<nav class="tabs">%s</nav><div class="tab-host">%s</div>' % (bar, panels)


def log_info_card(*, info: dict, log_path: Path, box_id: str = "params-box") -> str:
    """右栏上半：这份日志除 `data_list`（时序采样）之外的全部元信息。

    数据来自 `np_log_info()`（引擎侧 `provider.report_materials()`），**不是**直读 pyulog 的
    `ulog.msg_info_dict`——`engine/providers/px4.py:537` 写着「走契约能力取，别再直读
    self.ulog（同一份数据两处知识）」。这份契约实际给 14 块：sysInfo / infoDict /
    msgTypeStats / messages / messagesMulti / dropouts / params / defaultParams /
    changedParams / phases 等，正好就是「除了 data_list 的所有字段」。

    在右栏以 tab 呈现，不做整页长列表：`params` 上千条、默认值 61 条，摊在一列里
    得一路滚，**图会被推到屏幕外**。tab 只显示选中那块，且切换是纯前端的不刷新页面。

    tab 上写的是**契约键名**（`infoDict` / `params` / …），不是中文标签——老大 2026-09-23
    点名要的是字段名。每块的标题里还标了它是 ULog 原始消息（'I'/'M'/'D'/'P'/'Q'）
    还是加工结果：这两类混在一起看，会把引擎算出来的东西当成日志里记的内容。
    """
    if not info:
        return '<div class="card"><p class="empty">这份日志读不出元信息。</p></div>'
    if info.get("_error"):
        return '<div class="card"><b>%s</b><div class="notice">元信息读不出来：%s</div></div>' % (
            _esc(log_path.name),
            _esc(str(info["_error"])),
        )
    size = int(info.get("fileSizeBytes") or 0)
    head = '<div class="card"><b>%s</b> · %.1f MB' % (_esc(log_path.name), size / 1048576.0)
    walked = int(info.get("msgTypeWalkedBytes") or 0)
    if info.get("msgTypeWalkOk") is False and walked != size:
        # 遍历不完整意味着下面每块都是"只看到了一部分"，不说的话会被当成全量
        head += '<div class="notice">消息类型遍历不完整：只走了 %d / %d 字节，下面的条数偏少。</div>' % (walked, size)
    # 哪些是日志里真有的字段、哪些是算出来的，必须在看得见的地方说一次：
    # 混着看会把引擎的加工结果当成日志内容（sysInfo 就是因为这一点被拿掉的）
    head += (
        '<div class="hint">只有 ULog 原始消息（I / M / D / P / Q）是日志里真有的字段；'
        "其余几块是引擎或 pyulog 加工出来的，每块标题里都标了来源。</div>"
    )
    head += "</div>"

    blocks = []
    # ⚠️ `sysInfo` **故意不做成一块**：它是 `infoDict` 里按 facts.yaml 的 `sys_info_keys`
    # 挑出来的一个子集（ver_sw / frame 之类），不是日志里独立存在的字段——同样的内容在
    # infoDict 里一字不少。老大 2026-09-23 点名：只要**原始字段**，不要软件处理之后的结果。
    info_dict = info.get("infoDict") or []
    if info_dict:
        rows = "".join(
            '<tr><td class="k">%s</td><td>%s</td><td class="k">%s</td><td>%s</td></tr>'
            % (
                _esc(str(d.get("key", ""))),
                _esc(str(d.get("value", ""))[:200]),
                _esc(str(d.get("type", ""))),
                _esc(str(d.get("name") or d.get("desc") or "")),
            )
            for d in info_dict
        )
        blocks.append(
            (
                "infoDict",
                "infoDict —— ULog 'I' 信息字典（= pyulog 的 msg_info_dict）",
                len(info_dict),
                "<table><tbody>%s</tbody></table>" % rows,
            )
        )
    stats = info.get("msgTypeStats") or []
    if stats:
        rows = "".join(
            '<tr><td class="k">%s</td><td>%s</td><td>%s</td><td>%d</td></tr>'
            % (
                _esc(str(s.get("code", ""))),
                _esc(str(s.get("name", ""))),
                _esc(str(s.get("desc", ""))),
                int(s.get("count") or 0),
            )
            for s in stats
        )
        blocks.append(
            (
                "msgTypeStats",
                "msgTypeStats —— 加工：逐字节遍历整个文件统计出来的，日志里没有这个字段",
                len(stats),
                "<table><tbody>%s</tbody></table>" % rows,
            )
        )
    phases = info.get("phases") or []
    if phases:
        rows = "".join(
            '<tr><td class="k">%.2f–%.2f s</td><td>%s</td><td>%s</td></tr>'
            % (
                float(p.get("startSec") or 0),
                float(p.get("endSec") or 0),
                _esc(str(p.get("mode", ""))),
                "已解锁" if p.get("armed") else "未解锁",
            )
            for p in phases
        )
        blocks.append(
            (
                "phases",
                "phases —— 加工：从 messages 推出来的飞行阶段，日志里没有这个字段",
                len(phases),
                "<table><tbody>%s</tbody></table>" % rows,
            )
        )
    msgs = info.get("messages") or []
    if msgs:
        rows = "".join(
            '<tr><td class="k">%.2f s</td><td class="k">%s</td><td>%s</td></tr>'
            % (float(m.get("tSec") or 0), _esc(str(m.get("levelStr", ""))), _esc(str(m.get("message", ""))))
            for m in msgs
        )
        blocks.append(
            (
                "messages",
                "messages —— 半加工：ULog 'L' 文本 + 事件解码结果 + 'C' 带 tag 消息，已合并去重",
                len(msgs),
                "<table><tbody>%s</tbody></table>" % rows,
            )
        )
    multi = info.get("messagesMulti") or []
    if multi:
        rows = "".join(
            '<tr><td class="k">%s</td><td>%s</td></tr>'
            % (
                _esc(str(m.get("key", ""))),
                _esc("、".join(str(v) for v in (m.get("values") or []))[:400]),
            )
            for m in multi
        )
        blocks.append(
            (
                "messagesMulti",
                "messagesMulti —— ULog 'M' 多值信息",
                len(multi),
                "<table><tbody>%s</tbody></table>" % rows,
            )
        )
    changed = info.get("changedParams") or []
    if changed:
        rows = "".join(
            '<tr><td class="k">%.2f s</td><td>%s</td><td>%s</td></tr>'
            % (
                float(c.get("tSec") or 0),
                _esc(str(c.get("name", ""))),
                _esc(str(c.get("value", ""))),
            )
            for c in changed
        )
        blocks.append(
            (
                "changedParams",
                "changedParams —— 加工：pyulog 按「'P' 里时间戳非 0」判定的改过，不是日志里独立的一类消息",
                len(changed),
                "<table><tbody>%s</tbody></table>" % rows,
            )
        )
    dropouts = info.get("dropouts") or []
    if dropouts:
        rows = "".join(
            '<tr><td class="k">%.2f s</td><td>丢 %d 条</td></tr>' % (float(d.get("tSec") or 0), int(d.get("count") or 0))
            for d in dropouts
        )
        blocks.append(("dropouts", "dropouts —— ULog 'D' 丢包消息", len(dropouts), "<table><tbody>%s</tbody></table>" % rows))
    params = info.get("params") or {}
    if params:
        rows = "".join(
            '<tr><td class="k">%s</td><td>%s</td></tr>' % (_esc(str(k)), _esc(str(v))) for k, v in sorted(params.items())
        )
        blocks.append(
            (
                "params",
                "params —— ULog 'P' 初始参数",
                len(params),
                '<input type="text" class="filter" data-filter-for="%s" placeholder="按参数名过滤"/>'
                '<table id="%s"><tbody>%s</tbody></table>' % (box_id, box_id, rows),
            )
        )
    defaults = info.get("defaultParams") or {}
    if defaults:
        rows = "".join(
            '<tr><td class="k">%s</td><td>%s</td></tr>' % (_esc(str(k)), _esc(str(v))) for k, v in sorted(defaults.items())
        )
        blocks.append(
            (
                "defaultParams",
                # 来源不确定时把话放在**面板标题**上（tab 只放得下键名）：这一块是"参数默认值"，
                # 来源不清会让人拿它跟 params 对比出错误结论，值得在看得见的地方标出来
                "defaultParams —— ULog 'Q' 默认参数"
                + ("" if info.get("defaultParamsKnown") else "（⚠️ 来源不确定：老固件没写这段）"),
                len(defaults),
                "<table><tbody>%s</tbody></table>" % rows,
            )
        )
    return head + '<div class="card">%s</div>' % _log_info_tabs(blocks)


def ulog_left(
    *,
    log_arg: str,
    entries: list[dict],
    open_topic: str,
    picked: list[str],
    filtered: str,
) -> str:
    """左栏：日志 → 一个关键字框 → topic 清单（展开的那个列出字段复选框）。

    **一个框同时筛 topic 与字段**，不给过滤按钮：`oninput` 防抖后自己提交。
    框里有关键字时，字段那一层只留匹配的；这样一来「只筛字段、topic 全留着」这种用法
    也成立（topic 名不含关键字 → 它自己不匹配，但它的字段匹配就仍然展开）。
    为什么不做成"按 topic 名匹配的子串还留在树上"那种树过滤：那要判定父节点是否该留，
    而这里父是 topic、子是字段，两层口径不同，混成一个框只有逐层判断才不误导。

    勾选是**跨 topic 累积**的：不在当前展开 topic 里的已选项靠 hidden input 带着走。
    GET 表单只提交当前 DOM 里的控件，展开另一个 topic 时前一个 topic 的复选框根本不在
    页面上——不加 hidden 的话「换个 topic 再勾」会静默清掉之前的选择。
    """
    quote = urllib.parse.quote
    keep = "".join('<input type="hidden" name="f" value="%s"/>' % _esc(p) for p in picked if split_pick(p)[0] != open_topic)
    pick_args = "".join("&f=%s" % quote(p) for p in picked)
    head = (
        '<form method="get" action="/ulog" class="mini">'
        + _log_picker(log_arg).replace("在这份日志上看效果", "① 日志")
        + '<button type="submit">加载日志</button></form>'
    )
    low = filtered.strip().lower()
    rows = []
    for e in entries:
        hit_topic = not low or low in e["topic"].lower()
        fields = [(n, d) for n, d in e["fields"] if not low or low in n.lower()]
        # 关键字把 topic 名和字段名一起试：任一命中就留。只按 topic 名丢的话，
        # 「筛某个字段」会因为它的 topic 名不含关键字而整条消失
        if low and not hit_topic and not fields:
            continue
        nstr = "、".join("n=%d" % e["inst_n"][i] for i in sorted(e["inst_n"]))
        multi = ' <span class="n">%d 个实例</span>' % len(e["inst_n"]) if len(e["inst_n"]) > 1 else ""
        rows.append(
            '<li%s><a class="tname" href="/ulog?log=%s&topic=%s&q=%s%s">%s<span class="n">%s</span>%s</a>'
            % (
                ' class="open"' if e["topic"] == open_topic else "",
                quote(log_arg),
                quote(e["topic"]),
                quote(filtered),
                pick_args,
                _esc(e["topic"]),
                _esc(nstr),
                multi,
            )
        )
        if e["topic"] == open_topic:
            if low and not hit_topic:
                # topic 名没命中、只是字段命中：不自动展开会把刚筛出来的字段藏起来
                fields = fields or e["fields"]
            boxes = (
                "".join(
                    '<li><label><input type="checkbox" name="f" value="%s"%s onchange="this.form.submit()"/>'
                    ' %s<span class="dtype">%s</span></label></li>'
                    % (
                        _esc("%s|%s" % (e["topic"], name)),
                        " checked" if "%s|%s" % (e["topic"], name) in picked else "",
                        _esc(name),
                        _esc(dtype),
                    )
                    for name, dtype in fields
                )
                or '<li class="empty">没有匹配的字段。</li>'
            )
            rows.append('<li><ul class="fields">%s</ul></li>' % boxes)
        rows.append("</li>")
    body = "".join(rows) or '<p class="empty">没有匹配的 topic 或字段。</p>'
    return (
        '<div class="card">%s</div>'
        '<div class="card"><form method="get" action="/ulog">'
        '<input type="hidden" name="log" value="%s"/><input type="hidden" name="topic" value="%s"/>%s'
        # oninput 防抖自己提交：不给按钮，省一次点击。三个 hidden（log/topic/已勾的 f）都在这
        # 个 form 里，自动提交不会丢状态
        '<input type="text" name="q" class="seek" data-autosubmit placeholder="② 筛 topic 或字段" value="%s"/>'
        '<div class="hint">敲字就筛（topic 名与字段名一起匹配）；点 topic 展开字段，勾上就画。'
        "可以跨 topic 勾，不同 topic 会分成多张图。</div>"
        '<div class="scroll-pane"><ul class="topics">%s</ul></div>'
        '<noscript><button type="submit">筛选 / 画勾上的字段</button></noscript>'
        "</form></div>"
    ) % (
        head,
        _esc(log_arg),
        _esc(open_topic),
        keep,
        _esc(filtered),
        body,
    )


def ulog_right(*, ns: dict, log_path: Path, picked: list[str]) -> str:
    """右栏下半：勾上的字段的取值摘要 + 图，**一个 topic 一张**。

    为什么按 topic 分组而不是全塞一张图：实测把不同 topic 的字段放进同一次 `np_series`，
    横轴只回第一个 topic 的，其余 topic 的序列返回**空数组**且 `error` 为空——
    勾三个字段只画出一条线、页面还一句解释都没有。分图是这个引擎当前能力的诚实用法。

    同一个 topic 的字段本来就是同一条时间轴，多字段同图是安全的。
    """
    groups = group_picks(picked)
    if not groups:
        return '<div class="card"><p class="empty">左边点开一个 topic，勾上要看的字段。</p></div>'
    if len(groups) > 1:
        tip = (
            '<div class="hint">勾的字段来自 %d 个 topic，分成 %d 张图：'
            "不同 topic 采样率不同，共用一条横轴会让慢的那条变空。</div>" % (len(groups), len(groups))
        )
    else:
        tip = ""
    out = [tip]
    for topic, fields in groups.items():
        refs = ["%s[0].%s" % (topic, f) for f in fields]
        child = {
            "mode": "TimeSeries",
            "xdata": None,
            "ydata": [{"kind": "field", "fields": [r]} for r in refs],
            "labels": list(fields),
        }
        res = fetch_child(ns, child)
        if res["error"]:
            out.append('<div class="notice"><b>%s</b><br/>%s</div>' % (_esc(PANE_ERROR_TITLE), _esc(res["error"])))
            continue
        rows = []
        for line in res["lines"]:
            st = series_stats(line["ys"])
            if not st.get("n"):
                rows.append(
                    '<tr><td class="k">%s</td><td class="empty">取不到值（%d 个点，全是 NaN/inf）</td></tr>'
                    % (_esc(line["label"]), st.get("bad", 0))
                )
                continue
            rows.append(
                '<tr><td class="k">%s</td><td>n=%d · 最小 %s · 最大 %s · 均值 %s · 首 %s · 尾 %s%s</td></tr>'
                % (
                    _esc(line["label"]),
                    st["n"],
                    _fmt(st["min"]),
                    _fmt(st["max"]),
                    _fmt(st["mean"]),
                    _fmt(st["first"]),
                    _fmt(st["last"]),
                    " · %d 个非有限值" % st["bad"] if st["bad"] else "",
                )
            )
        axes = {
            "container": "axes",
            "title": topic,
            "ylabel": "",
            "xlabel": "秒（相对日志开始）",
            "hlines": None,
            "children": [child],
        }
        chart = svg_chart(axes, [{"xs": res["xs"], "lines": res["lines"]}], [])
        out.append(
            '<div class="card"><b>%s</b> · 日志 %s<table>%s</table></div>%s'
            % (_esc(topic), _esc(log_path.name), "".join(rows), chart)
        )
    return "".join(out)


def ulog_page(
    *,
    log_arg: str,
    entries: list[dict],
    open_topic: str,
    picked: list[str],
    filtered: str,
    right: str,
) -> str:
    """① probe ulog：左栏 topic/字段筛选，右栏日志元信息 + 取值与图。"""
    return split_shell(
        title="看日志（probe ulog）",
        subtitle="左栏筛 topic 与字段、勾上要看的；右栏先是这份日志的全部元信息，下面是图。",
        here="ulog",
        log_arg=log_arg,
        left=ulog_left(
            log_arg=log_arg,
            entries=entries,
            open_topic=open_topic,
            picked=picked,
            filtered=filtered,
        ),
        right=right,
    )


def top_nav(*, here: str, log_arg: str = "") -> str:
    """顶部导航：回首页 + 三个工具互跳。

    为什么放顶上而且还 sticky：右栏能滚很长（`failsafe.yaml` 一个文件 6 条规则），链接挂在
    页脚的话每次换工具都得先滚到底。跳转带上 `log` 是因为三个工具看的是同一份日志，
    切过去不该再选一次——`log` 为空就不带，省一个空参数。
    """
    q = "?log=%s" % urllib.parse.quote(log_arg) if log_arg else ""
    items = []
    for key, label, path in (("ulog", "看日志", "/ulog"), ("rule", "调规则", "/rule"), ("plot", "预绘图", "/plot")):
        # 当前所在的那个不给链接：点了等于原地刷新，还会把编辑到一半的内容冲掉
        items.append("<b>%s</b>" % label if key == here else '<a href="%s%s">%s</a>' % (path, q, label))
    return '<nav class="topbar"><a href="/">&larr; 回首页</a>%s</nav>' % "".join(items)


def _file_switch(action: str, field: str, options: list[str], current: str, log_arg: str) -> str:
    """左栏顶部的「切到另一个文件」——不用回首页。

    为什么是**另一个** GET 表单而不是并进保存那个 POST 表单：并进去的话一切换文件就会把
    编辑框里没保存的内容当 `source` 一起提交上去（textarea 在同一个 form 里就是它的字段），
    等于「换个文件看看」变成了「把当前编辑的内容存进了另一个文件」。
    """
    opts = "".join(_option(o, o, current) for o in options)
    return (
        '<form method="get" action="%s" class="mini">'
        '<input type="hidden" name="log" value="%s"/>'
        '<select name="%s" onchange="this.form.submit()">%s</select>'
        '<noscript><button type="submit">切换</button></noscript>'
        "</form>"
    ) % (action, _esc(log_arg), field, opts)


def _log_switch(*, action: str, field: str, current_file: str, log_arg: str) -> str:
    """左栏第一块：选日志。独立成一个 GET 表单是因为**换日志不该动文件里的字**——

    并进保存那个 POST 表单的话，「换份日志看看」会把编辑框里没保存的内容当 `source`
    一起写回 `knowledge/`。而且顺序上它就是第一步：不知道哪份日志，选规则/选图没意义。
    """
    return (
        '<form method="get" action="%s" class="mini">'
        '<input type="hidden" name="%s" value="%s"/>'
        "%s"
        '<button type="submit">加载日志</button></form>'
    ) % (action, field, _esc(current_file), _log_picker(log_arg).replace("在这份日志上看效果", "① 日志"))


def _editor_left(
    *,
    action: str,
    field: str,
    file_options: list[str],
    current_file: str,
    log_arg: str,
    source_name: str,
    source_text: str,
    hidden: str,
) -> str:
    """左栏：**先选日志 → 再选文件 → 改 YAML → 保存**。rule 与 plot 共用这一份。

    顺序是老大点名的：没有日志就不知道规则跑出来是什么样，所以日志在最上面。
    日志与切文件各是独立的 GET 表单，编辑框单独一个 POST 表单——三个动作互不牵连，
    「换个文件看看」不会顺手把没保存的内容写进 `knowledge/`（见 `_file_switch` 的注释）。
    """
    return (
        '<div class="card">%s</div>' % _log_switch(action=action, field=field, current_file=current_file, log_arg=log_arg)
        + '<div class="card">%s</div>'
        % (
            "<label>② %s</label>" % ("规则文件" if field == "file" else "绘图预设")
            + _file_switch(action, field, file_options, current_file, log_arg)
        )
        + '<form method="post" action="%s/save" data-partial>'
        % action  # data-partial：JS 拦下这次提交，只刷新右栏（见 SPLIT_JS）
        + hidden
        # log 得自己带一份：日志选择框在上面的独立表单里，不在这个 form 的数据里
        + '<input type="hidden" name="log" value="%s"/>' % _esc(log_arg)
        + '<div class="card"><label for="source">③ %s</label>' % _esc(source_name)
        + '<textarea id="source" class="fill" name="source" spellcheck="false">%s</textarea>' % _esc(source_text)
        + SAVE_HINT
        + "</div>"
        + '<button type="submit">保存并看效果</button>'
        + "</form>"
    )


SAVE_HINT = """<div class="hint">保存会**直接覆盖**这个文件（不进暂存区，改完自己 <code>git diff</code>）。
编译不过时会自动还原成保存前的原文，备份在 <code>.cache/px4/kb-backup/</code>——
<code>knowledge/</code> 里不会留下一个让 <code>pnpm build:kb</code> 红掉的文件。</div>"""


def plot_page(
    *,
    preset_id: str,
    source_name: str,
    source_text: str,
    charts: list[tuple[str, str]],
    diag: dict | None = None,
    notice: str = "",
    ok_note: str = "",
    file_options: list[str] | None = None,
    log_arg: str = "",
) -> str:
    """绘图预设编辑器：左栏改 YAML，右栏就是它在选中日志上画出来的样子。

    右栏 = 运行清单（每张图跑到哪一步）+ 图：只有图的话，"图是空的"和"图没画出来"
    看起来一样，改 YAML 时不知道该动哪一句。
    """
    charts_html = _charts_body(charts, diag)
    return split_shell(
        title="预绘图 · %s" % preset_id,
        subtitle="左栏改 YAML，保存 = 写回 %s → 编译 → 右栏立刻重画。" % source_name,
        here="plot",
        log_arg=log_arg,
        left=_editor_left(
            action="/plot",
            field="id",
            file_options=file_options or [preset_id],
            current_file=preset_id,
            log_arg=log_arg,
            source_name=source_name,
            source_text=source_text,
            hidden='<input type="hidden" name="id" value="%s"/>' % _esc(preset_id),
        ),
        right=_pane_html(notice=notice, ok_note=ok_note, body=charts_html),
    )


def _pane_html(*, notice: str, ok_note: str, body: str) -> str:
    """右栏那一块的 HTML：红条 / 绿条 + 结果。

    单独抽出来是因为**局部刷新只替换这一块**：JS 拿到服务端返回的这一段直接塞进
    `#pane-right`。整页渲染与局部刷新拼的是同一个函数，所以两条路看到的东西必然一样
    —— 各拼一份的话「刷新后少了个提示」这种事迟早发生。
    """
    out = ""
    if notice:
        out += '<div class="notice"><b>%s</b><br/>%s</div>' % (_esc(PANE_ERROR_TITLE), _esc(notice))
    if ok_note:
        out += '<div class="ok-note">%s</div>' % _esc(ok_note)
    return out + body


PANE_ERROR_TITLE = "没出效果"


def _cards_body(cards: list[str], empty: str) -> str:
    """规则结果的右栏正文。整页渲染与局部刷新**都用这一个**：各拼一份的话，
    刷新后少一条提示这种事迟早发生，而且只在点了保存之后才看得见。"""
    if not cards:
        return '<div class="card"><p class="empty">%s</p></div>' % _esc(empty)
    return "".join('<div class="rule-result">%s</div>' % c for c in cards)


def _fmt_num(v) -> str:
    if v is None:
        return "—"
    if isinstance(v, float):
        return "%.4g" % v
    return str(v)


def _shape_of(cell: list) -> str:
    """`diagnose_compute` 回的 [种类, 主长度, 次长度] → 一句人话。"""
    kind, n0, sub = (list(cell) + [None, None])[:3]
    if kind == "标量":
        return "标量 %s" % _fmt_num(n0)
    if kind == "序列":
        if sub:
            return "%d 个分量 × %d 点" % (n0, sub)
        return "%d 点" % n0
    return str(kind)


def diag_card(diag: dict) -> str:
    """「这张图画到哪一步」的逐语句清单：前置条件 → 换算节点 → 每条线。

    为什么默认折叠、**只在有问题时展开**：全对时它就是一屏"✅ 正常"，占了右栏最好的位置；
    而真正要读它的时刻恰恰是"图不对"——那时它自己弹开。
    """
    ok = warn = err = 0
    parts: list[str] = []

    # ① 前置条件：候选组（组内或、组间且）
    rows = []
    for c in diag.get("conditions") or []:
        who = "、".join(c.get("group") or [])
        if c.get("error"):
            err += 1
            rows.append((_esc(who), '<span class="hit">取不到 topic 清单：%s</span>' % _esc(c["error"])))
        elif c.get("ok"):
            ok += 1
            hits = "、".join('%s<span class="cnt">（%d 点）</span>' % (_esc(n), p) for n, p in c["hits"])
            rows.append((_esc(who), "命中 " + hits))
        else:
            warn += 1
            rows.append((_esc(who), '<span class="warn">这一组在日志里都没有</span>'))
    if rows:
        parts.append(_diag_section("① 前置条件（conditions.topics）", rows))

    # ② 换算节点：逐条
    if diag.get("compute"):
        rows = []
        for r in diag["compute"]:
            who = "<code>%s</code>" % _esc(r["stmt"])
            if not r["ok"]:
                err += 1
                rows.append((who, '<span class="hit">算不出来：%s</span>' % _esc(r["err"])))
                continue
            produced = r.get("out") or {}
            if not produced:
                ok += 1
                rows.append((who, '<span class="miss">看不出赋值给谁（不是 `名字 = ...` 的写法）</span>'))
                continue
            cells = []
            bad = False
            for name, cell in produced.items():
                if cell[0] in ("空", "没赋值"):
                    bad = True
                    cells.append('<span class="warn">%s → 没取到输出</span>' % _esc(name))
                else:
                    cells.append("%s → %s" % (_esc(name), _esc(_shape_of(cell))))
            # 「没报错但产出是空」是最该报警的一类：np_series 不会说，图只是变空
            if bad:
                warn += 1
            else:
                ok += 1
            rows.append((who, "、".join(cells)))
        parts.append(_diag_section("② 换算节点（compute，逐条）", rows))
    elif not diag.get("compute_available", True):
        # 引擎内部接口不在 = 这一段**没检**，不是"没问题"。降级要说清楚，别假装全绿
        err += 1
        parts.append(
            '<div class="hint"><span class="warn">② 换算节点没检</span>：引擎内部接口（%s）不在了，'
            "逐条诊断不可用。这是工具与引擎的耦合点，改引擎后要回来修这里。</div>" % _esc("、".join(ENGINE_INTERNALS))
        )

    # ③ 取数：每条线
    for fig in diag.get("figures") or []:
        rows = []
        for ch in fig.get("children") or []:
            if ch.get("error"):
                err += 1
                rows.append(
                    (
                        _esc("、".join(ch.get("labels") or []) or "未命名线"),
                        '<span class="hit">整张图取数失败：%s</span>' % _esc(ch["error"]),
                    )
                )
                continue
            for ln in ch.get("lines") or []:
                if not ln["got"]:
                    warn += 1
                    rows.append((_esc(ln["label"]), '<span class="warn">没取到（这条线是空的）</span>'))
                    continue
                st = ln.get("stats") or {}
                ok += 1
                rows.append(
                    (
                        _esc(ln["label"]),
                        "%s 点 · 最小 %s · 最大 %s · 均值 %s"
                        % (
                            _fmt_num(st.get("n")),
                            _fmt_num(st.get("min")),
                            _fmt_num(st.get("max")),
                            _fmt_num(st.get("mean")),
                        ),
                    )
                )
        if rows:
            parts.append(_diag_section("③ 取数 · %s" % _esc(fig.get("title") or "未命名图"), rows))

    if not parts:
        return ""
    tally = " · ".join(
        s for s in ("%d 项正常" % ok if ok else "", "%d 项警告" % warn if warn else "", "%d 项失败" % err if err else "") if s
    )
    return '<details class="diag"%s><summary>运行清单：%s</summary>%s</details>' % (
        " open" if (warn or err) else "",
        _esc(tally or "没有可检查的语句"),
        "".join(parts),
    )


def _diag_section(title: str, rows: list[tuple[str, str]]) -> str:
    body = "".join('<tr><td class="k">%s</td><td>%s</td></tr>' % (a, b) for a, b in rows)
    return "<h4>%s</h4><table>%s</table>" % (_esc(title), body)


def _charts_body(charts: list[tuple[str, str]], diag: dict | None = None) -> str:
    """右栏正文：运行清单（有诊断时）+ 图。整页渲染与局部刷新共用这一个。"""
    if not charts:
        return '<div class="card"><p class="empty">选一份日志才会画图。</p></div>'
    head = '<div class="card">%s</div>' % diag_card(diag) if diag else ""
    return head + "".join("<h2>%s</h2>%s" % (_esc(t), b) for t, b in charts)


# 保存走 fetch，只替换右栏：整页刷新的话编辑框弹回顶部、光标丢失，左右分栏就白做了。
# 这段是脚本里唯一的 JS，刻意只用原生 API（不引第三方）——见文件头「为什么用 stdlib」。
SPLIT_JS = """
document.addEventListener("submit", async function (ev) {
    var form = ev.target;
    if (!form.dataset.partial) return;           // 只有标了 data-partial 的表单走这条路
    ev.preventDefault();
    var pane = document.getElementById("pane-right");
    pane.innerHTML = '<div class="card"><b>正在跑…</b>'
        + '<div class="hint">写回源文件 → 编译 → 在这份日志上再跑一遍，几秒钟。</div></div>';
    try {
        var res = await fetch(form.action, { method: "POST", body: new FormData(form),
                                             headers: { "X-Partial": "1" } });
        var data = await res.json();
        pane.innerHTML = data.pane;
        if (data.notice) pane.scrollIntoView({ block: "nearest" });
    } catch (err) {
        pane.innerHTML = '<div class="notice"><b>保存失败</b><br/>' + String(err)
            + '<br/>（页面没刷新的话，源文件可能已经改了，自己看 <code>git diff</code>）</div>';
    }
});

/* 元信息 tab：切换纯前端做——所有面板都在 HTML 里，点一下换显示，不刷新页面。
   刷新的话勾选与滚动位置都会丢，而这张页面上"看日志信息"和"勾字段画图"是连着做的 */
document.addEventListener("click", function (ev) {
    var btn = ev.target.closest && ev.target.closest("button.tab");
    if (!btn) return;
    var host = btn.closest(".card");
    if (!host) return;
    var key = btn.dataset.tab;
    host.querySelectorAll("button.tab").forEach(function (b) {
        b.classList.toggle("active", b === btn);
    });
    host.querySelectorAll("section.tab-panel").forEach(function (sec) {
        sec.classList.toggle("active", sec.dataset.panel === key);
    });
});

/* 输入就筛（左栏那个 seek 框）：防抖 350ms，不按回车也要等一下再提交——
   每敲一个字就整页重来，光标会被刷掉，等于没法改错字 */
document.addEventListener("input", function (ev) {
    var el = ev.target;
    if (!(el.dataset && "autosubmit" in el.dataset) || !el.form) return;
    clearTimeout(el._tm);
    el._tm = setTimeout(function () { el.form.submit(); }, 350);
});

/* 元信息块的过滤：data-filter-for 指向一张 tbody 的 id。只翻 tbody 的行——
   连表头一起过滤的话，输入第一个字表头就没了 */
document.addEventListener("input", function (ev) {
    var el = ev.target;
    var id = el.dataset && el.dataset.filterFor;
    if (!id) return;
    var table = document.getElementById(id);
    if (!table || !table.tBodies[0]) return;
    var kw = el.value.trim().toLowerCase();
    var rows = table.tBodies[0].rows;
    for (var i = 0; i < rows.length; i++) {
        rows[i].style.display = (kw === "" || rows[i].textContent.toLowerCase().indexOf(kw) >= 0) ? "" : "none";
    }
});
"""


def split_shell(
    *,
    title: str,
    subtitle: str,
    left: str,
    right: str,
    here: str = "",
    log_arg: str = "",
    head_extra: str = "",
) -> str:
    """左右分栏的页面骨架：顶部导航 + 左栏编辑器（保存时不动）+ 右栏效果（整体替换）。

    三个工具共用这一份——布局各写一份的话，改一处忘了另一处就是
    「同一个工具两种外观」，最后谁都记不清哪个是新的。
    """
    return """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>%(title)s</title>
<style>%(css)s</style></head><body><div class="wrap">
%(nav)s
<h1>%(title)s</h1>
<p class="sub">%(sub)s</p>
%(extra)s
<div class="split">
  <div class="pane-left">%(left)s</div>
  <div class="pane-right"><div id="pane-right" class="scroll-pane">%(right)s</div></div>
</div>
</div>
<script>%(js)s</script>
</body></html>
""" % {
        "css": PAGE_CSS,
        "title": _esc(title),
        "sub": _esc(subtitle),
        "nav": top_nav(here=here, log_arg=log_arg),
        "extra": head_extra,
        "left": left,
        "right": right,
        "js": SPLIT_JS,
    }


def rule_page(
    *,
    source_name: str,
    source_text: str,
    cards: list[str],
    notice: str = "",
    ok_note: str = "",
    file_options: list[str] | None = None,
    log_arg: str = "",
) -> str:
    """规则文件的编辑 + 试跑页：左栏改 YAML，右栏是这个文件里**每条规则**在这份日志上的结论。

    一个文件可能装多条规则（`failsafe.yaml` 6 条），所以右栏是一串卡片而不是一张——
    改一条会牵动同文件其它规则（共用的 group 派生、`order` 次序），只看一条不够。
    """
    cards_html = "".join('<div class="rule-result">%s</div>' % c for c in cards)
    if not cards_html:
        cards_html = '<div class="card"><p class="empty">选一份日志才会跑规则。</p></div>'
    fname = Path(source_name).name
    return split_shell(
        title="调规则 · %s" % fname,
        subtitle="左栏改 YAML，保存 = 写回 %s → 编译 → 右栏把这个文件里装的规则全跑一遍。" % source_name,
        here="rule",
        log_arg=log_arg,
        left=_editor_left(
            action="/rule",
            field="file",
            file_options=file_options or [fname],
            current_file=fname,
            log_arg=log_arg,
            source_name=source_name,
            source_text=source_text,
            hidden='<input type="hidden" name="file" value="%s"/>' % _esc(fname),
        ),
        right=_pane_html(notice=notice, ok_note=ok_note, body=cards_html),
    )


def _option(value: str, label: str, selected: str) -> str:
    return '<option value="%s"%s>%s</option>' % (_esc(value), " selected" if value == selected else "", _esc(label))


def index_page(notice: str = "") -> str:
    """首页：三个工具各一个入口。

    为什么是三个独立页面、不是一个页面塞下所有入口：它们是三件事（看日志 / 调规则 / 调图），
    各自要的状态不同（选中的日志、选中的文件、编辑到一半的内容），挤在一页里会互相盖。
    """
    _rules, why = built_rules()
    rule_files = [p.name for p in rule_source_files()]
    preset_ids = [str(p.get("id") or "") for p in load_presets() if p.get("id")]
    # 入口直接带上第一个文件/预设：点进去就是能干活的状态，不用再在下拉框里挑一次
    rule_href = "/rule?file=%s" % urllib.parse.quote(rule_files[0]) if rule_files else "/rule"
    plot_href = "/plot?id=%s" % urllib.parse.quote(preset_ids[0]) if preset_ids else "/plot"

    tiles = (
        '<a class="tile" href="/ulog"><b>① 看日志（probe ulog）</b>'
        "<span>一份 .ulg 里有哪些 topic、每个 topic 哪些字段、取什么值；勾几个字段直接画出来。</span>"
        "<strong>进入 &rarr;</strong></a>"
        '<a class="tile" href="%s"><b>② 日志 + 规则（rule）</b>'
        "<span>左栏选一份 rules YAML、改完能存回去，右栏看这个文件里装的规则在这份日志上触发了没有</span>"
        "<strong>进入 &rarr;</strong></a>"
        '<a class="tile" href="%s"><b>③ 日志 + 图（plot）</b>'
        "<span>左栏选一份 plot YAML、改完能存回去，右栏看这张图画出来什么样。</span>"
        "<strong>进入 &rarr;</strong></a>"
    ) % (rule_href, plot_href)

    banner = '<div class="notice">%s</div>' % _esc(notice or why) if (notice or why) else ""
    return """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>飞控日志工具</title>
<style>%(css)s</style></head><body><div class="wrap">
<h1>飞控日志工具</h1>
<p class="sub">三个工具都要先选一份 <code>.ulg</code>；② ③ 改完能直接写回
<code>knowledge/</code>，编译不过会自动还原。</p>
%(banner)s
<div class="tiles">%(tiles)s</div>
<div class="card" style="margin-top:16px"><b>要先知道的事</b>
<div class="hint">
日志候选来自 <code>%(logdir)s</code>（目前 %(nlogs)s 份，大的在前）；不在那儿就填页面上的绝对路径框。<br/>
规则与绘图预设读的都是**构建产物**（<code>%(artifact)s</code> / <code>%(plots)s</code>）——
在页面里保存会自动编译，但如果你是在编辑器外面改的 <code>knowledge/</code>，
得先 <code>cd web &amp;&amp; node scripts/build-knowledge.mjs</code>。<br/>
只听 127.0.0.1；解析一份日志要几秒，同一份日志换规则再跑会复用已解析的结果。
</div></div>
</div></body></html>
""" % {
        "css": PAGE_CSS,
        "banner": banner,
        "tiles": tiles,
        "logdir": _esc(LOG_DIR),
        "nlogs": len(discover_logs()),
        "artifact": _esc(ARTIFACT_TS.name),
        "plots": _esc(PLOTS_TS.name),
    }


def serve(port: int = 0, open_browser: bool = True) -> int:
    """起一个临时网页：选日志 + 选规则 → 提交 → 同一页出结论和图。

    用 stdlib 的 `http.server`：为一个本地小工具引第三方依赖不值（这台机器的 Python
    环境已经因为装包坏过一次，见用户级记忆）。
    """
    import http.server
    import urllib.parse
    import webbrowser

    cache: dict[str, tuple[float, dict]] = {}

    def namespace_for(path: Path) -> dict:
        """同一份日志换规则重试时不该重新解析一遍（一份 5MB 日志解析要好几秒）。

        键里带 mtime：日志被换成了同名新文件时要认出来。只留最近 3 份，避免把几份
        大日志的时序一直挂在内存里。第三项是元信息，由 `log_info_for` 惰性填上。
        """
        key, stamp = str(path), path.stat().st_mtime
        hit = cache.get(key)
        if hit and hit[0] == stamp:
            return hit[1]
        ns = build_namespace(path)
        if len(cache) >= 3:
            cache.pop(next(iter(cache)))
        cache[key] = (stamp, ns, None)
        return ns

    def log_info_for(path: Path) -> dict:
        """这份日志的元信息（除时序采样外的全部字段），跟着 namespace 一起缓存。

        实测 96MB 那份：首次 2.0s、复用 0.85s。不缓存的话每翻一个 topic 就多等两秒
        ——右栏每次刷新都要它。
        """
        key, stamp = str(path), path.stat().st_mtime
        hit = cache.get(key)
        if hit and hit[0] == stamp and hit[2] is not None:
            return hit[2]
        ns = namespace_for(path)
        try:
            info = call(ns, "np_log_info()") or {}
        except Exception as exc:  # noqa: BLE001 —— 元信息读不出来不该拖垮整个页面
            return {"_error": "%s: %s" % (type(exc).__name__, exc)}
        if hit and hit[0] == stamp:
            cache[key] = (stamp, ns, info)
        return info

    class Handler(http.server.BaseHTTPRequestHandler):
        server_version = "probe-rule-plot"

        def _reply(self, code: int, text: str, ctype: str = HTML) -> None:
            body = text.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:
            route, _, query = self.path.partition("?")
            picked = urllib.parse.parse_qs(query)
            if route in ("/", ""):
                self._reply(200, index_page())
            elif route == "/ulog":
                self._reply(*self._ulog(picked))
            elif route == "/plot":
                self._reply(*self._plot_edit(picked))
            elif route == "/rule":
                self._reply(*self._rule_edit(picked))
            else:
                self._reply(404, index_page("没有这个地址：%s" % route))

        def do_POST(self) -> None:
            route = self.path.partition("?")[0]
            if route not in ("/plot/save", "/rule/save"):
                self._reply(404, index_page("没有这个地址：%s" % route))
                return
            size = int(self.headers.get("Content-Length") or 0)
            fields = urllib.parse.parse_qs(self.rfile.read(size).decode("utf-8"))
            self._reply(*(self._plot_save(fields) if route == "/plot/save" else self._rule_save(fields)))

        def _draw(self, preset_id: str, log_arg: str) -> tuple[list, str, dict | None]:
            """在选中日志上把预设画出来。返回 (图, 出错时的一句话, 逐语句诊断)。

            诊断**即使一张图都没画出来也要回**——那种时候恰恰是最需要它的时候：
            "没画出图"只说了结果，逐语句清单才说得出是哪一句没跑成。
            """
            if not log_arg:
                return [], "", None
            path = Path(log_arg)
            if not path.is_file():
                return [], "这个路径不是文件：%s" % log_arg, None
            try:
                ns = namespace_for(path)
            except RuntimeError as exc:
                return [], str(exc), None
            except Exception as exc:  # noqa: BLE001
                return [], "引擎起不来（%s: %s）" % (type(exc).__name__, exc), None
            preset = next((p for p in load_presets() if p.get("id") == preset_id), None)
            if preset is None:
                # 预设都找不到就没什么可诊断的：清单会变成一堆"没有可检查的语句"
                return [], "产物里没有 id=%s 这个预设（YAML 里的 id 改过、但文件名没跟着改？）" % preset_id, None
            out = run_preset(ns, preset)
            note = "" if out["charts"] else "这份日志上没画出任何图（看下面的运行清单，哪一句没跑成在里面）"
            return out["charts"], note, out["diag"]

        def _plot_edit(self, fields: dict[str, list[str]]) -> tuple[int, str, str]:
            pid = fields.get("id", [""])[0].strip()
            log_arg = fields.get("log_path", [""])[0].strip() or fields.get("log", [""])[0].strip()
            if not pid:
                # 没指名哪个预设就进第一个：入口卡片就是这么链的，别让他看到一页报错
                first = next((p.get("id") for p in load_presets() if p.get("id")), "")
                if not first:
                    return 200, index_page("读不到绘图预设（产物 %s 里没有）" % PLOTS_TS.name), HTML
                pid = str(first)
            src = plot_source_path(pid)
            if src is None:
                return 200, index_page("没有这个绘图预设：%s（源文件名必须与 id 同名）" % pid), HTML
            charts, err, diag = self._draw(pid, log_arg)
            return (
                200,
                plot_page(
                    preset_id=pid,
                    source_name="knowledge/px4/plot/%s.yml" % pid,
                    source_text=src.read_text(encoding="utf-8"),
                    charts=charts,
                    diag=diag,
                    notice=err,
                    file_options=[p.stem for p in sorted(PLOT_DIR.glob("*.yml"))],
                    log_arg=log_arg,
                ),
                HTML,
            )

        def _plot_save(self, fields: dict[str, list[str]]) -> tuple[int, str, str]:
            pid = fields.get("id", [""])[0].strip()
            text = fields.get("source", [""])[0]
            log_arg = fields.get("log_path", [""])[0].strip() or fields.get("log", [""])[0].strip()
            src = plot_source_path(pid) or (PLOT_DIR / ("%s.yml" % pid))
            if not pid:
                return 400, index_page("少了预设 id"), HTML

            backup = save_knowledge_file(src, text)
            ok, err = compile_knowledge()
            notice, ok_note, charts, diag = "", "", [], None
            if ok:
                ok_note = "编译通过，已写回 %s" % src.name
                charts, draw_err, diag = self._draw(pid, log_arg)
                notice = draw_err
            else:
                # 源文件已经是坏的，先还原再重编译一次，让产物与源重新对齐——
                # 否则 knowledge/ 里留着一个让 pnpm build:kb 红掉的文件
                restore_knowledge_file(backup, src)
                compile_knowledge()
                notice = "%s\n\n（源文件已还原成保存前的样子，备份在 %s；你编辑的内容还在上面的框里）" % (
                    err,
                    backup.name,
                )
            if self.headers.get("X-Partial") == "1":
                return 200, self._pane_json(notice, ok_note, _charts_body(charts, diag)), JSON
            return (
                200,
                plot_page(
                    preset_id=pid,
                    source_name="knowledge/px4/plot/%s.yml" % pid,
                    source_text=text,  # 还原了文件，但编辑框里保留他输入的内容
                    charts=charts,
                    diag=diag,
                    notice=notice,
                    ok_note=ok_note,
                    file_options=[p.stem for p in sorted(PLOT_DIR.glob("*.yml"))],
                    log_arg=log_arg,
                ),
                HTML,
            )

        def _pane_json(self, notice: str, ok_note: str, body: str) -> str:
            """局部刷新的响应体：只有右栏那一块，前端拿到直接塞进 `#pane-right`。"""
            return json.dumps(
                {"pane": _pane_html(notice=notice, ok_note=ok_note, body=body), "notice": bool(notice)},
                ensure_ascii=False,
            )

        def _run_rules(self, src: Path, log_arg: str) -> tuple[list[str], str]:
            """把 `src` 这个文件里装的规则**全跑一遍**，一条规则一张卡片。

            全跑而不只跑一条：改一条会牵动同文件的其它规则（共用的 group 派生、`order`
            次序），只看一条会漏掉"顺手改崩了隔壁"这种情况。
            """
            if not log_arg:
                return [], ""
            path = Path(log_arg)
            if not path.is_file():
                return [], "这个路径不是文件：%s" % log_arg
            try:
                ns = namespace_for(path)
            except RuntimeError as exc:
                return [], str(exc)
            except Exception as exc:  # noqa: BLE001
                return [], "引擎起不来（%s: %s）" % (type(exc).__name__, exc)

            by_id = {r["id"]: r for r in ns["RULES"]}
            ids = rule_ids_in(src)
            cards: list[str] = []
            missing: list[str] = []
            for rid in ids:
                rule = by_id.get(rid)
                if rule is None:
                    # 源里有、产物里没有：多半是这条 id 写错了，或者编译器把整条丢了
                    missing.append(rid)
                    continue
                out = run_probe(ns, rule, quiet=True)
                cards.append(
                    result_card(
                        rule=rule,
                        log_path=path,
                        verdict=out["verdict"],
                        verdict_level=out["level"],
                        problems=out["problems"],
                        variables=out["variables"],
                        trigger_rows=out["trigger_rows"],
                        charts=out["charts"],
                        transcript=out["transcript"],
                        title_tag="h2",
                        collapse_transcript=True,
                    )
                )
            note = ""
            if missing:
                note = "产物里没有这几条（共 %d 条规则）：%s —— id 拼错了？" % (len(by_id), "、".join(missing))
            elif not cards and log_arg:
                note = "这个文件里没解析出任何规则 id（YAML 顶层既不是对象也不是数组？）"
            return cards, note

        def _rule_edit(self, fields: dict[str, list[str]]) -> tuple[int, str, str]:
            name = fields.get("file", [""])[0].strip()
            log_arg = fields.get("log_path", [""])[0].strip() or fields.get("log", [""])[0].strip()
            files = [p.name for p in rule_source_files()]
            if not name:
                if not files:
                    return 200, index_page("读不到规则文件（%s 下没有 .yaml）" % RULES_DIR), HTML
                name = files[0]
            src = rule_source_path(name)
            if src is None:
                return 200, index_page("没有这个规则文件：%s" % name), HTML
            cards, err = self._run_rules(src, log_arg)
            return (
                200,
                rule_page(
                    source_name="knowledge/px4/rules/%s" % src.name,
                    source_text=src.read_text(encoding="utf-8"),
                    cards=cards,
                    notice=err,
                    file_options=files,
                    log_arg=log_arg,
                ),
                HTML,
            )

        def _rule_save(self, fields: dict[str, list[str]]) -> tuple[int, str, str]:
            name = fields.get("file", [""])[0].strip()
            text = fields.get("source", [""])[0]
            log_arg = fields.get("log_path", [""])[0].strip() or fields.get("log", [""])[0].strip()
            if not name:
                return 400, index_page("少了规则文件名"), HTML
            src = rule_source_path(name) or (RULES_DIR / Path(name).name)

            backup = save_knowledge_file(src, text)
            ok, err = compile_knowledge()
            notice, ok_note, cards = "", "", []
            if ok:
                ok_note = "编译通过，已写回 %s" % src.name
                cards, run_err = self._run_rules(src, log_arg)
                notice = run_err
            else:
                restore_knowledge_file(backup, src)
                compile_knowledge()
                notice = "%s\n\n（源文件已还原成保存前的样子，备份在 %s；你编辑的内容还在上面的框里）" % (
                    err,
                    backup.name,
                )
            body = _cards_body(cards, "选一份日志才会跑规则。")
            if self.headers.get("X-Partial") == "1":
                return 200, self._pane_json(notice, ok_note, body), JSON
            return (
                200,
                rule_page(
                    source_name="knowledge/px4/rules/%s" % src.name,
                    source_text=text,  # 还原了文件，但编辑框里保留他输入的内容
                    cards=cards,
                    notice=notice,
                    ok_note=ok_note,
                    file_options=[p.name for p in rule_source_files()],
                    log_arg=log_arg,
                ),
                HTML,
            )

        def _ulog(self, fields: dict[str, list[str]]) -> tuple[int, str, str]:
            """① probe ulog：日志元信息 + topic/字段筛选 + 取值与图。"""
            log_arg = fields.get("log_path", [""])[0].strip() or fields.get("log", [""])[0].strip()
            topic = fields.get("topic", [""])[0].strip()
            filtered = fields.get("q", [""])[0].strip()
            picked = [f for f in fields.get("f", []) if f.strip()]
            page = lambda right: ulog_page(  # noqa: E731 —— 五个分支都要回同一页，只有右栏不同
                log_arg=log_arg,
                entries=entries,
                open_topic=topic,
                picked=picked,
                filtered=filtered,
                right=right,
            )
            entries: list[dict] = []
            if not log_arg:
                return 200, page('<div class="card"><p class="empty">先选一份日志。</p></div>'), HTML
            path = Path(log_arg)
            if not path.is_file():
                return 200, page('<div class="notice">这个路径不是文件：%s</div>' % _esc(log_arg)), HTML
            try:
                ns = namespace_for(path)
            except RuntimeError as exc:
                return 200, index_page(str(exc)), HTML
            except Exception as exc:  # noqa: BLE001
                return 200, index_page("引擎起不来（%s: %s）" % (type(exc).__name__, exc)), HTML
            entries = group_topics(list((call(ns, "np_manifest()") or {}).get("topics") or []))
            # 元信息在图上面：老大要看的就是 msg_info_dict 那一堆，图是它下面的补充
            right = log_info_card(info=log_info_for(path), log_path=path) + ulog_right(ns=ns, log_path=path, picked=picked)
            return 200, page(right), HTML

        def log_message(self, fmt: str, *args) -> None:
            log.info("  %s" % (fmt % args))  # 默认那条写 stderr，跟着别的输出一起看更顺

    with http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler) as httpd:
        host, real_port = httpd.server_address[0], httpd.server_address[1]
        url = "http://%s:%d/" % (host, real_port)
        log.print_header("单条规则体检 · 网页模式", "python tools/dev/workbench.py")
        log.info("  地址：%s" % url)
        log.info("  （只听 127.0.0.1；Ctrl+C 结束）")
        if open_browser:
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            log.info("\n  收到 Ctrl+C，关掉服务。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
