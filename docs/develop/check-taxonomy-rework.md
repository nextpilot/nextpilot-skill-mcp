# 校验体系整改方案（命名 + 目录 + 阶段）

> **状态**：已完成。`check_engine_pyodide.py`、`guard_provider_contract.py`、`check_rules_fields.py`、`check_rules_compute.py` 等已在 `tools/engine/` 下。
> 其余批次待确认。本文先给结论与盘点，再给方案与落地顺序，最后是必须同步改的点与风险。
>
> **2026-09-22 注**：本文件曾因一次有损转码丢失 776 个字符，且已随 `92d39ba` 入库，git 里没有干净版本。
> 当前版本是按残留内容重建的，措辞与原文可能有出入。
>
> **2026-09-24 注**：3.B 的**目录重组已部分落地**——只搬目录、**文件名一律未改**（改名留给后续批次）。
> 因此本文正文表格「现状」列里的路径指的是**重组前**的位置，读的时候请对照 `tools/README.md` 的新结构；
> 这些旧路径被有意保留，因为它们说明的是"从哪搬到哪"。

---

## 0. 结论先行

**一句话诊断**：`test` 与 `check` 现在不对应任何真实区别——因为**三条正交的轴被压扁成了一个前缀**：

| 轴                 | 取值                                                 | 现在有没有被命名                |
| ------------------ | ---------------------------------------------------- | ------------------------------- |
| A 怎么判定         | 执行代码断言输出 / 扫源码找模式 / 输出给人看         | ❌ 没有，全靠 `test` `check` 猜 |
| B 作用域           | 单元 / 契约 / 端到端 / 内容规范 / 元（校验机制自身） | ❌ 没有，只能从目录猜           |
| C 谁跑、什么时候跑 | commit / push / 云端 / 部署后 / 手动                 | ⚠️ 有，但被 4 套机制重复表达    |

由此产生四处具体症状（第 1、2 节有逐项证据）：

1. **名叫 `test` 的其实不是测试**：`web/scripts/test-issue-filer.mjs` 是全仓库最大的**守卫集**（21 节 131 条静态断言），而且是 `mutate_guards` 的主要变异目标；它跟生成器 `build-knowledge.mjs` 平铺在同一个目录里。
2. **名叫 `check` 的其实是契约测试**：`tools/calibrate/guard-px4log-provider.py` 是逐份日志跑同一套断言的**契约测试**；`compare_baseline.py` 连 `test`/`check` 前缀都没有，却是**最硬的一道回归测试**。
3. **目录名在撒谎**：`tools/calibrate/README.md` 说这里"都要真实 `.ulg`"，但 `check_engine_pyodide.py`**不需要日志**且挂在 push 阶段每次都跑——它是清单里唯一一个"住在 `calibrate/` 却不需要日志"的项。
4. **阶段划分与执行时机脱钩**：`checklist.yml` 声明 6 个阶段，其中 **3 个是空占位**；而真正的执行时机由 4 套机制各说一遍（YAML 的 `stage`/`when`、CLI 的 `--stage`/`--with-*`、hook 的 `WITH_E2E`/`FULL_PUSH`、CI workflow 里的显式命令）。

**整改思路**：按「怎么判定」分目录（轴 A），按「谁跑」分阶段（轴 C），两轴各自单一事实源；轴 B（作用域）不进目录结构，写进 `--list-stages` 的展示里。

**命名定稿**：`<什么类型>-<什么模块>-<干什么>`，类型词**放开头**。
分隔符按**调用方式**分：命令行直接跑的用 `-`，需要被 `import` 的用 `_`。
类型词五个：`guard`（守契约）/ `check`（跑单个对象）/ `test`（pytest 收集）/ `probe`（人工探查）/ `dump`（写盘）。
依据见 3.A——这个组合顺带绕开了「连字符 `.py` 的两个静默失效」。

---

## 1. 全量盘点：现在每个文件到底是什么

### 1.1 Python 侧

| 文件                                                                                    | 前缀  | **实际是什么**                                                                                                                                 | 在哪个阶段                  | 条件                       |
| --------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------- |
| `engine/tests/test_operators.py`                                                        | test  | ✅ 真单测（pytest，断言求值结果，8 条）                                                                                                        | push                        | always                     |
| `engine/tests/test_rule_engine.py`                                                      | test  | ✅ 真单测（10 条）                                                                                                                             | push                        | always                     |
| ~~`engine/test_pyulog.py`~~                                                             | test  | ⚠️ demo/验证脚本，**不测任何东西**（被 `pyproject.toml` 的 `testpaths` 排除，**实测收集不到**）—— **2026-09-24 已删除**，见 §「待你定」第 2 条 | 从不自动跑                  | —                          |
| `tools/calibrate/compare_baseline.py`                                                   | 无    | ✅ **回归测试**（与冻结基线逐字段比对）                                                                                                        | push                        | needs-logs                 |
| `tools/calibrate/guard-px4log-provider.py`                                              | guard | ✅ **契约测试**（逐份日志跑同一套断言）                                                                                                        | push                        | needs-logs                 |
| `tools/calibrate/px4log_engine_runner.py`                                               | check | ⚠️ **双身份**：主用途是探查工具；`--probe-data` 那一路是数据层测试                                                                             | push（仅 probe-data）/ 手动 | needs-logs                 |
| `tools/calibrate/lint_rules.py`                                                         | lint  | 规则数据的字段引用 lint                                                                                                                        | push                        | needs-logs                 |
| `tools/calibrate/check_engine_pyodide.py`                                               | check | 🛡 **产物检查**（真执行编译产物 + 核跨语言名字）                                                                                                | push                        | **always**（不需要日志！） |
| `tools/ci/check_engine_purity.py`                                                       | check | 🛡 源码守卫（engine 纯净性）                                                                                                                    | push                        | always                     |
| `tools/ci/check_secrets.py`                                                             | check | 🛡 源码守卫（扫全部跟踪文件）                                                                                                                   | push                        | always                     |
| `tools/ci/check_hygiene.py`                                                             | check | 🛡 **元守卫**（校验机制自身的卫生，多项）                                                                                                       | push                        | always                     |
| `tools/ci/check_prereq.py`                                                              | check | 💀 **已废弃，全仓无引用**                                                                                                                      | —                           | —                          |
| `tools/ci/check_all.py`                                                                 | check | 🎯 跑手（编排）                                                                                                                                | —                           | —                          |
| `tools/ci/checklist.yml`                                                                | —     | 🎯 清单（单一事实源）                                                                                                                          | —                           | —                          |
| `tools/ci/mutate_guards.py`                                                             | —     | 🎯 守卫的自证机（43 条变异）                                                                                                                   | ci                          | `--with-mutate`            |
| `dump_px4log_stats.py` / `probe_rule.py` / `dump_px4log_fields.py` / `dump_baseline.py` | probe | 🔍 手动探查（定阈值、查字段、打基线）                                                                                                          | 手动                        | —                          |
| `web/scripts/browser/check-upload.mjs` / `check-restore.mjs`                            | check | 🔍 手动 CDP 链路自检                                                                                                                           | 手动                        | 需 9222 端口 Chrome        |

