# 开发流程：每个阶段跑什么

**一阶段一个方块。** 每个文件一行，说清「是什么、干什么」。

从你敲下命令到代码上线，一共六个阶段。**大部分时候你什么都不用跑**，门禁是自动的。

---

## 阶段 0 · 写代码

**你敲**：`pnpm dev`

它**一次起两段**（`web/scripts/dev.mjs`）：先构建，再同时起知识热重建与 Next。

| 文件                              | 是什么             | 干什么                                                                                                                 |
| --------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `web/scripts/dev.mjs`             | **dev 启动器**     | 顺序：① `build-knowledge` ② 并起 `build-knowledge --watch` 与 `next dev`。Ctrl+C 一起停                                |
| `web/scripts/build-knowledge.mjs` | 知识构建脚本       | 把引擎源码与人工经验拼成运行时的产物（见阶段 2）。**全是 `throw`**：规则缺字段、算子没注册、表达式编译不过，这里就报错 |
| `next dev`                        | Next.js 开发服务器 | 起热更新的网站                                                                                                         |

**另开一个终端**（可选，看类型错用）：`tsc --noEmit --watch`。

**热更新分两段**，`pnpm dev` 两段都拉起来了：

| 你改了                                                                                     | 谁负责                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `web/` 里的代码与站点内容（`.tsx` / `.css` / `content/**/*.mdx`）                          | Next 自己热更新（内容是运行期读盘，刷新即见）     |
| 知识真源（`knowledge/px4/rules/*.yaml`、`facts.yaml`、`knowledge/engine/operators.py` 等） | `build-knowledge --watch` 重建产物，Next 才看得到 |

> **只想开一半**：`pnpm dev:no-watch` —— 构建 + `next dev`，不挂 watch。
> **单独开着热重建**：`pnpm web:kb:watch`（另开终端时用）。
>
> **起不来往往不是 Next.js 的问题，是知识库写错了。** 报错会直指哪个文件哪个字段。
> watch 模式下写坏了不会退出，改对了下次存盘自动重建。

---

## 阶段 1 · 提交

**你敲**：`git commit -m "..."`

**跑这两个 hook**（`.githooks/` 下，**只处理你这次 staged 的文件**）：

| 文件                   | 是什么        | 干什么                                                                                                                                                                                         |
| ---------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.githooks/pre-commit` | 格式化 hook   | 对 staged 的 `.py` 跑 `ruff format` + `ruff check`；对 `.ts/.tsx/.js/.mjs/.css` 跑 `prettier --write`；对 `.ts/.tsx` 跑 `eslint --fix`。**改过的文件会自动重新 add**，所以提交的就是你刚看到的 |
| `.githooks/commit-msg` | 提交信息 hook | 检查标题是不是 `type(scope): 主题` 格式、是否 ≤72 字符                                                                                                                                         |

**耗时 2 秒**，基本无感。

> - `ruff check` **刻意不加 `--fix`**：`knowledge/engine/` 是分片拼装的，自动修复会删东西。
> - 绕开：`git commit --no-verify`。

---

## 阶段 2 · 构建（dev 和 build 都跑）

**入口是 `web/scripts/build-knowledge.mjs`，它读 5 份源、生成 4 份产物。**

**读这些（真源 —— 你要改的是它们）：**

| 文件                            | 是什么                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge/engine/operators.py` | **算子注册表** —— 经验规则里的 `op:` 只能引用这里注册的算子                                                                      |
| `knowledge/engine/engine.py`    | **引擎本体** —— 两部分：规则框架（调度、求值表达式、调算子、发 finding）+ 报告数据层（抽时序、降采样、交给前端）。与日志格式无关 |

| `knowledge/px4/rules/*.yaml` | **检查经验**：阈值与判定条件（工程师最常改这里） |
| `knowledge/px4/fault-kb.yaml` | **故障知识库** |

**生成这 4 份产物（不要手改，改了下次构建就覆盖）：**

| 产物                                           | 是什么                               |
| ---------------------------------------------- | ------------------------------------ |
| `web/workers/analysis-engine.generated.ts`     | 引擎的浏览器版（Pyodide 里跑的那份） |
| `web/workers/fault-kb.generated.json`          | 故障知识库的内联版                   |
| `knowledge/rules-editor-schema.generated.json` | 规则编辑器的 JSON Schema             |

**之后**：`next build` —— 真编译出生产产物。**144 秒**。

---

## 阶段 3 · 推送

**你敲**：`git push`

