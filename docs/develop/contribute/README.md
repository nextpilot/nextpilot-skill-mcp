# 贡献指南：如何获取帮助、如何贡献

> 代码怎么写好看是 [`code-style.md`](code-style.md) 的事；本文讲流程——遇到问题找谁、
> 想贡献怎么走、提交消息怎么写。

---

## 一、如何获取帮助

| 渠道             | 适合什么                                                                           | 去哪                                                                              |
| ---------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **站内反馈入口** | 使用问题、结论疑似不对、功能建议                                                   | 站点 `/issue`（登录后可传上下文，匿名也收）                                       |
| **Gitee Issue**  | 开发问题、bug 报告、feature 讨论                                                   | <https://gitee.com/nextpilot/nextpilot-skill-mcp/issues>                          |
| **自动错误上报** | 站点崩溃时不用你动手——浏览器异常自动建 issue                                       | 机制见 [`../architecture/error-reporting.md`](../architecture/error-reporting.md) |
| **文档**         | 先查文档再问：用户问题看 [`../../guide/`](../../guide/README.md)，开发问题看本目录 | —                                                                                 |

**报 bug 请带三样**：做了什么（步骤）、期望什么、实际什么。日志分析类问题附上
**规则 id**（报告页每条结论都有），不用附原始日志——原始日志不出浏览器，这是产品承诺。

---

## 二、如何贡献代码

### 2.1 什么适合贡献

| 类型              | 入口                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 检查规则 / 阈值   | [`../quickstart/write-a-rule.md`](../quickstart/write-a-rule.md)（内容规范看站内 `/guide/write-rules`）                                |
| 新 Skill          | [`../quickstart/write-a-skill.md`](../quickstart/write-a-skill.md)                                                                     |
| 新 MCP 条目       | [`../quickstart/write-an-mcp.md`](../quickstart/write-an-mcp.md)                                                                       |
| 站点功能 / 修 bug | 从 [`../quickstart/run-locally.md`](../quickstart/run-locally.md) 起步                                                                 |
| 引擎算子 / 适配器 | [`../architecture/engine.md`](../architecture/engine.md)（机制）+ [`../architecture/provider.md`](../architecture/provider.md)（契约） |

### 2.2 流程

```text
Gitee Issue 先认领/开一个（大改动先对齐方案，避免白做）
  → fork / 开分支
  → 改代码（风格见 code-style.md，一个 PR 一个主题）
  → 本地过门禁：git push 时 pre-push hook 自动跑 check_all.py --push
  → 提 PR 到 master（CI 会在 Gitee 侧不执行，见 operations/deploy.md 的现状说明）
  → 维护者 review → squash/merge
```

三条约定：

1. 一个 PR 一个主题。规则调优、功能、格式化分开提——混在一起的 PR review 不动。
2. 改规则必须显式打新基线：引擎结论不许因重构漂移，见
   [`../testing/log-regression.md`](../testing/log-regression.md)。
3. 提交前跑一遍 `python tools/ci/check_all.py --push`（hook 会跑，自己先跑省一轮往返）。

### 2.3 提交消息

格式由 `.githooks/commit-msg` 强制，不满足会被直接拒回：

```text
<type>(<scope>): <subject>
```

| 项        | 规则                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------- |
| `type`    | 从 `feat fix chore docs refactor perf style test build ci revert` 取（`merge:` 不是合法 type） |
| `scope`   | 可选。**只认小写字母、数字、连字符** —— 下划线会被拒（`blob_manager` 要写成 `blob-manager`）   |
| `:`       | 英文半角冒号 + 一个空格                                                                        |
| `subject` | 标题总长 **≤ 72 字符**，中文按字符数算                                                         |

`scope` 只能用圆括号，不能用方括号（方括号在 `sh` 与 Git 配置里都是转义地雷）。

正文：

- 必须能独立读懂 —— 不看 diff、不依赖上下文就知道做了什么、为什么。
- 正文不是必填，但涉及"为什么这么改"、"放弃的方案"、"踩过的坑"时必须写。
- 一行一条，用 `-` 加空格起头。
- 多段正文用多个 `-m`，不要在一个 `-m` 里塞换行：
  `git commit -m "type: 标题" -m "- 第一条"`。
  单个 `-m` 带换行会让整段被当成标题，钩子会以"标题格式不对"拒回。

示例：

```text
style(dev): 输出收编到 log API，进度条改流式写入

- print 全部换 log.info/log.err，错误走 stderr
- 文件头按模板重写：补坑与契约
```

绕过钩子用 `--no-verify`，但那意味着这段规范没被遵守——要么改消息，要么先改钩子。

---

## 三、非代码贡献

| 想贡献什么           | 怎么做                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------- |
| 改文档               | 直接提 PR。文档规范见 [`docs-and-assets.md`](docs-and-assets.md)                            |
| 补上游对齐资料       | `docs/develop/knowledge/` 的四问文档，见 [`../knowledge/README.md`](../knowledge/README.md) |
| 报一份问题日志的误判 | 站内 `/issue` 带规则 id；维护者会核对阈值与字段                                             |

---

## 四、工程化待办（认领区）

已排期未落实的工程化事项，想贡献从这里挑（完整清单见
[`../roadmap/decisions.md`](../roadmap/decisions.md) D5）：

| 事项                       | 说明                                                            |
| -------------------------- | --------------------------------------------------------------- |
| **Dependabot**             | 加 `.github/dependabot.yml`（pip + npm + actions 三生态，周更） |
| **bundle 分析 + 体积预算** | `@next/bundle-analyzer` 接入 build，给首屏 JS 定预算并进 CI     |
| `jsx-a11y` + axe           | 可访问性 lint 与冒烟扫描                                        |
| `useLogAnalyzer` 单测      | 前端核心 hook 目前零单测                                        |

> Dependabot 与 bundle 分析当前**只在 Gitee 侧不会自动跑**——`.github/` 配置 Gitee 不执行，
> 落地前先看 [`../operations/deploy.md`](../operations/deploy.md) 的托管现状。
