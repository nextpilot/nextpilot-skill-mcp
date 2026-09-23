"""日志适配器（provider）契约测试 —— 对**每一个** provider 跑同一套断言。

为什么需要它（构建期与运行期不是已经各查过一道了吗）：
  · 构建期只查"方法有没有定义、builtin_variables() 的键齐不齐"——看不进方法体
  · 运行期自检只查"名字取不舍得出、类型对不对"——看不了值
  这一道查的是**语义**：失败语义（取不到必须返回 None 而不是抛）、get_topic_meta() 与 get_series()
  是否自洽、armed_intervals 的形状、get_report_facts() 与 builtin_variables() 是否互相矛盾……
  这三道合起来 = 契约可执行；加一种新格式（ArduPilot .bin）时，跑通这里就不用重读引擎。

用法：
  python tools/calibrate/guard-px4log-provider.py <log.ulg> [more.ulg ...]
  python tools/calibrate/guard-px4log-provider.py --list          # 列出已注册的格式
日志文件的格式由**文件头**判定（适配器自己探测），所以不用告诉它用哪个 provider。
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

sys.path.insert(0, str(Path(__file__).resolve().parent))
import px4log_engine_runner as runner  # noqa: E402

TOTAL_STEPS = 8


def check_provider(ns: dict, path: Path) -> list[tuple[str, str]]:
    p = ns["provider"]
    where = f"{getattr(p, 'log_type', '?')}  {path.name}"

    results: list[tuple[str, str]] = []
    step = 0

    # ── 1. 失败语义：取不到一律 None，不抛异常 ──────────────────────
    step += 1
    rule_name = f"[{path.name}] 失败语义（取不到必返 None，不抛异常）"
    failed: list[str] = []
    for name, call in (
        ("series 不存在的 topic", lambda: p.get_series("no_such_topic.field")),
        ("series 不存在的字段", lambda: p.get_series("vehicle_status.no_such_field")),
        ("series 不存在的实例", lambda: p.get_series("vehicle_status.timestamp", instance=99)),
        ("columns 不存在的 topic", lambda: p.get_topic_data("no_such_topic", 0)),
        (
            "column 不存在的字段名",
            lambda: p.get_first_existing_column("vehicle_status", ["no_such_field"]),
        ),
    ):
        try:
            if call() is not None:
                failed.append(f"{where}: {name} 应当返回 None")
        except Exception as exc:
            failed.append(f"{where}: {name} 抛了异常（契约要求返回 None）：{exc!r}")
    ok = not failed
    detail = f"{len((' ', ' ')) * 3 if False else 5} 条失败语义断言"
    err = "\n".join(failed)
    log.print_check(step, TOTAL_STEPS, rule_name, ok, detail, err)
    results.append((rule_name, "ok" if ok else "fail"))

    # ── 2. get_topic_meta() 与 get_series() 自洽 ────────────────────
    step += 1
    rule_name = f"[{path.name}] get_topic_meta 与 get_series 自洽"
    failed = []
    msgs = p.get_topic_meta()
    if not (isinstance(msgs, list) and msgs):
        failed.append(f"{where}: get_topic_meta() 为空")
    else:
        for m in msgs:
            t, inst = m["topic"], m["instance"]
            if not p.has_topic(t):
                failed.append(f"{where}: get_topic_meta() 里有 {t}，但 has_topic() 说没有")
                continue
            cols = p.get_topic_data(t, inst)
            if cols is None:
                failed.append(f"{where}: columns({t}, {inst}) 取不到")
                continue
            if "timestamp" not in cols:
                failed.append(f"{where}: {t}#{inst} 没有 timestamp 列")
            for f in m["fields"]:
                if f["name"] not in cols:
                    failed.append(f"{where}: get_topic_meta() 列了 {t}.{f['name']}，get_topic_data() 里却没有")
            if m["fields"]:
                fname = m["fields"][0]["name"]
                got = p.get_series(f"{t}.{fname}", instance=inst)
                if got is not None and not isinstance(got, list):
                    if len(got) != len(cols[fname]):
                        failed.append(f"{where}: series({t}.{fname}, instance={inst}) 与 get_topic_data() 长度不一致")
    ok = not failed
    detail = f"{len(msgs) if isinstance(msgs, list) else 0} 个 topic 元信息"
    err = "\n".join(failed)
    log.print_check(step, TOTAL_STEPS, rule_name, ok, detail, err)
    results.append((rule_name, "ok" if ok else "fail"))

    # ── 3. armed_intervals 的形状 ────────────────────────────────────
    step += 1
    rule_name = f"[{path.name}] armed_intervals 形状（升序/不重叠/时长一致）"
    failed = []
    sem = p.builtin_variables()
    iv = sem["ARMED_INTERVALS"]
    if not isinstance(iv, list):
        failed.append(f"{where}: armed_intervals 应当是 list")
    else:
        last_end = None
        for i, seg in enumerate(iv):
            if not (isinstance(seg, (list, tuple)) and len(seg) == 2):
                failed.append(f"{where}: armed_intervals[{i}] 不是 (start, end)")
                continue
            s, e = seg
            if not isinstance(s, int):
                failed.append(f"{where}: armed_intervals[{i}].start 不是 int")
            if e is None:
                if i != len(iv) - 1:
                    failed.append(f"{where}: 只有最后一段可以是开口区间（end=None）")
            else:
                if not (e > s):
                    failed.append(f"{where}: armed_intervals[{i}] 的 end 不大于 start")
                if last_end is not None and not (s >= last_end):
                    failed.append(f"{where}: armed_intervals 不是升序/有重叠（第 {i} 段）")
                last_end = e
        if iv:
            ends = [e for _s, e in iv if e is not None]
            fallback = max(ends) if ends else iv[-1][0]
            total_dur = sum(((e if e is not None else fallback) - s) for s, e in iv)
            if abs(total_dur / 1e6 - sem["ARMED_S"]) >= 0.2:
                failed.append(f"{where}: armed_s={sem['ARMED_S']} 与 armed_intervals 加起来的秒数对不上")
        if sem["HAS_ARMED"] != bool(iv):
            failed.append(f"{where}: has_armed 与 armed_intervals 矛盾")
    ok = not failed
    detail = f"{len(iv) if isinstance(iv, list) else 0} 段区间，armed_s={sem.get('ARMED_S')}s"
    err = "\n".join(failed)
    log.print_check(step, TOTAL_STEPS, rule_name, ok, detail, err)
    results.append((rule_name, "ok" if ok else "fail"))

    # ── 4. get_report_facts() 与 builtin_variables() 不矛盾 ──────────
    step += 1
    rule_name = f"[{path.name}] get_report_facts 与 builtin_variables 不矛盾"
    failed = []
    facts = p.get_report_facts()
    if not (isinstance(facts, dict) and facts):
        failed.append(f"{where}: get_report_facts() 为空")
    else:
        if "vehicleType" in facts and facts["vehicleType"] != sem["VEHICLE"]:
            failed.append(
                f"{where}: get_report_facts().vehicleType 与 builtin_variables().vehicle 不一致"
                f"（{facts['vehicleType']!r} vs {sem['VEHICLE']!r}）"
            )
        if facts.get("armedDurationSec", sem["ARMED_S"]) != sem["ARMED_S"]:
            failed.append(f"{where}: get_report_facts().armedDurationSec 与 builtin_variables().armed_s 不一致")
        if "phases" in facts and not isinstance(facts["phases"], list):
            failed.append(f"{where}: get_report_facts().phases 应当是 list")
    ok = not failed
    detail = f"vehicle={sem.get('VEHICLE')}, armed_s={sem.get('ARMED_S')}s"
    err = "\n".join(failed)
    log.print_check(step, TOTAL_STEPS, rule_name, ok, detail, err)
    results.append((rule_name, "ok" if ok else "fail"))

    # ── 5. parser_version：非空字符串 ────────────────────────────────
    step += 1
    rule_name = f"[{path.name}] parser_version 非空字符串"
    failed = []
    pv = p.parser_version()
    if not (isinstance(pv, str) and pv.strip()):
        failed.append(f"{where}: parser_version() 应当给出非空字符串")
    ok = not failed
    detail = f"parser_version={pv!r}" if ok else f"实际返回 {pv!r}"
    err = "\n".join(failed)
    log.print_check(step, TOTAL_STEPS, rule_name, ok, detail, err)
    results.append((rule_name, "ok" if ok else "fail"))

    # ── 6. match_version：any / 边界 / 非法串 ────────────────────────
    step += 1
    rule_name = f"[{path.name}] match_version 契约（any/边界/非法串）"
    failed = []
    unknown_fw = sem["FW_MINOR"] is None
    if p.match_version("any") is not True:
        failed.append(f"{where}: match_version('any') 应当为真")
    if p.match_version("") is not True:
        failed.append(f"{where}: match_version('') 应当为真")
    if p.match_version("<0.0") is not unknown_fw:
        failed.append(
            f"{where}: match_version('<0.0') 期望 {unknown_fw}（版本{'未知→不排除' if unknown_fw else '已知→应当为假'}）"
        )
    if not unknown_fw and p.match_version(">=0.1,<99.0") is not True:
        failed.append(f"{where}: 区间约束判定不对")
    try:
        p.match_version(">=abc")
        failed.append(f"{where}: 非法约束串应当抛 ValueError（哪怕版本未知）")
    except ValueError:
        pass
    except Exception as exc:
        failed.append(f"{where}: 非法约束串抛了 {exc!r}，应当是 ValueError")
    ok = not failed
    detail = f"FW_MINOR={sem.get('FW_MINOR')}（{'未知' if unknown_fw else '已知'}）"
    err = "\n".join(failed)
    log.print_check(step, TOTAL_STEPS, rule_name, ok, detail, err)
    results.append((rule_name, "ok" if ok else "fail"))

    # ── 7. 可选能力：定义了就要能用 ──────────────────────────────────
    step += 1
    rule_name = f"[{path.name}] 可选能力（phases/dropouts/track）"
    failed = []
    skip_parts: list[str] = []
    if hasattr(p, "phases"):
        ph = p.get_flight_phases()
        if not isinstance(ph, list):
            failed.append(f"{where}: get_flight_phases() 应当返回 list")
        else:
            for seg in ph:
                if not ({"startSec", "endSec", "navState", "mode", "armed"} <= set(seg)):
                    failed.append(f"{where}: get_flight_phases() 的每段要有 startSec/endSec/navState/mode/armed")
                    break
    else:
        skip_parts.append("phases 未定义")

    if hasattr(p, "dropouts"):
        if not isinstance(p.get_logged_dropouts(), list):
            failed.append(f"{where}: get_logged_dropouts() 应当返回 list")
    else:
        skip_parts.append("dropouts 未定义")

    if hasattr(p, "get_flight_track"):
        tr = p.get_flight_track()
        if not (isinstance(tr, dict) and ("tracks" in tr or "error" in tr)):
            failed.append(f"{where}: get_flight_track() 要么给 tracks，要么给 error")
        else:
            for tk in tr.get("tracks") or []:
                if not ({"label", "t", "lat", "lon", "alt"} <= set(tk)):
                    failed.append(f"{where}: 每条轨道的键要有 label/t/lat/lon/alt（实际 {sorted(tk)}）")
                    break
                if not (len(tk["t"]) == len(tk["lat"]) == len(tk["lon"]) == len(tk["alt"])):
                    failed.append(f"{where}: 轨道的 t/lat/lon/alt 必须等长")
                    break
    else:
        skip_parts.append("track 未定义")

    ok = not failed
    detail = ", ".join(skip_parts) if skip_parts else "全部已定义"
    err = "\n".join(failed)
    log.print_check(step, TOTAL_STEPS, rule_name, ok, detail, err)
    results.append((rule_name, "ok" if ok else "fail"))

    # ── 8. report_materials 结构 ──────────────────────────────────────
    step += 1
    rule_name = f"[{path.name}] report_materials 结构"
    failed = []
    li = p.report_materials()
    if not isinstance(li, dict):
        failed.append(f"{where}: report_materials() 应当返回 dict")
    else:
        for key in ("sysInfo", "infoDict", "messages", "params", "phases"):
            if key not in li:
                failed.append(f"{where}: report_materials() 缺少 {key}")
    ok = not failed
    detail = "" if ok else f"实际键：{sorted(li.keys()) if isinstance(li, dict) else type(li).__name__}"
    err = "\n".join(failed)
    log.print_check(step, TOTAL_STEPS, rule_name, ok, detail, err)
    results.append((rule_name, "ok" if ok else "fail"))

    return results


def main(argv: list[str]) -> int:
    args = argv[1:]
    if not args or args[0] in ("-h", "--help"):
        log.info(__doc__)
        return 2
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)

    log.print_header("适配器契约测试（对每份日志跑同一套断言）", f"python {Path(__file__).name} <log.ulg> ...")

    all_results: list[tuple[str, str]] = []
    skipped: list[str] = []

    for name in args:
        path = Path(name)
        try:
            ns = runner.build_namespace(path)
        except Exception as exc:
            skipped.append(f"{path.name}: 打不开（{type(exc).__name__}: {exc}）")
            continue
        all_results.extend(check_provider(ns, path))

    return log.print_summary(all_results, skipped)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
