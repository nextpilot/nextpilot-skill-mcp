# docs/develop/ —— 开发者文档

**给开发者看：这个仓库怎么实现、怎么跑、怎么改。**

> 面向**用户**的文档见 [`../guide/`](../guide/README.md)；用户能读到的完整指南
> 真源在 [`web/content/guide/`](../../web/content/guide)（发布到站内 `/guide`），本目录不发布。
> **判断标准**：这段话用户会不会在 `/guide` 上看到？会 → `web/content/guide/`；不会 → 本目录。

---

## 一、先看这里

| 你的处境                           | 去哪                                      |
| ---------------------------------- | ----------------------------------------- |
| **第一天进来，想跑起来**           | [`quickstart/`](quickstart/README.md)     |
| **要改代码，想懂系统怎么分层**     | [`architecture/`](architecture/README.md) |
| **改完了，想知道检查怎么跑**       | [`testing/`](testing/README.md)           |
| **遇到问题想求助 / 想贡献代码**    | [`contribute/`](contribute/README.md)     |
| **要加规则 / 改图 / 动知识库**     | [`knowledge/`](knowledge/README.md)       |
| **要部署、线上出问题**             | [`operations/`](operations/README.md)     |
| **想知道接下来做什么、已定了什么** | [`roadmap/`](roadmap/decisions.md)        |
| **读文档遇到生词**                 | [`glossary.md`](glossary.md)              |

---

## 二、按角色读：四条路线

按处境查表解决单个问题；想**系统读一遍**的，按角色走：

**① 新贡献者（要改代码）**

```text
quickstart/setup.md → quickstart/run-locally.md → architecture/README.md
→ contribute/code-style.md → testing/README.md（改完知道跑什么）
```

**② 只加检查经验（不碰应用代码）**

```text
quickstart/write-a-rule.md → knowledge/coverage.md → testing/pitfalls.md（两个坑必看）
```

**③ 写 skill / 接 MCP**

```text
quickstart/write-a-skill.md 或 write-an-mcp.md → architecture/mcp-server.md（想懂平台侧就加）
```

**④ 接手运维**

```text
operations/README.md → operations/deploy.md → testing/checks-by-stage.md §五（CI）
```

---

## 三、八个位置，各有归属

```text
docs/develop/
├── README.md                  # 本文（导航 + 角色阅读路线）
├── glossary.md                # 术语表：仓库黑话一个词一行
├── quickstart/                # 上手：四条任务线，一条线一篇
│   ├── README.md              #   从哪条线开始 + 最短路径
│   ├── setup.md               #   ① 装开发环境：工具清单、依赖坑、自检
│   ├── run-locally.md         #   ② 本地跑起来：dev 双段、E2E、MCP 本地、联调
│   ├── write-a-rule.md        #   ③ 写一条检查经验：YAML 骨架、验证闭环
│   ├── write-a-skill.md       #   ④a 写一个 skill：三文件结构、收录流程
│   └── write-an-mcp.md        #   ④b 接一个 MCP 条目：命名、校验、传输
├── architecture/              # 怎么实现的
│   ├── README.md              #   索引 + 四层总览
│   ├── engine.md              #   知识引擎：算子、规则框架、报告数据层
│   ├── provider.md            #   格式适配层：provider 契约
│   ├── web-app.md             #   Web 应用：双层运行时、端侧分析、内容管线
│   ├── mcp-server.md          #   MCP 服务：工具集与装配
│   ├── error-reporting.md     #   错误上报
│   └── admin-site-settings.md #   后台站点设置
├── testing/                   # 质量门禁：什么时候跑什么、怎么过
│   ├── README.md              #   速查表：六阶段、三种推送姿势、分档判据
│   ├── checks-by-stage.md     #   六阶段逐项：dev / commit / build / push / CI / deploy
│   ├── check-catalog.md       #   检查清单：14 类检查、耗时、手动脚本、E2E 命令
│   ├── guards.md              #   守卫与变异测试：三层守卫、变异注册表
│   ├── log-regression.md      #   日志回归：基线约束、连带影响
│   └── pitfalls.md            #   已踩过的坑：命令、工具、E2E、hook
├── contribute/                # 帮助与贡献
│   ├── README.md              #   获取帮助、贡献流程、提交消息格式、工程化待办
│   ├── code-style.md          #   代码风格：命名、格式化、注释、打印
│   └── docs-and-assets.md     #   文档规范、目录归属、产品资产红线
├── knowledge/                 # 知识库状况
│   ├── upstream.md            #   上游有什么（一个 plot、一条 rule 逐条）
│   ├── gap.md                 #   我们差在哪、哪些不补、该抄什么
│   ├── coverage.md            #   我们现在的覆盖情况
│   └── baselines.md           #   基线日志怎么入库、CI 怎么用
├── operations/                # 运维
│   ├── README.md              #   架构速览、环境变量、KV、排障
│   └── deploy.md              #   部署、回滚、CI/CD
└── roadmap/                   # 计划与决策
    ├── decisions.md           #   决策记录：已拍板 + 未闭合待办
    └── *-plan.md              #   进行中的方案（一个方案一份）
```

