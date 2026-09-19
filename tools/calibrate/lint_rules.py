"""经验字段引用 lint：查规则里引用的 `topic.field` 在该经验的版本范围内是否真的存在。

为什么需要它：字段名写错、或字段只存在于别的固件版本时，引擎都不会报错，
只是取到 None → 那条经验静默不生效，没有任何告警。
（构建期 `pnpm build:kb` 只能校验表达式的形状与算子/变量，**查不了字段存在性**——
那要按固件版本比日志实测字段与上游字典，是这里的事。）

判据是**版本感知**的（每条经验都声明了 `firmware`，就按它的版本范围去查对应来源）：
  1. 回归日志实测字段：每条日志按基线里的 firmware 归类，只与经验版本范围相符的才算数
  2. 上游固件字典：knowledge/px4/meta/<tag>.json，tag 名即版本（main 视为最新）
任一命中即算存在。

引用按**候选组**判：`ref("新名", "旧名")` 或 `ref("名", alias="旧名")` 是一组，
**组内任意一个**在某版本存在即可（同义改名用候选组表达，不再需要白名单）。
分类：
  OK            在适用版本里能找到
  version-gap   适用版本里没有、但别的版本里有 → 该经验在这些固件上其实不生效，
                要改 firmware 范围、补 when_fw 分支，或改用候选组
  suspicious    哪里都没有 → 大概率拼错

规则取自**构建产物**（compute 已是表达式，老节点写法在构建期被编译掉了）。

用法：python tools/calibrate/lint_rules.py [--strict]
    --strict 时 version-gap 与 suspicious 都算失败（默认只报告、返回 0）
"""

from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_checks_locally as runner  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
RULES_DIR = REPO_ROOT / "knowledge" / "px4" / "rules"
META_DIR = REPO_ROOT / "knowledge" / "px4" / "meta"
LOG_DIR = Path(__file__).resolve().parent / "logs"  # 校准用真实日志（不入库，需自备）
BASELINE_DIR = Path(__file__).resolve().parent / "baseline"
ARRAY_SUFFIX = re.compile(r"\[\d+\]$")
INSTANCE_SUFFIX = re.compile(r"\[[^\]]*\]$")  # topic 后的实例写法：estimator_status[:].field
MAIN_VERSION = (99, 0)  # main = 开发主干，当作最新


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
        if not {
            ">=": version >= want,
            "<=": version <= want,
            ">": version > want,
            "<": version < want,
            "==": version == want,
        }[op]:
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
        log.warning("需要 pyulog 才能读日志字段（pip install pyulog）")
        return {}
    # 日志 → 版本：基线里记着 firmware
    log_fw: dict[str, tuple[int, int]] = {}
    for f in sorted(BASELINE_DIR.glob("*.json")):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        # 固件版本在 result.facts.firmware。**别写成 result.stats.firmware**：
        # 引擎从来不产出 stats（那是更早的输出形态），取不到就静默退化成 ""，
        # 于是这条日志被判为"版本未知"而整条跳过 —— 结果是本函数的**日志侧字段源一直空转**，
        # 上面那行只会显示"日志实测 0 个版本"（很容易划过去）。
        # 后果很严重且不报错：所有字段判定只剩上游字典（1.15/1.16/main）一个来源，
        # 于是日志里明明存在的旧固件字段（vehicle_gps_position.*、estimator_wind.* 等）
        # 全被报成"可疑引用，多半是拼错"——实测 18 条全是假阳性。
        label = str((d.get("result", {}).get("facts") or {}).get("firmware") or "")
        m = re.match(r"(\d+)\.(\d+)", label)
        if m and d.get("log"):
            log_fw[d["log"]] = (int(m.group(1)), int(m.group(2)))

    out: dict[tuple[int, int], dict[str, set[str]]] = {}
    for path in sorted(LOG_DIR.glob("*.ulg")):
        ver = log_fw.get(path.name)
        if ver is None:
            continue  # 版本未知的日志不参与版本判定
        try:
            ulog = ULog(str(path))
        except Exception as exc:  # noqa: BLE001
            log.warning("  跳过 %s：%s" % (path.name, exc))
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


def has_field(index, version, topic: str, fld: str) -> bool:
    """某版本里有没有这个字段。

    **两边都归一化到基名再比**：日志侧存的是 `states[0]` 这样的带下标名，字典侧（上游 .msg）
    存的是裸名 `states`；只在引用那一侧剥下标，会让"数组字段"在日志里永远匹配不上
    （踩过：`estimator_status.states` 明明在 1.11 日志里，却被判成"哪里都没有"）。
    """
    want = ARRAY_SUFFIX.sub("", fld)
    return any(ARRAY_SUFFIX.sub("", got) == want for got in (index.get(version, {}).get(topic) or set()))


# ─────────────────────────── 规则里的引用 ───────────────────────────


