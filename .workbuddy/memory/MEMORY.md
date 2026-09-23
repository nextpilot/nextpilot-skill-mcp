# 项目长期约定（nextpilot-skill-mcp）

## 注释写"为什么"，不写开发日志（用户 2026-09-22 明确要求，已两次强调）

注释**一句话**回答"这条规则为什么存在"，禁止写成开发日志。判定方法：
把注释里的**时间词、发现过程、后果推演**全部删掉后还剩下理由，才合格。

- 禁止：事故复盘（"后来搬到 X，于是开始恒红"）、反思总结（"恒红的守卫比没有守卫更坏"）、
  时间线（"2026-09-18 那天……"）、发现过程（"实测第一版就是这个错"）。
- 教训归 CLAUDE.md 或工作记录，不撒在代码各处。
- 举例——坏："判据是'这份文件的作者是脚本不是人'。格式化改了也白改——下次
  build-knowledge.mjs 一跑就变回去，还会被报成产物不一致。所以生成物一律排除。"
  好："生成物由脚本重写，格式化了会被下次构建覆盖。"

**动手前先给 plan 等用户同意**（同一天明确要求）。不要"顺手就改"——即便是修红灯。
现状交代清楚即可，决定权归用户。

## 检查分档（本机实测，2026-09-22，非估算）

校验命令的单一事实源是 `tools/ci/checklist.yml`，`check_all.py` 只做转发；
hooks 与 workflow 都只调 `check_all.py`。

| 检查 | 实测 |
| --- | --- |
| ruff format --check / ruff check | 2s / 1s |
| pytest engine/tests | 1.2s |
| check_artifact / check_engine_purity | 1s / 0.6s |
| build:kb --check / check-skill-spec / check-mcp-spec | 0.6s / 0.4s / 0.3s（后两者自带反例自检） |
| tsc --noEmit / eslint / prettier --check | 2s / 3s / 3.7s |
| check_hygiene / check_secrets | 4.2s / 1.3s |
| 日志回归四项（baseline/provider/probe/lint_rules） | 各约 2~3s，共 11s |
| **test-issue-filer** | **43.8s**（21 节 / 131 条断言） |
| **pip-audit** | **40.6s**（曾误记为"秒级"，差一个量级） |
| **pnpm audit** | **7.4s**（须带 `--registry=https://registry.npmjs.org/`） |
| **next build** | **144s**（清单 timeout 300s，安全） |
| **playwright-analyze（日志分析流程 11 条）** | **约 420s**（timeout 900，CI 里最长一步） |
| **mutate_guards（43 条变异）** | **约 20 分钟**（27 条打在 test-issue-filer 上，44s×27） |

分档结论：本地只留秒级；分钟级的（E2E / build / 自证）全部放云端 CI。
`--stage push` 全套实测 **30~40s**（14 项：10 无条件 + 4 需日志）。

CI `checks` job 估算约 **17 分钟**（build + 冒烟 + analyze + 其余），预算 40 分钟，余量约 2.3 倍。

**E2E 用例数（实测 `--list`）**：共 42 条（`pages.spec.ts` 31 + `analyze.spec.ts` 11）；
其中 `@smoke` 16 条、`日志分析流程` 11 条。

**面向新人的速查页是 `docs/dev/testing-at-a-glance.md`**（2026-09-22 新建）；
`checks-by-stage.md` 保留为"为什么这样分档"的论证与实测档案。改检查体系时**两处都要同步**。

## 两处易混的 `sample.ulg`（动手前先分清）

**同名不同物**，内容完全不一样：

| 路径 | 入库 | 大小 | topic | 时长 |
| --- | --- | --- | --- | --- |
| `tools/calibrate/logs/sample.ulg` | ❌ 不入库 | 4.0MB | 15 | 69s |
| `web/e2e/fixtures/sample.ulg` | ✅ **入库** | 921KB | 70 | 1174s |

**推论**：CI 里的 `playwright-analyze` 能真跑，靠的是右边那份（**不需要 `has_logs` 门控**）；
日志回归 4 项靠左边那份，云端必然 SKIP。**别把它们当同一份文件。**

⚠️ **「原始日志不入库」不能当通用红线引用**：它对 `tools/calibrate/logs/*.ulg` 成立，
但 `web/e2e/fixtures/sample.ulg` 是已入库的例外（含 GPS 63.417°N/10.408°E，用户 2026-09-22
知情后裁决保留现状）。

## `--with-*` 开关与 `--stage` 是两个正交维度（踩过一次）

**不许从阶段列表反推开关。** 原形：`.githooks/pre-push` 写
`if with_e2e and "ci" not in stages: cmd.append("--with-e2e")` ——
而 E2E 步骤就住在 `ci` 阶段里，于是条件**恒假**，`WITH_E2E=1` 静默不跑 E2E。

- 正确：`if with_e2e: cmd.append("--with-e2e")`，各自独立传。
- 已配守卫：`check_hygiene.py`「hook 不从阶段列表反推开关」+ 对应变异自证。

