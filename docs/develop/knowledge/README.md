# knowledge/ —— 上游与知识库资料

所有跟知识库/上游相关的资料集中在这里，便于查找。

> 真知源在仓库根的 [`knowledge/`](../../../knowledge/README.md)（规则 YAML、算子、provider）。
> 本目录是关于知识库的文档：上游有什么、我们有什么、差在哪、怎么补。

## 四问四文档

本目录按四个问题组织，一个问题只有一份文档，不重复：

| #   | 你想知道                                | 看这份                         |
| --- | --------------------------------------- | ------------------------------ |
| 1   | 有哪些上游（一个 plot、一条 rule 逐条） | [`upstream.md`](upstream.md)   |
| 2   | 我们差在哪 / 哪些不补 / 该抄什么        | [`gap.md`](gap.md)             |
| 3   | 我们现在的覆盖情况（规则 vs topic）     | [`coverage.md`](coverage.md)   |
| 4   | 基线日志怎么入库、CI 怎么用             | [`baselines.md`](baselines.md) |

## 上游十个源

| #   | 上游               | 仓                                 | 覆盖什么                       |
| --- | ------------------ | ---------------------------------- | ------------------------------ |
| U1  | Flight Review      | `PX4/flight_review`                | 图表 / PID / 3D（45 图）       |
| U2  | robotto toolkit    | `robotto-drone-core`               | PX4 规则（8 项），本仓前身     |
| U3  | ecl_ekf_analysis   | `Auterion/ecl_ekf_analysis`        | EKF 阈值权威 + golden log 回归 |
| U4  | px4_log_analyzer   | `riccardodamiani/px4_log_analyzer` | 声明式事件 + 时间窗去抖        |
| U5  | ardupilot-mcp      | `furkanisikay/ardupilot-mcp`       | APM 规则（16 项）              |
| U6  | ArduPilot WebTools | `ArduPilot/WebTools`               | 纯浏览器 FFT / PIDReview       |
| U7  | FlightMD           | `Praddyx15/FlightMD`               | health score + 回归集          |
| U8  | smarttune-cli      | `raylanlin/smarttune-cli`          | 参数存在性校验门禁             |
| U9  | 桌面工具（备查）   | PlotJuggler / Foxglove …           | 不学，形态参考                 |
| U10 | ML 分类器          | `BeastAyyG/*` 等                   | 不学，权重不可审计             |

其中 U1（图表 + PID + 3D）、U2（PX4 规则）、U5（APM 规则）三份要逐条对表，
逐条清单见 [`upstream.md`](upstream.md)。

## 口径

- 差异要逐条列，不用「超集」这类概括。一条上游检查，要能回答三件事：
  原来怎么写的、我们怎么写的、差在哪。
- 状态统一用五个词：`已有` / `部分` / `占位` / `没有` / `不做`（标「不做」的要写清理由）。
- 与本目录相关的实施计划在 [`../roadmap/upstream-alignment-plan.md`](../roadmap/upstream-alignment-plan.md)；
  一旦实施完成，结论按 [`../roadmap/decisions.md`](../roadmap/decisions.md) D4 抽进正式文档。