def field_refs(expr: str) -> list[list[str]]:
    """从一条 compute 表达式里取出字段引用（**候选组**）。

    返回 [[候选字段名, …], …]：
      - ref("新名", "旧名")           → 候选组：运行期取第一个存在的
      - ref("名", alias="旧名")       → 候选组（alias 是"备用命名"的另一种写法）
      - 裸写的 topic.field            → 单元素组

    组内**任意一个**在某版本存在，这条引用就算在那个版本成立——它表达的是"同义改名"，
    与版本无关（"哪个版本该用哪个字段"不另设写法：升级换代就是老名字没了、新名字在）。
    """
    out: list[list[str]] = []
    for node in ast.walk(ast.parse(expr, mode="exec")):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "ref":
            names: list[str] = []
            for a in node.args:
                if isinstance(a, ast.Constant) and isinstance(a.value, str):
                    names.append(a.value)
            for kw in node.keywords:
                if kw.arg == "alias" and isinstance(kw.value, ast.Constant):
                    v = kw.value.value
                    names += list(v) if isinstance(v, list) else [v]
            if names:
                out.append(names)
        elif isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
            out.append(["%s.%s" % (node.value.id, node.attr)])
    return out


def rule_refs() -> list[tuple[str, list[str], list]]:
    """(规则 id, 候选字段名, 生效的版本约束列表)。

    规则来自构建产物（compute 已是表达式）。版本约束**只有规则级的 `firmware`**
    （引用上不再有 when_fw）：一条经验服务哪个版本段，写在 `conditions.firmware` 上。
    """
    out = []
    for raw in runner._load_rules():
        rule_fw = raw.get("firmware")
        for expr in raw.get("compute") or []:
            for names in field_refs(expr):
                constraints = [c for c in (rule_fw,) if c]
                out.append((raw["id"], names, constraints))
    return out


def main(argv: list[str]) -> int:
    strict = "--strict" in argv
    logs = fields_by_version_from_logs()
    meta = fields_by_version_from_meta()
    versions = sorted(set(logs) | set(meta))
    log.info(
        f"=== 经验规则字段引用检查 ===\n来源版本：{'，'.join(fmt(v) for v in versions)}（日志实测 {len(logs)} 个版本，字典 {len(meta)} 个版本）"
    )
    if not logs:
        log.warning(
            "警告：日志侧字段源为空 —— 上面那些'可疑引用'会大量假阳性，先确认\n"
            "      %s 下有 .ulg、且 baseline/*.json 的 result.facts.firmware 有值。" % LOG_DIR
        )

    ok = gaps = suspicious = 0
    gap_rows: list[tuple[str, str, str, list[str]]] = []
    bad_rows: list[tuple[str, str]] = []

    def any_found(index, version, names: list[str]) -> bool:
        """候选组里任意一个命中即算命中。"""
        for n in names:
            topic, _, fld = n.partition(".")
            # 实例写法写在 topic 后（`estimator_status[:].vel_test_ratio`），查字段时要去掉
            topic = INSTANCE_SUFFIX.sub("", topic)
            if has_field(index, version, topic, fld):
                return True
        return False

    def label(names: list[str]) -> str:
        return " 或 ".join(names)

    for rid, names, constraints in rule_refs():
        applicable = [v for v in versions if all(fw_matches(c, v) for c in constraints)]
        if any(any_found(logs, v, names) or any_found(meta, v, names) for v in applicable):
            ok += 1
            continue
        elsewhere = [fmt(v) for v in versions if any_found(logs, v, names) or any_found(meta, v, names)]
        if elsewhere:
            gaps += 1
            gap_rows.append((rid, label(names), " 且 ".join(constraints) or "any", elsewhere))
        else:
            suspicious += 1
            bad_rows.append((rid, label(names)))

    log.info("\n字段引用 %d 处：适用版本内命中 %d ｜ 版本错配 %d ｜ 可疑 %d" % (ok + gaps + suspicious, ok, gaps, suspicious))

    if gap_rows:
        log.warning("\n版本错配：声明的 firmware 范围内找不到这些字段（该经验在这些固件上不会生效）")
        log.warning('    修法：改 firmware 范围 / 补 when_fw 分支 / 改用候选组 ref("新名", "旧名")')
        for rid, names, fw, elsewhere in gap_rows:
            log.warning("   %-28s %-42s firmware=%s ｜ 仅存在于 %s" % (rid, names, fw, ", ".join(elsewhere)))
    if bad_rows:
        log.error("\n可疑引用（哪里都没找到，多半是拼错）：")
        for rid, names in bad_rows:
            log.error("   %-28s %s" % (rid, names))
    failed = gaps + suspicious
    if failed == 0:
        log.info("\n=== 经验规则字段引用检查通过：所有引用都在其版本范围内找得到 ===")
    return 1 if (strict and failed) else 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    raise SystemExit(main(sys.argv))
