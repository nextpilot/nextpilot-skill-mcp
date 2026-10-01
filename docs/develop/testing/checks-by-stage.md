# 六个阶段逐项：dev → commit → build → push → CI → deploy

速查表、分档判据、复测命令见 [`README.md`](README.md)；本文逐阶段列每一项检查。

---

## 一、阶段 0 · 写代码

你敲 `pnpm web:dev`，它一次起两段（`web/scripts/dev.mjs`）：先构建，再同时起知识热重建与 Next。

| 文件                              | 是什么             | 干什么                                                                                                   |
| --------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| `web/scripts/dev.mjs`             | **dev 启动器**     | ① `build-knowledge` ② 并起 `build-knowledge --watch` 与 `next dev`，Ctrl+C 一起停                        |
| `web/scripts/build-knowledge.mjs` | 知识构建脚本       | 把引擎源码与人工经验拼成运行时产物。**全是 `throw`**：规则缺字段、算子没注册、表达式编译不过，这里就报错 |
| `next dev`                        | Next.js 开发服务器 | 热更新的网站                                                                                             |

热更新分两段：

| 你改了                                                                                     | 谁负责                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `web/` 里的代码与站点内容（`.tsx` / `.css` / `content/**/*.mdx`）                          | Next 自己热更新（内容运行期读盘，刷新即见）       |
| 知识真源（`knowledge/px4/rules/*.yaml`、`facts.yaml`、`knowledge/engine/operators.py` 等） | `build-knowledge --watch` 重建产物，Next 才看得到 |

起不来往往不是 Next.js 的问题，是知识库写错了，报错直指哪个文件哪个字段。dev 层没有类型与
lint 的实时反馈，建议另开 `tsc --noEmit --watch`（增量 2s 级），它不阻塞、不参与任何门禁。

只开一半 / 单独开热重建：

```bash
pnpm --filter ./web dev:no-watch   # 构建 + next dev，不挂 watch
pnpm web:kb:watch                  # 单独开着热重建（另开终端时用）
```

---

## 二、阶段 1 · 提交

你敲 `git commit`，它跑两个 hook（`.githooks/`，只处理 staged 的文件，耗时 2s）：

