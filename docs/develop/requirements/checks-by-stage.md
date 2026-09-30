# 检查分阶段方案

**这份文档解决一个问题**：检查项越加越多，每次 `git push` 都要等好几分钟，进度被检查卡死。

耗时均为 2026-09-22 本机实测（不是估算），复测方式见第 8 节。
所有"实测"字样都指当场跑出来的结果，不是推断——推断都标了"待确认"。

## 落地状态

| 节  | 内容                                                        | 状态                                                      |
| --- | ----------------------------------------------------------- | --------------------------------------------------------- |
| 3   | 六个阶段的检查分配                                          | 已落地（`--stage push` 14/14、`--stage ci` 6/6）          |
| 5   | 前端格式化与 TS lint                                        | 已落地（prettier 全量格式化；TS lint **决定暂不接入**）   |
| 6   | `checklist.yml` 按阶段重构                                  | 已落地                                                    |
| 7   | 早期改动清单                                                | **已过期**，回滚命令不再有效——仅作历史记录                |
| 8   | 复测方式                                                    | 已改为 `--stage` 写法                                     |
| 9   | 日志测试只在本地                                            | 已定；E2E fixture 的隐私张力见 9.8                        |
| 10  | `@smoke` 标记重整                                           | 已落地；**`test:e2e:log` 已接回 CI**（10.6 节）           |
| 11  | 四项补强（删死参数 / secret 扫描 / 依赖审计 / commit 规范） | **四项全部已落地**                                        |
| 12  | hook 语言统一                                               | 已落地；落地后发现并修掉 `--with-e2e` 漏传 bug（12.9 节） |

## 1. 分档依据

**本地只留秒级，分钟级全部放云端。** 判据只有一条：这项检查**会不会让人干等着**。

- 秒级（< 5s）→ 每次都跑，跑了也不心疼；
- 十秒级（10-60s）→ 本地 push 时跑，但只在改了相关文件时才有意义；
- 分钟级（> 2min）→ **一律不在本地跑**，交给云端 CI。

第二条依据是**有没有增量价值**。一条检查若在别处已被等价保证，重复跑就是纯成本——
工具链检查（`check_prereq`）是典型：CI 里 `pip install -r requirements-dev.txt` +
`pnpm install` 只要装不上就直接红，本地再查一遍环境没有新信息。

第三条依据是**单一事实源**：所有校验命令住在 `tools/ci/checklist.yml`，
`tools/ci/check_all.py` 只做"读清单 + 跑"，hooks 与 workflow 都只调它。
加一项校验 = 改 `checklist.yml` 一处，不要抄到第二个地方。

### 目标形态

| 阶段      | 该有什么                                      | 不该有什么                        |
| --------- | --------------------------------------------- | --------------------------------- |
| dev       | 类型 / lint 的实时反馈（不阻塞）              | 任何门禁                          |
| commit    | 格式化改动过的文件（Py + 前端）+ 提交标题规范 | 全仓扫描                          |
| push      | 静态检查那批秒级项 + 机密扫描 + 日志回归      | 工具链检查、E2E、联网审计         |
| CI        | build、E2E、自证、依赖审计                    | 日志回归（**本地专用**，第 9 节） |
| deploy 后 | 打线上的 E2E                                  | —                                 |

**`.githooks/` 下只有 Python 实现**（`pre-commit` / `pre-push` / `commit-msg`），
bash 版与 `.ps1` 全部删除——但**不是简单的"只留 py 扩展名"**：
hook 必须自己探测带 ruff 的解释器，否则每次都红（第 12 节）。

**两条通用的分流判据**（除"耗时"外的另外两条）：

- **要联网的检查不进 push**：`pnpm audit` / `pip-audit` 查外部漏洞库，
  网络抖动会变成"提交失败"——放 CI（第 11.3 节）；
- **只对"本次改动"有意义的检查放 commit**：格式化、提交标题规范，
  改动多少处理多少，比全仓扫一遍快，且错误在提交前消失（第 3 节 commit）。

**日志回归不走 CI**（第 9 节）：`.ulg` 不入仓库，所以云端 checkout 里没有日志，
这 4 项在 CI 里**必然 SKIP**——不是配置问题，是"日志不上传服务器"这条纪律的直接结果。

## 2. 检查分类总表

按**检查什么**分类（不是按跑在哪），共 11 类。

