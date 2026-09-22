"""校验机制**自身**的卫生：四处「不会报错的裂缝」。

这四项不是"再查一遍代码"，而是查**我们用来查代码的那套东西**有没有说谎。前三项全是
2026-09-18 那天真实踩出来的，共同点出奇地一致：坏掉的时候**没有任何输出**。

| 检查 | 拦什么 | 那天的现场 |
| --- | --- | --- |
| 悬空 § 引用 | 注释里写"见 CLAUDE.md §6.8"，而那一节不存在 | 5 处注释指向 §6.8，而 §6.8 是那天才补上的——读者按图索骥，翻到的是一页空白 |
| 产物新鲜度不许用 git 当判据 | 判据落在"git 工作区是否干净" | 门拿 `git diff` 跟 HEAD 比，把**人正常的手写文案**判成"与源码漂移"（作者只好回一句"是我手动修改的"） |
| 打了 FAIL/ERROR 就要能非零退出 | 打印了红字，退出码却是 0 | `--probe-data` 对 6 份日志**全部**打 `ERROR`，最后报 `OK`；`series` 那一路早已不在检，没人知道 |
| hook 不从阶段列表反推开关 | 开关被"再推导一次"，于是永远开不着 | `.githooks/pre-push` 用 `with_e2e and "ci" not in stages` 决定加不加 `--with-e2e`，而 E2E 步骤就住在 ci 里 → **每条路径都不成立**，`WITH_E2E=1` 静默不跑 E2E |

为什么值得单独一个脚本：这几条**都不会自己报错**。悬空引用是人读到才发现；误报会让人
去改没坏的东西；吞掉的失败则连"有人在看"这个前提都不成立；开关没传则看着像跑了实则没跑。
它们全靠人当时记得——而人会忘。所以把判据固化成可以重跑的检查（见 `CLAUDE.md` §6.6）。

## 判据

四类裂缝，落成 6 项检查（后两项分别是"防目标消失"与"动态补静态之不足"）：

1. **§ 引用必须有落点。** 解析顺序：引用的同一行如果**点名了某份文档** → 只在那份文档里找
   （最常见的是 `见 CLAUDE.md §6.4`，取离引用**最近**的那个名字，不是行内第一个）；否则本文档
   是编号文档就**只在本文档里找**；都不是才退到全局（root `CLAUDE.md` + 任一编号文档）。
   某份文件算不算"编号文档"由它**自己**的标题决定（≥3 个编号标题 + 只有 `.md` / `.mdx` 才算数），
   不维护名单——名单会过期，标题不会。
2. **产物新鲜度的判据只能是「重跑生成逻辑再逐字节比对」。** 凡**调用生成器并带 `--check`** 的
   文件（以及生成器自身）都算这道门的当事人，它们不许用 git 判定产物。
3. 同时断言这道门**还在**（收集 `drifted` + 非零退出 + 挂在统一入口上）——否则门被删掉之后，
   第 2 项会因为找不到目标而恒绿。
4. **失败必须能被调用方看见。** Python 侧：打了 `FAIL` / `ERROR` 的文件，**模块顶层**必须有
   `raise SystemExit(...)` / `sys.exit(...)`——否则 `main()` 的返回值会被丢掉，退出码还是 0
   （这正是那天的原形）。JS 侧：往 stderr 打了 `FAIL` / `ERROR` 的脚本必须设非零
   `process.exitCode` 或 `process.exit(n)`。
5. 第 4 项是**静态**的（看源码），所以再配一条**动态**探针：拿必然失败的输入真跑一次，
   断言「退出码非零**且**输出里有失败标记」——只要退出码非零是不够的，加载依赖失败、路径
   写错都非零，那会让探针绿得毫无意义。
6. **`--with-*` 开关不许从阶段列表反推。** 开关控制的是阶段**内的步骤**（`when: args.with_e2e`），
   与"跑哪些阶段"是正交的两件事，必须各自独立传给 `check_all.py`。一旦写成
   `if with_e2e and "ci" not in stages`，而目标步骤又住在 ci 里，条件就永远不成立——
   命令照常拼出、退出码照常为 0，只是那一步从来没跑。

第 4、5 项都要留意一个格式契约：本脚本的**总结行不许写成 `FAIL <名字>` 的形状**，因为
`tools/ci/mutate_guards.py` 逐行取 "FAIL 后面的东西" 当检查名（那条写在下面的 `main()` 里）。

输出只用 ASCII 与 GBK 里都有的符号（`OK` / `FAIL` / `SKIP` / `·`）：
Windows 控制台默认 GBK，`✓ ✗ ▶` 这类字符会直接 UnicodeEncodeError 崩掉脚本。

用法：
  python tools/ci/check_hygiene.py           # 跑全部
  python tools/ci/check_hygiene.py --list    # 看编号文档索引与探针清单

退出码：任一检查失败则为 1；`SKIP` 不算失败，但会明说哪一块没被覆盖。
"""