**四条铁律**：

1. **一个 md 只讲一个主题**，不许两份文档说同一件事。
2. **一份 md 超过约 300 行就该问要不要拆**——按主题拆成子目录，拆出来的目录配一份短 README
   做索引（`testing/`、`contribute/` 就是这么拆出来的）。
3. **本目录任何文档不得引用 `CLAUDE.md`**——那是给 AI 看的。只允许反向（`CLAUDE.md` → 本目录）。
4. **中间过程文件（评估报告、重构 plan、复现记录）完成即删**，只把结论抽进正式文档
   —— 见 [`roadmap/decisions.md`](roadmap/decisions.md) D4。

---

## 四、写在哪儿：判断标准

**「这份内容，三个月后还需要被人读吗？」**

| 内容性质                           | 去哪                                   | 生命周期       |
| ---------------------------------- | -------------------------------------- | -------------- |
| 上手（怎么跑起来、写第一条东西）   | `quickstart/`                          | 长期           |
| 机制（已落地的设计、契约、schema） | `architecture/`                        | 长期           |
| 质量（检查清单、门禁、基线、坑）   | `testing/`                             | 长期           |
| 风格（命名 / 注释 / 打印 / 文档）  | `contribute/code-style.md`             | 长期           |
| 帮助与贡献（流程、提交消息、待办） | `contribute/README.md`                 | 长期           |
| 知识库状况（上游/差距/覆盖/基线）  | `knowledge/`                           | 长期           |
| 运维（部署、排障）                 | `operations/`                          | 长期           |
| 决策与待办                         | `roadmap/decisions.md`                 | 长期           |
| **方案（还没做完的）**             | `roadmap/`，一个方案一份 `*-plan.md`   | **完成即处理** |
| **过程（评估、复现、重构记录）**   | 不进本目录；结论抽进上面某处后删原文件 | **即用即弃**   |

**代码旁的文档**（`knowledge/engine/README.md`、`tools/README.md`、各 `CLAUDE.md`）
留在代码旁，本目录不复制它们的内容，需要时链接过去。

---

## 五、周边真源

| 你想知道                          | 去哪                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| 引擎实现（算子注册表 / 规则框架） | [`knowledge/engine/`](../../knowledge/engine/README.md)（浏览器与本地工具共用同一份源码） |
| 检查经验（阈值 / 判定条件）       | [`knowledge/px4/rules/*.yaml`](../../knowledge/px4/rules) → 网站 `/guide/rule-catalogue`  |
| 怎么**写**一条检查经验            | 网站 `/guide/rule-schema`                                                                 |
| 故障根因 / 排查步骤 / 禁忌        | [`knowledge/px4/fault-kb.yaml`](../../knowledge/px4/fault-kb.yaml)                        |
| 绘图预设 schema                   | [`knowledge/px4/plot/README.md`](../../knowledge/px4/plot/README.md)                      |
| 站点内容（guide / skills / mcp）  | [`web/content/`](../../web/content)                                                       |