**跑 `check_all.py --stage push`，27 项检查，30~40 秒。**（本机没有真实日志时是 23 项 —— 4 项日志回归会 SKIP）
清单定义在 `tools/ci/checklist.yml`（**单一事实源，改检查只改这里**），`check_all.py --list-stages` 可打印全貌。
下表列出的是主要项。

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

**三种姿势：**

```bash
git push                # 只跑上面这 27 项（默认）
WITH_E2E=1 git push     # 连 CI 那批一起跑（+5~7min）
FULL_PUSH=1 git push    # 和 CI 一样全（+144s 的 next build）
```

---

## 阶段 4 · CI（推上去之后）

**入口**：`.github/workflows/ci.yml`，两个 job **并行**跑。

**job 1 `checks` → 10 项：**

| 文件                                        | 是什么          | 干什么                                                 | 耗时    |
| ------------------------------------------- | --------------- | ------------------------------------------------------ | ------- |
| `next build`                                | 站点构建        | 真能编译出生产产物吗                                   | 144s    |
| `web/scripts/build-knowledge.mjs --check`   | 产物一致性      | 提交的产物与 `knowledge/` 源还一致吗                   | 0.6s    |
| `web/scripts/check-skill-spec.mjs`          | Skill 规范检查  | `web/content/skills/*/SKILL.md` 合规吗（自带反例自检） | 0.4s    |
| `web/scripts/check-mcp-spec.mjs`            | MCP 规范检查    | `web/content/mcp/*/server.json` 合规吗（自带反例自检） | 0.3s    |
| `web/scripts/test-issue-filer.mjs`          | **前端守卫集**  | 21 节共 131 条不变量还成立吗（扫源码防回潮）           | 44s     |
| `pip-audit`                                 | Python 依赖审计 | `requirements-dev.txt` 里的依赖有已知漏洞吗            | 41s     |
| `pnpm audit`                                | 前端依赖审计    | 前端依赖有已知漏洞吗（须带 `--registry`）              | 7.4s    |
| `web/e2e/pages.spec.ts`（`@smoke`）         | 路由冒烟        | 16 条关键路由还能渲染吗                                | 分钟级  |
| `web/e2e/analyze.spec.ts`（`日志分析流程`） | **全流程 E2E**  | 上传 `.ulg` → Pyodide 解析 → 显示，整条链路            | 约 7min |

**job 2 `guard-self-proof` → 1 项：**

| 文件                        | 是什么         | 干什么                                              | 耗时     |
| --------------------------- | -------------- | --------------------------------------------------- | -------- |
| `tools/ci/mutate_guards.py` | **守卫自证机** | 74 条变异逐条注入，断言**恰好一条**守卫变红，再还原 | 约 26min |

> **为什么单独一个 job**：34 条变异打在 `test-issue-filer` 上（约 45s × 34），
> 和主 job 并行才各有独立超时预算。

---

## 阶段 5 · 部署（CI 通过后）

**入口**：`.github/workflows/deploy.yml`。CI 成功才发布，失败就不发。

| 步骤                            | 干什么                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| EdgeOne CLI                     | 从 `web/` 源码目录直接构建并部署（全栈模式，不由 CI 传产物）                                  |
| `web/playwright.live.config.ts` | **部署后打线上的全套 E2E**（含真实上传 `.ulg`）。它不启动本地 server，直接打 `SMOKE_BASE_URL` |

---

## 附 · 其余脚本什么时候手动跑

| 文件                                  | 什么时候用                                                      |
| ------------------------------------- | --------------------------------------------------------------- |
| `tools/ci/check_all.py`               | 手动跑任意阶段：`--stage push`；`--list-stages` 看全貌          |
| `tools/ci/check_all.ps1`              | 同上，PowerShell 包装（**Git hook 不会调它**，`.ps1` 只手动用） |
| `tools/common/check_prereq.py`        | 首次配环境时查工具链齐不齐（CI 装依赖就顶替了，不重复跑）       |
| `tools/engine/dump_baseline.py`       | **确认改规则是有意的**之后，重新打基线                          |
| `tools/dev/dump_px4log_fields.py`     | 查某份日志里有哪些字段（写规则时用）                            |
| `tools/engine/check_rules_compute.py` | 调单条规则，看它为什么命中/没命中                               |
| `tools/dev/dump_px4log_stats.py`      | 探某字段的统计分布（定阈值时用）                                |
| `web/scripts/fix-node-links.mjs`      | 批量修网站里的内部链接                                          |