from __future__ import annotations

import argparse
import ast
import io
import re
import subprocess
import sys
import tokenize
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
PY = sys.executable

# ---------------------------------------------------------------------------
# 扫哪些文件
# ---------------------------------------------------------------------------

SCAN_SUFFIXES = {".py", ".ts", ".tsx", ".mjs", ".js", ".md", ".mdx", ".yml", ".yaml"}

# 产物由 `web/scripts/build-knowledge.mjs` 从源码生成，内容是某份源码的逐字拷贝：
# 扫它们只会让同一条问题报两遍，而产物不手改——报在源码上才有可操作性。
SKIP_FILES = frozenset(
    {
        "web/workers/ulog-check-script.ts",
        "web/workers/ulog-data-script.ts",
        "web/workers/prompts.generated.js",
        "tools/_logging.py",
    }
)

# 走 `git ls-files` 拿文件清单：`--cached` 是被跟踪的，`--others --exclude-standard` 是
# **还没 add 但也没被忽略**的（`.gitignore` 里的日志、`.next`、`node_modules` 都据此排除）。
# 两样都要：只取被跟踪的会让"新建的文件在 add 之前不在覆盖范围内"——本文件自己就是新建的，
# 第一次跑时它没被扫到；而问题恰恰最容易出现在刚写的新文件里。
SKIP_DIRS = frozenset({".git", "node_modules", ".next", "__pycache__", ".workbuddy", "out", "dist", "build"})


def _rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def _scanned_files() -> list[Path]:
    proc = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode == 0 and proc.stdout:
        paths = [ROOT / name for name in proc.stdout.split("\0") if name]
    else:
        paths = [p for p in ROOT.rglob("*")]
    keep = []
    for path in paths:
        if not path.is_file() or path.suffix not in SCAN_SUFFIXES:
            continue
        try:
            rel = _rel(path)
        except ValueError:  # 不在仓库根下
            continue
        if rel in SKIP_FILES or any(part in SKIP_DIRS for part in path.parts):
            continue
        keep.append(path)
    return sorted(keep)


class Skip(Exception):
    """先决条件不满足 —— 不算失败，但必须说清哪一块**没有被覆盖**。"""


# ---------------------------------------------------------------------------
# 1. 悬空 § 引用
# ---------------------------------------------------------------------------

# 编号标题：`## 6. 技术栈与部署` / `### 6.8 报错要说清"缺什么"` / `### 3.1 写法`。
# 允许 `§` 前缀（有人会写 `## §6.8`），也允许 `、` 收尾。
HEADING_RE = re.compile(r"\s{0,3}#{1,6}\s*§?(\d+(?:\.\d+)*)[.、]?\s")
REF_RE = re.compile(r"§\s*(\d+(?:\.\d+)*)")
# 同一行里点名的文档：`见 CLAUDE.md §6.4` / `见 docs/architecture/plot-schema.md §3`
DOC_MENTION_RE = re.compile(r"([\w.\-/]*[\w\-]+\.mdx?)")

