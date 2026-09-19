"""日志适配器（provider）契约测试 —— 对**每一个** provider 跑同一套断言。

为什么需要它（构建期与运行期不是已经各查过一道了吗）：
  · 构建期只查"方法有没有定义、builtin_variables() 的键齐不齐"——看不进方法体
  · 运行期自检只查"名字取不舍得出、类型对不对"——看不了值
  这一道查的是**语义**：失败语义（取不到必须返回 None 而不是抛）、get_topic_meta() 与 get_series()
  是否自洽、armed_intervals 的形状、get_report_facts() 与 builtin_variables() 是否互相矛盾……
  这三道合起来 = 契约可执行；加一种新格式（ArduPilot .bin）时，跑通这里就不用重读引擎。

用法：
  python tools/calibrate/check_provider.py <log.ulg> [more.ulg ...]
  python tools/calibrate/check_provider.py --list          # 列出已注册的格式
日志文件的格式由**文件头**判定（适配器自己探测），所以不用告诉它用哪个 provider。
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_checks_locally as runner  # noqa: E402

FAILED: list[str] = []


def check(cond, msg):
    if not cond:
        FAILED.append(msg)
    return cond


def check_provider(ns: dict, path: Path) -> None:
    p = ns["provider"]
    where = "%s（%s）" % (getattr(p, "log_type", "?"), path.name)

    # ---- 1. 失败语义：取不到一律 None，不抛异常（契约里最要紧的一条）----
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
            check(call() is None, "%s: %s 应当返回 None" % (where, name))
        except Exception as exc:
            check(False, "%s: %s 抛了异常（契约要求返回 None）：%r" % (where, name, exc))

    # ---- 2. get_topic_meta() 与 get_series() 自洽：清单里列的东西一定取得到 ----
    msgs = p.get_topic_meta()
    check(isinstance(msgs, list) and msgs, "%s: get_topic_meta() 为空" % where)
    for m in msgs:
        t, inst = m["topic"], m["instance"]
        check(p.has_topic(t), "%s: get_topic_meta() 里有 %s，但 has_topic() 说没有" % (where, t))
        cols = p.get_topic_data(t, inst)
        if not check(cols is not None, "%s: columns(%s, %s) 取不到" % (where, t, inst)):
            continue
        check("timestamp" in cols, "%s: %s#%s 没有 timestamp 列" % (where, t, inst))
        for f in m["fields"]:
            check(
                f["name"] in cols,
                "%s: get_topic_meta() 列了 %s.%s，get_topic_data() 里却没有" % (where, t, f["name"]),
            )
        # 抽第一个字段验 get_series() 与 get_topic_data() 同源（同一个实例上）
        if m["fields"]:
            fname = m["fields"][0]["name"]
            got = p.get_series("%s.%s" % (t, fname), instance=inst)
            if got is not None and not isinstance(got, list):
                check(
                    len(got) == len(cols[fname]),
                    "%s: series(%s.%s, instance=%d) 与 get_topic_data() 长度不一致" % (where, t, fname, inst),
                )

    # ---- 3. armed_intervals 的形状：升序、不重叠、只有最后一段可以开口 ----
    sem = p.builtin_variables()
    iv = sem["ARMED_INTERVALS"]
    check(isinstance(iv, list), "%s: armed_intervals 应当是 list" % where)
    last_end = None
    for i, seg in enumerate(iv):
        if not check(
            isinstance(seg, (list, tuple)) and len(seg) == 2,
            "%s: armed_intervals[%d] 不是 (start, end)" % (where, i),
        ):
            continue
        s, e = seg
        check(isinstance(s, int), "%s: armed_intervals[%d].start 不是 int" % (where, i))
        if e is None:
            check(i == len(iv) - 1, "%s: 只有最后一段可以是开口区间（end=None）" % where)
        else:
            check(e > s, "%s: armed_intervals[%d] 的 end 不大于 start" % (where, i))
            check(
                last_end is None or s >= last_end,
                "%s: armed_intervals 不是升序/有重叠（第 %d 段）" % (where, i),
            )
            last_end = e
    # 各段时长加起来应当等于 armed_s（开口段按最后一段的起点兜底，只求量级对得上）
    if iv:
        ends = [e for _s, e in iv if e is not None]
        fallback = max(ends) if ends else iv[-1][0]
        total = sum(((e if e is not None else fallback) - s) for s, e in iv)
        check(
            abs(total / 1e6 - sem["ARMED_S"]) < 0.2,
            "%s: armed_s=%s 与 armed_intervals 加起来的秒数对不上" % (where, sem["ARMED_S"]),
        )
    check(sem["HAS_ARMED"] == bool(iv), "%s: has_armed 与 armed_intervals 矛盾" % where)

    # ---- 4. get_report_facts() 与 builtin_variables() 不矛盾 ----
    facts = p.get_report_facts()
    check(isinstance(facts, dict) and facts, "%s: get_report_facts() 为空" % where)
    if "vehicleType" in facts:
        check(
            facts["vehicleType"] == sem["AIRFRAME"],
            "%s: get_report_facts().vehicleType 与 builtin_variables().airframe 不一致（%r vs %r）"
            % (where, facts["vehicleType"], sem["AIRFRAME"]),
        )
    check(
        facts.get("armedDurationSec", sem["ARMED_S"]) == sem["ARMED_S"],
        "%s: get_report_facts().armedDurationSec 与 builtin_variables().armed_s 不一致" % where,
    )
    if "phases" in facts:
        check(isinstance(facts["phases"], list), "%s: get_report_facts().phases 应当是 list" % where)

    # ---- 5. parser_version：进报告头的解析器版本，必须是非空字符串 ----
    # 之所以要测：它在浏览器里取的是 Pyodide 当时装的解析器版本，取不到时会退化成
    # 一个看着像版本号的占位串——报告里记了个假版本，比记 "unknown" 更坏。
    pv = p.parser_version()
    check(isinstance(pv, str) and pv.strip(), "%s: parser_version() 应当给出非空字符串" % where)

    # ---- 6. match_version：any / 边界 / 非法串 ----
    # 版本未知（老日志没写版本号）时约定"不因版本排除任何东西"，所以下面两条的期望值
    # 随 fw_minor 是否为 None 而不同——这正是契约要写清楚的地方。
    unknown_fw = sem["FW_MINOR"] is None
    check(p.match_version("any") is True, "%s: match_version('any') 应当为真" % where)
    check(p.match_version("") is True, "%s: match_version('') 应当为真" % where)
    check(
        p.match_version("<0.0") is unknown_fw,
        "%s: match_version('<0.0') 期望 %s（版本%s）" % (where, unknown_fw, "未知→不排除" if unknown_fw else "已知→应当为假"),
    )
    if not unknown_fw:
        check(p.match_version(">=0.1,<99.0") is True, "%s: 区间约束判定不对" % where)
    try:
        p.match_version(">=abc")
        check(False, "%s: 非法约束串应当抛 ValueError（哪怕版本未知）" % where)
    except ValueError:
        pass
    except Exception as exc:
        check(False, "%s: 非法约束串抛了 %r，应当是 ValueError" % (where, exc))

    # ---- 7. 可选能力：定义了就要能用（缺席合法，所以先问有没有）----
    if hasattr(p, "phases"):
        ph = p.get_flight_phases()
        check(isinstance(ph, list), "%s: get_flight_phases() 应当返回 list" % where)
        for seg in ph:
            check(
                {"startSec", "endSec", "navState", "mode", "armed"} <= set(seg),
                "%s: get_flight_phases() 的每段要有 startSec/endSec/navState/mode/armed" % where,
            )
    if hasattr(p, "dropouts"):
        check(
            isinstance(p.get_logged_dropouts(), list),
            "%s: get_logged_dropouts() 应当返回 list" % where,
        )
    # 轨迹：能力名是 get_flight_track（曾经这里写的是 `hasattr(p, "track")`——provider 上
    # 没有 track 这个名字，于是这段检查**从来没跑过**。契约没被守住的坑就是这么来的。）
    if hasattr(p, "get_flight_track"):
        tr = p.get_flight_track()
        check(
            isinstance(tr, dict) and ("tracks" in tr or "error" in tr),
            "%s: get_flight_track() 要么给 tracks（每条 {label,t,lat,lon,alt}），要么给 error" % where,
        )
        for tk in tr.get("tracks") or []:
            check(
                {"label", "t", "lat", "lon", "alt"} <= set(tk),
                "%s: 每条轨道的键要有 label/t/lat/lon/alt（实际 %s）" % (where, sorted(tk)),
            )
            check(
                len(tk["t"]) == len(tk["lat"]) == len(tk["lon"]) == len(tk["alt"]),
                "%s: 轨道的 t/lat/lon/alt 必须等长" % where,
            )

    # ---- 8. 报告页的两块整体数据能取到且是 dict ----
    li = p.report_materials()
    check(isinstance(li, dict), "%s: report_materials() 应当返回 dict" % where)
    for key in ("sysInfo", "infoDict", "messages", "params", "phases"):
        check(key in li, "%s: report_materials() 缺少 %s" % (where, key))


def main(argv: list[str]) -> int:
    args = argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return 2
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)

    print("=== 适配器契约测试（对每份日志跑同一套断言） ===")
    total = 0
    for name in args:
        path = Path(name)
        print(f"\n· {path.name}")
        try:
            ns = runner.build_namespace(path)
        except Exception as exc:
            FAILED.append(f"{path.name}: 打不开（{type(exc).__name__}: {exc}）")
            continue
        check_provider(ns, path)
        total += 1
    if FAILED:
        print(f"\n=== 汇总：{len(FAILED)} 条失败 ===")
        for m in FAILED:
            print(f"  FAIL {m}")
        return 1
    ok_count = total * 8  - len([f for f in FAILED if "打不开" not in f])
    lines = [f"{total} 份日志全部通过" if not FAILED else f"{len(FAILED)} 条失败 / {total} 份日志跑完"]
    print(f"\n=== 契约测试{'通过' if not FAILED else '失败'}：{'；'.join(lines)} ===")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))