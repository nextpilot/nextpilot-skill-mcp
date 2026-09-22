# 校验体系整改方案（test / check 命名 + 目录 + 阶段�?

> **状态：待确认，未动任何代码�?*
> 本文是整改的 plan。先给结论与盘点，再给方案与落地顺序，最后是必须同步改的点与风险�?

---

## 0. 结论先行

**一句话诊断**：`test` �?`check` 现在不对应任何真实区别——因�?*三条正交的轴被压扁成了一个前缀**�?

| �?| 取�?| 现在有没有被命名 |
| --- | --- | --- |
| A 怎么判定 | 执行代码断言输出 / 扫源码找模式 / 输出给人�?| �?没有，全�?`test` `check` �?|
| B 作用�?| 单元 / 契约 / 端到�?/ 内容规范 / 元（校验机制自身�?| �?没有，只能从目录�?|
| C 谁跑、什么时候跑 | commit / push / 云端 / 部署�?/ 手动 | ⚠️ 有，但被 4 套机制重复表�?|

由此产生四处具体症状（第 2 节有逐项证据）：

1. **名叫 `test` 的其实不是测�?*：`web/scripts/test-issue-filer.mjs` 是全仓库最大的**守卫�?*�?1 �?131 条静态断言），而且�?`mutate_guards` 的主要变异目标；它跟生成�?`build-knowledge.mjs` 平铺在同一个目录里�?
2. **名叫 `check` 的其实是测试**：`tools/calibrate/guard-px4log-provider.py` 是逐份日志跑同一套断言�?*契约测试**；`compare_baseline.py` �?`test`/`check` 前缀都没有，却是**最硬的一道回归测�?*�?
3. **目录名在撒谎**：`tools/calibrate/README.md` 说这�?都要真实 `.ulg`"，但 `check-pyodide-px4log-engine.py` **不需要日�?*且挂�?push 阶段每次都跑——它是清单里唯一一�?住在 calibrate/ 却没�?`when: has_logs`"的项�?
4. **阶段划分与执行时机脱�?*：`checklist.yml` 声明 6 个阶段，其中 **3 个是空占�?*；而真正的执行时机�?4 套机制各说一遍（YAML �?`stage`/`when`、CLI �?`--stage`/`--with-*`、hook �?`WITH_E2E`/`FULL_PUSH`、CI workflow 里的显式命令）�?

**整改思路**：按「怎么判定」分目录（轴 A），按「谁跑」分阶段（轴 C），两轴各自单一事实源；�?B（作用域）不进目录结构，写进 `--list-stages` 的展示里�?

**命名定稿**：`<什么类�?-<什么模�?-<干什�?`，类型词**放开�?*，Python �?`_`、JS �?`-`�?
类型词五个：`guard`（静态扫描）/ `check`（动态执行）/ `test`（pytest 收集�? `probe`（人工探查）/ `dump`（写盘）�?
选这个顺序与分隔符的实测依据�?3.A——它顺带绕开了「连字符 .py 的两个静默失效」�?

---

## 1. 全量盘点：现在每个文件到底是什�?

### 1.1 Python �?

| 文件 | 前缀 | **实际是什�?* | 在哪个阶�?| 条件 |
| --- | --- | --- | --- | --- |
| `engine/tests/test_operators.py` | test | �?真单测（pytest，断言求值结果） | push | always |
| `engine/tests/test_rule_engine.py` | test | �?真单�?| push | always |
| `engine/test_pyulog.py` | test | ⚠️ demo/验证脚本�?*不测任何东西**（被 `pyproject.toml` �?`testpaths` 排除�?| 从不自动�?| �?|
| `tools/calibrate/compare_baseline.py` | �?| �?**回归测试**�? 份冻结基线逐字段比对） | push | needs-logs |
| `tools/calibrate/guard-px4log-provider.py` | check | �?**契约测试**（逐份日志跑同一套断言�?| push | needs-logs |
| `tools/calibrate/run_checks_locally.py` | run | ⚠️ **双身�?*：主用途是探查工具；`--probe-data` 那一路是数据层测�?| push（仅 probe-data�? 手动 | needs-logs |
| `tools/calibrate/lint_rules.py` | lint | 规则数据的字段引�?lint | push | needs-logs |
| `tools/calibrate/check-pyodide-px4log-engine.py` | check | 🛡 **产物守卫**（真执行编译产物 + 核跨语言名字�?| push | **always**（不需要日志！�?|
| `tools/ci/check_engine_purity.py` | check | 🛡 源码守卫（engine 纯净性） | push | always |
| `tools/ci/check_secrets.py` | check | 🛡 源码守卫（扫全部跟踪文件�?| push | always |
| `tools/ci/check_hygiene.py` | check | 🛡 **元守�?*（校验机制自身的卫生�? 项） | push | always |
| `tools/ci/check_prereq.py` | check | 💀 **已废弃，全仓无引�?* | �?| �?|
| `tools/ci/check_all.py` | check | 🎯 跑手（编排） | �?| �?|
| `tools/ci/checklist.yml` | �?| 🎯 清单（单一事实源） | �?| �?|
| `tools/ci/mutate_guards.py` | �?| 🎯 守卫的自证机�?3 条变异） | ci | `--with-mutate` |
| `tools/calibrate/probe_stats.py` / `probe_rule.py` / `inspect_fields.py` / `dump_baseline.py` | probe | 🔍 手动探查（定阈值、查字段、打基线�?| 手动 | �?|
| `tools/browser/check-upload.mjs` / `check-restore.mjs` | check | 🔍 手动 CDP 链路自检 | 手动 | 需 9222 端口 Chrome |

### 1.2 JS / TS �?

