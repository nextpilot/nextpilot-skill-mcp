# 测试流程速查

**这页解决一个问题**：我不知道改完我的东西该跑什么、要等多久、红了该看哪。

三分钟读完，之后当卡片查。**决策依据与完整实测档案在 [`checks-by-stage.md`](checks-by-stage.md)**——
那页 1300+ 行，是“为什么这样分档”的论证；这页只给结论。

耗时均为 2026-09-22 本机实测（Windows / Python 3.13 / Node 22 / pnpm 12.4.1）。
标“分钟级”的没在本机实测过，来源见 `checks-by-stage.md`。

---

## 一、六个阶段：什么时候自动跑

**大部分时候你什么都不用跑** —— 门禁是自动的。

| 什么时候 | 自动跑什么 | 耗时 | 你要做的事 |
| --- | --- | --- | --- |
| 写代码 `pnpm dev` | 构建期校验（知识库规则、算子名、表达式） | 启动时 | 报错就直接看，它会指明哪个文件哪个字段 |
| 改文件存盘 | `tsc --watch`（另开终端） | 实时 | — |
| `git commit` | 格式化 staged 文件（ruff / prettier / eslint --fix）+ 提交标题规范 | **2s** | 基本无感；被改过的文件会自动重新 add |
| `git push` | **14 项**本地静态检查 + 日志回归 | **30~40s** | 等半分钟。想连云端那批一起跑：`FULL_PUSH=1 git push` |
| 推到远端后 | **CI 两个 job**，见第四节 | **分钟级** | 去 CI 页面看 |
| CI 通过后 | 自动部署 + **打线上的全套 E2E** | 分钟级 | 部署挂了说明线上真有问题 |

### 三种 push 姿势

```bash
git push                    # 只跑 push 阶段（默认，30~40s）
WITH_E2E=1 git push         # push + ci 阶段，含两条 E2E（+5~7min）
FULL_PUSH=1 git push        # 和 CI 一样全：push + ci + build（+2.5min 的 next build）
git push --no-verify        # 跳过全部检查（只在明确知道自己在干什么时用）
```

---

## 二、阶段 ↔ 脚本 ↔ 扫什么扩展名（总表）

**一张表看全：哪个阶段跑哪个脚本，那个脚本管哪些文件。**
扩展名一栏是**实测的扫描范围**（读各工具的配置与源码得出），不是“大概管这类文件”。
**这一节是唯一带理由的地方**——因为“某检查管不管 `.md`”直接决定你会不会踩坑。

### 阶段 A —— `git commit`（`.githooks/`，只处理 staged 文件）

| 脚本 | 作用 | 扫描的扩展名 |
| --- | --- | --- |
| `.githooks/pre-commit` → `ruff format` | 自动格式化 staged 的 Python | **`.py`** |
| `.githooks/pre-commit` → `ruff check` | Python lint（**不加 `--fix`**，理由见下） | **`.py`** |
| `.githooks/pre-commit` → `prettier --write` | 自动格式化 staged 的前端文件 | **`.ts` `.tsx` `.js` `.mjs` `.css`** |
| `.githooks/pre-commit` → `eslint --fix` | TS/TSX 自动修复 | **`.ts` `.tsx`** |
| `.githooks/commit-msg` | 提交标题符合 Conventional Commits、≤72 字符 | 不扫文件，只看提交信息 |

> **只处理 staged**：改动多少处理多少，比全仓扫一遍快，且错误在提交前就消失。
> **`ruff check` 刻意不加 `--fix`**：`engine/` 是分片拼装的产物，ruff 的自动修复会删东西；
> `eslint --fix` 安全（它的可修复规则都属于格式化类）。

### 阶段 B —— `git push`（`check_all.py --stage push`，14 项）

