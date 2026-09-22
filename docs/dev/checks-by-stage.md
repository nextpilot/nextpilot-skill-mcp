# 检查分阶段方案

**这份文档解决一个问题**：检查项越加越多，每次 `git push` 都要等好几分钟，进度被检查卡死。

耗时均为 2026-09-22 本机实测（不是估算），复测方式见第 8 节。
所有"实测"字样都指当场跑出来的结果，不是推断——推断都标了"待确认"。

## 落地状态

| 节 | 内容 | 状态 |
| --- | --- | --- |
| 3 | 六个阶段的检查分配 | 已落地（`--stage push` 14/14、`--stage ci` 6/6） |
| 5 | 前端格式化与 TS lint | 已落地（prettier 全量格式化；TS lint **决定暂不接入**） |
| 6 | `checklist.yml` 按阶段重构 | 已落地 |
| 7 | 早期改动清单 | **已过期**，回滚命令不再有效——仅作历史记录 |
| 8 | 复测方式 | 已改为 `--stage` 写法 |
| 9 | 日志测试只在本地 | 已定；E2E fixture 的隐私张力见 9.8 |
| 10 | `@smoke` 标记重整 | 已落地；**`test:e2e:analyze` 已接回 CI**（10.6 节） |
| 11 | 四项补强（删死参数 / secret 扫描 / 依赖审计 / commit 规范） | **四项全部已落地** |
| 12 | hook 语言统一 | 已落地；落地后发现并修掉 `--with-e2e` 漏传 bug（12.9 节） |

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

| 阶段 | 该有什么 | 不该有什么 |
| --- | --- | --- |
| dev | 类型 / lint 的实时反馈（不阻塞） | 任何门禁 |
| commit | 格式化改动过的文件（Py + 前端）+ 提交标题规范 | 全仓扫描 |
| push | 静态检查那批秒级项 + 机密扫描 + 日志回归 | 工具链检查、E2E、联网审计 |
| CI | build、E2E、自证、依赖审计 | 日志回归（**本地专用**，第 9 节） |
| deploy 后 | 打线上的 E2E | — |

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

| 类别 | 回答什么问题 | 检查 |
| --- | --- | --- |
| 格式化 | 代码风格一致吗（机器改，人不争论） | `ruff format`（Py）、`prettier`（前端） |
| lint | 有没有可疑写法 | `ruff check`（Py）、`eslint`（JS，**TS 暂不覆盖**，第 5 节） |
| 类型 | 类型对得上吗 | `tsc --noEmit` |
| 单测 | 算子与表达式求值对不对 | `pytest engine/tests` |
| 契约 | 产物与源一致吗、产物合法吗 | `build:kb --check`、`check_artifact`、`check_engine_purity`、`check-skill-spec`、`check-mcp-spec` |
| 守卫集 | 前端不许退化的那批断言还成立吗 | `test-issue-filer`（21 节） |
| 元检查 | **校验机制自己**还健康吗 | `check_hygiene` |
| 自证 | 守卫真的会红吗（不是恒绿） | `mutate_guards`（43 条变异） |
| 回归 | 改规则后结论还准吗 | 日志回归 4 项 |
| 冒烟 | 关键路径还能跑通吗 | Playwright `@smoke` |
| E2E | 全量链路还能跑通吗 | Playwright 全量、`playwright.live`（线上） |
| 机密 | 有没有把密钥提交进去 | `check_secrets`（第 11.2 节） |
| 审计 | 依赖有没有已知漏洞 | `pip-audit`、`pnpm audit`（第 11.3 节） |
| 提交规范 | 提交标题能读懂吗、能自动分类吗 | `.githooks/commit-msg`（第 11.4 节） |

**原"前提"类（`check_prereq`）已删除**——CI 的 pip / pnpm 安装步骤已等价保证，
本地再查一遍环境没有增量信息（第 1 节第二条依据）。

**"冒烟"与"E2E"的区别在本项目里是标签而非文件**：同一个 `playwright test` 跑全部，
`--grep @smoke` 只跑打了标签的少数几条。所以"冒烟覆盖够不够"取决于 `@smoke` 标在哪。

### 逐项明细

| 类别 | 检查 | 实测 | 现在挂在哪 | 目标位置 |
| --- | --- | --- | --- | --- |
| 格式化 | `ruff format --check` | 2s | 每次 | push |
| 格式化 | `ruff format`（自动改，仅 staged .py） | 2s | commit | commit |
| 格式化 | `prettier --check`（前端） | **3.7s** | 无 | push |
| 格式化 | `prettier --write`（仅 staged 前端） | 秒级 | 无 | commit |
| lint | `eslint --fix`（仅 staged 前端，已定） | 秒级 | 无 | commit |
| lint | `ruff check` | 1s | 每次 | push |
| lint | `eslint .`（**只覆盖 35 个 .js/.mjs，0 个 .ts/.tsx**） | 3s | 每次 | push |
| 类型 | `tsc --noEmit` | 2s | 每次 | push（另加 dev 的 `--watch`） |
| 单测 | `pytest engine/tests`（算子 / CEL 沙箱） | 3s | 每次 | push |
| 契约 | `build:kb --check`（产物 vs `knowledge/` 源） | 1s | 静态（pre-push 跳过） | CI |
| 契约 | `check_artifact`（产物是合法 Python 且真执行） | 1s | 每次 | push |
| 契约 | `check_engine_purity`（`engine/` 纯净性） | 1s | 每次 | push |
| 契约 | `check-skill-spec` | 1s | 每次 | CI |
| 契约 | `check-mcp-spec` | 1s | 每次 | CI |
| 守卫集 | `test-issue-filer`（前端守卫） | **42s** | 静态（pre-push 跳过） | CI |
| 元检查 | `check_hygiene`（校验机制自身卫生） | 4s | 每次 | push |
| 日志回归 | `compare_baseline` | 3s | 本地 push | **本地**（`.ulg` 不入库，第 9 节） |
| 日志回归 | `check_provider` | 3s | 本地 push | **本地**（同上） |
| 日志回归 | `run_checks_locally --probe-data` | 3s | 本地 push | **本地**（同上） |
| 日志回归 | `lint_rules --strict` | 2s | 本地 push | **本地**（同上） |
| 构建 | `sync-content` + `build-knowledge` | — | dev / build | dev / build |
| 构建 | `next build` | **144s** | CI（`--stage build`） | CI |
| 自证 | `mutate_guards`（43 条变异） | **约 20min** | 无人跑 | CI 独立 job |
| 冒烟 | `playwright --grep @smoke` | 分钟级 | 原在 pre-push | CI（**标记重整见第 10 节**） |
| E2E | `playwright --grep 日志分析流程`（11 条） | 约 5~7min | 无人跑 | CI（`playwright-analyze`，第 10.6 节） |
| E2E | `playwright.live.config.ts`（打线上） | — | deploy 后 | deploy 后 |
| 机密 | `check_secrets`（复用 `SCRUB_RULES`） | **1.9s**（306 个跟踪文件，零命中） | 无 | push |
| 审计 | `pnpm audit`（**须带 `--registry` 官方源**） | **6s**（实测，命令走 `{PNPM}` 占位符） | 无 | CI |
| 审计 | `pip-audit` | 秒级 | 无 | CI |
| 提交规范 | `.githooks/commit-msg` | < 1s | 无 | commit |

**`{PNPM}` 是新增占位符，不是笔误**：pnpm 是**全局工具**，`web/node_modules/` 下没有它。
清单里原先写 `{NODE} node_modules/pnpm/bin/pnpm.cjs` —— **那条路径不存在**，
于是这一步在**任何机器上都恒红**（恒红与恒绿同样是"没有守卫"）。
现在与 `{NODE}` 一样走 PATH（`shutil.which("pnpm")`）。

**prettier 的耗时与其门禁地位的冲突已解决**（2026-09-22 用户裁决）：
原先"不全量格式化既有文件"与"prettier-check 进 push 门禁"并存 → 那道门永远红。
现选择**跑 `pnpm format` 全量格式化一次**（134 个文件、8.6s、纯缩进变更）。
**代价是一个巨型 diff**，换来门禁可满足。格式化后 `--stage push` **14/14 全绿**。

**四类检查的耗时是分档的关键**：`test-issue-filer` 42s、`next build` 144s、
`mutate_guards` 约 20 分钟（43 条变异里 27 条打在 `test-issue-filer` 上，42s × 27）、
E2E 里那条"上传 .ulg 完成分析"约 420s（`playwright-analyze` 因此单独一步、超时 900s）。

**表末四行（机密 / 审计 ×2 / 提交规范）是第 11 节新增项**，决定依据与实测数据见第 11 节。

## 3. 六个阶段：现状与目标

每个阶段先给"这个阶段实际在跑什么"（命令级，不是概念级），再说现状与建议。

### 阶段速查

| 阶段 | 入口 | 触发方式 | 实测时长 |
| --- | --- | --- | --- |
| dev | `pnpm dev` = `sync:content` + `build:kb` + `next dev` | 手动 | 启动即跑构建期校验 |
| build | `pnpm build` = `sync:content` + `build:kb` + `next build` | 手动 / CI | 144s（仅 `next build`） |
| commit | `.githooks/pre-commit` | `git commit` | 2s |
| push | `.githooks/pre-push` → `check_all.py --pre-push` | `git push` | 26s |
| CI | `.github/workflows/ci.yml` 两个 job | push / PR | 约 25min |
| deploy | `.github/workflows/deploy.yml` | CI 成功后 | 部署 + 线上 E2E |

### dev 写代码时

**`pnpm dev` 实际执行**：

