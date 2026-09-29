r"""ArduPilot 那条链路的端到端冒烟：APM 规则真的进产物、真的在跑、真的读到参数。

## 为什么要有它

2026-09 之前 `knowledge/ardupilot/` 那批规则是"写了但没人跑"：构建脚本与 loader 都硬编码
`knowledge/px4/`，于是它们进不了产物；而"进不了产物"这件事没有任何信号，规则文件
看起来好好的、本地校验也是绿的，只是浏览器里永远不会执行。接线（按固件族扫描）修掉了
路径，但路径是最容易被人改回去的东西：任何一处重新写死 `px4`，这批规则就又变成装饰品，
而且照样没人报错。

这一道门就是那个信号。它用 `tools/dev/apm_make_sample.py` 的合成 .bin（仓库里还没有真实
APM 样本）把整条链路走一遍：认格式 → 取这一族的知识 → 读参数 → 跑规则 → 出结论。

参数那一半同样是"没人看着就会退化"的：`param()` 依赖 provider 把 PARM 挂进 `PARAMS`，
少一行 `dict(self._params)` 的表现是规则静默不发射（不是报错），与"这台飞机没开这项
检查"完全无法区分。所以这里断言的是"该报的报了"，而不是"引擎没崩"。

## 判据

1. 合成日志被认成 `ardupilot-bin`，且引擎装载的规则来自 APM 那一套（不是 PX4 的）
2. `param()` 读得到参数、读不到时按 `default` 兜底（不抛异常）
3. 参数类规则真的发射：ARMING_CHECK=0 / BATT_MONITOR=0 / FS_THR_ENABLE=0、
   以及"RNGFND1_TYPE>0 却没有测距仪消息"
4. 反例：GPS_TYPE>0 且日志里真有 GPS 消息 → 不许报（否则就是误报）
5. 报告头的 `platform` 问的是 provider，不是写死的 "PX4"

用法：python tools/engine/check_apm_e2e.py

退出码：任一检查失败则为 1。
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _logging import get_logger  # noqa: E402

log = get_logger()

ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "knowledge" / "engine"
sys.path.insert(0, str(ENGINE))
sys.path.insert(0, str(ROOT / "tools" / "dev"))

import loader  # noqa: E402
from apm_make_sample import build_sample_bytes  # noqa: E402

APM_LOG_TYPE = "ardupilot-bin"
# 夹具里故意设成 0（禁用）的参数 → 对应规则要发射
EXPECTED_FINDINGS = [
    ("apm-config-arming-check", "warning"),
    ("apm-config-batt-monitor", "info"),
    ("apm-config-fs-thr", "info"),
    ("apm-sensor-rangefinder", "warning"),
]
# 反例：GPS_TYPE=1 且日志里有 GPS 消息，报了就是误报
MUST_NOT_FIRE = "apm-sensor-gps"


def main() -> int:
    log.print_header("APM 链路端到端冒烟（check_apm_e2e）", f"python {Path(__file__).name}")

    total = 5
    results: list[tuple[str, str]] = []
    skipped: list[str] = []
    step = 0

    raw = build_sample_bytes()

    # ── Check 1: 认格式 + 取到这一族的知识 ──────────────────────────
    step += 1
    rule_name = "合成 .bin 认成 ArduPilot，且装载的是 APM 那一套规则"
    try:
        ns = loader.assemble(raw)
    except Exception as exc:  # noqa: BLE001
        log.print_check(step, total, rule_name, False, err=f"{type(exc).__name__}: {exc}")
        results.append((rule_name, "fail"))
        return log.print_summary(results, skipped)

    log_type = ns["provider"].log_type
    rules = ns["RULES"]
    # APM 规则的 id 一律带 apm- 前缀：靠这个判"装载的是哪一套"，比数条数稳
    apm_rules = [r for r in rules if str(r.get("id", "")).startswith("apm-")]
    ok = log_type == APM_LOG_TYPE and len(apm_rules) > 0 and len(apm_rules) == len(rules)
    detail = f"log_type={log_type}，装载 {len(rules)} 条规则（apm- 前缀 {len(apm_rules)} 条）"
    err = "" if ok else f"认错族或装错规则：log_type={log_type}，apm 规则 {len(apm_rules)}/{len(rules)}"
    log.print_check(step, total, rule_name, ok, detail, err)
    results.append((rule_name, "ok" if ok else "fail"))
    if not ok:
        return log.print_summary(results, skipped)

    # ── Check 2: _cfg() 取数与兜底 ─────────────────────────────────
    step += 1
    rule_name = "_cfg('NAME') 读得到参数，读不到按 default 兜底"
    env = ns["_rule_env"]()
    got_class, got_missing = None, "<未执行>"
    try:
        ns["_eval_compute"]('x = _cfg("FRAME_CLASS")', env)
        ns["_eval_compute"]('y = _cfg("NO_SUCH_PARAM", 0.0)', env)
        got_class, got_missing = env.get("x"), env.get("y")
    except Exception as exc:  # noqa: BLE001
        err = f"{type(exc).__name__}: {exc}"
        log.print_check(step, total, rule_name, False, err=err)
        results.append((rule_name, "fail"))
        return log.print_summary(results, skipped)

    ok = got_class is not None and got_missing == 0.0
    detail = f"_cfg('FRAME_CLASS')={got_class}，缺失兜底={got_missing}"
    err = "" if ok else "参数没读到，或兜底没生效（规则会静默不发射）"
    log.print_check(step, total, rule_name, ok, detail, err)
    results.append((rule_name, "ok" if ok else "fail"))
    if not ok:
        return log.print_summary(results, skipped)

    # ── Check 3: 参数类规则真的发射 ─────────────────────────────────
    step += 1
    rule_name = "参数类规则真的发射（4 条：三个禁用 + 配置但无数据）"
    report = loader.call(ns, "np_report()")
    fired = {f.get("ruleId") or f.get("id"): f for f in report.get("findings", [])}
    missing = [(rid, sev) for rid, sev in EXPECTED_FINDINGS if rid not in fired]
    wrong_sev = [
        (rid, sev, fired[rid].get("severity"))
        for rid, sev in EXPECTED_FINDINGS
        if rid in fired and fired[rid].get("severity") != sev
    ]
    ok = not missing and not wrong_sev
    detail = "\n".join(
        f"  · {rid} → {fired[rid].get('severity') if rid in fired else '未发射'}" for rid, _ in EXPECTED_FINDINGS
    )
    err = ""
    if missing:
        err = f"应发射却没发射：{[r for r, _ in missing]}"
    if wrong_sev:
        err += f"\n严重级不对：{wrong_sev}"
    log.print_check(step, total, rule_name, ok, detail, err.strip())
    results.append((rule_name, "ok" if ok else "fail"))
    if not ok:
        return log.print_summary(results, skipped)

    # ── Check 4: 反例（有配置也有数据 → 不许报）─────────────────────
    step += 1
    rule_name = "反例：GPS_TYPE>0 且日志里有 GPS 消息时不报"
    ok = MUST_NOT_FIRE not in fired
    detail = f"{MUST_NOT_FIRE} {'误报了' if not ok else '未发射（正确）'}；报告共 {len(fired)} 条 finding"
    err = "" if ok else f"{MUST_NOT_FIRE} 误报：配置与数据并不矛盾（有 GPS_TYPE 也有 GPS 消息）"
    log.print_check(step, total, rule_name, ok, detail, err)
    results.append((rule_name, "ok" if ok else "fail"))
    if not ok:
        return log.print_summary(results, skipped)

    # ── Check 5: 报告头的固件族来自 provider ────────────────────────
    step += 1
    rule_name = "报告头 platform / logType 来自 provider（不是写死的 PX4）"
    platform = report.get("platform")
    ok = platform == "ArduPilot" and report.get("logType") == APM_LOG_TYPE
    detail = f"platform={platform!r}，logType={report.get('logType')!r}，parserVersion={report.get('parserVersion')!r}"
    err = "" if ok else "报告头还在写死固件族——ArduPilot 日志会顶着别人的名义出报告"
    log.print_check(step, total, rule_name, ok, detail, err)
    results.append((rule_name, "ok" if ok else "fail"))

    return log.print_summary(results, skipped)


if __name__ == "__main__":
    raise SystemExit(main())
