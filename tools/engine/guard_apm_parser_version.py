r"""ArduPilot `.bin` 解析器：解析逻辑变了要升 `parserVersion`。

## 为什么要有它

`.ulg` 侧的解析器版本是环境的指纹（`pyulog/1.2.4`，换台机器就变，所以
`compare_baseline.py` 的 `IGNORED_TOP_KEYS` 把它排除了）。而 `.bin` 侧是自研解析器，
版本串是一个手维护的常量 `apm-bin-parser/1.0.0`（`knowledge/engine/providers/ardupilot.py`
的 `parser_version()`），它跨机器稳定，但代价是：改了解析行为不升版本号，没有任何东西会响。

后果是具体的：报告头写着同一个版本号，而两次解析出来的数含义已经不同；冻结基线比对看到的
是"结论变了"，却分不清是规则改了还是解析器改了。这类静默正是本项目最贵的那类错
（`CLAUDE.md` §6.6：判断本身没有被任何东西检查）。

## 判据

1. 给 `ardupilot.py` 的解析逻辑算一个 AST 指纹（模块级常量表 + `ApmProvider` 的方法体 +
   顶层工厂函数；`parser_version()` 本身排除在外，它正是被检查的对象），与冻结基线比：
   - 指纹变了、`parser_version()` 没变 → 红（改了解析不认账）；
   - 指纹与版本都变了 / 只改了版本 → 红（要求显式重冻基线，防止"随手一改"）。
2. 判空：扫不到文件、解析不出版本串、或指纹覆盖的函数/常量太少，一律红，
   否则文件被改名或搬空之后，第 1 项会因为"没东西可比"而恒绿。
3. 前提还在：这道门得真的挂在 `tools/ci/checklist.yml` 的 push 阶段。
   `check_all.py` 只按清单转发，清单里没它就根本不会跑，而那也是安静的。

指纹用 AST 而不是源码文本：注释、docstring、空行与 ruff 的格式化都不改变 AST，
只有真实的语句/常量变化才变。用文本哈希会把"改一句注释"也报成"解析变了"，那种噪声
会让人直接把守卫关掉。

用法：

    python tools/engine/guard_apm_parser_version.py             # 检查
    python tools/engine/guard_apm_parser_version.py --update    # 确认改动是有意的，重冻基线

输出只用 ASCII 与 GBK 里都有的符号：Windows 控制台默认 GBK。

退出码：任一检查失败则为 1。
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

ROOT = Path(__file__).resolve().parents[2]
PROVIDER = ROOT / "knowledge" / "engine" / "providers" / "ardupilot.py"
BASELINE = Path(__file__).resolve().parent / "apm_parser_baseline.json"
CHECKLIST = ROOT / "tools" / "ci" / "checklist.yml"

# 这道门在 checklist.yml 里的步骤 id，前提检查按它找，改名要两处一起改
STEP_ID = "guard-apm-parser-version"

PROVIDER_CLASS = "ApmProvider"
VERSION_METHOD = "parser_version"

# 判空下限：现在的文件有 10 张模块级常量表、40 余个方法。定在远低于实际值的水平，
# 只为抓住"类被改名 / 文件被搬空"这两种让指纹空转的情形，不给正常重构添堵。
MIN_CONSTS = 5
MIN_FUNCS = 20

UPDATE_CMD = "python tools/engine/guard_apm_parser_version.py --update"


@dataclass
class Scan:
    """一次扫描的结果：版本串、指纹，以及"扫到了多少"（判空用）。"""

    version: str | None = None
    fingerprint: str | None = None
    consts: int = 0
    funcs: int = 0
    problems: list[str] = field(default_factory=list)


def _rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def _is_docstring(stmt: ast.stmt) -> bool:
    return isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, str)


def _body_dump(fn: ast.FunctionDef) -> str:
    """方法体的 AST 摘要（去掉 docstring）。

    用 `ast.Module` 包一层是因为 `ast.dump` 只吃单个节点，而方法体是一个语句列表。
    `include_attributes` 保持默认 False：不带行号，于是纯格式化（ruff format）不改变指纹。
    """
    stmts = [s for s in fn.body if not _is_docstring(s)]
    return ast.dump(ast.Module(body=stmts, type_ignores=[]))


def _scan() -> Scan:
    out = Scan(problems=[])
    if not PROVIDER.is_file():
        out.problems.append(f"{_rel(PROVIDER)} 不存在 —— 解析器被改名/搬走了？那这道守卫就是空转的")
        return out
    try:
        tree = ast.parse(PROVIDER.read_text(encoding="utf-8", errors="replace"))
    except SyntaxError as exc:
        out.problems.append(f"{_rel(PROVIDER)} 语法错误，算不出指纹：{exc}")
        return out

    parts: list[tuple[str, str]] = []
    for node in tree.body:
        if isinstance(node, ast.Assign | ast.AnnAssign):
            parts.append(("const", ast.dump(node)))
            out.consts += 1
        elif isinstance(node, ast.FunctionDef):
            # 顶层工厂（_is_apm / _make_apm）：探测 magic 与构造入口，也算解析行为
            parts.append((f"func:{node.name}", _body_dump(node)))
            out.funcs += 1
        elif isinstance(node, ast.ClassDef) and node.name == PROVIDER_CLASS:
            for item in node.body:
                if not isinstance(item, ast.FunctionDef) or item.name == VERSION_METHOD:
                    continue
                parts.append((f"method:{item.name}", _body_dump(item)))
                out.funcs += 1

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == VERSION_METHOD:
            for stmt in ast.walk(node):
                if isinstance(stmt, ast.Return) and isinstance(stmt.value, ast.Constant):
                    if isinstance(stmt.value.value, str):
                        out.version = stmt.value.value
                        break

    parts.sort()
    blob = "\n".join(f"{key}\t{val}" for key, val in parts)
    out.fingerprint = hashlib.sha256(blob.encode("utf-8")).hexdigest()
    return out


def _load_baseline() -> dict | None:
    if not BASELINE.is_file():
        return None
    try:
        return json.loads(BASELINE.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return {"__broken__": str(exc)}


def check_parser_version_frozen() -> list[str]:
    """解析逻辑变了就要升 `parser_version()`；升了 / 改了都要重冻基线。"""
    scan = _scan()
    if scan.problems:
        return scan.problems

    if scan.version is None:
        return [f"{_rel(PROVIDER)} 里取不到 {VERSION_METHOD}() 返回的版本串 —— 改成非常量返回就没人知道解析器换了"]
    if scan.consts < MIN_CONSTS or scan.funcs < MIN_FUNCS:
        return [
            f"指纹只覆盖了 {scan.consts} 张常量表 / {scan.funcs} 个函数（要求 ≥ {MIN_CONSTS} / ≥ {MIN_FUNCS}）"
            f" —— {PROVIDER_CLASS} 被改名或文件被掏空了，这时候比对是空转的"
        ]

    base = _load_baseline()
    if base is None:
        return [f"{_rel(BASELINE)} 不存在 —— 解析器的版本基线还没冻结，跑 `{UPDATE_CMD}` 冻一份"]
    if "__broken__" in base:
        return [f"{_rel(BASELINE)} 不是合法 JSON：{base['__broken__']}"]

    old_fp, old_ver = base.get("fingerprint"), base.get("version")
    fp_changed = old_fp != scan.fingerprint
    ver_changed = old_ver != scan.version
    if not fp_changed and not ver_changed:
        log.info(f"  {scan.version} · 指纹 {scan.fingerprint[:12]}（{scan.consts} 表 / {scan.funcs} 函数）与基线一致")
        return []

    if fp_changed and not ver_changed:
        return [
            f"解析逻辑变了（指纹 {str(old_fp)[:12]} -> {scan.fingerprint[:12]}），"
            f"但 {VERSION_METHOD}() 还是 {scan.version} —— 改了解析就要升版本，否则报告头看不出解析结果换了；"
            f"升完跑 `{UPDATE_CMD}` 重冻基线"
        ]
    if fp_changed and ver_changed:
        return [f"指纹与版本都变了（{old_ver} -> {scan.version}） —— 确认改动是有意的之后跑 `{UPDATE_CMD}` 重冻基线"]
    return [
        f"只改了版本串（{old_ver} -> {scan.version}）而解析逻辑没变 —— 版本串是解析器的身份，改了就跑 `{UPDATE_CMD}` 重冻基线"
    ]


def check_gate_still_registered() -> list[str]:
    """这道门还在 push 阶段吗。`check_all.py` 只按清单转发，清单里没有它就不会被跑。"""
    if not CHECKLIST.is_file():
        return [f"{_rel(CHECKLIST)} 不存在 —— 「这道门挂在 push 阶段」的前提没了"]
    if STEP_ID not in CHECKLIST.read_text(encoding="utf-8", errors="replace"):
        return [
            f"{_rel(CHECKLIST)} 里找不到步骤 id {STEP_ID!r} —— 这道门被摘掉了；"
            f"check_all.py 只按清单转发，摘掉它就再也没人跑这份检查"
        ]
    return []


CHECKS: list[tuple[str, object]] = [
    ("解析逻辑变了就要升 parserVersion（并重冻基线）", check_parser_version_frozen),
    ("这道门还挂在 push 阶段（checklist.yml 里有这一步）", check_gate_still_registered),
]


def _update() -> int:
    scan = _scan()
    if scan.problems:
        for one in scan.problems:
            log.error(one)
        return 1
    if scan.version is None:
        log.error(f"FAIL 取不到 {VERSION_METHOD}() 的版本串，无法冻结")
        return 1
    payload = {
        "version": scan.version,
        "fingerprint": scan.fingerprint,
        "consts": scan.consts,
        "funcs": scan.funcs,
    }
    BASELINE.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log.info(f"OK frozen {_rel(BASELINE)}: {scan.version} · {scan.fingerprint[:12]}（{scan.consts} 表 / {scan.funcs} 函数）")
    return 0


def main(argv: list[str]) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--update", action="store_true", help="确认改动是有意的，重冻版本基线")
    args = ap.parse_args(argv[1:])
    if args.update:
        return _update()

    log.print_header("ArduPilot 解析器版本守卫")

    failed: list[str] = []
    results: list[tuple[str, str]] = []
    for i, (name, fn) in enumerate(CHECKS, 1):
        problems = fn()  # type: ignore[operator]
        ok = len(problems) == 0
        if ok:
            log.print_check(i, len(CHECKS), name, True)
        else:
            # 这一行的格式有意义：`FAIL <名字>  -> <一句话>` 是 tools/ci/mutate_guards.py
            # 从输出里数"红了几条"的依据，名字要与注册表里的 expect 逐字一致。
            one_line = f"FAIL {name}  -> {problems[0]}" + (f"（共 {len(problems)} 处）" if len(problems) > 1 else "")
            log.print_check(i, len(CHECKS), name, False, detail=one_line, err="\n".join(problems))
            failed.append(name)
        results.append((name, "ok" if ok else "fail"))

    return log.print_summary(results, [])


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
