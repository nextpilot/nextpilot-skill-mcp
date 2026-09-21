"""Repository validation -- single entry point for CI, pre-push hook, and local runs .

All checks live in tools/ci/checklist.yml; hooks and workflows only call this script.

Stage 1  Toolchain prerequisites
Stage 2  Static checks (no .ulg log; blocks every CI commit)
Stage 3  Site build (--with-build only)
Stage 4  E2E smoke tests (--with-e2e only)
Stage 5  Log-dependent checks (need real .ulg; local only)

Output is phased, sequentially numbered across all phases, and ASCII-only
(never garbles on a GBK console).

Usage:
  python tools/ci/check_all.py                 # phases 1-2 + 5 if logs present
  python tools/ci/check_all.py --pre-push      # fast static + 5 if logs present
  python tools/ci/check_all.py --with-mutate   # also guard self-proof mutation tests (modifies files temporarily)
  python tools/ci/check_all.py --with-build    # also stage 3 (CI)
  python tools/ci/check_all.py --with-e2e      # also stage 4 (pre-push)
  python tools/ci/check_all.py --skip-logs     # phases 1-2 only

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
    """Run *cmd* in *workdir*, return the CompletedProcess.

    Optional *timeout* (seconds) and *extra_env* (per-step env vars merged
    on top of the current process environment) are supported.
    """
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
    """Run one step, print its status, return (name, "ok"|"fail").

    Supports optional *timeout* and *extra_env* forwarded to ``capture()``.
    """
    proc = capture(command, workdir, timeout=timeout, extra_env=extra_env)
    cmd_display = " ".join(str(c) for c in command)
    log.print_step(step_num, total, name, cmd_display, proc.returncode, proc.stdout)
    if proc.returncode != 0 and hint:
        log.print_hint(hint)
    return name, ("ok" if proc.returncode == 0 else "fail")


def _resolve(val: str | list, placeholders: dict[str, str | list]) -> str | list:
    """Replace placeholders like {PYTHON}, {ROOT}, {LOGS}, {ARGS.xxx}, {ENV.XXX} in a string or list.

    Supports list-valued placeholders (e.g., {LOGS}) which are expanded inline
    when the input itself is a list.
    """
    if isinstance(val, str):
        for key, value in placeholders.items():
            if isinstance(value, str):
                val = val.replace(f"{{{key}}}", value)
        # Handle {ENV.XXX} placeholders dynamically
        for match in re.finditer(r"\{ENV\.([^}]+)\}", val):
            env_name = match.group(1)
            env_value = os.environ.get(env_name, "")
            val = val.replace(match.group(0), env_value)
        return val
    if isinstance(val, list):
        resolved: list[str] = []
        for item in val:
            # Check if item is exactly a list-valued placeholder like "{LOGS}"
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


def _build_placeholders(args: argparse.Namespace, has_logs: bool, log_paths: list[str]) -> dict[str, str | list]:
    """Build the placeholder dictionary for _resolve().

    Includes:
      - {PYTHON}, {NODE}, {ROOT}, {WEB}, {LOGS}
      - {ARGS.xxx} for CLI arguments (dash to underscore)
      - {ENV.XXX} for environment variables (replaced at resolve time)
    """
    placeholders: dict[str, str | list] = {
        "PYTHON": PY,
        "NODE": NODE or "node",
        "ROOT": str(ROOT),
        "WEB": str(WEB),
        "LOGS": log_paths,
    }

    # {ARGS.xxx} -> "--xxx" if args.xxx is True, else "" if value is False, else str(value)
    for attr in dir(args):
        if attr.startswith("_"):
            continue
        value = getattr(args, attr)
        flag_name = attr.replace("_", "-")
        placeholders[f"ARGS.{attr}"] = (
            f"--{flag_name}" if value is True else str(value) if value is not None and value is not False else ""
        )

    # {ENV.XXX} -> os.environ.get("XXX", "")
    # These are resolved lazily in _resolve by looking up os.environ
    return placeholders


def _eval_when(when: str | list | None, args: argparse.Namespace, has_logs: bool) -> bool:
    """Evaluate a step's 'when' condition as a Python expression.

    Supports both a single string and a list (AND semantics — all must be true).
    If when is None, the step is always enabled.
    Available in expression context:
      - args: argparse.Namespace (CLI arguments)
      - has_logs: bool (whether .ulg/.bin log files exist)
    """
    if when is None:
        return True
    if isinstance(when, list):
        return all(_eval_when(w, args, has_logs) for w in when)

    context = {"args": args, "has_logs": has_logs}
    return eval(when, {"__builtins__": {}}, context)


def _load_checklist(
    args: argparse.Namespace,
    has_logs: bool,
    log_paths: list[str],
) -> list[tuple[str, str, bool, list[dict]]]:
    """Load checklist.yml, resolve placeholders and conditions.

    Returns [(stage_name, stage_description, critical, [step_dict, ...]), ...]
    where each step_dict has keys:
      id, name, command (resolved list), workdir (resolved Path),
      hint, enabled (bool),
      timeout (int | None), extra_env (dict | None).
    Only stages with at least one step are returned.
    """
    placeholders = _build_placeholders(args, has_logs, log_paths)

    with open(CHECKLIST_PATH, encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    stages: list[tuple[str, str, bool, list[dict]]] = []
    for stage in raw["jobs"]:
        steps: list[dict] = []
        for step in stage["steps"]:
            enabled = _eval_when(step.get("when"), args, has_logs)
            command = _resolve(step["command"], placeholders)
            workdir_str = _resolve(step["workdir"], placeholders)

            steps.append(
                {
                    "id": step["id"],
                    "name": step["name"],
                    "command": command,
                    "workdir": Path(workdir_str),
                    "hint": step.get("hint", ""),
                    "timeout": step.get("timeout"),
                    "extra_env": step.get("env"),
                    "enabled": enabled,
                }
            )
        if steps:
            stages.append((stage["stage"], stage.get("description", ""), stage.get("critical", False), steps))
    return stages


# ── main ─────────────────────────────────────────────────────────────


def main(argv: list[str]) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--with-build", action="store_true", help="include stage: site build (CI; slow)")
    ap.add_argument("--with-e2e", action="store_true", help="include stage: E2E smoke (pre-push)")
    ap.add_argument(
        "--with-mutate", action="store_true", help="include guard self-proof mutation tests (modifies files temporarily; slow)"
    )
    ap.add_argument("--skip-logs", action="store_true", help="skip the log-dependent stage")
    ap.add_argument("--pre-push", action="store_true", help="fast mode: skip heavy static checks (3 min)")
    args = ap.parse_args(argv[1:])

    log_dir = ROOT / "tools" / "calibrate" / "logs"
    logs = sorted(log_dir.glob("*.ulg")) + sorted(log_dir.glob("*.bin")) if not args.skip_logs else []
    has_logs = bool(logs)
    log_paths = [str(p) for p in logs]
    logs_skip_reason = (
        "skipped via --skip-logs" if args.skip_logs else f"no .ulg under {log_dir.relative_to(ROOT)} (expected in CI)"
    )

    # ---- Header ----
    cmd_parts = ["python tools/ci/check_all.py"]
    if args.pre_push:
        cmd_parts.append("--pre-push")
    if args.with_build:
        cmd_parts.append("--with-build")
    if args.with_e2e:
        cmd_parts.append("--with-e2e")
    if args.with_mutate:
        cmd_parts.append("--with-mutate")
    if args.skip_logs:
        cmd_parts.append("--skip-logs")
    log.print_header("Repository validation -- CI / pre-push / local", " ".join(cmd_parts))

    # ====================================================================
    # 1. Load checklist from YAML
    # ====================================================================

    stages = _load_checklist(args, has_logs, log_paths)

    # ====================================================================
    # 2. Flatten (stage_name, stage_desc, stage_critical, step_dict) for ordered execution
    # ====================================================================

    all_steps: list[tuple[str, str, bool, dict]] = [(pn, pd, pc, s) for pn, pd, pc, ss in stages for s in ss]
    grand_total = sum(1 for _, _, _, s in all_steps if s["enabled"])

    # ====================================================================
    # 3. Execute
    # ====================================================================

    all_results: list[tuple[str, str]] = []
    all_skipped: list[str] = []
    step_num = 0
    current_stage: str | None = None

    for stage_name, stage_desc, stage_critical, step in all_steps:
        # Print stage description when entering a new stage
        if stage_name != current_stage:
            current_stage = stage_name
            if stage_desc:
                log.info(f"# {stage_name} \u2014 {stage_desc}")

        if not step["enabled"]:
            all_skipped.append(f"{step['name']} -- skipped")
            continue

        step_num += 1
        name, status = run_step(
            step["name"],
            step["command"],
            step["workdir"],
            step["hint"],
            step_num,
            grand_total,
            timeout=step["timeout"],
            extra_env=step["extra_env"],
        )
        all_results.append((name, status))

        # Critical stage failure -> exit immediately (toolchain missing, nothing else will work)
        if stage_critical and status == "fail":
            log.error(f"\nFAIL: critical stage '{stage_name}' failed. See output above.")
            return 1

    # Stage 5 extra NOTE messages when skipped
    if not has_logs:
        log.warning(f"SKIP  ({logs_skip_reason})")
        log.info("NOTE: these are hard gates for rule/engine changes.")
        log.info("      A green CI does NOT mean regression-tested.")
        log.info("      Run locally: python tools/ci/check_all.py")

    # ====================================================================
    # 4. Summary
    # ====================================================================
    return log.print_summary(all_results, all_skipped)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
