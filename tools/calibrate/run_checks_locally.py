"""本地校准/验证用：直接跑 engine/ 下的 Python 源，在真实 .ulg 上验证。

用法：
  python tools/calibrate/run_checks_locally.py <file.ulg> [more.ulg ...]
  python tools/calibrate/run_checks_locally.py --probe-data <file.ulg> ...

引擎实现在 engine/（本脚本直接读源码，改完即可跑）；**规则读构建产物**
（web/workers/ulog-check-script.ts 的 `const rules = [...]`）。
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

REPO_ROOT = Path(__file__).resolve().parents[2]
KN_PX4 = REPO_ROOT / "knowledge" / "px4"  # 规则与阈值（知识）
ENGINE = REPO_ROOT / "engine"  # 引擎源码（通用算子与框架）
OPERATORS_PY = ENGINE / "operators.py"
PROVIDER_API_PY = ENGINE / "providers" / "api.py"  # provider 契约（常量表 + 自检）
PROVIDER_PX4_PY = ENGINE / "providers" / "px4.py"  # PX4 适配器（唯一认识 PX4 的地方）
RULE_ENGINE_PY = ENGINE / "rule_engine.py"
REPORT_DATA_PY = ENGINE / "report_data.py"
RULES_DIR = KN_PX4 / "rules"
FACTS_YAML = KN_PX4 / "facts.yaml"  # PX4 的数据（码表/文案/展示口径/规则元数据）
FAULT_KB_JSON = REPO_ROOT / "web" / "workers" / "fault-kb.generated.json"
CHECK_SCRIPT = REPO_ROOT / "web" / "workers" / "ulog-check-script.ts"


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
    # 顺序与线上一致：算子注册表 → provider 契约 → PX4 适配器 → 框架 → 数据层
    script = (
        OPERATORS_PY.read_text(encoding="utf-8")
        + "\n"
        + PROVIDER_API_PY.read_text(encoding="utf-8")
        + "\n"
        + PROVIDER_PX4_PY.read_text(encoding="utf-8")
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
    """对数据层三个 API 做结构 / JSON 合法性 / 降采样点数的自检。"""
    ns = build_namespace(path)
    manifest = call(ns, "np_manifest()")
    info = call(ns, "np_log_info()")
    topics = manifest["topics"]
    # 抽一个有数据的 topic 验证 series
    sample = None
    for t in topics:
        if t["n"] > 2:
            sample = t
            break
    series = None
    if sample:
        fld = sample["fields"][0]["name"]
        # `np_series` 收的是一份**请求 JSON**（契约见 ulog-data-script.ts 的 `np_series`）：
        # 面板要第几个实例、每条线怎么取，全在声明里。**别改回位置参数**——以前这里写的是
        # `np_series(topic, instance, fields, max_points)`，签名改成请求体之后没人跟着改，
        # 于是这一段**每次都以 TypeError 结束**；而 `main()` 又不看失败（见下），结果是
        # "对 6 份日志全打 ERROR 却报 OK"（§6.6：恒绿的守卫和没写守卫，肉眼完全一样）。
        # 后果不是崩溃，是 `series` 这一路**很久没被真的检过**——数据层坏掉也没人知道。
        req = {
            "instance": sample["instance"],
            # 字段引用要带 topic（`_pick_ref` 收的是 `"topic.field"`，不是裸字段名）
            "ydata": [{"kind": "field", "fields": [f"{sample['topic']}.{fld}"]}],
        }
        series = call(ns, f"np_series({json.dumps(json.dumps(req, ensure_ascii=False))}, 3000)")
    # 自检
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
            raise RuntimeError(f"np_series 报了错：{series['error']}")
        # 确保无 NaN 泄漏（json 已把 NaN 转 null，这里只查点数）
        checks["seriesField"] = sample["topic"] + "#" + str(sample["instance"]) + "." + fld
        checks["seriesPoints"] = len(series.get("t", []))
        checks["fullCount"] = series.get("fullCount")
        # JSON 里不得出现 NaN/Infinity 字样（应已转 null）
        raw = json.dumps(series)
        assert "NaN" not in raw and "Infinity" not in raw, "series 泄漏 NaN/Infinity"
        assert checks["seriesPoints"] <= 3000, "降采样点数超标"
        # "取到了但一个点都没有"和"没取到"是两回事，不许都给 0（§6.6 规则 5）
        assert checks["seriesPoints"] > 0, f"series 一个点都没取到（field={checks['seriesField']}）"
    else:
        raise RuntimeError(f"没能抽到任何有采样的 topic（topics={len(topics)}），series 这条路没被检")
    return checks


def main(argv: list[str]) -> int:
    args = argv[1:]
    probe = bool(args) and args[0] == "--probe-data"
    if probe:
        args = args[1:]
    if not args:
        print(__doc__)
        return 2
    mode = "探针数据（probe-data）" if probe else "本地回归"
    print(f"=== {mode}：{len(args)} 份日志 ===")
    failed = 0
    for name in args:
        path = Path(name)
        print(f"\n· {path.name}")
        try:
            if probe:
                print(json.dumps(probe_one(path), ensure_ascii=False, indent=2))
            else:
                print(json.dumps(run_one(path), ensure_ascii=False, indent=2))
        except Exception as exc:
            failed += 1
            print(f"ERROR: {type(exc).__name__}: {exc}")
    if failed:
        print(f"\n=== {failed} 份日志出错 ===")
    else:
        print(f"\n=== {len(args)} 份日志全部完成 ===")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))