| 文件 | 前缀 | **实际是什�?* | 在哪个阶�?| 条件 |
| --- | --- | --- | --- | --- |
| `web/scripts/test-issue-filer.mjs` | test | 🛡 **守卫�?*�?1 �?131 条，扫源码防回潮）—�?**不是测试** | ci | always |
| `web/scripts/check-skill-spec.mjs` | check | 内容规范校验（自带反例自检�?| ci | always |
| `web/scripts/check-mcp-spec.mjs` | check | 内容规范校验（自带反例自检�?| ci | always |
| `web/scripts/build-knowledge.mjs` | �?| ⚙️ 生成器（96KB，构建期�?| dev / build | �?|
| `web/scripts/sync-content.mjs` | �?| ⚙️ 生成�?| dev / build | �?|
| `web/scripts/dev.mjs` | �?| ⚙️ dev 启动�?| dev | �?|
| `web/scripts/fix-node-links.mjs` | �?| 🗄 一次�?| 手动 | �?|
| `web/scripts/migrate-skills-to-spec.mjs` | �?| 🗄 一次性（已跑过） | 手动 | �?|
| `web/scripts/_verify-schema.mjs` | �?| 🗄 一次性（已跑过） | 手动 | �?|
| `web/e2e/pages.spec.ts` + `analyze.spec.ts` | �?| �?�?E2E�?*实测 42 �?*：@smoke 16 + 日志分析流程 11 + 其余 15�?| ci | `--with-e2e` |

### 1.3 已经存在的漂移（整改的证据，不是假设�?

| 事实 | 文档说的 | 实测 |
| --- | --- | --- |
| E2E 总数 | `CLAUDE.md` §6.9 写「全�?40 用例」「pages 29 条�?| **`playwright test --list` �?42 �?*（pages 31 + analyze 11�?|
| `@smoke` 条数 | 未写 | **16 �?* |
| `mutate_guards` 变异条数 | `testing-at-a-glance` �?43；CI 注释�?42 | �?`--list` 为准（文档互相不一致） |
| `check_prereq` | `checks-by-stage.md` 多处写「已删除�?| **文件仍在** `tools/ci/check_prereq.py` |
| CI 有没有跑 build | `CLAUDE.md` §6.9 画成「第四关�?| `ci.yml` job1 显式 `--stage build,ci`�?*job2 不带 `--stage`，会额外全跑一�?* |

> 三份文档（`CLAUDE.md` §6.9 / `testing-at-a-glance.md` / `checks-by-stage.md` 1391 行）同时描述同一件事�?
> �?`CLAUDE.md` 那份已经过时�?*这正�?什么时候执行很�?的直接来�?*：想查的人会拿到三个不同答案�?

---

## 2. 根因：三条轴压成一个前缀

同一�?`check_` 前缀下面，其实混着四种完全不同的东西：

```text
guard-px4log-provider.py     �?跑日志，断言适配器契�?       （A=执行断言�?
check-pyodide-px4log-engine.py     �?真执行编译产物，核跨语言名字    （A=执行断言，但对象是产物）
check_secrets.py      �?扫源码文本，找密钥形�?         （A=静态扫描）
check_hygiene.py      �?扫源码，查校验机制有没有说谎     （A=静态扫描，B=元）
```

而同一个「真测试」类别，又散在三个前缀下：`test_*`（engine/tests）、`check_*`（guard-px4log-provider）�?
**无前缀**（compare_baseline）�?

**命名读出承诺**这件事在本仓库是要兑现的（�?.4 �?6 条：名字读出的承诺必须是数据模型能兑现的）�?
现在 `test-issue-filer` 读出来是"测试某个报错上报功能"，实际是"21 节前端不变量守卫"—�?
新人照名字去改，会以为它只管 issue-filer 那一小块�?

---

## 3. 整改方案

### 3.A 命名：`<什么类�?-<什么模�?-<干什�?`

**命名宪法（三段都必填�?*�?

```text
        <什么类�?  -  <什么模�?  -  <干什�?
             �?            �?             �?
             �?            �?             └─ 大白话动作：它到底在做什�?
             �?            └─ 作用于哪个模块（用本仓库内部名词指对象）
             └─ 类型词，�?*开�?*：决定「谁会收集它、怎么调用它�?
```

**为什么类型词放开�?*——三条，第一条是硬约束：

1. **pytest 只按文件名开头收**。默�?`python_files = ["test_*.py"]`。类型词挪到末尾就得改成
   `*-test.py`，�?*配错是静默的**：实测同目录�?`operators-engine-test.py` +
   `test_engine_operators.py`，默认配置只收到 **1 �?*，连字符那个一声不响被丢掉�?
   放开头则零配置�?
2. `ls` 时同类型自动聚成一簇，`guard_*` 一屏扫完�?
3. 读者第一眼就知道"这是扫描还是执行"，再决定要不要接着读�?

> **分隔符：Python �?`_`，JS / TS �?`-`**。这是全仓唯一一处两套规则，原因�?
> Python 文件名要能当模块名用（`from guard_meta_self_honest import py_code_only`），
> 连字符在这里�?*语法错误**（实测）。JS 侧没这个约束，沿用仓库既有连字符
> （`test-issue-filer.mjs`、`build-knowledge.mjs`）�?
>
> 这套组合把上一版实测出来的两个连带改动**一起消掉了**：`python_files` 不用动，
> 共用函数也不用抽�?`_shared.py`�?

**类型词（第一�?= 文件名开头）——五个，一眼归�?*�?

| 类型�?| 含义 | 判定方式 | 扩展�?|
| --- | --- | --- | --- |
| `guard` | 扫源�?/ 扫产物，断言不变量还成立 | 静态：不执行被测对象，只读文本或结�?| `.py` / `.mjs` |
| `check` | 跑代码或数据，断言输出对不�?| 动态：有输�?�?执行 �?与期望比�?| `.py` |
| `test` | 测试用例�?| �?pytest 收集 | `.py` |
| `probe` | 人手动探查，输出给人�?| 无门禁：没有「通过 / 失败�?| `.py` |
| `dump` | 把当前结论写盘成文件 | 无门禁，产出�?| `.py` |

