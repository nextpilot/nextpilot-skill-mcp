"""Repository validation -- single entry point for CI, pre-push hook, and local runs.

All checks live in tools/ci/checklist.yml; hooks and workflows only call this script.

Seven equal switches (any combination):
  build / commit / push / ci / e2e / mutate / audit

Output is phased, sequentially numbered, and ASCII-only
(never garbles on a GBK console).

Usage:
  python tools/ci/check_all.py                         # build + commit + push + ci
  python tools/ci/check_all.py --push                  # local pre-push fast path
  python tools/ci/check_all.py --ci                    # cloud path
  python tools/ci/check_all.py --build                 # next build only
  python tools/ci/check_all.py --ci --e2e              # CI including E2E
  python tools/ci/check_all.py --mutate                # guard self-proof only
  python tools/ci/check_all.py --audit                 # dependency audit only
  python tools/ci/check_all.py --list                  # print checklist, run nothing

To add a new check: edit tools/ci/checklist.yml, that's it.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

ROOT = Path(__file__).resolve().parents[2]
PY = sys.executable
NODE = shutil.which("node")
PNPM = shutil.which("pnpm")
WEB = ROOT / "web"

CHECKLIST_PATH = Path(__file__).resolve().parent / "checklist.yml"

# ── helpers ──────────────────────────────────────────────────────────


class _TimeoutProc:
    """Fake subprocess.CompletedProcess returned when a command times out."""

    returncode = -1
    stdout = ""
    stderr = ""

    def __init__(self, timeout: int) -> None:
        self.stdout = f"\n\u23f1  Timed out after {timeout}s\n"


def capture(
    cmd: list, workdir: Path, *, timeout: int | None = None, extra_env: dict | None = None
) -> subprocess.CompletedProcess:
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    if extra_env:
        env.update(extra_env)
    try:
        return subprocess.run(
            [str(c) for c in cmd],
            cwd=str(workdir),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return _TimeoutProc(timeout)


def run_step(
    name: str,
    command: list,
    workdir: Path,
    hint: str,
    step_num: int,
    total: int,
    *,
    timeout: int | None = None,
    extra_env: dict | None = None,
) -> tuple[str, str]:
    proc = capture(command, workdir, timeout=timeout, extra_env=extra_env)
    cmd_display = " ".join(str(c) for c in command)
    log.print_step(
        step_num,
        total,
        name,
        cmd_display,
        proc.returncode,
        stdout=proc.stdout,
        stderr=proc.stderr,
        # 成功时给提示是噪声：hint 只在失败那一步出现。
        hint=hint if proc.returncode != 0 else "",
    )
    return name, ("ok" if proc.returncode == 0 else "fail")


def _resolve(val: str | list, placeholders: dict[str, str | list]) -> str | list:
    if isinstance(val, str):
        for key, value in placeholders.items():
            if isinstance(value, str):
                val = val.replace(f"{{{key}}}", value)
        for match in re.finditer(r"\{ENV\.([^}]+)\}", val):
            env_name = match.group(1)
            env_value = os.environ.get(env_name, "")
            val = val.replace(match.group(0), env_value)
        return val
    if isinstance(val, list):
        resolved: list[str] = []
        for item in val:
            if isinstance(item, str) and item.startswith("{") and item.endswith("}"):
                key = item[1:-1]
                if key in placeholders and isinstance(placeholders[key], list):
                    resolved.extend(str(v) for v in placeholders[key])
                    continue
            r = _resolve(item, placeholders)
            if isinstance(r, list):
                resolved.extend(str(v) for v in r)
            elif r != "":
                resolved.append(str(r))
        return resolved
    return val


def _build_placeholders(log_paths: list[str]) -> dict[str, str | list]:
    return {
        "PYTHON": PY,
        "NODE": NODE or "node",
        "PNPM": PNPM or "pnpm",
        "ROOT": str(ROOT),
        "WEB": str(WEB),
        "LOGS": log_paths,
    }


# ── when evaluation ──────────────────────────────────────────────────


def _check_when(when: list[str], active: set[str]) -> bool:
    """A job is enabled when ANY of its ``when`` conditions is in *active*."""
    if not when:
        return True
    return bool(set(when) & active)


# ── checklist loading ────────────────────────────────────────────────


def _load_checklist(active: set[str], log_paths: list[str]) -> list[dict]:
    """Load multi-document checklist.yml, resolve placeholders and conditions.
    Returns a flat list of step dicts.
    """
    placeholders = _build_placeholders(log_paths)

    with open(CHECKLIST_PATH, encoding="utf-8") as f:
        raw_jobs = list(yaml.safe_load_all(f))

    steps: list[dict] = []
    for job in raw_jobs:
        if not job:
            continue
        when = job.get("when", [])
        if isinstance(when, str):
            when = [when]

        enabled = _check_when(when, active)
        command = _resolve(job["command"], placeholders)
        workdir_str = _resolve(job["workdir"], placeholders)

        steps.append(
            {
                "id": job["id"],
                "name": job["name"],
                "command": command,
                "workdir": Path(workdir_str),
                "hint": job.get("hint", ""),
                "timeout": job.get("timeout"),
                "extra_env": job.get("env"),
                "enabled": enabled,
            }
        )
    return steps


# ── main ─────────────────────────────────────────────────────────────


def _print_checklist(steps: list[dict]) -> None:
    for step in steps:
        state = "" if step["enabled"] else "  [off]"
        log.info(f"    - {step['id']:<30} {step['name']}{state}")


def main(argv: list[str]) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--build", action="store_true", help="enable build checks (next build)")
    ap.add_argument("--commit", action="store_true", help="enable commit checks (staged files)")
    ap.add_argument("--push", action="store_true", help="enable pre-push checks")
    ap.add_argument("--ci", action="store_true", help="enable CI checks")
    ap.add_argument("--e2e", action="store_true", help="enable E2E checks")
    ap.add_argument(
        "--mutate", action="store_true", help="enable guard self-proof mutation tests (slow, modifies files temporarily)"
    )
    ap.add_argument("--audit", action="store_true", help="enable pip-audit / pnpm-audit (manual trigger only)")
    ap.add_argument("--list", dest="list_checks", action="store_true", help="print checklist, run nothing")
    ap.add_argument("--skip-logs", action="store_true", help="skip the log-dependent steps")
    args = ap.parse_args(argv[1:])

    # ── Active conditions ──
    SWITCHES = ("build", "commit", "push", "ci", "e2e", "mutate", "audit")
    active = {name for name in SWITCHES if getattr(args, name)}
    if not active:
        active = {"build", "commit", "push", "ci"}

    log_dir = ROOT / "tools" / "testdata" / "logs"
    logs = (
        sorted(log_dir.glob("*.ulg")) + sorted(log_dir.glob("*.bin")) + sorted(log_dir.glob("*.BIN"))
        if not args.skip_logs
        else []
    )
    has_logs = bool(logs)
    log_paths = [str(p) for p in logs]
    logs_skip_reason = (
        "skipped via --skip-logs" if args.skip_logs else f"no .ulg/.BIN under {log_dir.relative_to(ROOT)} (expected in CI)"
    )

    if has_logs:
        active.add("logs")

    steps = _load_checklist(active, log_paths)

    if args.list_checks:
        log.print_header("Repository validation -- checklist", " ".join(f"--{s}" for s in sorted(active) if s != "logs"))
        _print_checklist(steps)
        return 0

    # ── Header ──
    cmd_parts = ["python tools/ci/check_all.py"]
    for f in SWITCHES:
        if getattr(args, f):
            cmd_parts.append(f"--{f}")
    if args.skip_logs:
        cmd_parts.append("--skip-logs")
    log.print_header("Repository validation", " ".join(cmd_parts))

    # ── Execute ──
    enabled_steps = [s for s in steps if s["enabled"]]
    grand_total = len(enabled_steps)

    all_results: list[tuple[str, str]] = []
    all_skipped = [s["id"] for s in steps if not s["enabled"]]
    step_num = 0

    if all_skipped:
        if has_logs:
            log.info(f"[logs] {len(logs)} log file(s) detected")
        else:
            log.info(f"[logs] {logs_skip_reason}")
        log.info(f"[skip] {', '.join(all_skipped)}")

    for step in enabled_steps:
        step_num += 1
        result_name, status = run_step(
            step["name"],
            step["command"],
            step["workdir"],
            step["hint"],
            step_num,
            grand_total,
            timeout=step["timeout"],
            extra_env=step["extra_env"],
        )
        all_results.append((result_name, status))

    # ── Summary ──
    failures = [(name, status) for name, status in all_results if status == "fail"]
    if failures:
        log.error(f"\n--- {len(failures)} FAILURE(S) ---")
        for name, _ in failures:
            log.error(f"  FAIL: {name}")
        return 1

    log.info(f"\nAll {len(all_results)} check(s) passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
