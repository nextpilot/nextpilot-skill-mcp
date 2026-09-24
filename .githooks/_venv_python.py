"""Make sure a git hook runs under the repo's .venv, not under whatever `python` Git found.

Why this module exists: Git launches hooks with `/bin/sh` and a bare PATH, so
`#!/usr/bin/env python` lands on whatever interpreter is first there -- on this
machine the managed 3.13, which has no ruff. The hook body then runs ruff via
`sys.executable -m ruff` and dies with `No module named ruff`. Measured: Git
really does start hooks with the managed interpreter.

Why it lives in its own module instead of being inlined into a hook: pre-commit
and pre-push both need it, and two copies of "which interpreter is this" is
exactly the pair that drifts apart -- one gets fixed, the other keeps running
the old environment and nobody notices, because running the wrong Python looks
like "the tool is missing", not like "we picked the wrong tool".

Exit code 127 means "no .venv". Git treats a hook exit of 127 as a warning and
lets the operation through -- deliberate: the hook's job is to remind, not to
lock you out (the same principle as "an error message must say what is missing").

Usage -- at the very top of a hook, before anything else:

    from _venv_python import ensure_venv_python
    raise SystemExit(ensure_venv_python(main))

`main` is called ONLY when this process already runs under the .venv
interpreter. When it does not, this module re-runs the whole hook under it and
exits with that child's status, so the body never executes twice under two
different interpreters.
"""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

# .venv 的位置是仓库级约定，不是某台机器的偏好：tools/setup 用 uv 建它，
# pyrightconfig.json 也按同一个路径找它（venvPath "." + venv ".venv"）。
# 所以这里直接从仓库根推出来，不在 PATH 上"找"——一旦允许找，就得回答
# "两个候选都有 ruff 时算谁的"，而那个答案迟早因两台机器装的版本不同而打架。
_ROOT = Path(__file__).resolve().parents[1]
VENV_PYTHON = str(_ROOT / (".venv/Scripts/python.exe" if os.name == "nt" else ".venv/bin/python"))

# Sentinel so a mis-detection cannot re-exec forever.
_REEXEC_FLAG = "NEXTPILOT_HOOK_REEXEC"


def _same_interpreter(a: str, b: str) -> bool:
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


def ensure_venv_python(run_hook: Callable[[], int]) -> int:
    """Run *run_hook* under the repo's .venv interpreter; return the exit code.

    Three outcomes:
      * already running in .venv, or already re-exec'd once -> calls run_hook() here
      * running elsewhere -> re-runs argv under .venv, returns its status
      * no .venv -> prints what is missing, returns 127
    """
    if not os.path.exists(VENV_PYTHON):
        print("[hook] No .venv found -- this hook cannot run.", file=sys.stderr)
        print(f"[hook] Expected an interpreter at: {VENV_PYTHON}", file=sys.stderr)
        print("[hook] Create it with: .\\tools\\setup\\setup.ps1  (or ./tools/setup/setup.sh)", file=sys.stderr)
        return 127

    if _same_interpreter(VENV_PYTHON, sys.executable) or os.environ.get(_REEXEC_FLAG):
        # Either already correct, or the re-exec already happened and this is the
        # child. The sentinel is what stops a detection mistake from looping.
        return run_hook()

    env = {**os.environ, _REEXEC_FLAG: "1"}
    if os.name == "nt":
        # os.execv replaces the process but does not hand over the console
        # handles cleanly on Windows, so run as a child and mirror its status.
        return subprocess.run([VENV_PYTHON, *sys.argv], env=env, check=False).returncode

    os.execve(VENV_PYTHON, [VENV_PYTHON, *sys.argv], env)  # noqa: S606 -- deliberate self-replace
    return 0  # unreachable