| 类别     | 回答什么问题                       | 检查                                                                                                                                                                                               |
| -------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 格式化   | 代码风格一致吗（机器改，人不争论） | `ruff format`（Py）、`prettier`（前端）                                                                                                                                                            |
| lint     | 有没有可疑写法                     | `ruff check`（Py）、`eslint`（JS，**TS 暂不覆盖**，第 5 节）                                                                                                                                       |
| 类型     | 类型对得上吗                       | `tsc --noEmit`                                                                                                                                                                                     |
| 单测     | 算子与表达式求值对不对             | `pytest knowledge/engine/tests`                                                                                                                                                                    |
| 契约     | 产物与源一致吗、产物合法吗         | `build:kb --check`、`check_engine_pyodide`、`check_engine_purity`、`check_pnpm_filter`、`guard_apm_parser_version`、`check-skill-spec`、`check-mcp-spec`、`check-guide-mdx`、`check-site-settings` |
| 守卫集   | 前端不许退化的那批断言还成立吗     | `test-issue-filer`（23 节）                                                                                                                                                                        |
| 元检查   | **校验机制自己**还健康吗           | `check_hygiene`                                                                                                                                                                                    |
| 自证     | 守卫真的会红吗（不是恒绿）         | `mutate_guards`（74 条变异，条数以 `--list` 为准）                                                                                                                                                 |
| 回归     | 改规则后结论还准吗                 | 日志回归 4 项                                                                                                                                                                                      |
| 冒烟     | 关键路径还能跑通吗                 | Playwright `@smoke`                                                                                                                                                                                |
| E2E      | 全量链路还能跑通吗                 | Playwright 全量、`playwright.live`（线上）                                                                                                                                                         |
| 机密     | 有没有把密钥提交进去               | `check_secrets`（第 11.2 节）                                                                                                                                                                      |
| 审计     | 依赖有没有已知漏洞                 | `pip-audit`、`pnpm audit`（第 11.3 节）                                                                                                                                                            |
| 提交规范 | 提交标题能读懂吗、能自动分类吗     | `.githooks/commit-msg`（第 11.4 节）                                                                                                                                                               |

**原"前提"类（`check_prereq`）已删除**——CI 的 pip / pnpm 安装步骤已等价保证，
本地再查一遍环境没有增量信息（第 1 节第二条依据）。

**"冒烟"与"E2E"的区别在本项目里是标签而非文件**：同一个 `playwright test` 跑全部，
`--grep @smoke` 只跑打了标签的少数几条。所以"冒烟覆盖够不够"取决于 `@smoke` 标在哪。

### 逐项明细

| 类别     | 检查                                                       | 实测                                   | 现在挂在哪            | 目标位置                               |
| -------- | ---------------------------------------------------------- | -------------------------------------- | --------------------- | -------------------------------------- |
| 格式化   | `ruff format --check`                                      | 2s                                     | 每次                  | push                                   |
| 格式化   | `ruff format`（自动改，仅 staged .py）                     | 2s                                     | commit                | commit                                 |
| 格式化   | `prettier --check`（前端）                                 | **3.7s**                               | 无                    | push                                   |
| 格式化   | `prettier --write`（仅 staged 前端）                       | 秒级                                   | 无                    | commit                                 |
| lint     | `eslint --fix`（仅 staged 前端，已定）                     | 秒级                                   | 无                    | commit                                 |
| lint     | `ruff check`                                               | 1s                                     | 每次                  | push                                   |
| lint     | `eslint .`（**只覆盖 35 个 .js/.mjs，0 个 .ts/.tsx**）     | 3s                                     | 每次                  | push                                   |
| 类型     | `tsc --noEmit`                                             | 2s                                     | 每次                  | push（另加 dev 的 `--watch`）          |
| 单测     | `pytest knowledge/engine/tests`（算子 / CEL 沙箱）         | 3s                                     | 每次                  | push                                   |
| 契约     | `build:kb --check`（产物 vs `knowledge/` 源）              | 1s                                     | 静态（pre-push 跳过） | CI                                     |
| 契约     | `check_engine_pyodide`（产物是合法 Python 且真执行）       | 1s                                     | 每次                  | push                                   |
| 契约     | `check_engine_purity`（`knowledge/engine/` 纯净性）        | 1s                                     | 每次                  | push                                   |
| 契约     | `check_pnpm_filter`（`pnpm --filter` 值命中真实项目）      | **0.5s**                               | 每次                  | push                                   |
| 契约     | `guard_apm_parser_version`（`.bin` 解析逻辑 vs 版本）      | 秒级                                   | 每次                  | push                                   |
| 契约     | `check-skill-spec`                                         | 1s                                     | 每次                  | CI                                     |
| 契约     | `check-mcp-spec`                                           | 1s                                     | 每次                  | CI                                     |
| 契约     | `check-guide-mdx`（guide 页 mdx 可编译）                   | ~1s                                    | 每次                  | push                                   |
| 契约     | `check-site-settings`（后台站点设置机制 + 首页静态化还在） | ~1s                                    | 每次                  | push                                   |
| 守卫集   | `test-issue-filer`（前端守卫）                             | **约 45s**                             | 静态（pre-push 跳过） | CI                                     |
| 元检查   | `check_hygiene`（校验机制自身卫生）                        | 4s                                     | 每次                  | push                                   |
| 日志回归 | `compare_baseline`                                         | 3s                                     | 本地 push             | **本地**（`.ulg` 不入库，第 9 节）     |
| 日志回归 | `guard_provider_contract`                                  | 3s                                     | 本地 push             | **本地**（同上）                       |
| 日志回归 | `run_engine --probe-data`                                  | 3s                                     | 本地 push             | **本地**（同上）                       |
| 日志回归 | `check_rules_fields --strict`                              | 2s                                     | 本地 push             | **本地**（同上）                       |
| 构建     | `build-knowledge`                                          | —                                      | dev / build           | dev / build                            |
| 构建     | `next build`                                               | **144s**                               | CI（`--stage build`） | CI                                     |
| 自证     | `mutate_guards`（74 条变异）                               | **约 26min**                           | 无人跑                | CI 独立 job                            |
| 冒烟     | `playwright --grep @smoke`                                 | 分钟级                                 | 原在 pre-push         | CI（**标记重整见第 10 节**）           |
| E2E      | `playwright --grep 日志分析流程`（11 条）                  | 约 5~7min                              | 无人跑                | CI（`playwright-analyze`，第 10.6 节） |
| E2E      | `playwright.live.config.ts`（打线上）                      | —                                      | deploy 后             | deploy 后                              |
| 机密     | `check_secrets`（复用 `SCRUB_RULES`）                      | **1.9s**（306 个跟踪文件，零命中）     | 无                    | push                                   |
| 审计     | `pnpm audit`（**须带 `--registry` 官方源**）               | **6s**（实测，命令走 `{PNPM}` 占位符） | 无                    | CI                                     |
| 审计     | `pip-audit`                                                | 秒级                                   | 无                    | CI                                     |
| 提交规范 | `.githooks/commit-msg`                                     | < 1s                                   | 无                    | commit                                 |

