"""Shared colored logging for CI/calibrate scripts.

Usage:
    from _logging import get_logger, ok_, fail_, skip_, bullet, phase
    log = get_logger()

    log.info("OK check passed")
    log.warning("SKIP no log files")
    log.error("FAIL expected 3, got 2")

    # Using standalone helpers (auto-colored):
    log.info(ok_("all checks passed"))
    log.warning(skip_("no logs found"))
    log.error(fail_("expected 3, got 2"))

    # Phase headers:
    log.info(phase("Phase 2 / Static checks"))

    # Logger helpers (handy for check_all.py):
    log.print_header("check Python/Node prerequisites", "$ pip ...")
    log.print_step(1, 10, "ruff available", "$ ruff --version", 0, "")
    log.print_summary(results, skipped)

Colors: ERROR \u2192 red, WARNING \u2192 yellow, INFO/DEBUG \u2192 default.
"""

from __future__ import annotations

import logging
import sys

RED = "\033[91m"
YELLOW = "\033[93m"
GREEN = "\033[92m"
CYAN = "\033[96m"
MAGENTA = "\033[95m"
RESET = "\033[0m"
BOLD = "\033[1m"

_SEP = "=" * 60
_COLOR_MAP = {
    logging.ERROR: RED,
    logging.WARNING: YELLOW,
}


def _is_tty() -> bool:
    try:
        return sys.stdout.isatty()
    except Exception:
        return False


def _c(color: str, text: str) -> str:
    """Apply color if stdout is a TTY."""
    if _is_tty():
        return f"{color}{text}{RESET}"
    return text


# ── standalone helpers (pass to log.info/warning/error) ──────────────


def ok_(msg: str) -> str:
    return _c(GREEN, msg)


def fail_(msg: str) -> str:
    return _c(RED, msg)


def skip_(msg: str) -> str:
    return _c(YELLOW, msg)


def bullet(msg: str) -> str:
    return _c(CYAN, f"\u2022 {msg}")


def phase(title: str, subtitle: str = "") -> str:
    out = _c(BOLD, f"\n  {title}")
    if subtitle:
        out += f"\n    {subtitle}"
    return out


# ── helpers that write via a logger instance ─────────────────────────


def _print_header(logger: logging.Logger, title: str, command: str = "") -> None:
    """Print a section header."""
    logger.info(_c(BOLD, f"\n  {title}"))
    if command:
        logger.info(f"    {command}")
    logger.info(_c(CYAN, f"  {'-' * 46}"))


def _print_step(
    logger: logging.Logger,
    step: int,
    total: int,
    name: str,
    command: str,
    returncode: int,
    stdout: str,
) -> None:
    """Print a single step result with command and output."""
    tag = f"[{step:>2}/{total:<2}]"
    indent = "      "

    logger.info(f"\n  {tag} {name}")
    logger.info(f"{indent}$ {command}")

    if stdout:
        for line in stdout.rstrip("\n").split("\n"):
            logger.info(f"{indent}| {line}")


def _print_summary(logger: logging.Logger, results: list[tuple[str, str]], skipped: list[str]) -> None:
    """Print a structured summary block.

    ``results`` is a list of ``(name, status)`` where status is
    ``"ok"``, ``"fail"``, or ``"skip"``.

    ``skipped`` is a list of free-text descriptions for items that were
    not run (e.g. optional phases).
    """
    passed = [(n, s) for n, s in results if s == "ok"]
    failed = [(n, s) for n, s in results if s == "fail"]

    logger.info(f"\n\n{_SEP}")
    logger.info(_c(BOLD, "  Summary"))
    logger.info(_SEP)
    logger.info(f"  Total : {len(results)} checks ran, {len(skipped)} skipped")
    logger.info("")

    if passed:
        logger.info(_c(GREEN, f"  PASSED ({len(passed)})"))
        for name, _ in passed:
            logger.info(f"    {_c(GREEN, '[OK   ]')} {name}")
    if failed:
        logger.info("")
        logger.info(_c(RED, f"  FAILED ({len(failed)})"))
        for name, _ in failed:
            logger.error(f"    {_c(RED, '[FAIL ]')} {name}")
    if skipped:
        logger.info("")
        logger.info(_c(YELLOW, f"  SKIPPED ({len(skipped)})"))
        for s in skipped:
            logger.warning(f"    {_c(YELLOW, '[SKIP ]')} {s}")

    logger.info("")


# ── extended logger class ────────────────────────────────────────────


class _CheckLogger(logging.Logger):
    """Logger subclass that adds ``print_header`` / ``print_step`` / ``print_summary`` methods."""

    def print_header(self, title: str, command: str = "") -> None:
        _print_header(self, title, command)

    def print_step(
        self,
        step: int,
        total: int,
        name: str,
        command: str,
        returncode: int,
        stdout: str = "",
    ) -> None:
        _print_step(self, step, total, name, command, returncode, stdout)

    def print_summary(self, results: list[tuple[str, str]], skipped: list[str]) -> int:
        _print_summary(self, results, skipped)
        failed = sum(1 for _, s in results if s == "fail")
        return 1 if failed else 0


class _ColoredFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        msg = super().format(record)
        if not _is_tty():
            return msg
        color = _COLOR_MAP.get(record.levelno, "")
        if color:
            return f"{color}{msg}{RESET}"
        return msg


def get_logger(name: str | None = None) -> _CheckLogger:
    """Get a logger configured for colored console output.

    The returned logger has ``print_header`` / ``print_step`` / ``print_summary``
    convenience methods for structured check output.
    """
    # Use our subclass so we can attach print_header etc.
    logging.setLoggerClass(_CheckLogger)
    logger = logging.getLogger(name or "ci")
    if logger.handlers:
        return logger  # type: ignore[return-value]
    logger.setLevel(logging.DEBUG)
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.DEBUG)
    handler.setFormatter(_ColoredFormatter("%(message)s"))
    logger.addHandler(handler)
    logger.propagate = False
    return logger  # type: ignore[return-value]
