# 校验体系整改：命名与分阶段

> 状态：**诊断已落地，改名方案未执行**。
> 已落地的部分：`checklist.yml` 按阶段重构、空阶段清理、`--stage` 语义统一、文档收敛。
> **3.A/3.B 的目录搬家与改名未执行**——当前实际布局见 `tools/README.md`，按被测模块分目录
> （`engine/` / `common/` / `dev/` / `ci/` / `setup/`），不按测试还是检查分。
> 本文保留诊断结论与命名约定，供将来真要改名时参考；**第 1 节的路径已过期，别照着找文件**。

## 0. 诊断

`test` 与 `check` 不对应任何真实区别，因为**三条正交的轴被压扁成了一个前缀**：

| 轴                 | 取值                                                 | 有没有被命名                 |
| ------------------ | ---------------------------------------------------- | ---------------------------- |
| A 怎么判定         | 执行代码断言输出 / 扫源码找模式 / 输出给人看         | 没有，全靠 `test` `check` 猜 |
| B 作用域           | 单元 / 契约 / 端到端 / 内容规范 / 元（校验机制自身） | 没有，只能从目录猜           |
| C 谁跑、什么时候跑 | commit / push / 云端 / 部署后 / 手动                 | 有，但被 4 套机制重复表达    |

四处症状：名叫 `test` 的其实是守卫集（`test-issue-filer.mjs` 21 节 131 条静态断言）；
名叫 `check` 的其实是契约测试；目录名与实际要求不符；阶段划分与执行时机脱钩
（`checklist.yml` 曾声明 6 个阶段其中 3 个是空占位，执行时机由 YAML 的 `stage`/`when`、
CLI 的 `--stage`/`--with-*`、hook 的 `WITH_E2E`/`FULL_PUSH`、CI workflow 四处各说一遍）。

**整改思路**：按「怎么判定」分目录（轴 A），按「谁跑」分阶段（轴 C），两轴各自单一事实源；
轴 B 不进目录结构，写进 `--list-stages` 的展示里。

## 1. 命名约定

`<什么类型>-<什么模块>-<干什么>`，类型词放开头（pytest 只按开头收，`ls` 时同类型自动聚簇）。

类型词五个：`guard`（守契约，对一组同类对象套用同一套断言）/ `check`（跑单个对象）/
`test`（pytest 收集的用例集）/ `probe`（人手动探查，无门禁）/ `dump`（把结论写盘，无门禁）。
`setup` 不是类型词，是目录名。

分隔符按**调用方式**分，不按语言分：命令行直接跑的用 `-`，需要被 `import` 的用 `_`。
理由是连字符 `.py` 不能 import（`from check-x import y` 是语法错误）。

模块词用仓库内部名词：`px4log`（PX4 `.ulg` 链路）/ `rule` / `engine` / `artifact` / `meta` /
`repo` / `toolchain` / `web` / `skill` / `mcp`。

干什么（判据：念给没读过文档的人，他能说出这一步在做什么）：`verdict-unchanged` /
`adapter-contract` / `data-shape` / `field-exists` / `pyodide-safe` / `no-secrets` /
`self-honest` / `invariants` / `dir-spec` / `why-matched`。
不合格的写法是术语堆叠、看不出动作：`baseline` / `contract` / `schema` / `purity` / `leak` / `self` / `spec` / `invariant`。

被检对象是产物时允许第四段直接写产物全名。

豁免（不是检查，是作用于检查的东西）：`check_all.py` 跑手、`checklist.yml` 清单、
`mutate_guards.py` 自证机、`tools/_logging.py` 共用库、`web/scripts/*.mjs` 构建脚本、
`web/e2e/*.spec.ts`（Playwright 只认 testMatch，类型由目录表达）。

### 1.1 若改名，候选映射

```text
compare_baseline.py    → check-px4log-verdict-unchanged.py
lint_rules.py          → guard-rule-field-exists.py
check_engine_purity.py → guard-engine-pyodide-safe.py
check_secrets.py       → guard-repo-no-secrets.py
check_hygiene.py       → guard-meta-self-honest.py
test-issue-filer.mjs   → guard-web-invariants.mjs
```

## 2. 落地顺序（若执行）

| 批次  | 内容                                                                             | 风险                                   |
| ----- | -------------------------------------------------------------------------------- | -------------------------------------- |
| **0** | 修 CI job2（加 `--stage ci`）+ 加一条检查「CI 调 `check_all.py` 必带 `--stage`」 | 无                                     |
| **1** | 只写文档                                                                         | 无                                     |
| **2** | 阶段清理：删空阶段 + 加 `external:` / `needs:` 字段 + 删别名 + 改默认集合        | 中（`--stage` 语义变了，调用点要同步） |
| **3** | 搬家 + 改名                                                                      | **高**（见 §3）                        |
| **4** | 文档收敛                                                                         | 无                                     |

批次 3 必须切成小步，每小步独立提交、独立验证（每搬一个：守卫单跑 → `mutate_guards` 证明它还会红 → 卫生检查证明扫描范围没塌）。

一个具体的拦路点：`check_engine_pyodide.py` 现在 `from check_hygiene import py_code_only`，
而若改成带连字符的新名就**不能被 import**。必须在同一小步里先把 `py_code_only` 抽到一个
下划线模块（可被 import），再改 import。

## 3. 搬家的死穴

搬文件最危险的后果不是报错，是**守卫静默失效**——扫描范围塌了一块，而它自己不会说。

几条已踩过的：

- **同批要改的路径引用要一次改完**，分批做等于同一批引用改两遍。
- **`testpaths` 只改一次**：把引擎测试与契约测试搬进同一个目录时，必须在**同一个提交**里做完，否则 `pyproject.toml` 的 `testpaths` 要改两次。
- **变异锚点是精确字符串**：`mutate_guards.py` 里写死的路径搬走后不再匹配，`--with-mutate` 会报找不到待变异内容——这是好事（会红），但要认出是路径没同步，不是守卫坏了。
- **改名会牵动全部引用面**，做之前拍板，别中途改主意。