**这类 bug 没有任何输出**（命令拼得出、退出码 0、日志正常），**只能靠静态扫**。

## 写守卫时的两个坑（都实际恒绿过）

1. **正则里的字符类要含数字**：开关名 `with_e2e` 含 `2`，`[a-z_]+` 匹配不到 →
   守卫**恒绿**。一条永远不红的守卫比没有守卫更坏。用 `[a-z0-9_]+`。
2. **`mutate_guards._apply` 按字节读写**，锚点必须与文件行尾逐字节一致。
   hook 文件在工作区是 **CRLF**，多行锚点里写 `\n` 匹配不到（报 `anchor mismatch`）。
   **hook 的变异锚点一律用单行。**

## 环境事实

- 项目 Python 是 `C:\Users\zhanfuyu\anaconda3\python.exe`（有 ruff/pytest/numpy/pyulog）。
  托管 Python 3.13 缺科学栈，`check_artifact` / `check_hygiene` 会假失败。
- Bash 工具需先 `export PATH="/usr/bin:/bin:/mingw64/bin:$PATH"` 才能用。
  不加会 `tail: command not found`（exit 127）。**`bc` 加了 PATH 也没有**——
  计时一律用 Python `time.time()`，别用 shell 算。
- 远端是 gitee 私仓 `https://gitee.com/nextpilot/nextpilot-skill-mcp.git`，
  免提权能 `git ls-remote`；`git push` 实测 **33s**（含 pre-push 全套 14 项）。
  曾记成"6 分钟零输出"，那是首次推送/网络状况，**不是常规预期**。
- 本机**没有 `xz` 命令行工具**，但 Python 标准库有 `lzma`。

## gitee 的 Git LFS 不可用（实测，别再规划 LFS 方案）

gitee 的 LFS **只对付费/试用企业版开放**，免费与个人仓库一律拒绝。实测证据
（2026-09-22）：

```bash
curl -s -X POST -H "Accept: application/vnd.git-lfs+json" \
  -H "Content-Type: application/vnd.git-lfs+json" \
  -d '{"operation":"download","transfers":["basic"],"objects":[]}' \
  https://gitee.com/nextpilot/nextpilot-skill-mcp.git/info/lfs/objects/batch
```

→ 本仓库 **403** `LFS only supported repository in paid or trial enterprise.`；
对照 `gitee.com/oschina/git-osc.git` 同请求 **200**。
即端点与请求都对，**是服务端按仓库拒绝**。网上"免费 5GB LFS"的说法与本仓库实测冲突。

大文件（本项目的测试日志）改用 **xz 压缩入库**：`lzma.compress(preset=6)` 实测
39.2MB → 16.0MB，最大单文件 7.21MB，远低于 gitee 免费版单文件 50MB 的上限。

## 本机 registry 会导致 audit / 部分安装失败（实测）

本机 `~/.npmrc` 与 pnpm registry 都指向 **`registry.npmmirror.com`**，由此两个坑：

- **`pnpm audit` 直连必失败**：该镜像**没实现 audit 端点** →
  `ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS`。**必须加
  `--registry=https://registry.npmjs.org/`**（实测通，5.7s）。
  CI 未配 registry、默认走官方源，所以不写这个 flag 会"本机红、CI 绿"。
- **pip 装包走 aliyun 镜像**（`mirrors.aliyun.com`，HTTP），会被 pip 判定为
  不安全主机而忽略；有的包（如 `pip-audit`）因此"找不到版本"。
  需要时显式 `--index-url https://pypi.org/simple`。

## 本机没有 xz 命令行工具

但 Python 标准库有 `lzma`（实测可用），压缩/解压走标准库即可，不依赖外部二进制。

## 本机 `python` 没有 ruff（hook / 脚本设计的硬约束）

`python` 解析到托管 `.workbuddy/binaries/python/3.13.12`，**没有 ruff**；
项目要的是 `C:/Users/zhanfuyu/anaconda3/python.exe`（ruff 0.16.7，与第 40 行同一条事实，
这里单列是因为它决定了一个设计）：**任何"用 python 跑检查"的脚本都必须自己探测解释器**，
不能靠 shebang 或 PATH。否则 `sys.executable -m ruff` 直接 `No module named ruff`。

`check_all.py` 内部就是用 `sys.executable -m ruff` —— 所以**启动它的解释器必须是带 ruff 的那个**。
这是 `.githooks/pre-commit` 在本机历史上坏掉的根因。

## 并发会话会静默回滚你的工作区（2026-09-22 事故）

本机可能有第二个会话同时操作这个仓库。它的一次操作把 `docs/dev/check-taxonomy-rework.md`
回滚到 HEAD，我 20 分钟的编辑**全丢**，且 git 里没有任何痕迹（未提交的改动不生成 blob，`git fsck` 找不回）。
症状很隐蔽：行数从 582 掉到 539，`git diff` 变空。