### 1.2 JS / TS 侧

| 文件                                        | 前缀  | **实际是什么**                                                           | 在哪个阶段  | 条件         |
| ------------------------------------------- | ----- | ------------------------------------------------------------------------ | ----------- | ------------ |
| `web/scripts/test-issue-filer.mjs`          | test  | 🛡 **守卫集**（21 节 131 条，扫源码防回潮）——**不是测试**                 | ci          | always       |
| `web/scripts/check-skill-spec.mjs`          | check | 内容规范校验（自带反例自检）                                             | ci          | always       |
| `web/scripts/check-mcp-spec.mjs`            | check | 内容规范校验（自带反例自检）                                             | ci          | always       |
| `web/scripts/build-knowledge.mjs`           | —     | ⚙️ 生成器（96KB，构建期）                                                | dev / build | —            |
| `web/scripts/dev.mjs`                       | —     | ⚙️ dev 启动器                                                            | dev         | —            |
| `web/scripts/fix-node-links.mjs`            | —     | 🗄 一次性                                                                 | 手动        | —            |
| `web/e2e/pages.spec.ts` + `analyze.spec.ts` | —     | ✅ **真 E2E**（实测 **42 条**：`@smoke` 16 + 日志分析流程 11 + 其余 15） | ci          | `--with-e2e` |

### 1.3 已经存在的漂移（整改的证据，不是假设）

| 事实                     | 文档说的                                         | 实测                                                                           |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| E2E 总数                 | `CLAUDE.md` §6.9 写「共 40 用例」「pages 29 条」 | **`playwright test --list` 是 42 条**（pages 31 + analyze 11）                 |
| `@smoke` 条数            | 未写                                             | **16 条**                                                                      |
| `mutate_guards` 变异条数 | `testing-at-a-glance` 写 43；CI 注释写 42        | 以 `--list` 为准（文档互相不一致）                                             |
| `check_prereq`           | `checks-by-stage.md` 多处写「已删除」            | **文件仍在** `tools/ci/check_prereq.py`                                        |
| CI 有没有跑 build        | `CLAUDE.md` §6.9 画成「第四关」                  | `ci.yml` job1 显式 `--stage build,ci`；**job2 不带 `--stage`，会额外全跑一遍** |

> 三份文档（`CLAUDE.md` §6.9 / `testing-at-a-glance.md` / `checks-by-stage.md` 1391 行）同时描述同一件事，
> 而 `CLAUDE.md` 那份已经过时——这正是「什么时候执行很乱」的直接来源：想查的人会拿到三个不同答案。

---

## 2. 根因：三条轴压成一个前缀

同一个 `check_` 前缀下面，其实混着四种完全不同的东西：

```text
guard-px4log-provider.py          跑日志，断言适配器契约         （A=执行断言，B=契约）
check_engine_pyodide.py    真执行编译产物，核跨语言名字    （A=执行断言，但对象是产物）
check_secrets.py                  扫源码文本，找密钥形态          （A=静态扫描）
check_hygiene.py                  扫源码，查校验机制有没有说谎     （A=静态扫描，B=元）
```

而同一个「真测试」类别，又散在三个前缀下：`test_*`（engine/tests）、`check_*`（原 `check_provider.py`）、
**无前缀**（`compare_baseline`）。

**名字读出承诺**这件事在本仓库是要兑现的（见 CLAUDE.md 第 6 条：名字读出的承诺必须是数据模型能兑现的）。
现在 `test-issue-filer` 读出来是"测试某个报错上报功能"，实际是"21 节前端不变量守卫"——
新人照名字去改，会以为它只管 issue-filer 那一小块。

---

## 3. 整改方案

### 3.A 命名：`<什么类型>-<什么模块>-<干什么>`

**命名宪法（三段都必填）**：

```text
        <什么类型>  -  <什么模块>  -  <干什么>
             │             │              │
             │             │              └─ 大白话动作：它到底在做什么
             │             └─ 作用于哪个模块（用本仓库内部名词指对象）
             └─ 类型词，放**开头**：决定「谁会收集它、怎么调用它」
```

**为什么类型词放开头**——三条，第一条是硬约束：