**`{PNPM}` 是新增占位符，不是笔误**：pnpm 是**全局工具**，`web/node_modules/` 下没有它。
清单里原先写 `{NODE} node_modules/pnpm/bin/pnpm.cjs` —— **那条路径不存在**，
于是这一步在**任何机器上都恒红**（恒红与恒绿同样是"没有守卫"）。
现在与 `{NODE}` 一样走 PATH（`shutil.which("pnpm")`）。

**prettier 的耗时与其门禁地位的冲突已解决**（2026-09-22 用户裁决）：
原先"不全量格式化既有文件"与"prettier-check 进 push 门禁"并存 → 那道门永远红。
现选择**跑 `pnpm format` 全量格式化一次**（134 个文件、8.6s、纯缩进变更）。
**代价是一个巨型 diff**，换来门禁可满足。格式化后 `--stage push` **14/14 全绿**。

**四类检查的耗时是分档的关键**：`test-issue-filer` 约 45s、`next build` 144s、
`mutate_guards` 约 26 分钟（74 条变异里 34 条打在 `test-issue-filer` 上，45s × 34）、
E2E 里那条"上传 .ulg 完成分析"约 420s（`playwright-analyze` 因此单独一步、超时 900s）。

**表末四行（机密 / 审计 ×2 / 提交规范）是第 11 节新增项**，决定依据与实测数据见第 11 节。

## 3. 六个阶段：现状与目标

每个阶段先给"这个阶段实际在跑什么"（命令级，不是概念级），再说现状与建议。

### 阶段速查

| 阶段   | 入口                                             | 触发方式     | 实测时长                |
| ------ | ------------------------------------------------ | ------------ | ----------------------- |
| dev    | `pnpm dev` = `build:kb` + `next dev`             | 手动         | 启动即跑构建期校验      |
| build  | `pnpm build` = `build:kb` + `next build`         | 手动 / CI    | 144s（仅 `next build`） |
| commit | `.githooks/pre-commit`                           | `git commit` | 2s                      |
| push   | `.githooks/pre-push` → `check_all.py --pre-push` | `git push`   | 26s                     |
| CI     | `.github/workflows/ci.yml` 两个 job              | push / PR    | 约 25min                |
| deploy | `.github/workflows/deploy.yml`                   | CI 成功后    | 部署 + 线上 E2E         |

### dev 写代码时

**`pnpm dev` 实际执行**：

```bash
node scripts/build-knowledge.mjs   # 生成 workers/*.ts、lib/knowledge/*.generated.*
next dev
```

`build-knowledge.mjs` 里全是 `throw`（1744 行）：规则必填字段、算子名是否注册、
`api.py` 常量表、`compute` 表达式能否编译、`guard_tags` 条件引用的名字是否存在。
**所以 dev 起不来往往不是 Next.js 的问题，是知识库写错了**——报错信息会直指哪个文件哪个字段。

**没有的**：类型与 lint 的实时反馈。写错一个类型要等到 push 才被 `tsc` 拦下。

**已定（用户确认）**：开 `tsc --noEmit --watch` + 编辑器 ESLint 插件。
这一层**不阻塞**：它只负责把错误提前暴露，不参与任何门禁。

落地方式：`pnpm dev` 之外**另开一个终端**跑 `tsc --noEmit --watch`（增量 2s 级）。
不并入 `pnpm dev` —— Next.js dev 自己有编译流程，串在一起会互相打断输出。