1. 长文档改动**周期性备份**到 `.workbuddy/tmp/`（不入 git），别攒到最后统一存。
2. 多点改动用**带断言的脚本**重放（每条 `count == 1`，否则 `exit 1`）——
   手改时"某条没匹配上"会被静默忽略，结果就是文档里留下一处过时引用。
3. `git status` **不是**"我的改动还在吗"的可靠依据：同一轮内观察到 `.husky/` 先 `A` 后消失、
   `package.json` 先 `M` 后被还原。

## Git 在 Windows 上的 hook 调用规则（Git 源码行为）

- 本机 `core.hooksPath = .githooks`（实测）。**放进 `.husky/` 的钩子永远不会被 Git 调用**——
  2026-09-22 就有一个会话加过 `.husky/pre-commit`，它是死代码，但看着像在生效。
- 连带那条：`.lintstagedrc.json` 里写 `python -m ruff` 在本机**必然失败**，
  必须走 `.githooks/_python_with_ruff.py` 的 `ensure_python_with_ruff` 探测。
- `.githooks/pre-commit` 有两条有据可查的取舍别丢：`ruff check` **不加 `--fix`**（`engine/` 由片段拼出，
  自动修复会删东西）；找不到解释器时退 **127** 让 Git 放行。
- 只认**无扩展名**的 hook，或 `.exe` / `.bat` / `.cmd`——**`.ps1` 永远不会被 Git 调用**（纯手动辅助脚本）。
- Git 用 `/bin/sh` 启动 hook，**脚本里路径一律用 `/` 分隔符**：
  连 `python.exe` 前那一节也要写 `C:/Users/.../python.exe`，反斜杠会被 sh 当转义符吃掉。



## 开发服务器：`pnpm dev` 起三段热更新

内容更新是**三段**，缺一段就「改了没反应」：

| 改什么 | 谁负责 |
| --- | --- |
| `web/` 里的代码 | Next 自己热更新 |
| `docs/guide`、`knowledge/skills`、`knowledge/mcp` | `sync-content --watch` 重拷进 `web/.generated/` |
| `knowledge/px4/`（rules/facts/plot/llm/meta）、`engine/` | `build-knowledge --watch` 重建产物 |

`pnpm dev` = `node scripts/dev.mjs`，**三段一起起**（2026-09-22 起）。
`pnpm dev:no-watch` 是旧行为（不挂 watch）；`pnpm sync:watch` / `pnpm kb:watch` 单独用。

**Next 16 按目录判重 dev server**（不是按端口）：同目录已有 dev server 时直接报错退出，
换 `PORT` 没用。测启动器前先确认没有旧 dev server 在跑。

### 给"产物落在源码目录内"的构建脚本加 watch：必须排除产物

`build-knowledge` 的产物 `rules-editor-schema.generated.json` **就落在 `knowledge/px4/` 里**。
监听 `knowledge/px4/` 顶层 = 写产物触发再构建 = **无限重建**（实测两次编辑跑了 7 次）。
两个 watch 脚本的共同纪律：

- 只监听**真源子目录**（`rules/` `plot/` `llm/` `meta/` `providers/` `scripts/lib`）
- 顶层目录（为拿到 `facts.yaml` / `operators.py` 这类"文件型"真源的事件）在回调里按
  `*.generated.*` 过滤掉产物

同类纪律：**产物写入源码目录时，任何基于文件监听的自动化都要显式排除产物路径。**

### 把顶层顺序代码包进函数时：检查跨层读取的变量

`build-knowledge.mjs` 的构建逻辑包进 `build()`（供 `--watch` 复用）后，两个变量成了
**函数的自由变量**、运行时报 `xxx is not defined`：`signatures`（被 `compileFieldOne` /
`compilePreset` 读）、`operatorsPy`（被 `renderSchemaPage` 读）。
**`--check` 路径发现不了这类错误**（走的是不渲染页面那条分支）——
加 watch 后必须真跑一遍完整路径，不能只跑 `--check`。

**本机工具注意事项**：`wmic` 被安全策略拉黑（用 `tasklist /FO CSV /NH` 代替）；
Windows 上 Python 发 Ctrl+C 要 `CREATE_NEW_PROCESS_GROUP` + `CTRL_BREAK_EVENT`；
`netstat` / `tasklist` 中文输出是 GBK，要 `decode('gbk')`；
**PowerShell 工具本机无 stdout**（exit 0 但零输出）——要输出改用 Python `subprocess`。

## 目录结构：维持 `web/` 现状（2026-09-23 决定，别再提议迁移）

评估过一次「`web/` → 仓库根 + `src/`」，**决定不迁移**（改动面大于当期收益，
且有两项前置条件只能在生产部署时才能看见结果）。方案留在
`docs/develop/directory-layout-migration.md`，**已标记为搁置，正文不要照着执行**。

维持现状下仍然成立的事实（与迁移无关，别弄错）：

