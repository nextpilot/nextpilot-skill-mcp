r"""`knowledge/engine/` 要是纯 Python，不碰 Pyodide / JS 桥接 / 浏览器全局。

## 为什么要有它

`knowledge/engine/` 是「一份源码、三个运行时」共用：浏览器经
`web/scripts/build-knowledge.mjs` 把它拼成 Python 字符串内联进
`web/workers/analysis-engine.generated.ts` 在 Pyodide 里跑（日志不出设备）；本机
`tools/calibrate/` 把它指进 `sys.path` 用 CPython 跑；将来独立后端也复用这一份。

前提是它不含任何只在一个运行时里成立的东西。此前没人看着：写一行
`js.console.log(...)`，浏览器能跑（`js` 是 Pyodide 注入的全局），本机立刻
`NameError`，而且只在跑到那行时才炸，没跑到的路径上一直看不出来。

## 判据

1. `knowledge/engine/**/*.py` 的代码里（剥掉注释与 docstring 后）不出现 Pyodide /
   JS 桥接 / 浏览器全局。剥注释是必要的：注释里会原样复述这些标识符，不剥的话
   把规则写进注释就能让检查恒绿。
2. 断言真的扫到了文件：目录被搬空或改名时，第 1 项会因没东西可扫而恒绿。
3. 断言三处共用的前提还在：浏览器仍把它拼进 Pyodide 产物、本机校准工具仍直接指
   过去。只剩一个消费者时"纯 Python"就失去意义，规则不该还安静地绿着
   （`CLAUDE.md` §6.6）。

## 判据的分寸：别用裸子串

`window` / `navigator` 在飞控语境里会正常出现（滚动窗口、PX4 的 Navigator 模块）：

- `window` / `document` 要的是「后面跟点的全局引用」，且前面不能是别的标识符
  （`self.window.size` 是属性）；
- `navigator` 整个不查：PX4 有 Navigator 模块，误报代价大于漏报。

同理 `\bimport\s+js\b` 得带词边界，否则 `import json` 会被当成 `import js`。

输出只用 ASCII 与 GBK 里都有的符号（`OK` / `FAIL` / `SKIP` / `·`）：Windows 控制台
默认 GBK，`✓ ✗ ▶` 这类字符会 UnicodeEncodeError 崩掉脚本。

用法：python tools/engine/check_engine_purity.py；任一检查失败退出码为 1。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "knowledge" / "engine"

# 复核卫生检查里那份剥离实现：两边用同一套"什么叫代码"的语义。
sys.path.insert(0, str(ROOT / "tools" / "common"))
from check_hygiene import py_code_only  # noqa: E402

# ---------------------------------------------------------------------------
# 1. knowledge/engine/ 里不许出现的东西
# ---------------------------------------------------------------------------

FORBIDDEN: list[tuple[str, str]] = [
    (r"\bimport\s+js\b", "引入 Pyodide 注入的 js 模块"),
    (r"\bfrom\s+js\b", "从 Pyodide 的 js 模块导入"),
    (r"\b(?:import|from)\s+pyodide\b", "引入 pyodide"),
    (r"\b(?:import|from)\s+micropip\b", "引入 micropip"),
    (r"(?<![\w.])js\s*\.", "调 Pyodide 的 JS 桥接（js.xxx）"),
    (r"(?<![\w.])pyodide\s*\.", "调 pyodide.xxx"),
    (r"\bto_js\b", "Pyodide 的 to_js（把 Python 对象转成 JS）"),
    (r"\bcreate_proxy\b", "Pyodide 的 create_proxy（JS 回调桥接）"),
    (r"\bJsProxy\b", "Pyodide 的 JsProxy"),
    (r"__EMSCRIPTEN__", "只在 Emscripten（浏览器 WASM）下成立的分支"),
    (r"\bemscripten\b", "Emscripten 专有分支"),
    (r"(?<![\w.])window\s*\.", "浏览器全局 window"),
    (r"(?<![\w.])document\s*\.", "浏览器全局 document"),
    (r"\blocalStorage\b", "浏览器全局 localStorage"),
    (r"\bsessionStorage\b", "浏览器全局 sessionStorage"),
    # --- 文件 / 网络 / 子进程 IO（审计 M14）：Pyodide 无本地文件系统与套接字，
    # 这些调用"本机能跑、上线必炸"。open 前排除引号（CEL 负向用例里
    # 'open("x")' 是字符串字面量）；open_log( 因 _ 是词字符而不匹配。
    (r"(?<![\w.'\"])\bopen\s*\(", "文件 IO（open()）——Pyodide 无本地文件系统"),
    (
        r"\b(?:import|from)\s+(?:requests|socket|urllib|http|httpx|ftplib|smtplib|shutil|subprocess|asyncio)\b",
        "网络 / 子进程 / 文件系统 / 事件循环模块——Pyodide 里不可用或无意义",
    ),
    (r"__import__", "动态 import（绕过上面 import 守卫的通道）"),
]

# 少于此数说明目录被搬空了（`knowledge/engine/` 现有 6 个文件）
MIN_SCANNED = 3


def _engine_files() -> list[Path]:
    # tests/ 只在本机 pytest 里跑，不属于「三处共用」的运行时面；其用例会合法地以
    # 字符串字面量出现 open("x") / "import os" 这类被禁形态（CEL 负向用例）。
    return sorted(p for p in ENGINE.rglob("*.py") if p.is_file() and "__pycache__" not in p.parts and "tests" not in p.parts)


def _rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def check_engine_is_pure_python() -> list[str]:
    problems: list[str] = []
    files = _engine_files()
    # 防"恒绿"：没扫到东西时规则是真空转的，得当场说，而不是安静地报"0 处违规"。
    if len(files) < MIN_SCANNED:
        problems.append(
            f"knowledge/engine/ 下只找到 {len(files)} 个 .py（要求 ≥ {MIN_SCANNED}） —— 目录被搬空/改名了？那这条规则就是真空转的"
        )
        return problems

    for path in files:
        code = py_code_only(path.read_text(encoding="utf-8", errors="replace"))
        for lineno, line in enumerate(code.splitlines(), 1):
            for pattern, why in FORBIDDEN:
                if re.search(pattern, line):
                    problems.append(
                        f"{_rel(path)} 出现 {why} —— {line.strip()[:80]}"
                        f"\n        knowledge/engine/ 是浏览器（Pyodide）、本机 tools/calibrate 与将来的服务端"
                        f"三处共用的一份源码，不能含只在一个运行时里成立的东西"
                    )
    if not problems:
        log.info(f"  {len(files)} 个 .py，0 处 Pyodide / JS 桥接 / 浏览器全局")
    return problems


# 2. 前提还在：knowledge/engine/ 确实被多处共用。哪天只剩一个消费者，"纯 Python"
# 就只剩"写得干净"这一层意义，规则该被删掉而不是继续绿着。

BROWSER_MARKER = ("web/scripts/build-knowledge.mjs", 'resolve(webRoot, "../knowledge/engine")')
# 本机侧锚点是装配入口本身（runner 与 server 都经它取引擎），不是薄转发层 runner。
LOCAL_MARKER = ("knowledge/engine/loader.py", "ENGINE = Path(__file__).resolve().parent")


def check_sharing_premise_alive() -> list[str]:
    problems: list[str] = []
    for rel, marker in (BROWSER_MARKER, LOCAL_MARKER):
        path = ROOT / rel
        if not path.is_file():
            problems.append(f"{rel} 不存在 —— 「knowledge/engine/ 三处共用」的一个消费者不见了")
            continue
        if marker not in path.read_text(encoding="utf-8", errors="replace"):
            problems.append(
                f"{rel} 里找不到 {marker!r} —— 它不再引用 knowledge/engine/ 了；这条规则的前提（一份源码多处共用）需要重新确认"
            )
    return problems


CHECKS: list[tuple[str, object]] = [
    ("knowledge/engine/ 是纯 Python（不碰 Pyodide / JS 桥接 / 浏览器全局）", check_engine_is_pure_python),
    ("knowledge/engine/ 仍被浏览器与本机共用（纯 Python 的前提还在）", check_sharing_premise_alive),
]


def main(argv: list[str]) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)  # 与 check_all.py 同理：重定向时不与子进程输出交错

    log.print_header("knowledge/engine/ 纯 Python 守卫")

    failed: list[str] = []
    results: list[tuple[str, str]] = []
    for i, (name, fn) in enumerate(CHECKS, 1):
        problems = fn()  # type: ignore[operator]
        ok = len(problems) == 0
        if ok:
            log.print_check(i, len(CHECKS), name, True)
        else:
            # 格式有意义：tools/ci/mutate_guards.py 靠 `FAIL <名字>  -> <一句话>` 数
            # "红了几条"，名字要与注册表里的 expect 逐字一致。
            one_line = f"FAIL {name}  -> {problems[0]}" + (f"（共 {len(problems)} 处）" if len(problems) > 1 else "")
            log.print_check(i, len(CHECKS), name, False, detail=one_line, err="\n".join(problems))
            failed.append(name)
        results.append((name, "ok" if ok else "fail"))

    return log.print_summary(results, [])


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