# 只有 Markdown 才可能自成一册。两个真实的反例说明为什么必须限定后缀：
#   - `web/scripts/build-knowledge.mjs` 里**内嵌着整份指南页模板**（模板字符串），于是它有
#     25 个看着像标题的行；不限定后缀的话，它会被当成本仓库的"编号文档 25 节"；
#   - `engine/providers/api.py` 的注释里有 `# 1.` / `# 2.` / `# 3.`，同样会让它"看起来有编号"。
# 语义上也不该算：代码文件没有"自己的 §"，它引用的永远是文档。条款见 `CLAUDE.md` §6.6。
DOC_SUFFIXES = (".md", ".mdx")

# 一份文档要算"编号文档"，至少得有这么多编号标题 —— 挡住"只有一条编号行的说明文档"：
# 它的 `§2` 多半是在引用 root `CLAUDE.md`，按本文档比会把对的判成悬空。真手册都有 7 个以上。
MIN_SECTIONS = 3


def _numbered_sections(text: str) -> set[str]:
    """这份文档自己声明了哪些章节号（跳过 ``` 围起来的代码块）。"""
    out: set[str] = set()
    fence: str | None = None
    for line in text.splitlines():
        head = line.lstrip()[:3]
        if head in ("```", "~~~"):
            fence = None if fence else head
            continue
        if fence:
            continue
        m = HEADING_RE.match(line)
        if m:
            out.add(m.group(1))
    return out


def _doc_index(rel: str, text: str) -> set[str]:
    """这份文件算不算"编号文档"—— 算则返回它声明的章节号，不算返回空集。"""
    found = _numbered_sections(text)
    return found if len(found) >= MIN_SECTIONS else set()


def _indexed_docs() -> dict[str, set[str]]:
    docs: dict[str, set[str]] = {}
    for path in _scanned_files():
        if not path.name.endswith(DOC_SUFFIXES):
            continue
        found = _doc_index(_rel(path), _read(path))
        if found:
            docs[_rel(path)] = found
    return docs


def _named_doc(line: str, ref_start: int, docs: dict[str, set[str]], by_basename: dict[str, str]) -> str | None:
    """引用所在行里**点名**了哪份文档 —— 取离这个 § 最近的那个名字。

    取最近的而不是行内第一个：一行里提两份文档是常事（`… 见 docs/a.md；另有 CLAUDE.md §6.5`），
    第一个未必是被引的那份，按它严格解析会把对的判成悬空。**写在引用之前的**优先于之后
    （人写"见 X §4"），所以出现在引用后面的名字按"更远"计。
    """
    best: tuple[int, str] | None = None
    for m in DOC_MENTION_RE.finditer(line):
        rel = m.group(1) if m.group(1) in docs else by_basename.get(Path(m.group(1)).name)
        if rel is None:
            continue  # 点名的不是编号文档（如 knowledge/px4/CLAUDE.md）—— 不据此严格解析
        dist = ref_start - m.end() if m.end() <= ref_start else (m.start() - ref_start) + len(line)
        if best is None or dist < best[0]:
            best = (dist, rel)
    return best[1] if best else None


def check_section_refs() -> list[str]:
    sections = _indexed_docs()
    refs: list[tuple[str, int, str, str, int]] = []
    for path in _scanned_files():
        for lineno, line in enumerate(_read(path).splitlines(), 1):
            for m in REF_RE.finditer(line):
                refs.append((_rel(path), lineno, m.group(1), line, m.start()))

    problems: list[str] = []
    # 防"恒绿"：全局回退（root CLAUDE.md）必须真的在索引里，否则所有源码里的 `§6.x`
    # 都会变成悬空——那是噪声，不是发现。索引塌了要当场说，而不是照常报一堆。
    if "CLAUDE.md" not in sections:
        problems.append("CLAUDE.md 不在编号文档索引里（被改名？编号标题被删？）—— 全局回退没有落点，本次检查无意义")

    by_basename: dict[str, str] = {}
    for rel in sections:
        by_basename.setdefault(Path(rel).name, rel)

    how_counts: dict[str, int] = {"点名文档": 0, "本文档": 0, "全局": 0}
    for rel, lineno, num, line, start in refs:
        named = _named_doc(line, start, sections, by_basename)
        if named is not None:
            how = "点名文档"
            ok = num in sections[named]
            where = f"点名的 {named}"
        elif rel in sections:
            how = "本文档"
            ok = num in sections[rel]
            where = f"本文档 {rel}"
        else:
            how = "全局"
            ok = any(num in secs for secs in sections.values())
            where = "root CLAUDE.md 或任一编号文档"
        how_counts[how] += 1
        if not ok:
            problems.append(
                f"{rel}:{lineno}  §{num} 在{where}里都不存在 —— {line.strip()[:90]}"
                + (
                    "\n        （若本意是引用别的文档，请在同一行点名那份文档，例如「见 CLAUDE.md §6.4」）"
                    if how != "全局"
                    else ""
                )
            )

    log.info(
        f"  {len(refs)} 处 § 引用；解析路径：本文档 {how_counts['本文档']} / "
        f"点名文档 {how_counts['点名文档']} / 全局 {how_counts['全局']}；"
        f"编号文档 {len(sections)} 份"
    )
    return problems