- 根 `package.json`（`pnpm -C web` 转发壳）与根 `pnpm-lock.yaml`（零依赖空壳）是
  **影子，不是第二套配置**。改依赖只在 `web/` 改 —— 别往根 `package.json` 加依赖。
- 根 `.gitignore` 里的 `/pnpm-lock.yaml` **是有意为之**（真 lockfile 在 `web/`），别顺手删。
- `public/` 只能在项目根 —— Next 源码 `path.join(dir,'public')`，不存在 `src/public`。
  现状 `web/public/` 就是对的。
- `web/app/` 已存在，`findDir` 优先 `./app` 再 `./src/app` →
  **不要新建 `web/src/app`**，它会被静默忽略，不报错。
- `tools/calibrate/logs/*.ulg`（含 GPS）靠"在 `web/` 之外"**物理隔离**，
  不要移进 `web/`，也别把 EdgeOne 上传范围放宽到仓库根。

**部署上传范围 = `web/` 目录本身**（`deploy.yml` 两个 job 都是
`working-directory: web` + `npx edgeone pages deploy`）。推论：
任何 workspace 兄弟包（`packages/*`）都**不在上传范围内** ——
web 一旦用 `workspace:*` 依赖它们，云端构建不是 symlink 断，是**压根没有**这个包。
（项目无 `.npmrc` → `node-linker` 用默认 `isolated`。）

**通用判据（不只本项目）**：配置放在「覆盖它所需作用域的最小共同祖先」上。
同名配置出现两份时，判据是**内容是否重叠 + 是否工具链强制**，不是文件数量。
（参照 Langfuse：根管跨包编排、`web/` 管包自身，子包 `package.json` 是 workspace 硬要求，
不属于重复；我们项目根那两个是空壳，属于影子。）

若将来重提迁移，先确认三项**本地与 CI 都验证不了**的事：EdgeOne 控制台的构建根目录、
EdgeOne CLI 上传是否遵循 `.gitignore`（不遵循要补 `.edgeoneignore`）、
`functions/` 能否进 `src/`。

## monorepo 评估（2026-09-23，结论：暂不做，等 `server/`）

用户设想三分：**web / server / knowledge 各一个项目**。

**现状其实已经隐含这个设计** —— 根 `package.json` 的 description 原文写着
"真正的依赖在各自的子项目里（web/ 是 Next.js 项目，**server/ 将来是 Python**，
走 pyproject.toml）。不要往这里加 dependencies"。
所以根那份**不是影子，是有文档的转发层**；"乱"的感觉有一部分来自它没被 workspace 显式化。

**三分里有一个不成立**：`knowledge/` 是**资产不是包**（无构建、无依赖、无版本）。
硬给它 `package.json` 只为让 pnpm 认它，结果是 Node 侧走 node_modules symlink、
Python 侧仍走相对路径 —— **同一份资产两套解析方式**，比现在更乱。

**两侧对应机制**（都核实过官方文档）：

- Node 侧：pnpm workspace。现在只有 `web/` 一个成员。
  注：`web/pnpm-workspace.yaml` 里**只有 `allowBuilds` 审批表，不是 packages 声明** ——
  但 pnpm 靠该文件判定 workspace root，所以 `web/` 已经是单成员 workspace 根。
- Python 侧：**uv workspace**（官方 `[tool.uv.workspace]`，成熟；跨包 `{ workspace = true }`）。
  ⚠️ 硬约束：**`requires-python` 取所有成员的交集**（官方文档明说）。
  `engine/` 跑在 Pyodide 里、`server/` 跑在普通 CPython，版本要求若不同会冲突。

**部署红线（最关键）**：`deploy.yml` 里 `working-directory: web`，
EdgeOne CLI 在 `web/` 目录**内**上传并构建 → **上传范围 = `web/` 这一个目录**。
web 一旦用 `workspace:*` 依赖兄弟包，云端不是 symlink 断，是**压根没有这个包**。
（早先记成"symlink 断链"**不够准** —— 根因是上传范围不含兄弟目录，与 node-linker 无关。
之所以特意留这句修正：照旧说法去查会查错方向。）

**触发条件（两个都没发生就别引入 workspace）**：
`server/` 目录真创建 → 上 uv workspace（engine + server 两成员）；
出现第二个 Node 包（如 `packages/shared`）→ 上 pnpm workspace。

### monorepo 结论更新（2026-09-23 下午，知识库多形态模型敲定后重算）

**结论变了，但只变一半：Python 侧现在就该做，Node 侧仍然别做。**

- **Python 侧 ✅ 现在就给 `engine/` 加 `pyproject.toml`**：
  后端 wheel 是既定目标 ⇒ engine 必须成为真正的 Python 包 ⇒ 需要包配置，
  而它**现在没有**（根 `pyproject.toml` 只有 `[tool.ruff]` + `[tool.pytest]`，是仓库级
  lint/test 配置，不是包配置）。成员的 requires-python 交集约束现在只有一个成员，不会撞。
