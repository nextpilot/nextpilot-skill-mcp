# knowledge 独立成项目（方案，未执行）

## 0. 需求（这就是全部）

1. **`knowledge/` 是一个独立项目。** 知识本身 + 处理它的工具，都在它里面。
2. **knowledge 自己编译自己**，产出各种产物。
3. **web 和 server 直接引用产物。** web 在 dev 时调 knowledge 的 build、把结果拉过来；
   server 引用它产出的库。

后面所有内容都是为了实现这三条。**不由这三条派生出来的，一律不做。**

---

> 状态：**方案，未执行**。本文件只做规划，不动代码。
> 提出：2026-09-23，用户原话"我将 engine+knowledge 合并成一个文件夹，作为一个独立的项目"。
> **主体已澄清（同日）**：**知识是本体、是项目最大价值；engine 只是工具**，
> 职责是"把知识库编译成各种产物"。`knowledge/` 必须是**一级目录**，`engine/` 移入其内。
> **编译器归属（同日）**：`build:kb` **不是 web 的能力，是 knowledge 提供的**，web 只消费产物。
> 前提模型（同日确定）：**一份源、多种形态** —— 按前后端各自的需求编译成不同形态
> （web 内联字符串 / 后端 wheel / 边缘函数 ESM）。

---

## 1. 现状实测

| 目录         | 体积             | 内容                                                                                                      |
| ------------ | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `knowledge/` | 2.0 MB / 78 文件 | `px4/`（facts · rules · fault-kb · llm · meta · plot）、`skills/`、`mcp/`                                 |
| `engine/`    | 484 KB           | `operators.py` / `rule_engine.py` / `report_data.py` / `providers/{api,px4}.py` + `tests/`（共 6 个 .py） |

引用规模（`git grep -l`）：`knowledge/` 被 **67** 个文件提到、`engine/` 被 **55** 个。
其中**真正会因路径改动而失效**的功能点见 §4。

---

## 2. 目录形态：结论是方案 C

| 方案                                        | 结果结构                         | 谁是一级目录  | 引用改动量                                   |
| ------------------------------------------- | -------------------------------- | ------------- | -------------------------------------------- |
| A `engine/` 保持，knowledge 移入            | `engine/knowledge/`              | engine        | knowledge 全改（含**运行期** `contentRoot`） |
| B 新建目录，两者都移入                      | `xxx/engine/` + `xxx/knowledge/` | 新名          | 两边全改 + 守卫改名                          |
| **C（采纳）`knowledge/` 保持，engine 移入** | `knowledge/engine/`              | **knowledge** | 只改 engine 侧                               |

**为什么 C**（不是口味，是两条硬理由）：

1. **主体关系必须体现在目录上。** 用户明确：知识是主体，engine 是处理它的工具。
   `engine/knowledge/` 读作"引擎项目里带了点数据"，把关系写反了 —— 与
   CLAUDE.md §6.4「名字读出来的关系必须和真实关系一致」冲突。
2. **`knowledge/` 侧一处都不用改**，其中包含 `web/lib/constants.ts:59` 的 `contentRoot`
   这种**运行期读取**的硬骨头（改错的表现是"Skill 0 个、指南 0 篇"，不报错、CI 全绿，见 CLAUDE.md）。
   方案 A 正好要把这块动一遍 —— 把最危险的一处留着不动，这本身就是选 C 的理由。

结果结构：

```text
knowledge/                  ← 独立项目根（一级目录）
├── px4/                    facts · rules · fault-kb · llm · meta · plot
├── skills/  mcp/           web 内容卡片的真源
├── engine/                 ← Python 工具（原 engine/ 整体移入）
│   ├── operators.py  rule_engine.py  report_data.py
│   ├── providers/{api,px4}.py
│   └── tests/
└── pyproject.toml          ← 给包身份（可选，见 CLAUDE.md）
```

---

## 3. 合并前仍需定的一件事：skills/ 与 mcp/ 的归属

