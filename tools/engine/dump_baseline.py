"""冻结规则引擎的基线输出（规则格式重构前必须先跑）。

把 tools/testdata/logs/ 下每个回归日志的**完整引擎输出**（findings 全字段、stats、tags、
guardTags、phases、checksRun/checksSkipped、matchedFaults）冻结到 baseline/ 下，
作为后续"一条经验一个 YAML"重构的等价比对真相。

用法：
  python tools/engine/dump_baseline.py             # 冻结全部回归日志
  python tools/engine/dump_baseline.py <ulg> ...    # 只冻结指定日志

产物是**冻结的快照**：重构规则时不允许改基线（除非有明确理由并单独提交）。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

# 复用同一套加载/执行逻辑，保证"基线跑的是什么，比对跑的就是什么"
import px4log_engine_runner as runner  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
# 数据在 tools/testdata/，工具在 tools/engine/——分住两处，所以用仓库根往下数，
# 不用"相对自身"（否则本文件一搬家就指到空目录，且 mkdir 会静默造出一个假的 baseline/）。
TESTDATA = REPO_ROOT / "tools" / "testdata"
LOG_DIR = TESTDATA / "logs"  # 校准用真实日志（不入库，需自备）
BASELINE_DIR = TESTDATA / "baseline"


def slug(path: Path) -> str:
    """日志文件名 → 稳定短名：UUID 取首段，其余保留 stem。"""
    stem = path.stem
    first = stem.split("-")[0]
    if len(first) == 8 and all(c in "0123456789abcdef" for c in first):
        return first
    return stem.replace(".", "_")


def source_of(path: Path) -> str:
    """记录日志来源：.ulg 不入库（见 .gitignore），基线必须自带“怎么把它取回来”。

    uuid 命名的日志来自 Flight Review（logs.px4.io）公开日志集。
    """
    stem = path.stem
    first = stem.split("-")[0]
    if len(first) == 8 and all(c in "0123456789abcdef" for c in first):
        return (
            "logs.px4.io 公开日志：GET https://logs.px4.io/download?log=%s（或 python tools/dev/download_px4_logs.py）" % stem
        )
    return "本仓库自带（tools/testdata/logs/，未入库，需自备）"


def dump_one(path: Path) -> Path:
    result = runner.run_one(path)
    envelope = {
        "log": path.name,
        "slug": slug(path),
        "source": source_of(path),
        "engine": "engine/rule_engine.py + engine/report_data.py",
        "note": "冻结基线，重构规则格式时不得改动；如需改动须单独提交并说明理由",
        "result": result,
    }
    BASELINE_DIR.mkdir(parents=True, exist_ok=True)
    out = BASELINE_DIR / f"{envelope['slug']}.json"
    out.write_text(json.dumps(envelope, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    n_findings = len(result.get("findings", []))
    n_faults = len(result.get("matchedFaults", []))
    log.info(f"  {envelope['slug']:14} ← {path.name}  findings={n_findings} faults={n_faults}  → {out.name}")
    return out


def main(argv: list[str]) -> int:
    args = argv[1:]
    logs = [Path(a) for a in args] if args else sorted(LOG_DIR.glob("*.ulg"))
    if not logs:
        log.warning("没有可冻结的日志（tools/testdata/logs/*.ulg）")
        return 2
    log.info(f"冻结 {len(logs)} 个日志的引擎输出到 {BASELINE_DIR.relative_to(REPO_ROOT)}/")
    for p in logs:
        try:
            dump_one(p)
        except Exception as exc:  # noqa: BLE001
            log.error(f"  ERROR {p.name}: {type(exc).__name__}: {exc}")
            return 1
    log.info("完成。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
