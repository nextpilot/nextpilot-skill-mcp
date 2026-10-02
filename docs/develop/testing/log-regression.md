# 日志回归：日志按白名单入库

日志回归 4 项依赖 `tools/testdata/logs/` 下的真实日志。**入库策略见
[`../knowledge/baselines.md`](../knowledge/baselines.md)**：默认 `*.ulg` 不入库
（含 GPS 轨迹与作业信息的日志是产品隐私承诺），但挑过、在 `index.jsonl` 登记过来源的
小样本按 `.gitignore` 白名单例外入库——CI 与新克隆环境直接能跑，不再 SKIP。

2026-10 现状：`sample_log_small.ulg`（921KB，v1.11.2，公开日志）已入库，
`check_all.py` 在 CI 跑到 28 项（`has_logs=True`）；其余 8 份基线的日志不在库，
`compare_baseline.py` 对它们逐份 SKIP（基线在、日志不在是白名单分批入库的常态，
不是故障）。继续补日志时按 baselines.md 的挑法与登记流程走。

这 4 项在本地与 CI 行为一致；没有日志时 `--skip-logs` 跳过而不是报错。

## 连带影响（不改就会坏的四处）

1. `--skip-logs` 必须留着：换机器/CI 里没有日志时靠它跳过，而不是让 4 项报错。
2. `ci.yml` 里这 4 项是 SKIP 而非删除：删掉就看不出"本地该跑"这件事。
3. 冻结基线的判据不能依赖日志文件路径存在：路径不存在时是 SKIP，不是 FAIL。
4. 文档里所有"跑一遍全量"的说法都要带前提：本机有日志时才是全量。

## 冻结基线的硬约束

基线是「同输入 → 同结论」的回归锚点，因此引擎结论变化必须是显式动作（打新基线），不能因为
重构而漂移。基线文件入库而日志不入库，两者的生命周期不同，别混在一起删。

> 日志集怎么建、放哪、白名单怎么写，见 [`../knowledge/baselines.md`](../knowledge/baselines.md)。

## 两个同名但不同的 `sample.ulg`

`web/e2e/fixtures/sample.ulg`（已入库，921KB，真实日志，`e2e.yml` 用）与
`tools/testdata/logs/sample.ulg`（4.0MB，`baseline/sample.json` 对应）是两个不同的文件，
改任一个前先确认自己在改哪个。

2026-10-02 更新：4.0MB 那份的本地副本已丢、来源 uuid 无记录（logs.px4.io 上同 uuid
文件返回 403），**不可复原**——`sample.json` 基线按 SKIP 语义保留，日志回归实际
覆盖见 baselines.md §一 的 9 份表。也因此「原始日志不入库」这条纪律对
`tools/testdata/logs/` 整体不再成立：9 份基线日志已按白名单全量入库，其余下载缓存
（`.cache/`）仍不入库。