# ---------------------------------------------------------------------------
# 2. 产物新鲜度的判据不许落在 git 工作区状态
#
# 那天的原形：门拿 `git diff --exit-code` 跟 HEAD 比一份**产物文档**，于是作者手写的
# 文案也被判成"与源码不一致"。判据必须落在"重跑生成逻辑 → 与磁盘上的产物逐字节比对"，
# 因为那才是这道门要问的问题（源变了，产物跟上了吗）。
#
# 一个文件同时满足「调生成器」与「用 git 判产物」，才算违规——单独用 git 不算：
# `tools/ci/mutate_guards.py` 用 `git status` 只是证明自证没把仓库写脏，与产物新鲜度无关。
# ---------------------------------------------------------------------------

GENERATOR_SCRIPTS = frozenset({"web/scripts/build-knowledge.mjs"})

# 「谁在判产物新鲜度」：光提到生成器名字是不够的——`mutate_guards.py` 的注册表里就写着
# 生成器路径（那是**测试夹具**，不是门），`check_hygiene.py` 自己也在核那道门还在不在。
# 第一版把"提到生成器名"当成了判据，于是在这两处各抓了一个假阳性。
# 真正的判定者是**调用生成器并带 `--check`** 的那个文件（生成器自身则按路径认定）。
GENERATOR_CHECK_RE = re.compile(r"""build-knowledge\.mjs["']?\s*,\s*["']?--check|build:kb[^\n]{0,24}--check""")

# 只认**调用判据型 git 子命令**的两种写法：argv 形式（`["git", "diff", ...]`）与整串
# 命令形式（`"git diff ..."`）。这样文档/注释里出现的 `git diff` 这类词不会误触发
# （`check_all.py` 的 capture() 文档里就写着一次），也就省掉了"先剥注释"。
#
# 子命令名单只留**能表达「文件与 HEAD 不一致」**的那几个。刻意**不含** `git ls-files`：
# 它是列举、表达不了差异，而本文件自己就用它列被跟踪的文件——第一版把它算进来，于是
# 规则在自己的文件上抓了个假阳性。
GIT_CRITERION_RE = re.compile(
    r"""["']git["']\s*,\s*["'](?:diff|status|stash|checkout|restore)["']"""
    r"""|["']git\s+(?:diff|status|stash|checkout|restore)\b"""
)


def _code_only(path: Path) -> str:
    """源码去掉注释与 docstring —— 让规则只针对**代码**，不针对说明文字。

    为什么要这么绕：本文件自己的 docstring 里就写着 `build-knowledge.mjs`（那是解释，
    不是调用）。不剥掉的话，规则 B 会在本文件上自我触发，而唯一的"修法"是把说明删掉——
    那就成了规则逼人少写文档。
    """
    src = _read(path)
    if path.suffix == ".py":
        return py_code_only(src)
    if path.suffix in (".mjs", ".js", ".ts", ".tsx"):
        return _js_code_only(src)
    return src