它们本来就在 `knowledge/` 下，方案 C **不需要动它们** —— 这是 C 相对 A 的额外好处。
但要认清它们的性质不同于 `px4/`：

| 子目录            | 性质                   | 谁消费                                                                        |
| ----------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `px4/`            | **引擎知识**           | 编译进 Pyodide 产物；将来进后端 wheel                                         |
| `skills/`、`mcp/` | ~~web 内容卡片的真源~~ | **已搬走**（2026-09-24 真源唯一化）：`web/content/{skills,mcp}/`，只有 web 用 |

→ 建议：`px4/` 位置不动；skills/mcp 已经搬进 `web/content/`，
将来把 `px4/` 单独打进 wheel 时不再需要排除它们。

---

## 4. 逐文件改动清单（方案 C：只改 engine 侧）

### 4.1 必改（改错就坏）

| #   | 文件:行                                   | 现在                                                      | 改为                                                                     |
| --- | ----------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | `web/scripts/build-knowledge.mjs`         | `resolve(webRoot, "../engine")`                           | `resolve(webRoot, "../knowledge/engine")`                                |
| 2   | `tools/px4log_engine_runner.py:32`        | `ENGINE = REPO_ROOT / "engine"`                           | `ENGINE = REPO_ROOT / "knowledge" / "engine"`                            |
| 3   | `tools/engine/check_engine_purity.py:61`  | `ENGINE = ROOT / "engine"`                                | `ENGINE = ROOT / "knowledge" / "engine"`                                 |
| 4   | `tools/engine/check_engine_purity.py:135` | `BROWSER_MARKER = (..., 'resolve(webRoot, "../engine")')` | `'resolve(webRoot, "../knowledge/engine")'`                              |
| 5   | `tools/engine/check_engine_purity.py:136` | `LOCAL_MARKER = (..., 'REPO_ROOT / "engine"')`            | `'REPO_ROOT / "knowledge" / "engine"'` ⚠️ 须与 #2 的**实际写法逐字一致** |
| 6   | `tools/ci/mutate_guards.py:330`           | `path="engine/report_data.py"`                            | `"knowledge/engine/report_data.py"`                                      |
| 7   | `tools/ci/mutate_guards.py:334`           | `old='resolve(webRoot, "../engine")'`                     | 同步新路径                                                               |
| 8   | `tools/ci/mutate_guards.py:339`           | `old='ENGINE = REPO_ROOT / "engine"'`                     | 同步新路径                                                               |
| 9   | `pyproject.toml:47-49`                    | `"engine/rule_engine.py" = ["F821"]` 等三条               | 前缀加 `knowledge/`                                                      |
| 10  | `pyproject.toml:58`                       | `testpaths = ["engine/tests"]`                            | `["knowledge/engine/tests"]`                                             |

### 4.2 不改不坏，但会误导（建议一并更新）

- `tools/dev/dump_baseline.py:63` 的 `"engine": "engine/rule_engine.py + engine/report_data.py"`
- `tools/testdata/baseline/*.json` 6 个文件里的同名字段
  （**已核实不参与比对**：`compare_baseline.py` 里没有任何对该字段的引用，只是描述性元数据 ——
  所以新旧 baseline 描述不一致不会让校验变红，只会误导读的人）
- 各 `.generated.*` 产物头部注释里的"源文件在 `engine/` 与 `knowledge/px4/`"
- `docs/**`、`CLAUDE.md`、各 `README.md` 的叙述性路径

### 4.3 不需要改（这是方案 C 的收益）

`web/lib/constants.ts:59` 的 `contentRoot: "knowledge"`、
`web/scripts/sync-content.mjs:25-26`、`_verify-schema.mjs:9`、`check_rules_fields.py:10`、
`.prettierignore`、`.markdownlintignore`、`.vscode/settings.json` —— **全部保持不变**。