1. **pytest 只按文件名开头收**。默认 `python_files = ["test_*.py"]`。类型词挪到末尾就得改成
   `*-test.py`，而**配错是静默的**：实测同目录放 `operators-engine-test.py` +
   `test_engine_operators.py`，默认配置只收到 **1 个**，连字符那个一声不响被丢掉。放开头则零配置。
2. `ls` 时同类型自动聚成一簇，`guard-*` 一屏扫完。
3. 读者第一眼就知道"这是守契约还是跑单个对象"，再决定要不要接着读。

**分隔符：按调用方式分，不按语言分**

| 调用方式                   | 分隔符 | 为什么                                                                                                                                                            |
| -------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **命令行直接跑**的脚本     | `-`    | 连字符更像一条命令；仓库既有（`check_engine_pyodide.py`、`build-knowledge.mjs`）                                                                                  |
| **需要被 `import`** 的模块 | `_`    | 连字符 `.py` **不能 import**（`from check-x import y` 是语法错误）。这一类包括：共用库、`conftest.py`、以及**被 pytest 收集的 `test_*`**（pytest 会 import 它们） |

> 这条同时解释了两件事：
> ① 为什么 `test_engine_operators.py` 是下划线而 `check_engine_pyodide.py` 是连字符——
> 前者被 pytest import，后者只在命令行跑；
> ② 为什么 `pyproject.toml` 的 `python_files` **不需要改**——所有 `test_*` 都保持下划线。
>
> **本仓库现成的例子**：`tools/calibrate/px4log_engine_runner.py`。
> 它有 **6 个 importer**（`check_engine_pyodide.py`、`compare_baseline.py`、`dump_baseline.py`、
> `guard-px4log-provider.py`、`lint_rules.py`、`probe_rule.py`），所以它用下划线——
> 尽管它同时也是命令行入口。改成连字符这 6 处会在 import 时**直接 SyntaxError**（实测）。
> 判定顺序：**先看有没有人 import 它，有就用 `_`**，命令行身份不影响这个结论。

**类型词（第一段 = 文件名开头）——五个，一眼归类**：

| 类型词  | 含义                                         | 判定方式                                   | 扩展名         |
| ------- | -------------------------------------------- | ------------------------------------------ | -------------- |
| `guard` | **守契约**：对一组同类对象逐个套用同一套断言 | 静态或动态都行，关键是"一组对象、一套断言" | `.py` / `.mjs` |
| `check` | **跑单个对象**：跑一遍，断言它的输出或结构   | 单一对象，有输入有期望                     | `.py`          |
| `test`  | 测试用例集                                   | 由 pytest 收集                             | `.py`          |
| `probe` | 人手动探查，输出给人看                       | 无门禁：没有「通过 / 失败」                | `.py`          |
| `dump`  | 把当前结论写盘成文件                         | 无门禁，产出物                             | `.py`          |

> **`guard` 与 `check` 的分界是「一组对象 vs 单个对象」，不是「静态 vs 动态」**。
> 这样定是因为本仓库里"契约"是真概念：`guard-px4log-provider` 对每个 provider 跑同一套断言
> （它是动态的），`guard-repo-no-secrets` 对每个跟踪文件跑同一套断言（它是静态的）——
> 两者读起来都该叫"守卫"。若按静态/动态分，`guard-px4log-provider` 就得改叫 `check-*`，
> 反而丢掉了"守的是跨实现的共同约定"这层意思。
>
> `setup` 不是类型词，是目录名（`tools/setup/`）：仓库里没有"执行安装"的脚本，
> 只有一个"工具链装没装"的检查，它是 `check-*`。

**允许第四段**：当被检对象是**产物**时，直接写产物在仓库里的全名。

```text
check_engine_pyodide.py     →  check · analysis-engine.generated（产物全名）
```

念出来是"检查 analysis-engine.generated 这个产物"。比抽象成 `check-artifact-xxx` 更望文生义——
被检对象那一格直接写了它在仓库里的准确名字。

**"什么模块"段（第二段）——用本仓库内部名词**：

| 模块                                        | 用哪个词        | 为什么不用别的                                                                                                          |
| ------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| PX4 `.ulg` 日志链路                         | **`px4log`**    | 产物就叫 `analysis-engine.generated.ts` / `analysis-worker.ts`；**不用 `ulog`**（仓库里已无 `ulog-*` 工具文件，属死词） |
| 规则文件（`knowledge/px4/rules/*.yaml`）    | `rule`          | 单数，与目录名对齐                                                                                                      |
| Python 引擎源码（`engine/`）                | `engine`        | 就是目录名                                                                                                              |
| 编译产物（整体，不指名时）                  | `artifact`      | 文档里一直叫它"产物"                                                                                                    |
| 校验机制自身                                | `meta`          | "元检查"项目里已在用                                                                                                    |
| 整个仓库的提交内容                          | `repo`          | 通用词，无歧义                                                                                                          |
| 工具链（Python / node / ruff / tsc 在不在） | `toolchain`     | 比 `prereq` 具体                                                                                                        |
| 前端源码（组件 / Worker / 边缘函数）        | `web`           | 就是目录名                                                                                                              |
| `web/content/skills` 与 `web/content/mcp`   | `skill` / `mcp` | 就是目录名                                                                                                              |

**"干什么"段（第三段）——判据是「念出来就知道它在做什么」**，要过两道闸门：

> **闸门 1**：念给没读过本仓库文档的人听，问他"这个脚本干什么"。只能答出"大概是测什么的吧" → 不合格。
> **闸门 2**：只看名字，能不能说出**它作用于什么模块、属于什么类型**。说不出来 → 模块词或类型词没写清。

**术语堆叠一律不合格**：`baseline` / `contract` / `schema` / `purity` / `leak` / `self` / `spec` / `invariant`
——它们描述"属于哪个方法论类别"，而类别该由**类型词**承担，动作段只写动作。

