# 什么时候跑哪些检查

> **本文回答一个问题**：从敲下命令到代码上线，**每个阶段自动跑什么检查、耗时多少、
> 红了看哪**。分档判据、逐项实测档案、坑，全在这一篇。
>
> **这是架构文档，不是教程** —— 检查挂在哪个阶段是机制设计，改检查 = 改
> `tools/ci/checklist.yml` 一处（单一事实源），不要抄到第二个地方。

---

## 零、速查

**大部分时候你什么都不用跑**，门禁是自动的。

| 阶段         | 入口                                                                              | 触发         | 实测时长                |
| ------------ | --------------------------------------------------------------------------------- | ------------ | ----------------------- |
| **0 dev**    | `pnpm web:dev` = `build:kb` + `next dev`                                          | 手动         | 启动即跑构建期校验      |
| **1 commit** | `.githooks/pre-commit` + `commit-msg`                                             | `git commit` | 2s                      |
| **2 build**  | `pnpm web:build` = `build:kb` + `next build`                                      | 手动         | 144s（仅 `next build`） |
| **3 push**   | `.githooks/pre-push` → `check_all.py --push`                                      | `git push`   | 26~40s                  |
| **4 CI**     | `.github/workflows/` 下**四个独立 workflow**（`ci` / `e2e` / `mutate` / `audit`） | push / PR    | 15~40min（各自并行）    |
| **5 deploy** | `.github/workflows/deploy.yml`                                                    | CI 成功后    | 部署 + 线上 E2E         |

**三种推送姿势**：

```bash
git push                # 默认，只跑 push 阶段那批（秒级）
WITH_E2E=1 git push     # 连 E2E 那批一起跑（+5~7min）
FULL_PUSH=1 git push    # 和 CI 一样全（+144s 的 next build）
```

---

## 一、为什么这样分档

**本地只留秒级，分钟级全部放云端。** 判据只有一条：这项检查**会不会让人干等着**。

- 秒级（< 5s）→ 每次都跑，跑了也不心疼；
- 十秒级（10-60s）→ 本地 push 时跑，但只在改了相关文件时才有意义；
- 分钟级（> 2min）→ **一律不在本地跑**，交给云端 CI。

**第二条依据是"有没有增量价值"**。一条检查若在别处已被等价保证，重复跑就是纯成本——
工具链检查（`check_prereq`）是典型：CI 里 `pip install -r requirements-dev.txt` +
`pnpm install` 只要装不上就直接红，本地再查一遍环境没有新信息。

**第三条依据是"单一事实源"**：所有校验命令住在 `tools/ci/checklist.yml`，
`tools/ci/check_all.py` 只做"读清单 + 跑"，hooks 与 workflow 都只调它。
加一项校验 = 改 `checklist.yml` 一处。

### 目标形态

| 阶段      | 该有什么                                      | 不该有什么                       |
| --------- | --------------------------------------------- | -------------------------------- |
| dev       | 类型 / lint 的实时反馈（不阻塞）              | 任何门禁                         |
| commit    | 格式化改动过的文件（Py + 前端）+ 提交标题规范 | 全仓扫描                         |
| push      | 静态检查那批秒级项 + 机密扫描 + 日志回归      | 工具链检查、E2E、联网审计        |
| CI        | build、E2E、自证、依赖审计                    | 日志回归（**本地专用**，第七节） |
| deploy 后 | 打线上的 E2E                                  | —                                |

**两条通用的分流判据**（除"耗时"外的另外两条）：

- **要联网的检查不进 push**：`pnpm audit` / `pip-audit` 查外部漏洞库，
  网络抖动会变成"提交失败"——放 CI；
- **只对"本次改动"有意义的检查放 commit**：格式化、提交标题规范，
  改动多少处理多少，比全仓扫一遍快，且错误在提交前消失。

**`.githooks/` 下只有 Python 实现**（`pre-commit` / `pre-push` / `commit-msg`），
bash 版与 `.ps1` 全部删除——但**不是简单的"只留 py 扩展名"**：
hook 必须自己探测带 ruff 的解释器，否则每次都红（第六节 6.5）。

---

## 二、阶段 0 · 写代码

**你敲**：`pnpm web:dev`

它**一次起两段**（`web/scripts/dev.mjs`）：先构建，再同时起知识热重建与 Next。

| 文件                              | 是什么             | 干什么                                                                                                                 |
| --------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `web/scripts/dev.mjs`             | **dev 启动器**     | 顺序：① `build-knowledge` ② 并起 `build-knowledge --watch` 与 `next dev`。Ctrl+C 一起停                                |
| `web/scripts/build-knowledge.mjs` | 知识构建脚本       | 把引擎源码与人工经验拼成运行时的产物（见第四节）。**全是 `throw`**：规则缺字段、算子没注册、表达式编译不过，这里就报错 |
| `next dev`                        | Next.js 开发服务器 | 起热更新的网站                                                                                                         |