> ⚠️ 2026-09-24 后本节过时：skills/mcp 真源搬进 `web/content/` 后，`contentRoot` 已改为
> `"web/content"`，`sync-content.mjs` 已删除。保留原文只为记录当时的决策依据。

### 4.4 顺带做：`rule_engine.py` + `report_data.py` 合并成一个文件（✅ 2026-09-24 已执行）

> **执行结果**：新文件定名 **`knowledge/engine/engine.py`**（1112 行；没选 analysis_engine.py——
> 目录已叫 engine，文件再叫 engine_x 反而绕）。产物同步归一：`pyodide-px4log-data.ts` 已删、
> 导出名 `PY_ULG_CHECKS` → `PY_ULG_ENGINE`（原名在含数据层后已名不副实）、worker 改单串执行。
> 下表与调查记录保留当时的决策依据。

**决定**：用户原话「那放在 engine 和 knowledge 合并的时候一起做」—— 即**本次迁移时一并执行**，
不单独提前做。**为什么必须绑在一起**：§4.1 #6 与 §4.2 的头两条已经要改 `report_data.py` 的路径，
分批做等于同一批引用改两遍。

**为什么这件事本身是安全的**（2026-09-24 调查，只读）：

- 这两份**本来就是同一个命名空间**：`px4log_engine_runner.py` 按文本拼接后**单次 exec**（L103-115）；
  浏览器侧 `pyodide-px4log-worker.ts:259` 是 `runPythonAsync(PY_ULG_CHECKS + PY_ULG_DATA_HELPERS)`，
  全仓只有这一处引用点。→ 合并**不改变任何运行行为**，是纯静态搬运。
- `report_data.py` 直接用 rule_engine 才有的 `provider` / `run_all` / `_rule_env` / `_eval_compute` /
  `_pick_ref` / `_split_ref`；`pyproject.toml` 专为这两份（+`providers/px4.py`）关 F821
  —— 合并后这份豁免可以少一条。**假模块边界是有账单的。**
- 顶层定义**零重名**（rule_engine 23 个 / report_data 10 个，交集为空）→ 合并**不去重**任何代码，
  收益只在"少一个假模块"，别把它当成重构收益。
- `derived-version` 已把两份都算进哈希（`build-knowledge.mjs:1730-1737`），合并后重解析行为不变。

**在 §4.1~4.3 清单之上，本次要额外决定 / 执行的**：

| 项                    | 说明                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **新文件名**          | 合起来 1114 行，叫 `rule_engine.py` 就名不副实（里面有 LTTB / `np_track` / `np_log_info` / 时间口径）。**已定 `engine.py`**（2026-09-24 执行时拍板） |
| **产物也要合**        | 只合源文件不合产物，就成了"一份源拆成两个产物"，比现状更绕 → `pyodide-px4log-data.ts` 退场、`PY_ULG_DATA_HELPERS` 取消、worker 那句字符串拼接去掉    |
| 拼接顺序              | rule_engine 段必须**在前**：`RULES.sort`、`provider = open_log(...)`、`_COMPUTE_GLOBALS["has_topic"] = provider.has_topic` 都是它的顶层语句          |
| `test_rule_engine.py` | 它只把 operators + rule_engine 拼进沙箱做 CEL 单测；合并会顺带 exec 掉 296 行数据层（能跑，但稀释针对性）→ 接受，还是给数据层留门，做时定            |

**引用面（2026-09-24 实测计数，模式 `rule_engine|report_data|PY_ULG_*|pyodide-px4log-data`）**：
`build-knowledge.mjs` 21、`knowledge/px4/CLAUDE.md` 22、`engine/README.md` 14、`CLAUDE.md` 7、
`knowledge/README.md` 4、`pyproject.toml` 4、`check-taxonomy-rework.md` 4、
`testing-at-a-glance.md` 3、`engine/tests/test_rule_engine.py` 3、`providers/px4.py` 5、
`check_engine_pyodide.py` 2（L218 **单独**读 data 产物做跨语言名字核对——最容易漏的一处）、
`check_hygiene.py:85-86`（产物跳过清单）、`dump_baseline.py` + `baseline/*.json` 6 份、
`engine/providers/README.md` 2、`plot-schema.md` 2、`rule-schema.mdx` 2、`useLogAnalyzer.ts` /
`report-history.ts` / `types.ts` / `rule-expr.mjs` / `checks-by-stage.md` 各 1。