| 不合格     | 换成大白话          | 念出来                          |
| ---------- | ------------------- | ------------------------------- |
| `baseline` | `verdict-unchanged` | 跑一遍，看结论**有没有变**      |
| `contract` | `adapter-contract`  | 适配器**报错和取值合不合约定**  |
| `schema`   | `data-shape`        | 数据层吐给前端的**结构对不对**  |
| `ref`      | `field-exists`      | 规则引用的**字段名存不存在**    |
| `purity`   | `pyodide-safe`      | 源码**在 Pyodide 里跑不跑得动** |
| `leak`     | `no-secrets`        | 有没有**提交密钥**              |
| `self`     | `self-honest`       | 校验机制**自己有没有说谎**      |
| `spec`     | `dir-spec`          | **目录合不合规范**              |

**改名定案**：

| 现状                                                | 新名                                                              | 类型  | 分隔符                      |
| --------------------------------------------------- | ----------------------------------------------------------------- | ----- | --------------------------- |
| `tools/calibrate/check_engine_pyodide.py`           | `tools/tests/check_engine_pyodide.py`（**名字不动**，只换目录）   | check | `-`（命令行跑）             |
| `tools/calibrate/guard-px4log-provider.py`          | `tools/guards/guard-px4log-provider.py`（**名字不动**，只换目录） | guard | `-`（命令行跑）             |
| `tools/calibrate/compare_baseline.py`               | `tools/tests/check-px4log-verdict-unchanged.py`                   | check | `-`                         |
| （`px4log_engine_runner.py --probe-data` 那一路）   | `tools/tests/check-px4log-data-shape.py`                          | check | `-`                         |
| `tools/calibrate/lint_rules.py`                     | `tools/guards/guard-rule-field-exists.py`                         | guard | `-`                         |
| `tools/ci/check_engine_purity.py`                   | `tools/guards/guard-engine-pyodide-safe.py`                       | guard | `-`                         |
| `tools/ci/check_secrets.py`                         | `tools/guards/guard-repo-no-secrets.py`                           | guard | `-`                         |
| `tools/ci/check_hygiene.py`                         | `tools/guards/guard-meta-self-honest.py`                          | guard | `-`                         |
| `web/scripts/test-issue-filer.mjs`                  | `web/guards/guard-web-invariants.mjs`                             | guard | `-`                         |
| `web/scripts/check-skill-spec.mjs`                  | `web/guards/guard-skill-dir-spec.mjs`                             | guard | `-`                         |
| `web/scripts/check-mcp-spec.mjs`                    | `web/guards/guard-mcp-dir-spec.mjs`                               | guard | `-`                         |
| `tools/calibrate/px4log_engine_runner.py`（主用途） | `tools/calibrate/probe-px4log-findings.py`                        | probe | `-`                         |
| `tools/calibrate/dump_px4log_stats.py`              | `tools/calibrate/probe-px4log-stats.py`                           | probe | `-`                         |
| `tools/calibrate/probe_rule.py`                     | `tools/calibrate/probe-rule-why-matched.py`                       | probe | `-`                         |
| `tools/calibrate/dump_px4log_fields.py`             | `tools/calibrate/probe-px4log-fields.py`                          | probe | `-`                         |
| `tools/calibrate/dump_baseline.py`                  | `tools/calibrate/dump-px4log-baseline.py`                         | dump  | `-`                         |
| `tools/ci/check_prereq.py`                          | `tools/setup/check-toolchain-installed.py`                        | check | `-`                         |
| `engine/tests/test_operators.py`                    | `tools/tests/test_engine_operators.py`                            | test  | **`_`**（pytest 会 import） |
| `engine/tests/test_rule_engine.py`                  | `tools/tests/test_engine_cel_sandbox.py`                          | test  | **`_`**（pytest 会 import） |

> 注意最后两行是**唯一**用下划线的新名——因为 pytest 必须 import 它们。这不是两套规则打架，
> 是同一条规则（"被 import 的用 `_`"）在两个场景下的自然结果。

**编排层豁免（不受命名规则约束，因为它不是检查）**：

| 文件                                          | 为什么豁免                                           |
| --------------------------------------------- | ---------------------------------------------------- |
| `tools/ci/check_all.py`                       | 它是**跑手**（编排），不是检查                       |
| `tools/ci/checklist.yml`                      | 它是**清单**（单一事实源），不是检查                 |
| `tools/ci/mutate_guards.py`                   | 它是**自证机**（把变异注入再断言守卫会红），不是检查 |
| `tools/_logging.py`、`conftest.py`            | 共用库                                               |
| `web/scripts/build-knowledge.mjs` / `dev.mjs` | **构建脚本**，不是检查                               |

**保留不改**：

- `web/package.json` 的 `test:e2e*` —— Playwright 社区惯例名（`test:` 是 npm script 命名空间，不是本规则的类型词）。文档里说清「`test:e2e:*` 是真 E2E，与 `guard-*`（守契约）是两回事」。
- `web/e2e/*.spec.ts` —— Playwright 只认 `testMatch`，改名即收集不到。类型由目录 `e2e/` 表达。
- ~~`engine/test_pyulog.py`~~ —— 是 demo 不是测试（已排除在 `testpaths` 外）。原建议改名 `demo-pyulog-read.py`；**2026-09-24 已直接删除**（它连"验证 pyulog 能跑"这唯一用途也已被 `engine/tests/` 覆盖），改名提议作废。
- `web/scripts/browser/check-upload.mjs` / `check-restore.mjs` —— 手动 CDP 自检，不进任何门禁。建议改 `probe-site-*.mjs`，或原样保留，**待你定**。