**另开一个终端**（可选，看类型错用）：`tsc --noEmit --watch`。

**热更新分两段**，`pnpm web:dev` 两段都拉起来了：

| 你改了                                                                                     | 谁负责                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `web/` 里的代码与站点内容（`.tsx` / `.css` / `content/**/*.mdx`）                          | Next 自己热更新（内容是运行期读盘，刷新即见）     |
| 知识真源（`knowledge/px4/rules/*.yaml`、`facts.yaml`、`knowledge/engine/operators.py` 等） | `build-knowledge --watch` 重建产物，Next 才看得到 |

> **起不来往往不是 Next.js 的问题，是知识库写错了。** 报错会直指哪个文件哪个字段。
> **没有的**：类型与 lint 的实时反馈。写错一个类型要等到 push 才被 `tsc` 拦下——
> 所以建议另开 `tsc --noEmit --watch`（增量 2s 级）。这一层**不阻塞**，不参与任何门禁。

`pnpm web:dev` 只开一半 / 单独开热重建：

```bash
pnpm --filter ./web dev:no-watch   # 构建 + next dev，不挂 watch
pnpm web:kb:watch     # 单独开着热重建（另开终端时用）
```

---

## 三、阶段 1 · 提交

**你敲**：`git commit -m "..."`

**跑这两个 hook**（`.githooks/` 下，**只处理你这次 staged 的文件**）：

| 文件                   | 是什么        | 干什么                                                                                                                                                                                         |
| ---------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.githooks/pre-commit` | 格式化 hook   | 对 staged 的 `.py` 跑 `ruff format` + `ruff check`；对 `.ts/.tsx/.js/.mjs/.css` 跑 `prettier --write`；对 `.ts/.tsx` 跑 `eslint --fix`。**改过的文件会自动重新 add**，所以提交的就是你刚看到的 |
| `.githooks/commit-msg` | 提交信息 hook | 检查标题是不是 `type(scope): 主题` 格式、是否 ≤72 字符                                                                                                                                         |

**耗时 2 秒**，基本无感。

- `ruff check` **刻意不加 `--fix`**：`knowledge/engine/` 是分片拼装的，自动修复会删东西。
- 绕开：`git commit --no-verify`。
- **为什么格式化放在 commit 而不是 push**：改动多少文件就只处理多少文件，
  比 push 时全仓扫一遍快得多；而且错误在提交前就消失，不至于攒到推送时一次性爆出来。

**lint 的位置**（已定口径）：

| 动作                         | 位置       | 说明                                                                                 |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `eslint --fix`               | **commit** | 只对 staged 的前端文件，自动改完重新暂存                                             |
| `ruff check --fix`           | **不加**   | 项目明令禁止（`pyproject.toml`：`knowledge/engine/` 是拼接片段，`--fix` 会误删东西） |
| `eslint`（全套，无 `--fix`） | **push**   | 需人判断的问题留给 push，有整段时间处理                                              |
| `ruff check`（全套）         | **push**   | 同上                                                                                 |

`eslint --fix` 能自动修的东西（格式类、可自动移除的冗余）与 prettier 同性质——
无争议、不用人判断，放 commit 是纯增量。而需人判断的（未使用变量、hook 依赖数组、
`no-undef`）留在 push，不必在"正在提交、思路已断"的瞬间被拦下。

> **注意**：`eslint --fix` 会改文件，个别规则可能改出没预期的语义变化
> （自动移除非必要断言、调整比较运算），而此刻正要提交、通常不会再读一遍 diff。
> 若日后发现某条 `--fix` 规则造成困扰，按规则关掉它，不要放弃整个 `--fix`。

**提交标题规范**（`.githooks/commit-msg`）：类型词从
`feat|fix|chore|docs|refactor|perf|style|test|build|ci|revert` 取，
格式 `type(scope): 描述`。**括号只认圆括号**，不用方括号
（`[^\]]+` 在 `sh` 与 Git 配置里都是转义地雷）。`merge:` 不是合法 type。

---

## 四、阶段 2 · 构建（dev 和 build 都跑）

**入口是 `web/scripts/build-knowledge.mjs`，它读源、生成产物。**

**读这些（真源 —— 你要改的是它们）：**

| 文件                            | 是什么                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge/engine/operators.py` | **算子注册表** —— 经验规则里的 `op:` 只能引用这里注册的算子                                                                      |
| `knowledge/engine/engine.py`    | **引擎本体** —— 两部分：规则框架（调度、求值表达式、调算子、发 finding）+ 报告数据层（抽时序、降采样、交给前端）。与日志格式无关 |
| `knowledge/px4/rules/*.yaml`    | **检查经验**：阈值与判定条件（工程师最常改这里）                                                                                 |
| `knowledge/px4/fault-kb.yaml`   | **故障知识库**                                                                                                                   |