> **`guard` �?`check` 的区别就是「静�?vs 动态�?*——正�?§2 里那条被压扁的轴�?
> 写进文件名首段后，读者不必先看目录就知道"这个会不会跑起来"�?
> `test` 单独占一个词，是因为 pytest 只按 `test_` 开头收集，它必须和 `check_` 分开�?
> `setup` 从类型词**降为目录�?*（`tools/setup/`）：仓库里没�?执行安装"的脚本，
> 只有一�?工具链装没装"的检查，它是 `check_*`，不�?`setup_*`�?

**"干什�?段（第三段）——判据是「念出来就知道它在做什么�?*�?

这条要过**两道闸门**才算合格�?

> **闸门 1**：把名字念给一个没读过本仓库文档的人听，问�?这个脚本干什�?�?
> 只能答出"大概是测什么的�? �?不合格，换动作词�?
>
> **闸门 2**：只看名字，能不能说�?*它作用于什么模块、属于什么类�?*�?
> 说不出来 �?模块词或类型词没写清�?

第一版我写的�?`test_log_baseline` / `test_log_contract` / `test_log_schema`�?*两道都没�?*�?

- `baseline` / `contract` / `schema` �?*术语堆叠**——它们命名的�?这类测试属于哪个方法论类�?�?
  不是"这一步真的在做什�?。念出来只能得到"大概是测什么的�?�?
- 而且 `log` 在本仓库是内部名词（特指 `.ulg` 分析链路），读者不知道"log 是什么模�?�?

改法�?*两头都变**：动作词换成大白话动词，模块词换成看得见的对象名�?

**"什么模�?段（第二段）——用本仓库内部名词，但必须是读者能对上号的那个**�?

| 模块 | 用哪个词 | 为什么不用别�?|
| --- | --- | --- |
| Python 引擎源码（`engine/`�?| `engine` | 就是目录名，读者能对上 |
| 编译产物（`web/workers/pyodide-px4log-engine.ts`�?| `artifact` | 仓库里一直叫�?产物"，文档里也是 |
| PX4 `.ulg` 日志 | `ulog` | **不用 `log`**——太泛，读者不知道�?哪个 log"；`ulog` �?PX4 日志格式本名 |
| 规则文件（`knowledge/px4/rules/*.yaml`�?| `rule` | 仓库里叫"规则"，`rules/` 就是目录�?|
| 校验机制自身 | `meta` | "元检�?这个词项目里已经在用（`check_hygiene` �?docstring�?|
| 整个仓库的提交内�?| `repo` | 通用词，无歧�?|
| 工具链（Python / node / ruff / tsc 在不在） | `toolchain` | �?`prereq` 具体 |
| 前端源码（组�?/ Worker / 边缘函数�?| `web` | 就是目录�?|
| `knowledge/skills` 目录 | `skill` | 就是目录�?|
| `knowledge/mcp` 目录 | `mcp` | 就是目录�?|

> **`log` �?`ulog` 是这一版的实质修正**：`log` 太泛（日志？运行日志？提交日志？），
> 而仓库里这个对象的准确名字是 `.ulg`。用 `ulog` 后，`check_ulog_*` 一眼知道是"飞控日志那条�?�?
> 同理 `rules` �?`rule`（单数，�?`knowledge/px4/rules/` 对齐）�?

**动作词（"干什�?）——合�?/ 不合格对�?*�?

| 不合格（术语堆叠�?| 为什么不�?| 换成大白�?| 念出�?|
| --- | --- | --- | --- |
| `baseline` | 什么基线？ | `verdict_unchanged` | 跑一遍，看结�?*有没有变** |
| `contract` | 契约�?| `adapter_contract` | 每种日志格式的适配器，**报错和取值合不合约定** |
| `schema` | 数据库模式吗�?| `data_shape` | 数据层吐给前端的**结构对不�?* |
| `ref` | 引用什么？ | `field_exists` | 规则引用�?*字段名存不存�?* |
| `purity` | 什么纯净�?| `pyodide_safe` | 源码**�?Pyodide 里跑不跑得动** |
| `leak` | 泄漏什么？ | `no_secrets` | 有没�?*提交密钥** |
| `self` | 自己�?| `self_honest` | 校验机制**自己有没有说�?* |
| `spec` | 什么规范？ | `dir_spec` | **目录合不合规�?* |

**改名定案**（`<类型>-<模块>-<干什�?`；Python `_`，JS `-`）：

