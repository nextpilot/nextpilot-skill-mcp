"""Make sure a git hook runs under the repo's .venv, not under whatever `python` Git found.

Git launches hooks with `/bin/sh` and a bare PATH, so `#!/usr/bin/env python`
lands on the first interpreter there -- on this machine the managed 3.13, which
has no ruff; the body then dies with `No module named ruff`. Shared module
because pre-commit and pre-push both need it, and two copies of "which
interpreter is this" drift apart silently: running the wrong Python looks like
"the tool is missing", not like "we picked the wrong tool".

Exit code 127 means "no .venv". Git treats a hook exit of 127 as a warning and
lets the operation through -- deliberate: the hook's job is to remind, not to
lock you out.

Usage -- at the very top of a hook, before anything else:

    from _venv_python import ensure_venv_python
    raise SystemExit(ensure_venv_python(main))

`main` is called ONLY when this process already runs under the .venv
interpreter; otherwise the whole hook is re-run under it, so the body never
executes twice under two different interpreters.
"""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

# .venv 的位置是仓库级约定：tools/setup 用 uv 建它，pyrightconfig.json 也按同一个
# 路径找它（venvPath "." + venv ".venv"）。直接从仓库根推出来，不在 PATH 上"找"——
# 一旦允许找，就得回答"两个候选都有 ruff 时算谁的"，那个答案迟早因两台机器装的
# 版本不同而打架。
_ROOT = Path(__file__).resolve().parents[1]
VENV_PYTHON = str(_ROOT / (".venv/Scripts/python.exe" if os.name == "nt" else ".venv/bin/python"))

# Sentinel so a mis-detection cannot re-exec forever.
_REEXEC_FLAG = "NEXTPILOT_HOOK_REEXEC"


def _same_interpreter(a: str, b: str) -> bool:
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


def ensure_venv_python(run_hook: Callable[[], int]) -> int:
    """Run *run_hook* under the repo's .venv interpreter; return the exit code.

    already in .venv / already re-exec'd -> run_hook() here;
    elsewhere -> re-run argv under .venv; no .venv -> 127
    """
    if not os.path.exists(VENV_PYTHON):
        print("[hook] No .venv found -- this hook cannot run.", file=sys.stderr)
        print(f"[hook] Expected an interpreter at: {VENV_PYTHON}", file=sys.stderr)
        print("[hook] Create it with: .\\tools\\setup\\setup.ps1  (or ./tools/setup/setup.sh)", file=sys.stderr)
        return 127

    if _same_interpreter(VENV_PYTHON, sys.executable) or os.environ.get(_REEXEC_FLAG):
        # 已正确，或 re-exec 已发生、这就是子进程；sentinel 防止误判后无限循环
        return run_hook()

    env = {**os.environ, _REEXEC_FLAG: "1"}
    if os.name == "nt":
        # os.execv replaces the process but does not hand over the console
        # handles cleanly on Windows, so run as a child and mirror its status.
        return subprocess.run([VENV_PYTHON, *sys.argv], env=env, check=False).returncode

    os.execve(VENV_PYTHON, [VENV_PYTHON, *sys.argv], env)  # noqa: S606 -- deliberate self-replace
    return 0  # unreachable
