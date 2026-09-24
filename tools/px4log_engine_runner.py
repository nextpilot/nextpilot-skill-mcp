"""本地校准/验证用：直接跑 knowledge/engine/ 下的 Python 源，在真实 .ulg 上验证。

放在 tools/ 根目录而不是某个子目录：它被 guards/ tests/ calibrate/ 三处的脚本共同
import，只有根目录能被各自那句「插 parent.parent 进 sys.path」覆盖到。

用法：
  python tools/px4log_engine_runner.py <file.ulg> [more.ulg ...]
  python tools/px4log_engine_runner.py --probe-data <file.ulg> ...

引擎实现在 knowledge/engine/（本脚本直接读源码，改完即可跑）；**规则读构建产物**
（web/workers/pyodide-px4log-engine.ts 的 `const rules = [...]`）。
为什么不直接读 rules/*.yaml：compute 的老节点写法要编译成表达式，而那份编译器只有构建期
一份（web/scripts/lib/rule-expr.mjs）——Python 侧不再重复实现（两份一定漂移）。
所以**改了 rules/ 要先 `cd web && pnpm build:kb` 再回归**，脚本会检查产物是否陈旧。

任何一份日志出错都以**非零退出码**结束（`check_all.py` 只看退出码）。别把它改回"只打印、
不计数"——那会让这一项永远绿着，而它其实什么都没检（见 CLAUDE.md §6.6）。
"""

import json
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

REPO_ROOT = Path(__file__).resolve().parents[1]
KN_PX4 = REPO_ROOT / "knowledge" / "px4"  # 规则与阈值（知识）
ENGINE = REPO_ROOT / "knowledge" / "engine"  # 引擎源码（通用算子与框架）
OPERATORS_PY = ENGINE / "operators.py"
PROVIDER_API_PY = ENGINE / "providers" / "api.py"  # provider 契约（常量表 + 自检）
# 适配器目录：**自动扫描**（与 web/scripts/build-knowledge.mjs 同一规则：除 api.py 外全部拼接，
# 按文件名排序）——加一种日志格式这里零改动，别再回到硬编码单文件（那样新适配器本地永远测不到）
PROVIDER_DIR = ENGINE / "providers"
PROVIDER_FILES = sorted(p for p in PROVIDER_DIR.glob("*.py") if p.name != "api.py")
RULE_ENGINE_PY = ENGINE / "rule_engine.py"
REPORT_DATA_PY = ENGINE / "report_data.py"
RULES_DIR = KN_PX4 / "rules"
FACTS_YAML = KN_PX4 / "facts.yaml"  # PX4 的数据（码表/文案/展示口径/规则元数据）
FAULT_KB_JSON = REPO_ROOT / "web" / "workers" / "fault-kb.generated.json"
CHECK_SCRIPT = REPO_ROOT / "web" / "workers" / "pyodide-px4log-engine.ts"


def _load_rules() -> list:
    """从构建产物里取规则（compute 已是表达式形态，老节点写法在构建期被编译掉了）。"""
    if not CHECK_SCRIPT.exists():
        raise RuntimeError("还没有构建产物，先 cd web && pnpm build:kb")
    stale = [f.name for f in RULES_DIR.glob("*.yaml") if f.stat().st_mtime > CHECK_SCRIPT.stat().st_mtime]
    if stale:
        raise RuntimeError("构建产物比规则陈旧（%s 改过），先 cd web && pnpm build:kb 再回归" % "、".join(sorted(stale)[:5]))
    src = CHECK_SCRIPT.read_text(encoding="utf-8")
    m = re.search(r"^const rules = (.*?);$", src, re.M | re.S)
    if not m:
        raise RuntimeError("产物里找不到 `const rules = ...`，先 cd web && pnpm build:kb")
    return json.loads(m.group(1))


def load_field_units() -> dict:
    """字段单位表（`ref(..., unit=)` 的源单位）——同样从产物里取，与浏览器用的是同一份。

    它是构建期按 meta/<tag>.json + meta/topic-overrides.yaml 查好的；本地这边不重算
    （那要再实现一遍查表逻辑），直接读产物，保证两边一致。
    """
    src = CHECK_SCRIPT.read_text(encoding="utf-8")
    m = re.search(r"^const fieldUnits = (.*?);$", src, re.M | re.S)
    if not m:
        raise RuntimeError("产物里找不到 `const fieldUnits = ...`，先 cd web && pnpm build:kb")
    return json.loads(m.group(1))


def load_facts_payload() -> dict:
    """provider 拿到的那份数据配置 —— **从产物里取**（`const facts = {...}`）。

    为什么要从产物取、而不是本地重新装配：facts.yaml 与 plot/ 下的地图声明是**构建期**
    合流的（预设要编译成候选组、单位要查表），本地再装配一遍就是"同一份规则有两处实现"——
    两边一旦不一致，本地的表现是"轨迹声明丢了"（`get_flight_track()` 返回 error），
    而浏览器没事。2026-09-17 与 2026-09-18 各踩过一次，所以改成只认产物。
    """
    src = CHECK_SCRIPT.read_text(encoding="utf-8")
    m = re.search(r"^const facts = (.*?);$", src, re.M | re.S)
    if not m:
        raise RuntimeError("产物里找不到 `const facts = ...`，先 cd web && pnpm build:kb")
    return json.loads(m.group(1))


def _load_checks() -> str:
    body = RULE_ENGINE_PY.read_text(encoding="utf-8")

    entries = json.loads(FAULT_KB_JSON.read_text(encoding="utf-8"))["entries"]
    body = body.replace("__FAULT_KB__", repr(entries))

    # 阈值已随经验内联（px4-thresholds.toml 退场），无需再注入
    body = body.replace("__RULES__", json.dumps(_load_rules(), ensure_ascii=False))

    # 数据配置（facts.yaml + plot/track.yml），与构建期内联的是同一份
    body = body.replace("__FACTS__", json.dumps(load_facts_payload(), ensure_ascii=False))
    body = body.replace("__FIELD_UNITS__", json.dumps(load_field_units(), ensure_ascii=False))
    return body


def build_namespace(path: Path) -> dict:
    # 顺序与线上一致：算子注册表 → provider 契约 → 各格式适配器（文件名序）→ 框架 → 数据层
    script = (
        OPERATORS_PY.read_text(encoding="utf-8")
        + "\n"
        + PROVIDER_API_PY.read_text(encoding="utf-8")
        + "\n"
        + "\n".join(p.read_text(encoding="utf-8") for p in PROVIDER_FILES)
        + "\n"
        + _load_checks()
        + "\n"
        + REPORT_DATA_PY.read_text(encoding="utf-8")
    )
    namespace: dict = {"ulog_bytes": path.read_bytes()}
    exec(compile(script, str(RULE_ENGINE_PY), "exec"), namespace)
    return namespace


def run_one(path: Path) -> dict:
    ns = build_namespace(path)
    # 判定产物走具名入口（np_report 会把结果摆到 __result）；以前它靠"执行脚本的副作用"留下
    return call(ns, "np_report()")


def call(ns: dict, code: str):
    exec(compile(code, "<calibrate>", "exec"), ns)
    return json.loads(ns["__result"])


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
