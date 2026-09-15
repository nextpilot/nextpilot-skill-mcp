"""经验字段引用 lint：查 rules/*.yaml 里引用的 `topic.field` 在该经验的版本范围内是否真的存在。

为什么需要它：字段名写错、或字段只存在于别的固件版本时，引擎都不会报错，
只是取到 None → 那条经验静默不生效，没有任何告警。

判据是**版本感知**的（每条经验都声明了 `firmware`，就按它的版本范围去查对应来源）：
  1. 回归日志实测字段：每条日志按基线里的 firmware 归类，只与经验版本范围相符的才算数
  2. 上游固件字典：knowledge/px4/meta/<tag>.json，tag 名即版本（main 视为最新）
任一命中即算存在。分类：
  OK            在适用版本里能找到
  version-gap   适用版本里没有、但别的版本里有 → 该经验在现代/旧固件上其实不生效，
                要改 firmware 范围、补版本分支（算子 pick_newer 或复合算子的 fw_minor 入参），
                或改用新字段名
  legacy        aliases / known_legacy 已声明，只汇总
  suspicious    哪里都没有 → 大概率拼错

用法：python tools/calibrate/lint-rules.py [--strict]
    --strict 时 version-gap 与 suspicious 都算失败（默认只报告、返回 0）
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
BASELINE_DIR = Path(__file__).resolve().parent / "baseline"
ARRAY_SUFFIX = re.compile(r"\[\d+\]$")
MAIN_VERSION = (99, 0)          # main = 开发主干，当作最新


# ─────────────────────────── 版本 ───────────────────────────

def tag_version(tag: str) -> tuple[int, int]:
    m = re.match(r"v?(\d+)\.(\d+)", tag)
    return (int(m.group(1)), int(m.group(2))) if m else MAIN_VERSION


def fw_matches(spec, version) -> bool:
    """经验的 firmware 约束是否覆盖某版本；语义与引擎 _match_firmware 一致。"""
    if not spec or spec == "any" or version is None:
        return True
    for part in str(spec).split(","):
        m = re.match(r"^\s*(>=|<=|==|>|<)?\s*(\d+)\.?(\d+)?\s*$", part)
        if not m:
            return True
        op, maj, mi = m.group(1) or "==", int(m.group(2)), int(m.group(3) or 0)
        want = (maj, mi)
        if not {">=": version >= want, "<=": version <= want, ">": version > want,
                "<": version < want, "==": version == want}[op]:
            return False
    return True


def fmt(v) -> str:
    return "main" if v == MAIN_VERSION else "%d.%d" % v


# ─────────────────────────── 字段来源 ───────────────────────────

def fields_by_version_from_logs() -> dict[tuple[int, int], dict[str, set[str]]]:
    """{版本: {topic: {field}}}——来自回归日志的实测字段（引擎真正能读到的）。"""
    try:
        from pyulog import ULog
    except ImportError:  # pragma: no cover
        print("需要 pyulog 才能读日志字段（pip install pyulog）")
        return {}
    # 日志 → 版本：基线里记着 firmware
    log_fw: dict[str, tuple[int, int]] = {}
    for f in sorted(BASELINE_DIR.glob("*.json")):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        label = str((d.get("result", {}).get("stats") or {}).get("firmware") or "")
        m = re.match(r"(\d+)\.(\d+)", label)
        if m and d.get("log"):
            log_fw[d["log"]] = (int(m.group(1)), int(m.group(2)))

    out: dict[tuple[int, int], dict[str, set[str]]] = {}
    for path in sorted(LOG_DIR.glob("*.ulg")):
        ver = log_fw.get(path.name)
        if ver is None:
            continue                       # 版本未知的日志不参与版本判定
        try:
            ulog = ULog(str(path))
        except Exception as exc:  # noqa: BLE001
            print("  跳过 %s：%s" % (path.name, exc))
            continue
        bucket = out.setdefault(ver, {})
        for d in ulog.data_list:
            bucket.setdefault(d.name, set()).update(d.data.keys())
    return out


def fields_by_version_from_meta() -> dict[tuple[int, int], dict[str, set[str]]]:
    out: dict[tuple[int, int], dict[str, set[str]]] = {}
    for f in sorted(META_DIR.glob("*.json")):
        ver = tag_version(f.stem)
        bucket = out.setdefault(ver, {})
        for topic, spec in (json.loads(f.read_text(encoding="utf-8")).get("topics") or {}).items():
            bucket.setdefault(topic, set()).update(spec.get("fields") or {})
    return out


def bases(name: str) -> set[str]:
    """数组字段可能写成 field 或 field[i]；两者都算存在。"""
    return {name, ARRAY_SUFFIX.sub("", name)}


# ─────────────────────────── 规则里的引用 ───────────────────────────

def rule_refs() -> list[tuple[str, str, str, bool, list]]:
    """(规则 id, topic, field, 是否已声明遗留, 生效的版本约束列表)。

    版本约束取「规则级 firmware」与「节点级 when_fw」的交集（两者都要满足）；
    节点级条件正是"同一字段在不同固件换了名字"时用来分流的写法。
    """
    import yaml

    out = []
    for f in sorted(RULES_DIR.glob("*.yaml")):
        loaded = yaml.safe_load(f.read_text(encoding="utf-8"))
        for raw in (loaded if isinstance(loaded, list) else [loaded]):
            known = set(raw.get("known_legacy") or [])
            rule_fw = raw.get("firmware")
            for node in raw.get("compute") or []:
                ins = node.get("in")
                if ins is None:
                    fr = node.get("from")
                    ins = fr if isinstance(fr, list) else [fr]
                aliases = node.get("aliases") or {}
                constraints = [c for c in (rule_fw, node.get("when_fw")) if c]
                for ref in ins:
                    if isinstance(ref, str) and "." in ref:
                        topic, _, fld = ref.partition(".")
                        out.append((raw["id"], topic, fld, ref in aliases or ref in known, constraints))
    return out


def found_in(index, version, topic, fld) -> bool:
    return any(b in (index.get(version, {}).get(topic) or set()) for b in bases(fld))


def main(argv: list[str]) -> int:
    strict = "--strict" in argv
    logs = fields_by_version_from_logs()
    meta = fields_by_version_from_meta()
    versions = sorted(set(logs) | set(meta))
    print("来源版本：%s（日志实测 %d 个版本，字典 %d 个版本）"
          % (", ".join(fmt(v) for v in versions), len(logs), len(meta)))

    ok = gaps = legacy = suspicious = 0
    gap_rows: list[tuple[str, str, str, str, list[str]]] = []
    legacy_rows: list[tuple[str, str, str]] = []
    bad_rows: list[tuple[str, str, str]] = []
    for rid, topic, fld, declared, constraints in rule_refs():
        applicable = [v for v in versions
                      if all(fw_matches(c, v) for c in constraints)]
        if any(found_in(logs, v, topic, fld) or found_in(meta, v, topic, fld) for v in applicable):
            ok += 1
            continue
        elsewhere = [fmt(v) for v in versions
                     if found_in(logs, v, topic, fld) or found_in(meta, v, topic, fld)]
        if declared:
            legacy += 1
            legacy_rows.append((rid, topic, fld))
        elif elsewhere:
            gaps += 1
            gap_rows.append((rid, topic, fld, " 且 ".join(constraints) or "any", elsewhere))
        else:
            suspicious += 1
            bad_rows.append((rid, topic, fld))

    print("\n字段引用 %d 处：适用版本内命中 %d ｜ 版本错配 %d ｜ 已声明遗留 %d ｜ 可疑 %d"
          % (ok + gaps + legacy + suspicious, ok, gaps, legacy, suspicious))

    if legacy_rows:
        print("\n已声明 aliases / known_legacy 的遗留字段（只汇总）：")
        for rid, topic, fld in legacy_rows:
            print("   %-28s %s.%s" % (rid, topic, fld))
    if gap_rows:
        print("\n版本错配：声明的 firmware 范围内找不到这些字段（该经验在这些固件上不会生效）")
        print("    修法：改 firmware 范围 / 用 pick_newer 或带 fw_minor 入参的算子补版本分支 / 改用新字段名")
        for rid, topic, fld, fw, elsewhere in gap_rows:
            print("   %-28s %-42s firmware=%s ｜ 仅存在于 %s"
                  % (rid, "%s.%s" % (topic, fld), fw, ", ".join(elsewhere)))
    if bad_rows:
        print("\n可疑引用（哪里都没找到，多半是拼错）：")
        for rid, topic, fld in bad_rows:
            print("   %-28s %s.%s" % (rid, topic, fld))
    failed = gaps + suspicious
    if failed == 0:
        print("\n检查通过：所有引用都在其版本范围内找得到")
    return 1 if (strict and failed) else 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    raise SystemExit(main(sys.argv))