### build 构建

**`pnpm build` 实际执行**：上面两步 + `next build`（144s）。
`pnpm build:kb` 只做第一步；`--check` 时只比对不写入。

**已定（用户确认）：本地按需跑 `pnpm build`，不进 push 快检；CI 每次跑。**

| 位置 | 跑什么                                                              | 触发           |
| ---- | ------------------------------------------------------------------- | -------------- |
| 本地 | `pnpm build`（= `build:kb` + `next build`）                         | 手动，按需     |
| CI   | 只有 `next build`（清单里的 `next-build`，`when: args.with_build`） | 每次 push / PR |

**为什么本地按需而不是每次**：`next build` 一次 144s，是 push 快检（26s）的 5.5 倍；
本地开发有 `pnpm dev` 与 `tsc --watch` 兜住类型与编译期错误，
真要验发布形态时手动跑一次即可。

**为什么 CI 每次跑**：CI 的 `checks` job 调 `check_all.py --with-build`，每次都跑 `next build`。
只跑 `next build` 而不走 `pnpm build` 是安全的——产物已入库（`.generated/` 之类由
`build-knowledge.mjs` 重写），且 `build:kb --check` 会抓产物与 `knowledge/` 源的漂移，
两个方向都有人守。

**现状已核过**（`.githooks/pre-push` 为 Python 版，三分支）：

| 调用点                      | 实际参数                                       | 是否跑 `next build`        |
| --------------------------- | ---------------------------------------------- | -------------------------- |
| CI `checks` job（`ci.yml`） | `--stage build,ci --with-e2e`                  | **每次跑**                 |
| pre-push 默认               | `--stage push`                                 | **不跑**                   |
| pre-push `WITH_E2E=1`       | `--stage push,ci --with-e2e`                   | 不跑                       |
| pre-push `FULL_PUSH=1`      | `--stage push,ci,build`                        | 跑（显式选择，符合"按需"） |
| `tools/ci/check_all.ps1`    | 默认 `--stage push`，`-WithBuild` 才加 `build` | 默认不跑                   |

判据是阶段划分本身——`build` 是独立阶段，**不并入 `push` 与 `ci` 的默认集合**
（`--stage ci` 不含 `build`）。这条决定因此**不需要在清单里另设开关**：
"谁点谁跑"由 `--stage` 表达，行为与原 `--with-build` 完全一致（默认不跑、显式才跑）。

清单给的 timeout 是 **300s**，对 144s 有 2 倍余量。**CI 机上比本机慢**，
若日后日志或规则量增长把 build 推过 300s，先看是不是这里被砍，
**不要把 timeout 调大到失去意义**（超时失守等于没有超时）。

### commit 提交

**`.githooks/pre-commit` 实际执行**（当前仅对 staged 的 `.py`）：

```bash
python -m ruff format <staged .py>   # 改了就 git add 重新暂存
python -m ruff check  <staged .py>
```

**已定（用户确认）：commit 阶段对所有改动过的文件做格式化，Python 与前端一视同仁；
前端额外加 `eslint --fix`。**

| 文件类型                 | 命令                                             | 现状                                    |
| ------------------------ | ------------------------------------------------ | --------------------------------------- |
| `.py`                    | `ruff format` + `ruff check`                     | 已有                                    |
| `.ts/.tsx/.js/.mjs/.css` | `prettier --write`                               | **待加**（依赖第 5 节的 prettier 落地） |
| `.ts/.tsx`               | `eslint --fix`                                   | **待加**（理由见第 4 节「lint 位置」）  |
| 提交标题                 | `.githooks/commit-msg` 检查 Conventional Commits | **待加**（第 11.4 节）                  |

统一原则：**只碰 staged 的文件**，改了自动 `git add` 重新暂存，2s 级结束。
Prettier 的配置与排除清单见第 5 节。

**注意 `ruff check --fix` 不加**——项目明令禁止（`pyproject.toml`：`knowledge/engine/` 是拼接片段，
`--fix` 会误删东西）；`.py` 侧只做 `ruff check`（不修）与 `ruff format`（只格式化）。

**为什么格式化放在 commit 而不是 push**：改动多少文件就只处理多少文件，
比 push 时全仓扫一遍快得多；而且错误在提交前就消失，不至于攒到推送时一次性爆出来。

**`commit-msg` 是独立 hook**（第 11.4 节）：`pre-commit` 管文件内容、`commit-msg` 管标题，
两者互不干扰，都跑在 commit 阶段。`core.hooksPath` 已指向 `.githooks`，放入即生效。

### push 推送

**`.githooks/pre-push` 实际执行（改后）**：

```bash
python tools/ci/check_all.py --stage push    # 无工具链检查，26s
```

**已定三条（用户确认）**：