def py_code_only(src: str) -> str:
    """Python：先按 AST 抠掉 docstring 所在的行，再用 tokenize 丢掉注释。

    **不是本文件私有**：`check_engine_purity.py` 也从这里导入它。两边共用一份"什么算代码"
    的定义是刻意的——各写一份就会出现第二个答案，而"注释里写着标识符"正是裸子串守卫
    被喂饱、进而恒绿的根因。改动这里等于同时改两条守卫的判据。
    """
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return src  # 语法都不对时别在这里报错——那是 ruff / 编译器的活
    drop: set[int] = set()
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        body = getattr(node, "body", [])
        if (
            body
            and isinstance(body[0], ast.Expr)
            and isinstance(body[0].value, ast.Constant)
            and isinstance(body[0].value.value, str)
        ):
            drop.update(range(body[0].lineno, (body[0].end_lineno or body[0].lineno) + 1))
    kept = ["" if i in drop else line for i, line in enumerate(src.splitlines(), 1)]
    try:
        tokens = tokenize.generate_tokens(io.StringIO("\n".join(kept)).readline)
        return " ".join(tok.string for tok in tokens if tok.type != tokenize.COMMENT)
    except (tokenize.TokenError, IndentationError):
        return "\n".join(kept)


# 朴素地去注释：`//` 出现在字符串里（URL）会把那一行后半截掉——只会**漏报**，不会误报。
_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)
_LINE_COMMENT_RE = re.compile(r"//[^\n]*")


def _js_code_only(src: str) -> str:
    return _LINE_COMMENT_RE.sub("", _BLOCK_COMMENT_RE.sub("", src))


def _gate_files() -> list[Path]:
    """可能"既调生成器又用 git 判产物"的文件：CI 门、构建脚本、钩子与 workflow。"""
    globs = ("tools/**/*.py", "web/scripts/**/*.mjs", "web/package.json", ".githooks/*", ".github/workflows/*.yml")
    out: list[Path] = []
    for pattern in globs:
        for path in ROOT.glob(pattern):
            if path.is_file() and not any(part in SKIP_DIRS for part in path.parts):
                out.append(path)
    return sorted(set(out))


def check_git_criterion() -> list[str]:
    problems: list[str] = []
    for path in _freshness_gates():
        code = _code_only(path)
        for m in GIT_CRITERION_RE.finditer(code):
            snippet = re.sub(r"\s+", " ", code[max(0, m.start() - 50) : m.end() + 50]).strip()
            problems.append(
                f"{_rel(path)} 用 git 判断产物新鲜度 —— …{snippet}…"
                "\n        判据必须落在「重跑生成逻辑，与磁盘上的产物逐字节比对」："
                "拿 git 比会把人的正常编辑也判成漂移"
            )
    return problems


def _freshness_gates() -> list[Path]:
    """哪些文件在判"产物是不是新鲜的" —— 见 `GENERATOR_CHECK_RE` 上面那段。

    新加一个生成器时要把它的调用写法加进 `GENERATOR_CHECK_RE`，否则那道新门不在本规则
    的覆盖范围内。已知的那道门"还在不在"由 `check_freshness_gate_alive` 单独保证。
    """
    out: list[Path] = []
    for path in _gate_files():
        rel = _rel(path)
        if rel in GENERATOR_SCRIPTS or GENERATOR_CHECK_RE.search(_code_only(path)):
            out.append(path)
    return out


def check_freshness_gate_alive() -> list[str]:
    """防"目标消失"：这道门被删/被改名之后，上面那条规则会因为找不到目标而恒绿。"""
    problems: list[str] = []
    gen = WEB / "scripts" / "build-knowledge.mjs"
    if not gen.is_file():
        return [f"{_rel(gen)} 不存在 —— 产物新鲜度门不见了"]
    src = _read(gen)
    for marker, why in (
        ("drifted.push(", "不再收集「哪些产物与源不一致」"),
        ("drifted.length", "收集了却不据此判断"),
        ("process.exitCode", "发现不一致时没有把失败传给调用方"),
    ):
        if marker not in src:
            problems.append(f"{_rel(gen)} 里找不到 {marker!r} —— {why}")
    # 校验命令住在 checklist.yml，check_all.py 只做转发 —— 判据必须跟到同一处，
    # 搜错地方就是恒红。
    gate = ROOT / "tools" / "ci" / "checklist.yml"
    gate_src = _read(gate) if gate.is_file() else ""
    if "build-knowledge.mjs" not in gate_src or "--check" not in gate_src:
        problems.append(f"{_rel(gate)} 里没有 build-knowledge.mjs --check 这一步 —— 这道门没挂在统一入口上")
    return problems


