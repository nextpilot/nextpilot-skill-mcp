"""校验**生成产物**（web/workers/ulog-check-script.ts）能被当作合法 Python 执行。

为什么需要它：本地回归跑的是 engine/ 下的源文件，而浏览器里跑的是构建产物
（operators.py + ulog_checks.py 经 String.raw 内联 + __FAULT_KB__/__RULES__
三处替换）。只有这一步能证明"真正进 Pyodide 的东西"是合法的——否则语法错误只能在
用户浏览器里炸出来。

四道检查，从松到紧：语法 → `.replace` 链按浏览器语义（只换第一处）复现 → compute
表达式 Python 侧可解析 → **真执行**（含"worker 守卫查的全局名真的存在"）。

用法：python tools/calibrate/check-artifact.py
"""

from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

# 数据配置的装配规则与本地回归共用一处（facts.yaml + plot/track.yml）——
# 别在这里再手写一遍，两边不一致时本地跑得出、浏览器跑不出。
sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_checks_locally as runner  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
TS = REPO_ROOT / "web" / "workers" / "ulog-check-script.ts"
FAULT_KB = REPO_ROOT / "web" / "workers" / "fault-kb.generated.json"


def extract_json_const(src: str, name: str):
    """取出构建脚本写入的 `const <name> = <json>;`（JSON.stringify 产物，可直接 json.loads）。"""
    m = re.search(rf"^const {name} = (.*?);$", src, re.M | re.S)
    if not m:
        raise SystemExit(f"生成产物里找不到 const {name} = ...")
    return json.loads(m.group(1))