- **Node 侧 ❌ 仍然别做 pnpm workspace**：部署上传范围只有 `web/` 的约束没变，
  且按新模型 web 产物是内联字符串，不依赖兄弟包 ⇒ 零收益。
- **uv workspace 现在也不建**：只有一个 Python 成员时无意义；等 `server/` 出现再加。

✅ **已核实（关键，决定了上面那条能不能安全做）**：
Ruff 官方文档（astral-sh/ruff `docs/configuration.md`）原话 ——
> "In locating the 'closest' pyproject.toml file for a given path, Ruff **ignores any
> pyproject.toml files that lack a `[tool.ruff]` section**."

→ 所以 `engine/pyproject.toml` **只放 `[project]` + `[build-system]`、不放 `[tool.ruff]`**
时，Ruff 会忽略它并继续向上用根那份。根配置**不会**对 `engine/` 失效。

⚠️ **但这是个一踩就静默的坑**（Ruff 与 ESLint 不同，**子配置完全替换父配置，不合并**）：
一旦有人在 `engine/pyproject.toml` 里加了 `[tool.ruff]`，根的 lint 配置对 `engine/`
**整体失效**（不是部分覆盖）—— 表现为"规则突然不报错了"。
真要加必须显式 `extend = "../pyproject.toml"`（路径相对配置文件自身解析）。
**建议加一条守卫**：断言 `engine/pyproject.toml` 不含 `[tool.ruff]`。

**另外**：`knowledge/` 仍然不是 package（它是源，构建期被读）—— 这条不受新模型影响。

## 价值排序：知识库是本体，engine 只是工具（2026-09-23 用户两次强调）

用户原话："知识库是一级目录，最重要的是知识，engine 只是工具。"
后续补充："知识库是项目最大价值，engine 只是把知识库编译成各种产物的工具。"

→ **推演的起点永远是"知识库需要什么"，不是"工具/产物该长什么样"。**
我犯过两次同方向的错：
  1. 把合并后的项目根定成 `engine/knowledge/`（把关系写反了，正确是 `knowledge/engine/`）
  2. 反复论证 wheel vs 内联字符串（形态是结果不是输入，被明确纠正过一次）

⚠️ **目录关系**：`knowledge/` **必须是一级目录**，`engine/` 移入其内成 `knowledge/engine/`。
反过来写（`engine/knowledge/`）与 CLAUDE.md §6.4「名字读出来的关系必须和真实关系一致」冲突。

⚠️ **engine 的定位**：编译器 / 工具。它不拥有知识，只处理知识。
所以"engine 项目"这种叫法本身就是错的 —— 它是 `knowledge` 项目里的工具目录。

**编译器归属已定（2026-09-23 用户明确）**：
> "`build:kb` 功能不是 web 提供的，而是 knowledge 提供的，web 只是使用它的产物。"

→ `web/scripts/build-knowledge.mjs` 是 knowledge 的能力，现暂住 `web/`（历史原因），
将来应迁入 `knowledge/scripts/`。**web 只是产物的消费方。**

**产物流向已定论（2026-09-23，用户明确，我先前错当成"待拍板的选择题"）**：
> "knowledge 的编译和构建就是 knowledge 自己负责。web 只要在 dev 的时候
> 调用 knowledge 的 build，并把结果拉过来就好了。"

→ **编译器只往 knowledge 自己的产物目录写（`knowledge/dist/`），永不跨项目写 `web/`。**
拉取是消费方的动作：
`knowledge` 有 `build` 命令 → `knowledge/dist/**` → web 的 `pull-knowledge.mjs`
按映射表搬到 web 内对应位置（workers/ · lib/knowledge/ · content/guide/ · public/params/）。
web 的 dev 脚本形如 `pnpm --filter knowledge build && node scripts/pull-knowledge.mjs && next dev`。

⚠️ 别再把"编译器归 knowledge 但产物要落到 web/"当成矛盾 —— **这个矛盾是我自己造出来的**。
产物落到 knowledge 自己的 dist/，消费方拉取，方向从头就是顺的。

⚠️ 拉进 `web/` 的产物**仍需入库**（EdgeOne 云端只 `next build`、不重建 knowledge）。
→ 由此产生的漂移风险必须有守卫：**`web/` 内的产物必须与 `knowledge/dist/` 逐字节一致**，
自证方式为改 web 侧一个字节断言变红。这条是本方案新增的，必须做。

**⚠️ 由此推出：knowledge 是「双语言包」，这是 monorepo 设计的硬约束**
编译器 `build-knowledge.mjs` 是 **Node 脚本**（.mjs，依赖 `yaml`），而 wheel 是 Python。
→ knowledge 同时需要：
- `knowledge/package.json`（pnpm 侧，供 web `pnpm --filter knowledge build` 调用编译器）
- `knowledge/pyproject.toml`（uv 侧，产出 wheel 给后端）

