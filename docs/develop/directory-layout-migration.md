# 目录布局迁移方案（web/ → 仓库根 + src/）

> 状态：**已搁置（2026-09-23 决定维持现状，不执行）**。
> 本文件保留作**决策记录 + 现状风险清单**；§2 起的迁移步骤**不要照着执行**，
> 除非重新走完 §0.2 的三项前置确认（那三项本地与 CI 都验证不了）。
> 原动机：项目太乱 —— Python 与 web 混着、配置文件在 `web/` 一份、仓库根一份。

---

## 0. 决定：维持现状

评估后决定**不迁移**，保留 `web/` 子目录。理由：改动面（4 份配置合并、CI、
`tools/ci/mutate_guards.py` 29 处字面量、EdgeOne 控制台）大于当期收益，
且有两项前置条件只能在生产部署时才能看见结果。

### 0.1 维持现状仍需记住的事（调研结论与迁移与否无关，现状下同样成立）

1. 根 `package.json`（`pnpm -C web` 转发壳）与根 `pnpm-lock.yaml`（零依赖空壳）
   是**影子，不是第二套配置**。改依赖只在 `web/` 改 —— **别往根 `package.json` 加依赖**。
2. 根 `.gitignore` 含 `/pnpm-lock.yaml` 是**有意为之**（真 lockfile 在 `web/`），
   不是遗漏，不要"顺手删掉"。
3. `public/` 只能在项目根 —— Next 源码 `path.join(dir,'public')`。
   现状即 `web/public/`，正确；**不存在 `src/public` 这个位置**。
4. `web/app/` 已存在，`findDir` 优先 `./app` 再 `./src/app`。
   所以**不要新建 `web/src/app`** —— 它会被静默忽略，不报错。
5. `tools/testdata/logs/*.ulg` 含 GPS 轨迹，靠"在 `web/` 之外"物理隔离。
   **不要把这些日志移进 `web/`**，也不要把 EdgeOne 的上传范围放宽到仓库根。
6. `web/lib/content-dir.ts` 是运行期 `process.cwd()/content`。
   任何改变进程 cwd 的调整都会让内容**静默变空**（指南 0 篇 / Skill 0 个），不报错。

### 0.2 若将来重新考虑迁移，必须先确认（都不在 Git 里）

1. EdgeOne 控制台的「构建根目录」是否指向 `web/` —— 不同步改就是部署挂、CI 全绿。
2. EdgeOne CLI 上传是否严格遵循 `.gitignore` —— 不遵循要补 `.edgeoneignore`
   （否则含 GPS 的 `.ulg` 可能进部署包，此类事故不可撤回）。
3. `functions/`（EdgeOne 边缘函数）能否移入 `src/` —— 本地无法验证。

---

## 1. 「乱」在哪（实测，不是印象）

### 1.1 配置文件双份

| 文件                                 | 仓库根                     | `web/`                  | 说明              |
| ------------------------------------ | -------------------------- | ----------------------- | ----------------- |
| `.gitignore`                         | 有（118 行）               | 有（13 行，是根的子集） | 需人工合并        |
| `.prettierignore`                    | 有                         | 有                      | 需人工合并        |
| `package.json`                       | 有（`pnpm -C web` 转发壳） | 有（真依赖）            | 合并成一份        |
| `pnpm-lock.yaml`                     | 有（零依赖空壳）           | 有（真 lockfile）       | 合并成一份        |
| `.markdownlintignore`                | 有                         | 无                      | —                 |
| `.markdownlint.json` / `.prettierrc` | 无                         | 有                      | lint 配置在子目录 |

> ⚠️ **上表已过时（2026-09-23）**：`.prettierrc` 与 `.markdownlint.json` 已各自合并到仓库根
> （后者随之改名 `.markdownlint.jsonc`），`web/` 下的两份已删。这两步是**脱离本方案单独执行**的
> —— 因为"配置只对 `web/` 生效、其余目录落回默认"会持续造成来回改的假报错，等不到大迁移。
> 本文档其余部分**仍然搁置，不要照着执行**；变更依据见 `checks-by-stage.md` 的同名注记。

### 1.2 两套工具链分居两处