---

## 5. 三个「改错不报错 / 报错但别误判」的点

### 5.1 `web/lib/constants.ts:59` 的 `contentRoot` 是运行期读的

方案 C 不动它 —— 这正是选 C 的主要理由。若将来改成方案 A/B，
改错的表现是 **"指南 0 篇、Skill 0 个"**，不抛异常、CI 全绿。
→ **验收必须手工开页面确认 Skill / MCP 列表非空**，不能只看 CI。

### 5.2 `check_engine_purity.py` 会主动变红 —— 好事，别误判成"迁移失败"

它做了两件超出本职的事：

- L91：`MIN_SCANNED = 3` —— 断言 `engine/` 下**至少扫到 3 个 .py**，
  否则报"目录被搬空/改名了？那这条规则就是真空转的"
- L135-136：用**硬编码字符串**断言两个消费者还在（浏览器仍拼进产物、本机工具仍指过去）

→ 移动 `engine/` 后它**必然变红**，且两处 marker 是精确字符串匹配，必须同步改（§4 #4 #5）。
**变红是守卫正常工作的证据。** 迁移时应：先确认它红在"`knowledge/engine` 找不到"，改完后确认**转绿**。

⚠️ **2026-09-24 订正两处已过期的事实**（原文写"至少扫到 6 个 .py"，两处都不对）：
阈值现在是 **3**（`MIN_SCANNED`），而 `engine/` 下现有 **8 个** .py
（`operators` / `rule_engine` / `report_data` / `providers/{api,px4,ardupilot}` /
`tests/{test_operators,test_rule_engine}`），源码里那句"现有 6 个文件"的注释也已过期。
（`test_pyulog.py` 已于 2026-09-24 删除，同时 `providers/ardupilot.py` 并入，总数不变）
→ 于是 **§6 第 2 条原配方失效**：移走一个文件后是 7 个，仍 ≥ 3，守卫**不会红**（详见 §6）。
§4.4 的合并会让它从 8 降到 7，仍然安全。

⚠️ **改 marker 有个反向陷阱**：如果把 marker 改得比实际写法更宽松（比如只匹配 `"engine"`），
守卫会**恒绿** —— 那才是真事故。改完必须按 §6 自证。

### 5.3 `mutate_guards.py` 里的 old 字符串找不到 → `--with-mutate` 直接失败

§4 #7 #8 两处是**变异测试的锚点字符串**。engine 移走后它们不再匹配任何内容，
`--with-mutate` 不会"安静通过"，而是报"找不到待变异内容"。
→ 这其实是好事（会红），但要认出原因是路径没同步，不是守卫坏了。

### 5.4 行尾 / CRLF 会让 `--check` 误报

`.gitattributes:6` 记录了踩过的坑：行尾处理不当会让 **8 个产物全部被误报成"与 knowledge/ 不一致"**，
且只在 Windows 全新 clone 上复现。
→ `git mv` 后务必跑 `pnpm build:kb --check`；若出现"全部产物不一致"，先查行尾再查逻辑。

---

## 6. 守卫自证要求（按 CLAUDE.md §6.6）

迁移完成后必须验证守卫**仍然会红**（不是恒绿）：

