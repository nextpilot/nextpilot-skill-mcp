# 检查分类总表

> 按**检查什么**分类（不是按跑在哪）。速查与分档见 [`README.md`](README.md)。

| 类别     | 回答什么问题                       | 检查                                                                                                                                                                                               |
| -------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 格式化   | 代码风格一致吗（机器改，人不争论） | `ruff format`（Py）、`prettier`（前端）                                                                                                                                                            |
| lint     | 有没有可疑写法                     | `ruff check`（Py）、`eslint`（JS，**TS 暂不覆盖**）                                                                                                                                                |
| 类型     | 类型对得上吗                       | `tsc --noEmit`                                                                                                                                                                                     |
| 单测     | 算子与表达式求值对不对             | `pytest knowledge/engine/tests`                                                                                                                                                                    |
| 契约     | 产物与源一致吗、产物合法吗         | `build:kb --check`、`check_engine_pyodide`、`check_engine_purity`、`check_pnpm_filter`、`guard_apm_parser_version`、`check-skill-spec`、`check-mcp-spec`、`check-guide-mdx`、`check-site-settings` |
| 守卫集   | 前端不许退化的那批断言还成立吗     | `test-issue-filer`                                                                                                                                                                                 |
| 元检查   | **校验机制自己**还健康吗           | `check_hygiene`                                                                                                                                                                                    |
| 自证     | 守卫真的会红吗（不是恒绿）         | `mutate_guards`（变异条数以 `--list` 为准）                                                                                                                                                        |
| 回归     | 改规则后结论还准吗                 | 日志回归 4 项                                                                                                                                                                                      |
| 冒烟     | 关键路径还能跑通吗                 | Playwright `@smoke`                                                                                                                                                                                |
| E2E      | 全量链路还能跑通吗                 | Playwright 全量、`playwright.live`（线上）                                                                                                                                                         |
| 机密     | 有没有把密钥提交进去               | `check_secrets`                                                                                                                                                                                    |
| 审计     | 依赖有没有已知漏洞                 | `pip-audit`、`pnpm audit`                                                                                                                                                                          |
| 提交规范 | 提交标题能读懂吗、能自动分类吗     | `.githooks/commit-msg`                                                                                                                                                                             |

**"冒烟"与"E2E"的区别在本项目里是标签而非文件**：同一个 `playwright test` 跑全部，
`--grep @smoke` 只跑打了标签的少数几条。所以"冒烟覆盖够不够"取决于 `@smoke` 标在哪。

**四类检查的耗时是分档的关键**：

| 项                     | 耗时     | 后果                                       |
| ---------------------- | -------- | ------------------------------------------ |
| `test-issue-filer`     | 约 45s   | 不进 push；也是 `mutate_guards` 的主要靶子 |
| `next build`           | 144s     | 只在 CI                                    |
| `mutate_guards`        | 约 26min | 独立 workflow（`mutate.yml`，超时 40min）  |
| 「上传 .ulg 完成分析」 | 约 420s  | `playwright-analyze` 单独一步、超时 900s   |

`mutate_guards` 26 分钟里大部分来自 `test-issue-filer`（74 条变异里 34 条打在它上面）。
要压缩就从减少打在它上面的变异数入手，而不是调小超时。

**超时预算的分配依据就是上表**：跑得越快越该待在早阶段（写代码 / 提交），
越慢越该往后退（独立 workflow），而不是给个更大的超时硬扛。

---

## 手动跑的脚本

| 文件                                  | 什么时候用                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| `tools/ci/check_all.py`               | 手动跑任意组合：`--push`；`--list` 看全貌（见 [`README.md`](README.md#三复测方式)） |
| `tools/common/check_prereq.py`        | 首次配环境时查工具链齐不齐（CI 装依赖就顶替了，不重复跑）                           |
| `tools/engine/dump_baseline.py`       | **确认改规则是有意的**之后，重新打基线                                              |
| `tools/engine/check_rules_compute.py` | 调单条规则，看它为什么命中/没命中                                                   |
| `tools/dev/dump_px4log_fields.py`     | 查某份日志里有哪些字段（写规则时用）                                                |
| `tools/dev/dump_px4log_stats.py`      | 探某字段的统计分布（定阈值时用）                                                    |
| `web/scripts/fix-node-links.mjs`      | 批量修网站里的内部链接                                                              |

**跑 E2E 的三个命令**（根层已全部转发，真源在 `web/package.json`）：

```bash
pnpm web:test:e2e:smoke   # 16 条关键路由（@smoke），分钟级
pnpm web:test:e2e:log     # 分析全流程，约 7min（首次要下 Pyodide WASM）
pnpm web:test:e2e         # 全量
```

> **别漏 `./`**：根 `package.json` 的转发脚本一律写 `pnpm --filter ./web`。
> `web` 是目录名不是包名（`web/package.json` 的 `name` 是 `nextpilot-skill-mcp`），
> 不带 `./` 时 pnpm 按包名匹配 → 匹配 0 个项目 → **rc=0、零输出、静默空跑**。
> 由 `check_pnpm_filter` 拦（见 [`pitfalls.md`](pitfalls.md)）。