- Python：`pyproject.toml` / `requirements-dev.txt` / `pyrightconfig.json` 在根
- Node：`package.json` / `tsconfig.json` / `next.config.ts` / `eslint.config.mjs` 在 `web/`

于是任何跨两侧的操作（`pnpm build:kb` 要读 `engine/` 与 `knowledge/`）都得靠 `../..`
这类相对路径跨层，见第 4 节那张表 —— 这一层间接就是本次要消掉的。

---

## 2. 目标结构

```text
nextpilot-skill-mcp/
├── src/                    ← TS 世界（Next.js 应用源码）
│   ├── app/                  路由（layout / page / route）
│   ├── components/
│   ├── content/              站点内容（guide 入库；skills/mcp 构建期从 knowledge/ 拷入）
│   ├── e2e/
│   ├── hooks/
│   ├── i18n/
│   ├── lib/
│   ├── messages/
│   ├── scripts/              构建脚本（build-knowledge / sync-content / 守卫自测）
│   ├── types/
│   └── workers/
├── public/                 ← 必须留根，见 §3.1
├── functions/              ← EdgeOne 边缘函数，建议留根，见 §3.2
├── engine/                 ← 不动（Python 确定性引擎，浏览器与服务端共用一份）
├── knowledge/              ← 不动（单一事实源）
├── tools/                  ← 不动（内部路径常量要改，见 §4.3）
├── docs/                   ← 不动（内容要更新，见 §7 阶段 5）
└── 根配置（合并成一套）
    package.json  pnpm-lock.yaml  pnpm-workspace.yaml  tsconfig.json
    next.config.ts  eslint.config.mjs  postcss.config.mjs
    playwright.config.ts  playwright.live.config.ts
    auth.ts  proxy.ts  next-env.d.ts
    .env  .env.example  .gitignore  .prettierrc  .prettierignore  .markdownlint.json
    pyproject.toml  requirements-dev.txt  pyrightconfig.json
```

`engine/` / `knowledge/` / `tools/` 三者不动，是本方案的**主要收益**：它们不涉及
Node 工具链，动了只会多改一堆路径而没有新收益。

### 2.1 配置归属判据（为什么最后是「一套」）

> **配置放在「覆盖它所需作用域的最小共同祖先」上。**
> 同名配置若出现两份，必须满足「下层是上层的增量，且由工具链强制要求」，否则合并。

本项目：1 个部署单元（`deploy.yml` 只上传一个源码目录、由 EdgeOne CLI 自构建）

- 1 个 Node 包 ⇒ Node 配置与 Python 配置各只有一份，且都在仓库根。

### 2.2 参照：Langfuse 的两套配置，为什么不叫「乱」

实测（GitHub API，`langfuse/langfuse@main`，2026-09-23）：

| 文件                                                      | 仓库根                 | `web/`                            | 判定                                                   |
| --------------------------------------------------------- | ---------------------- | --------------------------------- | ------------------------------------------------------ |
| `package.json`                                            | 有（workspace 编排）   | 有                                | **不重复** —— pnpm workspace 要求每个 package 各有一份 |
| `prettier.config.cjs`                                     | `trailingComma: "all"` | 仅 `plugins: [tailwindcss]`       | **不重叠** —— 各管各的                                 |
| `.gitignore`                                              | 有（1704 B）           | 有，**仅 3 行**（storybook 产物） | **不重复** —— 不是根的副本                             |
| `tsconfig.json` / `eslint.config.mjs` / `next.config.mjs` | 无                     | 有                                | 包自身的事                                             |
| `turbo.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml`   | 有                     | 无                                | 编排层的事                                             |

分层是清楚的：**根管跨包编排，`web/` 管包自身**。同名文件出现两次是 workspace 的
必然，不是脏。

**本项目与之的关键差异**：Langfuse 每个 package 必须有自己的 `package.json`，是
工具链强制；本项目根的 `package.json`（`pnpm -C web` 转发壳）与 `pnpm-lock.yaml`
（零依赖空壳）**没有任何独立职责**，纯粹是「`web/` 在子目录」这个事实逼出来的影子。
影子应删除，不是合并。