1. `python tools/ci/check_all.py --with-mutate` —— 让每条守卫先红一次。
2. 针对 `check_engine_purity.py` 的"扫到文件数"那一路 —— ⚠️ **原配方是错的，2026-09-24 订正**：
   阈值是 `MIN_SCANNED = 3`，而 `engine/` 下现有 8 个 .py
   （`knowledge/engine/` 下同理，§4.4 合并后是 7 个）→ **移走一个不会变红**（7 ≥ 3）。
   要证明这条分支活着，得把 .py 移到**只剩 2 个**，或临时把 `MIN_SCANNED` 改大。
   另注：`mutate_guards.py` 给这个守卫的三条变异覆盖的是**纯 Python 违规**与**两个 marker**，
   **不覆盖**这一条 —— 所以"目录被搬空"目前**没有机器自证**，只有这份手工配方。**断言完还原。**
3. 针对 marker（§5.2）：临时把 `build-knowledge.mjs` 里的路径改回 `../engine`，
   断言守卫报"前提不在了"。**断言完还原。**
   （`mutate_guards.py` 的 `browser-marker` / `local-marker` 两条变异已经覆盖它，这一步是复核。）
4. **必须新增的守卫（本方案引入的漂移风险）**：

   > `web/` 内被拉取的产物，必须与 `knowledge/dist/` 下的对应文件**逐字节一致**。
   > 自证：改 `web/` 里一个产物文件的一个字节，断言守卫变红。**断言完还原。**

   为什么必须：产物**入库**（EdgeOne 云端只 `next build`、不重建 knowledge），
   于是"改了源、忘了重新拉"在 CI 里**没有任何东西会拦** —— 这正是
   CLAUDE.md §6.6 说的"判断本身没有被检查"。web 侧现在只有纯拷贝，它不产生新信息，
   所以一致性必须由外部守卫断言。

5. 可选：`knowledge/` 下不得出现与 `web/content/` 不同步的手改副本
   （现有 24+5 个拷贝产物**入库且未被 ignore**，谁手改副本都会被下次拉取静默覆盖）。

---

## 7. 验收步骤

```bash
# 1. 单元（不需要真实日志）
python -m pytest                       # testpaths 已改指 knowledge/engine/tests

# 2. 引擎纯度守卫（重点：是否仍扫到 ≥6 个 .py，marker 是否转绿）
python tools/engine/check_engine_purity.py

# 3. 知识构建：一致性比对（注意 §5.4 的行尾误报）
cd web && pnpm build:kb && node scripts/build-knowledge.mjs --check

# 4. 类型与 lint
cd web && pnpm typecheck && pnpm lint

# 5. 守卫自证
python tools/ci/check_all.py --with-mutate

# 6. ⚠️ 手工开页面（§5.1）：确认 Skill / MCP 列表非空、日志分析能跑通
# 7. 日志类校验只能在开发机跑（原始日志含 GPS，不入库）
```

---

## 7.5 编译器住错了地方（按"知识库是本体"推出的必然结论）

用户定性：**"知识库是项目最大价值，engine 只是把知识库编译成各种产物的工具。"**

按这句话，真正承担"编译"职责的是 **`web/scripts/build-knowledge.mjs`** ——
它读 `knowledge/px4/`，产出 10 份形态各异的产物（内联 Python 字符串 / JSON / ESM / MDX）。

但它现在住在 **`web/`**（消费方）里，不住在 `knowledge/`（本体）里。
**本体的工具住在消费方家里** —— 与"engine 是 knowledge 的工具"这层关系是反的。

`knowledge/engine/`（Python 引擎）移进本体之后，编译器仍在 `web/` 侧，
于是"知识库项目"自己**编译不了自己**：要产出 wheel 得靠 web 的脚本去写 Python 产物。

→ 建议：编译器一并迁入 `knowledge/`，统一入口形如 `knowledge/scripts/build.mjs`
（或 Python 侧 `knowledge/tools/`）。**这不在本方案范围内，作为下一步单独立项** ——
它牵动的面（web 的 `pnpm build:kb`、CI、产物路径）比移动 `engine/` 更大，
混在一起做会让本次迁移无法回滚。

