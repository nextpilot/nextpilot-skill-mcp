"""Check toolchain prerequisites — Python, Node, npm packages.

Exits 0 if all required tools are available, 1 otherwise.

Usage:
  python tools/common/check_prereq.py
  python tools/common/check_prereq.py --with-logs    # also check pyulog, yaml
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import shutil
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

ROOT = Path(__file__).resolve().parents[2]
PY = sys.executable

# ── type aliases ─────────────────────────────────────────────────────

_CheckResult = tuple[bool, str, str]
"""``(ok: bool, output: str, cmd_display: str)`` returned by check functions."""
_CheckFn = Callable[[str], _CheckResult]
"""Signature for a prerequisite check function."""


# ── helpers ──────────────────────────────────────────────────────────


def _run_cmd(cmd: list[str], cwd: Path = ROOT) -> tuple[subprocess.CompletedProcess | None, str]:
    """Run *cmd*, return ``(proc, cmd_display)``.

    ``proc`` is ``None`` when the command cannot be launched (OSError).
    """
    cmd_display = " ".join(str(c) for c in cmd)
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    try:
        proc = subprocess.run(
            [str(c) for c in cmd],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
        )
    except OSError:
        proc = None
    return proc, cmd_display


def _cmd_output(proc: subprocess.CompletedProcess) -> str:
    """Merge stdout and stderr from a completed process."""
    return (proc.stdout or "") + (proc.stderr or "")


# ── Python checks ────────────────────────────────────────────────────


def check_python_mods(mod: str) -> _CheckResult:
    """Check a Python tool/module is available.

    Tries two approaches:
    1. ``python -m <mod> --version`` (for CLI tools with ``__main__``).
    2. ``importlib.import_module(mod)`` in-process (for packages without ``__main__``).

    Returns ``(ok, output, cmd_display)``.
    """
    proc, cmd_display = _run_cmd([PY, "-m", mod, "--version"])
    if proc is not None and proc.returncode == 0:
        return True, _cmd_output(proc), cmd_display

    # Fallback: in-process import
    fallback_display = f'python -c "import {mod}; print({mod}.__version__)"'
    try:
        m = importlib.import_module(mod)
        ver = getattr(m, "__version__", "")
        return True, str(ver), fallback_display
    except Exception as exc:
        return False, str(exc), fallback_display


# ── Node checks ──────────────────────────────────────────────────────


def _verify_exe(mod: str, exe: str) -> _CheckResult:
    """Run ``<exe> --version`` and return ``(ok, output, cmd_display)``.

    Returns ``(False, ...)`` if the command cannot be launched or exits
    with a non-zero return code.
    """
    proc, cmd_display = _run_cmd([exe, "--version"])
    if proc is None:
        return False, f"[ERROR] failed to launch: {exe}", cmd_display
    output = _cmd_output(proc)
    if proc.returncode != 0:
        return False, f"[ERROR] {mod} exited with code {proc.returncode}: {output.strip()}", cmd_display
    return True, output, cmd_display


def _resolve_bin_cmd(mod: str, pkg_json: Path, bin_field: str | dict) -> str | None:
    """Resolve a runnable command for a package's ``bin`` entry.

    Returns an absolute path to an executable (``.cmd`` wrapper on Windows
    for JS scripts, or the raw bin path for native executables), or
    ``None`` if nothing usable is found.
    """
    # Determine bin name (the command name) and relative path
    if isinstance(bin_field, str):
        bin_name = mod
        bin_rel = bin_field
    elif isinstance(bin_field, dict):
        bin_name = next(iter(bin_field.keys()))
        bin_rel = next(iter(bin_field.values()))
    else:
        return None

    # On Windows, prefer the .cmd wrapper under node_modules/.bin/
    if os.name == "nt":
        cmd_wrapper = (pkg_json.parent.parent / ".bin" / f"{bin_name}.cmd").resolve()
        if cmd_wrapper.is_file():
            return str(cmd_wrapper)

    # Otherwise use the resolved script path
    bin_path = (pkg_json.parent / bin_rel).resolve()
    if bin_path.is_file():
        return str(bin_path)

    return None


def check_node_mods(mod: str) -> _CheckResult:
    """Check a Node tool or npm package is available.

    - If ``web/node_modules/<mod>/package.json`` exists:
      - If it has a ``bin`` field → run the binary to verify it works.
      - Otherwise → just the existence check is sufficient.
    - Otherwise → ``shutil.which`` + ``--version``.

    Returns ``(ok, output, cmd_display)``.
    """
    # npm package — check package.json under web/node_modules
    pkg_json = ROOT / "web" / "node_modules" / mod / "package.json"
    if pkg_json.is_file():
        try:
            meta = json.loads(pkg_json.read_text(encoding="utf-8"))
        except Exception as exc:
            return False, f"[ERROR] failed to read {pkg_json}: {exc}", str(pkg_json)

        bin_field = meta.get("bin")
        if bin_field:
            exe = _resolve_bin_cmd(mod, pkg_json, bin_field)
            if exe:
                return _verify_exe(mod, exe)
            return False, f"[ERROR] {mod}: bin '{bin_field}' not resolvable under node_modules", str(pkg_json.parent)

        return True, "", str(pkg_json.parent)

    # CLI tool on PATH
    exe = shutil.which(mod)
    if not exe:
        return False, f"[ERROR] {mod} not found on PATH", mod

    return _verify_exe(mod, exe)


def _run_checks(
    mods: list[str],
    check_fn: _CheckFn,
    step_no: int,
    total: int,
) -> tuple[int, list[str], list[tuple[str, str]]]:
    """Run a group of checks.

    Returns ``(next_step_no, failed_mods, results)`` where each result
    is ``(display_text, "ok"|"fail")``.
    """
    failed_mods: list[str] = []
    results: list[tuple[str, str]] = []
    for mod in mods:
        step_no += 1
        display = f"check {mod} available"
        ok, output, cmd_display = check_fn(mod)
        log.print_step(step_no, total, display, cmd_display, 0 if ok else 1, output)
        if not ok:
            failed_mods.append(mod)
        results.append((display, "ok" if ok else "fail"))
    return step_no, failed_mods, results


# ── main ─────────────────────────────────────────────────────────────


def main(argv: list[str]) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)

    ap = argparse.ArgumentParser(description="Check toolchain prerequisites")
    ap.add_argument("--with-logs", action="store_true", help="also check pyulog and yaml")
    args = ap.parse_args(argv[1:])

    cmd_str = "python tools/common/check_prereq.py"
    if args.with_logs:
        cmd_str += " --with-logs"
    log.print_header("check Python / Node toolchain prerequisites", cmd_str)

    # ---- Item lists ----
    python_mods = ["ruff", "pytest", "numpy"]
    if args.with_logs:
        python_mods += ["pyulog", "yaml"]

    node_mods = ["typescript", "next"]
    if shutil.which("node"):
        node_mods.insert(0, "node")

    total = len(python_mods) + len(node_mods)
    results: list[tuple[str, str]] = []
    hints: list[str] = []

    # ---- Run Python checks ----
    step_no, python_failed, python_results = _run_checks(python_mods, check_python_mods, 0, total)
    results.extend(python_results)
    for mod in python_failed:
        hints.append("pip install -r requirements-dev.txt" if mod == "ruff" else f"pip install {mod}")

    # ---- Run Node checks ----
    step_no, node_failed, node_results = _run_checks(node_mods, check_node_mods, step_no, total)
    results.extend(node_results)
    for mod in node_failed:
        if mod == "node":
            hints.append("Install Node.js 22+ (see README)")
    if any(m != "node" for m in node_failed):
        hints.append("cd web && pnpm install")

    if hints:
        for h in sorted(set(hints)):
            log.info(f"=> {h}")

    return log.print_summary(results, [])


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