| 文件                   | 干什么                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.githooks/pre-commit` | staged 的 `.py` 跑 `ruff format` + `ruff check`；`.ts/.tsx/.js/.mjs/.css` 跑 `prettier --write`；`.ts/.tsx` 跑 `eslint --fix`。**改过的文件自动重新 add**，提交的就是你刚看到的 |
| `.githooks/commit-msg` | 标题必须是 `type(scope): 主题`、≤72 字符（完整规则见 [`../contribute/README.md`](../contribute/README.md)）                                                                     |

lint 的位置已定口径：

| 动作                         | 位置       | 说明                                                               |
| ---------------------------- | ---------- | ------------------------------------------------------------------ |
| `eslint --fix`               | **commit** | 只对 staged 的前端文件，自动改完重新暂存                           |
| `ruff check --fix`           | **不加**   | 项目明令禁止（`knowledge/engine/` 是拼接片段，`--fix` 会误删东西） |
| `eslint` / `ruff check` 全套 | **push**   | 需人判断的问题留给 push，有整段时间处理                            |

自动修复（格式类、无争议）放 commit 是纯增量；需人判断的（未使用变量、hook 依赖数组）
不必在"正在提交、思路已断"的瞬间被拦下。若某条 `--fix` 规则造成困扰，按规则关掉它，
不要放弃整个 `--fix`。

---

## 三、阶段 2 · 构建

入口 `web/scripts/build-knowledge.mjs`：读源、生成产物。

先读这些真源，你要改的就是它们：

| 文件                            | 是什么                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `knowledge/engine/operators.py` | **算子注册表** —— 规则里的 `op:` 只能引用这里注册的算子                                                  |
| `knowledge/engine/engine.py`    | **引擎本体** —— 规则框架（调度、求值、调算子、发 finding）+ 报告数据层（抽时序、降采样）。与日志格式无关 |
| `knowledge/px4/rules/*.yaml`    | **检查经验**：阈值与判定条件（最常改这里）                                                               |
| `knowledge/px4/fault-kb.yaml`   | **故障知识库**                                                                                           |

生成产物不要手改，下次构建就覆盖：

| 产物                                           | 是什么                               |
| ---------------------------------------------- | ------------------------------------ |
| `web/workers/analysis-engine.generated.ts`     | 引擎的浏览器版（Pyodide 里跑的那份） |
| `web/workers/fault-kb.generated.json`          | 故障知识库的内联版                   |
| `knowledge/rules-editor-schema.generated.json` | 规则编辑器的 JSON Schema             |

之后 `next build` 真编译生产产物，144s。本地按需跑（`pnpm web:build`），CI 每次跑
（`ci.yml` 的 `--build --ci`）。只跑 `next build` 不走 `pnpm web:build` 是安全的——产物已入库，
`build:kb --check` 会抓产物与源的漂移，两个方向都有人守。

清单 timeout 是 300s，对 144s 只有 2 倍余量。build 被推过 300s 时先查根因，
不要把 timeout 调大到失去意义。

---

## 四、阶段 3 · 推送

你敲 `git push`，它跑 `check_all.py --push`，24 项检查，30~40 秒
（本机没有真实日志时 23 项——4 项日志回归 SKIP）。

主要项一览（`check_all.py --list` 打印全貌）：

| #     | 检查                                               | 干什么                                                                                     | 耗时 |
| ----- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---- |
| 1     | `check_secrets`                                    | 密钥扫描（扫全部跟踪文件，**含 `.md`**）                                                   | 1.3s |
| 2–3   | `ruff format --check` / `ruff check`               | Python 格式化 / lint（只认 `.py`）                                                         | 3s   |
| 4     | `pytest knowledge/engine/tests`                    | 算子与 CEL 表达式求值                                                                      | 1.2s |
| 5–6   | `check_engine_pyodide` / `check_engine_purity`     | 产物是合法 Python 吗 / `knowledge/engine/` 还是纯 Python 吗                                | 1.6s |
| 7     | `check_pnpm_filter`                                | 每个 `pnpm --filter` 都命中真实项目吗                                                      | 0.5s |
| 8–10  | `tsc --noEmit` / `prettier --check` / `eslint`     | TS 类型 / 前端格式 / JS lint（只认 `.js`/`.mjs`）                                          | 8.7s |
| 11    | `check_hygiene`                                    | 校验机制自身还健康吗                                                                       | 4.2s |
| 12–15 | 基线比对 / 适配器契约 / 数据层自检 / 字段引用 lint | **只在本地跑**：要真实 `.ulg`，CI 必然 SKIP（见 [`log-regression.md`](log-regression.md)） | 11s  |
| 16–17 | `guard_apm_parser_version` / `guard_engine_names`  | 解析器升级纪律 / 拼接命名不撞车                                                            | 0.9s |
| 18–19 | `check-guide-mdx` / `check-site-settings`          | 指南 MDX 可编译 / 站点设置机制还在                                                         | 2s   |

后果是 `CI 全绿 ≠ 回归过了`，因为第 12~15 项只在开发机跑。

---

## 五、阶段 4 · CI（推上去之后）

入口在 `.github/workflows/` 下四个互相独立的 workflow，各自一个 job、各自超时预算，
并行、互不阻塞：谁慢谁独立，别让一条慢检查拖住其他。

| workflow     | 触发                                        | 调什么                       | job                | 超时   |
| ------------ | ------------------------------------------- | ---------------------------- | ------------------ | ------ |
| `ci.yml`     | `push`（master/main）、`pull_request`、手动 | `check_all.py --build --ci`  | `checks`           | 40 min |
| `e2e.yml`    | `push`（master/main）、手动                 | `check_all.py --build --e2e` | `playwright`       | 15 min |
| `mutate.yml` | `push`（master/main）、手动                 | `check_all.py --mutate`      | `guard-self-proof` | 40 min |
| `audit.yml`  | **仅手动**（`workflow_dispatch`）           | `check_all.py --audit`       | `audit`            | 10 min |

四个文件都只做一件事：装依赖（`./tools/setup/setup.sh`）→ 调 `check_all.py` 带对应开关。
检查项一个都不写在这里——加检查改 `tools/ci/checklist.yml`，CI 自动跟上。

### 5.1 `ci.yml` —— 质量门（默认关卡）

| 检查                                      | 干什么                                             | 耗时     |
| ----------------------------------------- | -------------------------------------------------- | -------- |
| `next-build`                              | 真能编译出生产产物吗                               | 144s     |
| `build-kb-parity-clean`                   | 干净 checkout 上，产物与 `knowledge/` 一致吗       | 0.6s     |
| `check-skill-spec` / `check-mcp-spec`     | Skill / MCP 目录规范（自带反例自检）               | 0.7s     |
| `check-guide-mdx` / `check-site-settings` | 指南可编译 / 设置机制在                            | 秒级     |
| `test-issue-filer`                        | **前端守卫集**：23 节 130 条不变量（扫源码防回潮） | 44s      |
| `playwright-smoke`                        | 16 条关键路由还能渲染吗                            | 分钟级   |
| 其余 `when: [push, ci]` 静态项            | 格式化 / lint / 类型 / 单测 / 契约 / 元检查        | 合计秒级 |

日志回归在 CI 里是 SKIP，且有意的（[`log-regression.md`](log-regression.md)）。
`ci.yml` 末尾挂了一个 `if: always()` 的 notice，专门提醒「CI 全绿 ≠ 全量回归通过」。

### 5.2 `e2e.yml` —— 全流程 E2E

`playwright-smoke`（16 条路由，与 ci.yml 同一批）+ `playwright-analyze`
（上传 `.ulg` → Pyodide 解析 → 显示，约 7min）。

analyze 拆出去是因为它首跑要下 Pyodide WASM，7 分钟起步，留在质量门会拖慢每次 PR；
它只验端侧链路，失败信号与静态检查是两类问题。只在 push 到 master/main 跑，不阻塞 PR。

### 5.3 `mutate.yml` —— 守卫自证

74 条变异逐条注入源码，断言恰好一条守卫变红再还原，约 26min。

它独立成一份，是因为 74 条里 34 条打在 `test-issue-filer` 上（45s × 34），单独一份才拿得到
独立超时预算。它必须有地方跑，是因为它红了意味着某条守卫已退化成恒绿——这是本项目栽过最多
次的一类问题（见 [`guards.md`](guards.md)）。只在 push 到 master/main 跑，不跑 PR。

### 5.4 `audit.yml` —— 依赖审计

`pip-audit`（41s）+ `pnpm-audit`（7.4s）。仅手动：依赖变更频率低，Actions 页面手动触发。

它放 CI 不放 push，是因为要联网查外部漏洞库，网络抖动不该变成"提交失败"。CI 不需要配
registry：本机 `~/.npmrc` 指向 npmmirror（无 audit 端点）会红，CI 默认走官方源；命令里显式
带 `--registry` 是为了让本机与 CI 行为一致。

这四个 workflow 在 Gitee 上不会执行：本仓主远端是 Gitee，GitHub 侧只作镜像。未迁移前云端
门禁实际未生效，质量靠本机 `.githooks/pre-push` 拦——见
[`../operations/deploy.md`](../operations/deploy.md)。

---

## 六、阶段 5 · 部署

入口 `.github/workflows/deploy.yml`，CI 成功才发布，失败就不发。

| 步骤                            | 干什么                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| EdgeOne CLI                     | 从 `web/` 源码目录直接构建并部署（全栈模式，不由 CI 传产物）                                |
| `web/playwright.live.config.ts` | **部署后打线上的全套 E2E**（含真实上传 `.ulg`）。不启动本地 server，直接打 `SMOKE_BASE_URL` |

它验的是真实部署产物，本地与 CI 都替代不了。部署配置与回滚见
[`../operations/deploy.md`](../operations/deploy.md)。