**生成产物（不要手改，改了下次构建就覆盖）：**

| 产物                                           | 是什么                               |
| ---------------------------------------------- | ------------------------------------ |
| `web/workers/analysis-engine.generated.ts`     | 引擎的浏览器版（Pyodide 里跑的那份） |
| `web/workers/fault-kb.generated.json`          | 故障知识库的内联版                   |
| `knowledge/rules-editor-schema.generated.json` | 规则编辑器的 JSON Schema             |

`build-knowledge.mjs` 里全是 `throw`：规则必填字段、算子名是否注册、
`api.py` 常量表、`compute` 表达式能否编译、`guard_tags` 条件引用的名字是否存在。
**所以 dev 起不来往往不是 Next.js 的问题，是知识库写错了**——报错信息会直指哪个文件哪个字段。

**之后**：`next build` —— 真编译出生产产物。**144 秒**。

### 本地按需跑，CI 每次跑（已定）

| 位置 | 跑什么                                                              | 触发           |
| ---- | ------------------------------------------------------------------- | -------------- |
| 本地 | `pnpm web:build`（= `build:kb` + `next build`）                     | 手动，按需     |
| CI   | 只有 `next build`（清单里的 `next-build`，`when: args.with_build`） | 每次 push / PR |

**为什么本地按需**：`next build` 一次 144s，是 push 快检（26s）的 5.5 倍；
本地开发有 `pnpm web:dev` 与 `tsc --watch` 兜住类型与编译期错误。

**为什么 CI 每次跑**：CI 的 `ci` job 调 `check_all.py --build --ci`。
只跑 `next build` 而不走 `pnpm web:build` 是安全的——产物已入库，且 `build:kb --check`
会抓产物与 `knowledge/` 源的漂移，两个方向都有人守。

**实际调用点**（`.githooks/pre-push` 为 Python 版，三分支）：

| 调用点                | 实际参数                   | 是否跑 `next build`        |
| --------------------- | -------------------------- | -------------------------- |
| CI `ci.yml`           | `--build --ci`             | **每次跑**                 |
| pre-push 默认         | `--push`                   | **不跑**                   |
| `.githooks/` 其余开关 | 直接用 `check_all.py` 组合 | 由调用者决定               |
| CI `e2e.yml`          | `--build --e2e`            | 跑（CI 侧）                |
| 本地手动              | `check_all.py --build`     | 跑（显式选择，符合"按需"） |

`build` 是独立开关，**不并入 `--push` 与 `--ci`**。"谁点谁跑"由命令行开关表达。

清单给的 timeout 是 **300s**，对 144s 有 2 倍余量。**CI 机上比本机慢**，
若日后 build 被推过 300s，先看是不是这里被砍，**不要把 timeout 调大到失去意义**。

---

## 五、阶段 3 · 推送

**你敲**：`git push`

**跑 `check_all.py --push`，24 项检查，30~40 秒。**
（本机没有真实日志时是 23 项 —— 4 项日志回归会 SKIP）

清单定义在 `tools/ci/checklist.yml`（**单一事实源**），`check_all.py --list` 可打印全貌。
下表列出主要项：

