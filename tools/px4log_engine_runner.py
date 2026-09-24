"""本地校准/验证的命令行入口：在真实 .ulg 上跑 knowledge/engine/ 的 Python 源。

**装配逻辑不在本文件里**——它已下沉到 `knowledge/engine/loader.py`。本文件只做两件事：

1. **薄转发**：把既有调用点（`guards/` `tests/` `calibrate/` 共 8 处）用到的名字按签名
   转发过去，import 路径与签名保持不变。
2. **命令行外壳**：提供输出与退出码（用 `tools/_logging.py` 的清单式输出）。

为什么装配逻辑要住在 `engine/` 而不是这里：`server/` 是产品、`tools/` 是开发工具，
产品依赖开发工具会把 `_logging.py` 那条线（把 handler 挂在 `sys.stdout` 上）埋到 stdio
协议线旁边。所以装配入口归 engine，本文件退回成命令行外壳。

放在 `tools/` 根目录而不是某个子目录：它被 `guards/` `tests/` `calibrate/` 三处的脚本共同
import，只有根目录能被各自那句「插 parent.parent 进 sys.path」覆盖到。

用法：
  python tools/px4log_engine_runner.py <file.ulg> [more.ulg ...]
  python tools/px4log_engine_runner.py --probe-data <file.ulg> ...

**规则读构建产物**（`web/workers/pyodide-px4log-engine.ts` 的 `const rules = [...]`），
所以改了 `knowledge/px4/rules/` 要先 `cd web && pnpm build:kb` 再回归（loader 会检查陈旧）。

任何一份日志出错都以**非零退出码**结束（`check_all.py` 只看退出码）。别把它改回"只打印、
不计数"——那会让这一项永远绿着，而它其实什么都没检（见 CLAUDE.md §6.6）。
"""

import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _logging import get_logger  # noqa: E402

# 装配逻辑的唯一实现在 engine/ 里；插路径后按签名转发（含被外部依赖的私有名）
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "knowledge" / "engine"))
import loader  # noqa: E402
from loader import (  # noqa: E402
    build_namespace,
    call,
    load_facts_payload,
    load_field_units,
    run_one,
)

# 这些转发名不是本文件用的：guards/ tests/ calibrate/ 的既有调用点仍
# `from px4log_engine_runner import ...`，列进 __all__ 既保住转发又过 ruff F401。
__all__ = [
    "build_namespace",
    "call",
    "load_facts_payload",
    "load_field_units",
    "probe_one",
    "run_one",
]

_load_rules = loader.load_rules  # dev/workbench.py 直接 import 过这个私有名，保名转发

log = get_logger()


def probe_one(path: Path) -> dict:
    """对数据层三个 API 做结构 / JSON 合法性 / 降采样点数的自检。

    注意：本函数只负责**数据层探查**（纯 driver 角色），断言检查由 main() 的
    `--probe-data` 分支通过 `print_check` 完成。返回 dict 里附带 `_probe_errors`
    收集探查过程中的非致命问题（如 series 返回 error 字段），供上层决定是否 fail。
    """
    ns = build_namespace(path)
    manifest = call(ns, "np_manifest()")
    info = call(ns, "np_log_info()")
    topics = manifest["topics"]

    errors: list[str] = []

    sample = None
    for t in topics:
        if t["n"] > 2:
            sample = t
            break
    series = None
    if sample:
        fld = sample["fields"][0]["name"]
        req = {
            "instance": sample["instance"],
            "ydata": [{"kind": "field", "fields": [f"{sample['topic']}.{fld}"]}],
        }
        try:
            series = call(ns, f"np_series({json.dumps(json.dumps(req, ensure_ascii=False))}, 3000)")
        except Exception as exc:
            errors.append(f"np_series 调用抛异常：{type(exc).__name__}: {exc}")

    checks = {
        "topics": len(topics),
        "messages": len(info["messages"]),
        "messagesEvent": sum(1 for m in info["messages"] if m.get("kind") == "event"),
        "infoDict": len(info.get("infoDict") or []),
        "messagesMulti": len(info.get("messagesMulti") or []),
        "phases": len(info["phases"]),
        "params": len(info["params"]),
        "defaultParams": len(info.get("defaultParams") or {}),
        "defaultParamsKnown": info.get("defaultParamsKnown"),
        "dropouts": len(info["dropouts"]),
        "sysInfoKeys": sorted(info["sysInfo"].keys()),
    }
    if series is not None:
        if series.get("error"):
            errors.append(f"np_series 返回 error 字段：{series['error']}")
        checks["seriesField"] = sample["topic"] + "#" + str(sample["instance"]) + "." + fld
        checks["seriesPoints"] = len(series.get("t", []))
        checks["fullCount"] = series.get("fullCount")
        raw = json.dumps(series)
        if "NaN" in raw or "Infinity" in raw:
            errors.append("series JSON 泄漏 NaN/Infinity（应已转 null）")
        if checks["seriesPoints"] > 3000:
            errors.append(f"降采样点数超标：{checks['seriesPoints']} > 3000")
        if checks["seriesPoints"] == 0:
            errors.append(f"series 一个点都没取到（field={checks['seriesField']}）")
    else:
        errors.append(f"没能抽到任何有采样的 topic（topics={len(topics)}），series 这条路没被检")

    checks["_probe_errors"] = errors
    return checks


