"""比对当前引擎输出与冻结基线（规则重构每一步都必须通过）。

对每个 baseline/<slug>.json，重新跑同一份日志并**逐字段深度比较**：
任何 finding 的 id/ruleId/severity/tag/title/evidence/docUrl/suggestion，以及 stats、tags、
guardTags、phases、checksRun/checksSkipped、matchedFaults 不一致都算回归。

用法：
  python tools/engine/compare_baseline.py            # 比对全部基线
  python tools/engine/compare_baseline.py <slug> ... # 只比对指定项

退出码：全部一致 0；有差异 1（差异以统一 diff 形式列出）。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

import px4log_engine_runner as runner  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
# 两份数据都住在 tools/testdata/，不跟着本文件走：它们是要入库/自备的"数据"，
# 而本文件是"校验数据的工具"——两者分属不同目录，靠相对自身路径只会随搬家一起断。
TESTDATA = REPO_ROOT / "tools" / "testdata"
LOG_DIR = TESTDATA / "logs"  # 校准用真实日志（不入库，需自备）
BASELINE_DIR = TESTDATA / "baseline"

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

    log.print_header("基线比对")

    results: list[tuple[str, str]] = []
    for i, p in enumerate(paths, 1):
        slug = p.stem
        if not p.exists():
            log.print_check(i, len(paths), slug, False, detail=f"SKIP（基线不存在）: {p.name}")
            results.append((slug, "fail"))
            continue
        diffs = compare_one(p)
        if diffs:
            log.print_check(
                i,
                len(paths),
                slug,
                False,
                detail=f"FAIL {slug}: {len(diffs)} 处差异",
                err="\n".join(diffs),
            )
            results.append((slug, "fail"))
        else:
            log.print_check(i, len(paths), slug, True)
            results.append((slug, "ok"))

    return log.print_summary(results, [])


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