1. **去掉工具链检查**（`check_prereq`）——它每次要 1s，且 CI 里已由
   `pip install -r requirements-dev.txt` + pnpm 安装保证，本地重复跑没有增量价值；
2. **E2E 移走**：CI 每次跑，本地要跑时 `WITH_E2E=1 git push`；
3. **日志回归留在本地**（第 9 节）：`.ulg` 不入仓库，CI 里必然 SKIP，所以它哪儿也去不了。
   好在 4 项共 11s，秒级，留在 push 不影响"检查不卡进度"。

**改完后 push 阶段剩什么**：静态检查那批（格式化 / lint / 类型 / 单测 / 契约 / 元检查）

- 日志回归 4 项（11s），全部秒级。**再加上第 11.2 节的 `check_secrets`**。
  这才是"检查不卡进度"的形态。

**日志回归为什么去不了 CI**（第 9 节）：

`.gitignore` 第 24-25 行明确排除 `tools/testdata/logs/*.ulg` 与 `*.bin`，
云端 checkout 里没有日志 → `when: has_logs` → 4 项全部 SKIP。

这不是"配置漏了"，是**故意的**：原始日志含真实 GPS 轨迹，
`CLAUDE.md` 第 9 节写着"原始日志……不上传服务器"。
**`has_logs` 判据现在就是对的，一个字都不用改**——它查 `.ulg`，日志不在仓库，所以 SKIP，
判据与事实一致。（早先的文档把它描述成"判据落点没跟着数据搬家"的 bug，**那个说法作废**。）

**谁能在这台机器以外跑这 4 项**：不能。新克隆的人需要自己备日志
（`tools/testdata/logs/` 里两个 `sample*` 是仓库自带的，其余需按第 9.4 节的脚本下），
否则这 4 项会安静地 SKIP。**这是有意的行为，不是故障。**

**决策前的原始分析**（保留作判断依据，结论见上）：

| 事实              | 数值                                                                |
| ----------------- | ------------------------------------------------------------------- |
| 6 份日志合计      | **39.2MB**（最大 16.33MB，最小 0.92MB）                             |
| 是否含真实坐标    | **含**。字段名新版 `latitude_deg`/`longitude_deg`，旧版 `lat`/`lon` |
| CLAUDE.md 第 9 节 | "原始日志含 GPS 轨迹和作业信息……不上传服务器"                       |

当初考虑过三条路（脱敏后提交 / 原样提交 / 保持现状），**最后选的是"保持现状"**——
即日志不入库。**决定性的一条是 CLAUDE.md 那句纪律**，不是体积也不是仓库可见性：
体积用 xz 能压到 16MB（9.7 节有实测），仓库也是私仓，两条都不构成障碍；
但"原始日志不上传服务器"是项目自己划的红线。**纪律优先于技术可行性。**

### CI 云端

**`.github/workflows/ci.yml` 两个并行 job**：

| job                | 实际执行                                   | 时长                                          |
| ------------------ | ------------------------------------------ | --------------------------------------------- |
| `checks`           | `check_all.py --stage build,ci --with-e2e` | 约 17min（build 144s + 冒烟 + 11 条分析流程） |
| `guard-self-proof` | `check_all.py --with-mutate`               | 约 20min                                      |

拆成两个 job 是时长决定的：自证单独就要 20 分钟，与主 job 并行才各有独立超时预算。
两个 job 都给了 `timeout-minutes: 40`——`checks` 加进 `playwright-analyze` 后
估算约 17 分钟，仍有约 2.3 倍余量。

**为什么自证必须有地方跑**：它此前只在 `--with-mutate` 触发，而没有任何阶段传这个参数——
等于**没人跑**。它红了意味着某条守卫已悄悄退化成恒绿，这是本项目栽过最多次的一类问题。

**`checks` job 里日志回归的状态：SKIP，且有意的**（第 9 节）。

`check_all.py:314-315` 的判据查的是日志目录下有没有 `.ulg` / `.bin`：

```python
log_dir = ROOT / "tools" / "testdata" / "logs"
logs = sorted(log_dir.glob("*.ulg")) + sorted(log_dir.glob("*.bin"))
```

云端 checkout 里没有日志（`.gitignore` 排除了它们）→ `has_logs=False` → 4 项 SKIP。
**判据与事实一致，不需要改。**

**超时预算**：日志回归 4 项 11s **不在 CI 里跑**，所以 `checks` job 的时间预算不含它。

**依赖漏洞审计也在这个 job 里**（第 11.3 节）：`pnpm audit` 实测 5.7s、
`pip-audit` 秒级，两个加起来对 40 分钟的 job timeout 无影响。
**为什么审计放 CI 不放 push**：它要联网查外部漏洞库，
放 push 会让网络抖动变成"提交失败"；依赖变更频率低，CI 每次跑足够。

**CI 不需要为 audit 配 registry**：本机跑 `pnpm audit` 会因 `~/.npmrc` 指向
npmmirror 而失败（该镜像无 audit 端点），但 **CI 未配 registry，默认走官方源**。
命令里仍显式带 `--registry` 是为了让本机与 CI 行为一致（详见 11.3）。

