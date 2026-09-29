"""日志适配器（provider）契约测试，对每一个 provider 跑同一套断言。

为什么需要它（构建期与运行期不是已经各查过一道了吗）：
  · 构建期只查"方法有没有定义、builtin_variables() 的键齐不齐"，看不进方法体
  · 运行期自检只查"名字取不舍得出、类型对不对"，看不了值
  这一道查的是语义：失败语义（取不到要返回 None 而不是抛）、get_topic_meta() 与 get_series()
  是否自洽、armed_intervals 的形状、get_report_facts() 与 builtin_variables() 是否互相矛盾……
  这三道合起来 = 契约可执行；加一种新格式（ArduPilot .bin）时，跑通这里就不用重读引擎。

用法：
  python tools/engine/guard_provider_contract.py <log.ulg> [more.ulg ...]
  python tools/engine/guard_provider_contract.py --list          # 列出已注册的格式
日志文件的格式由文件头判定（适配器自己探测），所以不用告诉它用哪个 provider。
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "knowledge" / "engine"))
import loader as runner  # noqa: E402

TOTAL_STEPS = 9


def check_provider(ns: dict, path: Path) -> list[tuple[str, str]]:
    p = ns["provider"]
    where = f"{getattr(p, 'log_type', '?')}  {path.name}"

    results: list[tuple[str, str]] = []
    step = 0

    # ── 1. 失败语义：取不到一律 None，不抛异常 ──────────────────────    step += 1
    rule_name = f"[{path.name}] 失败语义（取不到必返 None，不抛异常）"
    failed: list[str] = []
    for name, call in (
        ("series 不存在的 topic", lambda: p.get_series("no_such_topic.field")),
        ("series 不存在的字段", lambda: p.get_series("vehicle_status.no_such_field")),
        ("series 不存在的实例", lambda: p.get_series("vehicle_status.timestamp", instance=99)),
        ("dataset 不存在的 topic", lambda: p.get_dataset("no_such_topic", 0)),
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
            cols = p.get_dataset(t, inst)
            if cols is None:
                failed.append(f"{where}: dataset({t}, {inst}) 取不到")
                continue
            # timestamp 断言是带条件的：只有 FMT 声明了时间字段才要求改名后的 timestamp 列。
            # AP_Logger 的内部传输消息（FILE 等）没有 TimeUS 字段，PX4 时代"所有 topic
            # 都有 timestamp"的假设在跨格式下不成立（12 份真实 APM 日志踩过）。
            declared_ts = any(f["name"] in ("TimeUS", "timestamp") for f in m["fields"])
            if declared_ts and "timestamp" not in cols:
                failed.append(f"{where}: {t}#{inst} 声明了时间字段却没有 timestamp 列")
            for f in m["fields"]:
                if f["name"] not in cols:
                    failed.append(f"{where}: get_topic_meta() 列了 {t}.{f['name']}，get_dataset() 里却没有")
            if m["fields"]:
                fname = m["fields"][0]["name"]
                got = p.get_series(f"{t}.{fname}", instance=inst)
                if got is not None and not isinstance(got, list):
                    if len(got) != len(cols[fname]):
                        failed.append(f"{where}: series({t}.{fname}, instance={inst}) 与 get_dataset() 长度不一致")
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
    iv = p.armed_intervals
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
        if bool(iv) != (sem["ARMED_S"] > 0.0):
            failed.append(f"{where}: armed_intervals 与 armed_s 不一致")
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
    vi = p.get_version_info()
    unknown_fw = vi is None
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
    detail = f"version_info={vi}（{'未知' if unknown_fw else '已知'}）"
    err = "\n".join(failed)
    log.print_check(step, TOTAL_STEPS, rule_name, ok, detail, err)
    results.append((rule_name, "ok" if ok else "fail"))

    # ── 7. 模式区间 + 可选能力：定义了就要能用 ────────────────────────
    # 2026-09-24 修复一处恒绿：原先写的是 hasattr(p, "phases") / "dropouts"，
    # 那两个属性名根本不存在（方法是 get_flight_phases / get_logged_dropouts），
    # 于是可选能力检查从来只走"跳过"分支，什么都没检过。
    step += 1
    rule_name = f"[{path.name}] get_mode_changed 形状 + 可选能力（dropouts/track）"
    failed = []
    skip_parts: list[str] = []
    # get_mode_changed 是 REQUIRED（原 get_flight_phases 迁移、µs 形态）：区间升序、不倒挂
    mc = p.get_mode_changed()
    if not isinstance(mc, list):
        failed.append(f"{where}: get_mode_changed() 应当返回 list")
    else:
        mc_last_end = None
        for seg in mc:
            if not ({"t_start_us", "t_end_us"} <= set(seg)):
                failed.append(f"{where}: get_mode_changed() 每段要有 t_start_us/t_end_us（实际 {sorted(seg)}）")
                break
            if seg["t_end_us"] < seg["t_start_us"]:
                failed.append(f"{where}: get_mode_changed() 有段 end < start")
                break
            if mc_last_end is not None and seg["t_start_us"] < mc_last_end:
                failed.append(f"{where}: get_mode_changed() 区间不升序")
                break
            mc_last_end = seg["t_end_us"]

    if hasattr(p, "get_logged_dropouts"):
        if not isinstance(p.get_logged_dropouts(), list):
            failed.append(f"{where}: get_logged_dropouts() 应当返回 list")
    else:
        skip_parts.append("dropouts 未实现")

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
    if hasattr(p, "report_materials"):
        li = p.report_materials()
        if not isinstance(li, dict):
            failed.append(f"{where}: report_materials() 应当返回 dict")
        else:
            for key in ("sysInfo", "infoDict", "messages", "params", "phases"):
                if key not in li:
                    failed.append(f"{where}: report_materials() 缺少 {key}")
    else:
        li = None
    ok = not failed
    detail = "" if ok else f"实际键：{sorted(li.keys()) if isinstance(li, dict) else type(li).__name__}"
    err = "\n".join(failed)
    log.print_check(step, TOTAL_STEPS, rule_name, ok, detail, err)
    results.append((rule_name, "ok" if ok else "fail"))

    # ── 9. 知识引擎查询 API：新方法互相之间不许矛盾 ──────────────────
    # 单看每个方法"能给东西"不够，它们是同一份日志的同一批事实的不同入口，
    # 互相之间得对得上（对不上 = 其中一条路在编数）。
    step += 1
    rule_name = f"[{path.name}] 查询 API 语义自洽（时间/完整性/armed/版本/身份/事件）"
    failed = []
    tb = p.get_time_bounds()
    if not (isinstance(tb.get("start_us"), int) and isinstance(tb.get("end_us"), int)):
        failed.append(f"{where}: get_time_bounds 的 start_us/end_us 必须是 int")
    elif tb["end_us"] < tb["start_us"]:
        failed.append(f"{where}: get_time_bounds 的 end < start")
    elif tb.get("duration_s") is not None and abs((tb["end_us"] - tb["start_us"]) / 1e6 - tb["duration_s"]) > 0.3:
        failed.append(f"{where}: get_time_bounds 的 duration_s 与 (end-start)/1e6 对不上")
    if tb.get("has_wraparound") not in (True, False, None):
        failed.append(f"{where}: has_wraparound 应当返回 True / False / None（未知）")
    if p.get_start_timestamp() != sem["T0_US"]:
        failed.append(f"{where}: get_start_timestamp() 与 T0_US 矛盾")
    if p.get_last_timestamp() != tb.get("end_us"):
        failed.append(f"{where}: get_last_timestamp() 与 get_time_bounds().end_us 矛盾")

    msgs = p.get_topic_meta()
    if msgs:
        m0 = msgs[0]
        ds = p.get_dataset(m0["topic"], m0["instance"])
        if ds is None:
            failed.append(f"{where}: get_dataset({m0['topic']}) 取不到，但 get_topic_meta() 里有它")
        else:
            for f in m0["fields"]:
                if f["name"] not in ds:
                    failed.append(f"{where}: get_dataset({m0['topic']}) 缺 meta 声明的列 {f['name']}")
                    break
        dd = p.get_dataset_description(m0["topic"])
        if not (isinstance(dd, dict) and dd.get("fields")):
            failed.append(f"{where}: get_dataset_description(topic) 要给出 fields")
        if m0["fields"]:
            f0 = m0["fields"][0]["name"]
            dt = p.get_field_dtype(m0["topic"], f0)
            sz = p.get_field_sizeof(m0["topic"], f0)
            if dt is not None and dt != "str" and sz not in (1, 2, 4, 8):
                failed.append(f"{where}: get_field_sizeof({f0}) = {sz} 不是合法字节数（dtype={dt}）")

    li = p.get_log_integrity()
    if li.get("total_dropout_ms") != sem["DROPOUT_MS"]:
        failed.append(f"{where}: get_log_integrity().total_dropout_ms 与 DROPOUT_MS 矛盾")
    if li.get("n_gaps") != len(li.get("gaps") or []):
        failed.append(f"{where}: get_log_integrity 的 n_gaps 与 gaps 条数对不上")
    if bool(p.has_file_corruption()) != bool(li.get("has_file_corruption")):
        failed.append(f"{where}: has_file_corruption() 与 get_log_integrity 矛盾")

    ac = p.get_armed_changed()
    iv = p.armed_intervals
    if len(ac) != len(iv):
        failed.append(f"{where}: get_armed_changed 段数({len(ac)}) 与 ARMED_INTERVALS({len(iv)}) 不一致")
    else:
        for a_seg, i_seg in zip(ac, iv):
            if a_seg["t_start_us"] != i_seg[0]:
                failed.append(f"{where}: get_armed_changed 起点 {a_seg['t_start_us']} 与 ARMED_INTERVALS {i_seg[0]} 不一致")
                break

    if facts.get("firmware") is not None and p.get_firmware_version() != facts["firmware"]:
        failed.append(f"{where}: get_firmware_version() 与 get_report_facts().firmware 不一致")
    if p.get_vehicle_identity().get("vehicle_type") != sem["VEHICLE"]:
        failed.append(f"{where}: get_vehicle_identity().vehicle_type 与 VEHICLE 不一致")

    if not isinstance(p.get_logged_events(), list):
        failed.append(f"{where}: get_logged_events() 应当返回 list")
    if len(p.get_logged_events(pattern="\x00")) > 0:
        failed.append(f"{where}: get_logged_events(pattern=...) 没有起过滤作用")
    ok = not failed
    detail = f"时间 {tb.get('start_us')}~{tb.get('end_us')}，armed {len(ac)} 段"
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

    # --apm：合成一份最小 .bin 夹具一起测（仓库里还没有真实 ArduPilot 样本；
    # 合成样本自证"解析器与契约自洽"，对真实日志的正确性仍待样本，见适配器文件头的待验证清单）
    apm_only = "--apm" in args
    if apm_only:
        args = [a for a in args if a != "--apm"]
        import tempfile

        # 夹具生成器在 tools/dev/（合成样本是给人用的开发工具，不是门禁的一部分）；
        # 本文件在 tools/engine/，sys.path 不覆盖那里，这里显式补上；同目录也查，
        # 将来夹具搬来同住也能找到
        for _p in (Path(__file__).resolve().parent, Path(__file__).resolve().parents[1] / "dev"):
            if _p.is_dir() and str(_p) not in sys.path:
                sys.path.insert(0, str(_p))
        from apm_make_sample import build_sample_bytes

        tmp_dir = Path(tempfile.mkdtemp(prefix="apm-sample-"))
        sample = tmp_dir / "synthetic.bin"
        sample.write_bytes(build_sample_bytes())
        args.append(str(sample))
    if not args:
        log.error("没有给出任何日志文件（--apm 之外至少要给一份 .ulg）")
        return 2

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