| # | 脚本 | 作用 | 扫描的扩展名 / 范围 | 实测 |
| --- | --- | --- | --- | --- |
| 1 | `tools/ci/check_secrets.py` | 有没有把密钥提交进去 | **全部跟踪文件** —— `git ls-files` 拿到的每个文件，只跳过 `.lock .map .png .jpg .jpeg .gif .ico .woff .woff2 .pdf` 与 `pnpm-lock.yaml` / `package-lock.json`。实测 **313/316 个**（含 **56 个 `.md` + 6 个 `.mdx`**） | 1.3s |
| 2 | `ruff format --check` | Python 风格 | **`.py`**（`pyproject.toml` 里 `include = ["*.py"]`） | 2s |
| 3 | `ruff check` | Python lint | **`.py`**（同上） | 1s |
| 4 | `pytest engine/tests` | 算子与 CEL 表达式求值 | 不扫文件，跑 `engine/tests/` 下的测试 | 1.2s |
| 5 | `tools/calibrate/check_artifact.py` | 产物是合法可执行的 Python；轨迹失败要给逐条原因 | **生成产物** `web/workers/ulog-check-script.ts`、`ulog-data-script.ts`、`fault-kb.generated.json`、`knowledge/px4/plot/track.yml`，并用 `tools/calibrate/logs/*.ulg` 真跑 | 1s |
| 6 | `tools/ci/check_engine_purity.py` | `engine/` 还是纯 Python | **`engine/**/*.py`**（跳过 `__pycache__`） | 0.6s |
| 7 | `tsc --noEmit` | TypeScript 类型 | **`.ts` `.tsx`**；`web/tsconfig.json` 的 `include` 是 `**/*.ts` `**/*.tsx`，`exclude` 掉 `e2e/`（E2E 由 Playwright 自己管） | 2s |
| 8 | `prettier --check` | 前端风格 | 常见前端扩展名，按 `web/.prettierignore` 排除生成物（`*.generated.*`、`.generated/`、`playwright-report/`、`pnpm-lock.yaml` 等） | 3.7s |
| 9 | `eslint` | JS lint | **`.js` `.mjs`** —— 配置里显式 `ignores: ["**/*.{ts,tsx}"]`。**这就是"TS 暂不覆盖"的由来** | 3s |
| 10 | `tools/ci/check_hygiene.py` | 校验机制自己还健康吗 | **`.py` `.ts` `.tsx` `.mjs` `.js` `.md` `.mdx` `.yml` `.yaml`**（8 类，含文档） | 4.2s |
| 11 | `tools/calibrate/compare_baseline.py` | 改规则后结论还准吗 | 冻结基线 JSON + **`tools/calibrate/logs/*.ulg`** | 3s |
| 12 | `tools/calibrate/check_provider.py` | 数据适配层契约 | **`tools/calibrate/logs/*.ulg`**（逐份跑同一套断言） | 3s |
| 13 | `tools/calibrate/run_checks_locally.py --probe-data` | 数据层结构自洽 | **`tools/calibrate/logs/*.ulg`** | 3s |
| 14 | `tools/calibrate/lint_rules.py --strict` | 规则引用的字段名真实存在 | **`knowledge/px4/rules/*.yaml`**（规则源）+ **`knowledge/px4/meta/*.json`**（上游固件字典）+ `*.ulg` | 2s |

**第 11~14 项依赖 `.ulg`，只在开发机跑。** `tools/calibrate/logs/*.ulg` 不入仓库
（原始日志含 GPS 轨迹），所以云端 checkout 里没有，这四项在 CI 上必然跳过。

### 阶段 C —— CI（`.github/workflows/ci.yml`，两个并行 job）