补充一个技术点，避免误学：Prettier 配置自被格式化文件所在位置向上查找，
**找到第一个即停，不合并** —— 官方文档原话
"searching up the file tree until a config file is (or isn't) found"。
所以 Langfuse 的 `web/` 那份是**覆盖**根那份，两者恰好一致属于巧合，不是机制保证。
本项目不应引入这种双份。

### 2.3 建议新增一条守卫（待实施）

规则：仓库内同名配置文件只允许出现一次，白名单除外。

- 白名单需要**先枚举再定**：实施时先跑一次「列出所有同名配置文件」，逐个判定是否
  属于工具链强制（如未来引入 workspace 后的子包 `package.json`），再入白名单。
- 这条守卫必须按 CLAUDE.md §6.6 自证：故意在子目录新建一个 `tsconfig.json`，断言守卫变红。

---

## 3. 三条硬约束（附依据，不是印象）

### 3.1 `public/` 必须在项目根

`next/dist/build/index.js:626`：

```js
const publicDir = path.join(dir, "public");
```

只认根级 `public`，**不存在 `src/public` 这个位置**。所以 `public/`（`sw.js`、
`params/px4-main.json`）留在根。

连带一处：`build-knowledge.mjs` L1768/L1770 把参数字典写进
`webRoot/public/params/`，迁移后必须改成**根**的 `public/params/`，不是 `src/public/`。

### 3.2 `functions/` 能否进 `src/` —— 待确认，保守留根

`functions/` 是 EdgeOne Pages 的边缘函数目录（`functions/api/x.js` → `/api/x`），
不由 Next.js 管。EdgeOne 的目录约定本地无法验证，**开工前必须查官方文档或用一个
预览环境试一次**。

本方案按**留根**编写：它是部署单元的一部分，与 `public/` 同级，语义上也与"应用源码"
不同。若实测确认支持 `src/functions`，再挪，改动只涉及 §4 里 `check_*` 脚本的路径。

### 3.3 Next.js 的 `src` 判定

`next/dist/lib/find-pages-dir.js`：

```js
function findDir(dir, name) {
    // prioritize ./${name} over ./src/${name}
    let curDir = path.join(dir, name);
    if (existsSync(curDir)) return curDir;
    curDir = path.join(dir, 'src', name);
    ...
}
```

根有 `app/` 就用根的，根没有才用 `src/app`。本方案根目录**不放** `app/`，
所以 `src/app` 会被正常识别 —— 也不会留下"将来有人建 `src/app` 被静默忽略"的坑
（那正是根 `app/` + `src/` 方案的隐患）。

---

## 4. 必改的代码点

### 4.1 构建脚本（`src/scripts/`，5 处文件）

| 文件                       | 现状                                                               | 改成                                                     |
| -------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| `build-knowledge.mjs`      | `webRoot = resolve(here,"..")`                                     | 新增 `repoRoot = resolve(here,"../..")`                  |
| 同上 L54                   | `KN = resolve(webRoot,"../knowledge/px4")`                         | `resolve(repoRoot,"knowledge/px4")`                      |
| 同上 L56                   | `ENGINE = resolve(webRoot,"../engine")`                            | `resolve(repoRoot,"engine")`                             |
| 同上 L74                   | `GUIDES_DIR = resolve(webRoot,"content/guide")`                    | `resolve(repoRoot,"src/content/guide")`                  |
| 同上 L1499                 | `outWorkers = resolve(webRoot,"workers")`                          | `resolve(repoRoot,"src/workers")`                        |
| 同上 L1690/L1710/L1742     | `resolve(webRoot,"lib/knowledge/…")`                               | `resolve(repoRoot,"src/lib/knowledge/…")`                |
| 同上 L1768/L1770           | `resolve(webRoot,"public/params/…")`                               | `resolve(repoRoot,"public/params/…")` ← **根，不是 src** |
| 同上 L1829                 | `resolve(webRoot,"scripts/lib")`                                   | `resolve(repoRoot,"src/scripts/lib")`                    |
| `sync-content.mjs` L20-21  | `repoRoot=resolve(webRoot,"..")`、`OUT=resolve(webRoot,"content")` | `repoRoot=resolve(here,"../..")`、OUT → `src/content`    |
| `check-skill-spec.mjs` L43 | `repoRoot = resolve(webRoot,"..")`                                 | `resolve(here,"../..")`                                  |
| `check-mcp-spec.mjs` L39   | 同上                                                               | 同上                                                     |

