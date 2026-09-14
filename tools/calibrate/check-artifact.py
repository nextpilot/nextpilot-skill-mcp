"""校验**生成产物**（web/workers/ulog-check-script.ts）能被当作合法 Python 执行。

为什么需要它：本地回归跑的是 knowledge/ 下的源文件，而浏览器里跑的是构建产物
（operators.py + ulog_checks.py 经 String.raw 内联 + __FAULT_KB__/__THRESHOLDS__/__RULES__
三处替换）。只有这一步能证明"真正进 Pyodide 的东西"是合法的——否则语法错误只能在
用户浏览器里炸出来。

用法：python tools/calibrate/check-artifact.py
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

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
    missing = {"__FAULT_KB__", "__THRESHOLDS__", "__RULES__"} - set(replaces)
    if missing:
        raise SystemExit(f"生成产物的 .replace 链缺占位符：{sorted(missing)}")

    # 用真实取值复现最终 Python 源码
    final = body
    final = final.replace("__FAULT_KB__", repr(json.loads(FAULT_KB.read_text(encoding="utf-8"))["entries"]))
    final = final.replace("__THRESHOLDS__", json.dumps(extract_json_const(src, "thresholds"), ensure_ascii=False))
    final = final.replace("__RULES__", json.dumps(extract_json_const(src, "rules"), ensure_ascii=False))

    try:
        ast.parse(final)
    except SyntaxError as e:
        print(f"生成产物不是合法 Python：{e}")
        print("  " + "\n  ".join(final.splitlines()[max(0, (e.lineno or 1) - 2) : (e.lineno or 1) + 1]))
        return 1

    rules = extract_json_const(src, "rules")
    print(f"产物语法检查通过：{len(final.splitlines())} 行，含 {len(rules)} 条经验规则")

    # 仅语法检查不够：NameError / KeyError 这类只有**真执行**才暴露
    # （曾漏掉"operators.py 没被内联"导致 Pyodide 里 OPERATORS 未定义）。
    data_ts = (REPO_ROOT / "web" / "workers" / "ulog-data-script.ts").read_text(encoding="utf-8")
    m2 = re.search(r"String\.raw`(.*)`;", data_ts, re.S)
    if not m2:
        raise SystemExit("数据层产物里找不到 String.raw 模板")
    logs = sorted((REPO_ROOT / "engine" / "tests" / "logs").glob("*.ulg"), key=lambda p: p.stat().st_size)
    if not logs:
        print("（没有回归日志，跳过执行检查）")
        return 0
    log = logs[0]
    ns: dict = {"ulog_bytes": log.read_bytes()}
    try:
        exec(compile(final + "\n" + m2.group(1), "<artifact>", "exec"), ns)
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
