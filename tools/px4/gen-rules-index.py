"""从 rules/*.yaml 汇总生成经验索引文档（knowledge/px4/px4-ulog-rules.md）。

规则改动后重跑本脚本即可，避免索引与经验漂移：
    python tools/px4/gen-rules-index.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RULES_DIR = ROOT / "knowledge" / "px4" / "rules"
OUT = ROOT / "knowledge" / "px4" / "px4-ulog-rules.md"

SLOT_LABEL = {
    "guards_early": "数据质量 guard（最早执行）",
    "guards": "数据质量 guard",
}

HEADER = """# PX4 `.ulg` 检查经验索引

> ⚠️ 本文件由 `python tools/px4/gen-rules-index.py` 从 `rules/*.yaml` 汇总生成，请勿手改；
> 改经验请直接改 `rules/<名字>.yaml`，然后重跑该脚本。
>
> 当前共 **{n_rules} 条经验**（{n_files} 个 YAML 文件），算子 {n_ops} 个。
> 判定阈值**就在各自经验文件里**（原先集中在 px4-thresholds.toml，已退场）。
>
> 铁律（CLAUDE.md 4.1）：所有数值判断只发生在确定性引擎；LLM 只翻译，不改数值。

## 怎么读这张表

- **slot** 决定执行位置：finding 的 `id`（F01、F02…）按发射顺序生成，所以 slot 必须与
  它所替换的原过程式检查位置一致；同一 slot 内按 `order` 排序。
- **取值** 是 `compute` 数据流（`topic.field` 或前序输出 → 算子）；字段名与阈值都写在经验里，
  算子本身不认识具体 topic。
- **判定** 自上而下命中第一条即发射；`expr` 走 AST 白名单求值（不用 eval）。
- **产出** 里的 check 名用于 `checksRun`/`checksSkipped`；tag 喂给故障知识库匹配。

---

"""


def fmt_applicability(raw):
    fw = raw.get("firmware", "any")
    af = raw.get("airframe", "any")
    parts = ["firmware %s" % (",".join(fw) if isinstance(fw, list) else fw),
             "airframe %s" % (",".join(af) if isinstance(af, list) else af)]
    req = raw.get("requires") or {}
    if req.get("all_of"):
        parts.append("依赖(全部) " + ", ".join(req["all_of"]))
    if req.get("any_of"):
        parts.append("依赖(任一) " + ", ".join(req["any_of"]))
    if raw.get("not_applicable", {}).get("when"):
        parts.append("不适用当 " + raw["not_applicable"]["when"])
    if raw.get("silent_when"):
        parts.append("静默当 " + raw["silent_when"])
    return " ｜ ".join(parts)


def fmt_compute(raw):
    lines = []
    for node in raw.get("compute") or []:
        ins = node.get("in")
        if ins is None:
            frm = node.get("from")
            ins = frm if isinstance(frm, list) else [frm]
        opts = {k: v for k, v in node.items() if k not in ("in", "from", "out", "op", "optional")}
        opts_txt = " " + ", ".join("%s=%s" % (k, v) for k, v in opts.items()) if opts else ""
        outs = node["out"] if isinstance(node["out"], list) else [node["out"]]
        lines.append("`%s`%s → **%s**" % (node["op"], opts_txt, ", ".join(outs)))
        lines.append("  输入：%s" % ", ".join("`%s`" % i for i in ins))
    return "\n".join("  " + l if l.startswith("  ") else "- " + l for l in lines) or "- （无 compute）"


def fmt_triggers(raw):
    lines = []
    for t in raw.get("triggers") or []:
        bits = ["**%s**" % t.get("severity")]
        bits.append("`%s`" % t.get("expr"))
        if t.get("threshold") is not None:
            bits.append("阈值 %s" % t["threshold"])
        if t.get("unit"):
            bits.append("单位 %s" % t["unit"])
        bits.append("标题「%s」" % t.get("title"))
        lines.append("- " + " ｜ ".join(bits))
    for g in (raw.get("emit") or {}).get("guard_tags") or []:
        lines.append("- guard：当 `%s` 时打标签 `%s`" % (g.get("when"), g.get("tag")))
    return "\n".join(lines) or "- （只产 guard 标签，不发 finding）"


def fmt_emit(raw):
    emit = raw.get("emit") or {}
    bits = []
    if emit.get("check"):
        bits.append("check=%s" % emit["check"])
    if emit.get("tag"):
        bits.append("tag=%s" % emit["tag"])
    if emit.get("stats"):
        bits.append("stats=" + ", ".join("%s(round %s)" % (k, v.get("round", "-"))
                                         for k, v in emit["stats"].items()))
    return "，".join(bits) or "—"


def main():
    import yaml

    rules = []
    files = sorted(RULES_DIR.glob("*.yaml"))
    for f in files:
        loaded = yaml.safe_load(f.read_text(encoding="utf-8"))
        for raw in (loaded if isinstance(loaded, list) else [loaded]):
            rules.append((f.name, raw))
    ops = len([l for l in (ROOT / "knowledge" / "px4" / "operators.py")
               .read_text(encoding="utf-8").split("\n") if l.startswith("@operator(")])

    body = [HEADER.format(n_rules=len(rules), n_files=len(files), n_ops=ops)]
    current_slot = object()
    for fname, raw in sorted(rules, key=lambda r: (r[1].get("slot", ""), r[1].get("order", 100000))):
        slot = raw.get("slot", "")
        if slot != current_slot:
            current_slot = slot
            body.append("\n## %s（slot: `%s`）\n" % (SLOT_LABEL.get(slot, slot), slot))
        body.append("### %s — %s\n" % (raw.get("id"), raw.get("name", "")))
        body.append("- 文件：`rules/%s` ｜ 位置：slot `%s` #%s" % (fname, slot, raw.get("order", "—")))
        body.append("- 适用：%s" % fmt_applicability(raw))
        body.append("- 取值：\n%s" % fmt_compute(raw))
        body.append("- 判定：\n%s" % fmt_triggers(raw))
        body.append("- 产出：%s\n" % fmt_emit(raw))
    OUT.write_text("\n".join(body), encoding="utf-8", newline="\n")
    print("生成 %s：%d 条经验 / %d 个文件" % (OUT.relative_to(ROOT), len(rules), len(files)))


if __name__ == "__main__":
    main()