| #   | 文件                                          | 是什么         | 干什么                                                                   | 耗时 |
| --- | --------------------------------------------- | -------------- | ------------------------------------------------------------------------ | ---- |
| 1   | `tools/common/check_secrets.py`               | 密钥扫描       | 有没有把密钥提交进去（扫全部跟踪文件，含 `.md`）                         | 1.3s |
| 2   | `ruff format --check`                         | Python 格式化  | 风格统一吗（**只认 `.py`**）                                             | 2s   |
| 3   | `ruff check`                                  | Python lint    | 有没有可疑写法                                                           | 1s   |
| 4   | `knowledge/engine/tests/`                     | 单元测试       | 算子与 CEL 表达式求值对不对                                              | 1.2s |
| 5   | `tools/engine/check_engine_pyodide.py`        | 产物校验       | 生成的产物是合法可执行的 Python 吗                                       | 1s   |
| 6   | `tools/engine/check_engine_purity.py`         | 纯净性守卫     | `knowledge/engine/` 还是纯 Python 吗                                     | 0.6s |
| 7   | `tools/common/check_pnpm_filter.py`           | 转发脚本守卫   | 每个 `pnpm --filter` 都命中真实项目吗                                    | 0.5s |
| 8   | `tsc --noEmit`                                | 类型检查       | TypeScript 类型对得上吗                                                  | 2s   |
| 9   | `prettier --check`                            | 前端格式化     | 前端风格统一吗                                                           | 3.7s |
| 10  | `eslint`                                      | JS lint        | JS 有没有可疑写法（只认 `.js`/`.mjs`，不含 `.ts`）                       | 3s   |
| 11  | `tools/common/check_hygiene.py`               | 元检查         | 校验机制自己还健康吗                                                     | 4.2s |
| 12  | `tools/engine/compare_baseline.py`            | 基线比对       | 改规则后结论还准吗（6 份日志逐字段比对）                                 | 3s   |
| 13  | `tools/engine/guard_provider_contract.py`     | 适配器契约     | 数据适配层契约还成立吗（逐份日志跑同一套断言）                           | 3s   |
| 14  | `tools/engine/run_engine.py --probe-data`     | 数据层自检     | 数据层结构自洽吗                                                         | 3s   |
| 15  | `tools/engine/check_rules_fields.py --strict` | 字段引用 lint  | 规则里引用的**字段名真实存在**吗                                         | 2s   |
| 16  | `tools/engine/guard_apm_parser_version.py`    | 解析器版本     | `.bin` 解析逻辑变了升 `parserVersion` 了吗                               | 0.5s |
| 17  | `tools/engine/guard_engine_names.py`          | 拼接命名守卫   | 片段拼进同一命名空间后有没有顶层名字被静默覆盖                           | 0.4s |
| 18  | `web/scripts/check-guide-mdx.mjs`             | MDX 可编译守卫 | `content/guide/` 的每份 `.mdx` 都能过编译吗                              | ~1s  |
| 19  | `web/scripts/check-site-settings.mjs`         | 站点设置守卫   | 后台改站点信息/密钥这套机制还在吗 + 首页静态化没被破坏（判据见脚本头部） | ~1s  |

**⚠ 第 12~15 项只在你的开发机跑。** 它们要真实 `.ulg` 日志，而原始日志含 GPS 轨迹、
**不入仓库**——云端 checkout 里没有，所以这四项在 CI 上必然跳过。

**后果：`CI 全绿 ≠ 回归过了`。**

**三条改造纪律**（已定）：

1. **去掉工具链检查**（`check_prereq`）——CI 里已由安装步骤保证，本地重复跑没有增量价值；
2. **E2E 移走**：CI 每次跑，本地要跑时 `WITH_E2E=1 git push`；
3. **日志回归留在本地**：`.ulg` 不入仓库，CI 里必然 SKIP，所以它哪儿也去不了。
   好在 4 项共 11s，秒级，留在 push 不影响"检查不卡进度"。

**改完后 push 阶段剩什么**：静态检查那批（格式化 / lint / 类型 / 单测 / 契约 / 元检查）

- 日志回归 4 项（11s）+ `check_secrets`，全部秒级。这才是"检查不卡进度"的形态。

---

## 六、阶段 4 · CI（推上去之后）

**入口**：`.github/workflows/` 下 **四个互相独立的 workflow**，各自一个 job、各自超时预算，
**并行、互不阻塞**。设计意图写在每个文件的头部注释里：谁慢谁独立，别让一条慢检查拖住其他。

| workflow     | 触发                                        | 调什么                       | job                | 超时   |
| ------------ | ------------------------------------------- | ---------------------------- | ------------------ | ------ |
| `ci.yml`     | `push`（master/main）、`pull_request`、手动 | `check_all.py --build --ci`  | `checks`           | 40 min |
| `e2e.yml`    | `push`（master/main）、手动                 | `check_all.py --build --e2e` | `playwright`       | 15 min |
| `mutate.yml` | `push`（master/main）、手动                 | `check_all.py --mutate`      | `guard-self-proof` | 40 min |
| `audit.yml`  | **仅手动**（`workflow_dispatch`）           | `check_all.py --audit`       | `audit`            | 10 min |

**四个文件都只做一件事**：装依赖（`./tools/setup/setup.sh`）→ 调 `check_all.py` 带对应开关。
**检查项本身一个都不写在这里**——要加检查就改 `tools/ci/checklist.yml`，CI 自动跟上。

### 6.1 `ci.yml` —— 质量门（默认关卡）

