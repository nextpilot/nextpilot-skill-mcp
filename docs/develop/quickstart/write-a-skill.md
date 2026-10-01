# 编写一个 Skill

**目标：在本地开发环境里做出一个可收录的 Skill。**
Skill 的内容怎么写（场景、输入输出、示例、安全边界）**真源在站内
[`/guide/write-skill`](https://nextpilot-skill-mcp.pages.dev/guide/write-skill)**，
本文只讲**开发闭环**：文件放哪、怎么校验、怎么看效果。

---

## 一、文件结构

```text
web/content/skills/<slug>/          # slug 用 kebab-case
├── SKILL.md                        # 给 AI 读的指令原文（模型直接执行它）
├── README.md                       # 给人看的展示页（frontmatter 驱动站点卡片）
└── CHANGELOG.md                    # 版本历史
```

`SKILL.md` 的格式约束（frontmatter 字段、章节顺序）以站内教程与
`web/scripts/check-skill-spec.mjs` 的判据为准——**校验脚本自带反例自检**，
它认为合规的才合规。

## 二、开发闭环

```bash
# 1. 建目录写三份文件（内容怎么写看站内教程）

# 2. 规范校验（含反例自检：13 条规则每条都会被自己的反例打红）
pnpm web:check:skills

# 3. 本地看效果：dev server 开着，直接刷新
#    /skills           列表卡片
#    /skills/<slug>    详情页
```

**收录流程**（提交、评审、上架）见站内
[`/guide/publish-skill`](https://nextpilot-skill-mcp.pages.dev/guide/publish-skill)。

## 三、本仓自带的 Skill 脚本有个特殊约束

`web/content/skills/*/scripts/*.py` 是**打包给用户下载**的内容——
必须零依赖、可单独执行，**不许 import 本仓的 `tools/`**，打印用裸 `print` 是对的
（全仓唯一的例外，见 [`../contribute/code-style.md`](../contribute/code-style.md) §3）。

## 四、过门禁

`git push` 时 hook 会跑 `check-skill-spec`（push + CI 都在清单里）。
提交消息格式见 [`../contribute/README.md`](../contribute/README.md)。

---

**想做一个 MCP 条目？** 见 [`write-an-mcp.md`](write-an-mcp.md)。
**想给日志分析加一条规则？** 见 [`write-a-rule.md`](write-a-rule.md)。
