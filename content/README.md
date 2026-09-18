# content/ —— 站点内容源（人工写的展示内容）

这里放**用户看得见的内容**，与代码分离，改文案不必翻进 `web/`：

| 目录 | 内容 | 变成哪个页面 |
| --- | --- | --- |
| `guide/` | 使用指南（6 篇手写 MDX）＋ 知识库两页 | `/guide`、`/guide/<slug>` |
| `skills/` | Skill 卡片（8 个种子） | `/skills`、`/skills/<slug>` |
| `mcp/` | MCP 条目 | `/mcp`、`/mcp/<slug>` |

静态生成时由 `web/lib/{guide,skills,mcp}.ts` 读取（`process.cwd()` 是 `web/`，所以读 `../content/`），
构建期不需要 Node 之外的任何处理。

## 与 knowledge/ 的区别（容易混）

- **这里 `content/`**：给人读的**展示内容**——指南、Skill 卡片、MCP 条目
- **`knowledge/`**：给引擎读的**工程经验**——检查规则的阈值与判定条件（`px4/rules/*.yaml`）、
  故障根因（`px4-fault-kb.yaml`）、LLM 提示词（`px4/llm/`）、固件字段字典（`px4/meta/`）
- **`engine/`**：**怎么算**——通用算子与规则框架（代码，不是内容）

## 两篇特殊页面

`guide/rule-catalogue.mdx`（规则清单）与 `guide/rule-schema.mdx`（规则编写参考）属于
「知识库」分组，与 `knowledge/` 关系密切：

- `rule-catalogue.mdx` 是**生成物**（构建期从 `knowledge/px4/rules/*.yaml` 现读现算，勿手改）
- `rule-schema.mdx` 也是**生成物**：正文是构建脚本里的模板，算子目录与内置变量表从 `engine/` 源码派生

## 加一篇内容

- 加指南：在 `guide/` 放一个 `.mdx`，写好 frontmatter（`title`/`titleEn`/`description`/`group`/`order`），
  导航与上/下一篇会按 frontmatter 自动生成
- 加 Skill：在 `skills/` 放一个 `.mdx`，字段规范见根 `CLAUDE.md` 第 3.1 节
