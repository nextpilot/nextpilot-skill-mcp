r"""`engine/` 必须是**纯 Python** —— 不许碰 Pyodide / JS 桥接 / 浏览器全局。

## 为什么要有它

`engine/` 是「一份源码、三个运行时」共用：

- **浏览器**：`web/scripts/build-knowledge.mjs` 把 `operators.py` / `providers/*.py` /
  `rule_engine.py` 拼成一段 Python 字符串，内联进 `web/workers/ulog-check-script.ts`，
  在 Pyodide 里跑（日志不出设备，所以只能这样）；
- **本机**：`tools/calibrate/` 直接把 `engine/` 指进 `sys.path`，用 CPython 跑同一份；
- **将来**：独立后端进程也打算复用这一份。

三处共用的前提，就是它**不含任何只在一个运行时里成立的东西**。而这个前提此前没人看着：
为调试在 `engine/` 里写一行 `js.console.log(...)`，浏览器能跑（`js` 是 Pyodide 注入的全局），
本机 `tools/calibrate/` 立刻 `NameError` —— 而且只在**跑到那一行**时才炸，没跑到的路径上
一直看不出来。

## 判据

1. `engine/**/*.py` 的**代码**里（注释与 docstring 剥掉之后）不出现 Pyodide / JS 桥接 /
   浏览器全局。**剥注释是必须的**：本仓库习惯把"为什么"写进注释，注释里会原样复述这些
   标识符；不剥掉的话，把规则本身写进注释就能让检查恒绿（2026-09-18 在别处连踩两次）。
2. 同时断言**真的扫到了文件** —— `engine/` 被搬空或改名时，第 1 项会因为没东西可扫而恒绿。
3. 同时断言**三处共用的前提还在**：浏览器仍把 `engine/` 拼进 Pyodide 产物、本机校准工具
   仍直接指到 `engine/`。哪天只剩一个消费者，"纯 Python"这条约束就失去了意义——
   规则不该在失去意义之后还安静地绿着（`CLAUDE.md` §6.6）。

## 判据的分寸：别用裸子串

`window` / `navigator` 在飞控语境里会**正常**出现（滚动窗口、PX4 的 Navigator 模块）。
所以：

- `window` / `document` 要的是「**后面跟点的全局引用**」，且前面不能是别的标识符
  （`self.window.size` 是属性，不是浏览器全局）；
- `navigator` **整个不查** —— PX4 有 Navigator 模块，误报的代价大于漏报。

同理 `\bimport\s+js\b` 必须带词边界：否则 `import json` 会被当成 `import js`
（第一次 grep 就误命中过）。

输出只用 ASCII 与 GBK 里都有的符号（`OK` / `FAIL` / `SKIP` / `·`）：
Windows 控制台默认 GBK，`✓ ✗ ▶` 这类字符会直接 UnicodeEncodeError 崩掉脚本。

用法：
  python tools/ci/check_engine_purity.py

退出码：任一检查失败则为 1。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "engine"

# 注释 / docstring 的剥离复用卫生检查里那份：两边用同一套语义，
# 免得"什么叫代码"出现第二个答案（那正是裸子串守卫被注释喂饱的根因）。
sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_hygiene import py_code_only  # noqa: E402

# ---------------------------------------------------------------------------
# 1. engine/ 里不许出现的东西
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
]

# 至少得扫到这么多 .py，少一个说明目录被搬空了（`engine/` 现有 6 个文件）
MIN_SCANNED = 3


def _engine_files() -> list[Path]:
    return sorted(p for p in ENGINE.rglob("*.py") if p.is_file() and "__pycache__" not in p.parts)


def _rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def check_engine_is_pure_python() -> list[str]:
    problems: list[str] = []
    files = _engine_files()
    # 防"恒绿"：没扫到东西时规则是真空转的（目录被改名/搬空都会这样），必须当场说，
    # 而不是安静地报"0 处违规"给人一个假的安全感。
    if len(files) < MIN_SCANNED:
        problems.append(
            f"engine/ 下只找到 {len(files)} 个 .py（要求 ≥ {MIN_SCANNED}） —— 目录被搬空/改名了？那这条规则就是真空转的"
        )
        return problems

    for path in files:
        code = py_code_only(path.read_text(encoding="utf-8", errors="replace"))
        for lineno, line in enumerate(code.splitlines(), 1):
            for pattern, why in FORBIDDEN:
                if re.search(pattern, line):
                    problems.append(
                        f"{_rel(path)} 出现 {why} —— {line.strip()[:80]}"
                        f"\n        engine/ 是浏览器（Pyodide）、本机 tools/calibrate 与将来的服务端"
                        f"三处共用的一份源码，不能含只在一个运行时里成立的东西"
                    )
    if not problems:
        log.info(f"  {len(files)} 个 .py，0 处 Pyodide / JS 桥接 / 浏览器全局")
    return problems


# ---------------------------------------------------------------------------
# 2. 前提还在：engine/ 确实被三处共用
#
# 光有第 1 项不够——如果哪天浏览器不再内联 engine/、本机工具也不再直接指过去，
# "纯 Python"就只剩"写得干净"这一层意义了。那时候这条规则该被删掉，而不是继续绿着。
# ---------------------------------------------------------------------------

BROWSER_MARKER = ("web/scripts/build-knowledge.mjs", 'resolve(webRoot, "../engine")')
LOCAL_MARKER = ("tools/calibrate/run_checks_locally.py", 'REPO_ROOT / "engine"')


def check_sharing_premise_alive() -> list[str]:
    problems: list[str] = []
    for rel, marker in (BROWSER_MARKER, LOCAL_MARKER):
        path = ROOT / rel
        if not path.is_file():
            problems.append(f"{rel} 不存在 —— 「engine/ 三处共用」的一个消费者不见了")
            continue
        if marker not in path.read_text(encoding="utf-8", errors="replace"):
            problems.append(
                f"{rel} 里找不到 {marker!r} —— 它不再引用 engine/ 了；这条规则的前提（一份源码多处共用）需要重新确认"
            )
    return problems


# ---------------------------------------------------------------------------

CHECKS: list[tuple[str, object]] = [
    ("engine/ 是纯 Python（不碰 Pyodide / JS 桥接 / 浏览器全局）", check_engine_is_pure_python),
    ("engine/ 仍被浏览器与本机共用（纯 Python 的前提还在）", check_sharing_premise_alive),
]


def main(argv: list[str]) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)  # 与 check_all.py 同理：重定向时不与子进程输出交错

    log.info("=== engine/ 纯 Python 守卫 ===")
    failed: list[str] = []
    for name, fn in CHECKS:
        log.info(f"\n· {name}")
        problems = fn()  # type: ignore[operator]
        if problems:
            # 这一行的格式有意义：`FAIL <名字>  -> <一句话>` 是 tools/ci/mutate_guards.py
            # 从输出里数"红了几条"的依据，名字要与注册表里的 expect 逐字一致。
            log.error(f"FAIL {name}  -> {problems[0]}" + (f"（共 {len(problems)} 处）" if len(problems) > 1 else ""))
            for one in problems:
                log.error(f"      {one}")
            failed.append(name)
        else:
            log.info(f"OK {name}")

    log.info("\n=== 汇总 ===")
    for name, _ in CHECKS:
        log.info(f"  {'FAIL' if name in failed else 'OK  '} {name}")
    if failed:
        # 这句**不能**写成 `FAIL <名字>` 的形状：tools/ci/mutate_guards.py 逐行取
        # "FAIL 后面的东西"当检查名，那句总结会被它当成一条检查名，
        # 于是每条变异都多报一次"牵连"。
        log.error(f"\n{len(failed)} 项未过 —— 逐项看上面的输出。")
        return 1
    log.info(f"\nOK 全部通过（{len(CHECKS)} 项）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))