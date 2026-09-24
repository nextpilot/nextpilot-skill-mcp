"""规则调试探针：把某条经验的 compute 逐条真跑一遍并打印，用于定位“为什么不触发”。

用法：python tools/dev/probe_rule.py <log.ulg> <rule_id>

compute 是表达式，所以这里按表达式调试：
每条打印原文，再把其中**每个子表达式**单独求值一遍——失败的那一层一眼可见。
"""

import ast
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

from px4log_engine_runner import build_namespace  # noqa: E402


def describe(a):
    import numpy as np

    if a is None:
        return "None"
    if isinstance(a, list):
        inner = [("arr%d" % len(x)) if x is not None else "None" for x in a]
        return "list[%d]%s" % (len(a), inner[:6])
    if isinstance(a, (bool, int, float, str)):
        return repr(a)
    try:
        return "arr%s" % (np.asarray(a).shape,)
    except Exception:
        return type(a).__name__


def src_of(node, expr_src):
    """把子表达式还原成原文片段（用于打印）。"""
    try:
        return ast.get_source_segment(expr_src, node)
    except Exception:
        return ast.dump(node)[:60]


def probe_expr(ns, expr_src, env):
    """逐个子表达式求值，打印值或错误。返回顶层是否成功。"""
    tree = ast.parse(expr_src, mode="exec")
    assign = tree.body[0]
    guarded = isinstance(assign.value, ast.Call) and getattr(assign.value.func, "id", "") == "_try"
    # 与引擎一致：先按白名单重写 topic.field → ref("topic.field")，再求值
    ns["_ComputeRefs"](set(env)).visit(tree)
    ast.fix_missing_locations(tree)

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        try:
            val = eval(compile(ast.Expression(body=node), "<probe>", "eval"), ns["_COMPUTE_GLOBALS"], env)
            log.info("    %-28s = %s" % (src_of(node, expr_src)[:28], describe(val)))
        except Exception as err:
            log.warning("    %-28s ! %s: %s" % (src_of(node, expr_src)[:28], type(err).__name__, err))
    try:
        ns["_eval_compute"](expr_src, env)
        outs = [t.id for t in (assign.targets[0].elts if isinstance(assign.targets[0], ast.Tuple) else [assign.targets[0]])]
        log.info(
            "  -> %s = %s"
            % (
                ", ".join(outs),
                describe(tuple(env.get(o) for o in outs)) if len(outs) > 1 else describe(env.get(outs[0])),
            )
        )
        return True, guarded
    except Exception as err:
        log.warning("  -> 中止（%s: %s）%s" % (type(err).__name__, err, "（_try 包裹，实际会置 None）" if guarded else ""))
        return False, guarded


def targets_of(expr_src):
    tree = ast.parse(expr_src, mode="exec")
    tgt = tree.body[0].targets[0]
    return [e.id for e in tgt.elts] if isinstance(tgt, ast.Tuple) else [tgt.id]


def main(argv):
    # 局部变量不能叫 log：模块顶部的 `log` 是 logger，被日志路径顶掉后下面每次 log.info 都会崩。
    log_path, rule_id = Path(argv[1]), argv[2]
    ns = build_namespace(log_path)
    rule = next((r for r in ns["RULES"] if r["id"] == rule_id), None)
    if rule is None:
        log.warning("找不到规则 %s；现有：%s" % (rule_id, ", ".join(r["id"] for r in ns["RULES"])))
        return 2
    env = ns["_rule_env"]()
    log.info("rule %s  group=%s  checks=%s" % (rule_id, rule.get("group"), (rule.get("outputs") or {}).get("check")))
    log.info("  firmware=%s vehicle=%s skip=%s" % (rule.get("firmware"), rule.get("vehicle"), rule.get("skip")))
    declared = []
    for i, expr in enumerate(rule.get("compute") or [], 1):
        log.info("\n  [%d] %s" % (i, expr))
        ok, _ = probe_expr(ns, expr, env)
        if not ok:
            log.warning("  （数据不足：按引擎语义，这条规则不出结论）")
            return 0
        declared.extend(targets_of(expr))
    log.info("\n  变量：")
    for k in declared:
        v = env.get(k)
        log.info("    %-14s = %s" % (k, round(v, 4) if isinstance(v, float) else v))
    for t in rule.get("triggers") or []:
        try:
            log.info("  trigger %-34s -> %s" % (t["when"], ns["_eval_expr"](t["when"], env)))
        except Exception as err:
            log.warning("  trigger %-34s -> EXC %s: %s" % (t["when"], type(err).__name__, err))
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    raise SystemExit(main(sys.argv))
