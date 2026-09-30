# knowledge/ —— 上游与知识库资料

**所有跟知识库/上游相关的资料集中在这里，便于查找。**

> 真知源在仓库根的 [`knowledge/`](../../../knowledge/README.md)（规则 YAML、算子、provider）。
> 本目录是**关于知识库的文档**：上游有什么、我们有什么、差在哪、怎么补。

## 怎么读

| 你想知道                                         | 看这份                                                   |
| ------------------------------------------------ | -------------------------------------------------------- |
| **上游有哪些、我们有哪些**（一条一条）           | [`upstream-inventory.md`](upstream-inventory.md)         |
| **每一项上游检查原来怎么写的、我们现在怎么写的** | [`upstream-itemized.md`](upstream-itemized.md)           |
| 本仓与上游的能力差、取舍、可借鉴项               | [`upstream-gap.md`](upstream-gap.md)                     |
| 上游原始资料清点（robotto 清单、图表、PID、EKF） | [`upstream-kb-collection.md`](upstream-kb-collection.md) |
| 该检查什么、现在检查了什么（零覆盖清单）         | [`coverage-plan.md`](coverage-plan.md)                   |
| 基线日志为什么入库、放哪、CI 怎么用              | [`baselines.md`](baselines.md)                           |

## 口径

- **差异要逐条列，不许用"超集"这类概括** —— 这是本目录的硬要求。
  一条上游检查，必须能回答：「原来怎么写的 / 我们怎么写的 / 差在哪」。
- 状态口径：**✅ 已有** / **🟡 部分** / **🔵 占位** / **❌ 没有** / **🚫 明确不做**（并写清为什么）。
- 与本目录相关的实施计划在 [`../plans/upstream-alignment-plan.md`](../plans/upstream-alignment-plan.md)；
  一旦实施完成，结论按 [`../decisions.md`](../decisions.md) D4 抽进正式文档。

## 上游三个主源

| 源              | 仓                           | 覆盖什么          |
| --------------- | ---------------------------- | ----------------- |
| Flight Review   | `PX4/flight_review`          | 图表 / PID / 3D   |
| robotto toolkit | `robotto` monorepo           | PX4 规则（8 项）  |
| ardupilot-mcp   | `furkanisikay/ardupilot-mcp` | APM 规则（16 项） |