# ---------------------------------------------------------------------------
# 3. 打了 FAIL/ERROR 就必须能非零退出
#
# 那天的原形：`main()` 里对每份日志打 `ERROR: ...`，然后 `return 0`。红字照打、退出码是 0，
# 于是 pre-push 放行、CI 放行，`series` 那一路废了多久都没人知道。
#
# 判据落在"模块顶层有没有 SystemExit"：只要求文件里**出现过** `return 1` 是不够的——
# 那正是原形里有的东西（`return 0` 旁边就有别的 `return 1`），而 `main()` 的返回值一旦没人接，
# 退出码仍是 0。
# ---------------------------------------------------------------------------

PY_FAIL_PRINT_RE = re.compile(r"""(?:print|log\.(?:error|warning))\(\s*f?["']\s*(?:FAIL|ERROR)\b""")
JS_FAIL_PRINT_RE = re.compile(r"""console\.(?:error|warn|log)\(\s*[`"']\s*(?:CHECK\s+)?(?:FAIL|ERROR)\b""")

# 取"等号右边/括号里"**再看它是不是常量 0**，而不是把 `(?!0)` 写在 `\s*` 后面：
# `\s*` 会回溯——先吃掉空格、负向断言在 `0;` 上失败，于是退回去只吃零个空格、断言在空格上
# 就成功了，`process.exitCode = 0;` 照样算"非零退出"。这个坑第一版真踩了：那条变异因此
# 报"守卫恒绿"，看着像守卫坏了，其实是正则写坏。
JS_EXIT_ASSIGN_RE = re.compile(r"process\.exitCode\s*=\s*([^;\n]*)")
JS_EXIT_CALL_RE = re.compile(r"process\.exit\(\s*([^)\n]*)")


def _js_exits_nonzero(code: str) -> bool:
    """设了退出码且**不是**常量 0。`process.exitCode = failed ? 1 : 0` 算，`= 0;` 不算。"""
    return any(m.group(1).strip() != "0" for m in JS_EXIT_ASSIGN_RE.finditer(code)) or any(
        m.group(1).strip() != "0" for m in JS_EXIT_CALL_RE.finditer(code)
    )


def _top_level_exit(node: ast.AST) -> bool:
    """模块顶层（含 `if __name__ == "__main__":` 块内）有没有 SystemExit / sys.exit。

    遇到函数/类定义就不再往里走——函数里的 `sys.exit` 只有被调到才算数，而那正是"被忘掉"
    的那一步。
    """
    for child in ast.iter_child_nodes(node):
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
            continue
        if isinstance(child, ast.Raise):
            exc = child.exc
            name = exc.func.id if isinstance(exc, ast.Call) and isinstance(exc.func, ast.Name) else getattr(exc, "id", None)
            if name == "SystemExit":
                return True
        if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute) and child.func.attr == "exit":
            return True
        if _top_level_exit(child):
            return True
    return False


def check_failure_visible() -> list[str]:
    problems: list[str] = []
    for path in _scanned_files():
        if path.suffix == ".py":
            src = _read(path)
            if not PY_FAIL_PRINT_RE.search(src):
                continue
            try:
                tree = ast.parse(src)
            except SyntaxError:
                continue  # 语法错由 ruff 报，这里不重复
            if not _top_level_exit(tree):
                problems.append(
                    f"{_rel(path)} 打了 FAIL / ERROR，但模块顶层没有 raise SystemExit / sys.exit"
                    " —— main() 的返回值会被丢掉，退出码仍是 0"
                )
        elif path.suffix in (".mjs", ".js", ".ts", ".tsx"):
            code = _js_code_only(_read(path))
            if JS_FAIL_PRINT_RE.search(code) and not _js_exits_nonzero(code):
                problems.append(
                    f"{_rel(path)} 往 stderr 打了 FAIL / ERROR，但没设非零的 process.exitCode / process.exit"
                    " —— 调用方看到的仍是成功"
                )
    return problems


