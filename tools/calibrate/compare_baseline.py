"""比对当前引擎输出与冻结基线（规则重构每一步都必须通过）。

对每个 baseline/<slug>.json，重新跑同一份日志并**逐字段深度比较**：
任何 finding 的 id/ruleId/severity/tag/title/evidence/docUrl/suggestion，以及 stats、tags、
guardTags、phases、checksRun/checksSkipped、matchedFaults 不一致都算回归。

用法：
  python tools/calibrate/compare-baseline.py            # 比对全部基线
  python tools/calibrate/compare-baseline.py <slug> ... # 只比对指定项

退出码：全部一致 0；有差异 1（差异以统一 diff 形式列出）。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_checks_locally as runner  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
LOG_DIR = Path(__file__).resolve().parent / "logs"  # 校准用真实日志（不入库，需自备）
BASELINE_DIR = Path(__file__).resolve().parent / "baseline"

# 重构期唯一可能"合理变化"的字段放这里（当前为空：要求严格等价）
IGNORED_TOP_KEYS: set[str] = set()


def find_log(name: str) -> Path:
    p = LOG_DIR / name
    if not p.exists():
        raise FileNotFoundError(name)
    return p


def normalize(value):
    """把结果转成可直接比较的形式（tuple 化列表，保证顺序敏感）。"""
    if isinstance(value, dict):
        return {k: normalize(value[k]) for k in sorted(value)}
    if isinstance(value, list):
        return tuple(normalize(v) for v in value)
    return value


def compare_one(baseline_path: Path) -> list[str]:
    frozen = json.loads(baseline_path.read_text(encoding="utf-8"))
    log_path = find_log(frozen["log"])
    current = runner.run_one(log_path)

    diffs: list[str] = []
    keys = set(frozen["result"]) | set(current)
    for key in sorted(keys):
        if key in IGNORED_TOP_KEYS:
            continue
        a = normalize(frozen["result"].get(key))
        b = normalize(current.get(key))
        if a != b:
            diffs.append(f"  [{key}]\n    基线: {a}\n    当前: {b}")
    return diffs


def main(argv: list[str]) -> int:
    args = argv[1:]
    if args:
        paths = [BASELINE_DIR / f"{s.removesuffix('.json')}.json" for s in args]
    else:
        paths = sorted(BASELINE_DIR.glob("*.json"))
    if not paths:
        log.warning("没有基线文件，先跑 dump-baseline.py")
        return 2
    log.info("=== 基线比对 ===")
    failures = 0
    for p in paths:
        if not p.exists():
            log.warning(f"SKIP（基线不存在）: {p.name}")
            failures += 1
            continue
        diffs = compare_one(p)
        slug = p.stem
        if diffs:
            failures += 1
            log.error(f"FAIL {slug}: {len(diffs)} 处差异")
            for d in diffs:
                log.error(d)
        else:
            log.info(f"OK   {slug}")
    log.info(f"\n=== 基线比对{'全部通过' if failures == 0 else f'{failures} 项不一致'} ===")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
