"""Check staged files: formatters and linters in read-only mode.

  .py                     -> ruff format --check, ruff check (no --fix)
  .ts/.tsx/.js/.mjs/.css  -> prettier --check
  .ts/.tsx                -> eslint (no --fix)

Unlike the pre-commit hook, this script does NOT modify or re-stage anything.
It fails if any tool reports issues -- the user must fix them manually.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

PY_FILES = (".py",)
FRONTEND_FILES = (".ts", ".tsx", ".js", ".mjs", ".css")


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
        capture_output=True,
        text=True,
        check=False,
        cwd=str(root),
    )
    staged = [f for f in result.stdout.splitlines() if f.strip()]

    py_files = [f for f in staged if f.endswith(PY_FILES)]
    fe_files = [f for f in staged if f.endswith(FRONTEND_FILES)]
    ts_files = [f for f in staged if f.endswith((".ts", ".tsx"))]

    if not py_files and not fe_files:
        print("[check_staged] No staged Python/frontend files to check.")
        return 0

    rc = 0

    if py_files:
        print("[check_staged] ruff format --check ...")
        r = subprocess.run(
            [sys.executable, "-m", "ruff", "format", "--check", *py_files],
            cwd=str(root),
        )
        if r.returncode != 0:
            rc = 1

    if py_files:
        print("[check_staged] ruff check ...")
        r = subprocess.run(
            [sys.executable, "-m", "ruff", "check", *py_files],
            cwd=str(root),
        )
        if r.returncode != 0:
            rc = 1

    if fe_files:
        web = root / "web"
        prettier = web / "node_modules" / "prettier" / "bin" / "prettier.cjs"
        if prettier.exists():
            print("[check_staged] prettier --check ...")
            r = subprocess.run(
                [_node(), str(prettier), "--check", *fe_files],
                cwd=str(root),
            )
            if r.returncode != 0:
                rc = 1
        else:
            print("[check_staged] prettier not installed -- skipping.")

    if ts_files:
        web = root / "web"
        eslint = web / "node_modules" / "eslint" / "bin" / "eslint.js"
        if eslint.exists():
            rel = [
                str((root / f).resolve().relative_to(web)).replace("\\", "/")
                for f in ts_files
                if (root / f).resolve().is_relative_to(web)
            ]
            if rel:
                print("[check_staged] eslint ...")
                r = subprocess.run(
                    [_node(), str(eslint), *rel],
                    cwd=str(web),
                )
                if r.returncode != 0:
                    rc = 1
        else:
            print("[check_staged] eslint not installed -- skipping.")

    if rc == 0:
        print("[check_staged] All checks passed.")
    return rc


def _node() -> str:
    node = shutil.which("node")
    if node:
        return node
    for candidate in (
        Path.home() / ".workbuddy" / "binaries" / "node" / "versions",
        Path.home() / ".local" / "share" / "fnm" / "node-versions",
    ):
        if candidate.is_dir():
            versions = sorted((candidate / v).resolve() for v in candidate.iterdir() if (candidate / v / "node.exe").exists())
            if versions:
                return str(versions[-1] / "node.exe")
    raise SystemExit("node not found -- run tools/setup/setup.sh or add node to PATH")


if __name__ == "__main__":
    raise SystemExit(main())