**跑 E2E 的三个命令：**

```bash
pnpm test:e2e:smoke      # 16 条关键路由，分钟级
pnpm test:e2e:log    # 分析全流程，约 7min（首次要下 Pyodide WASM）
pnpm test:e2e            # 全量 42 条
```

---

## 附 · 三层守卫，别搞混

| 层             | 文件                                                                                           | 回答                                 |
| -------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------ |
| **单测**       | `knowledge/engine/tests/`                                                                      | 我写的这段逻辑对不对                 |
| **守卫**       | `test-issue-filer.mjs`（23 节）、`check_hygiene.py`（6 项）、`check-site-settings.mjs`（6 条） | 这个不变量还成立吗（扫源码防回潮）   |
| **守卫的自证** | `mutate_guards.py`（74 条，条数以 `--list` 为准）                                              | 守卫**真的会红**吗，还是恒绿着当摆设 |

第三层是本项目最看重的：**一条永远不红的守卫比没有守卫更坏**，
因为它让人以为有人在看。所以每加一条守卫，就必须同时加一条能证明它会红的变异。

---

## 附 · 几个坑

- **站点内容不需要同步**：真源就在 `web/content/` 下（guide/skills/mcp，全部入库），
  运行期读盘，dev 下改完刷新即见。以前那段 `sync-content --watch` 已随真源唯一化退役。
- **知识真源由 `build-knowledge --watch` 负责重建**（`pnpm dev` 已带上）。同样地，用
  `pnpm dev:no-watch` 时改 `knowledge/px4/` 或 `knowledge/engine/` 后页面不会变，要另开 `pnpm web:kb:watch`。
- **`build-knowledge` 的产物里有一个落在 `knowledge/` 根**（`rules-editor-schema.generated.json`，
  2026-09 从 `knowledge/px4/` 挪出来的）。
  所以 `--watch` 只监听 `rules/`、`plot/`、`meta/`、`knowledge/llm/` 这些真源目录，
  并在监听顶层目录时按文件名滤掉 `*.generated.*` —— 否则写产物会触发自己、无限重建。
- **`pnpm dev` 会阻止第二个 dev server**：Next 16 按**目录**判重（不是按端口），
  同一目录已有 dev server 时会直接报错退出，换 `PORT` 没用。
- **两份同名的 `sample.ulg`**：`tools/testdata/logs/sample.ulg`（4.0MB，**不入库**，
  日志回归用）vs `web/e2e/fixtures/sample.ulg`（921KB，**已入库**，CI 的 E2E 用）。
- **`check_secrets` 扫全仓**（含 `.md`）—— 文档里留一句假密钥同样会被抓。
- **`ruff` 只认 `.py`、`eslint` 只认 `.js`/`.mjs`**，都不看 Markdown 代码块。
- **本地 `pnpm audit` 必须带 `--registry=https://registry.npmjs.org/`**：
  本机 `~/.npmrc` 指向 npmmirror，那镜像没实现 audit 端点，不带就本机红、CI 绿。
- **`pnpm` 是全局工具**，`web/node_modules/` 下没有它。
- **根 `package.json` 的转发脚本必须写 `pnpm --filter ./web`**（带 `./`）：`web` 是**目录**
  不是包名（`web/package.json` 的 `name` 是 `nextpilot-skill-mcp`），不带 `./` 时 pnpm 按包名
  匹配 → 匹配 0 个项目 → **rc=0、零输出、静默空跑**。由 `check_pnpm_filter` 拦。
- **E2E 首次跑要 7 分钟**：Pyodide 要下 WASM + numpy + pyulog，别在前 2 分钟就以为卡死。
- **`--with-e2e` 与 `--stage` 是两个维度**：前者控制阶段内的步骤，后者控制跑哪些阶段。
  从阶段列表反推开关会静默失效。

---

## 附 · 想再往下挖

| 想找什么                           | 去哪                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------- |
| 为什么这样分档、各项完整实测档案   | [`checks-by-stage.md`](checks-by-stage.md)                                |
| 校验命令的**定义**（唯一事实源）   | [`../../tools/ci/checklist.yml`](../../../tools/ci/checklist.yml)         |
| 本地开发、部署、环境变量、故障排查 | [`operations/README.md`](../operations/README.md)                         |
| 引擎实现细节                       | [`../../knowledge/engine/README.md`](../../../knowledge/engine/README.md) |
| 怎么**写**一条检查规则             | 网站 `/guide/rule-schema`                                                 |
