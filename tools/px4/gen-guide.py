"""把 rules/*.yaml 与知识文档同步成指南页面（web/content/guide/knowledge-*.md）。

**为什么是薄包装**：规则的清单渲染只有一份实现，在 `web/scripts/build-guide.mjs`——
它挂在 `pnpm build:kb` 上（dev 与线上构建都会跑），网页永远跟着 rules/*.yaml 走。
Python 侧再写一份渲染就必然与它漂移（阈值、算子参数、排序迟早对不上），
所以这里只负责调用它，不重复实现。

跑一次会更新（都是生成物，勿手改）：
  web/content/guide/knowledge-write-rule.md    ← knowledge/px4/guides/writing-rules.md
  web/content/guide/knowledge-rules.md         ← knowledge/px4/rules/*.yaml
  knowledge/px4/reference/rules-index.md       ← 同一份规则清单（仓库内的开发文档）

设计文档 `knowledge/px4/CLAUDE.md` 不发布到网站（它是给 AI 与维护者的项目上下文）。

用法：
  python tools/px4/gen-guide.py          # 生成
  python tools/px4/gen-guide.py --check  # 只比对不写入（CI 用），漂移则退出码 1

依赖：node（web/ 的依赖已装好）。改完经验建议直接 `cd web && pnpm build:kb`，
这条命令是给"不跑前端构建、只要刷新文档与网页"的场景用的。
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "web" / "scripts" / "build-guide.mjs"

# 生成物清单：--check 时逐个比对，任何漂移都算失败
WATCHED = [
    REPO_ROOT / "web" / "content" / "guide" / "knowledge-write-rule.md",
    REPO_ROOT / "web" / "content" / "guide" / "knowledge-rules.md",
    REPO_ROOT / "knowledge" / "px4" / "reference" / "rules-index.md",
]


def _snapshot(paths: list[Path]) -> dict[Path, bytes | None]:
    return {p: (p.read_bytes() if p.exists() else None) for p in paths}


def _restore(snap: dict[Path, bytes | None]) -> None:
    for p, data in snap.items():
        if data is None:
            if p.exists():
                p.unlink()
        elif not p.exists() or p.read_bytes() != data:
            p.write_bytes(data)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="只比对不写入（生成后比对，再还原现场）")
    args = ap.parse_args(argv[1:])

    # 与 tools/ 下其他脚本一致：Windows 中文控制台默认 GBK，直接把 UTF-8 中文写过去会花屏
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    if not SCRIPT.exists():
        print(f"找不到生成脚本：{SCRIPT}", file=sys.stderr)
        return 2

    before = _snapshot(WATCHED)
    # 显式按 UTF-8 解码：node 输出的是 UTF-8，而 Windows 中文环境下 text=True
    # 会拿 GBK 去解，捕获线程直接抛 UnicodeDecodeError（stdout 变 None）
    proc = subprocess.run(
        ["node", str(SCRIPT)], cwd=REPO_ROOT, capture_output=True, encoding="utf-8", errors="replace"
    )
    if proc.returncode != 0:
        print((proc.stdout or "").strip())
        print((proc.stderr or "").strip(), file=sys.stderr)
        return proc.returncode

    if not args.check:
        print((proc.stdout or "").strip())
        return 0

    after = _snapshot(WATCHED)
    drifted = [p for p in WATCHED if before[p] != after[p]]
    _restore(before)          # --check 不留副作用，工作区保持原样
    if drifted:
        print("CHECK FAIL: 以下生成物与 knowledge/ 不一致，重跑 python tools/px4/gen-guide.py")
        for p in drifted:
            print(f"  {p.relative_to(REPO_ROOT)}")
        return 1
    print("OK 指南页面与规则清单均为最新")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
