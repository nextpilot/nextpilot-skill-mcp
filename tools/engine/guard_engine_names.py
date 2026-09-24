r"""knowledge/engine/ 的**顶层名字不许跨片段重名**。

## 为什么要有它

`web/scripts/build-knowledge.mjs` 把 knowledge/engine/ 下的片段按顺序拼成**一份**脚本再执行
（浏览器与本地工具同一份源码）：

```text
operators.py → providers/api.py → providers/*.py → engine.py
```

拼完之后它们共享**同一个命名空间**。两个片段顶层同名 = 后者静默覆盖前者：不报错、不告警，
只是某个格式突然解析不出来。`_MAGIC` 就这么被踩过一次（两个 provider 都叫 `_MAGIC`），
现在靠人工记住"顶层名字要带格式前缀"（`_APM_MAGIC` / `_MAGIC`）—— 而人会忘，
新加第三个 provider 时尤其会忘。

## 判据

1. **顶层"定义"跨片段重名即红**（函数 / 类 / 赋值 / 注解赋值 / 增量赋值）。
   只看**定义**、不看使用：`FORMATS` 由 `api.py` 定义、各 provider 只 `append`，那不是撞名。
2. **import 绑定**跨片段同名时，再比**来源**：`import numpy as np` 在两个片段里都写不算撞
   （绑的是同一个模块对象）；同名却来自不同模块（`from a import x` 与 `from b import x`）才算。
3. **判空**：片段文件数或顶层名字总数低于下限 → 红。否则文件被改名 / 搬空之后，
   第 1 项会因为"没东西可比"而恒绿。
4. **前提还在**：这道门必须真的挂在 `tools/ci/checklist.yml` 的 push 阶段。

provider 的集合是**扫目录**得来的（`knowledge/engine/providers/*.py` 去掉 `api.py`，与构建脚本同一条
规则），加格式零改动；框架三个文件是结构性的，写死并在 README 的「拼接顺序」里有权威清单。

退出码：任一检查失败则为 1。
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "knowledge" / "engine"
PROVIDERS = ENGINE / "providers"
CHECKLIST = ROOT / "tools" / "ci" / "checklist.yml"
BUILD = ROOT / "web" / "scripts" / "build-knowledge.mjs"

# 这道门在 checklist.yml 里的步骤 id —— 前提检查按它找，改名要两处一起改
STEP_ID = "guard-engine-names"

# 与构建脚本同规则：`api.py` 是契约，不是格式适配器
API_FILE = "api.py"
FRAMEWORK = ("operators.py", "engine.py")

# 判空下限：现在是 6 个片段、约 180 个顶层名字。定在远低于实际值的水平，只为抓住
# "文件被改名 / 目录被搬空 / 新增 provider 没被扫到"，不给正常重构添堵。
MIN_FILES = 5
MIN_NAMES = 100

# 构建脚本扫 provider 目录的写法 —— 它要是换成写死名单，"加格式零改动"这个前提就没了
PROVIDER_SCAN_MARKER = "readdirSync(PROVIDER_DIR)"


class Binding:
    """一个顶层名字：是"定义"还是"导入"，导入的话来自哪个模块。"""

    __slots__ = ("name", "defined", "source")

    def __init__(self, name: str, defined: bool, source: str = "") -> None:
        self.name = name
        self.defined = defined  # True = 本片段自己定义；False = import 进来
        self.source = source  # 仅 import 有意义：`numpy` / `collections.OrderedDict`


def _target_names(node: ast.AST) -> list[str]:
    if isinstance(node, ast.Name):
        return [node.id]
    if isinstance(node, (ast.Tuple, ast.List)):
        out: list[str] = []
        for elt in node.elts:
            out.extend(_target_names(elt))
        return out
    return []


def top_level_bindings(path: Path) -> list[Binding]:
    """模块顶层绑了哪些名字（函数体 / 类体里的不算 —— 那是各自的私有空间）。"""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    out: list[Binding] = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            out.append(Binding(node.name, True))
        elif isinstance(node, ast.Assign):
            out.extend(Binding(n, True) for t in node.targets for n in _target_names(t))
        elif isinstance(node, (ast.AnnAssign, ast.AugAssign)):
            out.extend(Binding(n, True) for n in _target_names(node.target))
        elif isinstance(node, ast.Import):
            for a in node.names:
                out.append(Binding(a.asname or a.name.split(".")[0], False, a.name))
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            for a in node.names:
                out.append(Binding(a.asname or a.name, False, f"{mod}.{a.name}" if mod else a.name))
    return out


def fragment_files() -> list[Path]:
    """参与拼接的片段：框架三个 + providers/ 下除 api.py 之外的全部（按名排序，与构建脚本一致）。"""
    files = [ENGINE / name for name in FRAMEWORK if (ENGINE / name).is_file()]
    files.append(PROVIDERS / API_FILE)
    if PROVIDERS.is_dir():
        files.extend(sorted(p for p in PROVIDERS.glob("*.py") if p.name != API_FILE))
    return [p for p in files if p.is_file()]


def _rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def check_no_name_clash() -> list[str]:
    """顶层定义在两个及以上片段同名 → 拼接后后者静默覆盖前者。"""
    defined: dict[str, list[str]] = {}
    imported: dict[str, dict[str, list[str]]] = {}
    for path in fragment_files():
        for b in top_level_bindings(path):
            if b.defined:
                defined.setdefault(b.name, []).append(_rel(path))
            else:
                imported.setdefault(b.name, {}).setdefault(b.source, []).append(_rel(path))

    problems: list[str] = []
    for name, where in sorted(defined.items()):
        if len(where) > 1:
            problems.append(
                f"{name} 在 {len(where)} 个片段里各定义了一次（{'、'.join(where)}）"
                " —— 拼进同一命名空间后后者覆盖前者，且没有任何报错"
            )
    for name, by_source in sorted(imported.items()):
        if len(by_source) > 1:
            where = [f"{src}（{files[0]}）" for src, files in sorted(by_source.items())]
            problems.append(f"{name} 被两个片段从**不同来源**导入：{' vs '.join(where)} —— 后者把前者顶掉")
    return problems


def check_coverage() -> list[str]:
    """判空 + 前提：扫不到东西时上面那条会恒绿，这里把它拦下来。"""
    problems: list[str] = []
    files = fragment_files()
    total = sum(len(top_level_bindings(p)) for p in files)
    if len(files) < MIN_FILES:
        problems.append(f"只扫到 {len(files)} 个片段（下限 {MIN_FILES}）—— 文件改名或搬空后这条规则会恒绿")
    if total < MIN_NAMES:
        problems.append(f"顶层名字只有 {total} 个（下限 {MIN_NAMES}）—— 覆盖不够，比对结果没有意义")
    if PROVIDERS.is_dir() and not sorted(PROVIDERS.glob("*.py")):
        problems.append(f"{_rel(PROVIDERS)} 下一个 .py 都没有 —— 引擎没有格式适配器")
    if BUILD.is_file() and PROVIDER_SCAN_MARKER not in BUILD.read_text(encoding="utf-8", errors="replace"):
        problems.append(
            f"{_rel(BUILD)} 里找不到 {PROVIDER_SCAN_MARKER} —— provider 不再是扫目录得来的，"
            "新增格式要改两处，本守卫的覆盖会悄悄落后"
        )
    return problems


def check_gate_registered() -> list[str]:
    if not CHECKLIST.is_file():
        return [f"{_rel(CHECKLIST)} 不存在"]
    if STEP_ID not in CHECKLIST.read_text(encoding="utf-8", errors="replace"):
        return [f"{_rel(CHECKLIST)} 里没有 {STEP_ID} —— 这道门不在 push 阶段，等于没挂"]
    return []


CHECKS = (
    ("knowledge/engine/ 顶层名字不撞车", check_no_name_clash),
    ("拼接片段没走空", check_coverage),
    ("这道门挂在统一入口上", check_gate_registered),
)


def main(argv: list[str]) -> int:
    log.print_header("knowledge/engine/ 拼接命名守卫")

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
        results.append((name, "ok" if ok else "fail"))

    return log.print_summary(results, [])


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