⚠️ 现状实证：`git ls-files knowledge` 里**没有任何** check / validate / lint / schema / test
项 —— 本体既没有编译器，也没有校验入口。三个相关校验脚本全在别处：
`web/scripts/check-skill-spec.mjs`、`web/scripts/check-mcp-spec.mjs`、`tools/engine/check_rules_fields.py`。

### 7.5.1 编译器搬走时真正的难点：产物现在散落在 web/ 的四个地方

`build-knowledge.mjs` 的产物落点（实测，脚本 L14-19 与 L1502-1783）：

| 产物                                                                           | 现在写到哪                                                |
| ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `pyodide-px4log-engine.ts` / `-data.ts` / `fault-kb.generated.json`            | `web/workers/`                                            |
| `prompts.generated.js` / `plots.generated.ts` / `derived-version.generated.ts` | `web/lib/knowledge/`                                      |
| `rule-catalogue.mdx` / `rule-schema.mdx`                                       | `web/content/guide/`                                      |
| `px4-main.json`（参数字典）                                                    | `web/public/params/`                                      |
| `rules-editor-schema.generated.json`                                           | **`knowledge/px4/`**（产物落在源目录里，脚本 L1821 自认） |

### 7.5.2 定论：knowledge 自产出，web 在 dev 时调用并拉取

**这不是选择题**（用户 2026-09-23 明确，我一度把它当成 P1/P2 待拍板，是错的）：

> "knowledge 的编译和构建就是 knowledge 自己负责。web 只要在 dev 的时候
> 调用 knowledge 的 build，并把结果拉过来就好了。"

→ 编译器**只往 knowledge 自己的产物目录写**，**永不跨项目写 `web/`**。
拉取是消费方的动作，方向自然：

```text
knowledge/
├── px4/  engine/              源 + 工具
├── scripts/build.mjs          编译器（原 web/scripts/build-knowledge.mjs）
├── dist/                      ★ knowledge 自己的产物（源与产物分离）
│   ├── workers/               pyodide-px4log-engine.ts · -data.ts · fault-kb.generated.json
│   ├── lib/                   prompts.generated.js · plots.generated.ts · derived-version.generated.ts
│   ├── guide/                 rule-catalogue.mdx · rule-schema.mdx
│   ├── params/                px4-main.json
│   └── px4/                   rules-editor-schema.generated.json
├── package.json               `build` / `build:check`（pnpm）
└── pyproject.toml             出 wheel（uv）
```

web 侧：

```jsonc
// web/package.json
"dev": "pnpm --filter knowledge build && node scripts/pull-knowledge.mjs && next dev"
```

`pull-knowledge.mjs`（薄拷贝，**不含任何知识逻辑**）把 `knowledge/dist/**`
按一张映射表搬到 web 内对应位置（`workers/` · `lib/knowledge/` · `content/guide/` · `public/params/`）。
映射表是这张同步关系唯一的真源，必须与 `dist/` 布局一样受守卫保护。

**`--check` 守卫跟着搬到 knowledge 侧**：它比对的是"源 → 产物"，
本来就该由产出方负责；web 侧只剩纯拷贝，不需要它。

✅ 顺带解决：`rules-editor-schema.generated.json` 落在源目录里的历史问题
（脚本 L1821 自认）—— 它进 `dist/px4/` 就自然分离了。

⚠️ **唯一要保持的动作**：拉进 `web/` 的产物**仍需入库**。
因为 EdgeOne 云端只跑 `next build`、不跑构建器（脚本 L20 写明），
云端拿不到 knowledge —— 这不是绕过本方案，是本方案在现有部署链路下的必要条件。
（它也正是"改了源忘了重新拉"这个风险点的来源：产物入库 + 云端不重建 = 漂移只能靠
knowledge 侧的 `--check` 在 CI 里拦住。**所以 §6 的守卫自证里要加上这一条。**）

---