| 现状 | 新名 | 干什�?| 什么模�?| 什么类�?|
| --- | --- | --- | --- | --- |
| `tools/calibrate/check-pyodide-px4log-engine.py` | `tools/guards/guard_artifact_globals_exist.py` | 产物里的名字存不存在 | artifact | guard |
| `tools/ci/check_engine_purity.py` | `tools/guards/guard_engine_pyodide_safe.py` | 能不能在 Pyodide �?| engine | guard |
| `tools/ci/check_secrets.py` | `tools/guards/guard_repo_no_secrets.py` | 有没有提交密�?| repo | guard |
| `tools/ci/check_hygiene.py` | `tools/guards/guard_meta_self_honest.py` | 校验机制有没有说�?| meta | guard |
| `tools/calibrate/compare_baseline.py` | `tools/tests/check_ulog_verdict_unchanged.py` | 结论有没有变 | ulog | check |
| `tools/calibrate/guard-px4log-provider.py` | `tools/tests/check_ulog_adapter_contract.py` | 适配器合不合约定 | ulog | check |
| （`run_checks_locally.py --probe-data` 那一路） | `tools/tests/check_ulog_data_shape.py` | 数据结构对不�?| ulog | check |
| `tools/calibrate/lint_rules.py` | `tools/tests/check_rule_field_exists.py` | 字段名存不存�?| rule | check |
| `engine/tests/test_operators.py` | `tools/tests/test_engine_operators.py` | 算子求值对不对 | engine | test |
| `engine/tests/test_rule_engine.py` | `tools/tests/test_engine_cel_sandbox.py` | 表达式沙箱对不对 | engine | test |
| `tools/calibrate/run_checks_locally.py` | `tools/calibrate/probe_ulog_findings.py` | 把结论打出来�?| ulog | probe |
| `tools/calibrate/probe_stats.py` | `tools/calibrate/probe_ulog_stats.py` | 看字段分布定阈�?| ulog | probe |
| `tools/calibrate/probe_rule.py` | `tools/calibrate/probe_rule_why_matched.py` | 为什么命�?/ 没命�?| rule | probe |
| `tools/calibrate/inspect_fields.py` | `tools/calibrate/probe_ulog_fields.py` | 打印有哪些字�?| ulog | probe |
| `tools/calibrate/dump_baseline.py` | `tools/calibrate/dump_ulog_baseline.py` | 冻结成基线（写盘�?| ulog | dump |
| `tools/ci/check_prereq.py` | `tools/setup/check_toolchain_installed.py` | 工具链装没装 | toolchain | check |
| `web/scripts/test-issue-filer.mjs` | `web/guards/guard-web-invariants.mjs` | 不变量还成不成立 | web | guard |
| `web/scripts/check-skill-spec.mjs` | `web/guards/guard-skill-dir-spec.mjs` | 目录合不合规�?| skill | guard |
| `web/scripts/check-mcp-spec.mjs` | `web/guards/guard-mcp-dir-spec.mjs` | 目录合不合规�?| mcp | guard |

> **本次定稿相对上一版的四处实质变更**�?
>
> 1. **类型词放开�?*（不是末尾）——pytest 硬约束见上，实测证据见上�?
> 2. **分隔符分语言**：Python `_`（要能当模块名）、JS `-`（仓库既有）�?
>    由此，上一版实测的两个连带改动（改 `python_files`、抽 `_shared.py`�?*都不需要了**�?
> 3. **`guard` �?`check` 在文件名里分开**：`guard_*` 是静态扫描、`check_*` 是动态执行�?
>    上一版把两者都写成 `check_*`，导致类型词表里 `guard` 这一�?*没有文件用它**（死词）�?
> 4. **`log` �?`ulog`、`rules` �?`rule`**：`log` 太泛，`.ulg` 是这个仓库里那个对象的准确名字�?

**编排层豁免（明确不受命名规则约束，因为它不是检查）**�?

| 文件 | 为什么豁�?|
| --- | --- |
| `tools/ci/check_all.py` | 它是**跑手**（编排），不是检�?|
| `tools/ci/checklist.yml` | 它是**清单**（单一事实源），不是检�?|
| `tools/ci/mutate_guards.py` | 它是**自证�?*（把变异注入再断言守卫会红），不是检�?|
| `tools/_logging.py` | 共用�?|
| `web/scripts/build-knowledge.mjs` 等三�?| **构建脚本**，不是检�?|

> 豁免不是"懒得�?：这几个文件的共同点�?*它们作用于检查，而不是作用于代码**�?
> 给编排层硬套三段式会产生 `run_checks_all.py` 这种既没信息量、家族又重复的名字�?

**保留不改**�?

- `web/package.json` �?`test:e2e*` —�?Playwright 的社区惯例名（它�?`test:` �?npm script 命名空间�?
  不是本规则的类型词），改名没有收益。文档里说清「`test:e2e:*` 是真 E2E，与 `guard_*`（静态扫描）是两回事」�?
- `web/e2e/*.spec.ts` —�?Playwright 只认 `testMatch`，改名即收集不到。类型由目录 `e2e/` 表达�?
- `tools/browser/check-upload.mjs` / `check-restore.mjs` —�?手动 CDP 自检�?*不进任何门禁**�?
  建议顺手改成 `probe-site-upload.mjs` / `probe-site-restore.mjs`，或�?不进清单就不强求"原样保留�?*待你�?*�?

**待确认的一�?*：`web/functions/issue-probe.js` / `kv-probe.js` �?*边缘函数路由**（`/api/issue-probe`），
里面�?`probe` 意思是"诊断接口"，与新定义的"手动探查工具"撞词。建�?*不动**（运行时由目录表达，
`functions/` 整个目录就是边缘，�?.4 �?4 条），只�?taxonomy 文档里点明这一处同词异义�?

### 3.B 目录：按「怎么判定」归�?

**硬约束先说清**：`web/` �?*独立部署单元**（部署时�?`web/` 源码目录直接构建），所�?`web/` 下的
东西**不能搬到仓库根的 `tools/`**。这条边界由部署方式决定，不因整改而变。整改只�?*各自内部**按角色分目录�?

