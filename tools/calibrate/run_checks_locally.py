"""本地校准/验证用：直接跑 engine/ 下的 Python 源，在真实 .ulg 上验证。

用法：
  python tools/calibrate/run_checks_locally.py <file.ulg> [more.ulg ...]
  python tools/calibrate/run_checks_locally.py --probe-data <file.ulg> ...

规则与阈值在 knowledge/px4/（rules/*.yaml、故障库 YAML），引擎实现在 engine/。
本脚本用 tomllib（Python 3.11+）读阈值、解析故障库 YAML 的产物 JSON，
不依赖 Node 构建，因此改完 knowledge 即可在此回归。
"""
import json
import sys
from pathlib import Path

try:
    import tomllib  # Python 3.11+
except ModuleNotFoundError:  # pragma: no cover
    tomllib = None

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parents[2]
KN_PX4 = REPO_ROOT / "knowledge" / "px4"      # 规则与阈值（知识）
ENGINE = REPO_ROOT / "engine"                 # 引擎源码（通用算子与框架）
OPERATORS_PY = ENGINE / "operators.py"
RULE_ENGINE_PY = ENGINE / "rule_engine.py"
REPORT_DATA_PY = ENGINE / "report_data.py"
RULES_DIR = KN_PX4 / "rules"
FACTS_YAML = KN_PX4 / "facts.yaml"          # 事实层的数据绑定与码表
FAULT_KB_JSON = REPO_ROOT / "web" / "workers" / "fault-kb.generated.json"


def _load_rules() -> list:
    """rules/*.yaml → 列表；与构建脚本同一份源（本地回归不依赖 Node）。"""
    try:
        import yaml
    except ImportError:
        raise RuntimeError("需要 PyYAML 读 rules/*.yaml：pip install pyyaml")

    # PyYAML 默认把 2026-09-15 解析成 datetime.date，而构建脚本用的 JS yaml 库保持字符串；
    # 两个加载器必须一致，否则本地与线上注入的规则 JSON 不同。这里去掉 timestamp 解析器。
    class _Loader(yaml.SafeLoader):
        pass

    _Loader.yaml_implicit_resolvers = {
        ch: [(tag, regexp) for tag, regexp in pairs if tag != "tag:yaml.org,2002:timestamp"]
        for ch, pairs in yaml.SafeLoader.yaml_implicit_resolvers.items()
    }

    rules = []
    for f in sorted(RULES_DIR.glob("*.yaml")):
        loaded = yaml.load(f.read_text(encoding="utf-8"), Loader=_Loader)
        # 一个 YAML 可以装多条经验（顶层写成数组），与构建脚本保持一致
        rules.extend(loaded if isinstance(loaded, list) else [loaded])
    return rules


def _load_checks() -> str:
    body = RULE_ENGINE_PY.read_text(encoding="utf-8")

    entries = json.loads(FAULT_KB_JSON.read_text(encoding="utf-8"))["entries"]
    body = body.replace("__FAULT_KB__", repr(entries))

    # 阈值已随经验内联（px4-thresholds.toml 退场），无需再注入
    body = body.replace("__RULES__", json.dumps(_load_rules(), ensure_ascii=False))

    # 事实层的数据绑定与码表（facts.yaml），与构建期内联的是同一份
    import yaml as _yaml
    facts = _yaml.safe_load(FACTS_YAML.read_text(encoding="utf-8"))
    body = body.replace("__FACTS__", json.dumps(facts, ensure_ascii=False))
    return body


def build_namespace(path: Path) -> dict:
    # 顺序与线上一致：operators（算子注册表）→ ulog_checks（框架用算子）→ ulog_data
    script = (
        OPERATORS_PY.read_text(encoding="utf-8")
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
    return json.loads(ns["__result"])


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
        series = call(
            ns,
            f'np_series({json.dumps(sample["topic"])}, {sample["instance"]}, '
            f'{json.dumps(json.dumps([fld]))}, 3000)',
        )
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
    if series:
        # 确保无 NaN 泄漏（json 已把 NaN 转 null，这里只查点数）
        checks["seriesField"] = sample["topic"] + "#" + str(sample["instance"]) + "." + fld
        checks["seriesPoints"] = len(series.get("t", []))
        checks["fullCount"] = series.get("fullCount")
        # JSON 里不得出现 NaN/Infinity 字样（应已转 null）
        raw = json.dumps(series)
        assert "NaN" not in raw and "Infinity" not in raw, "series 泄漏 NaN/Infinity"
        assert checks["seriesPoints"] <= 3000, "降采样点数超标"
    return checks


def main(argv: list[str]) -> int:
    args = argv[1:]
    probe = bool(args) and args[0] == "--probe-data"
    if probe:
        args = args[1:]
    if not args:
        print(__doc__)
        return 2
    for name in args:
        path = Path(name)
        print(f"\n=== {path.name} ===")
        try:
            if probe:
                print(json.dumps(probe_one(path), ensure_ascii=False, indent=2))
            else:
                print(json.dumps(run_one(path), ensure_ascii=False, indent=2))
        except Exception as exc:
            print(f"ERROR: {type(exc).__name__}: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