```bash
node scripts/sync-content.mjs      # docs/guide + knowledge/ → web/ 内的真源
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

**`pnpm build` 实际执行**：上面三步 + `next build`（144s）。
`pnpm build:kb` 只做前两步；`--check` 时只比对不写入。

**已定（用户确认）：本地按需跑 `pnpm build`，不进 push 快检；CI 每次跑。**

| 位置 | 跑什么 | 触发 |
| --- | --- | --- |
| 本地 | `pnpm build`（= `sync:content` + `build:kb` + `next build`） | 手动，按需 |
| CI | 只有 `next build`（清单里的 `next-build`，`when: args.with_build`） | 每次 push / PR |

**为什么本地按需而不是每次**：`next build` 一次 144s，是 push 快检（26s）的 5.5 倍；
本地开发有 `pnpm dev` 与 `tsc --watch` 兜住类型与编译期错误，
真要验发布形态时手动跑一次即可。

**为什么 CI 每次跑**：CI 的 `checks` job 调 `check_all.py --with-build`，每次都跑 `next build`。
只跑 `next build` 而不走 `pnpm build` 是安全的——产物已入库（`.generated/` 之类由
`build-knowledge.mjs` 重写），且 `build:kb --check` 会抓产物与 `knowledge/` 源的漂移，
两个方向都有人守。

**现状已核过**（`.githooks/pre-push` 为 Python 版，三分支）：

| 调用点 | 实际参数 | 是否跑 `next build` |
| --- | --- | --- |
| CI `checks` job（`ci.yml`） | `--stage build,ci --with-e2e` | **每次跑** |
| pre-push 默认 | `--stage push` | **不跑** |
| pre-push `WITH_E2E=1` | `--stage push,ci --with-e2e` | 不跑 |
| pre-push `FULL_PUSH=1` | `--stage push,ci,build` | 跑（显式选择，符合"按需"） |
| `tools/check_all.ps1` | 默认 `--stage push`，`-WithBuild` 才加 `build` | 默认不跑 |

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

| 文件类型 | 命令 | 现状 |
| --- | --- | --- |
| `.py` | `ruff format` + `ruff check` | 已有 |
| `.ts/.tsx/.js/.mjs/.css` | `prettier --write` | **待加**（依赖第 5 节的 prettier 落地） |
| `.ts/.tsx` | `eslint --fix` | **待加**（理由见第 4 节「lint 位置」） |
| 提交标题 | `.githooks/commit-msg` 检查 Conventional Commits | **待加**（第 11.4 节） |

统一原则：**只碰 staged 的文件**，改了自动 `git add` 重新暂存，2s 级结束。
Prettier 的配置与排除清单见第 5 节。

**注意 `ruff check --fix` 不加**——项目明令禁止（`pyproject.toml`：`engine/` 是拼接片段，
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
+ 日志回归 4 项（11s），全部秒级。**再加上第 11.2 节的 `check_secrets`**。
这才是"检查不卡进度"的形态。

**日志回归为什么去不了 CI**（第 9 节）：

`.gitignore` 第 24-25 行明确排除 `tools/calibrate/logs/*.ulg` 与 `*.bin`，
云端 checkout 里没有日志 → `when: has_logs` → 4 项全部 SKIP。

这不是"配置漏了"，是**故意的**：原始日志含真实 GPS 轨迹，
`CLAUDE.md` 第 9 节写着"原始日志……不上传服务器"。
**`has_logs` 判据现在就是对的，一个字都不用改**——它查 `.ulg`，日志不在仓库，所以 SKIP，
判据与事实一致。（早先的文档把它描述成"判据落点没跟着数据搬家"的 bug，**那个说法作废**。）

**谁能在这台机器以外跑这 4 项**：不能。新克隆的人需要自己备日志
（`tools/calibrate/logs/` 里两个 `sample*` 是仓库自带的，其余需按第 9.4 节的脚本下），
否则这 4 项会安静地 SKIP。**这是有意的行为，不是故障。**

**决策前的原始分析**（保留作判断依据，结论见上）：

| 事实 | 数值 |
| --- | --- |
| 6 份日志合计 | **39.2MB**（最大 16.33MB，最小 0.92MB） |
| 是否含真实坐标 | **含**。字段名新版 `latitude_deg`/`longitude_deg`，旧版 `lat`/`lon` |
| CLAUDE.md 第 9 节 | "原始日志含 GPS 轨迹和作业信息……不上传服务器" |

当初考虑过三条路（脱敏后提交 / 原样提交 / 保持现状），**最后选的是"保持现状"**——
即日志不入库。**决定性的一条是 CLAUDE.md 那句纪律**，不是体积也不是仓库可见性：
体积用 xz 能压到 16MB（9.7 节有实测），仓库也是私仓，两条都不构成障碍；
但"原始日志不上传服务器"是项目自己划的红线。**纪律优先于技术可行性。**

### CI 云端

**`.github/workflows/ci.yml` 两个并行 job**：

| job | 实际执行 | 时长 |
| --- | --- | --- |
| `checks` | `check_all.py --stage build,ci --with-e2e` | 约 17min（build 144s + 冒烟 + 11 条分析流程） |
| `guard-self-proof` | `check_all.py --with-mutate` | 约 20min |

拆成两个 job 是时长决定的：自证单独就要 20 分钟，与主 job 并行才各有独立超时预算。
两个 job 都给了 `timeout-minutes: 40`——`checks` 加进 `playwright-analyze` 后
估算约 17 分钟，仍有约 2.3 倍余量。

**为什么自证必须有地方跑**：它此前只在 `--with-mutate` 触发，而没有任何阶段传这个参数——
等于**没人跑**。它红了意味着某条守卫已悄悄退化成恒绿，这是本项目栽过最多次的一类问题。

**`checks` job 里日志回归的状态：SKIP，且有意的**（第 9 节）。

`check_all.py:256-257` 的判据查的是日志目录下有没有 `.ulg` / `.bin`：

```python
log_dir = ROOT / "tools" / "calibrate" / "logs"
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
12. **CI 接回 `test:e2e:analyze`**（第 10.6 节）：新增 `playwright-analyze` 步骤。✅
    —— 用户 2026-09-22 拍板「CI 要跑 test:e2e:analyze」。

### 待你决定

1. ~~CI 要不要跑 `test:e2e:analyze`~~ —— **已定：跑**（第 10.6 节）。
   新增 `playwright-analyze` 步骤，`when: args.with_e2e`，timeout 900s。
2. ~~原始 `.ulg` 能否随私仓走~~ —— **已定：不入库**（第 9 节）。
3. ~~补充日志集规格~~ —— **已定：暂不做**，调查结论留在第 9.5 / 9.7 节备用。
4. **TS lint 是否接入**（第 5 节）—— **已定：暂不接入**，理由与三条路线取舍见 5.5 节。
5. **`web/e2e/fixtures/sample.ulg` 是否换成合成 fixture**（第 9.8 节）——
   **用户 2026-09-22 裁决：保留现状**。该文件是已入库的 921KB 真实日志
   （含 GPS 首点 63.417°N/10.408°E，挪威），与「原始日志不入库」纪律存在张力，
   用户判断来源为公开的 logs.px4.io 且已在库，**接受继续入库**。
   ⚠️ **这意味着"原始日志不入库"这条纪律今后不能作为通用红线引用**——
   它现在只对 `tools/calibrate/logs/*.ulg` 成立，对 E2E fixture 已有例外。

### lint 位置（已定）

**已定（用户确认）：commit 阶段仅加 `eslint --fix`，不加 `ruff check --fix`，全套 lint 留在 push。**

| 动作 | 位置 | 说明 |
| --- | --- | --- |
| `eslint --fix` | **commit** | 只对 staged 的前端文件，自动改完重新暂存 |
| `ruff check --fix` | **不加** | 项目明令禁止（`pyproject.toml`：`engine/` 是拼接片段，`--fix` 会误删东西） |
| `eslint`（全套，无 `--fix`） | **push** | 需人判断的问题留给 push，有整段时间处理 |
| `ruff check`（全套） | **push** | 同上 |

**这样安排的理由**：`eslint --fix` 能自动修的东西（格式类、可自动移除的冗余）与 prettier
同性质——无争议、不用人判断，放 commit 是纯增量：commit 多花 4s，push 的 4s 照旧，
总时长不变，只把一部分问题提前消掉。而需人判断的（未使用变量、hook 依赖数组、`no-undef`）
留在 push，不必在"正在提交、思路已断"的瞬间被拦下。

**注意**：`eslint --fix` 会改文件，且个别规则可能改出没预期的语义变化
（自动移除非必要断言、调整比较运算），而此刻正要提交、通常不会再读一遍 diff。
若日后发现某条 `--fix` 规则造成困扰，按规则关掉它，不要放弃整个 `--fix`。

## 5. 前端格式化与 TS lint（已落地）

前端此前只有 `tsc` 管类型：**没有格式化器，ESLint 也不看 TS**。
实测 `eslint .` 只检查 **35 个 .js/.mjs、0 个 .ts/.tsx** ——
`eslint.config.mjs` 的 `ignores` 里写着 `**/*.{ts,tsx}`。100 个 TS/TSX 文件处于只做类型检查的状态。

### 已知事实（实测）

| 事实 | 数值 |
| --- | --- |
| TS/TSX 文件数 | 100 |
| 既有缩进 | 4 空格 |
| 文件行尾 | CRLF（`cat -A` 显示 `^M$`） |
| 现有格式化配置 | 无（无 `.prettierrc*`、无 `.editorconfig`） |
| ESLint 对 TS 的覆盖 | 0 |

### 已定方案

| 步骤 | 落点 | 决定 |
| --- | --- | --- |
| 装 prettier | `web/package.json` devDependencies | 装子项目，依赖不进仓库根 |
| 配置 | `web/.prettierrc` | `tabWidth: 4`、`printWidth: 120`、`semi`、`singleQuote: false`、**`endOfLine: "auto"`** |
| 排除生成物 | `web/.prettierignore` | `.generated/`、`workers/ulog-check-script.ts`、`workers/ulog-data-script.ts`、`lib/knowledge/*.generated.*`、锁文件 |
| ESLint 扩到 TS | `web/eslint.config.mjs` | **放弃** —— `typescript-eslint` 不支持 TS 7，详见下方「TS lint 为什么没接」 |
| pre-commit | `.githooks/pre-commit` | 对 staged 的 `.ts/.tsx/.js/.mjs/.css` 跑 `prettier --write`，对 `.ts/.tsx` 跑 `eslint --fix`，并重新暂存 |
| 接入清单 | `tools/ci/checklist.yml` | 静态阶段加 `prettier --check`，接在 `eslint` 之后 |

**`endOfLine: "auto"` 是"默认零 diff"成立的前提**：工作区是 CRLF，而 prettier 默认 `"lf"`，
用默认值会让首次 `--check` 把 100 个文件全报成"要改"，全量 `--write` 把行尾整个重写。

**生成物必须排除**：`build-knowledge.mjs` 每次构建重写它们，格式化了会被下次构建覆盖，
还会和 `build:kb --check` 的产物比对打架。

**三条限制**（用户已确认）：

1. **默认只对新代码生效** —— 既有 100 个文件不做全量格式化，零巨型 diff；
2. **全量格式化做成手动命令**（`pnpm format`），不挂任何门禁，想统一风格时自己跑；
3. ~~**ESLint 扩到 TS 后先只报不拦**~~ —— **未实施，见下方「TS lint 为什么没接」**。当前 ESLint 仍不看 TS。

### 落地顺序

1. 装 prettier + 写两个配置 → 实测 `--check` 耗时与退出码；
2. ~~装 `typescript-eslint`、改 `eslint.config.mjs` → 导出现状问题清单~~ → **已放弃**（见下节）；
3. **dev 阶段**：确认 `tsc --noEmit --watch` 可用（另开终端，不并进 `pnpm dev`）；
4. **commit 阶段**：改 `pre-commit`，staged 的 `.py` 走 ruff（format + check，**不加 `--fix`**）、
   `.ts/.tsx/.js/.mjs/.css` 走 prettier、`.ts/.tsx` 再加 `eslint --fix`
   （两版 hook 行为必须一致）→ 实测文件被正确格式化/修复并重新暂存；
5. **push 阶段**：`checklist.yml` 删 `check_prereq`；接 `prettier --check` →
   实测在 `{WEB}` 工作目录下退出码正确、整轮仍 < 30s；
6. 加 `pnpm format` / `format:check` → 更新本文档第 2 节表与耗时。

**日志相关的改动不在这个顺序里**——第 9 节已定"只在本地跑"，落地零改动。

### TS lint 为什么没接（已定：暂不接入）

**结论**：前端**只做格式化（prettier），不做 TS lint**。`eslint.config.mjs` 保持排除
`**/*.{ts,tsx}` 不变，`typescript-eslint` 不装。**等上游支持 TS 7 再重新评估。**

**这不是"配置调不通"，是 package 的设计硬不兼容**，三条实测事实：

| # | 事实 | 依据 |
| --- | --- | --- |
| 1 | TS 7 **没有 programmatic API** | TS 7 是 Go 重写的原生编译器（`tsc` 二进制，约 10x 快），**不提供编译器 API**。官方为此另发兼容包 `@typescript/typescript6`（提供 `tsc6` + 完整 TS 6.0 API） |
| 2 | `typescript-eslint` **硬拒绝** TS 7 | 它源码里有一条版本守卫，实测加载即抛 `Error: typescript-eslint does not support TS 7.0.` |
| 3 | pnpm **没能为 TS6 组合生成包实体** | `.pnpm` 里 `typescript-estree` / `project-service` / `tsconfig-utils` **只有 `_typescript@7.0.2` 后缀的实体**，没有 TS6 版 |

**为什么官方 alias 方案也走不通**：锁文件里确实写着
`typescript: '@typescript/typescript6@6.0.2'`，但 pnpm **没有为这个组合生成对应实体**。
**缺的是包实体，不是链接**——所以 `fix-node-links.mjs` 那类"补链接"的修法在这里无效
（它只能补 `.pnpm` 里已有实体的空链接）。

**三条路线与本项目的取舍**：

| 路线 | 做法 | 结论 |
| --- | --- | --- |
| A 双包共存 | `typescript@7` 做 CLI 编译 + `@typescript/typescript6` 供 parser | **弃**：两套类型检查器有语义差异风险；VSCode 要手动切换；pnpm 别名配置易出 hoist 问题（且本机 WSL 在安全黑名单里，无法验证） |
| B 全栈锁 TS6 | 不升 TS，全用 TS6，typescript-eslint 原生工作 | **弃**：本机 pnpm 生成不出 TS6 实体（事实 3），实测不可行 |
| C 放弃 TS lint | 保留 prettier，ESLint 继续只管 JS | **采纳** |

**当前实际覆盖**：`eslint .` 只检查 **35 个 `.js`/`.mjs`，0 个 `.ts`/`.tsx`**——
100 个 TS/TSX 文件**只受 `tsc --noEmit` 管**（类型对，但可疑写法如未使用变量查不出来）。

**重新评估的触发条件**：`typescript-eslint` 发布支持 TS 7 的版本。
在那之前，"TS 的 lint 覆盖为 0"是**已知且已记录**的缺口，不是遗漏——
`tsc` 那道门仍在（`push` 阶段，2s）。

### 已知坑

**hook 调 node 必须走绝对路径**。本机 `pre-commit` 用托管 Python 跑 `ruff` 时因没装 ruff
而 abort（只能 `--no-verify` 提交），同一个坑会以同样方式发生在 prettier 上——
不能依赖 `sys.executable` 继承的 PATH。

**`pnpm add` 在本机会卡 20+ 分钟**。实测 `pnpm add -D prettier` 耗时 **21m52s**
（resolve 337 个包后只新增 1 个），期间零输出，容易被误判成卡死。安装时用后台任务跑，
不要前台等。

**`pnpm add` 会因 `ERR_PNPM_IGNORED_BUILDS` 报错但不影响装包**。
实测装 prettier 时尾部报 `Ignored build scripts: unrs-resolver@1.12.2`——
这是 pnpm 的构建脚本审批机制（需 `pnpm approve-builds`），与 prettier 本身无关，
包已经装好。**别被这个错误当成安装失败而重装一遍**。

## 6. `checklist.yml` 按阶段重构（已落地）

**目标**：把清单的分组从"按性质"（静态 / build / E2E / 日志）改成"按阶段"
（dev / build / commit / push / ci / deploy），让清单本身读起来就是一张阶段地图。
`check_all.py` 相应增加 `--stage` 参数，语义从"一堆 flag"变成"跑哪个阶段"。

### 一个必须先说清的结构边界

`checklist.yml` 里的项必须满足**"一次执行、退出码表示成败"**——这是 `check_all.py`
作为执行器的能力边界。据此，三个阶段的东西**不在**这个文件里：

| 阶段 | 检查跑在哪 | 为什么不在清单里 |
| --- | --- | --- |
| dev | `tsc --noEmit --watch` + 编辑器 ESLint 插件 | 常驻进程，不退出、无退出码 |
| commit | `.githooks/pre-commit`（对 staged 文件跑 ruff / prettier） | 独立脚本，不调 `check_all.py` |
| deploy | `.github/workflows/deploy.yml` 的 live E2E | 在 workflow 里，不由清单驱动 |

所以"按阶段划分"的落地方式有两种，已选**第一种**：

1. **清单只包含可执行项**（已选）：`push` / `ci` / `build` 三个阶段进清单，
   `dev` / `commit` / `deploy` 以**空阶段 + 注释**形式保留，指明它们各自住在哪；
2. 彻底统一：把 pre-commit 也改成调 `check_all.py`——代价是 hook 要改写、
   `check_all.py` 要新增按文件列表筛选的能力，收益与复杂度不成比例。

**留三个空阶段的意义**：清单即阶段地图。不留白的话，读清单的人会以为
commit 阶段没有任何检查。

### 目标结构

| 阶段 id | 阶段名 | 包含 | 相对现状 |
| --- | --- | --- | --- |
| `dev` | 开发时 | （空，注释指向 `pnpm dev` 与 `tsc --watch`） | 新增占位 |
| `build` | 构建 | `next-build` | 由 `Site build` 改名 |
| `commit` | 提交 | （空，注释指向 `.githooks/pre-commit`） | 新增占位 |
| `push` | 推送 | 秒级静态那批 + 日志回归（11s） | 由 `Static checks` 重排 |
| `ci` | 云端 | `build-kb-parity`、`test-issue-filer`、`mutate-guards` | 新分组 |
| `deploy` | 部署后 | （空，注释指向 `deploy.yml`） | 新增占位 |

**日志回归在 `push` 里，不在 `ci` 里**（第 9 节）：`.ulg` 不入库，CI 上必然 SKIP。
它 11s，留在 push 无压力。

**`Toolchain prerequisites` 阶段删除**：`check_prereq` 撤掉（理由见第 3 节 push 一节——
CI 的 pip / pnpm 安装已等价保证）。它的 `critical: true` 语义随之消失，
`check_all.py` 里"关键阶段失败立即退出"那段逻辑需要重新审视：目前只有这一个阶段是
critical，删掉后该逻辑变成死代码。

**`build` 阶段的行为必须原样保留**（第 3 节 build 已核）：`--stage build` 仍是**显式触发**，
不并入 `push` 与 `ci` 的默认集合——CI 的 `checks` job 明确传它，pre-push 默认不传。
换句话说，`--stage ci` **不能**隐含包含 `build`，否则 CI 会跑两次 `next build`，
且本地一旦误传 `--stage ci` 就会被 144s 卡住。

### `check_all.py` 的 `--stage` 参数

```
--stage push        跑 push 阶段（本地快检，目标 < 30s）
--stage ci          跑 ci 阶段（云端）
--stage build       跑 build 阶段
--stage all         全部（默认）
--list-stages       只打印阶段与所含步骤，不执行
```

**与现有 flag 的兼容**（不破坏现有调用）：

| 老写法 | 新写法 | 处理 |
| --- | --- | --- |
| `--pre-push` | `--stage push` | 保留为别名，打印弃用提示 |
| `--with-build` | `--stage build` | 同上 |
| `--with-e2e` | 归入 `--stage ci` | 同上 |
| `--with-mutate` | 归入 `--stage ci` | 同上 |
| `--skip-logs` | 保留 | 与阶段正交，仍有效 |

**`when` 表达式保留**：它答的是"这一步在什么条件下跑"（如 `has_logs`），
与"跑哪个阶段"是两件事，不合并。

### hooks 与 workflow 跟着改（**已落地**）

| 文件 | 原状 | 现为 |
| --- | --- | --- |
| `.githooks/pre-push` | bash，`check_all.py --pre-push` | **Python**，`check_all.py --stage push`（第 12 节） |
| `.githooks/pre-push.ps1` | PowerShell | **已删除**（Git 从不调 `.ps1`，零行为损失） |
| `.githooks/pre-commit` | 仅 staged `.py` | 加解释器探测 + staged 前端走 prettier / eslint |
| `.githooks/commit-msg` | 无 | **新增**（第 11.4 节） |
| `.github/workflows/ci.yml` `checks` | `--with-build --with-e2e` | `--stage build,ci --with-e2e` |
| `.github/workflows/ci.yml` `guard-self-proof` | `--with-mutate` | **保持不变** |
| `tools/check_all.ps1` | 自己实现 eslint / E2E | **改为纯转调**，只把开关翻译成 `--stage` |

**`--stage ci` 为什么必须带上 `build`**：`--stage ci` 不含 `build`（第 3 节已定：build 是显式触发，
不得隐含），所以 CI 写 `--stage ci` 会**少跑 `next build`**。
而 `--with-e2e` **必须单独给**——它是**步骤级开关**，不是阶段开关：
`playwright-smoke` 与 `playwright-analyze` 的 `when` 都是 `args.with_e2e`，
不传它**两条一起静默跳过**（`--list-stages` 里那两行标 `[off]` 就是这个含义）。
**这两点写错都不会报错，只会安静少跑。**

**CI 两个 job 不合并**：`guard-self-proof` 只跑 `mutate-guards` 一项，
若也改成 `--stage ci` 就会与 `checks` job 重复跑同一批检查。
它继续用 `--with-mutate` 即可，`mutate_guards.py` 自己已有 `--only`，
不必在 `check_all.py` 里再造一套按步骤筛选的机制。

**`tools/check_all.ps1` 为什么从"自己实现"改成"纯转调"**：它原先在 Group 2/3 里
另写了一版 eslint 与 E2E 命令——那是同一批检查的**第二个事实源**，
与"检查内容只住 `checklist.yml`"直接冲突，两处必然漂移。
现在它只做一件事：把 `-Stage` / `-WithBuild` / `-WithE2E` / `-SkipLogs` 翻译成
`--stage` 与 `--with-*`，其余全交给 `check_all.py`。

### 两个必须防的坑

1. **`--stage push` 与"跳过逻辑"不能并存为两套机制**。现状是 `--pre-push` 同时做两件事：
   跳过 `build-kb-parity` 与 `test-issue-filer`。改按阶段后，这两项归 `ci` 阶段，
   "跳过"由阶段划分天然表达。**若还留着 flag 版的跳过，会出现
   `--stage push` 却没跳过的矛盾**。
2. **`check_hygiene` 的「产物新鲜度门还在」判据在扫 `checklist.yml` 里的
   `build-knowledge.mjs --check` 字样**。重构时那一步的 `command` 必须保持可被搜到，
   否则这道门会恒红——同一个坑上一轮刚踩过（判据落点没跟着搬家）。

### 落地顺序与验证

1. 改 `checklist.yml`：重排阶段、删 `check_prereq`、加三个空阶段；
2. 改 `check_all.py`：加 `--stage` / `--list-stages` 与老 flag 别名；
3. 同步改两个 pre-push hook、CI workflow、`tools/check_all.ps1`；
4. 更新本文档第 2、3 节；

验证清单：

- `--list-stages` 输出与本文档第 2 节表一致；
- `--stage push` 实测仍 **< 30s 全绿**；
- `--stage ci` 能跑通（本地无日志时日志项自动 SKIP）；
- 老 flag（`--pre-push` 等）仍可用；
- `check_hygiene` 五道门全绿（重点确认上面第 2 个坑）；
- `python tools/ci/mutate_guards.py --list` 仍能列出 43 条。

**待你定的三个细节**：

1. **阶段名用中文还是英文？** 建议继续英文（`push` / `ci` / `build`），与现有
   stage 名（`Static checks`）和步骤 `name` 保持同一语言，不引入中英混排。
2. **三个空阶段要不要真写进 YAML？** 若觉得是噪音，可改成只在文件头注释里画阶段地图。
3. **`--stage` 与老 flag 并存多久？** 建议至少留到所有调用点都换完，
   之后单独一个提交删掉别名。

## 7. 已改动（历史记录，回滚命令已失效）

> **状态更新**：本节描述的改动**已被后续各节吸收并确认保留**，回滚命令**已过期**
> （`.githooks/pre-push.ps1` 现已删除，第 12 节）。保留此节只为记录当时的判断依据。
> 要回滚请以当前工作区为准，不要照抄下面的命令。

未经确认先动了 6 个代码文件（另有 2 个文档改动是本文档本身）。回滚：

```bash
git checkout -- tools/ci/check_hygiene.py tools/ci/mutate_guards.py \
  tools/ci/checklist.yml .githooks/pre-push .githooks/pre-push.ps1 \
  .github/workflows/ci.yml