| job | 脚本 | 作用 | 扩展名 / 范围 | 实测 |
| --- | --- | --- | --- | --- |
| `checks` | `next build` | 站点真能编译 | `web/` 全量（`.ts` `.tsx` `.css` `.mjs`） | 144s |
| `checks` | `web/scripts/build-knowledge.mjs --check` | 提交的产物与 `knowledge/` 源一致吗 | **`knowledge/**`**（`.yaml` `.yml` `.json` `.md`）→ 比对生成物 | 0.6s |
| `checks` | `web/scripts/check-skill-spec.mjs` | Skill 目录合规 | **`knowledge/skills/*/SKILL.md`** + 同目录 `README.md` / `CHANGELOG.md`（`.md`，读 YAML frontmatter） | 0.4s |
| `checks` | `web/scripts/check-mcp-spec.mjs` | MCP 目录合规 | **`knowledge/mcp/*/server.json`**（`.json`） | 0.3s |
| `checks` | `web/scripts/test-issue-filer.mjs` | 前端 21 节守卫（131 条断言） | 扫源码：`web/functions/**/*.js`、`web/lib/**/*.ts`、`web/app/**/*.tsx`、`web/components/**/*.tsx` | 44s |
| `checks` | `pip-audit` | Python 依赖漏洞 | **`requirements-dev.txt`** | 41s |
| `checks` | `pnpm audit` | 前端依赖漏洞 | **`web/pnpm-lock.yaml`**（须带 `--registry`） | 7.4s |
| `checks` | Playwright `@smoke` | 16 条关键路由能渲染 | **`web/e2e/pages.spec.ts` + `analyze.spec.ts`**（`--grep @smoke`） | 分钟级 |
| `checks` | Playwright `日志分析流程` | 上传 `.ulg` → Pyodide 解析 → 显示 | **`web/e2e/analyze.spec.ts`**（11 条），上传 **`web/e2e/fixtures/sample.ulg`** | 约 7min |
| `guard-self-proof` | `tools/ci/mutate_guards.py` | 43 条变异逐条自证守卫会红 | 改的是 `.githooks/pre-push`、`tools/ci/*.py`、`web/**/*.ts(x)` 等被守卫盯着的文件 | 约 20min |

### 阶段 D —— deploy 后（`.github/workflows/deploy.yml`）

| 脚本 | 作用 | 扩展名 / 范围 |
| --- | --- | --- |
| `playwright test --config playwright.live.config.ts` | 打**线上站点**的全套 E2E（含真实上传 `.ulg`） | 同 `web/e2e/`，但 `baseURL` 取自 `SMOKE_BASE_URL`，不启动本地 server |

### 三条从这张表读出来的结论

1. **`check_secrets` 是唯一扫“全部跟踪文件”的检查**（313 个，含 56 个 `.md`）——
   所以**文档里留一句假密钥同样会被它抓到**。这不是缺陷，是它必须覆盖文档的原因：
   密钥可以写在任何文件里。
2. **`ruff` 只认 `.py`，`eslint` 只认 `.js`/`.mjs`** —— 两者都**不看 Markdown 里的代码块**。
   ruff 的 `include = ["*.py"]` 是刻意的：本仓 `.md` 里的 Python 块是示意图与历史记录，
   重排它们只会把文档改花。
3. **依赖 `.ulg` 的共 5 处**（push 的 11~14 项 + `check_artifact` 的真跑部分），
   这就是“`CI 全绿 ≠ 回归过了`”的物理原因。

---

## 三、`git push` 的 14 项明细（30~40s）

这是你**每天最常遇到**的一批。全部实测：

| # | 检查 | 回答什么问题 | 实测 |
| --- | --- | --- | --- |
| 1 | `check_secrets` | **有没有把密钥提交进去** | 1.3s |
| 2 | `ruff format --check` | Python 风格统一吗 | 2s |
| 3 | `ruff check` | Python 有没有可疑写法 | 1s |
| 4 | `pytest engine/tests` | 算子与 CEL 表达式**求值对不对** | 1.2s |
| 5 | `check_artifact` | 编译出的产物是**合法可执行的 Python** 吗；轨迹取不到时是否给出逐条原因 | 1s |
| 6 | `check_engine_purity` | `engine/` 还是**纯 Python** 吗（浏览器与本机共用同一份的前提） | 0.6s |
| 7 | `tsc --noEmit` | TypeScript 类型对得上吗 | 2s |
| 8 | `prettier --check` | 前端风格统一吗 | 3.7s |
| 9 | `eslint` | JS 有没有可疑写法（**当前只覆盖 `.js`/`.mjs`，不含 `.ts`/`.tsx`**） | 3s |
| 10 | `check_hygiene` | **校验机制自己**还健康吗（悬空引用、静默失败、守卫恒真） | 4.2s |
| 11 | `compare_baseline` | 改规则后**结论还准吗**（6 份日志逐字段比对） | 3s |
| 12 | `check_provider` | 数据适配层**契约**还成立吗 | 3s |
| 13 | `run_checks_locally --probe-data` | 数据层结构自洽吗 | 3s |
| 14 | `lint_rules --strict` | 规则引用的**字段名真实存在**吗 | 2s |