### deploy 部署后

**`deploy.yml` 实际执行**：`edgeone pages deploy` 之后跑
`playwright test --config playwright.live.config.ts`，打线上站点（`SMOKE_BASE_URL`），
仅生产环境且配了该变量时跑。

**建议**：保持。它验的是真实部署产物，本地与 CI 都替代不了。

## 4. 缺口与待办

按"值不值得补"排序。

### 已定，已实施（2026-09-22，用户已确认）

> 下面 11 条全部落地。逐条状态如下；实测数字见第 2 节与第 11.5 节。

1. **dev 实时反馈**：`tsc --noEmit --watch` + 编辑器 ESLint 插件（第 3 节 dev）。✅
2. **commit 格式化扩展到前端 + 加 `eslint --fix`**：prettier 落地后，commit 阶段对 staged 的
   `.ts/.tsx/.js/.mjs/.css` 自动格式化，并对 `.ts/.tsx` 跑 `eslint --fix`（第 3 节 commit、
   第 4 节「lint 位置」）。✅
3. **push 去掉工具链检查**：删 `checklist.yml` 里 `check_prereq` 那一步。
   `check_all.py` 的 `--pre-push` 语义随之变化，需同步改文档字符串。✅
4. **push 移走 E2E**：E2E 已在 CI。**日志回归留在本地 push**——`CLAUDE.md` 第 9 节
   "原始日志不上传服务器"，日志不入库，CI 里必然 SKIP（第 9 节）。**这一条零改动。**✅
5. **build 本地按需、CI 每次跑**（第 3 节 build）：本地 `pnpm build` 手动触发，
   **不进 push 快检**；CI 的 `checks` job 每次 `next build`。
   ⚠️ **实测推翻了"无需改动"的预判**：`--stage ci` **不含 build**，
   所以 CI 必须在命令行显式写 `--stage build,ci --with-e2e`，否则 `next build` 每次都漏跑。
   workflow 已按此修改，并加了防错注释。
6. **`@smoke` 标记重整**（第 10 节）：`pages.spec.ts` 的页面渲染标 `@smoke`，
   420s 的 Pyodide 全流程移出 `@smoke`。已同步调整 `test:e2e:smoke` 的 grep 参数。✅
7. **删掉死参数 `SKIP_LOG_ANALYSIS`**（第 11 节）。✅
8. **加 secret 扫描**（第 11 节）。✅
9. **加依赖漏洞审计**（第 11 节）。✅ — 上线即抓到 `pytest 8.3.4` 真漏洞（11.3 节）。
10. **加 commit message 规范**（第 11 节）。✅
11. **`.githooks/` 只留 Python，hook 自己探测解释器**（第 12 节）。✅
12. **CI 接回 `test:e2e:log`**（第 10.6 节）：新增 `playwright-analyze` 步骤。✅
    —— 用户 2026-09-22 拍板「CI 要跑 test:e2e:log」。

### 待你决定

1. ~~CI 要不要跑 `test:e2e:log`~~ —— **已定：跑**（第 10.6 节）。
   新增 `playwright-analyze` 步骤，`when: args.with_e2e`，timeout 900s。
2. ~~原始 `.ulg` 能否随私仓走~~ —— **已定：不入库**（第 9 节）。
3. ~~补充日志集规格~~ —— **已定：暂不做**，调查结论留在第 9.5 / 9.7 节备用。
4. **TS lint 是否接入**（第 5 节）—— **已定：暂不接入**，理由与三条路线取舍见 5.5 节。
5. **`web/e2e/fixtures/sample.ulg` 是否换成合成 fixture**（第 9.8 节）——
   **用户 2026-09-22 裁决：保留现状**。该文件是已入库的 921KB 真实日志
   （含 GPS 首点 63.417°N/10.408°E，挪威），与「原始日志不入库」纪律存在张力，
   用户判断来源为公开的 logs.px4.io 且已在库，**接受继续入库**。
   ⚠️ **这意味着"原始日志不入库"这条纪律今后不能作为通用红线引用**——
   它现在只对 `tools/testdata/logs/*.ulg` 成立，对 E2E fixture 已有例外。

### lint 位置（已定）

**已定（用户确认）：commit 阶段仅加 `eslint --fix`，不加 `ruff check --fix`，全套 lint 留在 push。**

| 动作                         | 位置       | 说明                                                                                 |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `eslint --fix`               | **commit** | 只对 staged 的前端文件，自动改完重新暂存                                             |
| `ruff check --fix`           | **不加**   | 项目明令禁止（`pyproject.toml`：`knowledge/engine/` 是拼接片段，`--fix` 会误删东西） |
| `eslint`（全套，无 `--fix`） | **push**   | 需人判断的问题留给 push，有整段时间处理                                              |
| `ruff check`（全套）         | **push**   | 同上                                                                                 |

