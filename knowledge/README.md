# knowledge/ —— 日志分析的唯一知识源

飞控日志分析的**全部人工经验都在这一个文件夹里维护**。
Web 站点（浏览器端 Pyodide 引擎、边缘函数 LLM 层）和未来的平台 MCP 服务
**都只消费这里派生出的产物，不在各自代码里另存一份阈值 / 根因 / 提示词。**

按**飞控固件族**分目录：`px4/`（已实现、已接线）、`ardupilot/`（知识已迁、**尚未接线**），
两边保持同样的结构。每个固件族目录下再按**受众**分文档：

```text
knowledge/
  ── 与固件族无关：各族共用一份（2026-09 从 px4/ 提出）──
  llm/                  ⓑ 给 AI 看的（第四层：LLM 只做翻译与组装）
    gjb841-system-prompt.md GJB-841 思考范式
    report-empty.md         无 finding 时的固定结论文案
  rules-template.yml    可抄的骨架：一条检查经验（复制成 px4/rules/<名字>.yaml）
  plot-template.yml     可抄的骨架：一份绘图预设（复制成 px4/plot/<名字>.yml）

px4/
  ── 知识本体（不是文档，是经验与字典）──
  rules/*.yaml          检查经验：一条经验一个 YAML，判定阈值就写在各自经验里
                        （32 条经验；failsafe.yaml 一个文件装了 6 条同构经验）
  fault-kb.yaml     故障树：标签 → 根因 / 排查步骤 / 禁忌 / 风险等级
  facts.yaml            事实层的数据声明：字段名 / 码值 / 飞行阶段分组 / slot 执行顺序，
                        以及「关键数据」的展示清单（中文名 / 单位 / 顺序）与兜底取数
  meta/<tag>.json       固件元数据（生成物）：字段字典 + 参数字典（见 meta/README.md）

  ── 文档（按受众分）──
  CLAUDE.md             ⓐ 给 AI 与维护者：设计动机、四类经验 → 四种载体、执行链路、
                        实施状态与落地差异
                        （子目录 CLAUDE.md：动 `px4/` 下的经验与文档时会自动进上下文，不发布到网站）
```