**⚠ 第 11~14 项只在开发机跑。** 它们需要真实 `.ulg` 日志，
而原始日志含 GPS 轨迹、按项目隐私规则**不入仓库**——所以云端 checkout 里没有，
这四项在 CI 上**必然跳过**。这正是它们归 push 而不归 CI 的原因。

**后果**：`CI 全绿 ≠ 回归过了`。CI 那行绿只说明不依赖日志的部分没问题。

---

## 四、什么时候需要手动跑

| 我改了… | 跑这个 | 耗时 |
| --- | --- | --- |
| 任何东西，想本地确认一遍 | `python tools/ci/check_all.py --stage push` | 30~40s |
| 知识库 `knowledge/` 或构建脚本 | `pnpm build:kb` 后提交产物 | 秒级 |
| 指南页/前端样式 | `pnpm format` | 8.6s |
| 界面布局（侧栏、栏宽、间距） | `pnpm test:e2e:smoke` | 分钟级 |
| 分析链路（上传/解析/渲染） | `pnpm test:e2e:analyze` | **约 7min** |
| 一条守卫，想证明它真会红 | `python tools/ci/mutate_guards.py --only <名字>` | 看条目 |
| 不知道改了哪 | `python tools/ci/check_all.py --list-stages` | 即时 |

**`--stage` 是单一事实源**：想知道“某个阶段到底有哪些检查”，别读文档，
直接 `--list-stages`——文档会过期，清单不会。

---

## 五、CI 上跑什么（推上去之后，分钟级）

CI 是两个**并行** job，各有 40 分钟预算：

| job | 内容 | 项数 | 预算 |
| --- | --- | --- | --- |
| `checks` | `--stage build,ci --with-e2e` | 1（build）+ 6（ci）+ 3（开关项）= **10** | 40min |
| `guard-self-proof` | `--with-mutate`（43 条变异逐条自证） | 1 | 40min |

`checks` job 的十项：

| 检查 | 回答什么问题 | 实测 |
| --- | --- | --- |
| `next build` | 站点**真能编译出生产产物**吗 | 144s |
| `build:kb --check` | 提交的产物与 `knowledge/` 源**还一致**吗 | 0.6s |
| `check-skill-spec` | Skill 目录符合 Agent Skills 规范吗（含**内置反例自检**） | 0.4s |
| `check-mcp-spec` | MCP 目录符合 server.json 规范吗（含**内置反例自检**） | 0.3s |
| `test-issue-filer` | **前端 21 节守卫**还成立吗（131 条断言） | 44s |
| `pip-audit` | Python 依赖有已知漏洞吗 | 41s |
| `pnpm audit` | 前端依赖有已知漏洞吗 | 7.4s |
| `playwright-smoke` | 16 条关键路由还能渲染吗 | 分钟级 |
| `playwright-analyze` | 11 条分析用例，含**上传 .ulg → Pyodide 解析 → 显示**整条链路 | **约 7min** |
| — | （第 11~14 项日志回归在此**必然跳过**，见第三节） | — |

`guard-self-proof` job：**43 条变异**逐条注入、断言**恰好一条**守卫变红、再还原。
其中 27 条打在 `test-issue-filer` 上（44s × 27），所以整套约 20 分钟，
这也是它单独成 job 的原因。