**这样安排的理由**：`eslint --fix` 能自动修的东西（格式类、可自动移除的冗余）与 prettier
同性质——无争议、不用人判断，放 commit 是纯增量：commit 多花 4s，push 的 4s 照旧，
总时长不变，只把一部分问题提前消掉。而需人判断的（未使用变量、hook 依赖数组、`no-undef`）
留在 push，不必在"正在提交、思路已断"的瞬间被拦下。

**注意**：`eslint --fix` 会改文件，且个别规则可能改出没预期的语义变化
（自动移除非必要断言、调整比较运算），而此刻正要提交、通常不会再读一遍 diff。
若日后发现某条 `--fix` 规则造成困扰，按规则关掉它，不要放弃整个 `--fix`。

## 5. 已落地的改动

第 5–12 节曾逐项记录前端格式化、`checklist.yml` 重构、`@smoke` 重整、四项补强与 hook 语言统一
的完整过程。全部已落地，过程记录不再保留，只留**至今仍起作用的口径与坑**。

### 5.1 前端格式化与 lint 的位置

前端此前只有 `tsc` 管类型（`eslint.config.mjs` 的 `ignores` 写着 `**/*.{ts,tsx}`，
100 个 TS/TSX 文件只做类型检查）。prettier 已全量格式化一次并进 push 门禁，**TS lint 暂不接入**。

一处必须知道的冲突：原先「不全量格式化既有文件」与「prettier-check 进 push 门禁」并存，
那道门永远红。解法是跑一次全量格式化（代价是一个巨型 diff），换来门禁可满足。

lint 的位置口径：

| 动作                         | 位置       | 说明                                                                                 |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `eslint --fix`               | **commit** | 只对 staged 的前端文件，自动改完重新暂存                                             |
| `ruff check --fix`           | **不加**   | 项目明令禁止（`pyproject.toml`：`knowledge/engine/` 是拼接片段，`--fix` 会误删东西） |
| `eslint`（全套，无 `--fix`） | **push**   | 需人判断的问题留给 push，有整段时间处理                                              |
| `ruff check`（全套）         | **push**   | 同上                                                                                 |

`eslint --fix` 会改文件，个别规则可能改出没预期的语义变化（自动移除非必要断言、调整比较运算），
而此刻正要提交、通常不会再读一遍 diff。若某条 `--fix` 规则造成困扰，按规则关掉它，
不要放弃整个 `--fix`。

### 5.2 `checklist.yml` 的结构边界

**`check_all.py` 只做两件事：读清单、跑。** 命令、阶段、条件全在 `checklist.yml` 里。
加一项校验 = 改清单一处，不要抄到第二个地方。

`--stage` 是**加法**不是减法：`--stage push,ci` 表示跑这两个阶段，不是"在 push 基础上加 ci"。
由此有一条踩过的坑：`--stage ci` **不含 build**，CI 必须在命令行显式写 `--stage build,ci --with-e2e`，
否则 `next build` 每次都漏跑。

`--with-*` 开关与阶段是**正交的两个维度**，不许从阶段列表反推。
反推的写法（`if with_e2e and "ci" not in stages`）在目标步骤就住在 ci 阶段时条件恒假——
命令照常拼出、退出码照常为 0，只是那一步从来没跑，且**没有任何输出**。
已配 `check_hygiene.py` 第 6 项守卫。

### 5.3 `@smoke` 标记

「冒烟」与「E2E」在本项目是**标签而非文件**：同一个 `playwright test` 跑全部，
`--grep @smoke` 只跑打了标签的几条。所以冒烟覆盖够不够，取决于 `@smoke` 标在哪。

`@smoke` 的标记口径：`pages.spec.ts` 的页面渲染都打 `@smoke`，那条 420s 的 Pyodide 全流程移出。

**`--grep` 匹配完整标题链**（`describe › test`），所以 grep `日志分析流程` 会命中整个 describe 的
11 条，而不是"只跑那条 420s"。要精确只跑一条得用 `--grep '上传 .ulg 并完成分析'`。
这条判据必须实测的道理：同一类判据写错曾导致 `--grep-invert` 失效。

实测用例数：全量 42（`pages.spec.ts` 31 + `analyze.spec.ts` 11）。

### 5.4 四项补强

- **删掉死参数 `SKIP_LOG_ANALYSIS`**：它控制的分支早已不存在，留着会让人以为日志回归可开关。
- **secret 扫描**（`tools/common/check_secrets.py`）：复用 `web/lib/error-policy.js` 的 `SCRUB_RULES`，**不引入新依赖**。复用是唯一说得通的做法——扫描用另一套规则就会出现"issue 脱敏认为安全的串，扫描判定为密钥"，两套判据打架最后一定有人把扫描关掉。
- **依赖漏洞审计**：`pip-audit` 钉版本（跨版本结论会变）；`pnpm audit` **必须带 `--registry=https://registry.npmjs.org/`**（默认源的返回结构不同）。上线第一次运行就抓到 `pytest` 的真漏洞，裁决升级不豁免。
- **commit message 规范**（`.githooks/commit-msg`）：格式为 `type(scope): 描述`，类型词从 `feat|fix|chore|docs|refactor|perf|style|test|build|ci|revert` 取。**括号只认圆括号**，不用方括号（`[^\]]+` 在 `sh` 与 Git 配置里都是转义地雷）。