# ---------------------------------------------------------------------------
# 4. 动态探针：坏输入必须非零退出
#
# 上面那条是静态的（看源码）。静态规则看不见"打了 ERROR、也确实 return 1 了，但那条路
# 根本没被走到"——而那正是原形的另一半（`np_series` 用了旧签名，抛异常 → 打印 ERROR →
# 计数没加）。所以真跑一次：拿**必然失败**的输入跑，断言退出码非零**且**输出里有失败标记。
# 只断言非零是不够的：依赖没装、路径写错也都非零，探针会绿得毫无意义。
# ---------------------------------------------------------------------------


class Probe:
    __slots__ = ("name", "argv", "marker", "needs")

    def __init__(self, name: str, argv: list[str], marker: str, needs: tuple[str, ...] = ()) -> None:
        self.name = name
        self.argv = argv
        self.marker = marker
        self.needs = needs


PROBES: list[Probe] = [
    Probe(
        name="数据层自检拿到不存在的日志",
        argv=[PY, "tools/calibrate/run_checks_locally.py", "--probe-data", "tools/calibrate/logs/__no_such_log__.ulg"],
        marker="ERROR",
        needs=("numpy", "pyulog"),
    ),
    Probe(
        name="自证跑手 --only 没匹配到任何变异",
        argv=[PY, "tools/ci/mutate_guards.py", "--only", "__no_such_mutation__"],
        marker="FAIL",
    ),
]