```text
tools/
  ci/                     编排层：只装跑手与清单，不再装检查本�?
    check_all.py            （不变，豁免命名规则�?
    checklist.yml           （不变，豁免命名规则�?
    mutate_guards.py        （不变，豁免命名规则�?
  guards/                 「扫源码 / 扫产物，断言不变量」的守卫
    guard_artifact_globals_exist.py   �?tools/calibrate/check-pyodide-px4log-engine.py
    guard_engine_pyodide_safe.py      �?tools/ci/check_engine_purity.py
    guard_repo_no_secrets.py          �?tools/ci/check_secrets.py
    guard_meta_self_honest.py         �?tools/ci/check_hygiene.py
    （guard_engine_pyodide_safe.py �?sibling import �?guard_meta_self_honest �?py_code_only�?
     下划线文件名可以直接 from ... import，不需�?_shared.py�?
  tests/                  「跑代码、断言输出」的检�?+ 测试用例�?
    check_ulog_verdict_unchanged.py   �?tools/calibrate/compare_baseline.py
    check_ulog_adapter_contract.py    �?tools/calibrate/guard-px4log-provider.py
    check_ulog_data_shape.py          �?tools/calibrate/run_checks_locally.py --probe-data 那一�?
    check_rule_field_exists.py        �?tools/calibrate/lint_rules.py
    test_engine_operators.py          �?engine/tests/test_operators.py
    test_engine_cel_sandbox.py        �?engine/tests/test_rule_engine.py
    conftest.py                        �?engine/ 指进 sys.path，供上面六个 import
  setup/                  环境准备（不是检查）
    check_toolchain_installed.py      �?tools/ci/check_prereq.py（工具链装没装）
  calibrate/              只剩「手动探查、定阈值」，终于名副其实
    probe_ulog_findings.py            �?run_checks_locally.py 的主用途（输出 findings JSON�?
    probe_ulog_stats.py               �?probe_stats.py
    probe_rule_why_matched.py         �?probe_rule.py
    probe_ulog_fields.py              �?inspect_fields.py
    dump_ulog_baseline.py             �?dump_baseline.py（写盘，非门禁）
    logs/  baseline/                  （不变）
  px4/  browser/  _logging.py（不变）

web/
  scripts/                只剩构建期脚�?
    build-knowledge.mjs / sync-content.mjs / dev.mjs
    one-off/                🗄 一次性脚本，表明"不参与门�?
      fix-node-links.mjs / migrate-skills-to-spec.mjs / _verify-schema.mjs
  guards/                 前端侧守卫集（与 tools/guards 同一套命名）
    guard-web-invariants.mjs    �?web/scripts/test-issue-filer.mjs
    guard-skill-dir-spec.mjs    �?web/scripts/check-skill-spec.mjs
    guard-mcp-dir-spec.mjs      �?web/scripts/check-mcp-spec.mjs
  e2e/                    �?E2E（不动）
```

**这样解决的三件事**�?

- `tools/calibrate/` 搬走 `guard_artifact_globals_exist.py` 后，不再有「目录承诺要日志、但有一项不要」的矛盾�?
- `web/scripts/` 只剩生成�?+ 启动器，门禁�?`web/guards/`，一次性脚本归 `one-off/`—�?
  三种**生命周期完全不同**的东西不再平铺�?
- `tools/ci/` 只剩编排层（三个豁免文件），不再出现「跑手与它驱动的检查住在同一个平铺目录里」�?

**改动面比上一版大了一处（必须说清�?*：这一版把 `engine/tests/*` 也搬�?`tools/tests/`�?
必要性：三段式里 `test` �?*组件�?*第二段就是被测对象，`test_engine_operators.py` �?
`check_ulog_verdict_unchanged.py` 必须**并列可读**；留�?`engine/tests/` 会让"引擎的单�?�?日志的回�?
继续分居两地，读者仍看不出它们是一类东西�?

**引擎代码搬不搬？不搬�?* 两个理由�?

1. `check_engine_purity.py` 守的�?`engine/` 是纯 Python�?*浏览器与 CPython 共用同一份源�?*
   （`build-knowledge.mjs` �?`engine/*.py` 按顺序拼成产物）。这条链与测试放哪无关�?
2. `engine/` �?*产品代码**；`tools/` �?*开发工�?*。产品代码混进工具树是本末倒置�?

代价：`tools/tests/` 要加一�?`conftest.py`（把 `engine/` 塞进 `sys.path`），
并同步改 `pyproject.toml` �?`testpaths`（现在写�?`["engine/tests"]`）�?
两者都�?3 行以内，�?*必须一起改**——只改一个，`pytest engine/tests` 会静默收集到 0 个用例�?

### 3.C 阶段：从「六阶段三空位」改成「触�?× 环境前提」两�?

**�?1（触发）= 阶段**，只保留真有东西的三个：

| 阶段 | 谁触�?| 内容 |
| --- | --- | --- |
| `push` | `.githooks/pre-push` | 秒级静态检�?+ 日志回归（需 `needs: logs`�?|
| `ci` | `.github/workflows/ci.yml` | 产物一致性、内容规范、守卫集、依赖审计、E2E、自�?|
| `build` | CI 显式列出 | `next build`�?44s�?|

**�?2（环境前提）** �?`when:` 里拿出来，单独一�?`needs:` 字段�?

```yaml
- id: "compare-baseline"
  needs: logs          # �?不再�?when: "has_logs"
```

理由：`has_logs` �?*运行期才判定的环境事�?*（日志在不在这台机器上），不�?这一步要不要�?�?
条件判断。混�?`when:` 里，`--list-stages` 就没法把「为什么它没跑」说清楚。改完后 `--list-stages` 打：

```text
    - compare-baseline      Frozen baseline field-by-field diff   [needs: logs �?本机无日志，�?SKIP]
```

**具体改动**�?

1. **删掉三个空阶�?*（`dev` / `commit` / `deploy` �?`steps: []`）�?
   清单只声明「它能驱动的东西」；全貌归文档。但为了�?`--list-stages` 仍是**一张完整地�?*�?
   加一�?`external:` 段（只用于展示，不参与执行）�?
   ```yaml
   external:
     - id: dev      trigger: "pnpm dev / tsc --noEmit --watch"   why: "常驻进程，没有退出码"
     - id: commit   trigger: ".githooks/pre-commit"              why: "只格式化 staged 文件"
     - id: deploy   trigger: ".github/workflows/deploy.yml"      why: "部署后打线上 E2E"
   ```
2. **`--stage` 省略时不再包�?`build`�?* 现状省略 = 全跑，于�?`python tools/ci/check_all.py`
   会意外跑 144s �?`next build`，�?CI 反而显式写 `--stage build,ci`——两边行为不一致�?
   改法：默认集�?= `push,ci`；`build` 必须显式点名�?
