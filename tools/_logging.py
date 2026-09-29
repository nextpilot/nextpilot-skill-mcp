# 所有 CI/校验脚本唯一的输出出口：级别消息、结构化块、伪进度条的流式写入都走这里。
#
# 分流：正常消息与结构化块走 stdout；log.err() 走 stderr，供调用方 2> 单独收集。
# 颜色只在 stdout 是 TTY 时加，重定向到文件时输出纯文本（比对与 grep 依赖这点）。
# 格式化串一律用 %s/%d 占位符而不是 f-string：f-string 在调用点就求值，日志级别过滤救不了。
# 消息里不要带时间戳，格式统一交给上层（CI 日志已由流水线打时间）。

from __future__ import annotations

import logging
import sys

RED = "\033[91m"
YELLOW = "\033[93m"
GREEN = "\033[92m"
CYAN = "\033[96m"
RESET = "\033[0m"
BOLD = "\033[1m"

_SEP1 = "=" * 80
_SEP2 = "-" * 80
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


def _write_raw(text: str, end: str = "") -> None:
    """流式直写 stdout，绕过 logging 的按行缓冲，供伪进度条在同一行原地刷新。"""
    sys.stdout.write(text + end)
    sys.stdout.flush()


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
    """Print a single step result: [k/N] name, then command / result / subprocess output."""
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
    logger.info(_c(CYAN, f"| {'─' * 80}"))
    logger.info(_c(CYAN, f"| Hint: {hint}"))
    logger.info(_c(CYAN, f"| {'─' * 80}"))


def _print_check(
    logger: logging.Logger,
    step: int,
    total: int,
    name: str,
    ok: bool,
    detail: str = "",
    err: str = "",
) -> None:
    """Print a single inline check result (no subprocess): Result, Detail
    (detail 里的 \n 会展开缩进), and an ERR block on failure.
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

    ``results`` is a list of ``(name, status)`` with status in
    ``"ok"``/``"fail"``/``"skip"``; ``skipped`` holds free-text descriptions of
    items not run. Returns ``1`` if any check failed, ``0`` otherwise.
    """
    passed = [(n, s) for n, s in results if s == "ok"]
    failed = [(n, s) for n, s in results if s == "fail"]

    logger.info("")
    logger.info(_SEP2)
    logger.info(_c(CYAN, "Summary"))
    logger.info(_SEP2)
    logger.info(f"| Total : {len(results)} checks ran, {len(skipped)} skipped")

    if passed:
        logger.info(_c(GREEN, f"|\n|  PASSED ({len(passed)})"))
        for name, _ in passed:
            logger.info(_c(GREEN, f"|  [OK   ] {name}"))
    if failed:
        logger.info(_c(RED, f"|\n| FAILED ({len(failed)})"))
        for name, _ in failed:
            logger.info(_c(RED, f"|   [FAIL ] {name}"))
    if skipped:
        logger.info(_c(YELLOW, f"|\n| SKIPPED ({len(skipped)})"))
        for s in skipped:
            logger.info(_c(YELLOW, f"|   [SKIP ] {s}"))

    logger.info("|")
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

    def err(self, msg: object, *args: object) -> None:
        """错误消息，落 stderr；`log.error()` 同义，失败路径优先用这个更直白。"""
        self.error(msg, *args)

    def write(self, text: str, end: str = "") -> None:
        """不换行直写 stdout，专供伪进度条刷新。"""
        _write_raw(text, end)

    def write_line(self, text: str = "") -> None:
        """直写一行 stdout，结束进度条后收尾用。"""
        _write_raw(text, "\n")

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


class _StderrFormatter(logging.Formatter):
    """stderr 侧不带级别前缀，消息本身已由调用方写明 FAIL / ERROR。"""

    def format(self, record: logging.LogRecord) -> str:
        return super().format(record)


class _BelowError(logging.Filter):
    """stdout 侧只收 ERROR 以下，让错误唯一地落在 stderr，避免双打。"""

    def filter(self, record: logging.LogRecord) -> bool:
        return record.levelno < logging.ERROR


def _add_stdout_handler(logger: logging.Logger) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.DEBUG)
    handler.addFilter(_BelowError())
    handler.setFormatter(_ColoredFormatter("%(message)s"))
    # 打标记：带标记的 handler 才算已装过，避免重复 get_logger 时叠加
    handler._np_stream = "stdout"  # type: ignore[attr-defined]
    logger.addHandler(handler)


def _add_stderr_handler(logger: logging.Logger) -> None:
    handler = logging.StreamHandler(sys.stderr)
    handler.setLevel(logging.ERROR)
    handler.setFormatter(_StderrFormatter("%(message)s"))
    handler._np_stream = "stderr"  # type: ignore[attr-defined]
    logger.addHandler(handler)


def get_logger(name: str | None = None) -> _CheckLogger:
    """Get a logger configured for colored console output, with
    ``print_header`` / ``print_step`` / ``print_check`` / ``print_summary`` helpers.
    """
    logging.setLoggerClass(_CheckLogger)
    logger = logging.getLogger(name or "ci")
    streams = {getattr(h, "_np_stream", None) for h in logger.handlers}
    # 不早退：别的模块可能已建过同名 logger（只装了 stdout handler），此时 err() 会静默丢消息。
    if "stdout" not in streams:
        _add_stdout_handler(logger)
    if "stderr" not in streams:
        _add_stderr_handler(logger)
    logger.setLevel(logging.DEBUG)
    logger.propagate = False
    return logger  # type: ignore[return-value]
