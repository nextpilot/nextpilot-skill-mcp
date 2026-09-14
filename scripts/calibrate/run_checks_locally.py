"""本地校准/验证用：抽取 web/workers 下两个 Python 模板并在真实 .ulg 上运行。

用法：
  python scripts/calibrate/run_checks_locally.py <file.ulg> [more.ulg ...]
  python scripts/calibrate/run_checks_locally.py --probe-data <file.ulg> ...

冲刺 2 用 10-20 个真实日志校准阈值（CLAUDE.md 4.3/8）时，这个脚本就是回归入口；
engine/ 真包抽出后改为直接 import nextpilot_engine。
"""
import json
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parents[2]
TS_CHECKS = REPO_ROOT / "web" / "workers" / "ulog-check-script.ts"
TS_DATA = REPO_ROOT / "web" / "workers" / "ulog-data-script.ts"
FAULT_KB_JSON = REPO_ROOT / "web" / "workers" / "fault-kb.generated.json"


def _load_template(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    # 兼容 `...` 与 `...`.replace(...) 两种结尾
    m = re.search(r"String\.raw`(.*)`\s*(?:\.replace.*)?;\s*$", text, re.S)
    if not m:
        raise RuntimeError(f"未能在 {path} 中找到 String.raw`...` 模板")
    body = m.group(1)
    if "__FAULT_KB__" in body:
        import json as _json
        entries = _json.loads(FAULT_KB_JSON.read_text(encoding="utf-8"))["entries"]
        # 注入 Python 字面量（repr 保证 True/False/None 语义正确）
        body = body.replace("__FAULT_KB__", repr(entries))
    return body


def build_namespace(path: Path) -> dict:
    script = _load_template(TS_CHECKS) + _load_template(TS_DATA)
    namespace: dict = {"ulog_bytes": path.read_bytes()}
    exec(compile(script, str(TS_CHECKS), "exec"), namespace)
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