### 4.2 运行期路径（最容易静默失效）

| 文件                                    | 现状                                                   | 改成                                       | 失效形态                                                             |
| --------------------------------------- | ------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------- |
| `src/lib/content-dir.ts` L11            | `path.join(process.cwd(),"content")`                   | `path.join(process.cwd(),"src","content")` | **静默**：指南 0 篇、Skill 0 个，不报错                              |
| `next.config.ts` L68-70                 | `outputFileTracingIncludes: {"/**": ["./content/**"]}` | `["./src/content/**"]`                     | 切 standalone 时部署包无内容（注释里已写明是静默失效）               |
| `next.config.ts` L61-63                 | `turbopack: { root: process.cwd() }`                   | **可删**                                   | 该 workaround 是为"根有空 lockfile 与 web/ 撞车"而加；迁移后冲突消失 |
| `tsconfig.json` L22                     | `"@/*": ["./*"]`                                       | `["./src/*"]`                              | 全部 `@/` 导入解析失败（`tsc` 会红，不静默）                         |
| `playwright.config.ts` L7               | `testDir: "./e2e"`                                     | `"./src/e2e"`                              | E2E 报"未找到测试"                                                   |
| `eslint.config.mjs`                     | 自查 ignores / files 里的 `web` 字样                   | —                                          | —                                                                    |
| `src/app/edge-dev/[[...path]]/route.ts` | 自查是否有 `web/functions` 路径                        | —                                          | dev 下 /api 垫片 404                                                 |

### 4.3 Python 与 CI（`tools/`、`tools/ci/`）

| 文件                                                | 引用点                                                                        | 改成                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------- |
| `tools/px4log_engine_runner.py`                     | `ENGINE = REPO_ROOT/"engine"`                                                 | 不变（引擎不动）                    |
| 同上                                                | `FAULT_KB_JSON` / `CHECK_SCRIPT` = `REPO_ROOT/"web"/"workers"/…`              | `REPO_ROOT/"src"/"workers"/…`       |
| `tools/engine/check_engine_pyodide.py`              | `TS` / `FAULT_KB` / `data_ts` / `worker_src` 四处 `REPO_ROOT/"web"/"workers"` | 同上                                |
| `tools/ci/checklist.yml`                            | `{WEB}` 占位（9 处）                                                          | `{ROOT}`，或新增 `{SRC}` = ROOT/src |
| `tools/ci/check_all.py`                             | 2 处 `web/`                                                                   | 相应路径                            |
| `tools/engine/check_engine_purity.py`               | 3 处                                                                          | 同上                                |
| `tools/common/check_hygiene.py`                     | 7 处                                                                          | 同上                                |
| `tools/common/check_prereq.py` / `check_secrets.py` | 2 + 4 处                                                                      | 同上                                |
| **`tools/ci/mutate_guards.py`**                     | **29 处**                                                                     | ⚠ 见 §8.2                           |
| `web/scripts/browser/*.mjs` 等                      | 3 处                                                                          | 同上                                |

### 4.4 GitHub Actions

| 文件                                           | 现状                                        | 改成                                |
| ---------------------------------------------- | ------------------------------------------- | ----------------------------------- |
| `.github/workflows/ci.yml` L53、L107           | `cache-dependency-path: web/pnpm-lock.yaml` | `pnpm-lock.yaml`                    |
| 同上 L60、L67、L113                            | `working-directory: web`                    | 删（cwd 已是根）                    |
| `.github/workflows/deploy.yml` L93、L111、L150 | `working-directory: web`                    | 删（`edgeone pages deploy` 从根跑） |

### 4.5 `.gitignore`：两个隐蔽点

1. **必须删除** `/pnpm-lock.yaml`（L58-59，注释写着"仓库根是零依赖空壳，不入库"）。
   迁移后真 lockfile 就在根，留着这行 → lockfile 不入库 → CI 的
   `pnpm install --frozen-lockfile` 直接挂。
