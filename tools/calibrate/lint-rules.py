"""经验字段引用 lint：查 rules/*.yaml 里引用的 `topic.field` 是不是真的存在。

为什么需要它：字段名写错时引擎不会报错，只是取到 None → 那条经验静默不生效，
没有任何告警。构建期目前只校验算子 arity 与表达式变量，**不校验字段存在性**。

判据用两个来源的并集（任一命中即算存在），避免把跨版本改名误判成拼错：
  1. 回归日志实测字段（engine/tests/logs/*.ulg，pyulog 读出来的 tp/field）——引擎真正能读到的
  2. 上游固件字典（knowledge/px4/meta/<tag>.json）——按 tag 存在性
落在两者之外的一律列为「可疑」，人工判断是拼错还是新字段（新字段请先同步 meta）。

用法：python tools/calibrate/lint-rules.py [--strict]
    --strict 时「可疑」也算失败（默认只报告、返回 0）
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RULES_DIR = REPO_ROOT / "knowledge" / "px4" / "rules"
META_DIR = REPO_ROOT / "knowledge" / "px4" / "meta"
LOG_DIR = REPO_ROOT / "engine" / "tests" / "logs"
ARRAY_SUFFIX = re.compile(r"\[\d+\]$")


def observed_from_logs() -> dict[str, set[str]]:
    """回归日志里真实存在的 topic → 字段集合（pyulog 直接读，不跑引擎）。"""
    try:
        from pyulog import ULog
    except ImportError:  # pragma: no cover
        print("需要 pyulog 才能读日志字段（pip install pyulog）")
        return {}
    idx: dict[str, set[str]] = {}
    for path in sorted(LOG_DIR.glob("*.ulg")):
        try:
            ulog = ULog(str(path))
        except Exception as exc:  # noqa: BLE001
            print("  跳过 %s：%s" % (path.name, exc))
            continue
        for d in ulog.data_list:
            idx.setdefault(d.name, set()).update(d.data.keys())
    return idx


def from_meta() -> dict[str, dict[str, set[str]]]:
    """上游字典：topic → field → 出现在哪些 tag。"""
    idx: dict[str, dict[str, set[str]]] = {}
    for f in sorted(META_DIR.glob("*.json")):
        tag = f.stem
        for topic, spec in (json.loads(f.read_text(encoding="utf-8")).get("topics") or {}).items():
            for fld in (spec.get("fields") or {}):
                idx.setdefault(topic, {}).setdefault(fld, set()).add(tag)
    return idx


def bases(name: str) -> set[str]:
    """数组字段可能写成 field 或 field[i]；两者都算存在。"""
    root = ARRAY_SUFFIX.sub("", name)
    return {name, root}


def rule_refs() -> list[tuple[str, str, str, bool]]:
    """(规则 id, topic, field, 是否已声明 aliases) 列表；含 compute 的 in/from。

    已声明 `aliases:`（该引用自身的备用名）或规则级 `known_legacy:`（整条经验已知的
    遗留字段清单，如 1.15 前的 EKF 状态槽）时，lint 不算可疑，只在结尾汇总。
    """
    import yaml

    out = []
    for f in sorted(RULES_DIR.glob("*.yaml")):
        loaded = yaml.safe_load(f.read_text(encoding="utf-8"))
        for raw in (loaded if isinstance(loaded, list) else [loaded]):
            for node in raw.get("compute") or []:
                ins = node.get("in")
                if ins is None:
                    fr = node.get("from")
                    ins = fr if isinstance(fr, list) else [fr]
                aliases = node.get("aliases") or {}
                known = set(raw.get("known_legacy") or [])
                for ref in ins:
                    if isinstance(ref, str) and "." in ref:
                        topic, _, fld = ref.partition(".")
                        out.append((raw["id"], topic, fld, ref in aliases or ref in known))
    return out


def main(argv: list[str]) -> int:
    strict = "--strict" in argv
    logs, meta = observed_from_logs(), from_meta()
    print("日志实测 topic %d 个，meta topic %d 个" % (len(logs), len(meta)))

    unknown: list[tuple[str, str, str]] = []
    declared_legacy: list[tuple[str, str, str]] = []
    for rid, topic, fld, has_alias in rule_refs():
        ok_log = any(b in logs.get(topic, set()) for b in bases(fld))
        ok_meta = any(b in (meta.get(topic) or {}) for b in bases(fld))
        if ok_log or ok_meta:
            continue
        (declared_legacy if has_alias else unknown).append((rid, topic, fld))

    if declared_legacy:
        print("\n已声明 aliases 的遗留字段（跨版本改名，经验里已写回退）：%d 处" % len(declared_legacy))
        for rid, topic, fld in declared_legacy:
            print("   %-28s %s.%s" % (rid, topic, fld))
    if not unknown:
        print("\n字段引用检查通过：其余 topic.field 都能在日志或 meta 里找到")
        return 0
    print("\n可疑字段引用 %d 处（拼错？还是新字段未同步 meta？）:" % len(unknown))
    for rid, topic, fld in unknown:
        in_topic = topic in logs or topic in meta
        hint = "" if in_topic else "（该 topic 本身也没见过）"
        print("   %-28s %s.%s %s" % (rid, topic, fld, hint))
    return 1 if strict else 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    raise SystemExit(main(sys.argv))