`ardupilot/` 的知识源自上游 [ardupilot-mcp](https://github.com/furkanisikay/ardupilot-mcp)
（MIT），署名与偏差记录在它自己的 `ATTRIBUTION.md`。结构与 `px4/` **刻意不对齐**：

```text
ardupilot/
  rules/*.yaml          12 个文件共 34 条经验（上游 16 项检查里迁了 12 项，同构项合并）；
                        23 条能算、11 条占位（缺算子/缺参数/缺矩阵，逐条记在 PENDING.md）
  facts.yaml            码表（飞行模式 / ERR 子系统 / EV 事件 / 机架）与规则元数据
  ATTRIBUTION.md        上游署名、迁了什么、改了什么
  PENDING.md            占位总表：缺的算子、FRAME_CLASS 3 号冲突、接线要改哪些
  CLAUDE.md             给 AI 与维护者
  docs/SOURCES.md       上游 198 条假设审计（引用文本，逐字保留）
```

**它缺 `meta/`、`plot/`、`fault-kb.yaml`**（`llm/` 与两个 `*-template.yml` 在 `knowledge/` 根下，各族共用，不算它缺），且**暂时不进构建产物**
（`build-knowledge.mjs` 与 `engine/loader.py` 都硬编码 `knowledge/px4/`），
所以这批阈值还没有任何一条经过真实 `.bin` 日志验证。
让 ArduPilot 日志真正出 findings 需要一次独立的接线改动，清单在 `ardupilot/PENDING.md`。

**引擎源码不在这里**：`operators.py`（算子注册表）、`engine.py`（规则框架 + 报告数据层）在 [knowledge/engine/](knowledge/engine/README.md)
（浏览器与本地工具共用同一份）。这个目录只放**经验与字典**——"算完怎么判定"，不放"怎么算"。
此处曾同时放这两类东西，2026-09 分开。

**站点内容不在这里**：给人读的展示内容（guide/skills/mcp，不做计算——与上面的"经验与字典"是两回事）
真源在 [web/content/](../web/content/)，直接入库，`web/lib/{skills,mcp}.ts` 运行期读盘。
以前 skills/ 与 mcp/ 挂在本目录、由 `sync-content` 构建期拷过去；真源唯一化后已退役。

## web/content/skills/ 一个 Skill 一个目录

```text
skills/<slug>/
  SKILL.md        给 AI 看：YAML frontmatter + 指令正文
  README.md       给人看：站点详情页「概述」Tab
  CHANGELOG.md    给人看：站点「版本历史」Tab，同时是 version / updatedAt 的唯一真源
```

`SKILL.md` 按 **Agent Skills 规范**写（依据：`https://agentskills.io/specification`，
即 Anthropic 官方仓库 `anthropics/skills` README 指向的规范站）。硬约束：

| 项            | 约束                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `name`        | 1–64 字符，仅小写字母数字与单个连字符，不以连字符开头/结尾；**必须等于目录名**；不得含保留字 `claude` / `anthropic` |
| `description` | 同时写清「做什么」与「什么时候用」（正文要等触发后才加载，"何时用"只能写在这里）；≤ 200 字符                        |
| 顶层字段      | 只允许 `name` / `description` / `license` / `compatibility` / `metadata` / `allowed-tools`                          |
| `metadata`    | string→string 映射：列表写成 `"A, B"`、数字写成 `"4.6"`，不能放数组或数字                                           |
| 正文          | 建议 < 500 行                                                                                                       |

**站点卡片需要的字段（分类、平台、标签、评分…）一律收进 `metadata`**，不散在顶层。
这样每个目录拷进 `.claude/skills/<slug>/` 就能被 Claude 直接加载，不必先过一遍我们的站点。

`description` 的长度取的是**严值**：规范站给 1024，`support.claude.com` 给 200，取 200 两边都过。

`metadata.seed_rating` / `seed_downloads` 是**过渡期的种子值**——社区指标最终会迁到
EdgeOne KV（站点已按「种子 + KV 增量」合并）。迁走后这两项从 `SKILL.md` 删除，
它们本来就不属于 Skill 的内容。

**README.md / CHANGELOG.md 与规范的关系**：规范建议"可分发的技能包"里不要带这类文件
（省 token、避免与指令混淆）。这里是**发布前的源目录**，三份文件用途已经分开，
站点三个 Tab 各读一份，所以保留。将来若做「下载为 skill zip」的打包脚本，**只打
`SKILL.md`**，这两份留在仓库不进包。

改完跑：

```bash
pnpm web:check:skills     # 合规校验（CI 里也跑，见 tools/ci/check_all.py）
```

三份文件都能在仓库里直接改、提 PR：详情页每个内容 Tab 右上角就是**那一份文件**的编辑入口
（地址集中在 `web/lib/constants.ts` 的 `CONTENT_REPO`，换仓库只改一处）。

### web/content/mcp/ 一个 MCP 服务一个目录（**与 skills/ 不是同一份规范**）

```text
mcp/<slug>/
  server.json     给机器看：MCP Registry manifest（上游在哪、怎么装、走什么传输）
  README.md       给人看：站点详情页「概述」Tab + 卡片展示字段
  CHANGELOG.md    给人看：站点「版本历史」Tab，同时是 version / updatedAt 的唯一真源
```

两者最容易互相抄错的地方：

|               | Skill（`skills/`）             | MCP（`mcp/`）                                     |
| ------------- | ------------------------------ | ------------------------------------------------- |
| 规范          | Agent Skills（agentskills.io） | MCP Registry（registry.modelcontextprotocol.io）  |
| 规范文件      | `SKILL.md`                     | `server.json`                                     |
| `name`        | kebab 小写，**必须等于目录名** | **反向 DNS** `io.github.<owner>/<repo>`           |
| `description` | ≤ 200（两份官方口径取严值）    | ≤ 100                                             |
| 独有概念      | 渐进披露、`allowed-tools`      | `tools` / `transport` / `readOnly` / `packages[]` |

两边的 `name` 规则**互斥**——同一个名字不可能同时满足。所以两个目录各有各的守卫
（`check-skill-spec.mjs` / `check-mcp-spec.mjs`），别合成一个，合了必然有一边是错的。

`server.json` 必填 `$schema` / `name` / `description` / `version` / `packages[]`；
`packages[]` 每项要 `registryType` / `identifier` / `version` / `transport.type`
（`stdio` / `streamable-http` / `sse`）。

**上游没核实的条目不填 manifest**——填了就是编造，客户端照着装会装到一个不存在的包。
在 README frontmatter 写 `upstream_status: "pending"` 可以暂时免交 `server.json`：
校验会放过这一条，但每次都把它列在 `SKIP` 行里，不会悄悄变成永久状态。
核实后补上 `server.json`，并删掉 `upstream_status` 与 frontmatter 里的 `transport`
（传输方式只以 `server.json` 的 `packages[].transport` 为真源，留两份会被判双真源）。

改完跑：

```bash
pnpm web:check:mcp
```

**「知识库」分组的两个页面在 `web/content/guide/` 里**（构建期生成、入库，`/guide` 站内可见）：

- 「如何编写知识规则」`rule-schema.mdx`：由 `build-knowledge.mjs` 自动生成（算子目录与内置变量表从 `knowledge/engine/` 源码派生），**唯一一份**。
- 「现有规则清单」`rule-catalogue.mdx`：构建时从 `rules/*.yaml` 现读现算，**只出网站这一份**。

## 我要做什么 → 看哪里

| 我要……                                                              | 看 / 改                                                                                       |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 了解整套规则体系为什么这么设计                                      | [px4/CLAUDE.md](px4/CLAUDE.md)（给 AI 与维护者的设计上下文）                                  |
| **新增 / 改一个 Skill**                                             | `web/content/skills/<slug>/` 三份文件（结构见上节），改完 `pnpm web:check:skills`             |
| **新增 / 改一个 MCP 条目**                                          | `web/content/mcp/<slug>/`（结构见上节；规范与 Skill **不同**），改完 `pnpm web:check:mcp`     |
| **写一条新规则 / 改一条现有规则**                                   | 站内 `/guide/rule-schema`（字段、算子、常见坑；构建期生成，仓库里不留拷贝）                   |
| 弄清自己这类经验该写在哪                                            | [px4/CLAUDE.md](px4/CLAUDE.md) 的「四类经验 → 四种载体」                                      |
| 查现在有哪些规则、各自读什么字段、什么条件触发                      | 网站 `/guide/rule-catalogue`（构建时从 `rules/*.yaml` 生成，仓库里不留拷贝）                  |
| **只是想"用网页看"这些内容**                                        | 站点 `/guide` 的「知识库」分组（怎么写规则 / 现有规则两页）                                   |
| 调一条阈值                                                          | 直接改 `px4/rules/<那条经验>.yaml` 的 `threshold` 与 `triggers[].expr`                        |
| 改字段绑定 / 码值 / 阶段分组 / slot 执行顺序 / 关键数据的名字与顺序 | `px4/facts.yaml`（引擎不含业务数据，全在这里）                                                |
| 加一条故障模式（根因 / 排查步骤）                                   | `px4/fault-kb.yaml`（trigger_tags 必须是引擎会产出的标签）                                    |
| 加一个可复用计算步骤                                                | `knowledge/engine/operators.py`（`@operator` 声明 in/out arity），再在经验的 `compute` 里引用 |
| 改 AI 报告口径                                                      | `llm/*.md`（与固件族无关，在 `knowledge/` 根下）                                              |
| 同步固件元数据                                                      | `python tools/dev/fetch_px4_uorb_msg.py --tags ...` → 生成物在 `px4/meta/<tag>.json`          |

## 改完怎么验证

```bash
cd web && node scripts/build-knowledge.mjs     # 构建；校验失败会直接报错（或 pnpm build:kb）
# 等价回归：6 条真实日志与冻结基线逐字段比对（不依赖 Node）
python tools/engine/compare_baseline.py
# 生成产物是否真的可执行（不只是语法）
python tools/calibrate/check-artifact.py
# 字段引用与版本错配（字段名写错时引擎只会静默取到 None，这条能揪出来）
python tools/calibrate/lint-rules.py
# 单条经验为什么不触发：逐节点打印
python tools/dev/check_rules_compute.py tools/testdata/logs/<log>.ulg <rule_id>
```

改完算子后，记得重跑 `python tools/px4/gen-rule-reference.py`（把算子目录与内置变量表注入
「如何编写知识规则」页）。**规则清单不用手动跑**——`build:kb` 会从 `rules/*.yaml` 现读现算，
直接生成网站页面；产物是否与知识源一致，用 `--check` 比对（CI 用，不一致则退出码 1）：

```bash
pnpm web:build:kb            # 生成全部产物（= node scripts/build-knowledge.mjs）
pnpm web:build:kb -- --check    # 只比对不写入：任一产物与 knowledge/ 不一致就退出码 1
```

生成产物（提交进仓库，EdgeOne 直接 `next build` 也有得用）：
`web/workers/analysis-engine.generated.ts`（内联 knowledge/engine/operators.py + knowledge/engine/engine.py + rules/*.yaml）、
`web/workers/fault-kb.generated.json`、
`web/lib/knowledge/prompts.generated.js`、
`rules-editor-schema.generated.json`（编辑器用，见下节；与固件族无关，落在 `knowledge/` 根）。

指南的两页生成物（`rule-catalogue.mdx` / `rule-schema.mdx`）也入库，就在 `web/content/guide/`。

### 编辑器提示（键名补全 / 拼写检查）

`rules/*.yaml` 的 schema 已配在 `.vscode/settings.json`（需要扩展 `redhat.vscode-yaml`）：
写规则时键名会补全、拼错会当场飘红。**那份 schema 同样是生成物**——词表从 `facts.yaml`
与 `knowledge/engine/` 派生，手改它就等于造出第二份真源（改了 `facts.yaml` 而它没跟上时，
IDE 会拿旧词表去纠正新写法，比没有提示更糟）。

它只管键名 / 枚举 / 类型这类「纯形状」的问题。`compute` 表达式**内部**的语法、算子名、
字段存在性它查不了——那些在字符串里，仍然只有 `pnpm web:build:kb` 能查。

**铁律**：生成物不要手改；所有数值判断只在 `px4/rules/*.yaml` + 引擎框架里发生，
LLM 只做翻译与组装。