| 检查                               | 是什么                                      | 干什么                                             | 耗时     |
| ---------------------------------- | ------------------------------------------- | -------------------------------------------------- | -------- |
| `next-build`                       | 站点构建                                    | 真能编译出生产产物吗                               | 144s     |
| `build-kb-parity-clean`            | 产物一致性                                  | 干净 checkout 上，提交的产物与 `knowledge/` 一致吗 | 0.6s     |
| `check-skill-spec`                 | Skill 规范                                  | `web/content/skills/*/SKILL.md` 合规吗             | 0.4s     |
| `check-mcp-spec`                   | MCP 规范                                    | `web/content/mcp/*/server.json` 合规吗             | 0.3s     |
| `check-guide-mdx`                  | 指南 MDX                                    | 指南页还能编译吗                                   | 秒级     |
| `check-site-settings`              | 站点设置守卫                                | 11 条设置不变量还成立吗                            | 秒级     |
| `test-issue-filer`                 | **前端守卫集**                              | 23 节共 130 条不变量还成立吗（扫源码防回潮）       | 44s      |
| `playwright-smoke`                 | 路由冒烟                                    | 16 条关键路由还能渲染吗                            | 分钟级   |
| 其余 `when: [push, ci]` 的静态检查 | 格式化 / lint / 类型 / 单测 / 契约 / 元检查 | 见第八节分类表                                     | 合计秒级 |

**日志回归在这个 workflow 里是 SKIP，且有意的**（第九节）。
`ci.yml` 最后还挂了一个 `if: always()` 的 notice 步骤，专门提醒"CI 全绿 ≠ 全量回归通过"。

### 6.2 `e2e.yml` —— 全流程 E2E

| 检查                                   | 是什么         | 干什么                                      | 耗时    |
| -------------------------------------- | -------------- | ------------------------------------------- | ------- |
| `playwright-smoke`（`@smoke`）         | 路由冒烟       | 16 条关键路由（与 `ci.yml` 里同一批）       | 分钟级  |
| `playwright-analyze`（`log analysis`） | **全流程 E2E** | 上传 `.ulg` → Pyodide 解析 → 显示，整条链路 | 约 7min |

**为什么从 `ci.yml` 拆出来**：`playwright-analyze` 首跑要下 Pyodide WASM，7 分钟起步。
留在质量门里会把每次 PR 都拖慢，而它的失败信号（端侧分析链路断了）与静态检查是两类问题，
分开看反而更清楚。`e2e.yml` 只在 `push` 到 master/main 时跑，**不阻塞 PR**。

### 6.3 `mutate.yml` —— 守卫自证

| 检查            | 是什么         | 干什么                                              | 耗时     |
| --------------- | -------------- | --------------------------------------------------- | -------- |
| `mutate-guards` | **守卫自证机** | 74 条变异逐条注入，断言**恰好一条**守卫变红，再还原 | 约 26min |

**为什么单独一个 workflow**：74 条变异里 **34 条打在 `test-issue-filer`** 上
（约 45s × 34 ≈ 26min），单独一份才拿得到独立超时预算（40min），
不至于把 `ci.yml` 的 40min 挤爆。

**为什么自证必须有地方跑**：它此前只在带 `--mutate` 时触发，而没有任何阶段传这个开关——
等于**没人跑**。它红了意味着某条守卫已悄悄退化成恒绿，这是本项目栽过最多次的一类问题。

**它只在 `push` 到 master/main 时跑，不跑 PR**——26 分钟的门不适合卡每次提交。

### 6.4 `audit.yml` —— 依赖审计

| 检查         | 是什么          | 干什么                                    | 耗时 |
| ------------ | --------------- | ----------------------------------------- | ---- |
| `pip-audit`  | Python 依赖审计 | `requirements-dev.txt` 有已知漏洞吗       | 41s  |
| `pnpm-audit` | 前端依赖审计    | 前端依赖有已知漏洞吗（须带 `--registry`） | 7.4s |

**为什么仅手动**：依赖变更频率低，没必要每次 push 都跑。
需要时在 GitHub 仓库的 Actions 页面手动触发 `Audit`。

**为什么放 CI 不放 push**：它要联网查外部漏洞库，放 push 会让网络抖动变成"提交失败"。

**CI 不需要为 audit 配 registry**：本机跑 `pnpm audit` 会因 `~/.npmrc` 指向
npmmirror 而失败（该镜像无 audit 端点），但 **CI 未配 registry，默认走官方源**。
命令里仍显式带 `--registry` 是为了让本机与 CI 行为一致。

> ⚠️ **这三个 workflow 在 Gitee 上不会执行**：本仓主远端是 Gitee，GitHub 侧只作镜像。
> 详见 [`../operations/deploy.md`](../operations/deploy.md)。

---

## 七、阶段 5 · 部署

**入口**：`.github/workflows/deploy.yml`。CI 成功才发布，失败就不发。

| 步骤                            | 干什么                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| EdgeOne CLI                     | 从 `web/` 源码目录直接构建并部署（全栈模式，不由 CI 传产物）                                  |
| `web/playwright.live.config.ts` | **部署后打线上的全套 E2E**（含真实上传 `.ulg`）。它不启动本地 server，直接打 `SMOKE_BASE_URL` |