3. **删掉别名，机制归一**：`--pre-push`、`--with-build` 全删（改�?`--stage`）�?
   只留 `--stage` / `--with-e2e` / `--with-mutate` / `--skip-logs`�?
   `--with-e2e` / `--with-mutate` **保留为步骤级开�?*（它�?toggle 阶段内的步骤，与选阶段正交—�?
   这条已经踩过一次，�?CLAUDE.md §6.9.1 �?`guard_meta_self_honest` 的第 6 项）�?
4. **hook 的环境变量保�?*（`WITH_E2E=1` / `FULL_PUSH=1`），但它们的职责只有一条：
   翻译�?`--stage` / `--with-*`，并�?hook 头部写清这个翻译表。现状已经是这样，不需要改�?
   只需�?*不再新增第四种表达方�?*�?

### 3.D 顺手修一个真 bug（零风险，建议第一批就做）

`.github/workflows/ci.yml` �?job `guard-self-proof`�?

```yaml
run: python tools/ci/check_all.py --with-mutate     # �?没有 --stage
```

`check_all.py` �?`selected = args.stage or [所有阶段]`，所以这�?job **会额外全跑一�?
`push`�?4 项，�?ruff/tsc/prettier/eslint/pip-audit�? `ci` + `build`（`next build` 144s�?*�?
而它的目的只是跑 43 条变异�?

修法：改�?`python tools/ci/check_all.py --stage ci --with-mutate`（`mutate-guards` 那一步就住在 ci 阶段里）�?

> 顺带说明：这�?bug **没有任何输出**——命令正常、退出码正常、日志正常，只是云上白白多跑几分钟�?
> 和本项目已经踩过五次的形状一致，所以建议在整改里一并钉住：
> **新增一�?`guard_meta_self_honest` 检查：CI workflow 里每次调 `check_all.py` 都必须带 `--stage`�?*

### 3.E 文档：三处收敛成两处，各自单一职责

| 文档 | 整改后的职责 | 动作 |
| --- | --- | --- |
| **`docs/dev/check-taxonomy.md`（新增）** | **唯一的定义处**：三个角色词 + 目录归属规则 + 两轴模型 | 新建。本次整改的核心文档 |
| `docs/dev/testing-at-a-glance.md` | **唯一的新人速查�?*：阶�?�?检�?�?谁跑 �?耗时，一张表 | 更新：用新词、用实测数字�?2/16/11�?|
| `CLAUDE.md` §6.9 | **只留三条**：门禁在哪一个入口、`CI 全绿 �?回归过了`、三条命�?| **瘦身**：删掉已过时的五关流水线图与 40/29 用例�?|
| `docs/dev/checks-by-stage.md` | **只留论证**：为什么这样分档、实测档�?| 清理「已�?/ 已实�?/ 待你决定」的谈判痕迹（那些决定已经落地了�?|

> 按现有约定「改检查体系时两处都要同步」，整改后改成：**taxonomy 定义一�?+ 速查页一�?*�?
> `CLAUDE.md` 只指路不复制，`checks-by-stage.md` 只回�?为什�?�?

---

## 4. 落地顺序�? 批，每批可独立验证）

| 批次 | 内容 | 验证方式 | 风险 |
| --- | --- | --- | --- |
| **0** | �?CI job2（加 `--stage ci`�? 加一�?guard_meta_self_honest 检查「CI �?`check_all.py` 必带 `--stage`�?| 本地�?`guard_meta_self_honest`；看 CI 时长下降 | �?|
| **1** | 只写文档：新�?`check-taxonomy.md`，更�?`testing-at-a-glance.md` 的用词与数字 | 人读 | 无（不动代码�?|
| **2** | 阶段清理：删空阶�?+ �?`external:` + `needs:` 字段 + 删别�?+ 改默认集�?| `check_all.py --list-stages` 全项可读；本�?`--stage push` 跑通；CI �?| 中（`--stage` 语义变了�? 处调用点要同步） |
| **3** | 搬家 + 改名�?.A + 3.B 全部�?| **每搬一�?*：对应守卫单�?�?`mutate_guards`（证明它还会红）�?`guard_meta_self_honest`（证明扫描范围没塌） | **�?*（见�?5 节） |
| **4** | 文档收敛：CLAUDE.md §6.9 瘦身、`checks-by-stage.md` 清痕�?| 人读 | �?|

**批次 3 建议再切�?5 小步**，每小步独立提交、独立验证：

- 3.1 `tools/calibrate/check-pyodide-px4log-engine.py` �?`tools/guards/guard_artifact_globals_exist.py`（最高收益：解决目录撒谎�?
- 3.2 `tools/ci/check_*.py` �?`tools/guards/`，改�?`guard_engine_pyodide_safe.py` /
  `guard_repo_no_secrets.py` / `guard_meta_self_honest.py`。`py_code_only` �?sibling import
  改指向新名即可（下划线可 import�?*不需�?`_shared.py`**�?
- 3.3 `tools/calibrate/` 的四个检�?�?`tools/tests/`；`run_checks_locally.py` 拆成
  `probe_ulog_findings.py` + `check_ulog_data_shape.py`；建 `conftest.py` 并改 `pyproject.toml` �?`testpaths`
- 3.4 `engine/tests/*` �?`tools/tests/`�?*�?3.3 同一个提交做**，否�?`testpaths` 要改两次）；
  `test_operators.py` �?`test_engine_operators.py`、`test_rule_engine.py` �?`test_engine_cel_sandbox.py`�?
  `python_files` **不用�?*（默�?`test_*.py` 就收得到），改完当场断言「收集数非零�?
- 3.5 `web/scripts/` �?`web/guards/`（三个守卫）+ `web/scripts/one-off/`�?
  `test-issue-filer.mjs` �?`guard-web-invariants.mjs`，这一步改动面最大，建议单独提交

