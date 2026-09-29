"""比对当前引擎输出与冻结基线（规则重构每一步都要通过）。

对每个 baseline/<slug>.json，重跑同一份日志并逐字段深度比较：finding 的
id/ruleId/severity/tag/title/evidence/docUrl/suggestion，以及 stats、tags、guardTags、
phases、checksRun/checksSkipped、matchedFaults 不一致都算回归。

唯一不参与判定的是 `parserVersion`（记录"跑这次比对的环境"而非解析结果，见
IGNORED_TOP_KEYS）；它仍会随基线版本串一起打印供人对照。

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

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "knowledge" / "engine"))
import loader as runner  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
# 数据住在 tools/testdata/、本文件是"校验数据的工具"：靠相对自身路径会随搬家一起断。
TESTDATA = REPO_ROOT / "tools" / "testdata"
LOG_DIR = TESTDATA / "logs"  # 校准用真实日志（不入库，需自备）
BASELINE_DIR = TESTDATA / "baseline"

# 这些顶层字段反映的是跑这次比对的环境，不是解析结果——算进差异只会把"换了台机器 /
# 升了个包"报成"解析结果变了"。当前只有 parserVersion：基线拿 pyulog 1.1.0 冻的，换
# 1.2.x 必然不同，但已实测其余字段零差异。仍随结果打印，只是不参与判定。
IGNORED_TOP_KEYS: set[str] = {"parserVersion"}


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


def compare_one(baseline_path: Path) -> tuple[list[str], str, str]:
    """返回 (差异列表, 基线解析器版本, 本次解析器版本)；后两者不参与判定，只供打印。"""
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
    frozen_pv = str(frozen["result"].get("parserVersion") or "无")
    current_pv = str(current.get("parserVersion") or "无")
    return diffs, frozen_pv, current_pv


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
    baseline_pvs: set[str] = set()
    current_pvs: set[str] = set()
    for i, p in enumerate(paths, 1):
        slug = p.stem
        if not p.exists():
            log.print_check(i, len(paths), slug, False, detail=f"SKIP（基线不存在）: {p.name}")
            results.append((slug, "fail"))
            continue
        diffs, frozen_pv, current_pv = compare_one(p)
        baseline_pvs.add(frozen_pv)
        current_pvs.add(current_pv)
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

    # parserVersion 不参与判定，但不许就此消失：它回答"这份日志是哪版解析器读的"，
    # 真出问题时第一个要问。并排打出来，好坏自现。
    if current_pvs:
        base_pv = "、".join(sorted(baseline_pvs))
        cur_pv = "、".join(sorted(current_pvs))
        log.info(f"| 解析器版本（不参与比对）: 基线 {base_pv} / 本次 {cur_pv}")

    return log.print_summary(results, [])


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
