# 架构文档

记录前端、端侧日志分析、LLM 解释层和后续服务端组件之间的边界。

**这里放"已落地的机制"**——系统边界、契约、schema。
**不要放**：计划、评估报告、重构过程（那些进 `../plans/`，完成即删）。

| 文档                     | 讲什么                                                                        |
| ------------------------ | ----------------------------------------------------------------------------- |
| `plot-schema.md`         | 绘图预设 schema：`container`（`axes`/`map`）是**扩展点不是枚举**              |
| `engine-api.md`          | 知识引擎查询 API —— provider 契约，`Px4Provider` / `ArduPilotProvider` 双实现 |
| `error-reporting.md`     | 错误上报链路：脱敏、限流、→ issue                                             |
| `admin-site-settings.md` | 后台站点设置系统 `/admin/settings`：能改什么、怎么生效、怎么倒查              |

> 上游与知识库资料在 [`../knowledge/`](../knowledge/README.md)；
> 决策记录与未闭合待办在 [`../decisions.md`](../decisions.md)。