def check_bad_input_exit() -> list[str]:
    need = sorted({mod for probe in PROBES for mod in probe.needs})
    missing = [mod for mod in need if subprocess.run([PY, "-c", f"import {mod}"], capture_output=True).returncode != 0]
    if missing:
        raise Skip(
            f"当前解释器缺 {' / '.join(missing)}，数据层探针没跑 —— 用本机装了科学栈的解释器跑"
            "（C:\\Users\\zhanfuyu\\anaconda3\\python.exe）"
        )
    problems: list[str] = []
    for probe in PROBES:
        proc = subprocess.run(
            [str(x) for x in probe.argv],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        out = (proc.stdout or "") + (proc.stderr or "")
        if proc.returncode == 0:
            problems.append(f"{probe.name}：退出码是 0 —— 打了失败标记却让调用方以为成功")
        elif probe.marker not in out:
            tail = " / ".join(out.strip().splitlines()[-2:])[:120]
            problems.append(f"{probe.name}：退出了（{proc.returncode}）但没有 {probe.marker!r} —— 红的不是预期的原因：{tail}")
        else:
            log.info(f"  {probe.name}：退出码 {proc.returncode}，输出含 {probe.marker!r}")
    return problems


# ---------------------------------------------------------------------------
# 5. 开关不许被"再推导一次"
#
# 原形：`.githooks/pre-push` 想用 `WITH_E2E=1` 打开 E2E，却把这个开关**用阶段列表又推了一遍**——
# `if with_e2e and "ci" not in stages: cmd.append("--with-e2e")`。而 E2E 那两步住在 ci 阶段里，
# 于是"想要 E2E"的每一条路径都恰好满足 `"ci" in stages`，那个 `append` **一次都不会执行**：
# `WITH_E2E=1 git push` 打印出 `--stage push,ci`，看着像要跑 E2E，实际两步都被静默跳过。
#
# 为什么单独一条规则：这类错**没有任何输出**。命令拼得出来、退出码是 0、日志也正常，
# 只有把参数打印出来逐条对照才发现少了东西。静态检查能看见它，人看不出来。
#
# 判据：`.githooks/pre-push` 里出现"把某个 `--with-*` 开关与阶段表达式绑在一起"的写法即违规。
# 开关控制的是**阶段内的步骤**（`when: args.with_e2e`），与"跑哪些阶段"是两个正交的维度，
# 必须各自独立地传给 check_all.py。
# ---------------------------------------------------------------------------

# 只看"`--with-xxx` / `with_xxx` 出现在某个条件里，而那个条件又在看阶段"。
#
# 字符类必须含数字：开关名是 `with_e2e`，`[a-z_]+` 匹配不到 `e2e` 里的 `2`——
# 第一版就写成了 `with_[a-z_]+`，于是这条守卫在真 bug 上**恒绿**（本项目最忌讳的形状：
# 一条永远不红的守卫比没有守卫更坏，因为它还让人以为有人在看）。自证时才发现。
REFLAG_GUARD_RE = re.compile(
    r"""(?:if|elif)\b[^\n]*\bwith_[a-z0-9_]+\b[^\n]*\b(?:in|not\s+in)\b[^\n]*\bstages\b"""
    r"""|\bwith_[a-z0-9_]+\b\s+and\b[^\n]*\bstages\b"""
)


def check_hook_flags_not_rederived() -> list[str]:
    """hook 不许从阶段列表反推 `--with-*` 开关 —— 那样开关永远开不着（见上面那段）。"""
    problems: list[str] = []
    for hook in sorted((ROOT / ".githooks").glob("*")):
        if not hook.is_file() or hook.suffix in (".ps1", ".md"):
            continue
        code = _code_only(hook)
        for m in REFLAG_GUARD_RE.finditer(code):
            snippet = re.sub(r"\s+", " ", code[max(0, m.start() - 40) : m.end() + 80]).strip()
            problems.append(
                f"{_rel(hook)} 把 --with-* 开关与阶段条件绑在一起 —— …{snippet}…"
                "\n        开关控制的是阶段**内的步骤**，与「跑哪些阶段」正交："
                "从 stages 反推会让它在每条真实路径上都不成立，于是静默跳过"
            )
    return problems


# ---------------------------------------------------------------------------

CHECKS: list[tuple[str, object]] = [
    ("悬空 § 引用", check_section_refs),
    ("产物新鲜度不许用 git 当判据", check_git_criterion),
    ("产物新鲜度门还在", check_freshness_gate_alive),
    ("打了 FAIL/ERROR 就要能非零退出", check_failure_visible),
    ("坏输入必须非零退出", check_bad_input_exit),
    ("hook 不从阶段列表反推开关", check_hook_flags_not_rederived),
]


def _print_index() -> None:
    sections = _indexed_docs()
    log.info(f"编号文档索引（{'/'.join(DOC_SUFFIXES)}，≥{MIN_SECTIONS} 个编号标题）—— {len(sections)} 份：")
    for rel, nums in sorted(sections.items()):
        log.info(f"  {rel}  {len(nums)} 节：{', '.join(sorted(nums)[:8])}{' …' if len(nums) > 8 else ''}")
    log.info(f"\n探针 {len(PROBES)} 条：")
    for probe in PROBES:
        log.info(f"  {' '.join(str(x) for x in probe.argv[1:])}  期望退出码非零且输出含 {probe.marker!r}")


def main(argv: list[str]) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)  # 与 check_all.py 同理：重定向时不与子进程输出交错

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", action="store_true", help="打印编号文档索引与探针清单")
    args = ap.parse_args(argv[1:])

    if args.list:
        _print_index()
        return 0

    log.info("=== 校验机制自身的卫生 ===")
    failed: list[str] = []
    skipped: list[str] = []
    for name, fn in CHECKS:
        log.info(f"\n· {name}")
        try:
            problems = fn()  # type: ignore[operator]
        except Skip as exc:
            log.warning(f"SKIP {name}  -> {exc}")
            skipped.append(name)
            continue
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
        mark = "FAIL" if name in failed else ("SKIP" if name in skipped else "OK  ")
        log.info(f"  {mark} {name}")
    if failed:
        # 这句**不能**写成 `FAIL <名字>` 的形状：tools/ci/mutate_guards.py 逐行取 "FAIL 后面的东西"
        # 当检查名，那句总结会被它当成一条检查名，于是每条变异都多报一次"牵连"。
        # （被那套跑手解析的守卫都有这条格式契约，见它的 _failed_names。）
        log.error(f"\n{len(failed)} 项卫生检查未过 —— 逐项看上面的输出。")
        return 1
    log.info(f"\nOK 全部通过（{len(CHECKS) - len(skipped)} 项，跳过的已说明原因）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