## 7.6 monorepo 形态：knowledge 是「双语言包」，这是设计的硬约束

按 §7.5，编译器 `build-knowledge.mjs` 归 knowledge。而它是 **Node 脚本**（`.mjs`，依赖 `yaml`），
但 knowledge 同时要产出 Python wheel（给后端）。

→ **knowledge 不是纯 Python 项目，是"Python 产物 + Node 编译器"的双语言包。**
这与 Langfuse 那种纯 TS monorepo 不同，也意味着它**同时需要两个包管理器认它**：

| 管理器 | knowledge 需要什么                                            | 用途                                                |
| ------ | ------------------------------------------------------------- | --------------------------------------------------- |
| pnpm   | `knowledge/package.json`（name / scripts.build / deps: yaml） | web 用 `pnpm --filter knowledge build` 调它的编译器 |
| uv     | `knowledge/pyproject.toml`（`[project]` + `[build-system]`）  | 产出 wheel 给后端                                   |

`pnpm-workspace.yaml: packages: ["web", "knowledge"]` 与
`pyproject.toml [tool.uv.workspace] members = ["knowledge"]` **可以共存**，不冲突。

⚠️ **部署约束仍然卡着，且不受 monorepo 影响**：EdgeOne 只上传 `web/` →
knowledge 的 Node 编译器**在云端不可用**。所以产物必须**入库**（现状如此，脚本 L20 写明），
且 web 的构建不能依赖 knowledge 在云端被构建。

### 7.6.1 打包边界：默认确实会把 skills/mcp 一起打进 wheel（用户提出的担心，成立）

✅ **已核实（setuptools 官方文档，不是印象）**：

> "Added in version v61.0.0: The default value for `tool.setuptools.include-package-data`
> is **true** when projects are configured via pyproject.toml. This behaviour **differs from
> setup.cfg and setup.py**（where `include_package_data` is `False` by default)."

且 `include_package_data` 的生效条件是"文件被 MANIFEST.in 收录"**或**
"被 git 跟踪 + 配了 setuptools-scm 插件"。

→ 只要 knowledge 用了 `setuptools-scm`（monorepo 里很常见），
**`knowledge/` 下所有 git 跟踪的非 .py 文件都会被当数据文件收进包** ——
也就是 **`px4/`（48 文件）+ `skills/`（24）+ `mcp/`（5）+ `engine/` 全进 wheel**。
用户这个担心是对的。

三条控制手段（**推荐第 1 条**）：

1. **`include-package-data = false` + 显式 `package-data` 白名单**（最精确）

   ```toml
   [tool.setuptools]
   include-package-data = false        # 关掉"git 跟踪即打包"
   [tool.setuptools.package-data]
   nextpilot_knowledge = ["px4/**/*.yaml", "px4/**/*.yml", "px4/**/*.md", "px4/**/*.json"]
   ```

   代价：新增文件类型（如 `.csv`）要记得补白名单 —— 白名单的固有代价。

2. **保留 `include-package-data = true`，用 MANIFEST.in 排除**：~~`prune knowledge/skills`、
   `prune knowledge/mcp`~~（这两条已不需要——skills/mcp 已搬进 `web/content/`，不在 wheel 范围）。
   注意 MANIFEST.in 主要影响 sdist，wheel 侧仍受上面那条默认值影响，
   **必须实测**。
3. **不接 setuptools-scm**：那 `include-package-data` 只认 MANIFEST.in，
   但版本号要手写或走 `[tool.setuptools.dynamic]`。

**更根本的问题：skills/mcp 到底该不该进 wheel？** 按"消费方需要什么就产什么"：

- 只有 web 需要卡片 → 不该进（用白名单排除）
- 将来 server 要供 Skill Hub 的 API → 该进，或拆成**第二个分发包** `nextpilot-content`

→ 这条取决于后端需求清单，**现在不能替你定**。

---

## 8. 待确认（拍板后才能动手）