它验的是真实部署产物，本地与 CI 都替代不了，保持。

---

## 八、检查分类总表

按**检查什么**分类（不是按跑在哪）。

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

**原"前提"类（`check_prereq`）已删除**——CI 的 pip / pnpm 安装步骤已等价保证。

**"冒烟"与"E2E"的区别在本项目里是标签而非文件**：同一个 `playwright test` 跑全部，
`--grep @smoke` 只跑打了标签的少数几条。所以"冒烟覆盖够不够"取决于 `@smoke` 标在哪。

**四类检查的耗时是分档的关键**：

| 项                     | 耗时     | 后果                                       |
| ---------------------- | -------- | ------------------------------------------ |
| `test-issue-filer`     | 约 45s   | 不进 push；也是 `mutate_guards` 的主要靶子 |
| `next build`           | 144s     | 只在 `ci.yml` / `e2e.yml`                  |
| `mutate_guards`        | 约 26min | 独立 workflow（`mutate.yml`，超时 40min）  |
| 「上传 .ulg 完成分析」 | 约 420s  | `playwright-analyze` 单独一步、超时 900s   |

`mutate_guards` 26 分钟里大部分来自 `test-issue-filer`（74 条变异里 34 条打在它上面）。
若日后要压缩这条耗时，从减少打在它上面的变异数入手，而不是调小超时。

**超时预算的分配依据就是上表**：跑得越快越该待在早阶段（写代码 / 提交），
越慢越该往后退（独立 workflow），而不是给个更大的超时硬扛。

---

## 九、日志测试：只在本地跑

日志回归 4 项留在**本地**，`.ulg` **不提交仓库**，CI 里这 4 项**继续 SKIP**。

理由是纪律的直接结果：**「原始日志不上传服务器」**（原始日志含 GPS 轨迹与作业信息，
产品对用户的承诺），日志不入库，云端 checkout 里没有日志——不是配置问题。

**判据与事实一致**：`check_all.py` 的判据查日志目录下有没有 `.ulg` / `.bin`，
云端 checkout 里没有 → `has_logs=False` → 4 项 SKIP。**一个字都不用改。**
（早先的文档把它描述成"判据落点没跟着数据搬家"的 bug，**那个说法作废**。）

**谁能在这台机器以外跑这 4 项**：不能。新克隆的人需要自己备日志
（`tools/testdata/logs/` 里两个 `sample*` 是仓库自带的，其余需另下），
否则这 4 项会安静地 SKIP。**这是有意的行为，不是故障。**

### 9.1 连带影响（不改就会坏的四处）

1. **`--skip-logs` 必须留着**：换机器/CI 里没有日志时靠它跳过，而不是让 4 项报错。
2. **`ci.yml` 里这 4 项是 SKIP 而非删除**：删掉就看不出"本地该跑"这件事。
3. **冻结基线的判据不能依赖日志文件路径存在**：路径不存在时是 SKIP，不是 FAIL。
4. **文档里所有"跑一遍全量"的说法都要带前提**：本机有日志时才是全量。

### 9.2 冻结基线的硬约束

基线是「同输入 → 同结论」的回归锚点，因此：

- 引擎结论**变化必须是显式动作**（打新基线），不能因为重构而漂移；
- 基线文件入库，日志不入库——两者的生命周期不同，别混在一起删。

> 日志集怎么建、放哪、白名单怎么写，见 [`../knowledge/baselines.md`](../knowledge/baselines.md)。

### 9.3 两个同名但不同的 `sample.ulg`

`web/e2e/fixtures/sample.ulg`（**已入库**，921KB，真实日志，`e2e.yml` 用）与
`tools/testdata/logs/sample.ulg`（4.0MB，**不入库**，日志回归用）**是两个不同的文件**。
改任一个前先确认自己在改哪个。

⚠️ 因此「原始日志不入库」这条纪律**不能作为通用红线引用**——
它现在只对 `tools/testdata/logs/*.ulg` 成立，对 E2E fixture 已有例外
（用户 2026-09-22 裁决：来源为公开的 logs.px4.io 且已在库，接受继续入库）。

---

## 十、复测方式

```bash
python tools/ci/check_all.py --push              # 本地快检（推送时自动跑的同一套）
python tools/ci/check_all.py --push --skip-logs  # 同上，但跳过日志回归
python tools/ci/check_all.py --ci                # 云端那批（不含 E2E）
python tools/ci/check_all.py --build --ci        # 云端那批 + next build
python tools/ci/check_all.py --build --e2e       # 含 E2E
python tools/ci/check_all.py --list              # 打印清单，不执行
python tools/ci/mutate_guards.py --only <关键字>           # 单条自证
python tools/ci/mutate_guards.py --list                   # 看变异注册表
```

