"""Push 前的产物新鲜度门：真跑一次 build:kb，把产物区与 HEAD 比对。

Why this exists: build-kb-parity（build:kb --check）比的是「重算 vs 磁盘」，
而开发机的磁盘常被 dev / build 刷成重算值，比对自洽，测不出
「HEAD 里提交的产物 vs knowledge/ 真源」的脱节（2026-09-26 实际发生过：
derived-version.generated.ts 落后于真源一路绿进主干，只有干净 clone 才会红）。

这道门换个比较对象：真跑一次 build（写模式，磁盘被刷成对当前工作区的重算
值），然后 `git diff HEAD -- 产物区`。diff 非零只有一种解释：HEAD 提交的
产物落后于工作区的 knowledge/，push 之前要把源与产物一起 commit。
hook 只拦截不代改：让 pre-push 自动 amend / 补提交等于改写历史，危险得多。

为什么产物区用 pathspec 模式而不是逐个列文件：与 .prettierignore 的
「自动生成文件」清单同源（*.generated.* / content/guide/rule-*.mdx /
public/params/）。build-knowledge 新增产物时只要沿用同一命名惯例（或把
路径同时加进两处清单），这里自动覆盖，不需要跟着改。

注意：工作区里若有未提交的 knowledge/ 改动，它们会被算进重算，此时
diff 非零是预期行为：先把源和产物一起 commit，push 出去的 HEAD 才自洽。

Usage:
    python tools/common/check_kb_fresh.py
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"

# 与 .prettierignore 的自动生成清单同源；pathspec 语法见 gitignore(7)
ARTIFACT_PATHSPECS = ("*.generated.*", "web/content/guide/rule-*.mdx", "web/public/params")


def run(cmd: list[str], cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")


def main() -> int:
    node = shutil.which("node") or "node"

    build = run([node, "scripts/build-knowledge.mjs"], WEB)
    if build.returncode != 0:
        print(build.stdout)
        print(build.stderr, file=sys.stderr)
        print("[check_kb_fresh] build:kb 本身失败——先修掉编译错误再谈新鲜度。", file=sys.stderr)
        return 1

    diff = run(["git", "diff", "--exit-code", "--stat", "HEAD", "--", *ARTIFACT_PATHSPECS], ROOT)
    if diff.returncode == 0:
        print("[check_kb_fresh] OK 对当前 knowledge/ 的重算与 HEAD 提交的产物一致")
        return 0

    print("[check_kb_fresh] FAIL 重跑 build:kb 后产物区与 HEAD 有 diff —— 提交的产物落后于 knowledge/。")
    print("  处理：把下列产物变更与 knowledge/ 源改动一起 commit，再 push（不要只推源）。")
    print(diff.stdout)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