---

## 六、红了怎么办

| 看到红的 | 先怀疑 | 本地复现 |
| --- | --- | --- |
| `ruff format` / `prettier` | 只是没格式化 | `ruff format .` / `pnpm format` |
| `eslint` | 未使用变量等 | `npx eslint . --fix` |
| `test-issue-filer` | **某条界面不变量被破坏了**（输出会点名是哪条） | `node web/scripts/test-issue-filer.mjs` |
| `check_artifact` | 产物语法错，或轨迹失败时没给逐条原因 | `python tools/calibrate/check_artifact.py` |
| `compare_baseline` | 改规则改动了结论。**确认是有意的再重新打基线** | `python tools/calibrate/compare_baseline.py` |
| `check_hygiene` | 校验机制自己有裂缝（它会说清是哪一道） | `python tools/ci/check_hygiene.py` |
| `build:kb --check` | 改了 `knowledge/` 但没重新构建产物 | `pnpm build:kb` 后提交 |
| `playwright-analyze` | 上传/解析/渲染链路断了。**首次在 CI 跑也有可能是配置问题**（见下） | `pnpm test:e2e:analyze` |

**每条检查红的时候都会打一句 `hint`**，说清“缺什么、怎么修”——
比看日志快，先读它。

---

## 七、三层守卫，别搞混

本项目有三层不同性质的检查，问的问题不一样：

| 层 | 例子 | 回答 |
| --- | --- | --- |
| **单测** | `pytest engine/tests` | 我写的这段逻辑对不对 |
| **守卫** | `test-issue-filer` 21 节、`check_hygiene` 6 项 | 这个**不变量还成立**吗（不测行为，扫源码防回潮） |
| **守卫的自证** | `mutate_guards` 43 条 | 守卫**真的会红**吗，还是恒绿着当摆设 |

第三层是本项目最看重的一条：**一条永远不红的守卫比没有守卫更坏**，
因为它还让人以为有人在看。所以每加一条守卫，就必须同时加一条能证明它会红的变异。

---

## 八、几个容易踩的坑

- **`--with-e2e` 和 `--stage` 是两个维度**。前者控制阶段**内的步骤**，后者控制跑哪些阶段。
  **不许从阶段列表反推开关**：E2E 步骤就住在 `ci` 阶段里，`"ci" not in stages` 这种条件
  在每条想要 E2E 的路径上都不成立，开关会静默失效。
- **两份同名的 `sample.ulg`**：`tools/calibrate/logs/sample.ulg`（4.0MB，**不入库**）
  与 `web/e2e/fixtures/sample.ulg`（921KB，**已入库**）。
  前者云端必然跳过，后者才是 CI 能真跑 E2E 的那份。
- **本地 `pnpm audit` 必须带 `--registry=https://registry.npmjs.org/`**：
  本机 `~/.npmrc` 指向 npmmirror，那个镜像没实现 audit 端点，不带就本机必红而 CI 绿。
- **`pnpm` 是全局工具**，`web/node_modules/` 下没有它。清单里用 `{PNPM}` 占位符走 PATH。
- **E2E 首次跑要 7 分钟**：Pyodide 要下载 WASM + numpy + pyulog，之后就快了。
  别在前 2 分钟就以为卡死。

---

## 九、关联文档

| 想找什么 | 去哪 |
| --- | --- |
| 为什么这样分档、每项的完整实测数据 | [`checks-by-stage.md`](checks-by-stage.md) |
| 本地开发、部署、环境变量、故障排查 | [`operations/README.md`](operations/README.md) |
| 校验命令的**定义**（唯一事实源） | [`../../tools/ci/checklist.yml`](../../tools/ci/checklist.yml) |
| 引擎实现（算子 / 规则框架 / 数据层） | [`../../engine/README.md`](../../engine/README.md) |
| 怎么**写**一条检查规则 | 网站 `/guide/rule-schema` |