**同词异义一处**：`web/functions/api/issue-probe.js` / `api/kv-probe.js` 是**边缘函数路由**（`/api/issue-probe`），
里面的 `probe` 意思是"诊断接口"，与本规则的"手动探查工具"撞词。建议**不动**（运行时由目录表达），
只在 taxonomy 文档里点明。

### 3.B 目录：按「怎么判定」归位

**硬约束先说清**：`web/` 是**独立部署单元**（部署时从 `web/` 源码目录直接构建），所以 `web/` 下的
东西**不能搬到仓库根的 `tools/`**。这条边界由部署方式决定，不因整改而变。整改只在**各自内部**按角色分目录。

```text
tools/
  ci/                     编排层：只装跑手与清单，不再装检查本身
    check_all.py / checklist.yml / mutate_guards.py    （不变，豁免命名规则）
  guards/                 「守契约」：对一组同类对象套同一套断言
    guard-px4log-provider.py           ← tools/calibrate/（已落地，只需换目录）
    guard-rule-field-exists.py         ← tools/calibrate/lint_rules.py
    guard-engine-pyodide-safe.py       ← tools/ci/check_engine_purity.py
    guard-repo-no-secrets.py           ← tools/ci/check_secrets.py
    guard-meta-self-honest.py          ← tools/ci/check_hygiene.py
    _shared.py                         共用函数（下划线：被 import 的那个）
  tests/                  「跑单个对象」+ 被 pytest 收集的用例
    check_engine_pyodide.py     ← tools/calibrate/（已落地，只需换目录）
    check-px4log-verdict-unchanged.py  ← tools/calibrate/compare_baseline.py
    check-px4log-data-shape.py         ← px4log_engine_runner.py --probe-data 那一路
    test_engine_operators.py           ← engine/tests/test_operators.py
    test_engine_cel_sandbox.py         ← engine/tests/test_rule_engine.py
    conftest.py                        把 engine/ 指进 sys.path，供上面两个 import
  setup/                  环境准备
    check-toolchain-installed.py       ← tools/ci/check_prereq.py
  calibrate/              只剩「手动探查、定阈值」，终于名副其实
    probe-px4log-findings.py / probe-px4log-stats.py / probe-rule-why-matched.py
    probe-px4log-fields.py / dump-px4log-baseline.py
    logs/  baseline/                   （不变）
  px4/  browser/  _logging.py          （不变）

web/
  scripts/                只剩构建期脚本 + 一次性脚本
    build-knowledge.mjs / dev.mjs
    one-off/  fix-node-links.mjs
  guards/                 前端侧守卫集
    guard-web-invariants.mjs    ← web/scripts/test-issue-filer.mjs
    guard-skill-dir-spec.mjs    ← web/scripts/check-skill-spec.mjs
    guard-mcp-dir-spec.mjs      ← web/scripts/check-mcp-spec.mjs
  e2e/                    真 E2E（不动）
```

**这样解决的三件事**：

- `tools/calibrate/` 搬走不需要日志的检查后，不再有「目录承诺要日志、但有一项不要」的矛盾。
- `web/scripts/` 只剩生成器 + 启动器，门禁归 `web/guards/`，一次性脚本归 `one-off/`——
  三种**生命周期完全不同**的东西不再平铺。
- `tools/ci/` 只剩编排层（三个豁免文件），不再出现「跑手与它驱动的检查住在同一个平铺目录里」。

**`engine/tests/` 搬不搬？建议搬**（`engine/` 的产品代码不动）。理由：三段式里 `test` 的第二段就是被测对象，
`test_engine_operators.py` 与 `check-px4log-verdict-unchanged.py` 必须**并列可读**；留在 `engine/tests/`
会让"引擎的单测"与"日志的回归"继续分居两地。**待你定**（见 §6）。

代价：`tools/tests/` 要加 `conftest.py`（把 `engine/` 塞进 `sys.path`），并同步改 `pyproject.toml` 的
`testpaths`（现在写死 `["engine/tests"]`）。两者都是 3 行以内，但**必须一起改**——只改一个，
pytest 会**静默收集到 0 个用例**。

### 3.C 阶段：从「六阶段三空位」改成「触发 × 环境前提」两轴

**轴 1（触发）= 阶段**，只保留真有东西的三个：

| 阶段    | 谁触发                     | 内容                                              |
| ------- | -------------------------- | ------------------------------------------------- |
| `push`  | `.githooks/pre-push`       | 秒级静态检查 + 日志回归（需 `needs: logs`）       |
| `ci`    | `.github/workflows/ci.yml` | 产物一致性、内容规范、守卫集、依赖审计、E2E、自证 |
| `build` | CI 显式列出                | `next build`（144s）                              |

**轴 2（环境前提）** 从 `when:` 里拿出来，单独一个 `needs:` 字段：

```yaml
- id: "compare-baseline"
  needs: logs # ← 不再是 when: "has_logs"
```

理由：`has_logs` 是**运行期才判定的环境事实**（日志在不在这台机器上），不是"这一步要不要跑"的条件判断。
混在 `when:` 里，`--list-stages` 就没法把「为什么它没跑」说清楚。改完后 `--list-stages` 打：

```text
    - compare-baseline      Frozen baseline field-by-field diff   [needs: logs — 本机无日志，将 SKIP]
```

**具体改动**：

1. **删掉三个空阶段**（`dev` / `commit` / `deploy` 的 `steps: []`）。清单只声明「它能驱动的东西」；
   全貌归文档。但为了让 `--list-stages` 仍是一张完整地图，加一个 `external:` 段（只用于展示，不参与执行）：

   ```yaml
   external:
     - id: dev      trigger: "pnpm dev / tsc --noEmit --watch"   why: "常驻进程，没有退出码"
     - id: commit   trigger: ".githooks/pre-commit"              why: "只格式化 staged 文件"
     - id: deploy   trigger: ".github/workflows/deploy.yml"      why: "部署后打线上 E2E"
   ```