`pnpm-workspace.yaml: ["web","knowledge"]` 与 `[tool.uv.workspace] members=["knowledge"]`
**可共存**。⚠️ 但 knowledge 进 pnpm workspace 是**为了被调用，不是为了被 import** ——
旧结论不变：web 不得依赖 workspace 兄弟包（部署只上传 `web/`，依赖了云端装不上）。

**⚠️ 部署约束不受 monorepo 影响**：EdgeOne 只上传 `web/` → knowledge 的 Node 编译器
**在云端不可用** → 产物必须**入库**（现状如此，脚本 L20 写明），
web 的构建不能依赖 knowledge 在云端被构建。

**打包边界（setuptools 官方核实，v61+）**：
`tool.setuptools.include-package-data` 在 pyproject.toml 里**默认 true**
（与 setup.py/setup.cfg 的 false 相反，官方明确说"differs"）。
生效条件 = "MANIFEST.in 收录" 或 "git 跟踪 + setuptools-scm"。
→ **一旦用了 setuptools-scm，knowledge/ 下所有 git 跟踪的非 .py 文件都进 wheel**
（px4 48 + skills 24 + mcp 5 + engine 全进）。
用户提过这个担心，成立。控制手段首选：
`include-package-data = false` + `[tool.setuptools.package-data]` 白名单
（代价：新增文件类型要记得补白名单）。

**当前缺口（实测）**：`knowledge/` 下**一个校验入口都没有**（`git ls-files knowledge`
里没有 check/validate/lint/schema/test 任何一项）。三个相关校验脚本散在别处：
`web/scripts/check-skill-spec.mjs`、`web/scripts/check-mcp-spec.mjs`、
`tools/calibrate/lint_rules.py` —— 本体的工具住在消费方家里，方向是反的。

**⚠️ 本体在 CI 里没有自证能力（2026-09-23 实测，重要）**：
`lint_rules.py` 是知识库**最强的一致性守卫** —— 版本感知地检查规则里引用的
`topic.field` 在该固件版本是否真存在（写错不报错，只是取到 None、经验静默不生效）。
但它 **依赖 `tools/calibrate/logs/` 下的真实 `.ulg`**（含 GPS、不入库）→
虽然注册在 `tools/ci/checklist.yml:211`（带 `--strict`），**CI 里跑不了**，
只有开发机 `pre-push` 能跑（`ci.yml:81` 自己写明了这一点）。
→ 结论：**知识库在 CI 里是"裸"的** —— 改一条规则、字段名写错，CI 全绿。
若要让本体真正自证，得给 lint_rules 补一条**不依赖真实日志**的通道
（只用 `knowledge/px4/meta/<tag>.json` 上游字典做存在性判定，`fields_by_version_from_meta()`
这个函数已经存在，缺的是"只走 meta"的开关）。

## knowledge 的定位：源，不是包（2026-09-23 用户确认形态）

用户原话（**我第一遍理解错了，被纠正**）："knowledge 有自己的工具，将知识库编译成
**一个 lib**，web 直接拿来用，server 也可以使用这个库。" —— 是**一个 lib**，不是多目标产物。

→ 关键推论（别再想错）：web 端已经在用 **Pyodide** 跑 Python，server 是 Python。
所以这个 lib 只能是 **Python 产物** —— 不可能是 JS/TS。
**同一份产物，两种运行时**，与 `engine/` 现有模式完全一致。

→ 类比 protobuf / openapi：源与产物分离，产物才分发，源永不进部署包。

**产物形态 = 按消费方分发，不是一个产物两端共用**（2026-09-23 用户最终拍板）：
> "server 和 web 都需要一个共同的知识库，这个知识库可以不同的形式，
> 比如 web 是内联代码 + skill + mcp 卡片，后端可能就是一个 wheel 库"

→ 类比 protobuf：`knowledge/` + `engine/` 是 `.proto`（源，唯一）；
每种形态是各自的目标产物。**源只有一个，形态可以有 N 个。**

⚠️ **修正我上午的判断（过度推广，以本条为准）**：上午写"产物不是 wheel"，
那**只对 web 侧成立** —— web 走 Pyodide，用不上 wheel。**后端就该是 wheel**，
我当时把 web 侧的约束错误地推广成了全局结论。

**web 侧继续内联（不走 wheel）的理由**（都核实过）：
  1. 现状就是内联字符串，产物形态改了这条链路不用改，**零新增网络请求**
  2. micropip 只能装纯 Python wheel 或 Pyodide wasm32 wheel
     （命名规范 PEP 427、METADATA、`deps=True` 会去查 PyPI）—— 走 wheel 是白添约束
  3. 边缘函数要的 `prompts.generated.js` 是 ESM，也走不了 wheel

- ⚠️ **不要拼成单个 `.py`**：会把 `providers/` 插件位拍平。
  `knowledge/mcp/ardupilot-log` 已预告**第二种日志格式**，届时单文件挡路。
  → 产物保持目录结构；**"拼成字符串"只是 web 侧的打包方式，不是产物本身的形态**。

