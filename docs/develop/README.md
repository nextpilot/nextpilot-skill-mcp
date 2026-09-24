# docs/dev/ —— 开发者与运维文档

**这里是"怎么跑起来、怎么部署、出问题怎么查"的地方**——不是知识库，也不是设计文档。
面向**用户**的文档在 [`../guide/`](../guide/README.md)（会发布到站内 `/guide`），本目录不发布。
三类内容各有归属，别往这里放：

| 想找什么                                                  | 在哪                                                                                                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 架构速览、环境变量、GitHub OAuth、KV 绑定、部署与故障排查 | [operations/](operations/README.md)（**当前唯一有真实内容的目录**）                                                                          |
| 引擎实现（算子注册表 / 规则框架 / 报告数据层）            | [`knowledge/engine/`](../../knowledge/engine/README.md)（浏览器与本地工具共用同一份源码）                                                    |
| 日志分析的检查经验（阈值 / 判定条件 / 算子）              | [`knowledge/px4/rules/*.yaml`](../../knowledge/px4/rules) → 网站 [`/guide/rule-catalogue`](https://skill.nextpilot.org/guide/rule-catalogue) |
| 怎么**写**一条检查经验                                    | 网站 `/guide/rule-schema`（由 `web/scripts/build-knowledge.mjs` 从 `knowledge/engine/` 源码生成 `web/.generated/guide/rule-schema.mdx`）     |
| 规则体系的设计动机、实施状态与已知缺口                    | [`knowledge/px4/CLAUDE.md`](../../knowledge/px4/CLAUDE.md)（给 AI 与维护者，不发布到网站）                                                   |
| 故障根因 / 排查步骤 / 禁忌                                | [`knowledge/px4/fault-kb.yaml`](../../knowledge/px4/fault-kb.yaml)                                                                           |
| 平台定位、商业模式、路线图                                | 仓库根 [`CLAUDE.md`](../../CLAUDE.md)                                                                                                        |
| 各阶段该跑哪些检查、各自耗时与分档依据                    | [`checks-by-stage.md`](checks-by-stage.md)                                                                                                   |
| **只想快速知道"改完该跑什么、要等多久、红了看哪"**        | [`testing-at-a-glance.md`](testing-at-a-glance.md)（三分钟速查）                                                                             |

## 目录

- `checks-by-stage.md` —— 检查的分类、分阶段安排与实测耗时（**已成文**）
- `testing-at-a-glance.md` —— 测试流程速查：什么时候自动跑什么、耗时、红了怎么办（**已成文**；要论证看 `checks-by-stage.md`）
- `architecture/` —— 系统边界与数据流（待写；现状速览暂在 `operations/README.md` 第 1 节）
- `operations/` —— 本地开发、EdgeOne 部署、环境变量与故障排查（**已成文**）
- `rules/` —— 规则文档（待写；规则清单已由网站 `/guide/rule-catalogue` 自动生成，此处只放不适合进网站的说明）