def _probe_checks(path: Path) -> tuple[list[tuple[str, str]], dict]:
    """对一份日志跑 probe_one 并把结果拆成结构化 check 列表。"""
    result = probe_one(path)
    errors = result.pop("_probe_errors")
    checks: list[tuple[str, str]] = []

    checks.append(("topics > 0", "ok" if result["topics"] > 0 else "fail"))
    checks.append(("messages > 0", "ok" if result["messages"] > 0 else "fail"))
    checks.append(("params > 0", "ok" if result["params"] > 0 else "fail"))
    checks.append(("phases >= 1", "ok" if result["phases"] >= 1 else "fail"))
    checks.append(("sysInfoKeys 非空", "ok" if result["sysInfoKeys"] else "fail"))

    has_series = "seriesField" in result
    if has_series:
        checks.append(("seriesPoints > 0", "ok" if result["seriesPoints"] > 0 else "fail"))
        checks.append(("seriesPoints <= 3000", "ok" if result["seriesPoints"] <= 3000 else "fail"))
        checks.append(("series JSON 无 NaN/Infinity", "ok" if not any("NaN/Infinity" in e for e in errors) else "fail"))

    checks.append((f"np_series 无错误 ({'有抽中 topic' if has_series else '无可用 topic'})", "ok" if not errors else "fail"))

    return checks, result


def main(argv: list[str]) -> int:
    args = argv[1:]
    probe = bool(args) and args[0] == "--probe-data"
    if probe:
        args = args[1:]
    if not args:
        log.info(__doc__)
        return 2

    if probe:
        return _main_probe(args)
    return _main_run(args)


def _main_run(args: list[str]) -> int:
    log.print_header(
        "本地回归 (run_one)",
        f"python {Path(__file__).name} {' '.join(args)}",
    )
    failed = 0
    for name in args:
        path = Path(name)
        log.info(f"\n· {path.name}")
        try:
            log.info(json.dumps(run_one(path), ensure_ascii=False, indent=2))
        except Exception as exc:
            failed += 1
            log.error(f"ERROR: {type(exc).__name__}: {exc}")
    if failed:
        log.error(f"\n=== {failed} 份日志出错 ===")
    else:
        log.info(f"\n=== {len(args)} 份日志全部完成 ===")
    return 1 if failed else 0


def _main_probe(args: list[str]) -> int:
    log.print_header(
        "数据层结构自检 (probe-data)",
        f"python {Path(__file__).name} --probe-data {' '.join(args)}",
    )

    all_results: list[tuple[str, str]] = []
    for name in args:
        path = Path(name)
        try:
            checks, summary = _probe_checks(path)
        except Exception as exc:
            log.error(f"ERROR: {path.name} — {type(exc).__name__}: {exc}")
            all_results.append((f"{path.name} 探查阶段抛异常", "fail"))
            continue

        log.info(f"\n· {path.name}")
        total = len(checks)
        for i, (name, status) in enumerate(checks, 1):
            ok = status == "ok"
            detail = ""
            if not ok and name.startswith("np_series 无错误"):
                detail = "探查阶段收集到的错误已在前面的 fail 中体现"
            log.print_check(i, total, name, ok, detail=detail)
        log.info(f"摘要：{json.dumps(summary, ensure_ascii=False)}")
        all_results.extend((f"{path.name} — {c}", s) for c, s in checks)

    return log.print_summary(all_results, [])


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