- knowledge 编译进产物时**编译成 `.py` 数据模块**（不是把 yaml/json 塞进包里当 data）：
  纯 import、零 FS 依赖，两端行为一致，契合"确定性"。

- 这套方案**不需要动目录** —— `engine/` 与 `knowledge/` 位置都不动，
  只在构建期产出包目录。化解了与"维持现状、不动目录"的冲突。
  ⚠️ 待定：产物目录放哪（`dist/`？`engine/dist/`？）。

⚠️ 硬约束不变：**必须纯 Python，Pyodide 装不了 C 扩展**。
一旦 lib 引入 numpy 这类带 C 扩展的依赖，web 侧直接废。
（`engine/` 保持纯 Python 正是为此 —— 这条会一直卡着 lib 的依赖选择。）
→ 后果：这会让**后端 wheel 与 web 内联的依赖集不一致**，是这套多形态模型的固有张力，
不是 bug。别试图抹平它，要在文档里写明"哪些依赖只有后端能用"。

**knowledge 内部其实是两类内容，别混为一谈**（这是多形态分发的真正切分线）：
  - `knowledge/px4/`（facts / rules / fault-kb / llm / meta）→ **引擎知识**，
    既进后端 wheel、也内联进 web
  - `knowledge/skills/`、`knowledge/mcp/` → **内容卡片**，web 展示用；
    **卡片进不了 wheel** —— 后端若要消费（Skill Hub 的 API）得另定形态，此项未定

**跨形态一致性建议（未实施）**：形态越多，"改了源忘了重编某个形态"的风险越大。
建议**两段式编译**：源 → 规范化中间产物（如 facts.json / rules.json）→ 各形态包装器消费，
而不是每个形态各自从源读一遍。这样能保证"web 显示的规则 == 后端执行的规则"。

⚠️ **一致性要分两层，别一刀切**（2026-09-23 用户拍板，**别再拿 LLM 一致性当风险提**）：
- **确定性层必须一致**：规则判定、facts、阈值 —— web 与后端**必须**给出同样结论。
  同一份日志两种判定 = bug，这条要守。
- **LLM 解释层不必一致**：用户原话"llm 两边不一样就不一样，本来不同的 ai 给的结果不一样"。
  **这是预期行为，不是缺陷 —— 别提、别加校验、别写进风险清单。**
- **LLM 调用位置**：现在走 **EdgeOne 边缘函数**（`prompts.generated.js` 就是给它的）；
  将来迁到 server。**这是计划内的演进，不是待解决的分裂。**

**契约已经相当完备，别重复造**（读 `knowledge/README.md` + grep 实测）：

- 唯一真源声明：README 已写明"未来的平台 MCP 服务也只消费这里派生的产物"
- 版本：每个 `rules/*.yaml` 各带 `version`；`skills/<slug>/CHANGELOG.md`、
  `mcp/<slug>/CHANGELOG.md` 是 version / updatedAt 的**唯一真源**；`facts.yaml` 也有 version
- 校验：`pnpm check:skills` / `pnpm check:mcp` / `python tools/calibrate/lint-rules.py`
  / `compare_baseline.py` / `check-artifact.py`
- 铁律（README 末节）：生成物不要手改

**真正的缺口只有一条：产物版本戳** —— lib 分发时必须能回答
"这份 lib 是哪版源编出来的"。

⚠️ **不要加 `knowledge/VERSION`**：rules 各有版本、skills/mcp 各有 CHANGELOG，
再加会变成**第三份版本真源**，与 README 铁律冲突。
正确做法是在生成物里带源版本摘要（改 `build-knowledge.mjs`）。

⚠️ **编译器归属 knowledge（用户已确认）**：`build-knowledge.mjs` 现在住在 `web/scripts/`，
但它是 knowledge 的工具，不属于 web。**knowledge 独立的实质动作 = 编译器迁到 knowledge 侧。**
这与"维持现状、不动目录"的决定冲突，需用户拍板什么时候搬。

**加载链路已核实（2026-09-23，不再是推论）**：

- web 现状：`build-knowledge.mjs` 用 ast 解析 `providers/*.py`，把 `engine/*.py` + knowledge
  编译结果**拼成一个 3493 行的 TS 字符串** `PY_ULG_CHECKS`（`web/workers/pyodide-px4log-engine.ts`
  L9 起，`String.raw`）；`engine/rule_engine.py:33` 的 `FACTS = json.loads(r"""__FACTS__""")`
  是构建期替换的占位符。`providers/api.py` 只作契约文档，不进产物。
- Pyodide **0.27.7**（`web/workers/pyodide-px4log-worker.ts:22`，可由 `NEXT_PUBLIC_PYODIDE_URL` 改）。
- `loadPackage(["micropip","numpy"])` + `micropip.install(PYULOG_WHEEL || "pyulog")`，重试 3 次；
  `tools/px4/fetch_pyodide_assets.py` 已在抓 wheel 到 Blob 自托管，`NEXT_PUBLIC_PYULOG_WHEEL` 注入
  → **wheel 这条路本来就通**，只是对本场景不必要。