**`--e2e` 控制两条 E2E**：`playwright-smoke`（`--grep @smoke`，约 1~2min）
与 `playwright-analyze`（`--grep log analysis`，约 7min）。

**七个开关是平等的、可任意组合**：`--build` / `--commit` / `--push` / `--ci` / `--e2e` /
`--mutate` / `--audit`，不带任何开关时默认 `--build --commit --push --ci`。
**`--ci` 不含 `--build`**，所以 `ci.yml` 必须写 `--build --ci`，否则 `next build` 漏跑。

**`when` 是清单里每个 job 的触发条件数组**（`[build, push, ci, e2e, mutate, logs]`），
与命令行开关一一对应。`logs` 是唯一**自动**条件：本地存在 `.ulg`/`.bin` 时自动启用。

**自证必须单独跑**：跑单条要给足超时（`test-issue-filer` 一次 45s），
超时被硬杀会导致变异没还原——跑完务必 `git status` 确认无残留。

---

## 十一、其余脚本什么时候手动跑

| 文件                                  | 什么时候用                                                      |
| ------------------------------------- | --------------------------------------------------------------- |
| `tools/ci/check_all.py`               | 手动跑任意组合：`--push`；`--list` 看全貌                       |
| `tools/ci/check_all.ps1`              | 同上，PowerShell 包装（**Git hook 不会调它**，`.ps1` 只手动用） |
| `tools/common/check_prereq.py`        | 首次配环境时查工具链齐不齐（CI 装依赖就顶替了，不重复跑）       |
| `tools/engine/dump_baseline.py`       | **确认改规则是有意的**之后，重新打基线                          |
| `tools/dev/dump_px4log_fields.py`     | 查某份日志里有哪些字段（写规则时用）                            |
| `tools/engine/check_rules_compute.py` | 调单条规则，看它为什么命中/没命中                               |
| `tools/dev/dump_px4log_stats.py`      | 探某字段的统计分布（定阈值时用）                                |
| `web/scripts/fix-node-links.mjs`      | 批量修网站里的内部链接                                          |

**跑 E2E 的三个命令**（根层已全部转发，见 `package.json`；真源在 `web/package.json`）：

```bash
pnpm web:test:e2e:smoke   # 16 条关键路由（@smoke），分钟级
pnpm web:test:e2e:log     # 分析全流程，约 7min（首次要下 Pyodide WASM）
pnpm web:test:e2e         # 全量
```

> **别漏 `./`**：根 `package.json` 的转发脚本一律写 `pnpm --filter ./web`。
> `web` 是目录名不是包名（`web/package.json` 的 `name` 是 `nextpilot-skill-mcp`），
> 不带 `./` 时 pnpm 按包名匹配 → 匹配 0 个项目 → **rc=0、零输出、静默空跑**。
> 由 `check_pnpm_filter` 拦（第十三节）。

---

## 十二、三层守卫，别搞混

| 层             | 文件                                                                                           | 回答                                 |
| -------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------ |
| **单测**       | `knowledge/engine/tests/`                                                                      | 我写的这段逻辑对不对                 |
| **守卫**       | `test-issue-filer.mjs`（23 节）、`check_hygiene.py`（6 项）、`check-site-settings.mjs`（6 条） | 这个不变量还成立吗（扫源码防回潮）   |
| **守卫的自证** | `mutate_guards.py`（条数以 `--list` 为准）                                                     | 守卫**真的会红**吗，还是恒绿着当摆设 |

第三层是本项目最看重的：**一条永远不红的守卫比没有守卫更坏**，
因为它让人以为有人在看。所以每加一条守卫，就必须同时加一条能证明它会红的变异。

---

## 十三、几个坑

- **`pnpm` 是全局工具**，`web/node_modules/` 下没有它。
  清单里原先写 `{NODE} node_modules/pnpm/bin/pnpm.cjs` —— **那条路径不存在**，
  于是这一步在**任何机器上都恒红**（恒红与恒绿同样是"没有守卫"）。
- **`checklist.yml` 里 `{PNPM}` 是占位符，不是笔误**：与 `{NODE}` 一样走 PATH
  （`shutil.which("pnpm")`）。
- **本地 `pnpm audit` 必须带 `--registry=https://registry.npmjs.org/`**：
  本机 `~/.npmrc` 指向 npmmirror，那镜像没实现 audit 端点，不带就本机红、CI 绿。
- **根 `package.json` 的转发脚本必须写 `pnpm --filter ./web`**（带 `./`）：`web` 是**目录**
  不是包名（`web/package.json` 的 `name` 是 `nextpilot-skill-mcp`），不带 `./` 时 pnpm 按包名
  匹配 → 匹配 0 个项目 → **rc=0、零输出、静默空跑**。由 `check_pnpm_filter` 拦。
