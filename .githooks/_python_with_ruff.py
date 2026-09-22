"""Find a Python interpreter that has ruff, and switch this process over to it.

Why this module exists: on this machine `python` resolves to the managed
interpreter (`.workbuddy/binaries/python/...`), which does NOT have ruff. Git
starts hooks with exactly that interpreter, while check_all.py runs ruff via
`sys.executable -m ruff` -- so without this probe every hook run fails with
`No module named ruff`. Measured: Git really does launch the hook with the
managed 3.13.12.

Exit code 127 means "no usable interpreter found". Git treats a hook exit of 127
as a warning and lets the commit through -- deliberate: the hook's job is to
remind, not to lock you out (the same principle as "an error message must say
what is missing").

Usage -- at the very top of a hook, before anything else:

    from _python_with_ruff import ensure_python_with_ruff
    raise SystemExit(ensure_python_with_ruff(run_hook))

`run_hook` is called ONLY when this process already runs under the right
interpreter. When it does not, this module re-runs the whole hook under the
right one and exits with that child's status, so the hook body never executes
twice under two different interpreters.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from collections.abc import Callable

# Written out rather than discovered: one more source of truth is one more thing
# that rots. If the machine changes, this line changes.
PREFERRED = "C:/Users/zhanfuyu/anaconda3/python.exe"

# Sentinel so a mis-detection cannot re-exec forever.
_REEXEC_FLAG = "NEXTPILOT_HOOK_REEXEC"


def _has_ruff(python: str) -> bool:
    try:
        proc = subprocess.run(
            [python, "-c", "import ruff"],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return proc.returncode == 0


def find_python_with_ruff() -> str | None:
    """Return the first candidate that can import ruff, else None.

    Order matters: the managed Python sits ahead of anaconda on PATH here, so
    checking PATH first would defeat the whole exercise.
    """
    candidates: list[str] = []
    if os.path.exists(PREFERRED):
        candidates.append(PREFERRED)
    which = shutil.which("python")
    if which and which not in candidates:
        candidates.append(which)
    candidates.append(sys.executable)

    for candidate in candidates:
        if _has_ruff(candidate):
            return candidate
    return None


def _same_interpreter(a: str, b: str) -> bool:
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


def ensure_python_with_ruff(run_hook: Callable[[], int]) -> int:
    """Run *run_hook* under an interpreter that has ruff; return the exit code.

    Three outcomes:
      * already right, or already re-exec'd once -> calls run_hook() here
      * wrong interpreter -> re-runs argv under the right one, returns its status
      * no interpreter has ruff -> prints what is missing, returns 127
    """
    target = find_python_with_ruff()

    if target is None:
        print("[hook] No Python with ruff found -- this hook cannot run.", file=sys.stderr)
        print(f"[hook] Looked for: {PREFERRED}", file=sys.stderr)
        print("[hook]            then `python` on PATH", file=sys.stderr)
        print("[hook] Verify with:", file=sys.stderr)
        print(f'[hook]   "{PREFERRED}" -c "import ruff"', file=sys.stderr)
        print("[hook] Skipping this hook (Git allows exit 127) -- fix the toolchain to enable it.", file=sys.stderr)
        return 127

    if _same_interpreter(target, sys.executable) or os.environ.get(_REEXEC_FLAG):
        # Either already correct, or the re-exec already happened and this is the
        # child. The sentinel is what stops a detection mistake from looping.
        return run_hook()

    env = {**os.environ, _REEXEC_FLAG: "1"}
    if os.name == "nt":
        # os.execv replaces the process but does not hand over the console
        # handles cleanly on Windows, so run as a child and mirror its status.
        return subprocess.run([target, *sys.argv], env=env, check=False).returncode

    os.execve(target, [target, *sys.argv], env)  # noqa: S606 -- deliberate self-replace
    return 0  # unreachable