2. **`--stage` 省略时不再包含 `build`。** 现状省略 = 全跑，于是 `python tools/ci/check_all.py` 会意外跑
   144s 的 `next build`，而 CI 反而显式写 `--stage build,ci`——两边行为不一致。改法：默认集合 = `push,ci`；
   `build` 必须显式点名。
3. **删掉别名，机制归一**：`--pre-push`、`--with-build` 全删（改用 `--stage`）。
   只留 `--stage` / `--with-e2e` / `--with-mutate` / `--skip-logs`。
   `--with-e2e` / `--with-mutate` **保留为步骤级开关**（它们 toggle 阶段内的步骤，与选阶段正交——
   这条已经踩过一次，见 CLAUDE.md §6.9.1）。
4. **hook 的环境变量保留**（`WITH_E2E=1` / `FULL_PUSH=1`），但职责只有一条：翻译成 `--stage` / `--with-*`，
   并在 hook 头部写清这个翻译表。现状已经是这样，只需要**不再新增第四种表达方式**。

### 3.D 顺手修一个真 bug（零风险，建议第一批就做）

`.github/workflows/ci.yml` 的 job `guard-self-proof`：

```yaml
run: python tools/ci/check_all.py --with-mutate # ← 没有 --stage
```

`check_all.py` 里 `selected = args.stage or [所有阶段]`，所以这个 job **会额外全跑一遍
`push`（14 项，含 ruff/tsc/prettier/eslint/pip-audit）+ `ci` + `build`（`next build` 144s）**，
而它的目的只是跑 43 条变异。

修法：改成 `python tools/ci/check_all.py --stage ci --with-mutate`（`mutate-guards` 那一步就住在 ci 阶段里）。

> 这个 bug **没有任何输出**——命令正常、退出码正常、日志正常，只是云上白白多跑几分钟。
> 和本项目已经踩过五次的形状一致，所以建议在整改里一并钉住：
> **新增一条 `guard-meta-self-honest` 检查：CI workflow 里每次调 `check_all.py` 都必须带 `--stage`。**

### 3.E 文档：三处收敛成两处，各自单一职责

| 文档                                     | 整改后的职责                                                   | 动作                                              |
| ---------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| **`docs/dev/check-taxonomy.md`（新增）** | **唯一的定义处**：类型词 + 目录归属规则 + 两轴模型             | 新建。本次整改的核心文档                          |
| `docs/dev/testing-at-a-glance.md`        | **唯一的新人速查页**：阶段 → 检查 → 谁跑 → 耗时，一张表        | 更新：用新词、用实测数字（42/16/11）              |
| `CLAUDE.md` §6.9                         | **只留三条**：门禁在哪一个入口、`CI 全绿 ≠ 回归过了`、三条命令 | **瘦身**：删掉已过时的五关流水线图与 40/29 用例数 |
| `docs/dev/checks-by-stage.md`            | **只留论证**：为什么这样分档、实测档案                         | 清理「已定 / 已实施 / 待你决定」的谈判痕迹        |

---

## 4. 落地顺序（4 批，每批可独立验证）

| 批次  | 内容                                                                                                       | 验证方式                                                                                                   | 风险                                       |
| ----- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **0** | 修 CI job2（加 `--stage ci`）+ 加一条 `guard-meta-self-honest` 检查「CI 调 `check_all.py` 必带 `--stage`」 | 本地跑 `guard-meta-self-honest`；看 CI 时长下降                                                            | 无                                         |
| **1** | 只写文档：新建 `check-taxonomy.md`，更新 `testing-at-a-glance.md` 的用词与数字                             | 人读                                                                                                       | 无（不动代码）                             |
| **2** | 阶段清理：删空阶段 + 加 `external:` + `needs:` 字段 + 删别名 + 改默认集合                                  | `check_all.py --list-stages` 全项可读；本地 `--stage push` 跑通；CI 绿                                     | 中（`--stage` 语义变了，4 处调用点要同步） |
| **3** | 搬家 + 改名（3.A + 3.B 全部）                                                                              | **每搬一个**：对应守卫单跑 → `mutate_guards`（证明它还会红）→ `guard-meta-self-honest`（证明扫描范围没塌） | **高**（见第 5 节）                        |
| **4** | 文档收敛：CLAUDE.md §6.9 瘦身、`checks-by-stage.md` 清痕迹                                                 | 人读                                                                                                       | 无                                         |

**批次 3 建议再切成 5 小步**，每小步独立提交、独立验证：

- 3.0 两个**已改名**的文件换目录（名字不动）：
  `check_engine_pyodide.py` → `tools/tests/`；`guard-px4log-provider.py` → `tools/guards/`
- 3.1 `tools/calibrate/lint_rules.py` → `tools/guards/guard-rule-field-exists.py`
- 3.2 `tools/ci/check_*.py` → `tools/guards/`，改名 `guard-engine-pyodide-safe.py` /
  `guard-repo-no-secrets.py` / `guard-meta-self-honest.py`。
  注意：`guard-engine-pyodide-safe.py` 现在 `from check_hygiene import py_code_only`，
  而新名带连字符**不能被 import**。同一小步里必须先把 `py_code_only` 抽到
  `tools/guards/_shared.py`（下划线，可被 import），再改 import（见第 5 节第 3 条）
- 3.3 `tools/calibrate/` 的 `compare_baseline.py` → `tools/tests/check-px4log-verdict-unchanged.py`；
  `px4log_engine_runner.py` 拆成 `probe-px4log-findings.py` + `check-px4log-data-shape.py`；
  建 `conftest.py` 并改 `pyproject.toml` 的 `testpaths`
