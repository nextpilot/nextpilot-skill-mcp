"""把「算子目录」与「内置变量表」生成进 content/guide/knowledge-write-rule.md。

为什么用生成：这两张表的事实源分别在 engine/operators.py 与 engine/rule_engine.py 的
_rule_env()，手写必然漂移。参考文档里用标记圈出生成区，本脚本只重写标记之间的内容，
其余（字段说明、示例）保持人工维护。

用法：python tools/px4/gen-rule-reference.py
"""
from pathlib import Path
import ast
import re

ROOT = Path(__file__).resolve().parents[2]
OPS = ROOT / "engine" / "operators.py"
CHECKS = ROOT / "engine" / "rule_engine.py"
DOC = ROOT / "content" / "guide" / "knowledge-write-rule.md"

BEGIN_OPS, END_OPS = "<!-- BEGIN:operators -->", "<!-- END:operators -->"
BEGIN_VARS, END_VARS = "<!-- BEGIN:builtins -->", "<!-- END:builtins -->"

SECTION_LABEL = re.compile(r"^#\s*─+\s*(.+?)\s*─*\s*$")


def operator_catalog() -> str:
    """按 operators.py 里的分节注释分组，列出「名称 → 入参 出参 说明」。"""
    src = OPS.read_text(encoding="utf-8")
    tree = ast.parse(src)
    lines = src.split("\n")

    # 每个函数的行号 → 它上方的最近一个分节标题
    section_of: dict[int, str] = {}
    order: list[str] = []
    current = "其它"
    for i, line in enumerate(lines, start=1):
        m = SECTION_LABEL.match(line.strip())
        if m:
            current = m.group(1).strip()
            if current not in order:
                order.append(current)
        section_of[i] = current

    rows: dict[str, list[tuple]] = {}
    for node in tree.body:
        if not isinstance(node, ast.FunctionDef):
            continue
        deco = next((d for d in node.decorator_list
                     if isinstance(d, ast.Call) and getattr(d.func, "id", "") == "operator"), None)
        if deco is None:
            continue
        name = deco.args[0].value
        kw = {k.arg: k.value for k in deco.keywords}

        def val(key, default):
            v = kw.get(key)
            if v is None:
                return default
            if isinstance(v, ast.Constant):
                return v.value
            if isinstance(v, ast.List):
                return [e.value for e in v.elts]
            return default

        in_a, out_a = val("in_arity", 1), val("out_arity", 1)
        out_names = val("out_names", []) or []
        doc = val("doc", "") or (ast.get_docstring(node) or "").strip().split("\n")[0]
        outs = ", ".join(out_names) if out_names else ("1 个值" if out_a == 1 else "%d 个值" % out_a)
        rows.setdefault(section_of.get(node.lineno, "其它"), []).append(
            (name, in_a, outs, doc.split("。")[0].split("；")[0].strip()))

    out = []
    for sec in [x for x in order if x in rows] + [x for x in rows if x not in order]:
        out.append("\n**%s**\n" % sec)
        out.append("| 算子 | 入参 | 输出 | 说明 |")
        out.append("| --- | --- | --- | --- |")
        for name, in_a, outs, doc in sorted(rows[sec]):
            out.append("| `%s` | %d | %s | %s |" % (name, in_a, outs, doc))
    total = sum(len(v) for v in rows.values())
    out.append("\n共 **%d** 个算子。输入个数与左值个数由算子签名强制校验（对不上则构建失败）；"
               "各算子的可调参数（如 `gt` / `p` / `factor` / `codes` / `labels` / `min_count`）"
               "写成算子调用的**关键字实参**（如 `percentile(w, p=95)`）；"
               "取数修饰（`per_instance` / `instance` / `alias` / `when_fw`）写在 `ref(...)` 上。"
               % total)
    return "\n".join(out)


def builtin_table() -> str:
    """从 _rule_env() 抄出内置变量（规则里可直接引用，无需在 compute 里声明）。"""
    src = CHECKS.read_text(encoding="utf-8")
    m = re.search(r"def _rule_env\(\):(.*?)\n\n\ndef ", src, re.S)
    body = m.group(1) if m else ""
    keys = re.findall(r'"([a-z_0-9]+)":', body)
    note = {
        "firmware": "固件标签（如 `1.15.0`，无法识别时为“未知（旧固件或无版本号）”）",
        "fw_major": "固件主版本号（int 或 None）",
        "fw_minor": "固件次版本号（int 或 None）——版本分支最常用",
        "fw_profile": "`px4-1.15+` 或 `px4-legacy`",
        "airframe": "机型字符串：`rotary_wing` / `fixed_wing` / `rover` / `airship` / `unknown`",
        "is_rotary_wing": "布尔别名（下同）",
        "is_fixed_wing": "布尔别名",
        "is_vtol": "布尔别名（`vtol` 在机型串里）",
        "is_rover": "布尔别名",
        "duration_s": "日志总时长（秒）",
        "armed_s": "armed 总时长（秒）",
        "phases": "本次日志出现过的飞行阶段集合（如 `'hover' in phases`）",
        "tags": "已命中的异常标签集合（喂故障库）",
        "guard_tags": "已产生的数据质量标签集合",
        "armed_intervals": "armed 区间列表 `[(start_us, end_us)]`，时序算子按它切窗",
        "t0_us": "日志起点时间戳（us），事件类算子算相对时刻用",
        "has_armed": "是否存在 armed 段（布尔）",
        "topics": "本日志实际存在的 topic 名集合（如 `'vehicle_attitude' in topics`）",
        "restart_detected": "是否有 topic 时间戳回退（疑似中途重启）",
        "dropout_ms": "全日志丢包累计（毫秒）",
        "messages": "日志消息条目列表 `[{tSec, message, level, level_name}]`",
        "no_data": "compute 是否算不出来：初值 False，compute 失败后置真（`skip` 列表里用它记一条 skipped）",
        "has_topic": "日志里有没有这个 topic，如 `not has_topic('cpuload')`（比 `'cpuload' not in topics` 直白）；表达式里**唯一**允许的函数调用",
    }
    rows = ["| 变量 | 含义 |", "| --- | --- |"]
    for k in keys:
        rows.append("| `%s` | %s |" % (k, note.get(k, "—")))
    return "\n".join(rows)


def replace_block(text: str, begin: str, end: str, payload: str) -> str:
    if begin not in text or end not in text:
        raise SystemExit("参考文档里缺少标记 %s / %s" % (begin, end))
    head, rest = text.split(begin, 1)
    _, tail = rest.split(end, 1)
    return head + begin + "\n" + payload.strip() + "\n" + end + tail


def main():
    text = DOC.read_text(encoding="utf-8")
    text = replace_block(text, BEGIN_OPS, END_OPS, operator_catalog())
    text = replace_block(text, BEGIN_VARS, END_VARS, builtin_table())
    DOC.write_text(text, encoding="utf-8", newline="\n")
    print("已生成算子目录与内置变量表 ->", DOC.relative_to(ROOT))


if __name__ == "__main__":
    main()
