"""Repository validation -- single entry point for CI, pre-push hook, and local runs.

All checks live here; hooks and workflows only call this one script.

Phase 1  Toolchain prerequisites
Phase 2  Static checks (no .ulg log; blocks every CI commit)
Phase 3  Site build (--with-build only)
Phase 4  E2E smoke tests (--with-e2e only)
Phase 5  Log-dependent checks (need real .ulg; local only)

Output is phased, sequentially numbered across all phases, and ASCII-only
(never garbles on a GBK console).

Usage:
  python tools/ci/check_all.py                 # phases 1-2 + 5 if logs present
  python tools/ci/check_all.py --with-build    # also phase 3 (CI)
  python tools/ci/check_all.py --with-e2e      # also phase 4 (pre-push)
  python tools/ci/check_all.py --skip-logs     # phases 1-2 only
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
LOG_DIR = ROOT / "tools" / "calibrate" / "logs"

PY = sys.executable
NODE = shutil.which("node")
TSC = WEB / "node_modules" / "typescript" / "bin" / "tsc"
ESLINT = WEB / "node_modules" / "eslint" / "bin" / "eslint.js"
NEXT = WEB / "node_modules" / "next" / "dist" / "bin" / "next"
PLAYWRIGHT = WEB / "node_modules" / "@playwright" / "test" / "cli.js"

SEP = "=" * 60


def capture(cmd: list, cwd: Path = ROOT) -> subprocess.CompletedProcess:
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    return subprocess.run(
        [str(c) for c in cmd],
        cwd=str(cwd),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )


def run_gate(name: str, cmd: list, cwd: Path, step: int, total: int) -> tuple[str, str]:
    """Run one check, print its status in a structured format.

    Format per step:
      [N/T] name
            $ command
            <subprocess output, each line prefixed with indent>
      [N/T] name  ..............  OK  (or FAIL)
    """
    tag = f"[{step:>2}/{total:<2}]"
    indent = "      "

    # Header
    log.info(f"\n  {tag} {name}")
    log.info(f"{indent}$ {' '.join(str(c) for c in cmd)}")

    # Run and capture -- print output line by line with indent
    # PYTHONIOENCODING=utf-8: subprocess Python writes UTF-8 stdout/stderr,
    # otherwise Windows defaults to GBK and we read GBK as UTF-8 = garbled text.
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    proc = subprocess.Popen(
        [str(c) for c in cmd],
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        stripped = line.rstrip("\n\r")
        log.info(f"{indent}| {stripped}")
    proc.wait()

    code = proc.returncode
    status = "OK" if code == 0 else f"FAIL (exit {code})"

    # Result line: pad name to a fixed width so OK/FAIL are vertically aligned
    SEP_WIDTH = 48
    dots = "." * max(2, SEP_WIDTH - len(name) - len(tag) - 2)
    if code == 0:
        log.info(f"  {tag} {name}  {dots}  {status}")
    else:
        log.error(f"  {tag} {name}  {dots}  {status}")
    log.info("")

    return name, ("ok" if code == 0 else "fail")


def run_prereq(name: str, cmd: list, cwd: Path, step: int, total: int) -> tuple[str, bool]:
    """Run a toolchain prereq check. Returns (name, available)."""
    tag = f"[{step:>2}/{total:<2}]"
    proc = capture(cmd, cwd)
    ok = proc.returncode == 0
    SEP_WIDTH = 48
    dots = "." * max(2, SEP_WIDTH - len(name) - len(tag) - 2)
    status = "OK" if ok else "MISSING"
    if ok:
        log.info(f"  {tag} {name}  {dots}  {status}")
    else:
        log.warning(f"  {tag} {name}  {dots}  {status}")
    return name, ok


def check_toolchain(logs: list[Path], step_start: int) -> tuple[int, int]:
    """Prereq checks -- return (count_of_failures, next_step_number)."""
    items: list[tuple[str, list]] = [
        ("ruff", [PY, "-m", "ruff", "--version"]),
        ("pytest", [PY, "-c", "import pytest"]),
        ("numpy", [PY, "-c", "import numpy"]),
    ]
    if NODE:
        items.append(("node", [str(NODE), "--version"]))
    else:
        items.append(("node", ["nonexistent-node-check"]))

    if logs:
        for mod in ("pyulog", "yaml"):
            items.append((mod, [PY, "-c", f"import {mod}"]))

    n = len(items)
    total = n + (2 if NODE else 0)  # extra 2: node_modules file checks
    failed = 0
    hints: list[str] = []
    step_no = step_start

    for name, cmd in items:
        display = f"check {name} available"
        _, ok = run_prereq(display, cmd, ROOT, step_no, step_start + total - 1)
        step_no += 1
        if not ok:
            failed += 1
            if name == "ruff":
                hints.append("  => pip install -r requirements-dev.txt")
            elif name in ("pytest", "numpy"):
                hints.append(f"  => pip install {name}")
            elif name == "node":
                hints.append("  => Install Node.js 22+ (see README)")
            elif name in ("pyulog", "yaml"):
                hints.append(f"  => pip install {name}")

    if hints:
        log.info(f"  {' ' * 40}  ----")
        for h in sorted(set(hints)):
            log.info(h)

    # Node_modules file-existence checks (avoid subprocess cwd issues)
    if NODE:
        for lbl, p in (("node_modules (typescript)", TSC), ("node_modules (next)", NEXT)):
            display = f"check {lbl} installed"
            ok = p.exists()
            SEP_WIDTH = 48
            tag = f"[{step_no:>2}/{step_start + total - 1:<2}]"
            dots = "." * max(2, SEP_WIDTH - len(display) - len(tag) - 2)
            status = "OK" if ok else "MISSING"
            if ok:
                log.info(f"  {tag} {display}  {dots}  {status}")
            else:
                log.warning(f"  {tag} {display}  {dots}  {status}")
            step_no += 1
            if not ok:
                failed += 1
        if not TSC.exists() or not NEXT.exists():
            log.info("  => cd web && pnpm install")

    return failed, step_no


def run_phase(phase_label: str, gates: list[tuple[str, list, Path]], step_start: int) -> tuple[list[tuple[str, str]], int]:
    """Run a list of gates, return (results, next_step_number)."""
    total = len(gates)
    results: list[tuple[str, str]] = []
    for i, (name, cmd, cwd) in enumerate(gates):
        step = step_start + i
        name2, result = run_gate(name, cmd, cwd, step, step_start + total - 1)
        results.append((name2, result))
    return results, step_start + total


# ---- Gate definitions ----

STATIC_GATES: list[tuple[str, list, Path]] = [
    ("Python style (ruff format --check)", [PY, "-m", "ruff", "format", "--check", "."], ROOT),
    ("Python lint (ruff check)", [PY, "-m", "ruff", "check", "."], ROOT),
    ("Operator / CEL sandbox unit tests (pytest)", [PY, "-m", "pytest", "engine/tests"], ROOT),
    ("Build contract vs artifact parity (build:kb --check)", [NODE, "scripts/build-knowledge.mjs", "--check"], WEB),
    ("Artifact is valid Python (check_artifact)", [PY, "tools/calibrate/check_artifact.py"], ROOT),
    ("engine/ stays pure Python shared by 3 sites (check_engine_purity)", [PY, "tools/ci/check_engine_purity.py"], ROOT),
    ("Type checking (tsc --noEmit)", [NODE, "node_modules/typescript/bin/tsc", "--noEmit"], WEB),
    ("TypeScript lint (eslint)", [NODE, "node_modules/eslint/bin/eslint.js", "."], WEB),
    ("Issue-filer self-test (fingerprint / scrub / allowlist / guards)", [NODE, "scripts/test-issue-filer.mjs"], WEB),
    ("Validator hygiene (check_hygiene)", [PY, "tools/ci/check_hygiene.py"], ROOT),
    ("Guard self-proof -- each guard must fail once", [PY, "tools/ci/mutate_guards.py"], ROOT),
]

BUILD_GATES: list[tuple[str, list, Path]] = [
    ("Site build (next build)", [NODE, "node_modules/next/dist/bin/next", "build"], WEB),
]

E2E_GATES: list[tuple[str, list, Path]] = [
    (
        "E2E smoke (Playwright @smoke: upload .ulg -> parse -> display)",
        [NODE, "node_modules/@playwright/test/cli.js", "test", "--grep", "@smoke"],
        WEB,
    ),
]

LOGS_GATES: list[tuple[str, list, Path]] = [
    ("Frozen baseline field-by-field diff (compare_baseline)", [PY, "tools/calibrate/compare_baseline.py"], ROOT),
    ("Adapter contract test (check_provider)", [], ROOT),
    ("Data-layer structure self-check (--probe-data)", [], ROOT),
    ("Field-reference lint (lint_rules --strict)", [PY, "tools/calibrate/lint_rules.py", "--strict"], ROOT),
]


def _logs_gates_with_logs(logs: list[Path]) -> list[tuple[str, list, Path]]:
    """Insert log file paths into the log-dependent gate commands."""
    return [
        ("Frozen baseline field-by-field diff (compare_baseline)", [PY, "tools/calibrate/compare_baseline.py"], ROOT),
        ("Adapter contract test (check_provider)", [PY, "tools/calibrate/check_provider.py", *[str(p) for p in logs]], ROOT),
        (
            "Data-layer structure self-check (--probe-data)",
            [PY, "tools/calibrate/run_checks_locally.py", "--probe-data", *[str(p) for p in logs]],
            ROOT,
        ),
        ("Field-reference lint (lint_rules --strict)", [PY, "tools/calibrate/lint_rules.py", "--strict"], ROOT),
    ]


def main(argv: list[str]) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--with-build", action="store_true", help="include phase: site build (CI; slow)")
    ap.add_argument("--with-e2e", action="store_true", help="include phase: E2E smoke (pre-push)")
    ap.add_argument("--skip-logs", action="store_true", help="skip the log-dependent phase")
    args = ap.parse_args(argv[1:])

    logs = sorted(LOG_DIR.glob("*.ulg")) + sorted(LOG_DIR.glob("*.bin")) if not args.skip_logs else []

    # ---- Header ----
    log.info("")
    log.info(SEP)
    log.info("  check_all.py")
    log.info("  Repository validation -- CI / pre-push / local")
    log.info(SEP)

    all_results: list[tuple[str, str]] = []
    all_skipped: list[str] = []

    step = 1

    # ============ Phase 1: Toolchain ============
    log.info("\n  Phase 1 / Toolchain prerequisites")
    log.info(f"  {'-' * 46}")
    failed_prereq, step = check_toolchain(logs, step)
    if failed_prereq:
        log.error(f"\n  FAIL: {failed_prereq} toolchain item(s) missing. Install per hints above.")
        return 1

    # ============ Phase 2: Static checks ============
    log.info("\n\n  Phase 2 / Static checks (no .ulg log; blocks every CI commit)")
    log.info(f"  {'-' * 46}")
    r, step = run_phase("static", STATIC_GATES, step)
    all_results += r

    # ============ Phase 3: Site build (optional) ============
    if args.with_build:
        log.info("\n\n  Phase 3 / Site build (--with-build)")
        log.info(f"  {'-' * 46}")
        r, step = run_phase("build", BUILD_GATES, step)
        all_results += r
    else:
        all_skipped.append("Site build (next build) -- add --with-build to include")

    # ============ Phase 4: E2E (optional) ============
    if args.with_e2e:
        log.info("\n\n  Phase 4 / E2E smoke tests (--with-e2e)")
        log.info(f"  {'-' * 46}")
        if os.environ.get("SKIP_LOG_ANALYSIS") == "1":
            log.info("  SKIP_LOG_ANALYSIS=1: excluding log-analysis smoke cases")
            E2E_GATES[0] = (E2E_GATES[0][0], E2E_GATES[0][1] + ["--grep-invert", "日志分析流程"], E2E_GATES[0][2])
        r, step = run_phase("e2e", E2E_GATES, step)
        all_results += r
    else:
        all_skipped.append("E2E smoke (Playwright) -- add --with-e2e to include")

    # ============ Phase 5: Log-dependent checks ============
    log.info("\n\n  Phase 5 / Log-dependent checks (need real .ulg; local only)")
    log.info(f"  {'-' * 46}")
    if not logs:
        reason = "skipped via --skip-logs" if args.skip_logs else f"no .ulg under {LOG_DIR.relative_to(ROOT)} (expected in CI)"
        log.warning(f"  SKIP  ({reason})")
        all_skipped.append(f"Log-dependent checks -- {reason}")
        log.info("  NOTE: these are hard gates for rule/engine changes.")
        log.info("        A green CI does NOT mean regression-tested.")
        log.info("        Run locally: python tools/ci/check_all.py")
    else:
        log.info(f"  Using {len(logs)} log(s): {', '.join(p.name for p in logs)}")
        lg = _logs_gates_with_logs(logs)
        r, step = run_phase("logs", lg, step)
        all_results += r

    # ============ Summary ============
    passed = [(n, r) for n, r in all_results if r == "ok"]
    failed = [(n, r) for n, r in all_results if r == "fail"]

    log.info(f"\n\n{SEP}")
    log.info("  Summary")
    log.info(SEP)
    log.info(f"  Total : {len(all_results)} checks ran, {len(all_skipped)} skipped")
    log.info("")

    if passed:
        log.info(f"  PASSED ({len(passed)})")
        for name, _ in passed:
            log.info(f"    [OK   ] {name}")
    if failed:
        log.error(f"\n  FAILED ({len(failed)})")
        for name, _ in failed:
            log.error(f"    [FAIL ] {name}")
    if all_skipped:
        log.info(f"\n  SKIPPED ({len(all_skipped)})")
        for s in all_skipped:
            log.warning(f"    [SKIP ] {s}")

    log.info("")
    if failed:
        log.error(f"  RESULT: {len(failed)} check(s) FAILED -- see output above for details.")
        return 1
    log.info(f"  RESULT: all {len(all_results)} checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))