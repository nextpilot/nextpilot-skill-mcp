# docs/guide/ —— 用户指南的内容源

**用户看得见的内容**，与代码分离：改文案不必翻进 `web/`。

| 文件 | 对应页面 |
| --- | --- |
| `index.mdx` | `/guide` |
| `basics.mdx` | `/guide/basics` |
| `use.mdx` | `/guide/use` |
| `write-skill.mdx` | `/guide/write-skill` |
| `mcp-server.mdx` | `/guide/mcp-server` |
| `submit.mdx` | `/guide/submit` |

## 怎么变成页面

构建期 `web/scripts/sync-content.mjs` 把本目录拷进 `web/.generated/guide/`，
运行期 `web/lib/guide.ts` 从那里读（`process.cwd()` 是 `web/`）。

`.generated/` 不入库，每次 dev / build 现拷，所以不存在"忘了同步"——但**改完本目录
刷新页面没变化**时，先确认 sync 跑过：`pnpm dev` 启动时会跑一次；写内容时可以另开
一个终端跑 `pnpm sync:watch`，存盘即重拷。

渲染器按扩展名选（见 `web/lib/guide.ts` 的 `renderer`）：`.mdx` 走 MDX，能用
`<Callout>` 等组件；`.md` 走普通 markdown——那些文档里有 `{占位符}`，过 MDX 会被当成
JSX 表达式而报错。

## 两篇不在这里的页面

「知识库」分组的两页是**生成物**：不在本目录，也不入库，构建期现算现写进
`web/.generated/guide/`。

- `rule-catalogue.mdx`（规则清单）——从 `knowledge/px4/rules/*.yaml` 读出来算
- `rule-schema.mdx`（规则编写参考）——正文是构建脚本里的模板，算子目录与内置变量表从 `engine/` 源码派生

改规则 / 算子 / 内置变量之后重跑 `pnpm build:kb`（dev / build 自动执行）。

## 加一篇

在 `guide/` 放一个 `.mdx`，写好 frontmatter（`title` / `titleEn` / `description` /
`descriptionEn` / `group` / `groupEn` / `order`），导航分组与上/下一篇会按 frontmatter
自动生成，不用另登记。