def main() -> int:
    src = TS.read_text(encoding="utf-8")
    m = re.search(r"String\.raw`(.*)`\n", src, re.S)
    if not m:
        raise SystemExit("生成产物里找不到 String.raw 模板")
    body = m.group(1)

    # 占位符**应当**留在模板里：由生成文件里的 .replace(...) 链在模块加载时替换。
    # 这里校验那条替换链覆盖了全部占位符，再复现替换结果验证是合法 Python。
    replaces = re.findall(r'\.replace\("(__[A-Z_]+__)"', src)
    # 模板里出现的占位符必须都被 .replace 链覆盖（阈值占位符已随 px4-thresholds.toml 退场）
    in_template = set(re.findall(r"(__[A-Z_]+__)", body))
    missing = in_template - set(replaces)
    if missing:
        raise SystemExit(f"生成产物的 .replace 链缺占位符：{sorted(missing)}")

    # 浏览器端的替换链是 JS 的 String.replace——**只换第一处**；上面"覆盖了"的存在性检查
    # 抓不住同一占位符出现多次的情况。2026-09-17 的 NameError 就是这么漏的：providers/px4.py
    # 的注释里提了一句 `__FACTS__`，浏览器第一处被注释吃掉、真正的赋值行原样进 Pyodide；
    # 而本地回归与下面的复现都用 Python 的 str.replace（全换）→ 本地全绿、线上打不开。
    # 这里按浏览器语义复现一遍：每个占位符只换第一处（第三参 1 对齐 JS 行为），
    # 换完不允许再有任何占位符残留。
    first_only = body
    for tok in replaces:
        first_only = first_only.replace(tok, "null", 1)
    leftover = set(re.findall(r"(__[A-Z_]+__)", first_only))
    if leftover:
        raise SystemExit(
            f"占位符在模板里出现了多次，浏览器只换第一处会漏掉真正的赋值行（NameError）：{sorted(leftover)}；"
            "把 engine/ 注释里提到占位符原文的地方改个说法，或查 build-knowledge.mjs 的拼接输入"
        )

    # .replace 链里引用的名字必须已在产物里声明（const X = ... / import X from ...）。
    # 踩过：加了 .replace("__FACTS__", JSON.stringify(facts)) 却忘了 const facts = ...，
    # 语法检查与"复现替换"都发现不了（这里自己代填占位符），但浏览器一加载就 ReferenceError。
    declared = set(re.findall(r"^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)", src, re.M))
    declared |= set(re.findall(r"^\s*import\s+([A-Za-z_$][\w$]*)\s+from", src, re.M))
    used: set[str] = set()
    for arg in re.findall(r'\.replace\("[A-Z_]+__",\s*([^)]+)\)', src):
        # 去掉属性访问（faultKbJson.entries → 只留 faultKbJson），否则把属性名当变量名
        head = re.sub(r"\.\s*[A-Za-z_$][\w$]*", "", arg)
        used |= set(re.findall(r"[A-Za-z_$][\w$]*", head)) - {"JSON", "stringify"}
    missing_names = sorted(used - declared)
    if missing_names:
        raise SystemExit(f"生成产物的 .replace 链引用了未声明的名字：{missing_names}")

    # 用真实取值复现最终 Python 源码
    final = body
    final = final.replace("__FAULT_KB__", repr(json.loads(FAULT_KB.read_text(encoding="utf-8"))["entries"]))
    final = final.replace("__RULES__", json.dumps(extract_json_const(src, "rules"), ensure_ascii=False))
    # 数据配置同样在 .replace 链里；它的装配规则（facts.yaml + plot/track.yml）与本地回归共用一处
    final = final.replace("__FACTS__", json.dumps(runner.load_facts_payload(), ensure_ascii=False))
    # 字段单位表（ref(..., unit=) 的源单位）同样从产物里取，与本地回归共用一处
    final = final.replace("__FIELD_UNITS__", json.dumps(runner.load_field_units(), ensure_ascii=False))

    try:
        ast.parse(final)
    except SyntaxError as e:
        print(f"生成产物不是合法 Python：{e}")
        print("  " + "\n  ".join(final.splitlines()[max(0, (e.lineno or 1) - 2) : (e.lineno or 1) + 1]))
        return 1

    rules = extract_json_const(src, "rules")
    print(f"产物语法检查通过：{len(final.splitlines())} 行，含 {len(rules)} 条经验规则")

    # compute 表达式是**构建期用 JS 校验**（web/scripts/lib/rule-expr.mjs）、**运行期用 Python
    # ast 求值**的。两侧是两套实现，中间就有缝：JS 放行而 Python 解析不了的写法会构建通过、
    # 到用户浏览器里才炸。这里用 Python 自己把每条表达式解析一遍，把缝焊上。
    n_expr = 0
    for r in rules:
        for expr in r.get("compute") or []:
            n_expr += 1
            try:
                tree = ast.parse(expr, mode="exec")
            except SyntaxError as e:
                print(f"规则 {r['id']} 的 compute 表达式不是合法 Python：{e}\n    {expr}")
                return 1
            if len(tree.body) != 1 or not isinstance(tree.body[0], ast.Assign):
                print(f"规则 {r['id']} 的 compute 不是一条赋值：{expr}")
                return 1
    print(f"compute 表达式检查通过：{n_expr} 条，Python 侧都能解析")

    # 仅语法检查不够：NameError / KeyError 这类只有**真执行**才暴露
    # （曾漏掉"operators.py 没被内联"导致 Pyodide 里 OPERATORS 未定义）。
    data_ts = (REPO_ROOT / "web" / "workers" / "ulog-data-script.ts").read_text(encoding="utf-8")
    m2 = re.search(r"String\.raw`(.*)`;", data_ts, re.S)
    if not m2:
        raise SystemExit("数据层产物里找不到 String.raw 模板")
    logs = sorted((Path(__file__).resolve().parent / "logs").glob("*.ulg"), key=lambda p: p.stat().st_size)
    if not logs:
        print("（没有回归日志，跳过执行检查）")
        return 0
    log = logs[0]
    ns: dict = {"ulog_bytes": log.read_bytes()}
    try:
        exec(compile(final + "\n" + m2.group(1), "<artifact>", "exec"), ns)
        # 判定产物走具名入口（np_report 把结果摆到 __result）；以前靠"执行脚本的副作用"留下
        ns["np_report"]()
        result = json.loads(ns["__result"])
    except Exception as e:  # noqa: BLE001
        print(f"产物执行失败（{log.name}）：{type(e).__name__}: {e}")
        import traceback

        traceback.print_exc(limit=3)
        return 1
    print(
        f"产物执行检查通过：{log.name} → findings={len(result.get('findings', []))}, "
        f"checksRun={len(result.get('checksRun', []))}, tags={result.get('tags')}"
    )

    # 「产物跑得通」不等于「worker 问得到东西」：worker 是拿**名字**去这个命名空间里取的
    # （pyodide.globals.get("...")），名字写错了守卫就恒真/恒假，语法与执行检查都看不见。
    # 2026-09-18 线上就栽在这：ulog-worker.ts 的守卫写的是 globals.get("ulog")，
    # 而产物里从来没有名为 `ulog` 的全局（bootstrap 那行是 `provider = open_log(...)`，
    # `from pyulog import ULog` 只带来 `ULog`）——于是守卫恒真，track/series 请求**永远**
    # 被判成"这份日志没解析过"：轨迹画不出来、也从没进过存档，界面还一直叫用户重选文件。
    # 名字对不对，只有拿真执行出来的命名空间核一遍才算数。
    worker_src = (REPO_ROOT / "web" / "workers" / "ulog-worker.ts").read_text(encoding="utf-8")
    asked = sorted(set(re.findall(r'globals\.get\("([A-Za-z_$][\w$]*)"\)', worker_src)))
    set_by_worker = set(re.findall(r'globals\.set\("([A-Za-z_$][\w$]*)"', worker_src))
    # 按 worker 的顺序把入口都调一遍：`__result` 是入口函数内部 `global __result` 摆出来的，
    # 只 exec 不调用时它并不存在——直接核名字会把 `__result` 误判成不存在的名字。
    produced: dict[str, object] = {}
    for entry in ("np_report", "np_manifest", "np_log_info", "np_track"):
        if entry not in ns:
            continue
        ns[entry]()
        produced[entry] = json.loads(ns["__result"])
    unknown = [n for n in asked if n not in ns and n not in set_by_worker]
    if unknown:
        available = sorted(k for k in ns if not k.startswith("__"))
        print(f"worker 查的全局名在产物命名空间里不存在：{unknown}")
        print(f"  产物里真实存在的顶层名字：{available}")
        print("  这种守卫恒真/恒假：要么取数据永远失败，要么静默拿到另一份日志的数据")
        return 1
    track_n = len((produced.get("np_track") or {}).get("tracks") or [])  # type: ignore[union-attr]
    print(f"worker 守卫的全局名核对通过：{asked}（np_track 跑出 {track_n} 条轨迹）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
