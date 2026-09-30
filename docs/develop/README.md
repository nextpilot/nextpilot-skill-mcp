# docs/develop/ —— 开发者文档

**给开发者看：这个仓库怎么实现、怎么跑、怎么改。**

> 面向**用户**的文档真源在 [`web/content/guide/`](../../web/content/guide)
> （发布到站内 `/guide`），本目录不发布。
> **判断标准**：这段话用户会不会在 `/guide` 上看到？会 → `web/content/`；不会 → 本目录。

---

## 一、先看这里

| 你的处境                           | 去哪                                      |
| ---------------------------------- | ----------------------------------------- |
| **第一天进来，想跑起来**           | [`quickstart/`](quickstart/README.md)     |
| **要改代码，想懂系统怎么分层**     | [`architecture/`](architecture/README.md) |
| **要加规则 / 改图 / 动知识库**     | [`knowledge/`](knowledge/README.md)       |
| **要部署、线上出问题**             | [`operations/`](operations/README.md)     |
| **想知道接下来做什么、已定了什么** | [`roadmap/`](roadmap/decisions.md)        |
| **动手写代码前，想守规矩**         | [`style.md`](style.md)                    |

---

## 二、六个位置，各有归属

```text
docs/develop/
├── README.md                  # 本文（导航）
├── style.md                   # 规范：命名/注释/打印/提交/产品资产/文档
├── quickstart/                # 上手
│   ├── README.md              #   快速开始：装环境、跑起来、常用命令
│   └── checks-by-stage.md     #   什么时候跑哪些检查：分档、六阶段、耗时、坑
├── architecture/              # 怎么实现的
│   ├── README.md              #   索引 + 四层总览
│   ├── engine.md              #   知识引擎：算子、规则框架、报告数据层
│   ├── provider.md            #   格式适配层：provider 契约
│   ├── web-app.md             #   Web 应用：双层运行时、端侧分析、内容管线
│   ├── mcp-server.md          #   MCP 服务：工具集与装配
│   ├── error-reporting.md     #   错误上报
│   └── admin-site-settings.md #   后台站点设置
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

**三条铁律**：

1. **一个 md 只讲一个主题**，不许两份文档说同一件事。
2. **本目录任何文档不得引用 `CLAUDE.md`**——那是给 AI 看的。只允许反向（`CLAUDE.md` → 本目录）。
3. **中间过程文件（评估报告、重构 plan、复现记录）完成即删**，只把结论抽进正式文档
   —— 见 [`roadmap/decisions.md`](roadmap/decisions.md) D4。

---

## 三、写在哪儿：判断标准

**「这份内容，三个月后还需要被人读吗？」**

| 内容性质                           | 去哪                                   | 生命周期       |
| ---------------------------------- | -------------------------------------- | -------------- |
| 规范（你该写成什么样）             | `style.md`                             | 长期           |
| 上手（怎么跑起来、改完跑什么）     | `quickstart/`                          | 长期           |
| 机制（已落地的设计、契约、schema） | `architecture/`                        | 长期           |
| 知识库状况（上游/差距/覆盖/基线）  | `knowledge/`                           | 长期           |
| 运维（部署、排障）                 | `operations/`                          | 长期           |
| 决策与待办                         | `roadmap/decisions.md`                 | 长期           |
| **方案（还没做完的）**             | `roadmap/`，一个方案一份 `*-plan.md`   | **完成即处理** |
| **过程（评估、复现、重构记录）**   | 不进本目录；结论抽进上面某处后删原文件 | **即用即弃**   |

**代码旁的文档**（`knowledge/engine/README.md`、`tools/README.md`、各 `CLAUDE.md`）
留在代码旁，本目录不复制它们的内容，需要时链接过去。

---

## 四、周边真源

| 你想知道                          | 去哪                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| 引擎实现（算子注册表 / 规则框架） | [`knowledge/engine/`](../../knowledge/engine/README.md)（浏览器与本地工具共用同一份源码） |
| 检查经验（阈值 / 判定条件）       | [`knowledge/px4/rules/*.yaml`](../../knowledge/px4/rules) → 网站 `/guide/rule-catalogue`  |
| 怎么**写**一条检查经验            | 网站 `/guide/rule-schema`                                                                 |
| 故障根因 / 排查步骤 / 禁忌        | [`knowledge/px4/fault-kb.yaml`](../../knowledge/px4/fault-kb.yaml)                        |
| 绘图预设 schema                   | [`knowledge/px4/plot/README.md`](../../knowledge/px4/plot/README.md)                      |
| 站点内容（guide / skills / mcp）  | [`web/content/`](../../web/content)                                                       |