2. 合并 `web/.gitignore` 的条目（是根的子集：`node_modules` / `.next` / `out` /
   `.env` / `.env*.local` / `*.log` / `.DS_Store` / `.vercel` / `.edgeone` /
   `playwright-report` / `test-results`）。根已有等价规则，核对后保留根那份即可。
3. `.env` 已有忽略规则，迁移后**逐条确认 `.env` 仍是 ignored**（密钥进仓库是红线）。

---

## 5. 配置合并：合并，不覆盖

| 根文件                                                           | web 文件                                                                                                                                                                                                                                      | 处理                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `package.json`（转发壳）                                         | `package.json`（真依赖）                                                                                                                                                                                                                      | **用 web 那份**，删掉 `pnpm -C web` 转发脚本         |
| `pnpm-lock.yaml`（空壳）                                         | `pnpm-lock.yaml`（真）                                                                                                                                                                                                                        | **用 web 那份**，删根壳；同时改 `.gitignore`（§4.5） |
| `.gitignore`                                                     | `.gitignore`                                                                                                                                                                                                                                  | 人工合并，见 §4.5                                    |
| `.prettierignore`                                                | `.prettierignore`                                                                                                                                                                                                                             | 人工合并（未知差异，**先 diff 再合并**）             |
| —                                                                | `pnpm-workspace.yaml` / `tsconfig.json` / `next.config.ts` / `eslint.config.mjs` / `postcss.config.mjs` / `playwright*.config.ts` / `auth.ts` / `proxy.ts` / `next-env.d.ts` / `.env` / `.env.example` / `.prettierrc` / `.markdownlint.json` | 提到根                                               |
| `pyproject.toml` / `requirements-dev.txt` / `pyrightconfig.json` | —                                                                                                                                                                                                                                             | 不动                                                 |

⚠ `prettier` / `markdownlint` 一旦从根跑，扫描范围从 `web/` 扩大到全仓库
（`knowledge/`、`docs/`、`engine/*.md`）。**先跑一次 `--check` 看新增多少差异**，
再决定是补 ignore 还是顺手格式化 —— 不要在大迁移里混进几百行纯格式改动
（CLAUDE.md §6.4 记过这个教训）。

---

## 6. 仓库外的依赖（不在 Git 里，最容易漏）

1. **EdgeOne Pages 控制台**：项目若配了"构建/根目录 = `web/`"，必须改成仓库根。
   不同步改 → 下一次部署失败，而 CI 全绿（deploy.yml 从 `web/` 目录跑 CLI，
   迁移后要从根跑，两边必须一致）。
2. **EdgeOne 项目环境变量**：不动（`AUTH_SECRET` / `DEEPSEEK_API_KEY` / `SMTP_*`）。
3. **域名与分支绑定**：不动。
4. **`.githooks/pre-push`**：用 `Path(__file__).resolve().parents[1]` 定根，
   hooks 目录不动 → **无需改**。
5. **`.vscode/settings.json`**：自查是否含 `web/` 路径。

---

## 7. 执行阶段与验收

每个阶段结束必须全绿才进下一个；任一阶段失败即停，不带着红往下走。

| 阶段 | 内容                                                                                         | 验收                                                                                                |
| ---- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 0    | 开分支；**先确认 EdgeOne 控制台可改根目录**（CLAUDE.md §6.1）；记录当前线上版本              | 控制台可改；分支已建                                                                                |
| 1    | `git mv` 目录（§2 结构）+ 配置文件合并（§5）                                                 | `git status` 只有重命名；`pnpm install --frozen-lockfile` 通过                                      |
| 2    | 改构建脚本路径（§4.1）                                                                       | `pnpm build:kb --check` 输出 0 差异                                                                 |
| 3    | 改运行期路径（§4.2）                                                                         | `pnpm typecheck`、`pnpm lint`；**手工确认指南页与 Skill 列表非空**                                  |
| 4    | 改 Python / CI 路径（§4.3、§4.4）                                                            | `python tools/ci/check_all.py --skip-logs`                                                          |
| 5    | 更新文档里的 `web/` 路径（CLAUDE.md 17 处、README 6 处、docs 约 100 处、knowledge 约 24 处） | 全仓 grep `web/` 只剩历史叙述                                                                       |
| 6    | 本机全量                                                                                     | `python tools/ci/check_all.py`（含 6 条冻结基线）、`pnpm test:e2e`                                  |
| 7    | 部署                                                                                         | **先 preview**，验 `/ping`、`/kv-probe`、一个 Skill 详情页、一次 `.ulg` 上传解析；通过再 production |