- 3.4 `engine/tests/*` → `tools/tests/`（**与 3.3 同一个提交做**，否则 `testpaths` 要改两次）；
  `test_operators.py` → `test_engine_operators.py`、`test_rule_engine.py` → `test_engine_cel_sandbox.py`
  （保持下划线，pytest 才能 import 到）
- 3.5 `web/scripts/` → `web/guards/`（三个守卫）+ `web/scripts/one-off/`；
  `test-issue-filer.mjs` → `guard-web-invariants.mjs`，这一步改动面最大，建议单独提交

---

## 5. 必须同步改的点（搬家的死穴 · 核对清单）

搬文件最危险的后果不是报错，是**守卫静默失效**——扫描范围塌了一块，而它自己不会说。
下面每一条都是「搬了 A 不动 B 就会静默失效」的点：

| #   | 位置                                                        | 写死了什么                                                                                               | 搬家后必须                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `tools/ci/check_hygiene.py` `_gate_files()`                 | glob 只覆盖 `tools/**/*.py` + **`web/scripts/**/*.mjs`**                                                 | `guard-web-invariants.mjs` 搬进 `web/guards/` 后**会脱离扫描范围**——「打了 FAIL 就要非零退出」那一条将不再覆盖全仓库最大的守卫集。glob 必须加 `web/guards/**/*.mjs`                                                                                     |
| 2   | `tools/ci/mutate_guards.py` 注册表                          | 43 条变异的 `path` 字段硬编码 `tools/calibrate/check_artifact.py`、`web/scripts/test-issue-filer.mjs` 等 | 全部 `path` 要跟着改；`GUARDS` 里各守卫的 argv 也要改。**改完必须跑一次完整 `mutate_guards`（约 20 分钟）**                                                                                                                                             |
| 3   | `tools/ci/check_engine_purity.py`                           | `sys.path.insert(0, parent)` + `from check_hygiene import py_code_only`（sibling import）                | 新名 `guard-meta-self-honest.py` 是**连字符，不能 import**（`from guard-meta-self-honest import ...` 是语法错误）。必须把 `py_code_only` 抽到一个下划线文件（如 `tools/guards/_shared.py`），或改走 `importlib.util.spec_from_file_location` 按路径加载 |
| 4   | `pyproject.toml` `[tool.pytest.ini_options]` `python_files` | `["test_*.py"]`                                                                                          | **不需要改**——`test_engine_*.py` 保持下划线，本来就被收                                                                                                                                                                                                 |
| 5   | `tools/ci/check_hygiene.py` `check_freshness_gate_alive()`  | 硬编码 `WEB / "scripts" / "build-knowledge.mjs"`                                                         | 生成器不动 → 不受影响（记录在案即可）                                                                                                                                                                                                                   |
| 6   | `tools/ci/check_hygiene.py` `PROBES`                        | 探针 argv 硬编码 `tools/calibrate/px4log_engine_runner.py`                                               | 3.3 拆分后要改成 `tools/tests/check-px4log-data-shape.py`                                                                                                                                                                                               |
| 7   | `tools/ci/checklist.yml`                                    | 每个 step 的 `command` 写死脚本相对路径                                                                  | 全部同步；`build-knowledge.mjs --check` 那一步的**字样被 `guard-meta-self-honest` 扫**，不能改                                                                                                                                                          |
| 8   | `web/package.json`                                          | `check:skills` / `check:mcp` 指向 `scripts/check-*.mjs`                                                  | 改成 `guards/guard-*.mjs`（npm script 名 `check:*` 不动，它是命名空间不是类型词）                                                                                                                                                                       |
| 9   | `pyproject.toml` `testpaths`                                | `["engine/tests"]`                                                                                       | 3.3/3.4 搬完必须改成 `["tools/tests"]`，否则 pytest **收集到 0 个用例**。搬完当场断言「收集数非零」                                                                                                                                                     |
| 10  | `docs/` 三份 + `CLAUDE.md` §6.9 + `.github/workflows/*.yml` | 大量路径与用例数引用                                                                                     | 批次 4 统一收口                                                                                                                                                                                                                                         |

> 第 9 条是典型的静默失效：`pytest` 在 `testpaths` 指向不存在的目录时**不会报错**，
> 会打印 `no tests ran` 然后退出码 0。
> 纪律：**任何"按路径收集"的检查，搬完都要断言"收集到的数量非零"**——建议做成 `guard-meta-self-honest` 的一项。

---

## 6. 风险与待确认

