"""本地校准/验证用：直接跑 knowledge/px4 下的 Python 源，在真实 .ulg 上验证。

用法：
  python tools/calibrate/run_checks_locally.py <file.ulg> [more.ulg ...]
  python tools/calibrate/run_checks_locally.py --probe-data <file.ulg> ...

经验的唯一事实源在 knowledge/px4/：阈值 TOML、故障库 YAML、检查逻辑 Python。
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
KN_PX4 = REPO_ROOT / "knowledge" / "px4"
PY_CHECKS = KN_PX4 / "ulog_checks.py"
PY_DATA = KN_PX4 / "ulog_data.py"
THRESHOLDS_TOML = KN_PX4 / "px4-thresholds.toml"
FAULT_KB_JSON = REPO_ROOT / "web" / "workers" / "fault-kb.generated.json"


def _load_checks() -> str:
    body = PY_CHECKS.read_text(encoding="utf-8")

    entries = json.loads(FAULT_KB_JSON.read_text(encoding="utf-8"))["entries"]
    body = body.replace("__FAULT_KB__", repr(entries))

    if tomllib is None:
        raise RuntimeError("需要 Python 3.11+（标准库 tomllib）来读 px4-thresholds.toml")
    thresholds = tomllib.loads(THRESHOLDS_TOML.read_text(encoding="utf-8"))
    # Python 源里是 json.loads(r'''__THRESHOLDS__''')；注入 JSON 字面量
    body = body.replace("__THRESHOLDS__", json.dumps(thresholds, ensure_ascii=False))
    return body


def build_namespace(path: Path) -> dict:
    script = _load_checks() + "\n" + PY_DATA.read_text(encoding="utf-8")
    namespace: dict = {"ulog_bytes": path.read_bytes()}
    exec(compile(script, str(PY_CHECKS), "exec"), namespace)
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
        "phases": len(info["phases"]),
        "params": len(info["params"]),
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
