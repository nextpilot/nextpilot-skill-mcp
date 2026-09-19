"""Shared colored logging for CI/calibrate scripts.

Usage:
    from _logging import get_logger
    log = get_logger()

    log.info("OK check passed")
    log.warning("SKIP no log files")
    log.error("FAIL expected 3, got 2")

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

_COLOR_MAP = {
    logging.ERROR: RED,
    logging.WARNING: YELLOW,
}


def _is_tty() -> bool:
    try:
        return sys.stdout.isatty()
    except Exception:
        return False


class _ColoredFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        msg = super().format(record)
        if not _is_tty():
            return msg
        color = _COLOR_MAP.get(record.levelno, "")
        if color:
            return f"{color}{msg}{RESET}"
        return msg


def get_logger(name: str | None = None) -> logging.Logger:
    """Get a logger configured for colored console output."""
    logger = logging.getLogger(name or "ci")
    if logger.handlers:
        return logger
    logger.setLevel(logging.DEBUG)
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.DEBUG)
    handler.setFormatter(_ColoredFormatter("%(message)s"))
    logger.addHandler(handler)
    logger.propagate = False
    return logger
