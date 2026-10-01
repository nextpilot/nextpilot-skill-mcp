# 术语表

仓库里的黑话，一个词一行。读完 quickstart 还会觉得别扭的词，多半在这。

按主题分四组；「细读」给的是讲机制的文档，不在本表展开。

## 产品与内容

| 术语          | 一句话                                                            | 细读                                                                         |
| ------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 报告          | 用户上传一份飞控日志后得到的中文分析结果，一条报告一条记录        | [`architecture/engine.md`](architecture/engine.md)                           |
| skill         | 一个可分享的分析技能包：提示词 + 参数说明，三文件结构             | [`quickstart/write-a-skill.md`](quickstart/write-a-skill.md)                 |
| MCP 条目      | 站点上收录的第三方 MCP 服务条目（名字、命令、传输方式）           | [`quickstart/write-an-mcp.md`](quickstart/write-an-mcp.md)                   |
| 平台 MCP 服务 | 本仓库自己跑的 MCP 服务（`server/nextpilot_mcp/`，9 个只读工具）  | [`architecture/mcp-server.md`](architecture/mcp-server.md)                   |
| 站点设置      | `/admin/settings` 后台能改的运行时配置，存 KV，不改代码不重新构建 | [`architecture/admin-site-settings.md`](architecture/admin-site-settings.md) |

## 引擎与知识库

| 术语     | 一句话                                                                              | 细读                                                        |
| -------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 知识引擎 | `knowledge/engine/` 下的 Python 包，浏览器（Pyodide）与本地工具共用同一份源码       | [`architecture/engine.md`](architecture/engine.md)          |
| 算子     | 引擎里最小的计算单元（取值、滤波、统计……91 个），写规则时的积木                     | [`architecture/engine.md`](architecture/engine.md)          |
| 规则     | 一条 YAML 检查经验：条件（算子组合）+ 结论（中文提示），PX4 26 条 / ArduPilot 16 条 | [`quickstart/write-a-rule.md`](quickstart/write-a-rule.md)  |
| 故障库   | `fault-kb.yaml`：故障根因、排查步骤、禁忌，按关键字检索                             | [`knowledge/`](knowledge/README.md)                         |
| 预设     | 绘图预设：一张图画哪些曲线、怎么分组，YAML 定义                                     | [`knowledge/px4/plot/`](../../knowledge/px4/plot/README.md) |
| provider | 格式适配层：把 PX4 ULog / ArduPilot BIN 翻译成统一的取数接口                        | [`architecture/provider.md`](architecture/provider.md)      |
| ULog     | PX4 的二进制日志格式（`.ulg`），端侧解析在浏览器完成                                | [`architecture/provider.md`](architecture/provider.md)      |
| 构建产物 | `build-knowledge.mjs` 把引擎源码与知识库拼成 `.generated.*`，构建期只搬运不执行     | [`architecture/engine.md`](architecture/engine.md)          |

## Web 与运行时

| 术语       | 一句话                                                                         | 细读                                                     |
| ---------- | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 双层运行时 | Web 应用同时跑在两处：Node SSR（页面）+ 边缘函数（`functions/`，轻逻辑与密钥） | [`architecture/web-app.md`](architecture/web-app.md)     |
| 边缘函数   | EdgeOne Pages Functions，放 `web/functions/`，密钥只允许在这里出现             | [`architecture/web-app.md`](architecture/web-app.md)     |
| KV         | `NEXTPILOT_KV` 绑定：站点设置、报告记录等持久化存储                            | [`operations/README.md`](operations/README.md)           |
| 端侧分析   | 日志解析与规则判定全在用户浏览器（Pyodide）完成，原始日志不出端、无上传接口    | [`architecture/web-app.md`](architecture/web-app.md)     |
| 热更新双段 | 本地 dev 同时起两个服务（SSR 与边缘函数），各自热更新，改一段只重启一段        | [`quickstart/run-locally.md`](quickstart/run-locally.md) |
| 真源       | 一份内容只放一处、别处只链接不复制（正文真源、环境变量真源、传输方式真源……）   | [`../README.md`](../README.md)                           |

## 质量与流程

| 术语     | 一句话                                                                       | 细读                                                       |
| -------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 检查     | `tools/ci/check_all.py` 的一个步骤，24 项，全部可单独开关                    | [`testing/check-catalog.md`](testing/check-catalog.md)     |
| 六阶段   | 检查挂载的六个时机：dev / commit / build / push / CI / deploy                | [`testing/checks-by-stage.md`](testing/checks-by-stage.md) |
| 分档     | 把 24 项检查分成三档（日常/推送/夜间），判据是「抓什么错、多久跑一次、挡谁」 | [`testing/README.md`](testing/README.md)                   |
| 守卫     | 防某类回归复发的专项测试（如打印守卫、引擎纯度守卫），失败了先看守卫名       | [`testing/guards.md`](testing/guards.md)                   |
| 变异测试 | 故意改坏代码（74 条变异）验证守卫真的能抓到，跑在 CI 的 `mutate.yml`         | [`testing/guards.md`](testing/guards.md)                   |
| 日志回归 | 用固定的基线日志（`.ulg`）喂引擎，输出与基线比对，防判定结果悄悄变了         | [`testing/log-regression.md`](testing/log-regression.md)   |
| 任务线   | quickstart 的四条上手路径：装环境 / 本地跑 / 写规则 / 写 skill 与 MCP        | [`quickstart/README.md`](quickstart/README.md)             |
| 决策记录 | `roadmap/decisions.md` 里的 D 编号条目：已拍板的事、理由、代价               | [`roadmap/decisions.md`](roadmap/decisions.md)             |