阶段 6 的日志类校验**只能在开发机跑**（原始日志含 GPS、不入库），CI 全绿不等于回归过了 ——
这条 CLAUDE.md §6.4 已写明，迁移后依然成立。

---

## 8. 风险

### 8.1 静默失效（最危险）

`content-dir.ts` 与 `outputFileTracingIncludes` 两处改错**不会报错**，表现为
"指南 0 篇 / Skill 0 个"。阶段 3 必须**手工打开页面确认**，不能只看 `tsc` 绿。

### 8.2 守卫改错 → 恒真（最隐蔽）

`mutate_guards.py` 有 29 处 `web` 引用，它扫的是源码文本。改错的表现不是崩溃，
而是**某条守卫永远绿**（CLAUDE.md §6.6 记过四次这类事故）。

要求：阶段 4 结束后跑

```powershell
python tools/ci/check_all.py --with-mutate
```

每条守卫必须**先红一次**。做不到这一条，本阶段不算完成。

### 8.3 部署断链

见 CLAUDE.md §6.1。建议在阶段 0 就先改控制台或确认无需改，不要等阶段 7 才发现。

### 8.4 部署单元变大（本次迁移新引入的隐私风险）

**迁移前**，EdgeOne 的构建目录是 `web/` —— 部署包天然只包含这一个目录，`tools/testdata/logs/*.ulg`
（含 GPS 轨迹）无论是否被 gitignore，都不可能进部署包。这是一个**物理隔离**。

**迁移后**，构建目录变成仓库根，部署单元扩到整个仓库。原始日志不上传这条隐私红线，
从此**只剩 `.gitignore` 一道闸**（根 `.gitignore` 有 `tools/testdata/logs/*.ulg` 与 `.bin` 两条）。

因此必须在阶段 0 先确认：**EdgeOne CLI 上传时是否严格遵循 `.gitignore`**。
若只遵循自己的 ignore 配置，就要显式补一份 `.edgeoneignore`（或等价机制），
否则一份含真实飞行轨迹的日志会被推到线上 —— 这类事故不可撤回。

### 8.5 回滚

全程在独立分支 + 逐阶段提交；任一阶段回滚 = `git revert` 该阶段提交，不影响已完成的阶段。
阶段 7 出问题用 `deploy.yml` 的 `workflow_dispatch` 回滚到上一个提交。

---

## 9. 待确认（开工前必须落实）

1. EdgeOne Pages 是否支持 `src/functions`（§3.2）——决定 `functions/` 留根还是进 `src/`。
2. `.prettierignore` 两份的差异（§5）。
3. `eslint.config.mjs`、`src/app/edge-dev/[[...path]]/route.ts` 里是否还有 `web` 路径（未逐行核）。
4. `derived-version.generated.ts` 是否会因本次迁移变化：引擎源文件未动，哈希**应当**不变；
   阶段 2 用 `build:kb --check` 实测确认。若变了，用户本机存档会触发一次自动重解析（无害，但要知情）。
5. `i18n/` 与 `messages/` 内部是否有硬编码路径（未逐行核）。
6. **EdgeOne CLI 上传是否遵循 `.gitignore`**（§8.4）—— 决定需不需要 `.edgeoneignore`。
   这是本次迁移引入的**新**隐私风险，优先级高于其余 5 条。

---

## 10. 建议新增的守卫

迁移完成后加一条，防止 `web/` 路径回潮（符合 CLAUDE.md §6.6 的口味）：
扫描全仓 `.ts/.tsx/.mjs/.py/.yml`，出现 `web/` 或 `"web"` 路径字面量即红，
白名单放行 §7 阶段 5 里允许的历史叙述。

按 CLAUDE.md §6.6 规则 2，交付时必须**同时给出能证明它会红的变异用例**（临时插一行 `web/lib/x.ts`
看它是否报错），否则等于没写。
