"""Repository validation -- single entry point for CI, pre-push hook, and local runs .

All checks live in tools/ci/checklist.yml; hooks and workflows only call this script.

Stages (see checklist.yml; each is selectable with --stage):
  dev     -- not here: `pnpm dev` / `tsc --noEmit --watch` are long-running, no exit code
  commit  -- not here: .githooks/pre-commit formats staged files
  build   -- next build (slow; CI always, locally on demand)
  push    -- fast static checks + the log regression (local; the logs never reach CI)
  ci      -- artifact parity, guard self-test, dependency audit, E2E smoke
  deploy  -- not here: deploy.yml runs the live E2E

Output is phased, sequentially numbered across all phases, and ASCII-only
(never garbles on a GBK console).

Usage:
  python tools/ci/check_all.py                 # stages 1-6 (everything selectable)
  python tools/ci/check_all.py --stage push    # local pre-push fast path
  python tools/ci/check_all.py --stage ci      # cloud path
  python tools/ci/check_all.py --stage build   # next build only (explicit, never implied)
  python tools/ci/check_all.py --with-mutate   # also guard self-proof mutation tests (modifies files temporarily)
  python tools/ci/check_all.py --list-stages   # print stages and their steps, run nothing

The legacy flags (--pre-push / --with-build / --with-e2e) are kept as aliases.

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

# Parsed CLI arguments, filled in by main(). Held at module level because the
# `when` expressions in checklist.yml are evaluated with `args` in scope.
_ARGS: argparse.Namespace = argparse.Namespace()

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


def _build_placeholders(log_paths: list[str]) -> dict[str, str | list]:
    """Build the placeholder dictionary for _resolve().

    Includes:
      - {PYTHON}, {NODE}, {PNPM}, {ROOT}, {WEB}, {LOGS}
      - {ARGS.xxx} for CLI arguments (dash to underscore)
      - {ENV.XXX} for environment variables (replaced at resolve time)
    """
    placeholders: dict[str, str | list] = {
        "PYTHON": PY,
        "NODE": NODE or "node",
        # pnpm is a global tool, not a dependency of web/ -- it has no path under
        # web/node_modules, so it must be resolved through PATH like NODE. Hardcoding
        # a path here would make the audit step fail on every machine.
        "PNPM": PNPM or "pnpm",
        "ROOT": str(ROOT),
        "WEB": str(WEB),
        "LOGS": log_paths,
    }

    # {ARGS.xxx} -> "--xxx" if args.xxx is True, else "" if value is False, else str(value)
    for attr in dir(_ARGS):
        if attr.startswith("_"):
            continue
        value = getattr(_ARGS, attr)
        flag_name = attr.replace("_", "-")
        placeholders[f"ARGS.{attr}"] = (
            f"--{flag_name}" if value is True else str(value) if value is not None and value is not False else ""
        )

    # {ENV.XXX} -> os.environ.get("XXX", "")
    # These are resolved lazily in _resolve by looking up os.environ
    return placeholders


def _eval_when(when: str | list | None, has_logs: bool) -> bool:
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
        return all(_eval_when(w, has_logs) for w in when)

    context = {"args": _ARGS, "has_logs": has_logs}
    return eval(when, {"__builtins__": {}}, context)


def _load_checklist(
    has_logs: bool,
    log_paths: list[str],
) -> list[dict]:
    """Load checklist.yml, resolve placeholders and conditions.

    Returns a list of stage dicts: {id, name, description, critical, steps},
    where each step dict has keys:
      id, name, command (resolved list), workdir (resolved Path),
      hint, enabled (bool),
      timeout (int | None), extra_env (dict | None).

    Stages with no steps are dropped -- the dev / commit / deploy placeholders
    exist to be readable in the YAML, not to be executed.
    """
    placeholders = _build_placeholders(log_paths)

    with open(CHECKLIST_PATH, encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    stages: list[dict] = []
    for stage in raw["jobs"]:
        steps: list[dict] = []
        for step in stage["steps"]:
            enabled = _eval_when(step.get("when"), has_logs)
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
            stages.append(
                {
                    "id": stage.get("id", ""),
                    "name": stage["stage"],
                    "description": stage.get("description", ""),
                    "critical": stage.get("critical", False),
                    "steps": steps,
                }
            )
    return stages


# ── main ─────────────────────────────────────────────────────────────


def _print_stages(stages: list[dict]) -> None:
    """Print the stage map (for --list-stages): stage -> steps, nothing executed."""
    for stage in stages:
        log.info(f"# {stage['id']:<8} {stage['name']} \u2014 {stage['description']}")
        for step in stage["steps"]:
            state = "" if step["enabled"] else "  [off]"
            log.info(f"    - {step['id']:<20} {step['name']}{state}")


def main(argv: list[str]) -> int:
    global _ARGS

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument(
        "--stage",
        action="append",
        choices=["push", "ci", "build"],
        help="run only this stage (repeatable). Omit to run every stage.",
    )
    ap.add_argument("--list-stages", action="store_true", help="print stages and their steps, run nothing")
    ap.add_argument("--with-build", action="store_true", help="alias for --stage build")
    ap.add_argument(
        "--with-e2e",
        action="store_true",
        help="enable the E2E steps in the CI stage (smoke + the analyze flow)",
    )
    ap.add_argument(
        "--with-mutate", action="store_true", help="enable guard self-proof mutation tests (modifies files temporarily; slow)"
    )
    ap.add_argument("--skip-logs", action="store_true", help="skip the log-dependent steps")
    ap.add_argument("--pre-push", action="store_true", help="alias for --stage push")
    args = ap.parse_args(argv[1:])

    # --pre-push is the old name for --stage push. Normalise here so exactly one
    # mechanism decides which stages run -- keeping both would let `--stage push`
    # and `--pre-push` disagree about what is skipped.
    if args.pre_push:
        args.stage = ["push"]
    if args.with_build:
        stages_wanted = list(args.stage or [])
        if "build" not in stages_wanted:
            stages_wanted.append("build")
        args.stage = stages_wanted
    # --with-e2e / --with-mutate stay flags: they toggle a step inside the ci stage
    # rather than selecting a stage (mutate-guards alone would duplicate the checks job).
    _ARGS = args

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

    stages = _load_checklist(has_logs, log_paths)
    selected = args.stage or [s["id"] for s in stages]
    unknown = [s for s in selected if s not in {st["id"] for st in stages}]
    if unknown:
        # Only reachable if a stage id in the YAML differs from the --stage choices.
        log.error(f"unknown stage id(s): {', '.join(unknown)}")
        return 2
    stages = [s for s in stages if s["id"] in selected]

    if args.list_stages:
        log.print_header("Repository validation -- stage map", " ".join(selected))
        _print_stages([s for s in _load_checklist(has_logs, log_paths)])
        return 0

    # ---- Header ----
    cmd_parts = ["python tools/ci/check_all.py", "--stage", ",".join(selected)]
    if args.with_e2e:
        cmd_parts.append("--with-e2e")
    if args.with_mutate:
        cmd_parts.append("--with-mutate")
    if args.skip_logs:
        cmd_parts.append("--skip-logs")
    log.print_header("Repository validation -- CI / pre-push / local", " ".join(cmd_parts))

    # ====================================================================
    # Flatten (stage, step_dict) for ordered execution
    # ====================================================================

    all_steps: list[tuple[dict, dict]] = [(stage, step) for stage in stages for step in stage["steps"]]
    grand_total = sum(1 for _, s in all_steps if s["enabled"])

    # ====================================================================
    # Execute
    # ====================================================================

    all_results: list[tuple[str, str]] = []
    all_skipped: list[str] = []
    step_num = 0
    current_stage: str | None = None

    for stage, step in all_steps:
        # Print stage description when entering a new stage
        if stage["name"] != current_stage:
            current_stage = stage["name"]
            if stage["description"]:
                log.info(f"# {stage['name']} \u2014 {stage['description']}")

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
        if stage["critical"] and status == "fail":
            log.error(f"\nFAIL: critical stage '{stage['name']}' failed. See output above.")
            return 1

    # Log-dependent steps skipped for want of logs
    if not has_logs:
        log.warning(f"SKIP  ({logs_skip_reason})")
        log.info("NOTE: these are hard gates for rule/engine changes.")
        log.info("      A green CI does NOT mean regression-tested.")
        log.info("      Run locally: python tools/ci/check_all.py --stage push")

    # ====================================================================
    # Summary
    # ====================================================================
    return log.print_summary(all_results, all_skipped)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