| 项                                           | 说明                                                                                                                                           | 建议                                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **批次 3 的验证成本**                        | 43 条变异完整跑一次约 20 分钟；拆成 5 小步就要跑 5 次                                                                                          | 建议每小步只跑**受影响的那几条**（`mutate_guards --only <名字>`），最后整跑一次                                      |
| **`engine/tests/` 搬不搬**                   | 会牵动 `pyproject.toml` 的 `testpaths`，`engine/README.md` 也要同步                                                                            | 想压小改动面可**先不做 3.4**：`engine/tests/` 原样保留。代价是"引擎单测"与"日志回归"仍分居两地。**待你定**           |
| **`check-px4log-data-shape.py` 是一次拆分**  | `px4log_engine_runner.py` 一身两职（探查 + `--probe-data` 测试），拆完要保证 `guard-meta-self-honest` 的探针指向新文件                         | 先只搬不改逻辑，跑通再调                                                                                             |
| **`web/guards/` 会不会被打进部署包**         | EdgeOne 从 `web/` 源码目录构建，未被 import 的 `.mjs` 不会被打包，但**可能仍被上传**。现状它们也在 `web/scripts/` 下，风险**没有新增**         | 若在意可移到仓库根 `tools/web-guards/`，但那样跨了部署边界，读取 `web/` 源码要靠相对路径——**不建议**                 |
| **`test-issue-filer` 改名要连带改的东西**    | 段 [10]/[12]/[16] 里有些断言**已经在核"归一函数还被导出"这类自身代码**，改文件名不影响；但 `mutate_guards` 注册表里 27 条打它的变异要改 `path` | 单独提交，改完必须跑完整 `mutate_guards`                                                                             |
| **`one-off/` 还是 `_once/`**                 | 一次性脚本的目录名                                                                                                                             | 倾向 `one-off/`（望文生义）                                                                                          |
| **`engine/test_pyulog.py`**                  | 是 demo 不是测试，且**实测收集不到**（不在 `testpaths` 里）                                                                                    | 建议改名 `demo-pyulog-read.py`，明确它不是测试。**待你定**                                                           |
| **`web/scripts/browser/check-*.mjs` 改不改** | 两段式，且不进任何门禁                                                                                                                         | 建议改 `probe-site-*.mjs`，或按"不进清单就不强求"原样保留。**待你定**                                                |
| **`build` 阶段的默认语义变更**               | 现状省略 `--stage` 会跑 build；改后不跑。有人（含脚本）可能依赖现状                                                                            | 改的时候在 `check_all.py` 的 docstring 与输出头里**明说**"build 需显式点名"                                          |
| **文档漂移会不会重演**                       | 三份文档已经漂移过（40 vs 42 用例）                                                                                                            | 加一条 `guard-meta-self-honest` 检查：**文档里出现的 E2E 用例数 / 变异条数，必须与 `--list` 实测对得上**。放在批次 4 |

---

## 7. 明确不做的事

- **不动 `has_logs` 这组检查"只在本地跑"的决定**——原始日志含 GPS 轨迹不入库，这是隐私硬约束，
  不是组织问题。整改只让它**在 `--list-stages` 里说得更清楚**（`[needs: logs]`），不改变它跑不跑。
- **不动 `web/package.json` 的 `test:e2e*`**——那儿的 `test:` 是 npm script 命名空间，不是本规则的类型词。
- **不动 `web/functions/*-probe.js`**——边缘路由，运行时由目录表达。
- **不给编排层套三段式**（`check_all.py` / `checklist.yml` / `mutate_guards.py`）——见 3.A 的豁免表。
- **不搬 `engine/` 的产品代码**——只在需要时搬它的 `tests/`。整改只解决"叫什么、放哪、什么时候跑"，
  不解决"用什么跑"。

---

## 8. 附：命名速查（改完贴在 `check-taxonomy.md` 顶部）

```text
<什么类型>-<什么模块>-<干什么>

类型（放开头：pytest 只按开头收，且 ls 时同类型自动聚簇）
       guard   守契约：对一组同类对象逐个套用同一套断言（静态动态都行）
       check   跑单个对象：跑一遍，断言它的输出或结构
       test    被 pytest 收集的用例集
       probe   人手动探查，无门禁
       dump    把当前结论写盘成文件，无门禁

       setup 不是类型词，是目录名（tools/setup/）

分隔符（按调用方式分，不按语言分）
       命令行直接跑的脚本      →  -     例：check_engine_pyodide.py
       需要被 import 的模块    →  _     例：test_engine_operators.py、_logging.py、conftest.py
       理由：连字符 .py 不能 import（from check-x import y 是语法错误）

模块（用本仓库内部名词）
       px4log     PX4 .ulg 日志链路（产物叫 analysis-engine.generated.ts / analysis-worker.ts；不用 ulog，仓库里已无 ulog-* 工具）
       rule       规则文件 knowledge/px4/rules/
       engine     Python 引擎源码 engine/
       artifact   编译产物（不指名时）
       meta       校验机制自身
       repo       整个仓库的提交内容
       toolchain  Python / node / ruff / tsc 在不在
       web        前端源码
       skill / mcp   knowledge 下的两个内容目录

干什么（判据：念给没读过文档的人，他能说出"这一步在做什么"）
       verdict-unchanged  跑一遍，看结论有没有变
       adapter-contract   每种格式的适配器合不合约定
       data-shape         数据层吐给前端的结构对不对
       field-exists       规则引用的字段名存不存在
       pyodide-safe       源码在 Pyodide 里跑不跑得动
       no-secrets         有没有提交密钥
       self-honest        校验机制自己有没有说谎
       invariants         源码里的一族不变量还成不成立
       dir-spec           目录合不合规范
       why-matched        这条规则为什么命中 / 没命中

       不合格（术语堆叠，看不出动作）：
       baseline / contract / schema / purity / leak / self / spec / invariant

允许第四段：被检对象是产物时，直接写产物全名
       check_engine_pyodide.py   念出来 = "检查 analysis-engine.generated 这个产物"

改名实例
       compare_baseline.py    → check-px4log-verdict-unchanged.py
       lint_rules.py          → guard-rule-field-exists.py
       check_engine_purity.py → guard-engine-pyodide-safe.py
       check_secrets.py       → guard-repo-no-secrets.py
       check_hygiene.py       → guard-meta-self-honest.py
       test-issue-filer.mjs   → guard-web-invariants.mjs
       test_operators.py      → test_engine_operators.py（下划线：pytest 要 import）
       dump_px4log_stats.py   → probe-px4log-stats.py

豁免（不是检查，是"作用于检查"的东西）
       tools/ci/check_all.py     跑手
       tools/ci/checklist.yml    清单
       tools/ci/mutate_guards.py 自证机
       tools/_logging.py         共用库
       web/scripts/*.mjs         构建脚本
       web/e2e/*.spec.ts         Playwright 只认 testMatch，类型由目录表达
```