### 5.5 hook 的解释器探测

`.githooks/` 下只有 Python 实现（`pre-commit` / `pre-push` / `commit-msg`）。

**`python` 不等同于"有 ruff 的 python"**：本机 `python` 解析到托管 Python 3.13，
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

### 5.6 装依赖的两个坑

**`pnpm add` 在本机会卡 20+ 分钟**（实测 21m52s，resolve 337 个包后只新增 1 个），
期间零输出，容易被误判成卡死。安装时用后台任务跑。

**`pnpm add` 会因 `ERR_PNPM_IGNORED_BUILDS` 报错但不影响装包**：这是 pnpm 的构建脚本审批机制
（需 `pnpm approve-builds`），与所装的包无关。别当成安装失败而重装一遍。

---

## 6. 复测方式

```bash
python tools/ci/check_all.py --stage push               # 本地快检
python tools/ci/check_all.py --stage push --skip-logs   # 同上，但跳过日志回归
python tools/ci/check_all.py --stage ci                 # 云端那批（不含 E2E）
python tools/ci/check_all.py --stage build,ci --with-e2e  # 云端全量
python tools/ci/check_all.py --list-stages              # 只看阶段地图，不执行
python tools/ci/mutate_guards.py --only <关键字>         # 单条自证
python tools/ci/mutate_guards.py --list                 # 看变异注册表
```

**`--with-e2e` 控制两条 E2E**：`playwright-smoke`（@smoke，约 1~2min）
与 `playwright-analyze`（`--grep 日志分析流程` 11 条，约 5~7min）。
只跑后者：`pnpm web:test:e2e:log`。

**日志回归 4 项包含在 `--stage push` 里**（本机 `tools/testdata/logs/` 有日志时）。
换机器或新克隆的人跑出来会是 SKIP——**这是有意的**，不是坏了（见第 7 节）。

**自证必须单独跑**：跑单条要给足超时（`test-issue-filer` 一次 45s），
超时被硬杀会导致变异没还原——跑完务必 `git status` 确认无残留。

---

## 7. 日志测试：只在本地跑

日志回归 4 项留在**本地**，`.ulg` **不提交仓库**，CI 里这 4 项**继续 SKIP**。

理由是纪律的直接结果：`CLAUDE.md` 第 9 节「原始日志不上传服务器」，日志不入库，
云端 checkout 里没有日志——不是配置问题。

### 7.1 连带影响（不改就会坏的四处）

1. **`--skip-logs` 必须留着**：换机器/CI 里没有日志时靠它跳过，而不是让 4 项报错。
2. **CI 的 `checks` job 里这 4 项是 SKIP 而非删除**：删掉就看不出"本地该跑"这件事。
3. **冻结基线的判据不能依赖日志文件路径存在**：路径不存在时是 SKIP，不是 FAIL。
4. **文档里所有"跑一遍全量"的说法都要带前提**：本机有日志时才是全量。

### 7.2 冻结基线的硬约束

基线是「同输入 → 同结论」的回归锚点，因此：

- 引擎结论**变化必须是显式动作**（打新基线），不能因为重构而漂移；
- 基线文件入库，日志不入库——两者的生命周期不同，别混在一起删。

### 7.3 两个同名但不同的 `sample.ulg`

`web/e2e/fixtures/sample.ulg`（已入库，921KB，真实日志）与 `tools/testdata/logs/sample.ulg`
是**两个不同的文件**。前者是 E2E fixture，为用户裁决「保留现状」而入库；
后者是本地日志集的一员。改任一个前先确认自己在改哪个。

⚠️ 因此「原始日志不入库」这条纪律**不能作为通用红线引用**——
它现在只对 `tools/testdata/logs/*.ulg` 成立，对 E2E fixture 已有例外。

---

## 8. 检查分档的实测底线

四个数字是分档的关键：

| 项                     | 耗时     | 后果                                       |
| ---------------------- | -------- | ------------------------------------------ |
| `test-issue-filer`     | 约 45s   | 不进 push；也是 `mutate_guards` 的主要靶子 |
| `next build`           | 144s     | 只在 CI                                    |
| `mutate_guards`        | 约 26min | CI 独立 job                                |
| 「上传 .ulg 完成分析」 | 约 420s  | `playwright-analyze` 单独一步、超时 900s   |

`mutate_guards` 26 分钟里大部分来自 `test-issue-filer`（74 条变异里 34 条打在它上面，45s × 34）。
若日后要压缩这条耗时，从减少打在它上面的变异数入手，而不是调小超时。