1. **目录名就是 `knowledge/`**（用户已明确）。是否同时给它一个更完整的项目标识
   （如 README 顶部写明"本项目产出 wheel 供后端消费"）—— 不影响路径，随时可加。
2. **Python 包名 / wheel 名**：建议 `nextpilot_knowledge`，其中 `engine/` 作为子模块
   `nextpilot_knowledge.engine`，`px4/` 数据靠 package-data 打进包。
   ⚠️ 打包细节（setuptools `package-dir` 映射、`find` 会不会误收 `skills/` `mcp/`）
   **未实测**，实施前要先验一次。
   ~ 备选：包名仍叫 `nextpilot_engine`（突出工具），但与"知识是主体"不符，不推荐。
3. **要不要现在就加 `knowledge/pyproject.toml`**。
   ⚠️ 若加，**只放 `[project]` + `[build-system]`，绝不放 `[tool.ruff]`** ——
   Ruff 官方文档：忽略没有 `[tool.ruff]` 段的 `pyproject.toml`；
   一旦加了，子配置**完全替换**（不是合并）根配置，
   表现为"`knowledge/engine/` 的 lint 规则突然不报错了"，不报错、CI 全绿。
4. **边缘情况**：`knowledge/px4/rules-editor-schema.generated.json` 是产物却落在源目录里
   （`build-knowledge.mjs` L1821 自认此问题）。合并时是顺势挪出，还是维持原样？
5. **monorepo 建到什么程度**：只建 uv workspace（Python 侧）？还是 pnpm + uv 双 workspace
   都建（knowledge 要被 web 用 `pnpm --filter` 调编译器就必须有 pnpm 侧）？见 §7.6。
   ⚠️ Node 侧的旧结论仍然成立：**web 不要依赖 workspace 兄弟包**（部署只上传 `web/`，
   依赖了云端就装不上）；knowledge 进 pnpm workspace 是为了**能被调用**，不是为了被 import。
6. **wheel 里装不装 skills/ mcp/**：只有 web 要卡片就排除，将来 server 供 Skill Hub API
   就装（或拆第二个包 `nextpilot-content`）。取决于后端需求清单。见 §7.6.1。
7. **`pull-knowledge.mjs` 的映射表**放哪、由谁守（见 §7.5.2）。
   建议 `knowledge/dist-map.json` 作为单一事实源，两侧脚本都读它。
8. **§4.4 合并后的新文件名**：~~倾向 `analysis_engine.py`~~ **已定 `engine.py`**（2026-09-24 执行）。
   最终没选 `analysis_engine.py` / `log_engine.py`：目录已叫 `engine/`，与目录同名最直白
   （拼接顺序里它就是最后一块"引擎本体"）。
   ⚠️ 改名会牵动 §4.4 列出的全部引用面，**做之前拍板，别中途改主意**。

---

## 9. 与既有决策的关系

- 2026-09-23 上午曾决定「**维持现状、不动目录**」（见 `directory-layout-migration.md`，已搁置）。
  本次是**局部反转**，范围仅限 `engine/` 移入 `knowledge/`，
  `web/`、`tools/`、`docs/`、`knowledge/` 内部结构不动。
- monorepo 相关结论（Python 侧可加包身份、Node 侧暂不建 pnpm workspace）见
  `.workbuddy/memory/MEMORY.md`，与本方案不冲突：本方案是**物理合并**，
  加 `pyproject.toml` 是**赋予包身份**，可一起做也可分两步。
- 本次**不动** Node 侧：部署上传范围仍只有 `web/`，且 web 产物是内联字符串、
  不依赖兄弟包，加 pnpm workspace 零收益。
- 2026-09-24 新增的**并入项**：`rule_engine.py` + `report_data.py` 合并（§4.4）——**已单独提前执行**
  （迁移尚未开始，合并先行落地；执行时顺带做了产物归一与导出改名，见 §4.4 顶部注记）。