- **`check_secrets` 扫全仓**（含 `.md`）—— 文档里留一句假密钥同样会被抓。
- **`ruff` 只认 `.py`、`eslint` 只认 `.js`/`.mjs`**，都不看 Markdown 代码块。
- **`--grep` 匹配完整标题链**（`describe › test`），所以 grep `日志分析流程` 会命中整个
  describe 的 11 条，而不是"只跑那条 420s"。要精确只跑一条得用
  `--grep '上传 .ulg 并完成分析'`。同一类判据写错曾导致 `--grep-invert` 失效。
- **E2E 首次跑要 7 分钟**：Pyodide 要下 WASM + numpy + pyulog，别在前 2 分钟就以为卡死。
- **`pnpm web:dev` 会阻止第二个 dev server**：Next 16 按**目录**判重（不是按端口），
  同一目录已有 dev server 时会直接报错退出，换 `PORT` 没用。
- **站点内容不需要同步**：真源就在 `web/content/` 下（guide/skills/mcp，全部入库），
  运行期读盘，dev 下改完刷新即见。
- **`build-knowledge` 的产物里有一个落在 `knowledge/` 根**
  （`rules-editor-schema.generated.json`，2026-09 从 `knowledge/px4/` 挪出来的）。
  所以 `--watch` 只监听 `rules/`、`plot/`、`meta/`、`knowledge/llm/` 这些真源目录，
  并在监听顶层目录时按文件名滤掉 `*.generated.*` —— 否则写产物会触发自己、无限重建。
- **`pnpm add` 在本机会卡 20+ 分钟**（实测 21m52s，resolve 337 个包后只新增 1 个），
  期间零输出，容易被误判成卡死。安装时用后台任务跑。
- **`pnpm add` 会因 `ERR_PNPM_IGNORED_BUILDS` 报错但不影响装包**：这是 pnpm 的构建脚本审批机制
  （需 `pnpm approve-builds`），与所装的包无关。别当成安装失败而重装一遍。

### 13.1 hook 的解释器探测

`python` 不等同于"有 ruff 的 python"：本机 `python` 解析到托管 Python 3.13，
它没有 ruff；而 `check_all.py` 内部用 `sys.executable -m ruff` 跑格式化检查。
hook 若被托管 Python 启动，`sys.executable` 就是托管 Python，ruff 那一步直接
`No module named ruff`，**每次 push 都红**。所以 hook 必须自己探测解释器，不能靠 shebang。

探测的三条约束：

1. **优先 anaconda，回退 PATH 上的 `python`**。顺序不能反——托管 Python 恰好排在 PATH 前面，反了等于没探测。
2. **探测不到时按需 `re-exec`**：若 `sys.executable` 不是选中的那个、且 hook 是被 Python 启动的，用 `os.execv` 换到选中的解释器重跑自己（加环境变量哨兵防无限递归）。
3. **`exit 127` 是逃生门**：两个候选都不可用时打印明确的"缺什么"再 `exit 127`，由 Git 放行。hook 的职责是提醒，不是把人锁在门外。

候选顺序写死，不读配置文件——多一个事实源就多一处会腐烂。

**Windows 上 Git 用 `/bin/sh` 启动 hook，脚本里一律用 `/` 分隔符**，反斜杠会被 sh 当转义符吃掉。

**hook 的变异锚点一律用单行**：`mutate_guards._apply` 按字节读写，工作区里 hook 是 CRLF，
多行锚点里写 `\n` 一个都匹配不到，会报 `anchor mismatch`。

一条同类教训：守卫的第一版正则写成了 `with_[a-z_]+`，而开关名是 `with_e2e`，
`[a-z_]+` 匹配不到数字 `2`，于是在真实 bug 上跑它报 `OK`。
**一条永远不红的守卫比没有守卫更坏**，因为它还让人以为有人在看。

---

## 附 · 想再往下挖

| 想找什么                           | 去哪                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------- |
| 校验命令的**定义**（唯一事实源）   | [`../../tools/ci/checklist.yml`](../../../tools/ci/checklist.yml)         |
| 写代码时的风格要求                 | [`../style.md`](../style.md)                                              |
| 本地开发、部署、环境变量、故障排查 | [`../operations/README.md`](../operations/README.md)                      |
| 基线日志怎么入库、CI 怎么用        | [`../knowledge/baselines.md`](../knowledge/baselines.md)                  |
| 引擎实现细节                       | [`../../knowledge/engine/README.md`](../../../knowledge/engine/README.md) |
| 怎么**写**一条检查规则             | 网站 `/guide/rule-schema`                                                 |
