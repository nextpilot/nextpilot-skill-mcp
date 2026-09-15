# knowledge/ —— 日志分析的唯一知识源

飞控日志分析的**全部人工经验都在这一个文件夹里维护**。
Web 站点（浏览器端 Pyodide 引擎、边缘函数 LLM 层）和未来的平台 MCP Server
**都只消费这里派生出的产物，不在各自代码里另存一份阈值 / 根因 / 提示词。**

按**飞控固件族**分目录：`px4/`（当前实现），以后新增 ArduPilot 时加 `ardupilot/`，
两边保持同样的结构。每个固件族目录下再按**受众**分文档：

```text
px4/
  ── 知识本体（不是文档，是经验与字典）──
  rules/*.yaml          检查经验：一条经验一个 YAML，判定阈值就写在各自经验里
                        （32 条经验；failsafe.yaml 一个文件装了 6 条同构经验）
  px4-fault-kb.yaml     故障树：标签 → 根因 / 排查步骤 / 禁忌 / 风险等级
  facts.yaml            事实层的数据绑定与码表：字段名 / 码值 / 飞行阶段分组 / slot 执行顺序
  meta/<tag>.json       固件元数据（生成物）：字段字典 + 参数字典（见 meta/README.md）

  ── 文档（按受众分）──
  CLAUDE.md             ⓐ 给 AI 与维护者：设计动机、四类经验 → 四种载体、执行链路、
                        实施状态与落地差异
                        （子目录 CLAUDE.md：动 `px4/` 下的经验与文档时会自动进上下文，不发布到网站）
  llm/                  ⓑ 给 AI 看的（第四层：LLM 只做翻译与组装）
    gjb841-system-prompt.md GJB-841 思考范式
    report-empty.md         无 finding 时的固定结论文案
```

**引擎源码不在这里**：`operators.py`（算子注册表）、`rule_engine.py`（规则框架）、`report_data.py`（报告数据层）在 [engine/](../engine/README.md)
（浏览器与本地工具共用同一份）。这个目录只放**经验与字典**——"算完怎么判定"，不放"怎么算"。
此处曾同时放这两类东西，2026-09 分开。

**「知识库」分组的两个页面不在这个目录里**（都在仓库根 `content/guide/`，`/guide` 站内可见）：

- 「如何编写一条规则」`knowledge-write-rule.md`：手维护，**唯一一份**（原先在
  `knowledge/px4/guides/writing-rules.md`，已搬走，那个目录现在没有了）；
  其中两张表由 `python tools/px4/gen-rule-reference.py` 注入。
- 「当前有哪些规则」`knowledge-rules.md`：构建时从 `rules/*.yaml` 现读现算，**只出网站这一份**。

## 我要做什么 → 看哪里

| 我要…… | 看 / 改 |
| --- | --- |
| 了解整套规则体系为什么这么设计 | [px4/CLAUDE.md](px4/CLAUDE.md)（给 AI 与维护者的设计上下文） |
| **写一条新规则 / 改一条现有规则** | 站内 `/guide/knowledge-write-rule`（字段、算子、常见坑；源文件 `content/guide/knowledge-write-rule.md`） |
| 弄清自己这类经验该写在哪 | [px4/CLAUDE.md](px4/CLAUDE.md) 的「四类经验 → 四种载体」 |
| 查现在有哪些规则、各自读什么字段、什么条件触发 | 网站 `/guide/knowledge-rules`（构建时从 `rules/*.yaml` 生成，仓库里不留拷贝） |
| **只是想"用网页看"这些内容** | 站点 `/guide` 的「知识库」分组（怎么写规则 / 现有规则两页） |
| 调一条阈值 | 直接改 `px4/rules/<那条经验>.yaml` 的 `threshold` 与 `triggers[].expr` |
| 改字段绑定 / 码值 / 阶段分组 / slot 执行顺序 | `px4/facts.yaml`（引擎不含业务数据，全在这里） |
| 加一条故障模式（根因 / 排查步骤） | `px4/px4-fault-kb.yaml`（trigger_tags 必须是引擎会产出的标签） |
| 加一个可复用计算步骤 | `engine/operators.py`（`@operator` 声明 in/out arity），再在经验的 `compute` 里引用 |
| 改 AI 报告口径 | `px4/llm/*.md` |
| 同步固件元数据 | `python tools/px4/sync-px4-msg.py --tags ...` → 生成物在 `px4/meta/<tag>.json` |

## 改完怎么验证

```bash
cd web && node scripts/build-knowledge.mjs     # 构建；校验失败会直接报错（或 pnpm build:kb）
# 等价回归：6 条真实日志与冻结基线逐字段比对（不依赖 Node）
python tools/calibrate/compare-baseline.py
# 生成产物是否真的可执行（不只是语法）
python tools/calibrate/check-artifact.py
# 字段引用与版本错配（字段名写错时引擎只会静默取到 None，这条能揪出来）
python tools/calibrate/lint-rules.py
# 单条经验为什么不触发：逐节点打印
python tools/calibrate/probe_rule.py tools/calibrate/logs/<log>.ulg <rule_id>
```

改完算子后，记得重跑 `python tools/px4/gen-rule-reference.py`（把算子目录与内置变量表注入
「如何编写一条规则」页）。**规则清单不用手动跑**——`build:kb` 会从 `rules/*.yaml` 现读现算，
直接生成网站页面；产物是否与知识源一致，用 `--check` 比对（CI 用，不一致则退出码 1）：

```bash
cd web && pnpm build:kb            # 生成全部产物（= node scripts/build-knowledge.mjs）
cd web && pnpm build:kb --check    # 只比对不写入：任一产物与 knowledge/ 不一致就退出码 1
```

生成产物（提交进仓库，EdgeOne 直接 `next build` 也有得用）：
`web/workers/ulog-check-script.ts`（内联 engine/operators.py + engine/rule_engine.py + rules/*.yaml）、
`web/workers/ulog-data-script.ts`、`web/workers/fault-kb.generated.json`、
`web/lib/knowledge/prompts.generated.js`、
`content/guide/knowledge-rules.md`（指南「知识库」分组的规则清单页；同分组的
「如何编写一条规则」是手维护页面，不是生成物）。

**铁律**：生成物不要手改；所有数值判断只在 `px4/rules/*.yaml` + 引擎框架里发生，
LLM 只做翻译与组装。