```

| 文件 | 改动 | 为什么 |
| --- | --- | --- |
| `tools/ci/check_hygiene.py` | 「产物新鲜度门还在」的判据改到 `checklist.yml` | 它还在搜 `check_all.py` 源码，而命令已搬到清单 → **恒红**，整轮 `check_all` 跟着 FAIL |
| `tools/ci/mutate_guards.py` | `ruff format` 修 1 处（:524） | `ruff format --check` 此前是红的 |
| `tools/ci/checklist.yml` | 接入 `check-skill-spec` / `check-mcp-spec` | 各 ~1s 且自带反例自检，白捡的覆盖 |
| `.githooks/pre-push`、`pre-push.ps1` | 默认 `--pre-push`（26s），E2E 改为 `WITH_E2E=1` | 两版参数原本不一致；E2E 移云端 |
| `.github/workflows/ci.yml` | 加 Playwright 安装 + `--with-e2e`；新增 `guard-self-proof` job | 补上本地让出的 E2E，补上无人跑的自证 |

改守卫判据后已按项目纪律自证：
`python tools/ci/mutate_guards.py --only "产物新鲜度门不再据比对结果判失败"`
→ 恰好一条红 + 还原逐字节一致。

## 8. 复测方式

项目 Python 是 `C:\Users\zhanfuyu\anaconda3\python.exe`（有 ruff / pytest / numpy / pyulog）。
托管 Python 3.13 缺科学栈，`check_artifact` 与 `check_hygiene` 会假失败。

```bash
python tools/ci/check_all.py --stage push               # 本地快检（约 31s）
python tools/ci/check_all.py --stage push --skip-logs   # 同上，但跳过日志回归
python tools/ci/check_all.py --stage ci                 # 云端那批（不含 E2E）
python tools/ci/check_all.py --stage build,ci --with-e2e  # 云端全量（next build + 冒烟 + 分析流程）
python tools/ci/check_all.py --list-stages              # 只看阶段地图，不执行
python tools/ci/mutate_guards.py --only <关键字>         # 单条自证
python tools/ci/mutate_guards.py --list                 # 看 43 条变异注册表
```

**`--with-e2e` 现在控制两条 E2E**：`playwright-smoke`（@smoke，约 1~2min）
与 `playwright-analyze`（`--grep 日志分析流程` 11 条，约 5~7min）。
只跑后者：`cd web && pnpm test:e2e:analyze`。

**旧 flag（`--pre-push` / `--with-build`）仍可用**，是别名；但新代码一律用 `--stage`，
别名留到所有调用点换完后再单独一个提交删除。

**日志回归 4 项包含在 `--stage push` 里**（本机 `tools/calibrate/logs/` 有日志时）。
换机器或新克隆的人跑出来会是 SKIP——**这是有意的**，不是坏了（第 9 节）。

**自证必须单独跑**：跑单条要给足超时（`test-issue-filer` 一次 42s），
超时被硬杀会导致变异没还原——跑完务必 `git status` 确认无残留。

## 9. 日志测试：只在本地跑（已定，无需改动）

**结论先行**：日志回归 4 项**留在本地**，`.ulg` **不提交仓库**，
CI 里这 4 项**继续 SKIP**。补充日志集**暂不做**。

这条决定把本节原先那套"压缩入库 + 解压 + CI 真跑"的方案**整段作废**。
下面是决定本身、它带来的连带影响（有几处不改就会坏），以及本节留作后用的调查结论。

### 9.1 决定与理由

**用户 2026-09-22 拍板**：「日志测试暂时只在本地，ulg 文件不提交仓库，补充日志集合以后再说」。

理由不需要我再论证——日志含真实 GPS 轨迹（`39f26cce` 首点 14.18°N/101.49°E 泰国、
`sample_log_small` 63.42°N/10.41°E 挪威），而 `CLAUDE.md` 第 9 节本就写着
"原始日志含 GPS 轨迹和作业信息……不上传服务器"。

**我上一轮建议"可以随私仓走"时漏掉了这条**：我核的是"私仓不公开"，
但项目自己的纪律是"**原始日志不上传服务器**"——它管的是"进不进版本库"，
不是"仓库看不看得见"。**是你这条纪律否决了那个建议，不是仓库可见性。**
这个区别值得记下来：以后判断这类事，先看项目自己的红线，再看技术上的可见性。

### 9.2 连带影响（不改就会坏的四处）

**这是本节最重要的部分。** 决定本身零改动，但文档里先前按"日志要入库"写下的几处，
现在都成了**错的**——照它执行会踩坑。

| # | 位置 | 原写法（现在错的） | 应改为 |
| --- | --- | --- | --- |
| 1 | 第 1 节目标形态表 | CI 该有「日志回归」 | CI **不该**有日志回归（它永远 SKIP） |
| 2 | 第 3 节 push | 「日志回归移走」（理由：日志进仓库后 CI 能跑） | 日志回归**留在本地 push** |
| 3 | 第 3 节 CI 一节 | 「`has_logs` 的判据要跟着改」 | **判据一个字都不用改**，它现在就是对的 |
| 4 | 第 4 节待办 5 / 13 | 「日志入仓库」「补 4 条日志」 | 删除这两条 |

**第 3 条特别值得留意**：我上一轮把 `check_all.py:256-257` 的 `has_logs`
描述成"判据落点没跟着数据搬家"（一个 bug）。**在"日志不入库"的前提下它不是 bug，
是正确行为**——判据查 `.ulg`，日志不在仓库里，所以 SKIP。**判据与事实一致。**
那段警告要删掉，否则会误导下一个人去"修"一个没坏的东西。

### 9.3 日志回归现状（本地，保持）

| 项 | 命令 | 实测 | 前提 |
| --- | --- | --- | --- |
| 冻结基线逐字段比对 | `compare_baseline` | 3s | 6 份日志在 `tools/calibrate/logs/` |
| 适配器契约 | `check_provider` | 3s | 同上 |
| probe-data | `run_checks_locally --probe-data` | 3s | 同上 |
| 字段引用 lint | `lint_rules --strict` | 2s | 同上 |

4 项共 11s，全部秒级，**留在本地 push 完全不影响"检查不卡进度"**。
这也是它当初能被放进 push 的原因。

**日志不在本机时怎么办**：`when: has_logs` 会让这 4 项干净地 SKIP 并打印提示，
不会崩。**新机器 / 新克隆的人需要自己备日志**——见 9.5 的两个自带样本与 9.4 的获取方式。

### 9.4 日志从哪来（本地自备）

`.cache/px4/ulog/` 目前有 9 条已下载（含 4 条未入基线），
`tools/px4/download_px4_logs.py` 可继续下。**这些都在 `.gitignore` 里，不会误提交。**

**关键核对**（`git check-ignore` 实测，确保不会有人手滑提交）：

| 路径 | 会被提交吗 |
| --- | --- |
| `tools/calibrate/logs/*.ulg` | **不会**（`.gitignore:24` 的 `*.ulg` 规则） |
| `tools/calibrate/logs/*.bin` | **不会**（`.gitignore:25`） |
| `.cache/px4/ulog/*` | **不会** |

**这条要在每次有新人加入时验一次**——忽略规则是"日志不入库"这个决定的**唯一执行机制**，
它一旦被改动或加白名单，决定就失效了。

**下载脚本的三个实测坑**（留在这里，将来真要补日志时直接能用）：

1. **`--version` 是子串匹配**（`matches_filters` 里用 `in`）：`v1.15` 会连带匹配
   `v1.15.2` / `v1.15-rc1`，也会漏掉 firmware 写成 `1.15.0`（无 `v`）的条目。
2. **`--max-size-mb` 不作用于 `--list-only`**：它只在 `http_get` 下载时流式截断，
   候选列表阶段不筛体积 → "列表看着合格"≠"下下来完整"，必须事后核落盘大小。
3. **`--search` 走服务端 DataTables `search[value]`，不是字段语法**：
   `--search "1.13.2"` 有效（5 条），`--search "firmware:v1.13"` 返 0 条。
   另外 `--max-scan` 默认只翻最近 300 条，老版本日志要靠它才翻得到。

### 9.5 现有 6 份日志的实测全貌（留作后用）

**机型分布**：fixed_wing ×2 / **rover ×1** / rotary_wing ×3。
（`95b077d9` 实际是 **rover**，不是多旋翼——我早先的文档在这里写错过一次。）

| 日志 | 固件 | profile | 机型 | 硬件 |
| --- | --- | --- | --- | --- |
| `39f26cce-…` | 1.16.0 | px4-1.15+ | fixed_wing | PX4_FMU_V6C |
| `95b077d9-…` | 1.17.0 | px4-1.15+ | **rover** | PX4_FMU_V6X |
| `ce302d3b-…` | 1.17.0-alpha | px4-1.15+ | fixed_wing | PX4_FMU_V5 |
| `efd2ee9d-…` | 1.15.0 | px4-1.15+ | rotary_wing | DAMIAO_DM_FC01 |
| `sample.ulg` | 未知（无版本号） | px4-legacy | rotary_wing | AUAV_X21 |
| `sample_log_small.ulg` | 1.11.2 | px4-legacy | rotary_wing | CUBEPILOT_CUBEORANGE |

**版本分布**：1.11.2 / 1.15.0 / 1.16.0 / 1.17.0 ×2 / 未知。

**15 个规则 group 的命中矩阵暴露的三个空档**（将来要补日志时按这个补）：

1. **1.13 / 1.14 完全没有**，且 `knowledge/px4/meta/` **也没有这两档字典**
   （只有 v1.15.0 / v1.16.0 / main）→ 补日志是日志侧字段源的**唯一**补法；
2. **`battery` 组 6 份全 SKIP** —— 没有一份有可用的 `battery_status`；
3. **`vtol_transition` 只有那条 7 秒的日志跑到过** —— 7 秒的过渡判定不可信。

另外 **1.15 档只有 1 条日志（`efd2ee9d`）却带 6 个独有 topic**（1.16 档才 2 个），
说明补 1.15 比补新版本信息密度更高。

### 9.6 冻结基线的硬约束（与是否入库无关，仍然有效）

**每个 `baseline/*.json` 的 `log` 字段锁死了文件名**
（`compare_baseline.py:54` 的 `find_log`），少一个文件 → `FileNotFoundError` → 该项直接失败。
所以**本地删日志要小心**：删了某个 `.ulg` 会让 `compare_baseline` 直接报错，
不是安静跳过。

**要冻结新基线，先逐条看 findings**：新增基线等于把当前引擎输出钉死，
日志里本就有异常（比如 `crashed` 标记）的话，冻结后它会变成**永久红灯**。

### 9.7 本节留下的可复用资产

下面这些是本节调查出来的、**与"入不入库"无关**的结论，别随着方案作废一起丢掉：

- **Git LFS 在 gitee 用不了**（实测 403：`LFS only supported repository in paid or trial
  enterprise`，对照组 `oschina/git-osc` 同请求 200）。**将来真要存大文件，别再走这条路。**
- **xz 对 ULog 的压缩率是 40.8%**（39.2MB → 16.0MB，最大单文件 16.33MB → 7.21MB）。
  本机没有 `xz` 命令行工具，但 Python 标准库自带 `lzma`。
- **`baseline/*.json`、回归读的 13 个标量、base64 的 `phases` 都不含坐标**——
  坐标只在原始 `.ulg` 里。**这条对"要不要给别人看 baseline"仍然有用。**

### 9.8 两个同名但不同的 `sample.ulg`（重要）

**`sample.ulg` 这个名字在仓库里指向两份内容完全不同的文件**，
这一点在把 E2E 接进 CI 时是决定性的：

| 路径 | 入库 | 大小 | topic 数 | 时长 | GPS |
| --- | --- | --- | --- | --- | --- |
| `tools/calibrate/logs/sample.ulg` | ❌ 不入库（`.gitignore`） | 4.0MB | 15 | 69s | — |
| `web/e2e/fixtures/sample.ulg` | ✅ **入库** | 921KB | 70 | 1174s | 63.417°N / 10.408°E |

**结论**：`playwright-analyze` 能在云端真跑，靠的是右边那份
（`web/e2e/fixtures/sample.ulg`，已入库）；而左边那份与日志回归 4 项一样，
云端必然 SKIP。**同为 `sample.ulg`，一个能进 CI、一个不能——别把它们当成同一份文件。**

**已经存在的隐私张力（用户已知情并接受）**：`web/e2e/fixtures/sample.ulg` 含真实 GPS 轨迹，
却已入库，与 CLAUDE.md 第 8 节「原始日志含 GPS 轨迹和作业信息……不上传服务器」存在张力。
用户 2026-09-22 裁决**保留现状**（理由：该文件早在 2026-09-19 就随 E2E 提交入库，
来源为公开的 logs.px4.io）。

⚠️ **这条裁决的连带影响**：今后引用"原始日志不入库"时**不能当作通用红线**——
它现在只对 `tools/calibrate/logs/*.ulg` 成立，对 E2E fixture 已有既定例外。
若要彻底消除张力，可改用合成 fixture（脚本生成、无真实轨迹），
但那是独立一项工作，不在本轮范围内。

## 10. `@smoke` 标记重整（已落地）

**要解决的事**：`--grep @smoke` 现在只跑 2 个用例，其中一条自带 420s 超时。
花 7 分钟只验 2 条，性价比极差；而覆盖面最广的 15 个关键页面（`pages.spec.ts`）
一条 `@smoke` 都没打——**冒烟漏掉了最该冒烟的部分**。

### 10.1 现状（已核对）

`@smoke` 只出现在 `web/e2e/analyze.spec.ts` 两处：

| 用例 | 行 | tag | 自带 timeout |
| --- | --- | --- | --- |
| 「分析入口页渲染正常」 | :7 | `@smoke` | 30s |
| 「上传 .ulg 并完成分析（解析→显示断言）」 | :19 | `@smoke` | **420s** |

`web/e2e/pages.spec.ts`（15 个关键页面 + 8 个 skill 详情 + 2 个 MCP 详情 + 4 个交互）
**一条 `@smoke` 都没有**。

### 10.2 一个必须先说的坑（已实测，不是推测）

`package.json` 的 `test:e2e:analyze` 用的是**中文描述 grep**：

```json
"test:e2e:analyze": "playwright test --grep '日志分析流程'"
```

`日志分析流程` 是 `test.describe(...)` 的**名字**，不是 `test(...)` 的名字。
**实测确认：Playwright 的 `--grep` 匹配完整标题链**（`describe › test`），
所以它确实能匹配到：

```bash
node node_modules/@playwright/test/cli.js test --grep '日志分析流程' --list
# → [chromium] › analyze.spec.ts:7:9 › 日志分析流程 › 分析入口页渲染正常
#   …（共 11 条）
#   Total: 11 tests in 1 file
```

**11 条，不是 0**——判据成立。（这条必须实测的道理：同一类判据写错上一轮就发生过，
`--grep-invert '日志分析流程'` 曾因判据不对而失效，见 `2026-09-19` 记录。）

**而且 tag 与它正交**：移出 `@smoke` 只改 tag，describe 名不动 →
`test:e2e:analyze` 的 11 条**一条都不会少**，其中就包含那条 420s 的用例。
**所以不用改 `test:e2e:analyze`。**

### 10.3 实测用例数（改动的基准）

```bash
node node_modules/@playwright/test/cli.js test --list                  # Total: 42 tests in 2 files
node node_modules/@playwright/test/cli.js test --grep '@smoke' --list  # Total: 2 tests in 1 file
node node_modules/@playwright/test/cli.js test pages.spec.ts --list    # Total: 31 tests in 1 file
node node_modules/@playwright/test/cli.js test --grep '日志分析流程' --list  # Total: 11 tests in 1 file
```

| 集合 | 现状 | 改后应为 |
| --- | --- | --- |
| 全量 | **42** | **42（不变）**——只动 tag，不删测试 |
| `@smoke` | **2** | **16**（15 页面渲染 + 1 条 `analyze` 渲染） |
| `pages.spec.ts` | 31（0 个 `@smoke`） | 31（15 个 `@smoke`） |
| `日志分析流程`（describe） | 11 | **11（不变）** |
| `test:e2e:analyze` 实际跑到 | 11 条 | 11 条（含那条 420s） |

**注意 `日志分析流程` 是 11 条不是 5 条**：`test:e2e:analyze` 现在跑的是整个 describe，
包括「历史记录可见」「上传非 .ulg 文件不崩溃」等——**它不是"只跑那条 420s"的精确靶子**，
而是"跑分析流程那一组"。要精确只跑那条，得用 `--grep '上传 .ulg 并完成分析'`。

### 10.4 改动清单

| 文件 | 改动 | 理由 |
| --- | --- | --- |
| `web/e2e/pages.spec.ts` | 「关键页面渲染」describe 下 15 条标 `@smoke` | 覆盖面最广、单条最快（只验 HTTP 200 + 无错误覆盖层） |
| `web/e2e/analyze.spec.ts:19` | 去掉 `tag: "@smoke"`，**保留 420s timeout** | 它是"按需跑"的那条，不再进冒烟 |
| `web/package.json` | `test:e2e:analyze` 保持 `--grep '日志分析流程'` | 判据是 describe 名，不受 tag 变化影响 |
| `tools/ci/checklist.yml:152` | `playwright-smoke` 的 timeout **从 180s 调到 300s** | 见 10.5 |
| `docs/dev/checks-by-stage.md` | 更新第 2 节表的冒烟行 | 耗时变了 |

**只标「关键页面渲染」那 15 条，不标全部**：

- 标 `@smoke` 的是"**每次都必须过**"的最小集，不是"能跑的全都跑"；
- 15 条 = 首页 + 9 个 guide 页 + `/analyze` + `/skills` + `/mcp` + `/me` + `/login` + `/issue`，
  **覆盖了全部路由骨架**（`CRITICAL_PAGES` 列表，`pages.spec.ts:3`，实测 15 对）；
- `pages.spec.ts` 剩下的 16 条（8 个 skill 详情 + 2 个 MCP 详情 + 4 个交互 + 2 个 MDX 检查）
  留全量跑——它们验的是数据层渲染细节，
  由 `build:kb --check` 与 `check-skill-spec` 在静态层守着。

### 10.5 耗时账（这是要核的关键数）

**移出 420s 的那条是本次最大的收益**，但要核实收益不被新增的 15 条抵消：

| 项 | 改前 | 改后 |
| --- | --- | --- |
| 冒烟含的用例 | **2 条**（30s + 420s，实测 `--list` 确认） | **16 条**（15 页面渲染 + 1 条 `analyze` 渲染） |
| 冒烟最坏耗时 | **约 7 分钟**（420s 那条主导） | 待实测（预计 1~2 分钟） |
| 全量 E2E | 42 条（含 420s 那条） | **42 条不变** |

**`checklist.yml` 的 timeout 180s 必须跟着调**：
`pages.spec.ts` 用 `waitUntil: "networkidle"`，15 个页面各等一次，
**首次编译 + 冷启动下 180s 未必够**。调到 **300s** 留余量——
这个 timeout 是"卡死保护"不是"性能预算"，冒烟真跑满 5 分钟已经该查原因了。

**实测方法**（落地时必须跑，不能估）：

```bash
cd web
node node_modules/@playwright/test/cli.js test --grep '@smoke' --list          # 应是 16 条
node node_modules/@playwright/test/cli.js test --grep '@smoke'                 # 再测实际耗时
node node_modules/@playwright/test/cli.js test --grep '日志分析流程' --list     # 应仍是 11 条
```

### 10.6 与其它阶段的联动

| 位置 | 影响 |
| --- | --- |
| CI `checks` job（`--with-e2e`） | 冒烟变快且**多验 15 个页面**；**另加一步 `playwright-analyze` 跑回 420s 那条** |
| `deploy.yml` 部署后 E2E | 跑**全量 42 条**（`playwright.live.config.ts` 无 grep），**不受影响** |
| `.githooks/pre-push` | `WITH_E2E=1` 时跑冒烟 + 分析流程；本地默认仍不跑 |
| `web/playwright.live.config.ts:8` | 注释里写着"`--grep '@smoke'` 可做升级后冒烟"——**改后这句话仍成立**，且更划算 |

**部署后那一关不受影响**：它跑全量，不含 grep。

**一处曾需要确认的覆盖率问题（现已解决）**：CI 原本只跑 `--grep @smoke`
（`checklist.yml` 一条命令），**不跑全量 E2E**。所以 420s 那条从 `@smoke` 移出后：

| 场合 | 移出前 | 移出后（当时） | **现在** |
| --- | --- | --- | --- |
| CI | **跑**（它是 `@smoke`） | **不跑** | **跑**（新增 `playwright-analyze`） |
| 本地 `pnpm test:e2e:analyze` | 跑（11 条里含它） | 跑（不变） | 跑（不变） |
| 部署后全量 E2E | 跑 | 跑 | 跑 |

**即：一度从"CI 时守"退成"上线时守"。现已接回 CI** ——
`checklist.yml` 新增 `playwright-analyze` 步骤（`when: args.with_e2e`，timeout 900），
跑 `--grep 日志分析流程` 共 11 条。用户 2026-09-22 拍板：「CI 要跑 test:e2e:analyze」。

**为什么这条能在云端真跑（而日志回归不能）**：它上传的是
`web/e2e/fixtures/sample.ulg`——**已入库**的 fixture，不是 `tools/calibrate/logs/` 下的
本地日志。所以云端 checkout 里也有，不需要 `has_logs` 门控。
**这两类"日志"必须分清**：`tools/calibrate/logs/*.ulg` 是校准用的真实飞行日志（不入库），
`web/e2e/fixtures/sample.ulg` 是 E2E 的固定输入（入库）。**同名不同物——文件内容都不一样**
（前者 4.0MB / 15 条 topic / 69 秒，后者 921KB / 70 条 topic / 1174 秒）。

**代价与预算**：这一步约 5~7 分钟（Pyodide 首次下载 WASM + numpy + pyulog），
是 CI `checks` job 里最长的一步。当前该 job 预算 `timeout-minutes: 40`，
实测估算全流程约 17 分钟（含 build 144s、冒烟、11 条分析流程），余量约 2.3 倍。

**注意 `playwright-analyze` 与 `playwright-smoke` 都受 `--with-e2e` 控制**：
漏传这个 flag 会让**两步一起静默跳过**。这就是 `ci.yml` 里那句注释要强调的原因。

### 10.7 落地顺序与验证

1. `node node_modules/@playwright/test/cli.js test --grep '日志分析流程' --list`
   → **确认列出 11 条**（不是 0，也不是 5）；
2. 给 `pages.spec.ts` 的「关键页面渲染」15 条加 `tag: "@smoke"`；
   **注意 Playwright 的 tag 写法**——`test(name, { tag: "@smoke" }, fn)`，
   `test.describe` 里循环生成的用例同样适用；
3. 去掉 `analyze.spec.ts:19` 的 `tag: "@smoke"`，**保留 `timeout: 420_000`**；
4. `--grep @smoke --list` → 确认 **16 条**，**不是 0**；
5. 实测 `--grep @smoke` 耗时 → 据此定 `checklist.yml` 的 timeout（建议 300s）；
6. 跑一次 `--grep @smoke` 看是否真的全绿（15 个页面在本地 dev server 下都该过）；
7. 确认 `--grep '日志分析流程' --list` 仍列出 **11 条**（没被 tag 变化影响）。

**验证清单**：

- `--grep @smoke --list` 输出**恰好 16 条**，且包含首页与 `/guide/*`；
- `--grep '日志分析流程' --list` 输出**仍是 11 条**（不受影响）；
- `--grep @smoke` 实测耗时 **< 300s**；
- 全量 `--list` 仍是 **42 条**（只动 tag，没删测试）；
- **移出的那条仍在某处被跑**——部署后全量跑它（CI 不跑，见 10.6 待你确认）。

## 11. 四项补强（已落地）

这四项原先都列在"建议补（优先级低）"，**用户已确认全部要做**。
每条都写清"改哪个文件 + 实测事实"，其中两条有必须先说清的坑。

### 11.1 删掉死参数 `SKIP_LOG_ANALYSIS`

**事实核对：仓库里已经一处都不剩了。** 全仓扫（排除 `node_modules` / `.next` /
报告产物）只在**工作记录与本文档**里找到，代码与配置里**零命中**：

| 位置 | 性质 |
| --- | --- |
| `.workbuddy/memory/2026-09-19.md:19` | 历史记录，说"保留 `SKIP_LOG_ANALYSIS=1` 逃生" |
| `.workbuddy/memory/2026-09-22.md:208` | 本次查出的缺口描述 |
| `docs/dev/checks-by-stage.md:313` | 本文档 |

**但 `checklist.yml:154` 的 `{ENV.SKIP_LOG_ANALYSIS}` 占位符还在**：

```yaml
command: ["{NODE}", "node_modules/@playwright/test/cli.js", "test", "--grep", "@smoke", "{ENV.SKIP_LOG_ANALYSIS}"]
```

`check_all.py` 的 `_build_placeholders` 把 `{ENV.XXX}` 解析成"环境变量有值就代入，
没有就是空串"。所以现状是：**这个占位符恒等于空串**——没人设过这个变量，
设了也没人读。**这是本次要删的实体。**

**改动**：

| 文件 | 改动 |
| --- | --- |
| `tools/ci/checklist.yml:154` | 删掉末尾的 `"{ENV.SKIP_LOG_ANALYSIS}"` 参数 |
| `.githooks/pre-push.ps1` 注释 | 若提到该逃生口，一并删（当前无，无需改） |

**顺带说明为什么它不会再被需要**：第 10 节把 420s 那条移出 `@smoke` 后，
冒烟里只剩快用例（15 个页面渲染 + 1 个入口渲染），**没有需要"跳过"的东西了**。
留着这个逃生口反而危险——它会让"跳过日志分析"看起来是一等公民能力，
实际早已无人实现。

### 11.2 secret 扫描

**要扫什么**：仓库里有没有误提交的密钥。项目约定"密钥只在边缘函数 / EdgeOne 控制台
环境变量"，但**这条约定此前没有任何机器检查**。

**不引入新依赖**（关键决定）。项目已有 `web/lib/error-policy.js` 的 `SCRUB_RULES`
——正是"什么算敏感串"的既有权威，7 条规则已覆盖：

```js
email / JWT(eyJ…) / Bearer token / 24+ 位 hex / Windows 用户路径 / POSIX 用户路径 / IP
```

**复用它是唯一说得通的做法**：如果扫描用另外一套规则，就会出现
"issue 脱敏认为安全的串，扫描判定为密钥"（或反过来）——**两套判据打架，
最后一定有人把扫描关掉**。现状里 `test-issue-filer.mjs:322` 已经明令
"这些字面量只许活在 `lib/error-policy.js` 里"，扫描器接进来正好遵守同一条纪律。

**新增 `tools/ci/check_secrets.py`**（Python，与其它 `tools/ci/` 检查同语言）：

| 判据 | 说明 |
| --- | --- |
| 扫哪些文件 | 被 git 跟踪的文本文件（`git ls-files`），排除锁文件与报告产物 |
| 扫什么 | 与 `SCRUB_RULES` 等价的规则 + **项目专属的高危模式**：`EDGEONE_API_TOKEN` / `AUTH_SECRET` / `DEEPSEEK_API_KEY` / `SMTP_PASS` 后面跟真实值 |
| 什么算失败 | 命中"键名 + 看起来是真值的串"——**只有键名不给失败**（`.env.example` 与文档里到处是键名） |
| 白名单 | 明确列出允许的假值：`<email>` / `Bearer <token>` / `your-token-here` / `${...}` 占位式 |

**最容易搞错的地方（必须防）**：**只查键名会误报到不可用**——
`docs/operations/README.md` 里写 `EDGEONE_API_TOKEN` 是正常文档行为。
判据必须是"**键名 + 值**"的组合，且值是**看起来像真凭据**的形状
（长度 / 字符集 / 非占位符）。**这一条写不对，扫描器上线第一天就会被人 `--no-verify` 掉。**

**位置**：`push` 阶段（`checklist.yml` 静态那批），秒级。

### 11.3 依赖漏洞审计

**实测事实（两条都不是猜的）**：

**① `pnpm audit` 在本机直连跑不了。** 本机 registry 配的是 `registry.npmmirror.com`
（`~/.npmrc`），该镜像**没实现 audit 端点**：

```
$ pnpm audit --audit-level=high
ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS
  × The audit endpoint (at https://registry.npmmirror.com/-/npm/v1/security/advisories/bulk) doesn't exist.
```

**换官方 registry 就通，实测 5.7s 且当前干净**：

```bash
$ pnpm --registry=https://registry.npmjs.org/ audit --audit-level=high
No known vulnerabilities found          # real 0m5.762s
```

**② `pip-audit` 从官方 PyPI 可装，从 aliyun 镜像装不了**：

```
$ pip download pip-audit --no-deps                    # aliyun 镜像
ERROR: No matching distribution found for pip-audit   # 该源被 pip 判定为不安全 HTTP

$ pip download pip-audit --no-deps --index-url https://pypi.org/simple
Saved pip_audit-2.10.1-py3-none-any.whl               # 成功，2.10.1
```

**改动**：

| 文件 | 改动 |
| --- | --- |
| `requirements-dev.txt` | 加 `pip-audit==2.10.1`（钉版本，理由同 ruff：跨版本结论会变） |
| `tools/ci/checklist.yml` | 新增 `pip-audit` 步骤：`--strict` 跑 `requirements-dev.txt` 里的依赖 |
| `tools/ci/checklist.yml` | 新增 `pnpm audit` 步骤，**必须带 `--registry=https://registry.npmjs.org/`** |
| `.github/workflows/ci.yml` | 无需改（CI 未配 registry，默认就是官方源） |

**坑（必须写进命令）**：`pnpm audit` 那一步**如果直接写 `pnpm audit`，在本机必红**
（因为本机 `~/.npmrc` 指向 npmmirror），而 CI 上是绿的——**"本地红、CI 绿"是最坏的一种不一致**。
所以命令里**显式带 `--registry`**，两边行为一致。

**位置**：CI（`ci` 阶段）。理由：它要联网查外部漏洞库，
放 push 会让联网抖动卡住提交；而依赖变更频率低，CI 每次跑足够。

**上线第一次运行就抓到了真漏洞（2026-09-22 实测）**：

```
pytest 8.3.4
  PYSEC-2026-1845 / CVE-2025-71176 / GHSA-6w46-j5rx-g56g
  CVSS 3.1: AV:L/AC:L/PR:N/UI:N/S:C/C:L/I:L/A:L
```

性质：pytest ≤ 9.0.2 在 UNIX 上按 `/tmp/pytest-of-{user}` 这一可预测命名创建目录，
本地用户可借此 DoS 或提权。**攻击向量是 `AV:L`（本地），没有网络向量**，
所以它不构成对外暴露面——但也正因为"靠人看是看不出问题的"，它适合交给机器守。

处置（已落地）：

| 项 | 内容 |
| --- | --- |
| 裁决 | 升级，不豁免（用户决定） |
| `requirements-dev.txt` | `pytest==9.0.3`，并在注释里写明"9.0.3 是安全下限" |
| 复跑 | `pnpm audit` 6s 通过、`pip-audit` 秒级通过 |

**这条守卫的价值证明**：它不是恒绿的。上线第一天就抓到真问题，
且抓到的是"人肉 review 绝对发现不了"的那一类。这正是"守卫自己也要被校验"
的落地反面——一个从来没红过的审计项，值得怀疑它到底有没有在工作。

### 11.4 commit message 规范

**事实：项目已经有事实上的约定，只是没写成规则。** 最近 15 条提交全部符合
Conventional Commits：

```
feat(web): … / fix(ci): … / chore: … / refactor(ci): … / perf(ci): … / style(ci): … / docs: … / test(web): …
```

**所以这不是"引入新规范"，是"把已经在用的规范变成机器检查"**——
这正是本项目"守卫自己也要被校验"的口径。

**新增 `.githooks/commit-msg`**（`core.hooksPath` 已指向 `.githooks`，放进即生效）：

| 检查 | 判据 |
| --- | --- |
| 格式 | `^(feat\|fix\|chore\|docs\|refactor\|perf\|style\|test\|build\|ci\|revert)(\([a-z0-9-]+\))?: .+` |
| 首行长度 | ≤ 72 字符（**不设下限**：`chore: x` 这类短标题是合理的） |
| 空 message | 拒绝（`git commit --amend` 留下的空模板也算） |
| 例外 | `Merge ` / `Revert ` 开头的自动提交放行 |

**为什么不卡正文**：`CLAUDE.md` 级的约定是"结论先行、风险不粉饰"，
但提交正文写多细是人的自由；**卡正文格式只会逼人写废话**。

**括号只认圆括号**（`feat(web): …`）。方括号版本（`feat[web]: …`）在 `sh` 与 Git 配置里
是转义地雷，而项目 15 条真实提交**只用了圆括号**——按实际风格写，不按文档常见写法写。
（实现细节见第 12.6 节。）

**逃生口**：`git commit --no-verify` 照旧可用（与其它 hook 一致）。

**与第 5/6 节的关系**：`commit-msg` 与 `pre-commit` 是**两个独立 hook**
（`pre-commit` 管格式化、`commit-msg` 管标题），互不干扰，都在本地 commit 阶段。

### 11.5 落地顺序与验证

> **状态：四项全部已落地（2026-09-22）。** 下面保留原计划步骤，实测结果见本节末尾的验证表。

1. **11.1**：删 `checklist.yml:154` 的 `{ENV.SKIP_LOG_ANALYSIS}`
   → 跑一次 `--grep @smoke --list` 确认命令仍能拼出（占位符删掉后不该留空参数）；
2. **11.2**：写 `tools/ci/check_secrets.py`
   → **先对当前仓库跑一遍，应当零命中**（若命中，说明仓库里真有东西，先报给我）；
   → 造一个形态像密钥的假值验证它会红，**再删掉**（这一步确实红了——见上面的实测结果表）；
   → ⚠️ **别把这句假值写进任何入库文件**：本检查扫的是全仓跟踪文件，
     文档里留一句示例同样会被它自己抓到。本文件就因此红过一次
     （`AUTH_SECRET` 后跟一串占位数字被判定为凭据形态），改成描述性说法才通过。
     **写法与判据的边界要留意**：这道守卫认的是"键名 + 像值的串"这个形状，不区分是不是示例。
3. **11.3**：`requirements-dev.txt` 加 `pip-audit==2.10.1`；
   `checklist.yml` 加两步 → 实测两步耗时；
4. **11.4**：写 `.githooks/commit-msg` → 用 `git commit --dry-run` 之外的方式验证
   （写一个坏标题的临时提交，确认被拒，再 `--no-verify` 提交）；
5. 更新本文档第 2 节表（新增"机密"与"审计"两类）与第 3 节各阶段说明。

**验证清单（实测结果）**：

| 验证项 | 结果 |
| --- | --- |
| 删占位符后 `playwright-smoke` 命令拼出无多余空参数 | ✅ |
| `check_secrets.py` 对当前仓库零命中（`git ls-files` 全扫） | ✅ |
| 造出的假密钥能被抓到（新守卫必须先红一次） | ✅ |
| `pnpm audit` 与 `pip-audit` 本机与 CI 行为一致（registry 差异已消除） | ✅ |
| `commit-msg` 对真实提交信息全部放行（不误伤既有风格） | ✅ |
| 坏标题（如 `update stuff`）被拒 | ✅ |

**实施中暴露出、且已修掉的两个真问题**（详见第 2 节与 11.3 节）：

1. **`pnpm-audit` 的路径是错的**——写成 `{NODE} web/node_modules/pnpm/bin/pnpm.cjs`，
   但 `pnpm` 是全局工具，**在 `web/node_modules/` 下根本不存在**。
   这条检查在**任何机器上都恒红**。修法是新增 `{PNPM}` 占位符走 PATH。
2. **`pytest 8.3.4` 有真漏洞**——`pip-audit` 第一次运行就抓到
   `PYSEC-2026-1845`（详见 11.3 节）。这说明审计项一上线就有效，不是摆设。

## 12. hook 语言统一（已落地）

**决定**：`.githooks/` 下**只留 Python 实现**——`pre-commit`、`pre-push`、`commit-msg` 各一份，
bash 版与 `.ps1` 全部删除。

### 12.1 现状（实测）

| 文件 | shebang / 形态 | 谁调它 |
| --- | --- | --- |
| `.githooks/pre-commit` | `#!/usr/bin/env python` | Git（commit 时） |
| `.githooks/pre-push` | `#!/bin/bash` | Git（push 时） |
| `.githooks/pre-push.ps1` | PowerShell | **没人调**——纯手动辅助脚本 |

`git config core.hooksPath` = `.githooks`（已确认）。

**`.ps1` 本来就不会被 Git 调用**：Git 在 Windows 上只认**无扩展名**的 hook，
或 `.exe` / `.bat` / `.cmd`。`.ps1` 从来不在候选里。
所以删它**零行为损失**——它现在的作用只是"人手动跑的一次性辅助"，
而这个能力 `pre-push` 的 `FULL_PUSH=1` / `WITH_E2E=1` 环境变量已经完全覆盖。

### 12.2 关键坑：`python` 不等同于"有 ruff 的 python"

**这是本节全部设计的起因，必须写进命令注释。**

实测本机 `python` 解析到 **托管 Python 3.13.12**（`.workbuddy/binaries/python/...`），
它**没有 ruff**；而项目要的是 `C:/Users/zhanfuyu/anaconda3/python.exe`（ruff 0.16.7）。

**为什么这条致命**：新 `pre-push` 里跑 `python tools/ci/check_all.py`——
`check_all.py` 内部用 `sys.executable -m ruff` 跑格式化检查。
如果 hook 自己是被托管 Python 启动的，那么 `sys.executable` 就是托管 Python，
ruff 那一步直接 `No module named ruff` → **每次 push 都红**。
（这正是 `pre-commit` 在本机曾经坏掉的根因。）

**推论**：不能靠 shebang 让 hook "自动生效"，hook 必须**自己找到对的解释器**。

### 12.3 最终文件布局（三个文件，全 Python）

| 文件 | 职责 | 探测解释器 |
| --- | --- | --- |
| `.githooks/pre-commit` | 格式化 + `ruff check` staged `.py` | **要**（见 12.4） |
| `.githooks/pre-push` | 调 `check_all.py --pre-push` | **要** |
| `.githooks/commit-msg` | 校验提交标题（第 11.4 节） | 不需要（纯字符串） |

**删除**：`.githooks/pre-push` 的 bash 版内容、`.githooks/pre-push.ps1`。

### 12.4 解释器探测怎么写

三个约束：

1. **优先 anaconda，回退 PATH 上的 `python`**。顺序不能反——
   托管 Python 恰好排在 PATH 前面，反了就等于没探测。
2. **探测不到时按需 `re-exec`**：若 `sys.executable` 不是选中的那个、且 hook 是被 Python 启动的，
   用 `os.execv` 换到选中的解释器重跑自己（加一个环境变量哨兵防无限递归）。
3. **`exit 127` 是逃生门**：如果两个候选都不可用，
   **打印一条明确的"缺什么"再 `exit 127`，由 Git 放行**——不堵死提交。

第 3 条是本项目的纪律（第 11.2 节的"错误信息要说清缺什么"同源）：
**hook 的职责是提醒，不是把人锁在门外**。而且用户原本的诉求就是"别卡在检查上"。

**候选顺序**（写死，不读配置文件——多一个事实源就多一处会腐烂）：

```
1. C:/Users/zhanfuyu/anaconda3/python.exe   存在且能 import ruff → 用它
2. shutil.which("python")                    存在且能 import ruff → 用它
3. 都不行 → 打印"未找到带 ruff 的 Python" + 复测命令 + exit 127
```

### 12.5 命令调用口径：经 PATH，不用 `sys.executable`

新 `pre-push` 调 `check_all.py` 时用 **`"python"` 这个裸命令**（让子进程继承 PATH），
不用 `sys.executable`。理由：`check_all.py` 是"单一事实源"层，
它自己怎么找 ruff 是它的内部事；hook 只需保证**命令行上的 `python` 是对的**。

`pre-commit` 不同：它已经有 `sys.executable -m ruff` 的写法（现成、能用），
**保留这个写法**，在前置探测里把"对的解释器"落实成 `sys.executable` 即可。

### 12.6 两处需要补的细节（实测发现）

**Windows 上 Git 用 `/bin/sh` 启动 hook，脚本里一律用 `/` 分隔符。**
连 `python.exe` 之前那一节也写成 `C:/Users/.../python.exe`——
反斜杠会被 sh 当转义符吃掉。

**第 11.4 节的 `commit-msg` 要补一条判据。** 现行格式正则沿用了 Conventional Commits 文档
里常见的 `\[[^\]]+\]`（方括号），但这在 `sh` 里和 Git 配置里都是转义地雷；
项目自己的 15 条真实提交**只用了圆括号**（`feat(web): …`）。
所以改成：

| 判据 | 写法 |
| --- | --- |
| 合法标题 | `^(feat\|fix\|chore\|docs\|refactor\|perf\|style\|test\|build\|ci\|revert)(\([a-z0-9-]+\))?: .+` |
| 括号形态 | **只认圆括号** `(...)`，不用方括号（避免 `sh` / Git 配置里的转义歧义） |

### 12.7 落地顺序与验证

1. 改 `pre-commit`：加解释器探测 + `re-exec`，**保留** `sys.executable -m ruff` 的调用写法；
2. 写 Python 版 `pre-push`（逻辑照搬 bash 版的三分支：默认快检 / `WITH_E2E=1` / `FULL_PUSH=1`），
   加同样的探测；
3. **删** `.githooks/pre-push.ps1`；
4. 写 `.githooks/commit-msg`（第 11.4 节，圆括号判据）。

**验证清单**：

| # | 验证 | 期望 |
| --- | --- | --- |
| 1 | 新 `pre-commit` 跑一次 staged `.py` | ruff 真的有反应（不再是 `No module named ruff`） |
| 2 | 新 `pre-push` 默认跑一次 | 走到 `check_all.py --pre-push` 且**不出** `No module named ruff` |
| 3 | `FULL_PUSH=1` / `WITH_E2E=1` 两个分支 | 参数与旧 bash 版**完全一致**（否则"本机过了"在不同 shell 下是两件事）——⚠️ **本轮实测发现这条没做到**，见 12.9 |
| 4 | 把候选 1 临时改名，观察回退 | 落到候选 2；两个都不行时**exit 127 且 Git 放行** |
| 5 | `commit-msg` 对最近 15 条真实提交 | 全部放行 |
| 6 | `commit-msg` 对 `update stuff` | 被拒 |
| 7 | 全仓再扫一次"有没有别处引用 `pre-push.ps1`" | 零命中（已确认，删了不破坏任何调用点） |

**逃生口**：`git commit --no-verify` / `git push --no-verify` 照旧可用。

### 12.8 与第 11 节的关系

第 11.4 节给出 `commit-msg` 的**判据**，本节给出它的**实现语言与探测口径**——
两者是同一件事的两半，实施时一起做。

**本节不动 `checklist.yml`**：hook 只负责"什么时候调 `check_all.py`"，
检查内容全在清单里（第 1 节第三条依据）。

### 12.9 落地后发现并修掉的一个真 bug：`--with-e2e` 从来没传出去

**症状**：`WITH_E2E=1 git push` 打印出 `--stage push,ci`，看着像要跑 E2E，
实际**两步都静默跳过**；`FULL_PUSH=1` 同理。

**根因**：新 Python 版 `pre-push` 把开关**用阶段列表又推了一遍**：

```python
# 错的写法
cmd = [sys.executable, script, "--stage", ",".join(stages)]
if os.environ.get("WITH_E2E") == "1" and "ci" not in stages:
    cmd.append("--with-e2e")
```

E2E 两步（`playwright-smoke` / `playwright-analyze`）**就住在 `ci` 阶段里**，
所以"想要 E2E"的每一条路径都恰好满足 `"ci" in stages` → `"ci" not in stages` 恒假 →
那个 `append` **一次都不执行**。

**为什么这个形状特别坏**：它**没有任何输出**。命令拼得出来、退出码是 0、日志正常，
只是少了一个参数。照文档跑 `WITH_E2E=1 git push` 的人会以为 E2E 过了。
（顺带：`FULL_PUSH=1` 那条分支连 `stages` 都含 `ci`，同样漏。）

**修法**：两个维度各自独立传——`--stage` 决定跑哪些阶段，`--with-e2e` 决定阶段内的步骤：

```python
if with_e2e:
    cmd.append("--with-e2e")
```

**已配守卫**（`check_hygiene.py` 第 6 项「hook 不从阶段列表反推开关」）
+ 变异自证（`mutate_guards.py`「pre-push 从阶段列表反推 --with-e2e」）。
凡是".githooks/ 里把 `--with-*` 与阶段表达式绑在一起"的写法，静态扫出来即失败。

**自证时暴露的第二个坑（值得记下）**：这条守卫的**第一版正则是恒绿的**——
写成了 `with_[a-z_]+`，而开关名是 `with_e2e`，`[a-z_]+` **匹配不到 `e2e` 里的数字 `2`**。
在真实 bug 上跑，它报 `OK`。**一条永远不红的守卫比没有守卫更坏**，
因为它还让人以为有人在看。改成 `[a-z0-9_]+` 后才真正会红。
**本轮这条守卫自己先红过一次**（注入原 bug → 恰好那一条失败 → 还原逐字节一致）。

**第三个坑**：`mutate_guards._apply` 按**字节**读写（防止行尾被归一），
所以锚点必须与文件里的行尾**逐字节**一致。工作区里 `.githooks/pre-push` 是 CRLF，
多行锚点里写 `\n` 一个都匹配不到 → 报 `anchor mismatch`。**hook 的锚点一律用单行。**