---

## 5. 必须同步改的点（搬家的死�?· 核对清单�?

搬文件最危险的后果不是报错，�?*守卫静默失效**——扫描范围塌了一块，而它自己不会说�?
下面每一条都是「搬�?A 不动 B 就会静默失效」的点：

| # | 位置 | 写死了什�?| 搬家后必�?|
| --- | --- | --- | --- |
| 1 | `tools/ci/check_hygiene.py` `_gate_files()` | glob 只覆�?`tools/**/*.py` + **`web/scripts/**/*.mjs`** | `guard-web-invariants.mjs` 搬进 `web/guards/` �?*会脱离扫描范�?*——「打�?FAIL 就要非零退出」那一条将不再覆盖全仓库最大的守卫集。glob 必须�?`web/guards/**/*.mjs` |
| 2 | `tools/ci/mutate_guards.py` 注册�?| 43 条变异的 `path` 字段硬编�?`tools/calibrate/check-pyodide-px4log-engine.py`、`web/scripts/test-issue-filer.mjs` �?| 全部 path 要跟着改；`GUARDS` �?4 个守卫的 argv 也要改�?*改完必须跑一次完�?`mutate_guards`（约 20 分钟�?* |
| 3 | `tools/ci/check_engine_purity.py` | `sys.path.insert(0, parent)` + `from check_hygiene import py_code_only`（sibling import�?| 改名后是 `from guard_meta_self_honest import py_code_only`—�?*下划线可以直�?import，照旧可�?*。这正是 Python 侧坚持下划线的原因：换成连字符就是语法错误（实测�?|
| 4 | **`pyproject.toml`** `[tool.pytest.ini_options]` `python_files` | `["test_*.py"]` | **不需要改**。`test_engine_operators.py` / `test_engine_cel_sandbox.py` 本来就在默认规则里。因为选了「类型词放开�?+ Python 下划线」，实测里那个「连字符导致目录级静默漏收」的�?*整体绕开�?* |
| 5 | `tools/ci/check_hygiene.py` `check_freshness_gate_alive()` | 硬编�?`WEB / "scripts" / "build-knowledge.mjs"` | 生成器不�?�?不受影响（记录在案即可） |
| 6 | `tools/ci/check_hygiene.py` `PROBES` | 探针 argv 硬编�?`tools/calibrate/run_checks_locally.py` | 3.3 拆分后要改成 `tools/tests/check_ulog_data_shape.py` |
| 7 | `tools/ci/checklist.yml` | 每个 step �?`command` 写死脚本相对路径 | 全部同步；`build-knowledge.mjs --check` 那一步的**字样�?guard_meta_self_honest �?*，不能改 |
| 8 | `web/package.json` | `check:skills` / `check:mcp` 指向 `scripts/check-*.mjs` | 改成 `guards/guard-*.mjs`（npm script �?`check:*` 不动，它是命名空间不是类型词�?|
| 9 | **`pyproject.toml`** `[tool.pytest.ini_options]` `testpaths` | `["engine/tests"]` | 3.3/3.4 搬完必须改成 `["tools/tests"]`，否�?pytest **收集�?0 个用�?*（静默失效的又一种形状）。搬完当场断言「收集数非零�?|
| 10 | `docs/` 三份 + `CLAUDE.md` §6.9 + `.github/workflows/*.yml` | 大量路径与用例数引用 | 批次 4 统一收口 |

> �?9 条是新增的死穴：`pytest` �?`testpaths` 指向不存在的目录�?*不会报错**�?
> 会打�?`no tests ran` 然后退出码 0。同类的排查请顺手核一遍：**任何"按路径收�?的检查，
> 搬完都要断言"收集到的数量非零"**——这一条建议也做成 `guard_meta_self_honest` 的一项�?

---

## 6. 风险与待确认

| �?| 说明 | 建议 |
| --- | --- | --- |
| **批次 3 的验证成�?* | 43 条变异完整跑一次约 20 分钟；拆�?5 小步就要�?5 次（或最后集中跑一次） | 建议每小步只�?*受影响的那几�?*（`mutate_guards --only <名字>`），最后整跑一�?|
| **`engine/tests/` 搬走是这一版新加的改动�?* | 会牵�?`pyproject.toml` �?`testpaths`，`engine/README.md` 也要同步 | 若想把改动面压到最小，�?*先不�?3.4**：`engine/tests/` 原样保留，`tools/tests/` 只收日志侧四个。代价是"引擎单测"�?日志回归"仍分居两地，三段式的并列可读性打折�?*待你�?* |
| **`tools/tests/check_ulog_data_shape.py` 是一次拆�?* | `run_checks_locally.py` 现在一身两职（探查 + `--probe-data` 测试），拆完要保�?`guard_meta_self_honest` 的探针指向新文件 | 先只搬不改逻辑，跑通再�?|
| **`web/guards/` 会不会被打进部署�?* | EdgeOne �?`web/` 源码目录构建，未�?import �?`.mjs` 不会被打包，�?*可能仍被上传**。现状它们也�?`web/scripts/` 下，风险**没有新增** | 待确认：若在意，可移到仓库根 `tools/web-guards/`（但那样就跨了部署边界，读取 `web/` 源码要靠相对路径—�?*不建�?*�?|
| **~~连字�?`.py` 的两个连带改动~~**（已消解�?| 定稿选了「类型词放开�?+ Python 下划线」，实测里那两个坑（pytest 目录级静默漏收、`from xxx import` 语法错误�?*都不再存�?*——`python_files` 不用动，`_shared.py` 也不用抽 | 留下的纪律：**Python 文件名一律下划线，JS 一律连字符**。这条建议也做成 `guard_meta_self_honest` 的一项（�?`tools/**/*.py`，出现连字符�?FAIL�?|
| **`test-issue-filer` 的改名要连带改的东西** | 段[10]/[12]/[16] 里有些断言**已经在核"归一函数还被导出"这类自身代码**，改文件名不影响；但 `mutate_guards` 注册表里 27 条打它的变异要改 `path` | 这一步单独提交，改完必须跑完�?`mutate_guards` |
| **`one-off/` 还是 `_once/`** | 一次性脚本的目录�?| 倾向 `one-off/`（望文生义；`_` 前缀在本仓库已有"内部"含义，如 `_verify-schema.mjs`�?|
| **`tools/browser/check-*.mjs` 改不�?* | 两段式，且不进任何门�?| �?3.A 末段�?*待你�?* |
| **`build` 阶段的默认语义变�?* | 现状省略 `--stage` 会跑 build；改后不跑。有人（含脚本）可能依赖现状 | 改的时候在 `check_all.py` �?docstring 与输出头�?*明说**"build 需显式点名" |
| **文档漂移会不会重�?* | 三份文档已经漂移过（40 vs 42 用例�?| 建议加一�?`guard_meta_self_honest` 检查：**文档里出现的 E2E 用例�?/ 变异条数，必须与 `--list` 实测对得�?*。放在批�?4 |

