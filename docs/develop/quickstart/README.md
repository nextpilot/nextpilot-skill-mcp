# 快速开始

**四条任务线，按顺序走**；每条一份文档，一份只讲一件事。

| #   | 任务线               | 文档                                                                          | 你会得到              |
| --- | -------------------- | ----------------------------------------------------------------------------- | --------------------- |
| 1   | **安装开发环境**     | [`setup.md`](setup.md)                                                        | 工具链就位，hook 挂上 |
| 2   | **本地运行**         | [`run-locally.md`](run-locally.md)                                            | 站点跑起来，改哪刷哪  |
| 3   | **编写一条新规则**   | [`write-a-rule.md`](write-a-rule.md)                                          | 一条检查规则进引擎    |
| 4   | **编写 Skill / MCP** | [`write-a-skill.md`](write-a-skill.md) · [`write-an-mcp.md`](write-an-mcp.md) | 一个可收录的条目      |

改完代码**该跑什么检查**不在这里——那是 [`../testing/`](../testing/README.md) 的事。

---

## 最短路径（已熟练后）

```bash
git clone https://gitee.com/nextpilot/nextpilot-skill-mcp.git
cd nextpilot-skill-mcp
python -m pip install -r requirements-dev.txt        # Python 依赖
(cd web && pnpm install)                             # 前端依赖
git config core.hooksPath .githooks                  # 挂 hook（每台机器一次）
pnpm web:dev                                         # 跑起来 → http://localhost:3000
```

## 我该从哪条线开始

| 你的处境                          | 从哪开始                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| 第一次接触这个仓库                | 按 1 → 2 顺序走                                                                       |
| 只想给平台**加一条检查规则**      | 1 → 2 → [`write-a-rule.md`](write-a-rule.md)                                          |
| 只想**投稿一个 Skill / MCP 条目** | 1 → 2 → [`write-a-skill.md`](write-a-skill.md) / [`write-an-mcp.md`](write-an-mcp.md) |
| 要改站点代码 / 引擎               | 1 → 2，然后看 [`../architecture/`](../architecture/README.md)                         |
| 想知道提交前跑什么检查            | 直接看 [`../testing/README.md`](../testing/README.md)                                 |
| 想贡献代码 / 找人帮忙             | [`../contribute/README.md`](../contribute/README.md)                                  |

## 三件先知道的事

1. **知识库是核心资产**：规则、阈值、故障库都住在 `knowledge/` 下，改经验只改那里；
   `server/`、`web/workers/` 都是它的下游。
2. **原始日志不出浏览器**：分析与规则检查在用户浏览器本地完成（Pyodide），
   这决定了日志回归只能在本地跑（[`../testing/log-regression.md`](../testing/log-regression.md)）。
3. **单一事实源**：检查清单在 `tools/ci/checklist.yml`，站点内容在 `web/content/`，
   经验在 `knowledge/` ——都是"改一处，处处生效"，文档不复制它们的内容。
