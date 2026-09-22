"""Shared colored logging for CI/calibrate scripts.

Usage:
    from _logging import get_logger
    log = get_logger()

    log.info("OK check passed")
    log.warning("SKIP no log files")
    log.error("FAIL expected 3, got 2")

    # Logger helpers:
    log.print_header("check Python/Node prerequisites")
    log.print_step(1, 10, "ruff available", "$ ruff --version", 0, "")
    log.print_check(2, 10, "inline validation", True, detail="3 items, all green")
    log.print_summary(results, skipped)

Colors: ERROR → red, WARNING → yellow, INFO/DEBUG → default.
"""

from __future__ import annotations

import logging
import sys

RED = "\033[91m"
YELLOW = "\033[93m"
GREEN = "\033[92m"
CYAN = "\033[96m"
RESET = "\033[0m"
BOLD = "\033[1m"

_SEP1 = "=" * 100
_SEP2 = "-" * 100
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
    if _is_tty():
        return f"{color}{text}{RESET}"
    return text


# ── helpers that write via a logger instance ─────────────────────────


def _print_header(logger: logging.Logger, title: str, command: str = "") -> None:
    """Print a section header."""
    logger.info("")
    logger.info(_SEP1)
    logger.info("Function: " + title)
    if command:
        logger.info("Command:  " + command)
    logger.info(_SEP1)


def _print_step(
    logger: logging.Logger,
    step: int,
    total: int,
    name: str,
    command: str,
    returncode: int,
    stdout: str,
) -> None:
    """Print a single step result.

    Format:
    ----------------------------------------------------------------------------------------------------
    [k/N]  xxxxxx
    ----------------------------------------------------------------------------------------------------
    | command: xxxx
    | result:  xxxxxxx
    ----------------------------------------------------------------------------------------------------
    | 子进程的输出
    """
    tag = f"[{step:>2}/{total:<2}]"
    status = "OK" if returncode == 0 else f"FAIL (exit {returncode})"

    logger.info("")
    logger.info(_SEP2)
    logger.info(_c(CYAN, f"{tag}  {name}"))
    logger.info(_SEP2)
    logger.info(f"| Command: {command}")
    result_color = GREEN if returncode == 0 else RED
    logger.info(_c(result_color, f"| Result:  {status}"))
    logger.info(_SEP2)
    if stdout.strip():
        for line in stdout.strip().splitlines():
            logger.info("| " + line)
    logger.info(_SEP2)


def _print_hint(logger: logging.Logger, hint: str) -> None:
    """Print a fix hint after a failed step."""
    logger.info(_c(CYAN, f"| {'─' * 100}"))
    logger.info(_c(CYAN, f"| Hint: {hint}"))
    logger.info(_c(CYAN, f"| {'─' * 100}"))


def _print_check(
    logger: logging.Logger,
    step: int,
    total: int,
    name: str,
    ok: bool,
    detail: str = "",
    err: str = "",
) -> None:
    """Print a single inline check result (no subprocess).

    Format:
    ----------------------------------------------------------------------------------------------------
    [k/N]  xxxxxxxx
    ----------------------------------------------------------------------------------------------------
    | Result:  OK / FAIL
    | Detail:  xxxxxx          (only if detail provided)
    |          多行 detail      (detail 里的 \n 会被展开缩进)
    ----------------------------------------------------------------------------------------------------
    | ERR block               (only on failure)
    ----------------------------------------------------------------------------------------------------
    """
    tag = f"[{step:>2}/{total:<2}]"
    status = "OK" if ok else "FAIL"
    color = GREEN if ok else RED

    logger.info("")
    logger.info(_SEP2)
    logger.info(_c(CYAN, f"{tag}  {name}"))
    logger.info(_SEP2)
    logger.info(_c(color, f"| Result:  {status}"))
    if detail:
        for i, line in enumerate(detail.splitlines()):
            prefix = "| Detail:" if i == 0 else "|        "
            logger.info(f"{prefix} {line}")
    if err and not ok:
        logger.info(_SEP2)
        for line in err.splitlines():
            logger.info("| " + line)
    logger.info(_SEP2)


def _print_summary(logger: logging.Logger, results: list[tuple[str, str]], skipped: list[str]) -> int:
    """Print a structured summary block.

    ``results`` is a list of ``(name, status)`` where status is
    ``"ok"``, ``"fail"``, or ``"skip"``.

    ``skipped`` is a list of free-text descriptions for items that were
    not run (e.g. optional phases).

    Returns ``1`` if any check failed, ``0`` otherwise.
    """
    passed = [(n, s) for n, s in results if s == "ok"]
    failed = [(n, s) for n, s in results if s == "fail"]

    logger.info("")
    logger.info(_SEP2)
    logger.info(_c(CYAN, "Summary"))
    logger.info(_SEP2)
    logger.info(f"| Total : {len(results)} checks ran, {len(skipped)} skipped")

    if passed:
        logger.info(_c(GREEN, f"\n|  PASSED ({len(passed)})"))
        for name, _ in passed:
            logger.info(_c(GREEN, f"|  [OK   ] {name}"))
    if failed:
        logger.info(_c(RED, f"\n| FAILED ({len(failed)})"))
        for name, _ in failed:
            logger.info(_c(RED, f"|   [FAIL ] {name}"))
    if skipped:
        logger.info(_c(YELLOW, f"\nSKIPPED ({len(skipped)})"))
        for s in skipped:
            logger.info(_c(YELLOW, f"|   [SKIP ] {s}"))

    logger.info("")
    if failed:
        logger.info(_c(RED, f"| RESULT: {len(failed)} check(s) FAILED -- see output above for details."))
        logger.info(_SEP2)
        return 1
    logger.info(_c(GREEN, f"| RESULT: all {len(results)} checks passed."))
    logger.info(_SEP2)
    return 0


# ── extended logger class ────────────────────────────────────────────


class _CheckLogger(logging.Logger):
    """Logger subclass with convenience methods."""

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

    def print_check(
        self,
        step: int,
        total: int,
        name: str,
        ok: bool,
        detail: str = "",
        err: str = "",
    ) -> None:
        _print_check(self, step, total, name, ok, detail, err)

    def print_hint(self, hint: str) -> None:
        _print_hint(self, hint)

    def print_summary(self, results: list[tuple[str, str]], skipped: list[str]) -> int:
        return _print_summary(self, results, skipped)


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
    convenience methods.
    """
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
