"""规则调试探针：把某条经验的 compute 链逐节点真跑一遍并打印，用于定位“为什么不触发”。

用法：python tools/calibrate/probe_rule.py <log.ulg> <rule_id>
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_checks_locally import build_namespace  # noqa: E402


def describe(a):
    import numpy as np

    if a is None:
        return "None"
    if isinstance(a, list):
        inner = [("arr%d" % len(x)) if x is not None else "None" for x in a]
        return "list[%d]%s" % (len(a), inner[:6])
    try:
        return "arr%s" % (np.asarray(a).shape,)
    except Exception:
        return type(a).__name__


def main(argv):
    log, rule_id = Path(argv[1]), argv[2]
    ns = build_namespace(log)
    rule = next(r for r in ns["RULES"] if r["id"] == rule_id)
    env = ns["_rule_env"]()
    print("rule %s slot=%s checks=%s" % (rule_id, rule.get("slot"), rule["emit"]["check"]))
    declared = []
    for node in rule["compute"]:
        ins = node.get("in")
        if ins is None:
            ins = node["from"] if isinstance(node["from"], list) else [node["from"]]
        outs = node["out"] if isinstance(node["out"], list) else [node["out"]]
        declared.extend(outs)
        # 与框架一致：when_fw 不满足就跳过该节点、输出置 None
        wf = node.get("when_fw")
        if wf is not None and not ns["_match_firmware"](wf):
            print("  [skip] op=%s when_fw=%s 不满足 -> %s=None" % (node["op"], wf, ", ".join(outs)))
            for name in outs:
                env[name] = None
            continue
        args = []
        for ref in ins:
            if not isinstance(ref, str):
                args.append(ref)
            elif ref in env:
                args.append(env[ref])
            elif node.get("per_instance"):
                args.append(ns["_read_field_ref_grouped"](ref, (node.get("aliases") or {}).get(ref)))
            else:
                args.append(ns["_read_field_ref"](ref))
        try:
            res = ns["OPERATORS"][node["op"]](*args, **node)
        except Exception as err:
            print("  op=%-22s in=%s -> EXC %s" % (node["op"], [describe(a) for a in args], err))
            return 1
        if not isinstance(res, tuple):
            res = (res,)
        shown = [r if not hasattr(r, "shape") else "arr%s" % (r.shape,) for r in res]
        print("  op=%-22s in=%s -> %s" % (node["op"], [describe(a) for a in args], shown))
        for name, val in zip(outs, res):
            env[name] = val
    print("  values:", {k: (round(v, 4) if isinstance(v, float) else v)
                        for k, v in env.items() if k in declared})
    for t in rule["triggers"]:
        try:
            print("  trigger %-24s -> %s" % (t["expr"], ns["_eval_expr"](t["expr"], env)))
        except Exception as err:
            print("  trigger %-24s -> EXC %s: %s" % (t["expr"], type(err).__name__, err))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
