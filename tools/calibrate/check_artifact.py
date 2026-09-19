"""校验**生成产物**（web/workers/ulog-check-script.ts）能被当作合法 Python 执行。

为什么需要它：本地回归跑的是 engine/ 下的源文件，而浏览器里跑的是构建产物
（operators.py + ulog_checks.py 经 String.raw 内联 + __FAULT_KB__/__RULES__
三处替换）。只有这一步能证明"真正进 Pyodide 的东西"是合法的——否则语法错误只能在
用户浏览器里炸出来。

四道检查，从松到紧：语法 → `.replace` 链按浏览器语义（只换第一处）复现 → compute
表达式 Python 侧可解析 → **真执行**（含"worker 守卫查的全局名真的存在"）。另有一组契约：
地图预设的适用范围（`conditions.topics`）真的搬进了 `facts.track`、"取不到轨迹必须逐条给出
原因"（并**构造两道反向用例**逼出失败分支）、"像经纬度"的判据不会把 `relative` 里的 `lat`
当成纬度、worker 查的全局名真的存在。

用法：python tools/calibrate/check-artifact.py
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
import run_checks_locally as runner  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
TS = REPO_ROOT / "web" / "workers" / "ulog-check-script.ts"
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
        raise SystemExit(f"生成产物里找不到 const {name} = ...")
    return json.loads(m.group(1))


def main() -> int:
    log.info("=== 产物校验（check_artifact） ===")
    failed = False
    src = TS.read_text(encoding="utf-8")
    m = re.search(r"String\.raw`(.*)`\n", src, re.S)
    if not m:
        raise SystemExit("生成产物里找不到 String.raw 模板")
    body = m.group(1)

    # 占位符**应当**留在模板里：由生成文件里的 .replace(...) 链在模块加载时替换。
    # 这里校验那条替换链覆盖了全部占位符，再复现替换结果验证是合法 Python。
    replaces = re.findall(r'\.replace\("(__[A-Z_]+__)"', src)
    # 模板里出现的占位符必须都被 .replace 链覆盖（阈值占位符已随 px4-thresholds.toml 退场）
    in_template = set(re.findall(r"(__[A-Z_]+__)", body))
    missing = in_template - set(replaces)
    if missing:
        raise SystemExit(f"生成产物的 .replace 链缺占位符：{sorted(missing)}")

    # 浏览器端的替换链是 JS 的 String.replace——**只换第一处**；上面"覆盖了"的存在性检查
    # 抓不住同一占位符出现多次的情况。2026-09-17 的 NameError 就是这么漏的：providers/px4.py
    # 的注释里提了一句 `__FACTS__`，浏览器第一处被注释吃掉、真正的赋值行原样进 Pyodide；
    # 而本地回归与下面的复现都用 Python 的 str.replace（全换）→ 本地全绿、线上打不开。
    # 这里按浏览器语义复现一遍：每个占位符只换第一处（第三参 1 对齐 JS 行为），
    # 换完不允许再有任何占位符残留。
    first_only = body
    for tok in replaces:
        first_only = first_only.replace(tok, "null", 1)
    leftover = set(re.findall(r"(__[A-Z_]+__)", first_only))
    if leftover:
        raise SystemExit(
            f"占位符在模板里出现了多次，浏览器只换第一处会漏掉真正的赋值行（NameError）：{sorted(leftover)}；"
            "把 engine/ 注释里提到占位符原文的地方改个说法，或查 build-knowledge.mjs 的拼接输入"
        )

    # .replace 链里引用的名字必须已在产物里声明（const X = ... / import X from ...）。
    # 踩过：加了 .replace("__FACTS__", JSON.stringify(facts)) 却忘了 const facts = ...，
    # 语法检查与"复现替换"都发现不了（这里自己代填占位符），但浏览器一加载就 ReferenceError。
    declared = set(re.findall(r"^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)", src, re.M))
    declared |= set(re.findall(r"^\s*import\s+([A-Za-z_$][\w$]*)\s+from", src, re.M))
    used: set[str] = set()
    for arg in re.findall(r'\.replace\("[A-Z_]+__",\s*([^)]+)\)', src):
        # 去掉属性访问（faultKbJson.entries → 只留 faultKbJson），否则把属性名当变量名
        head = re.sub(r"\.\s*[A-Za-z_$][\w$]*", "", arg)
        used |= set(re.findall(r"[A-Za-z_$][\w$]*", head)) - {"JSON", "stringify"}
    missing_names = sorted(used - declared)
    if missing_names:
        raise SystemExit(f"生成产物的 .replace 链引用了未声明的名字：{missing_names}")

    # 用真实取值复现最终 Python 源码
    final = body
    final = final.replace("__FAULT_KB__", repr(json.loads(FAULT_KB.read_text(encoding="utf-8"))["entries"]))
    final = final.replace("__RULES__", json.dumps(extract_json_const(src, "rules"), ensure_ascii=False))
    # 数据配置同样在 .replace 链里；它的装配规则（facts.yaml + plot/track.yml）与本地回归共用一处
    final = final.replace("__FACTS__", json.dumps(runner.load_facts_payload(), ensure_ascii=False))
    # 字段单位表（ref(..., unit=) 的源单位）同样从产物里取，与本地回归共用一处
    final = final.replace("__FIELD_UNITS__", json.dumps(runner.load_field_units(), ensure_ascii=False))

    try:
        ast.parse(final)
    except SyntaxError as e:
        log.error(f"生成产物不是合法 Python：{e}")
        log.error("  " + "\n  ".join(final.splitlines()[max(0, (e.lineno or 1) - 2) : (e.lineno or 1) + 1]))
        return 1

    rules = extract_json_const(src, "rules")
    log.info(f"OK 产物语法检查通过：{len(final.splitlines())} 行，含 {len(rules)} 条经验规则")

    # 地图预设的适用范围（`conditions.topics`）是**构建期**从 plot/track.yml 搬到 `facts.track` 的。
    # 这一步曾经无声漏掉：`compileMap` 只搬了 `children`，`conditions` 留在原地 → 引擎收不到
    # 「这份预设要 sensor_gps / vehicle_gps_position」这个闸门，于是日志里没有 GPS 时只能笼统报
    # 一句"声明里的坐标候选都不在日志里"（而且常常是错的：有 GPS 但全程没拿到 3D 定位时也是这句），
    # 用户拿不到任何能自己判断的线索。**搬家的丢失只在产物里看得见**，所以在这里核一遍。
    declared_topics = _declared_track_topics(TRACK_YML.read_text(encoding="utf-8"))
    if not declared_topics:
        log.error(f"{TRACK_YML.name} 里没有 conditions.topics 声明（守卫看不见判据，先确认是不是有意去掉的）")
        return 1
    got_topics = (runner.load_facts_payload().get("track") or {}).get("conditions", {}).get("topics")
    if got_topics != declared_topics:
        log.error("facts.track 里的 conditions.topics 与 plot/track.yml 的声明不一致：")
        log.error(f"  声明：{declared_topics}")
        log.error(f"  产物：{got_topics}")
        log.error("  构建期把这份声明丢了 —— 引擎侧就没有「缺哪个 topic」这道闸门了")
        return 1
    log.info(f"OK 地图预设的适用范围搬运检查通过：conditions.topics = {got_topics}")

    # compute 表达式是**构建期用 JS 校验**（web/scripts/lib/rule-expr.mjs）、**运行期用 Python
    # ast 求值**的。两侧是两套实现，中间就有缝：JS 放行而 Python 解析不了的写法会构建通过、
    # 到用户浏览器里才炸。这里用 Python 自己把每条表达式解析一遍，把缝焊上。
    n_expr = 0
    for r in rules:
        for expr in r.get("compute") or []:
            n_expr += 1
            try:
                tree = ast.parse(expr, mode="exec")
            except SyntaxError as e:
                log.error(f"规则 {r['id']} 的 compute 表达式不是合法 Python：{e}\n    {expr}")
                return 1
            if len(tree.body) != 1 or not isinstance(tree.body[0], ast.Assign):
                log.error(f"规则 {r['id']} 的 compute 不是一条赋值：{expr}")
                return 1
    log.info(f"OK compute 表达式检查通过：{n_expr} 条，Python 侧都能解析")

    # 仅语法检查不够：NameError / KeyError 这类只有**真执行**才暴露
    # （曾漏掉"operators.py 没被内联"导致 Pyodide 里 OPERATORS 未定义）。
    data_ts = (REPO_ROOT / "web" / "workers" / "ulog-data-script.ts").read_text(encoding="utf-8")
    m2 = re.search(r"String\.raw`(.*)`;", data_ts, re.S)
    if not m2:
        raise SystemExit("数据层产物里找不到 String.raw 模板")
    logs = sorted((Path(__file__).resolve().parent / "logs").glob("*.ulg"), key=lambda p: p.stat().st_size)
    if not logs:
        log.warning("SKIP 没有回归日志，跳过执行检查（caller 用 check_all.py 会自动跳过）")
        return 0
    log = logs[0]
    ns: dict = {"ulog_bytes": log.read_bytes()}
    try:
        exec(compile(final + "\n" + m2.group(1), "<artifact>", "exec"), ns)
        # 判定产物走具名入口（np_report 把结果摆到 __result）；以前靠"执行脚本的副作用"留下
        ns["np_report"]()
        result = json.loads(ns["__result"])
    except Exception as e:  # noqa: BLE001
        log.error(f"产物执行失败（{log.name}）：{type(e).__name__}: {e}")
        import traceback

        traceback.print_exc(limit=3)
        return 1
    required = ("findings", "facts", "metrics", "checksRun", "tags", "guardTags", "matchedFaults")
    missing_fields = [k for k in required if k not in result]
    if missing_fields:
        log.error(f"产物执行通过，但交付的报告缺字段：{missing_fields}（实际键：{sorted(result)}）")
        return 1
    if not isinstance(result["findings"], list):
        log.error(f"findings 不是数组，而是 {type(result['findings']).__name__}")
        return 1
    log.info(
        f"OK 产物执行检查通过：{log.name} → findings={len(result['findings'])}, "
        f"checksRun={len(result.get('checksRun', []))}, tags={result.get('tags')}"
    )

    # 「产物跑得通」不等于「worker 问得到东西」：worker 是拿**名字**去这个命名空间里取的
    # （pyodide.globals.get("...")），名字写错了守卫就恒真/恒假，语法与执行检查都看不见。
    # 2026-09-18 线上就栽在这：ulog-worker.ts 的守卫写的是 globals.get("ulog")，
    # 而产物里从来没有名为 `ulog` 的全局（bootstrap 那行是 `provider = open_log(...)`，
    # `from pyulog import ULog` 只带来 `ULog`）——于是守卫恒真，track/series 请求**永远**
    # 被判成"这份日志没解析过"：轨迹画不出来、也从没进过存档，界面还一直叫用户重选文件。
    # 名字对不对，只有拿真执行出来的命名空间核一遍才算数。
    worker_src = (REPO_ROOT / "web" / "workers" / "ulog-worker.ts").read_text(encoding="utf-8")
    asked = sorted(set(re.findall(r'globals\.get\("([A-Za-z_$][\w$]*)"\)', worker_src)))
    set_by_worker = set(re.findall(r'globals\.set\("([A-Za-z_$][\w$]*)"', worker_src))
    # 按 worker 的顺序把入口都调一遍：`__result` 是入口函数内部 `global __result` 摆出来的，
    # 只 exec 不调用时它并不存在——直接核名字会把 `__result` 误判成不存在的名字。
    produced: dict[str, object] = {}
    for entry in ("np_report", "np_manifest", "np_log_info", "np_track"):
        if entry not in ns:
            continue
        ns[entry]()
        produced[entry] = json.loads(ns["__result"])
    unknown = [n for n in asked if n not in ns and n not in set_by_worker]
    if unknown:
        available = sorted(k for k in ns if not k.startswith("__"))
        log.error(f"worker 查的全局名在产物命名空间里不存在：{unknown}")
        log.error(f"  产物里真实存在的顶层名字：{available}")
        log.error("  这种守卫恒真/恒假：要么取数据永远失败，要么静默拿到另一份日志的数据")
        return 1
    track_n = len((produced.get("np_track") or {}).get("tracks") or [])  # type: ignore[union-attr]
    log.info(f"OK worker 守卫的全局名核对通过：{asked}（np_track 跑出 {track_n} 条轨迹）")

    # 轨迹取不到时**必须**逐条给出原因（`errorReasons`）——界面就是拿它当列表渲染的。
    # 这条契约曾经没有：只给一句"声明里的坐标候选都不在日志里"，而那一句只对应六种原因里的
    # 一种（字段改名 / 有采样但全程没定位 / 采样数对不上 / 没 timestamp…都对不上），用户据此
    # 什么也判断不了。契约写在 types.ts 与 px4.py 两处，容易各说各的——这里用真跑出来的返回体核。
    def check_track_contract(payload: dict, case: str) -> bool:
        if payload.get("error"):
            reasons = payload.get("errorReasons")
            if not isinstance(reasons, list) or not reasons or not all(isinstance(r, str) and r for r in reasons):
                log.error(f"轨迹取不到却没有给出逐条原因（{case}）：")
                log.error(f"  error = {payload.get('error')!r}")
                log.error(f"  errorReasons = {reasons!r}")
                log.error("  界面只能显示那句概括，而概括往往会说错（见 CLAUDE.md §6.8）")
                return False
            log.info(f"  OK 轨迹失败的返回体契约通过（{case}）：error 带 {len(reasons)} 条具体原因")
            return True
        if not payload.get("tracks"):
            log.error(f"  FAIL 轨迹既没有 tracks 也没有 error（{case}）——返回体形状不对，前端会当成解析器缺陷")
            return False
        log.info(f"  OK 轨迹成功的返回体契约通过（{case}）：{len(payload['tracks'])} 条轨道")
        return True

    if not check_track_contract(produced.get("np_track") or {}, f"{log.name} 实跑"):
        return 1

    # 「像经纬度」的判据必须**独立成段**。裸子串会把 `relative_test_ratio` /
    # `accelerometer_timestamp_relative` 里的 "lat" 当成纬度，于是对照物里混进
    # `estimator_selector_status`、`sensor_combined` 这些跟坐标毫无关系的 topic；
    # 而这份对照物的**唯一用途**就是让用户看出"日志里到底有没有坐标"——判据错了它就以
    # "听起来很具体"的方式把人带偏（实测第一版就是这个错，比不给对照物更糟）。
    # 纯函数，直接拿引擎源码 exec 出来的那个函数核——它和运行期是同一份实现。
    latlon = ns.get("_latlon_fields")
    if not callable(latlon):
        log.error("产物里找不到 _latlon_fields（对照物的判据）——_coord_field_topics_note 的实现换了？")
        return 1
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
    if got != should or got_not:
        log.error("「像经纬度」的判据错了（对照物会列出与坐标无关的 topic）：")
        log.error(f"  该认出来的漏了：{sorted(set(should) - set(got))}")
        log.error(f"  不该认的认了：{got_not}")
        return 1
    log.info(f"OK 经纬度判据检查通过：认出 {len(should)} 个（含 `previous.lat` 这类嵌套），挡掉 {len(should_not)} 个干扰名")

    # **守卫自己也要被校验**（CLAUDE.md §6.6）：上面这条契约只在"取不到"时生效，而回归用的
    # 这条日志有 GPS —— 光跑它，"error 不带原因"这个 bug 一次都不会被抓到（守卫恒绿）。
    # 所以把声明的 topic 改成一个日志里不可能有的名字，逼出失败路径，再核同一份契约。
    # 走的就是用户遇到的那条路：`conditions.topics` 一个候选都不在日志里 → 引擎该说"缺哪个 topic"。
    provider = ns.get("provider")
    cfg = getattr(provider, "_cfg", None)
    track_spec = (cfg or {}).get("track") if isinstance(cfg, dict) else None
    if not isinstance(track_spec, dict) or "conditions" not in track_spec:
        log.error("产物里的 provider 拿不到 track 声明（`provider._cfg['track']`）——对不上就构造不出反向用例")
        return 1
    track_spec["conditions"]["topics"] = [["__no_such_topic_regression_probe__"]]
    ns["np_track"]()
    forced = json.loads(ns["__result"])
    if not forced.get("error"):
        log.error("声明了一个日志里没有的 topic，引擎却没报错——闸门没生效（conditions.topics 被忽略了）")
        log.error(f"  返回体：{json.dumps(forced, ensure_ascii=False)[:200]}")
        return 1
    if not check_track_contract(forced, "逼出的失败路径"):
        return 1
    if "__no_such_topic_regression_probe__" not in (forced.get("errorReasons") or [""])[0]:
        log.error("失败原因里没提声明的 topic 名——用户看不出到底缺哪个（引擎没复用 _missing_topics）")
        log.error(f"  errorReasons = {forced.get('errorReasons')!r}")
        return 1

    # 第二道反向用例：闸门**过了**、却取不到坐标。这条和上面那道是**两条**产出原因的路径
    # （`get_flight_track` 里先过 `conditions.topics`，再逐候选走 `_one_track`），只测一条
    # 的话另一条退化成"只给一句概括"照样绿。把 lat 的候选改成一个日志里没有的 topic 造出来。
    track_spec["conditions"]["topics"] = []  # 闸门放行（空声明 = 不限）
    lat_spec = track_spec["children"][0]["lat"]
    lat_spec["cands"] = ["__no_such_topic_regression_probe__[0].latitude_deg"]
    ns["np_track"]()
    broke = json.loads(ns["__result"])
    if not broke.get("error"):
        log.error("候选字段全取不到，引擎却没报错——逐候选的原因那条路没接上")
        log.error(f"  返回体：{json.dumps(broke, ensure_ascii=False)[:200]}")
        return 1
    if not check_track_contract(broke, "逼出的字段失败路径"):
        return 1
    joined = " ".join(broke.get("errorReasons") or [])
    if "__no_such_topic_regression_probe__" not in joined:
        log.error("失败原因里没提是哪个 topic / 哪个字段取不到——用户没法照着改")
        log.error(f"  errorReasons = {broke.get('errorReasons')!r}")
        return 1
    log.info("  OK 逼出的字段失败路径契约通过")
    log.info("\n=== 产物校验全部通过 ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())