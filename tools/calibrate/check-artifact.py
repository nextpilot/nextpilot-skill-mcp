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
    print(f"生成产物体检通过：合法 Python，{len(final.splitlines())} 行，含 {len(rules)} 条经验规则")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