- micropip 默认 `deps=True` 会解析 METADATA 里的依赖并查 PyPI；
  纯 Python **无依赖**的 wheel 才不联网（要断网就 `deps=False` 或不声明依赖）。
- micropip 还支持 `emfs:` 前缀装 Pyodide 虚拟 FS 里的 wheel —— 备选项，未实测。

**规模实测（2026-09-23）**：knowledge = **2.0 MB / 78 文件**（34 md、39 yaml·yml、5 json），
engine 484K。离"需要拆出去"还差两个数量级。
触发条件：文件 > 500 或体积 > 20 MB，或要对外发布规则包给第三方。

**knowledge 是源、其余是拷贝 —— 用户 2026-09-23 确认，且已实现**：

`web/scripts/sync-content.mjs` 已把 `knowledge/skills → web/content/skills`、
`knowledge/mcp → web/content/mcp` **先清后拷**；`dev` / `build` / `build:kb` 都会自动跑它。
（`web/content/guide/` 例外：真源就在那里，入库，不拷贝。）

⚠️ **但拷贝产物全部入库了（实测，不是推测）**：
`git ls-files web/content/skills` = **24 个**、`web/content/mcp` = **5 个**，
且 `git check-ignore` 显示 **NOT ignored**。
→ 后果（最难查的那类）：谁直接改 `web/content/skills/*/SKILL.md`，下次 sync **先清后拷**
把它静默覆盖，**不报错、CI 全绿**。

→ 已有实证：`git log -- web/content/skills` 里 `664fa17 chore: add Prettier +
markdownlint for all repo .md/.mdx files` —— prettier 会格式化**副本**；
若源与副本的 prettier 作用域不一致（看 `.prettierignore`），就会出现
「prettier 改副本 → sync 从源覆盖回去 → 再格式化」的**反复 diff**。

**建议守卫（未实施）**：CI 里跑一次 `pnpm build:kb` 后 `git diff --exit-code` ——
产物入库就必须能证明"入库的那份 == 现生成的那份"。
（前提：确认 EdgeOne 云端到底跑 `pnpm build` 还是直接 `next build`。
README 说云端不跑 `build:kb`，若属实则产物入库是**有意为之**，守卫更必要。）

### 产物全景（2026-09-23 实测 build-knowledge.mjs，不是推测）

用户原则原话：**"web 端需要什么、server 端需要什么，产物就是什么。"**

脚本头部自述（L13-20）+ 写入点实测，**产物共 10 份，全是 web 专用形态**：

| 产物 | 形态 | 消费方 |
|---|---|---|
| `web/workers/pyodide-px4log-engine.ts` | TS 包着 Python 字符串 | web Pyodide |
| `web/workers/pyodide-px4log-data.ts` | 同上 | web |
| `web/workers/fault-kb.generated.json` | JSON | web |
| `web/lib/knowledge/plots.generated.ts` | TS | web 图表 |
| `web/lib/knowledge/prompts.generated.js` | ESM | **边缘函数（JS）** |
| `web/lib/knowledge/derived-version.generated.ts` | TS | web |
| `web/public/params/px4-main.json` | JSON | web |
| `knowledge/px4/rules-editor-schema.generated.json` | JSON | IDE（yaml-language-server） |
| `web/content/guide/rule-catalogue.mdx` | MDX | web 指南页 |
| `web/content/guide/rule-schema.mdx` | MDX | web 指南页 |

→ **现在没有"库"**：10 份产物散在 `web/` 的 4 个目录（workers/、lib/knowledge/、
content/guide/、public/params/），**server 一份都用不了**。这是"乱"的又一实证。

**产物入库是有意设计**（脚本 L20 原话）："产物提交进仓库，EdgeOne 直接 next build 也能跑"
→ 所以**不能说"产物不该入库"**；代价是**每一份入库产物都必须被 `--check` 覆盖**。

⚠️ **实测到的守卫缺口（具体、可修）**：
`--check` 覆盖**所有走 `writeArtifact()` 的产物**（含 `public/params/px4-main.json`、
`rules-editor-schema.generated.json` —— 脚本 L1781 注释自己写明"与别的产物一样走
writeArtifact，`--check` 会比对"）。
**只有两个 MDX 指南页不在覆盖内** —— 它们用裸 `writeFileSync` 且整个包在 `if (!CHECK)` 里。
而这两个页面恰好落在 `web/content/guide/`，**与人工撰写的指南页同一目录**，最容易被手改。
（注：脚本头部注释说"--check 只比对前 5 个产物"，实测比这更宽 —— 以 writeArtifact 为准。）

**`rules-editor-schema.generated.json` 落在源目录里**（`knowledge/px4/`），
脚本 L1821 自认这个问题：会导致 watch 时"写产物触发再构建、自己喂自己"，
所以 watch 只能按 `/\.generated\.(json|ts|js)$/` 过滤。**这是技术债，不是设计。**
