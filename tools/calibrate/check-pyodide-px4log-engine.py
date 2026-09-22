"""校验**生成产物**（web/workers/pyodide-px4log-engine.ts）能被当作合法 Python 执行。

为什么需要它：本地回归跑的是 engine/ 下的源文件，而浏览器里跑的是构建产物
（operators.py + ulog_checks.py 经 String.raw 内联 + __FAULT_KB__/__RULES__
三处替换）。只有这一步能证明"真正进 Pyodide 的东西"是合法的——否则语法错误只能在
用户浏览器里炸出来。

四道检查，从松到紧：语法 → `.replace` 链按浏览器语义（只换第一处）复现 → compute
表达式 Python 侧可解析 → **真执行**（含"worker 守卫查的全局名真的存在"）。另有一组契约：
地图预设的适用范围（`conditions.topics`）真的搬进了 `facts.track`、"取不到轨迹必须逐条给出
原因"（并**构造两道反向用例**逼出失败分支）、"像经纬度"的判据不会把 `relative` 里的 `lat`
当成纬度、worker 查的全局名真的存在。

用法：python tools/calibrate/check-pyodide-px4log-engine.py
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

# 数据配置的装配规则与本地回归共用一处（facts.yaml + plot/track.yml）——
# 别在这里再手写一遍，两边不一致时本地跑得出、浏览器跑不出。
sys.path.insert(0, str(Path(__file__).resolve().parent))
import px4log_engine_runner as runner  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
TS = REPO_ROOT / "web" / "workers" / "pyodide-px4log-engine.ts"
FAULT_KB = REPO_ROOT / "web" / "workers" / "fault-kb.generated.json"
TRACK_YML = REPO_ROOT / "knowledge" / "px4" / "plot" / "track.yml"


def _declared_track_topics(text: str) -> list:
    """从 plot/track.yml 读出 `conditions.topics` 的声明，**并折成运行期形态**（候选组）。

    YAML 里写成 `["sensor_gps || vehicle_gps_position"]`，`facts.track` 里存的是
    `[["sensor_gps", "vehicle_gps_position"]]`——项内 `||` 由构建期拆成候选列表
    （`rule_engine._missing_topics` 只认折好的形态，它不认识 `||`）。比对时必须用同一个
    语义折过，否则守卫会对着"表示形式不同"报假失败。

    这里**不引 pyyaml**：只为一行声明装一个解析器不划算，而且这是"守卫读声明"的窄用途——
    读不出来（格式没见过的写法）时返回空列表，由调用方报错，而不是静默当成"没声明"。
    """
    m = re.search(r"^\s*topics:\s*(.*)$", text, re.M)
    if not m:
        return []
    inline = m.group(1).strip()
    if inline.startswith("["):
        try:
            val = ast.literal_eval(inline)
        except (ValueError, SyntaxError):
            return []
        items = [str(x) for x in val] if isinstance(val, list) else []
    elif inline:
        return []
    else:
        # 块状写法：`topics:` 后面换行，随后是若干 `- ...`
        items = []
        for line in text[m.end() :].splitlines():
            if not line.strip():
                continue
            if re.match(r"^\s*-\s+", line):
                items.append(line.split("-", 1)[1].strip().strip("\"'"))
                continue
            break  # 遇到同级的别的键就停
    return [[c.strip() for c in it.split("||") if c.strip()] for it in items]


def extract_json_const(src: str, name: str):
    """取出构建脚本写入的 `const <name> = <json>;`（JSON.stringify 产物，可直接 json.loads）。"""
    m = re.search(rf"^const {name} = (.*?);$", src, re.M | re.S)
    if not m:
        raise RuntimeError(f"生成产物里找不到 const {name} = ...")
    return json.loads(m.group(1))


def main() -> int:
    log.print_header("产物校验（check-pyodide-px4log-engine）", f"python {Path(__file__).name}")

    total = 8
    results: list[tuple[str, str]] = []
    skipped: list[str] = []
    step = 0

    src = TS.read_text(encoding="utf-8")

    # ── Check 1: 模板完整性 ──────────────────────────────────────────
    step += 1
    rule_name = "产物模板完整性（String.raw + .replace 链覆盖 + 唯一性 + 名字已声明）"

    m = re.search(r"String\.raw`(.*)`\n", src, re.S)
    if not m:
        log.print_check(step, total, rule_name, False, err="生成产物里找不到 String.raw 模板")
        results.append((rule_name, "fail"))
        return log.print_summary(results, skipped)
    body = m.group(1)

    replaces = re.findall(r'\.replace\("(__[A-Z_]+__)"', src)
    in_template = set(re.findall(r"(__[A-Z_]+__)", body))
    missing = in_template - set(replaces)

    first_only = body
    for tok in replaces:
        first_only = first_only.replace(tok, "null", 1)
    leftover = set(re.findall(r"(__[A-Z_]+__)", first_only))

    declared = set(re.findall(r"^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)", src, re.M))
    declared |= set(re.findall(r"^\s*import\s+([A-Za-z_$][\w$]*)\s+from", src, re.M))
    used: set[str] = set()
    for arg in re.findall(r'\.replace\("[A-Z_]+__",\s*([^)]+)\)', src):
        head = re.sub(r"\.\s*[A-Za-z_$][\w$]*", "", arg)
        used |= set(re.findall(r"[A-Za-z_$][\w$]*", head)) - {"JSON", "stringify"}
    missing_names = sorted(used - declared)

    template_ok = not missing and not leftover and not missing_names
    detail_lines = [
        f"模板占位符 {len(in_template)} 个，.replace 链覆盖 {len(replaces)} 个",
    ]
    err_lines = []
    if missing:
        err_lines.append(f"缺占位符：{sorted(missing)}")
    if leftover:
        err_lines.append(f"浏览器只换第一处后仍残留：{sorted(leftover)} — 注释里的占位符会吃掉第一处")
    if missing_names:
        err_lines.append(f".replace 链引用了未声明的名字：{missing_names}")
    detail = "\n".join(detail_lines)
    err = "\n".join(err_lines)
    log.print_check(step, total, rule_name, template_ok, detail, err)
    results.append((rule_name, "ok" if template_ok else "fail"))
    if not template_ok:
        return log.print_summary(results, skipped)

    # 用真实取值复现最终 Python 源码（后续检查共用）
    final = body
    final = final.replace("__FAULT_KB__", repr(json.loads(FAULT_KB.read_text(encoding="utf-8"))["entries"]))
    final = final.replace("__RULES__", json.dumps(extract_json_const(src, "rules"), ensure_ascii=False))
    final = final.replace("__FACTS__", json.dumps(runner.load_facts_payload(), ensure_ascii=False))
    final = final.replace("__FIELD_UNITS__", json.dumps(runner.load_field_units(), ensure_ascii=False))

    # ── Check 2: Python 语法 ─────────────────────────────────────────
    step += 1
    rule_name = "产物是合法 Python（ast.parse）"

    rules = extract_json_const(src, "rules")
    syntax_err = ""
    try:
        ast.parse(final)
    except SyntaxError as e:
        snippet = "\n".join(final.splitlines()[max(0, (e.lineno or 1) - 2) : (e.lineno or 1) + 1])
        syntax_err = f"{e}\nline {e.lineno or '?'}:\n{snippet}"

    syntax_ok = not syntax_err
    detail = f"{len(final.splitlines())} 行，含 {len(rules)} 条经验规则"
    log.print_check(step, total, rule_name, syntax_ok, detail, syntax_err)
    results.append((rule_name, "ok" if syntax_ok else "fail"))
    if not syntax_ok:
        return log.print_summary(results, skipped)

    # ── Check 3: facts.track.conditions.topics 搬运 ──────────────────
    step += 1
    rule_name = "conditions.topics 从 track.yml 搬进 facts.track"

    declared_topics = _declared_track_topics(TRACK_YML.read_text(encoding="utf-8"))
    got_topics = (runner.load_facts_payload().get("track") or {}).get("conditions", {}).get("topics")
    topics_ok = bool(declared_topics) and got_topics == declared_topics

    detail = f"declared={declared_topics}\nproduced={got_topics}"
    err = ""
    if not declared_topics:
        err = f"{TRACK_YML.name} 里没有 conditions.topics 声明（守卫看不见判据）"
    elif got_topics != declared_topics:
        err = '构建期把这份声明丢了 — 引擎侧没有"缺哪个 topic"闸门'
    log.print_check(step, total, rule_name, topics_ok, detail, err)
    results.append((rule_name, "ok" if topics_ok else "fail"))
    if not topics_ok:
        return log.print_summary(results, skipped)

    # ── Check 4: compute 表达式 Python 可解析 ────────────────────────
    step += 1
    rule_name = "compute 表达式 Python 侧可解析"

    n_expr = 0
    compute_ok = True
    compute_err = ""
    for r in rules:
        for expr in r.get("compute") or []:
            n_expr += 1
            try:
                tree = ast.parse(expr, mode="exec")
            except SyntaxError as e:
                compute_ok = False
                compute_err = f"规则 {r['id']} 的 compute 不是合法 Python：{e}\n    {expr}"
                break
            if len(tree.body) != 1 or not isinstance(tree.body[0], ast.Assign):
                compute_ok = False
                compute_err = f"规则 {r['id']} 的 compute 不是一条赋值：{expr}"
                break
        if not compute_ok:
            break

    log.print_check(step, total, rule_name, compute_ok, f"{n_expr} 条表达式", compute_err)
    results.append((rule_name, "ok" if compute_ok else "fail"))
    if not compute_ok:
        return log.print_summary(results, skipped)

    # ── Check 5: 产物真执行 + 返回体字段契约 ─────────────────────────
    step += 1
    rule_name = "产物真执行 + 返回体字段契约"

    data_ts = (REPO_ROOT / "web" / "workers" / "pyodide-px4log-data.ts").read_text(encoding="utf-8")
    m2 = re.search(r"String\.raw`(.*)`;", data_ts, re.S)
    if not m2:
        log.print_check(step, total, rule_name, False, err="数据层产物里找不到 String.raw 模板")
        results.append((rule_name, "fail"))
        return log.print_summary(results, skipped)

    logs = sorted((Path(__file__).resolve().parent / "logs").glob("*.ulg"), key=lambda p: p.stat().st_size)
    if not logs:
        log.print_check(step, total, rule_name, True, detail="SKIP 没有回归日志")
        skipped.append("产物执行：无回归日志")
        results.append((rule_name, "skip"))
        # 跳过执行相关的后续检查
        return log.print_summary(results, skipped)

    log_file = logs[0]
    ns: dict = {"ulog_bytes": log_file.read_bytes()}
    exec_err = ""
    result = None
    try:
        exec(compile(final + "\n" + m2.group(1), "<artifact>", "exec"), ns)
        ns["np_report"]()
        result = json.loads(ns["__result"])
    except Exception as e:  # noqa: BLE001
        import traceback as _tb

        exec_err = f"{type(e).__name__}: {e}\n{_tb.format_exc(limit=3).strip()}"

    if exec_err:
        log.print_check(step, total, rule_name, False, detail=str(log_file.name), err=exec_err)
        results.append((rule_name, "fail"))
        return log.print_summary(results, skipped)

    required = ("findings", "facts", "metrics", "checksRun", "tags", "guardTags", "matchedFaults")
    missing_fields = [k for k in required if k not in result]
    field_ok = not missing_fields and isinstance(result["findings"], list)
    field_err = ""
    if missing_fields:
        field_err = f"缺字段：{missing_fields}（实际键：{sorted(result)}）"
    elif not isinstance(result["findings"], list):
        field_err = f"findings 不是数组，而是 {type(result['findings']).__name__}"

    detail = (
        f"{log_file.name} → findings={len(result['findings'])}, "
        f"checksRun={len(result.get('checksRun', []))}, tags={result.get('tags')}"
    )
    log.print_check(step, total, rule_name, field_ok, detail, field_err)
    results.append((rule_name, "ok" if field_ok else "fail"))
    if not field_ok:
        return log.print_summary(results, skipped)

    # ── Check 6: worker globals.get 名字核对 ────────────────────────
    step += 1
    rule_name = "worker globals.get 名字核对"

    worker_src = (REPO_ROOT / "web" / "workers" / "pyodide-px4log-worker.ts").read_text(encoding="utf-8")
    asked = sorted(set(re.findall(r'globals\.get\("([A-Za-z_$][\w$]*)"\)', worker_src)))
    set_by_worker = set(re.findall(r'globals\.set\("([A-Za-z_$][\w$]*)"', worker_src))

    produced: dict[str, object] = {}
    for entry in ("np_report", "np_manifest", "np_log_info", "np_track"):
        if entry not in ns:
            continue
        ns[entry]()
        produced[entry] = json.loads(ns["__result"])

    unknown = [n for n in asked if n not in ns and n not in set_by_worker]
    track_n = len((produced.get("np_track") or {}).get("tracks") or [])  # type: ignore[union-attr]

    worker_ok = not unknown
    detail = f"worker 查 {len(asked)} 个名字，np_track 跑出 {track_n} 条轨迹"
    err = ""
    if unknown:
        available = sorted(k for k in ns if not k.startswith("__"))
        err = f"worker 查的全局名不存在：{unknown}\n产物真实顶层名字：{available}\n（守卫恒真/恒假，取数据永远失败或静默拿另一份日志）"
    log.print_check(step, total, rule_name, worker_ok, detail, err)
    results.append((rule_name, "ok" if worker_ok else "fail"))
    if not worker_ok:
        return log.print_summary(results, skipped)

    # ── Check 7: 轨迹契约（成功 + 反向 topics 闸门 + 反向字段候选）─
    step += 1
    rule_name = "轨迹契约（成功路径 + 两道反向用例 + errorReasons）"

    def _contract(payload: dict, label: str) -> tuple[bool, str]:
        if payload.get("error"):
            reasons = payload.get("errorReasons")
            if not isinstance(reasons, list) or not reasons or not all(isinstance(r, str) and r for r in reasons):
                return False, f"[{label}] error={payload.get('error')!r} 但 errorReasons={reasons!r}"
            return True, f"[{label}] error + {len(reasons)} 条 reasons"
        if not payload.get("tracks"):
            return False, f"[{label}] 既没有 tracks 也没有 error"
        return True, f"[{label}] {len(payload['tracks'])} 条轨道"

    track_ok = True
    detail_parts = []
    err_parts = []

    ok_part, detail_part = _contract(produced.get("np_track") or {}, "实跑成功路径")
    detail_parts.append(detail_part)
    if not ok_part:
        track_ok = False
        err_parts.append(detail_part)

    provider = ns.get("provider")
    cfg = getattr(provider, "_cfg", None)
    track_spec = (cfg or {}).get("track") if isinstance(cfg, dict) else None
    if not isinstance(track_spec, dict) or "conditions" not in track_spec:
        track_ok = False
        err_parts.append("provider._cfg['track'] 拿不到，构造不了反向用例")
    else:
        track_spec["conditions"]["topics"] = [["__no_such_topic_regression_probe__"]]
        ns["np_track"]()
        forced = json.loads(ns["__result"])
        if not forced.get("error"):
            track_ok = False
            err_parts.append("topics 闸门没生效（声明不存在的 topic 却没报错）")
        else:
            ok_part, detail_part = _contract(forced, "topics 闸门反向")
            detail_parts.append(detail_part)
            if not ok_part:
                track_ok = False
                err_parts.append(detail_part)
            if "__no_such_topic_regression_probe__" not in (forced.get("errorReasons") or [""])[0]:
                track_ok = False
                err_parts.append("反向 topics 失败原因里没提 topic 名")

        track_spec["conditions"]["topics"] = []
        lat_spec = track_spec["children"][0]["lat"]
        lat_spec["cands"] = ["__no_such_topic_regression_probe__[0].latitude_deg"]
        ns["np_track"]()
        broke = json.loads(ns["__result"])
        if not broke.get("error"):
            track_ok = False
            err_parts.append("逐候选失败路径没接上（候选全取不到却没报错）")
        else:
            ok_part, detail_part = _contract(broke, "字段候选反向")
            detail_parts.append(detail_part)
            if not ok_part:
                track_ok = False
                err_parts.append(detail_part)
            if "__no_such_topic_regression_probe__" not in " ".join(broke.get("errorReasons") or []):
                track_ok = False
                err_parts.append("反向字段失败原因里没提 topic/字段名")

    log.print_check(step, total, rule_name, track_ok, "\n".join(detail_parts), "\n".join(err_parts))
    results.append((rule_name, "ok" if track_ok else "fail"))
    if not track_ok:
        return log.print_summary(results, skipped)

    # ── Check 8: 经纬度判据 ──────────────────────────────────────────
    step += 1
    rule_name = "「像经纬度」判据不误匹配"

    latlon = ns.get("_latlon_fields")
    if not callable(latlon):
        log.print_check(step, total, rule_name, False, err="产物里找不到 _latlon_fields")
        results.append((rule_name, "fail"))
        return log.print_summary(results, skipped)

    should = [
        "lat",
        "lon",
        "lng",
        "ref_lat",
        "ref_lon",
        "latitude_deg",
        "longitude_deg",
        "previous.lat",
        "current.lon",
        "gps_lat_deg",
    ]
    should_not = [
        "relative_test_ratio[0]",
        "accelerometer_timestamp_relative",
        "lateral_accel",
        "altitude_msl_m",
        "mode_req_local_alt",
        "fd_alt",
        "baro_alt_meter",
        "timestamp",
        "lonely_thing",
    ]
    got, got_not = latlon(should), latlon(should_not)
    latlon_ok = got == should and not got_not

    err = ""
    if got != should:
        err = f"该认出来的漏了：{sorted(set(should) - set(got))}"
    if got_not:
        err += f"\n不该认的认了：{got_not}"
    err = err.strip()

    log.print_check(
        step,
        total,
        rule_name,
        latlon_ok,
        detail=f"认出 {len(should)} 个（含 `previous.lat` 嵌套），挡掉 {len(should_not)} 个干扰名",
        err=err,
    )
    results.append((rule_name, "ok" if latlon_ok else "fail"))

    return log.print_summary(results, skipped)


if __name__ == "__main__":
    raise SystemExit(main())
