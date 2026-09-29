# 目录布局迁移方案（web/ → 仓库根 + src/）

> 状态：**已搁置（2026-09-23 决定维持现状，不执行）**。
> 本文件保留作**决策记录 + 现状风险清单**。
> 不迁移的理由：改动面（4 份配置合并、CI、`mutate_guards.py` 29 处字面量、EdgeOne 控制台）
> 大于当期收益，且有两项前置条件只能在生产部署时才能看见结果。
> 想重新考虑迁移，先落实 §2 的三项确认，再照 §3 的步骤执行。

## 0. 维持现状下必须记住的事

这些与是否迁移无关，现状下同样成立：

1. 根 `package.json`（`pnpm -C web` 转发壳）与根 `pnpm-lock.yaml`（零依赖空壳）是**影子，不是第二套配置**。改依赖只在 `web/` 改，**别往根 `package.json` 加依赖**。
2. 根 `.gitignore` 含 `/pnpm-lock.yaml` 是**有意为之**（真 lockfile 在 `web/`），不要顺手删掉。
3. `public/` 只能在**项目根**——Next 源码 `path.join(dir,'public')`。现状即 `web/public/`，正确；**不存在 `src/public` 这个位置**。
4. `web/app/` 已存在，`findDir` 优先 `./app` 再 `./src/app`。**不要新建 `web/src/app`**——它会被静默忽略，不报错。
5. `tools/testdata/logs/*.ulg` 含 GPS 轨迹，靠"在 `web/` 之外"**物理隔离**。不要把这些日志移进 `web/`，也不要把 EdgeOne 的上传范围放宽到仓库根。
6. `web/lib/content-dir.ts` 是运行期 `process.cwd()/content`。任何改变进程 cwd 的调整都会让内容**静默变空**（指南 0 篇 / Skill 0 个），不报错。

## 1. 三条硬约束（附依据）

1. **`public/` 必须在项目根**：Next 源码写死 `path.join(dir, 'public')`，不接受其他位置。
2. **`functions/` 能否进 `src/` 未确认**：EdgeOne 边缘函数目录的解析规则本地无法验证，保守留根。
3. **Next.js 的 `src` 判定**：`app` / `pages` 存在时 `src` 才能被识别，`src/` 与根同名目录不能并存。

## 2. 若将来重新考虑迁移，必须先确认（都不在 Git 里）

1. EdgeOne 控制台的**构建根目录**是否指向 `web/`——不同步改就是部署挂、CI 全绿。
2. EdgeOne CLI 上传是否**严格遵循 `.gitignore`**——不遵循要补 `.edgeoneignore`，否则含 GPS 的 `.ulg` 可能进部署包，此类事故不可撤回。
3. `functions/` 能否移入 `src/`——本地无法验证。

第 2 条是迁移**新引入**的隐私风险：迁移前构建目录是 `web/`，部署包天然只包含这一个目录，`.ulg` 无论是否被 gitignore 都进不去，这是物理隔离；迁移后构建目录变成仓库根，原始日志不上传这条红线**只剩 `.gitignore` 一道闸**。优先级高于其余两条。

## 3. 执行阶段与验收

每阶段全绿才进下一个；任一阶段失败即停，不带着红往下走。

| 阶段 | 内容                                                  | 验收                                                                                           |
| ---- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 0    | 开分支；先确认 EdgeOne 控制台可改根目录；记录线上版本 | 控制台可改；分支已建                                                                           |
| 1    | `git mv` 目录 + 配置文件合并                          | `git status` 只有重命名；`pnpm install --frozen-lockfile`                                      |
| 2    | 改构建脚本路径                                        | `pnpm build:kb --check` 输出 0 差异                                                            |
| 3    | 改运行期路径                                          | `pnpm typecheck`、`pnpm lint`；**手工确认指南页与 Skill 列表非空**                             |
| 4    | 改 Python / CI 路径                                   | `python tools/ci/check_all.py --skip-logs`                                                     |
| 5    | 更新文档里的 `web/` 路径                              | 全仓 grep `web/` 只剩历史叙述                                                                  |
| 6    | 本机全量                                              | `python tools/ci/check_all.py`、`pnpm test:e2e`                                                |
| 7    | 部署                                                  | **先 preview**，验 `/api/kv-probe`、一个 Skill 详情页、一次 `.ulg` 上传解析；通过再 production |

## 4. 风险

**静默失效（最危险）**：`content-dir.ts` 与 `outputFileTracingIncludes` 两处改错**不会报错**，表现为指南 0 篇 / Skill 0 个。阶段 3 必须手工打开页面确认，不能只看 `tsc` 绿。

**守卫改错 → 恒真（最隐蔽）**：`mutate_guards.py` 有 29 处 `web` 引用，它扫的是源码文本。改错的表现不是崩溃，而是**某条守卫永远绿**。阶段 4 结束后跑 `python tools/ci/check_all.py --with-mutate`，每条守卫必须**先红一次**，做不到本阶段不算完成。

**部署断链**：见 CLAUDE.md §6.1。阶段 0 就先改控制台或确认无需改，不要等阶段 7 才发现。

**回滚**：全程独立分支 + 逐阶段提交，任一阶段回滚 = `git revert` 该阶段提交。阶段 7 出问题用 `deploy.yml` 的 `workflow_dispatch` 回滚到上一个提交。

## 5. 开工前待核

1. `derived-version.generated.ts` 是否因迁移变化：引擎源文件未动，哈希**应当**不变；阶段 2 用 `build:kb --check` 实测确认。若变了，用户本机存档会触发一次自动重解析（无害，但要知道）。
2. `.prettierignore` 两份的差异；`eslint.config.mjs` 与 `edge-dev` 路由里是否还有 `web` 路径（未逐行核）。
3. `i18n/` 与 `messages/` 内部是否有硬编码路径（未逐行核）。

## 6. 建议新增的守卫

迁移完成后加一条，防止 `web/` 路径回潮：扫描全仓 `.ts/.tsx/.mjs/.py/.yml`，出现 `web/` 或 `"web"` 路径字面量即红，白名单放行阶段 5 里允许的历史叙述。

按 CLAUDE.md §6.6 规则 2，交付时必须同时给出能证明它会红的变异用例（临时插一行 `web/lib/x.ts` 看它是否报错），否则等于没写。