---

## 7. 明确不做的事

- **不动 `has_logs` 这组检�?只在本地�?的决�?*——原始日志含 GPS 轨迹不入库，这是隐私硬约束，
  不是组织问题。整改只让它**�?`--list-stages` 里说得更清楚**（`[needs: logs]`），不改变它跑不跑�?
- **不动 `web/package.json` �?`test:e2e*`**——那儿的 `test:` �?npm script 命名空间�?
  不是本规则的第一段；Playwright 社区惯例�?
- **不动 `web/functions/*-probe.js`**——边缘路由，运行时由目录表达（�?.4 �?4 条）�?
- **不给编排层套三段�?*（`check_all.py` / `checklist.yml` / `mutate_guards.py`）——见 3.A 的豁免表�?
- **不搬 `engine/` 的产品代�?*——只在需要时搬它�?`tests/`（见 3.B 的两个理由）�?
  整改只解�?叫什么、放哪、什么时候跑"，不解决"用什么跑"�?

---

## 8. 附：命名速查（改完贴�?`check-taxonomy.md` 顶部�?

```text
<什么类�?-<什么模�?-<干什�?       Python �?_ ，JS / TS �?-

类型（放开头：pytest 只按开头收，且 ls 时同类型自动聚簇�?
       guard   扫源�?产物，断言不变量还成立   静态，不执行被测对�?
       check   跑一遍，断言输出对不�?        动态，有输入有期望
       test    �?pytest 收集的用例集
       probe   人手动探查，无门�?
       dump    把当前结论写盘成文件，无门禁

       setup 不是类型词，是目录名（tools/setup/）：仓库里没�?执行安装"的脚本，
             只有一�?工具链装没装"的检查，它是 check_*�?

模块（用本仓库内部名词，但必须能对上号）
       ulog       PX4 .ulg 日志（不�?log —�?太泛，看不出是哪�?log�?
       rule       规则文件 knowledge/px4/rules/（单数，与目录名对齐�?
       engine     Python 引擎源码 engine/
       artifact   编译产物 web/workers/*.ts
       meta       校验机制自身
       repo       整个仓库的提交内�?
       toolchain  Python / node / ruff / tsc 在不�?
       web        前端源码（组�?Worker/边缘函数�?
       skill / mcp   knowledge 下的两个内容目录

干什么（判据：念给没读过文档的人，他能说�?这一步在做什�?�?
       verdict_unchanged  跑一遍，看结论有没有�?
       adapter_contract   每种格式的适配器合不合约定
       data_shape         数据层吐给前端的结构对不�?
       field_exists       规则引用的字段名存不存在
       globals_exist      产物里的名字真的被定义过没有
       pyodide_safe       源码�?Pyodide 里跑不跑得动
       no_secrets         有没有提交密�?
       self_honest        校验机制自己有没有说�?
       invariants         源码里的一族不变量还成不成�?
       dir_spec           目录合不合规�?
       why_matched        这条规则为什么命�?/ 没命�?
       findings / stats / fields  探查输出

       不合格（术语堆叠，看不出动作）：
       baseline / contract / schema / purity / leak / self / spec / invariant
       它们描述"属于哪个方法论类�?，类别该由类型词承担，动作段只写动作�?

改名实例
       compare_baseline.py      �?check_ulog_verdict_unchanged.py
       guard-px4log-provider.py        �?check_ulog_adapter_contract.py
       lint_rules.py            �?check_rule_field_exists.py
       check-pyodide-px4log-engine.py        �?guard_artifact_globals_exist.py
       check_engine_purity.py   �?guard_engine_pyodide_safe.py
       check_secrets.py         �?guard_repo_no_secrets.py
       check_hygiene.py         �?guard_meta_self_honest.py
       test_operators.py        �?test_engine_operators.py
       test-issue-filer.mjs     �?guard-web-invariants.mjs
       probe_stats.py           �?probe_ulog_stats.py

豁免（不是检查，�?作用于检�?的东西）
       tools/ci/check_all.py     跑手
       tools/ci/checklist.yml    清单
       tools/ci/mutate_guards.py 自证�?
       tools/_logging.py         共用�?
       web/scripts/*.mjs         构建脚本
       web/e2e/*.spec.ts         Playwright 只认 testMatch，类型由目录表达

为什�?Python 用下划线（实测，不是推测�?
       连字�?.py 不能 import        from check-x import y 是语法错�?
       连字�?.py 目录级静默漏�?    pytest 默认只认 test_*.py，混合命名时
                                     连字符那批一个都不收，且没有任何警告
       �?�?类型词放开�?+ Python 下划�?，两个坑一起绕开，零连带改动
```
