# 检查规则改为「一条经验一个配置文件」：一条经验的完整画像

> **这是给 AI（Claude Code）读的项目上下文**：改 `rules/*.yaml`、`engine/` 下的算子与框架、
> 或构建脚本前，先按这里的约定来——它记着每条设计决策的动机、
> 与最初设计的落地差异（避免把有意为之当成 bug 改回去）、以及已知缺口。
> 面向人的入口见 `../README.md`（怎么读）与站内 [规则编写参考](/guide/rule-schema)（怎么写经验）。
> 本文件不发布到网站：里面有实施状态、已知缺口与提交记录。

## 实施状态（2026-09-15：已实施）

**已完成**：15 组过程式检查（原 `engine/ulog_checks.py` 1095 行，已迁移为 `engine/rule_engine.py`）→ **32 条自包含经验**（含 4 条数据质量
guard），**73 个通用算子**；`px4-thresholds.toml` 已退场（阈值随各自经验内联）。引擎侧每个
检查块只剩一行 `_run_rules("<slot>")`。6 条真实日志的冻结基线逐字段一致；生成产物真实执行
通过；构建期护栏生效（算子名/入参数量、表达式与文案里的未声明名字、缺 `firmware`/`airframe`、
guard 条件写错名字都会构建失败，而不是进浏览器才炸）。

**2026-09-16 追加**：报告页数据层（`engine/report_data.py`）的若干硬规则——时间基准改为
**开机时间**、PX4 事件解码与文本消息合并、多值信息的两种拼接形态、参数默认值的推导与
参数元数据的来源、**派生数据版本**让旧存档自动重解析。都在本文档下面的
「报告页数据层」一节，改数据层前必读。

**2026-09-17 追加（第二段）：引擎与日志格式分家 —— provider 适配器**
（**架构层面的改动，改 `engine/` 前先读这一节**）：

原先取数分散在四个地方（`facts.yaml` 的 `bindings`/`track`、`rule_engine.py` 里硬编码的
固件解码与载具身份、`rules/*.yaml` 里裸写的字段、`plot/*.yml` 里裸写的字段）。
现在的分工是"**机制 / 数据 / 格式**"三分：

| 放哪 | 是什么 | 判据 |
| --- | --- | --- |
| `engine/providers/<格式>.py` | **唯一认识某一种日志的地方**：topic 名、字段名、固件版本怎么解码、取不到怎么回退、载具身份从哪来 | 有分支 / 回退 / 按版本挑 → 代码 |
| `engine/{rule_engine,operators,report_data}.py` | 与格式无关的机制：调度、表达式求值、算子、报告数据层 | 里面 grep 不到 `vehicle_` / `ver_sw` / `cpuload` |
| `knowledge/px4/facts.yaml` | 那一种格式的**纯数据**：码表、文案、展示口径、规则元数据、执行顺序 | 纯映射 → YAML（改它不该碰 Python） |

- 契约本体是 `engine/providers/api.py` 的三张常量表（REQUIRED / OPTIONAL / SEMANTICS）。
  它同时是**构建期**（`build-knowledge.mjs` 派生 `BUILTIN_VARS`、查每个适配器有没有漏实现）、
  **运行期**（`check_provider()` 自检类型与缺席）、**测试**（`tools/calibrate/guard-px4log-provider.py`）
  三处的输入 —— 一处定义、三处使用。**不写 `typing.Protocol`**：两端都没有类型检查器
  （构建期不执行 Python、Pyodide 里没有 mypy），写了只是"看着有约束、实际没人管"。
- 内置变量从 23 个收敛到 **11 个 + `has_topic()`**（实测 10 个零引用：
  `firmware` `fw_major` `fw_profile` `is_rotary_wing` `is_vtol` `is_rover` `phases` `tags`
  `guard_tags` `topics`）。其中 `topics` 删掉之后，"同一个事实两种写法"（`'x' in topics`
  vs `has_topic('x')`）只剩一种。
- 指南页的内置变量表改从 `providers/api.py` 的 SEMANTICS 生成（由 `build-knowledge.mjs` 统一派生），
  构建期的 `BUILTIN_VARS` 也改成从它派生——
  这份名字以前手抄两份，漂移时的表现是"构建期放行、运行期 NameError → 那条规则静默不出结论"
  （`no_data` 当初就是这么漏的）。
- **`meta/` 的角色**：上游字段与参数字典（一固件 tag 一份，生成物）。它回答"**某个版本里**
  有没有这个字段/参数、什么类型、什么单位、码值什么意思"，所以它既不是 facts 也不是规则：
  **单位与类型一律查它，不要在别处抄**。它的键是上游 `.msg` 名，与日志 topic 名不一一对应，
  所以新增了 `meta/topic-map.yaml`（日志 topic → 字典键，构建期专用、不进产物）。
- 本轮**明确不做**（都留着后续）：用 meta 做构建期字段校验（rules 与 plot 的每个
  `topic.field`）、`meta` 与 `facts.yaml` 码表的一致性对账、内置变量全大写、ArduPilot 适配器。
  （**2026-09-18 起 plot 的单位已改由 meta 派生**，见下面第五段——这条从"不做"里划掉。）

验证口径同前：`compare_baseline.py` 6 条日志**逐字段零差异**（这次是纯搬家，
出现任何差异都说明搬错了），外加新增的 `guard-px4log-provider.py`（契约测试）。

**2026-09-17 追加（第三段）：provider 初始化按「数据来源」分组 + 解析器版本改由 provider 给**

- **`Px4Provider.__init__` 按 pyulog 的「数据来源」分组读 + 一处汇总**：
  `_read_msg_info_dict()`（`ulog.msg_info_dict`：版本、载具身份）→ `_read_initial_parameters()`
  （`ulog.initial_parameters`：累计飞行、机架编号）→ `_read_data_list()`
  （`ulog.data_list` + `ulog.dropouts`：先读**基准 topic** `vehicle_status` 得到机型 / 模式 /
  armed 区间 / 阶段，再**全量扫描**得到时长、轨迹起点、重启、丢包）→
  `_read_logged_messages()`（`ulog.logged_messages`：日志消息，含警告 / 错误级别）。
  四段**只往 `self` 上放结果**；最后由 `_collect_facts()` 一处建出 facts dict。
  原先这些全挤在 165 行的 `_build()` 里，而且各段各写各的 `facts["..."]`，等于把"报告头
  有哪些字段"拆散在四处。现在**键名只在 `_collect_facts` 出现**，条件键（这份日志没有
  就不给）由属性为 `None` / `""` 表示——读日志与"报告头叫什么名字"分开。
  两个附带结论：
  - **只有一处顺序约束**：`_read_logged_messages()` 必须最后跑——tSec 是**相对日志起点**的秒数，
    要用 `_read_data_list()` 算出的 `t0_us`。除此之外各段互不依赖。
    先前以为"版本必须最先读、后面每步都按版本挑分支"——在 provider 内部**不成立**：
    `self.fw` / `fw_minor` 只被 `match_version()`、`builtin_variables()`、`_collect_facts()` 用到，
    没有一处 `data_list` 的读取按版本分支（版本分支在**规则层**的 `when_fw`，经
    `match_version()` 求值）。
  - `logged_messages` 改在构造期算一次并缓存。**不是**"也许用得上所以先存"：`builtin_variables()`
    里就有 `messages`，而 `_rule_env()` 在 `for _rule in RULES:` 循环体内
    （`rule_engine.py:305/314`），即**每条规则各调一次 `builtin_variables()`**——不缓存就是每条
    规则把同一份列表重建一遍。契约方法 `get_logged_messages()` 现在返回逐条复制的副本。
- **`vehicle_status` 只读一次**，需要切段的东西在 `_read_data_list()` 里用同一批数组
  一次算完：armed 区间（`self.armed_intervals`）、出现过的阶段集合（`self.phases_present`，
  喂故障库）、连续阶段区间（`self.phase_intervals`，报告页阶段条）。
  原先这两件事分在两处（`_build` 里取一次、`get_flight_phases()` 自己再取一次），而且 `get_flight_phases()`
  为此要把整份 dataset 留到运行期再切一次——**留的是结果，不留 dataset**。
  顺带把"只取第一个"的写法都换成按 `instance` 取（`_find_topic`）：原先 `_find_topic_all(...)[0]`
  与 `_find_topic(topic, 0)` 混着用，前者是"列表第 0 个"、后者才是"某个实例"。
  两者在 PX4 的单实例 `vehicle_status` 上等价，已用数据层前后对照验证
  （`np_manifest` / `np_track` / `np_log_info` 逐字节一致——**基线盖不到数据层**，
  它只比 result JSON，所以动 `get_flight_phases()` 必须另做这个对照）。
- **新增契约能力 `parser_version()`**（REQUIRED）：`rule_engine.py` 原先把
  `"parserVersion": "pyulog/pyodide-0.3.0"` 写死——一个与实际装的解析器无关的假版本串，
  而且把 `pyulog` 这个名字钉进了**格式无关层**（正是上面「机制 / 数据 / 格式」三分要避免的）。
  现在由 provider 给真值（`pyulog.__version__`）。构建期查漏实现、运行期 `check_provider()`
  查类型、`guard-px4log-provider.py` 契约测试查非空，三道都跟着 REQUIRED 表自动生效
  （`build-knowledge.mjs` 的 `parseProviderApi` 从表里派生，**不用改构建脚本**）。
- 浏览器里解析器版本**不受本站控制**：worker 用 `micropip.install("pyulog")` 装的是
  PyPI 当时的最新版（除非配了 `NEXT_PUBLIC_PYULOG_WHEEL` 自托管）。所以报告里记的这个值
  是"当时确实用了哪个版本"，本地校准工具与浏览器可能不同——这是如实记录，不是 bug。
  值得单独决定的是要不要把浏览器侧的 pyulog 版本钉死。
- **基线已单独重新冻结**（`chore` 提交）：`facts` 的键按来源分组重排，值全同；
  `parserVersion` 从占位串变成 `pyulog/1.1.0`。`compare_baseline.py` 对 dict 做 `sorted`
  后比较，所以**键序变化不算差异**，重冻结前它报的正是"每条日志恰好 1 处差异 = parserVersion"，
  这就是"除版本外没动别的"的证据。重冻结后回到零差异。
- **同一类越界还剩一处，本次没动**：`rule_engine.py` 的 `"platform": "PX4"` 也是格式名
  写进格式无关层（`fmt` 契约项本就是干这个的）。改它要动基线里 `platform` 的值，
  另开一笔。
- 报告页「软件版本」行原先显示的是**原料**（`ver_sw_branch（ver_sw 全文）`），
  而存档里的 `firmwareDisplay` / `fwReleaseType`（`v1.17.0-alpha` 这种展示串）从不显示，
  只有历史卡片用 `lib/format.ts` 的 `formatFirmware()` 显示。现已统一到同一个
  `formatFirmware()`，分支与 git 提交移入 title——与历史卡片同口径。

**2026-09-17 追加：规则写法全面换成 Python 子集**（本文档下面那些「算子节点」的例子
只代表**最初设计**，现状见这一段）：

| 改了什么 | 前 | 后 |
| --- | --- | --- |
| `compute` | 算子节点链 `- {out: x, from: a.b, op: max}`，构建期编译成表达式 | **直接写表达式** `- x = max(a.b)`；节点写法已从构建期移除（写了会报错并提示改写）。85 个节点 → 70 条表达式 |
| `requires` / `not_applicable` / `silent_when` / `skip_reason_no_data` | 四个字段各管一摊 | 合成 **一个 `skip` 列表** `[{when: 表达式, reason?: 文案}]`（**不写 `reason` = 静默**）；"数据不足"靠新增内置变量 `no_data` 表达。— **2026-09-18 起 `skip` 与 `no_data` 都已退役**，见上一节 |
| `firmware` / `airframe` | `any` ｜ `">=1.15"` ｜ `fixed_wing` 这类自造小语言 | **Python 表达式**（`"True"` / `"is_fixed_wing"`），在 compute 之前求值、只认内置变量 |
| `slot` | 槽位（技术隐喻） | **`group`**；`facts.yaml` 的 `slot_order` → `group_order`，`nav_groups` → `nav_state_groups`（消歧义） |
| `version`/`category`/`status`/`author`/`license`/`changelog`/`outputs.check`/`doc` | 每条规则各写一遍 | **按 `group` 从 `facts.yaml` 的 `rule_meta` 派生**，偏离时才显式写。每条规则顶层字段 17 → 10 |
| `_run_rules` 的判定顺序 | 不适用声明 → 轴 → 依赖 | **轴先判**（"这台机器根本不适用"仍静默），再判 `skip` 映射；compute 失败后再判一轮（`no_data`）。— **2026-09-18 起**：轴 → `topics` → ran → compute，没有第二轮了 |

验证口径没变：以上每一步都要求 `compare_baseline.py` 6 条日志逐字段一致，外加一次
"派生的 `category/version/status/license/author/outputs.check/doc` 与改动前逐条相同"的核对
（基线只覆盖 6 份日志，**在那上面没触发的规则比不到**，所以那次核对是必需的）。

字段级权威参考（写经验时看这份）：站内 **[规则编写参考](/guide/rule-schema)**（由 `web/scripts/build-knowledge.mjs` 从 `engine/` 源码生成 `web/.generated/guide/rule-schema.mdx`，不入库）；
经验索引（站内页面，构建时生成）：**[/guide/rule-catalogue](/guide/rule-catalogue)**；迁移过程中顺带修掉的 6 处
真实缺陷见提交 `6a081d5` 的说明（最要紧的一条：日志消息级别判据按 ASCII 语义修正后，
`Kill engaged / Flight termination active`、`no barometer found` 这类"冒烟的枪"才浮出来）。

**2026-09-17 追加（第四段）：规则块改名 `emit` → `outputs`、`doc` 提到顶层、顺序对到执行顺序**

- **改名的理由**：`emit` 的名字暗示"发出 finding"，但 finding 全部由 `triggers` 经 `add()` 发出，
  `emit` 一个 finding 都不发——它实际是**规则的页脚**。而它装的每个键最终都落进结果 JSON
  （`check`→`checksRun`/`checksSkipped`、`tag`→`finding`、`stats`→`metrics`、
  `guard_tags`→`guardTags`），所以 `outputs` 名实相符，也与站内「规则编写参考」页（构建期生成、
  不入库，所以这里不写小节号）里讲 `outputs` 那一节的标题「输出与副作用」对齐。
  改动范围：24 个规则文件 + `engine/rule_engine.py`（局部变量 `_emit` → `_out`）+
  `tools/calibrate/probe_rule.py` + `web/scripts/build-knowledge.mjs` + 指南页 + `engine/README.md` +
  `facts.yaml` 注释。
- **顺带消掉一处同名**：`build-knowledge.mjs` 里本来就有个**写产物的辅助函数** `emit(path, content)`，
  与规则键同名。规则键改叫 `outputs` 后它更刺眼，已一并改名 `writeArtifact()`（纯内部函数，9 个调用点）。
- **顺序对到执行顺序**：`outputs` 块原先都写在 `triggers` 之后，而引擎是**先跑 outputs 后跑 triggers**
  （`triggers` 还要读它的 `tag`）——文件读起来和执行顺序相反，正是"这俩什么关系看不懂"的根源。
  20 个规则文件改为 `compute → outputs → triggers`
  （4 个 guard 文件没有 `triggers`、`failsafe.yaml` 是没有 `outputs` 的数组、
  `logged-errors.yaml` / `logged-warnings.yaml` 无显式块，都不涉及）。
- **`triggers` 与 `outputs` 的连接只剩一根线**：只有 `tag`（trigger 未写 `tag` 时回退到
  `outputs.tag`）。`check` / `stats` / `guard_tags` 与 `triggers` **无关**，是规则自己的记账与副产品。
- **`doc` 从 `outputs` 提到规则顶层**：它是**整条规则**的官方文档链接（写进 `finding.docUrl`），
  不是"产出"，放在 `outputs` 里名不副实。它本来就 100% 从 `facts.yaml` 的
  `rule_meta.by_group[group].doc` 派生、**没有任何规则显式写过**，所以规则文件一个都没改——
  只动了引擎（`_rule.get("doc")`）、构建脚本（`raw.doc` 与同 group 一致性校验）和文档。
  将来要显式写就写在**顶层**（与 `id`/`name`/`group` 同级），别再写进 `outputs`。
- **验证**：`compare_baseline.py` 6 条日志零差异（它逐字段比 finding 的
  `id/ruleId/severity/tag/title/evidence/docUrl/suggestion`，**覆盖 `docUrl`**）；
  构建产物解析成对象后逐条与改名前**相等**（只有 key 顺序变了）；
  `check-pyodide-px4log-engine.py` / `guard-px4log-provider.py` / `build:kb --check` 全过。
  **`derived-version`会变**（`rule_engine.py` 在哈希里），用户存档打开时自动重解析一次；
  `rules/*.yaml` 仍**不进**哈希，所以改名 / 改阈值不会让历史结论重算。
- **顺带统一了分段格式**（同一批的第二笔提交，**只动空行、无语义变化**）：原先「每个顶层键前都空一行」
  的写法把只有 10 个键的文件撑到 50 多行，而且 5 个文件还漏了几处。改为按文件头注释自己的分组
  （身份 / 适用范围 / 计算 / 输出 / 触发）分段——**段内紧凑、段间恰好一个空行**；注释头紧贴它注释的键。
  证据是**构建产物字节完全相同**（改前改后 md5 一致）与**注释行数逐文件等于改前**，
  所以 `derived-version` 也没动、用户存档不会重解析。
  注意：仓库根的 `pnpm format`（prettier）**会把段间空行全部抹掉**，与本约定冲突——别拿它跑 `knowledge/`。
- **本文档里的历史段没有跟着改**：下面「执行链路」「完整示例（一条经验的全文）」「必填 vs 可选」
  「故障库与规则的分工」等节里的 `emit` / `emit.fault_tags` / `emit.related_faults` 是**最初设计**的
  记录（那些字段多数从未落地）。**当前实际键名一律是 `outputs`**，别照着历史段写规则。

**2026-09-18 追加：适用范围收进 `conditions`，`skip` 与 `no_data` 退役，内置变量全大写**

规则头部从"两个平铺的轴 + 一坨 `skip`"改成一个 `conditions` 块（`rules-template.yml` 是骨架）：

```yaml
conditions:                       # 整块可省
  firmware: any                   # any / ">=1.15" / ">=1.14,<1.15"；省 = any
  airframe: any                   # any / 机架名 / 机架名列表；省 = any
  topics:                         # 项内 `||` = 其中任意一个在日志里就够，项间 = 都要有
    - vehicle_gps_position || sensor_gps
  precheck:                       # 先决条件：命中即不跑（文案就是命中的那句）
    - "not HAS_ARMED"
```

四个键的分工：`firmware` / `airframe` 判"这台机器是不是本来就无关"，`topics` 判"日志里
有没有这份数据"，`precheck` 放"不用算就知道跟我无关"的场合（如 `not HAS_ARMED` 就谈不上
飞行中的零偏判定）。`precheck` 在 compute **之前**求值，所以只认内置变量与 `has_topic()`——
**没有 `no_data`**："数据不足"由 compute 抛异常自己表达。

**四个键不满足一律记一条 skipped**（2026-09-18 追加第五段改的，原先静默）：报告里要能看出
"这条为什么没跑"。自动文案分别是 `固件不满足 >=1.15` / `机架不适用 fixed_wing` /
`先决条件命中：not HAS_ARMED` / `X not in log`。

- **`skip` 整个字段没了**，三类条件各有去向：缺 topic 写进 `conditions.topics`；"有没有数据"
  这类改成 `conditions.precheck`（命中即不跑）；`no_data` 由 compute 抛异常自己表达。
  三者**都会留痕**，文案由引擎生成（`X not in log` / `先决条件命中：…` / `数据不足，本条没算出结论`）。
- 引擎侧 `_rule_skipped()` 与 `no_data`（`_rule_env` 里那个）**已删除**，换成 `_missing_topics(spec)`
  原生判 `topics`。`skip` 在 YAML / 产物 / 引擎里都不存在；`has_topic()` 保留（guard 与将来的
  表达式仍可用）。
- **构建期**：`requiredKeys` 去掉两轴；`conditions` 有未知键、`topics` 项不是 topic 名、
  `firmware`/`airframe` 不合规一律构建失败；**顶层残留 `skip` 会明确报错**，不静默忽略。
  归一化后产物里仍是两个平铺的 `firmware` / `airframe` + 新的 `topics` 嵌套列表
  （`lint_rules.py` 读产物取 `firmware`，所以它不用改）。
- **基线差异**（这一轮重冻结的依据，全部落在 `checksSkipped`）：`motor-balance` 的
  `no_data` 行消失（6 份日志里都有）、`imu-bias` 的 `not has_armed` 行消失、
  attitude 两条的缺 topic 文案从手写的 `vehicle_attitude(_setpoint) 或 armed 段缺失`
  变成自动生成的 `vehicle_attitude_setpoint not in log`、sample 上 `vtol_transition`
  从"静默"变成一条记录（过去被前面那条静默的 `not has_armed` 挡住了）。
  `findings` / `checksRun` / `metrics` / `tags` 一处未动。
- **`imu-bias` 那处要留神**：它的 `gyro_bias_worst(...)` 原本包着 `_try`，而 `gyro_bias_worst`
  在没有 armed 区间时返回 `None`——`_try` 把它吞成四个 `None` 之后，原先充当门控的
  `abs_gate = require_true(...)` **其实是个空转**（`require_true` 只返回 `None`，且没人引用
  `abs_gate`）。于是去掉 `not has_armed` 后这条规则会在没有 armed 段的日志上"跑成功"、
  多吐一个 `gyroBiasSource` 指标。**现在"没有 armed 段"写进 `conditions.precheck`
  （`not HAS_ARMED`）显式拦下**，那层 `_try` 仍去掉——它现在只负责"整份日志都没有零偏数据"
  这一种中止。顺带一提：`require_true` 的"门控"语义只有在**下游真的引用了那个变量**时才成立，
  这是个容易踩的坑（airspeed 的 `cruise_ok` 同样没人引用）。
- **内置变量一律大写**（`FW_MINOR` / `AIRFRAME` / `IS_FIXED_WING` / `DURATION_S` / `ARMED_S` /
  `ARMED_INTERVALS` / `T0_US` / `HAS_ARMED` / `RESTART_DETECTED` / `DROPOUT_MS` / `MESSAGES`）：
  规则里自己赋的变量是小写，一眼分得清"这个数是引擎给的还是自己算的"。事实源是
  `engine/providers/api.py` 的 `BUILTIN_VARIABLES`（`build-knowledge.mjs` 的 §6.1 表与
  它的 `BUILTIN_VARS` 都派生自它；原先那张表由 `tools/px4/gen_rule_reference.py` 生成，
  该脚本已并入 `build-knowledge.mjs`）。`has_topic()` 是函数，
  不大写。`web/scripts/lib/rule-expr.mjs` 里那个"版本号必须先判 `None`"的护栏跟着改成
  `FW_MINOR` / `FW_MAJOR`。
- **这一轮动了 `rule_engine.py`**（删 skip 机制、加 `_missing_topics`），所以 `derived-version`
  会变、用户本机存档打开时自动重解析一次（AI 报告保留）——这是设计内的行为。

**2026-09-18 追加（第二段）：引擎回到三步走，字段的版本差异交给候选组**

目标流程写死为 **conditions 拦 → compute 算 → 判定**，前两步的失败一律**自动留痕**、
不用作者写文案：

| 步骤 | 不满足时 |
| --- | --- |
| `conditions.firmware` / `airframe` / `precheck` | **记一条 skipped + 自动文案**（原先静默，2026-09-18 起改） |
| `conditions.topics` | 记一条 skipped，文案自动生成（`X not in log`） |
| **compute 抛异常** | **记一条 skipped：`数据不足，本条没算出结论`** |

- 因此 **`ran()` 统一挪到 compute 成功之后**——同一条 check 不能既 ran 又 skipped。
  `ran_on_success` 字段**已删**（它想要的就是这个行为，现在成了默认）；`ran_when` 保留
  （算出来了、但样本不够不算跑过，如 attitude 的 `seg_ok`）。构建期会拒绝残留的
  `ran_on_success` / `known_legacy` / `skip`，不静默忽略。
- **`ref(...)` 的位置参数可以给多个** = 候选组：按顺序取第一个在日志里存在的，都没有返回
  `None`（存在性判据就是 `provider.get_series(...) is not None`，没给 provider 契约加新东西）。
  `alias=` 与它是同一个东西的两种写法（`ref("名", alias="旧名")` ≈ `ref("名", "旧名")`）。
- **`known_legacy` 字段已删**。字段的版本差异只有三种表达：整条规则写死 `conditions.firmware`、
  同义改名用候选组、同名换单位/语义配 `unit=` 或拆规则。**没有白名单**。
- **lint 的数组盲点已修**（`tools/calibrate/lint_rules.py` 的 `has_field`）：原先只在引用那一侧
  剥下标，而日志侧字段名是 `states[0]` 这种带下标的、字典侧是裸名，于是**数组字段在日志里永远
  匹配不上**——`estimator_status.states` 明明就在 1.11 的日志里，却被判成"哪里都没有"，
  当初 `known_legacy` 就是为它加的。现在两边都归一化到基名再比。
  教训：**"哪里都没有"的结论要交叉验证**（我一开始按精确名比对，跟着旧逻辑一起得出了错的结论）。
- **删掉了 `rules/vibration-stddev.yaml`**：它引用的 `stddev_accel_x_m_s2`（含 alias
  `stddev_accel_x`）在 4 份日志 + 3 份字典里都不存在，而它的前提"旧固件没有
  `accel_vibration_metric`"被最老那份日志（1.11.2）证伪——那份里就有。等于一条永远不可能
  生效的经验。删除它不影响 finding 编号（它从没发射过 finding）。
- **`imu-bias` 的多源取数没问题**，不用改：1.11 那份日志里 `estimator_status.states[0..23]`
  是存在的，算子走"状态槽"那条路，基线里 `gyroBiasSource: estimator_status.states[10..12]`
  就是证据（这一条也是被上面那个 lint 盲点误导后重新核实的）。
- **`ekf-faults` 删掉了 `nan_flags`**（那个字段 1.11.2 起就叫 `n_states`，不是同一个量；
  我们的样本里没有任何版本有 `nan_flags`）。触发条件化简为 `crit_bits`，证据文案去掉 `nan=`
  ——所以那几条命中它的日志，基线里 finding 的 `evidence` 会变。
- **基线差异**（这一轮重冻结的依据）：`checksRun` 缩（算不出来的不算跑过）、`checksSkipped`
  长（多出「数据不足」）、`ekf-faults` 证据文案变化、`vibration-stddev` 那行消失。
  `findings` 的其余字段一处未改。

**2026-09-18 追加（第三段）：算子不认识固件版本**

- **算子的入参里不再有 `fw_minor`**。`att_tracking_stats` 与 `gyro_bias_series` 原来各自用
  `fw_minor >= 15` 决定取哪一路数据——这条判断现在**挪到规则上**：哪个版本用哪个字段，
  写在 `ref(...)` 的候选组上（有谁用谁）；算子只**按"谁有数据用谁"**挑，挑的时候看的是
  数据本身（样本够不够、是不是全零），不是版本号。算子签名随之变化
  （`gyro_bias_series` 7→6、`att_tracking_stats` 8→7）。
  判据：**算子只做运算，版本相关的处理在算子外面做好**。
- 两条经验的写法因此从"传版本号进去让它自己分叉"变成"把候选来源都递进去"：
  `attitude-oscillation` / `attitude-overshoot` 的指令源（`q_d` 优先、没有才用
  `roll_body`/`pitch_body`）、`imu-bias` 的三路零偏来源。**行为一字未变**（基线零差异）。
  中途曾把版本门写到引用上（`when_fw=`），随后**整个移除**（见第五段）——同一件事改由
  "数据本身够不够"判，算子挑来源时看的是样本数与是否全零，不是版本号。
- `FW_MINOR` 保留为内置变量（现在**没有任何规则用到它**）：它是表达式里做**数值**版本比较的
  唯一手段，也是构建期那条"版本号必须先判 `None`"护栏的判据。**优先用 `when_fw` / 候选组**，
  只有当你要写真正的大小比较（`FW_MINOR >= 15`）时才请它出场。
  （**字段换代别用它**——那不是版本问题，是"老名字没了、新名字在"，用候选组。）

**2026-09-18 追加（第四段）：取数说清"哪个实例、什么单位"**

三件事一起做，都是为了"读一条数据要把话说完"：

1. **实例写进字段名**：`ref("estimator_status[0].vel_test_ratio")`（第 0 个）、
   `ref("estimator_status[:].vel_test_ratio")`（所有实例）。
   **切片按 Python 语义，且"不写下标"与 `[:]` 等效**：所有实例——多实例时给"每实例一组"
   交给会归约的算子；**单实例时就是那一条序列**（否则单实例字段得处处写 `[0]`，而 `q`
   这种"每元素一列"的数组字段会被多包一层、直接读不出来）。`[N]` = 第 N 个。
   （`provider.get_series` 的默认值因此是 `slice(None)`；`_read_concat` 已删。）
   中间那版曾把它做成 `instance=` 修饰键，随即改成写进名字——字段引用本身就该自带
   "读哪一份"，而不是在旁边挂个参数。两种下标位置别混：`topic[N].field` 是实例、
   `topic.field[N]` 是数组元素。
   裸写的字段引用**不能**带实例下标（`cpuload[0].load` 会报错并提示改写）。
2. **`provider._read_concat` 删除**：以前"不加修饰 = 所有实例拼成一条"是默认语义，
   隐性且危险（一条曲线里混着几个传感器的数据）。现在必须写明要哪个实例。
3. **机架名支持简写**：`airframe: mc` / `fw`（表在 `facts.yaml` 的 `airframe_aliases`），
   **构建期归一化成规范名**，产物里只留 `rotary_wing` / `fixed_wing`——引擎与适配器都不认识别名。
4. **`ref(..., unit="期望单位")`**：把取到的值换算成声明的单位再交给算子。
   - 源单位**不在规则里猜**：构建期按 `meta/topic-map.yaml` 找到字典键、去 `meta/<tag>.json`
     查 `unit`；查不到就**告警**（不是失败），补一行到新建的
     `knowledge/px4/meta/topic-overrides.yaml` 的 `units` 里。量纲不一致（长度↔角度）直接报错。
   - 换算**在运行期做一次乘法**（meta 不进产物是既定架构）：构建期把"**写了 `unit=` 的引用**
     涉及的字段 → 规范单位"烘成一张小表（`__FIELD_UNITS__`），
     引擎侧一张常量表（`_UNIT_FACTORS`）给"规范单位 → 到族基准的因子"。
     两份表都只在**规范化后的名字**上对齐，构建期会比一次、对不上就构建失败。
   - 于是 `adjacent_speed_mps` 的 `unit=` 参数**退休**，gps-jump 也不再需要两条 `when_fw`
     分支：`ref("latitude_deg", "lat", unit="deg")` 一句话把"改名 + 改单位"说完。
5. **算子不认识固件版本**：`att_tracking_stats` 与 `gyro_bias_series` 的 `fw_minor` 入参
   已删。**版本判断在算子外面做好**——规则把候选来源都递进去，算子按"谁有数据用谁"挑
   （看样本数与是否全零，不看版本号）。判据：**算子只做运算**。
6. **删掉了 `rules/vibration-stddev.yaml`**：它引用的 `stddev_accel_x_m_s2`（含 alias）
   在 4 份日志 + 3 份字典里都不存在，前提"旧固件没有 `accel_vibration_metric`"又被最老的
   1.11.2 日志证伪。
7. **已知缺口**：**"跨实例取最差"现在没有写法**（双电池的 `battery_status`、多 EKF 的
   `estimator_wind` 都只看第 0 个实例了）。要做得让相应算子吃 `[−1]` 的分组输入
   （`cell_voltage_min` / `min_ge` / `rows_aggregate` …）——那是另一笔。
   这一轮 6 份基线零差异，是因为那几条规则用的是 min 类统计、第 0 个实例本来就持有极值。

**与设计的落地差异**（都是有原因的选择，不是遗漏）：

| 设计 | 实际做法 | 为什么 |
| --- | --- | --- |
| 一条经验一个 YAML | 一个 YAML 可装**多条**经验（顶层数组）；failsafe 的 6 条同构经验合并为一个文件 | 5 个布尔字段的失效保护经验只差字段/标签/文案，拆 6 个文件纯属噪音；一般情况仍一经验一文件 |
| compute 用细粒度算子串起来 | 允许**复合算子**（多入多出），如 `att_tracking_stats`（对齐+掩码+统计）、`gyro_bias_series`（双固件取源）、`cell_voltage_min`（实测/回退/缺失三分支） | 30~40 个节点串成的链读不下去；把"取数→对齐→掩码→统计"这类固定套路收成一个算子后，姿态那条 30→4、陀螺零偏 41→6、全库平均 2.6 节点/条。算子仍**不认识具体字段**：字段名、阈值、文案都在 YAML |
| `phase` 作为第三个适用轴 | 未启用 | 原实现里 phase 只参与故障库匹配，规则并未按阶段过滤；等真需要（例如只对大机动段判某条）再启用 |
| `guards/*.yaml` 独立目录 | 放在 `rules/`，用 `slot: guards_early` / `guards` | 同一套 schema、同一套校验；分两级是因为 `insufficient_data` 必须是第一个 guard 标签 |
| `min_samples`/`confidence`/`safety`/`thresholds_source`/`calibration`/`fixtures` | 暂未启用 | 本阶段验收标准是"等价迁移"；这些是校准期与规则市场期的字段 |
| `meta/<tag>.json` 参与构建期字段校验 | **尚未接入（已知缺口）** | 现在字段名拼错不会构建失败，而是运行期取到 `None` → 该经验静默不生效（不崩，但也没有任何告警）。接入时要注意版本差异：`accel_clipping` 只存在于旧固件，不能按"必须存在于最新 tag"来判 |
| 设计中未提及 `instance` | 新增 `instance: N` 取单个实例 | 原实现大量 `xxx_list[0]`；而默认的多实例拼接会改变语义——`estimator_sensor_bias` 每个 IMU 一个实例，拼接后样本 43→129，零偏统计直接算错 |

**已知的次要行为差异**（都不在基线覆盖范围内，已在对应经验文件里注释标明）：

- attitude：姿态/指令字段缺失时静默不适用（原实现会留一条 skip）
- motor_balance：通道数不足（<4 列）与活跃通道不足（<4 个）**一律静默**（`skip` 已退役，两条路径
  合并成同一种表现）
- airspeed：缺 `airspeed_validated` 与无固定翼巡航段**一律静默**（同上；只有缺 topic 会记一条
  skipped，文案由 `conditions.topics` 自动生成）

### 版本分支：**只有一种写法**——候选组 + 规则级 `firmware`

升级换代就是"老名字没了、新名字在"，所以**取数按存在性挑**，不按版本号分流：

```yaml
w_p95 = percentile(hypot(ref("estimator_wind.windspeed_north", "wind_estimate.windspeed_north"), …))
```

规则级 `firmware: ">=1.15"` 还在，但它管的是"**整条经验**适不适用"（连同 `airframe` / `topics`
一起进 `conditions`），不是"该读哪个字段"。

**已经删掉的两样**（别再写回去）：节点级 `when_fw=`（同一字段换了**语义**就拆成两条规则，
不该用版本门在一条规则里分叉）、`known_legacy`（白名单挡不住漏，字段能不能取到由存在性说话）。

**字段校验（`tools/calibrate/lint_rules.py`）**按规则级 `firmware` 圈定的版本范围，在
**回归日志实测字段**与**上游字典**里找，分类为 命中 / 版本错配 / 可疑。自检过：把
`wind_estimate` 那支错标成 `>=1.15` 会精确报出"仅存在于 1.11"。

**2026-09-18 追加（第五段）：绘图预设换成同一套取数语言（曲线与地图合成一件事）**

动机：`plot/` 下原本是**两套语言**——曲线用 `panels/topic/instance/fields/op`（前端搭面板、前端按
"topic + 原始列名"取数），地图轨迹用 `{field, scale}` 候选列表（provider 自己挑候选与换算）。
于是"字段换代、改了量纲"在图上与规则里要各写一遍，单位更是三处不同口径。这一轮把两边合成
**一份预设 = `conditions` + `compute` + `outputs[]`**，取数一律走 `ref(...)`：

- **曲线也走 `ref`**：`np_series` 从"收 topic + 列名"改成**收整份取数声明**（`{instance, xdata,
  ydata, compute}`），引擎侧求值、单位换算、降采样都在引擎里做——这才叫"前端不画数学"。
  返回的 `series` 与 `ydata` **同序等长**（取不到的那项是 `null`），前端按预设里写好的
  label/color 逐项对齐即可，不用靠字段名反查。
- **`_ref` 抽出 `_pick_ref`**：候选循环同一份实现，`_pick_ref` 多回传一个"命中的 bare 字段名"。
  地图要它——时间戳与 `fix_type` 必须跟坐标来自**同一个话题的同一个实例**，否则三路采样率不同、
  数组长度不一致，画出来是错的。`_ref` 现在是它的薄壳（规则侧行为零变化）。
- **`compute` 节点**：预设里的换算与规则的 `compute` **同一套**（同一个构建期校验器
  `validateComputeList`、同一个运行期 `_eval_compute`）。`attitude.yml` 的"四元数→欧拉角"由此
  从容器级 `op` 改成 `compute` 里一行 `roll, pitch, yaw = quat_to_euler(vehicle_attitude.q)`
  ——`q` 是「每元素一列」的数组字段，裸写就取到那四列。为此 `@operator` 的 `in_arity`
  扩展成**可给列表**（`quat_to_euler` 声明 `[1, 4]`：一组四列、或 w/x/y/z 四列都认，
  `vtol-transition` 规则仍用后者），构建期按列表逐个放行、别的一律拒绝。
  实测：与改造前 `op` 路径在**共同时间戳上逐值零差异**（约 3 万次比较），只有 LTTB 的采样点不同
  （参考序列从 `q[0]` 变成 `roll`）。**踩到的坑**：`np_series` 的"时间戳从命中字段反推"只认
  `ref(...)`，而裸写字段要到 `_compile_compute` 才被改写成 ref——于是 `quat_to_euler(vehicle_attitude.q)`
  整张图报"取不到时间戳"；`_first_ref_bare` 现在两种写法都认。
- **单位表扩到预设**：`resolveFieldUnits` 不再只遍历规则的 compute，而是收"规则 + 预设"两边的
  引用（预设侧在**编译时登记**，不靠事后遍历产物猜形状——地图坐标编译后不是同一个形状，遍历会漏）。
  顺带修了一个潜伏 bug：表键带实例（`topic[0].field`）时，量纲检查取了剥掉实例的名字、
  `wanted.get()` 拿到 undefined。**只在需要换算时写 `unit=`**（字段本来就是目标单位就别写，
  不写 = 不换算也不查表），所以 eph/epv 这类保持原样、不产生告警。
- **地图支持多条轨道**：`container: map` 的 children 各是一条轨道（`label` 是图例名）。
  一条 → 沿用海拔渐变着色 + 左侧色带；多条 → 每条纯色 + 可点选隐藏的图例，起终点 marker 只画第一条。
  轨迹返回形状随之变成 `{title, legend, tracks: […]}`，单条取不到就跳过、全取不到才给 `error`。
- **sensor_gps 优先（用户选定）**：1.16/1.17 的日志里 `sensor_gps` 与 `vehicle_gps_position`
  **同时存在**，前者采样少得多（181/43/309 vs 1390/436/3095）——**轨迹点数会明显变少、更"粗"**，
  这是明知的取舍（宁可要新话题的原始 GNSS）。曲线那边**故意反过来**（`vehicle_gps_position` 优先），
  为的是与改造前画的是同一份数据。
- **取数与并列键一律是 YAML 列表，没有逗号串了**（`ydata` / `label` / `style` / `color`）：
  一开始四个都写成逗号串（`ydata: a, b`、`style: solid, dashed`），两处都不好——`color` 是
  `#rrggbb`，而 YAML 不允许标量以引号开头、`#` 不加引号又会被当注释，逗号串形态下**根本没法写**
  （只能绕块标量，已在模板里踩过）；`ydata` 的项里带逗号（`ref("a", "b")`）也得靠自制的引号感知
  切分。现在 `ydata` 是**块列表、一行一条**（行尾还能挂注释）、另外三个也是列表，构建期报错指到
  第几项；`splitTopLevel` 与"逗号串"这条路一起删了。视图层**不受影响**——编译产物一直是数组。
- **`FACTS` 改成按 JSON 解析**（`json.loads(r"""…""")`，与 `RULES` 同款）：预设里出现 `legend: true`
  之后，当 Python 字面量注入直接 `NameError: name 'true' is not defined`。**凡是有布尔/空值的
  JSON 载荷都不能当 Python 字面量注入。**
- **哨兵护栏已就位**（同一天早些时候的另一笔）：产物用 JS `.replace()` **只换第一处**，源文件注释里
  写出哨兵原名会让真正的赋值留在替换范围外 → 浏览器 `NameError`、整份日志解析不了；而本地回归
  用 Python 的 `str.replace`（全换）所以全绿。现在构建期按"每个哨兵**恰好一次**"卡住。

**没做的**（`docs/architecture/plot-schema.md` 里的设计，留给后续）：`breaks`（中途丢星时把路径
**断开**而不是只剔除——现在前后两段会被连成一条横穿地图的假直线，这是真 bug）、点解析
（`t: first/last/{max_of: alt}/{finding: critical}`，把图上标记点与规则命中时刻打通）、
`kind/geometry` 判别式联合（`path/points/segments/area`）、具名 `sources` 注册表。
本轮按"`container` × `mode`"落地，是因为它与现有代码最近、改动面最小。

一个必须记住的现实：**同一物理量在不同固件下可能是不同的 topic（不是改名），也可能真的是改名**。
两类都要处理，且不能凭名字相似去猜：

| 情形 | 例子 | 处理 |
| --- | --- | --- |
| **不同 topic，语义不同**（同时存在） | `sensor_gps`（GPS 原始数据）与 `vehicle_gps_position`（融合/处理后的位置）是两个不同的东西 | 规则要明确读哪一个：GPS 跳变判定取**处理后的位置**（飞控实际用的），原始数据的野值由 GPS 模块自己过滤 |
| **真改名**（同义不同名/不同单位） | `lat`/`lon`（旧，1e7 度）→ `latitude_deg`/`longitude_deg`（1.15+，度） | 节点级 `when_fw` 分流 + 单位口径写在算子参数上（如 `adjacent_speed_mps` 的 `unit: degE7` / `deg`） |

字典（`meta/<tag>.json`）按上游 `.msg` **文件名**收录，与日志里的 topic 名并非一一对应，
所以字段校验以**回归日志实测字段**为主要判据、字典为辅。若将来要以字典为硬判据，
得先补一份 topic/字段改名映射（设计里的 `topic-overrides.yaml`）。

**这套机制已经抓到过真问题**：`px4-gps-jump` 原来读 `vehicle_gps_position.lat/lon`，
而 1.15+ 已改名成 `latitude_deg/longitude_deg`（单位也从 1e7 度变成度）——
该经验在现代固件上其实一直静默不生效、连统计量都不产出；补上版本分流后才恢复正常。

**怎么验证**：`python tools/calibrate/compare_baseline.py`（6 条日志逐字段比对）、
`python tools/calibrate/check-artifact.py`（生成产物真实执行）、
`python tools/calibrate/lint-rules.py`（字段引用 + 版本错配）、
`python tools/calibrate/probe_rule.py <log.ulg> <rule_id>`（单条经验逐节点诊断）。

---

## 报告页数据层（`engine/report_data.py`）：踩过的硬规则

> 这一层的产出（`np_manifest` / `np_series` / `np_track` / `np_log_info`）直接决定报告页每个 tab 长什么样。
> 下面每一条都是**实机日志逼出来的**，改之前先看一遍，别按"想当然"改回去。

| 规则 | 为什么 |
| --- | --- |
| **时间基准 = 开机以来的秒数**（`_since_boot`，就是 `t/1e6`） | PX4 时间戳本身就是开机起的微秒。曾经减过 `ulog.start_timestamp`（= 开始记录的时刻，通常比开机晚几秒到几分钟），于是同一份日志在本站与 Flight Review 上整体差出那一段——FR 的 Logged Messages 和曲线横轴用的都是开机时间（`plotted_tables.time_str` 直接除 timestamp） |
| **事件消息 = 事件解码 + 文本消息，合成一条时间轴**（`kind` 区分 `event`/`log`） | PX4 对同一个事件写两样：`event` topic（二进制）**加**一条等价的旧格式文本（**以 `\t` 结尾**，如 `[commander] Armed by Stick gesture\t`）。FR 的做法是跳过 `\t` 行、改用解码出来的文字。我们用 pyulog 的 `PX4Events`，定义取自**日志自带的 `metadata_events`**（那个 xz blob 就是这份固件的事件定义）——不联网、与固件版本严格对应；解不出的 ID 显示 `[Unknown event with ID N]`（与 FR 一致） |
| 固件**没带** `metadata_events` 时**保留** `\t` 行 | 否则 armed / takeoff 这类关键节点会凭空消失。判据是"这次解出事件了吗"，不是"FR 怎么做" |
| `lzma` 是 Pyodide 的**可加载包**（不是内置模块），单独 `loadPackage` 且**允许失败** | 拿不到就退化成"不解码事件"，不能因为它把整个解析挡在门外 |
| 多值信息（'M'）组内怎么拼，看**形态**：任一段自带换行 → 直接拼接；否则用 `\n` 连接 | 逐行型（`perf_counter_*`、`perf_top_*`）每段是一行完整文本、PX4 不给行尾换行，不补 `\n` 就全黏成一行；流式型（`boot_console_output`）是一整段控制台文本按定长切片、换行在段**内部**且一行可能跨段，补 `\n` 会凭空断行。整组都是原始字节的（`metadata_events`）只报总字节数 |
| 消息类型统计**逐字节走文件**（`[uint16 长度][uint8 类型]`），不读 pyulog 的解析结果 | 要回答的是"文件里究竟有多少条"，顺带当**文件是否被截断**的旁证（走不到 EOF 就是不完整）。可与 pyulog 交叉验证：`L` = `logged_messages`、`D` = 各话题采样点数之和、`S` = `_sync_seq_cnt` |
| Information Message 字典带**中文名与说明**，取 `facts.yaml` 的 `info_key_docs` | 上游没有这份对照表（PX4 只在源码里写死这些 key）。表里没有的键留空——**不猜、不编** |
| 参数「默认值」靠 **'Q' 消息的语义**推出来，不依赖外部字典 | PX4 只记录**与当前值不同**的默认值（`logger.cpp: write_parameter_defaults`）→ 没记录就说明当前值等于默认值。于是每一行都能给出具体数字，不需要"一致 / 已改"这类占位文字。取法：机架默认 → 固件默认 → 当前值 |
| 参数「最小值 / 最大值 / 说明」来自 `knowledge/px4/meta/main.json` → `web/public/params/px4-main.json`（按需拉取，175 KB / gzip 33 KB） | 上游**只有 main 分支**产出 `parameters.json`（release tag 没有，见 `meta/v1.15.0.json` 的 `parametersNote`），所以这是"最新分支快照"，与老固件可能有出入——界面必须如实标注来源。放 `public/` 而不是内联进 Pyodide：这份字典与具体日志无关，内联等于每份日志都要多下它一遍 |

### 「软件版本」的展示口径（`engine/rule_engine.py` 的 `facts.firmwareDisplay`）

**照抄 FR 的 `_format_sw_version`**（`app/tornado_handlers/browse.py`，2026-09-16 从 upstream main 取回源码核过）。
类型码 = `ver_sw_release & 0xFF`：

| 类型码 | 展示 | 例 |
| --- | --- | --- |
| 255 正式版 | `vX.Y.Z`（无后缀、无哈希） | `v1.16.0` |
| 64 / 128 / 192 alpha / beta / RC | `vX.Y.Z-alpha` 等（**带后缀、不带哈希**） | `v1.17.0-alpha` |
| 0 未打标签的开发版 | `vX.Y.Z (短哈希)` | `v1.14.3 (08310a)` |
| 无 `ver_sw_release`（老固件） | git 短哈希（`> 10` 位才截 6 位） | `fd4833` |

**踩过的坑**：本机 `PX4-flight_review` 那份 checkout 是 2024-03 的，那会儿 browse.py 还只认正式版
（`if release_type == 255` 才换发布号，其余一律给哈希）。照它改完，`v1.15.0 (479ee0)` 被改成 `479ee0`，
看着"更 FR"其实正好相反——实测 review.px4.io 上一份开发版日志显示的是 `v1.14.3 (08310a)` 两行。
**再核口径就去 `git fetch` upstream main 取当场源码**（本地 checkout 会过期）。

`facts.fwReleaseType` 另存了类型码：前端 `lib/format.ts` 的 `formatFirmware()` 凭它 + `firmware` + `verSw`
能完整重算展示串，所以云端记录（只带摘要字段）与老存档都能在界面上纠正过来，不必重新解析日志。

`engine/rule_engine.py` 已进派生数据版本的哈希——facts / findings 同样随报告归档，
口径一变老存档打开时会自动重解析一次（AI 报告不变，见下面）。

### 派生数据版本：改了数据层，旧存档自动重解析

`web/scripts/build-knowledge.mjs` 对 `engine/report_data.py` + `engine/rule_engine.py` +
`knowledge/px4/facts.yaml` + `plot/*.yml` 算内容哈希，写进 `web/lib/knowledge/derived-version.generated.ts`。
本机存档里的派生数据（`info` / 曲线 / 轨迹）带着**生成时**的版本，与当前不一致就重新解析一次
（`useLogAnalyzer.openSaved`：旧数据先渲染、后台重解析，解析完自动换成新的；facts / findings 也一并刷新，
**AI 报告保留**）。所以改完引擎不用逐个提醒用户"重新上传一遍"。

- 规则文件（`rules/*.yaml`）**故意不进哈希**：改阈值不该让所有历史结论跟着重算；
- `rule_engine.py` 在**列**：它产出的 facts / findings 同样随报告归档，口径一变（如软件版本串）
  老存档也得刷一次；
- 内容是**文件字节哈希**，所以连注释改动也会触发一次重解析——宁可多解析一次，也不漏掉真正的形状变化；
- **已知缺口**：存档的原始日志已被 LRU 淘汰、且来自别的设备时，"重新解析"无从谈起，只能看旧格式数据
  （此时界面不假装已修复）。

---

## 四类经验 → 四种载体

工程师的经验不能整段丢给模型；按性质拆四类、各归其位，Agent 只负责检索 / 组装 / 翻译：

| 经验类型 | 载体 | 谁执行 |
| --- | --- | --- |
| ① 量化阈值（振动多大算异常） | `rules/*.yaml` 的 `compute` + `triggers[].threshold` | 确定性引擎判定，产出标签 |
| ② 故障树（多条件耦合、排查优先级、禁忌） | `fault-kb.yaml` 条目（字段定义见该文件头注释） | 引擎按 标签 / 阶段 / 排除标签 匹配，只把命中条目喂 LLM |
| ③ 推理逻辑（工程师怎么想） | `llm/gjb841-system-prompt.md` | LLM 遵守 |
| ④ 边界 / 禁忌（什么情况下不许下结论） | `rules/*.yaml` 的 `outputs.guard_tags` → guard 标签（如 `insufficient_data`） | 引擎先拦（命中即可短路），Prompt 兜底 |

"我这块经验该写成什么"按这张表判断；"我想做 X 去看哪个文件"见 `../README.md` 的导航表。

## Context（为什么做）

现状的反例正是 `px4-thresholds.toml`：

```toml
[cpu]
load_warn = 0.90     # ← 空洞：没名字、没固件、没机架、没字段、没处理、没触发条件
load_crit = 0.95
```

裸数字飘在 TOML 里，看不出属于哪条经验、读哪个 topic 的哪个字段、什么条件下成立。
同时原 15 组检查 / 39 个告警点写在 `engine/ulog_checks.py`（已迁移为 `engine/rule_engine.py`，1095 行），阈值与实现分离，
「暂定」只存在于注释里，「误报率 <10%」只存在于文档里。

目标：**一条经验 = 一个自包含、可评审、可验证、可分发的完整单元**。
（对齐 CLAUDE.md 的「规则市场 70/30 分成」——分成的前提是经验能被独立验证与归属。）

用户给的四段式（名字 / 固件+机架 / 字段+函数 / 表达式触发）是**骨架**；
下面在这个骨架上补齐「更好地描述一条经验」真正还需要的东西。

## 执行链路：YAML 经验怎么在浏览器里跑起来

**结论：能，而且是现有架构已在用的方式——YAML 只在构建期存在，浏览器跑的是编译产物。**

```text
构建期（Node，web/scripts/build-knowledge.mjs）
  knowledge/px4/rules/*.yaml      ─┐
  knowledge/px4/facts.yaml        ─┤ 解析 + 校验（必填/算子白名单/表达式合法性）
  knowledge/px4/meta/** 与 topic-overrides.yaml   ─┤
  engine/operators.py             ─┤
  engine/rule_engine.py           ─┤
  engine/report_data.py           ─┘
        ↓ 生成的产物（提交进仓库）
  web/workers/pyodide-px4log-engine.ts   ← Python 源码，内联 __RULES__/__FACTS__/__TOPICS__ 的 JSON 字面量
  web/workers/fault-kb.generated.json
        ↓ 浏览器运行时
  Web Worker + Pyodide  →  执行 Python：基础事实层 → 匹配 firmware/airframe → 取字段
                            → 调 operators.py 的 fn → 受限表达式求值 → 发射 finding
```

关键点：

1. **浏览器里不存在 YAML 解析器**。YAML 在构建期被转成 JSON 字面量内联进 Python，所以：零额外依赖、
   零运行时解析开销、离线也能跑。
2. **表达式求值全在浏览器端**，但只用 Python 标准库 `ast` 做白名单求值——Pyodide 自带，
   不需要新 wheel。
3. **校验全在构建期**：写错的经验（缺 `airframe`、算子名拼错、表达式引用未声明变量）
   在你 `pnpm build:kb` 时就失败，**根本进不了浏览器**，不会等到用户端才炸。
4. **不采用"浏览器直接读 YAML"**：那要多带一个 JS YAML 解析器、每次加载解析 20+ 个文件，
   而且丢掉构建期校验（错误延迟到用户端）。构建期编译在这里是明确更优的选择。
5. 隐私口径不变：经验产物随站点发布，日志解析仍全部在本机。

> 这条链路最近刚验证过：上一轮知识收口重构就是这么把故障库 YAML 送进 Pyodide 的，
> 5 个真实日志回归与浏览器端上传均已跑通。

生成的 Python 大致长这样（`__RULES__` 等占位符在构建期被替换成 JSON 字面量）：

```python
# web/workers/pyodide-px4log-engine.ts 里的 Python（自动生成，勿手改）
import json, ast
import numpy as np
from pyulog import ULog

RULES      = json.loads(r'''__RULES__''')       # 由 rules/*.yaml 编译而来
GUARDS     = json.loads(r'''__GUARDS__''')      # 由 guards/*.yaml 编译而来
TOPICS     = json.loads(r'''__TOPICS__''')      # meta/<tag>.json 与 topic-overrides.yaml 合并编译而来
FAULT_KB   = __FAULT_KB__                       # 由 fault-kb.yaml 编译而来

# ── 预定函数（operators.py 内联）──
def fn_mean(vals, **kw):  ...
def fn_rss_mean(vals, **kw):  ...
# ...

# ── 受限表达式求值（白名单，不用 eval）──
_ALLOWED = (ast.Expression, ast.BoolOp, ast.Compare, ast.BinOp, ast.UnaryOp,
            ast.Name, ast.Load, ast.Constant, ast.And, ast.Or, ast.Not,
            ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.Eq, ast.NotEq,
            ast.Add, ast.Sub, ast.Mult, ast.Div, ast.USub)
def eval_expr(expr, env):
    tree = ast.parse(expr, mode="eval")
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED):
            raise ValueError("表达式中含不允许的语法：%s" % type(node).__name__)
    return eval(compile(tree, "<rule>", "eval"), {"__builtins__": {}}, env)   # 已白名单，无属性/下标/调用

# ── 框架主循环 ──
for rule in RULES + GUARDS:
    if not match_version(rule["firmware"], FW) or not match_airframe(rule["airframe"], vehicle_type):
        continue
    if rule.get("requires") and not has_topics(rule["requires"]):
        skipped(rule["id"], "缺少依赖 topic"); continue
    env = {}
    for node in rule["compute"]:        # 数据流：逐节点执行，输出命名进 env
        args = [read_or_env(a, env) for a in node["in"]]   # topic.field 或前序变量
        if any(a is None for a in args):
            break
        res = OPERATORS[node["op"]](*args, **node)         # 多输入
        for name, val in zip(node["out"], res):            # 多输出
            env[name] = val
    for trig in rule["triggers"]:           # 自上而下，命中第一条
        if eval_expr(trig["expr"], env):
            emit(rule, trig, env)           # 复用现有 add()，产出 finding / guard_tag
            break
```

这套跑起来**只需要 Pyodide 自带的 numpy + ast + json**，不需要新增任何第三方 wheel。

## 一条经验的完整画像（分层 schema）

### 第 1 层：身份与归属 —— 让经验可被引用、归属、分发

| 字段 | 为什么必须有 |
| --- | --- |
| `id` | 稳定标识，即 `finding.ruleId`，被故障库 / 白名单 / 报告引用 |
| `name` | 人读的名字 |
| `version` | 经验自身版本；规则市场分发与更新需要 |
| `category` | 分类（vibration/power/ekf/gps…），UI 分组与筛选 |
| `status` | `draft`/`experimental`/`stable`/`deprecated`；新经验先观察期，可灰度 |
| `author` | 分成主体（70/30 必须有署名与收款对象） |
| `license` | CLAUDE.md 版权红线：只收录宽松许可 |
| `changelog` | 经验演进史；改阈值要留痕 |

### 第 2 层：适用范围 —— 比「固件 + 机架」更细的边界

| 字段 | 为什么必须有 |
| --- | --- |
| `firmware` | 适用固件（`any` \| `">=1.15"` \| `"<1.15"` \| `">=1.14,<1.15"`） |
| `airframe` | 适用机架（`any` \| `[rotary_wing, fixed_wing, vtol, rover]`） |
| `phase` | 只在某些飞行阶段判定（与 `firmware`/`airframe` 并列的第三个适用轴）。节点级的 `scope.phase` 同名：同一个概念、更窄的作用域 |
| `min_samples` | 样本不足不出结论，抗小样本误报 |
| `requires` | **数据依赖**：缺哪些 topic/字段就 `skipped`。这是现在命令式 `skipped()` 的声明式版本——声明出来后不会再漏 |
| `excludes_if` | **反向证据**：命中这些标签/条件时本条失效。故障库已有 `exclude_tags`，经验层一直缺 |

### 第 3 层：计算（数据流）—— 支持多输入 / 多输出 / 可串联

原设计「一个变量 ← 一个字段 + 一个函数」不够用：**四元数转欧拉角是 4 进 3 出**，
姿态误差还要把 `vehicle_attitude` 与 `vehicle_attitude_setpoint` **跨 topic 联合输入**，
再串到 `p99` / `zero_cross_hz`。所以 `compute` 是一串**算子节点**，
按顺序执行成数据流；节点输出命名进环境，后续节点与 `triggers` 都能引用：

```yaml
compute:
  # ① 单字段 → 单变量（最常见，短写法）
  - {out: vibe, from: vehicle_imu_status.accel_vibration_metric, op: mean, per_instance: worst}

  # ② 多字段 → 一个向量变量
  - {out: q_att, from: [vehicle_attitude.q_0, vehicle_attitude.q_1,
                        vehicle_attitude.q_2, vehicle_attitude.q_3], op: read}

  # ③ 多输入 → 多输出：四元数 → 欧拉角（4 进 3 出）
  - {op: quat_to_euler, in: [q_att], out: [roll_deg, pitch_deg, yaw_deg], unit: "°"}

  # ④ 跨 topic 联合输入 → 单输出（姿态指令也是四元数，同一算子复用）
  - {out: q_sp, from: [vehicle_attitude_setpoint.q_d_0, vehicle_attitude_setpoint.q_d_1,
                       vehicle_attitude_setpoint.q_d_2, vehicle_attitude_setpoint.q_d_3], op: read}
  - {op: quat_to_euler, in: [q_sp], out: [roll_sp, pitch_sp, yaw_sp], unit: "°"}
  - {op: angle_diff_deg, in: [pitch_deg, pitch_sp], out: pitch_err, unit: "°"}

  # ⑤ 串联：对上一步的输出做时序统计（带作用域）
  - {op: p99, in: [pitch_err], out: p99_err, scope: {when: "armed and phase == 'maneuver'"}}
  - {op: zero_cross_hz, in: [pitch_err], out: osc_hz, scope: {when: "armed and phase == 'maneuver'"}}

triggers:
  - expr: "p99_err >= 30 or (p99_err >= 15 and osc_hz >= 4)"
    severity: critical
```

要点：

- **`from:` 与 `in:` 是同一个东西**：可以写 `topic.field`（引擎自动读取，含固件版本回退与
  `scope`/`filter`），也可以写前面节点产出的**变量名**。这就是"串联"的表达方式。
- **`read`** 是显式的取数算子（把多字段打包成向量）；单字段可省略，用 `from:` 短写法。
- **多输出**：`out: [a, b, c]` 全部命名进环境，`triggers` 只引用需要的那个
  （四元数→欧拉角三个角都进环境，只有 `pitch_deg` 被用到也没关系）。
- **算子自带签名**，构建期做 arity 校验：

  ```python
  # operators.py
  @operator(in_arity=1, out_arity=3, out_names=["roll_deg", "pitch_deg", "yaw_deg"])
  def quat_to_euler(q): ...          # 4 元输入向量 → 3 个角

  @operator(in_arity=1, out_arity=1)
  def p99(x, *, scope=None): ...     # 1 进 1 出

  @operator(in_arity=2, out_arity=1)
  def angle_diff_deg(a, b): ...      # 2 进 1 出
  ```

  规则里写成 `in: [q_att], out: [...]` 而算子声明是 `in_arity=1` 对不上 → `pnpm build:kb` 直接失败。
  **多输入/多输出不会被写成隐式约定，而是被签名强制校验。**
- `out` 命名的变量在报告里可作为**中间量追溯**（校准阈值时能看到"欧拉角算出来是多少"），
  这也是调试一条经验是否正确的抓手。
- **`scope` 只有一种写法**：`when: "<样本级表达式>"` + 窗口参数（`skip_first_s` / `tail_frac`），
  不再另设 `armed:` / `phase:` 之类的语法糖——同一个意思只能有一种写法，
  否则规则文件会分出两派风格。`armed`、`nav_state`、`timestamp`、`phase` 都是样本级内置变量，
  直接写在 `when` 里即可（见「内置变量」一节）。

### 第 4 层：判定 —— 表达式触发，但要带上「怎么用这个结论」

```yaml
triggers:
  - expr: "vibe >= 9.81"          # 满足表达式即触发
    severity: critical            # critical | warning | info
    confidence: high              # high | medium | low —— 报告里区分"确诊/疑似"
    title: "高频振动严重超标（IMU #{instance}）"
    suggestion: "..."
    next_action: "落地后先做桨叶目视与电机手感检查，再复飞"
    safety: "未排查振动前禁止继续大机动"      # 安全约束（CLAUDE.md 红线：不给致炸机建议）
```

`confidence` 与 `safety` 是现在完全没有的：报告里所有结论长得一样严重，
而实际上"电压实测低于 3.55V"是硬证据，"姿态误差偏大"是疑似。

### 第 5 层：输出与溯源 —— 让结论可追、可查、可画

```yaml
emit:
  fault_tags: [high_vibration]    # 喂故障库的异常标签
  related_faults: [F001]          # 经验 ↔ 故障模式双向可查
  doc: https://docs.px4.io/...
  field_text: "vehicle_imu_status.accel_vibration_metric(均值)"
  stats_keys: [imuAccelVibrationMean]   # 写入 stats 的键（UI 表格靠它）
  llm_hint: "振动是机械问题的强指示；先排除机械再怀疑参数"   # 给 LLM 的解释要点
```

`stats_keys` 现在是散在代码里的 `stats[...] = ...`，声明出来后 UI 与报告才知道画什么；
`llm_hint` 把现在混在 SYSTEM_PROMPT 与 suggestion 里的解释要点归位到经验本身。

### 第 6 层：可信度与校准 —— 把「暂定/误报率」变成机器可读

```yaml
thresholds_source:
  vibe_warn: {kind: documented, ref: "Flight Review 色带 0.5g", value: 4.905}
  clip_warn: {kind: provisional, samples: 5}
  cell_crit: {kind: calibrated, samples: 12, ref: "2026-09 校准批次"}
calibration:
  status: provisional             # provisional | calibrated
  sample_size: 5
  false_positive_rate: null       # 冲刺目标 <10%，这里变成可度量字段
  last_calibrated_at: 2026-09-14
```

这一层直接解决当前最大的缺口：15 条里大量标「暂定」，但那是给人看的注释，
系统无法回答"还有多少条经验没校准""哪条经验误报率高"。

### 第 7 层：可验证 —— 经验自带正例/反例（规则市场的前提）

```yaml
fixtures:
  positive:
    - {log: tools/calibrate/logs/39f26cce-*.ulg, expect: {severity: warning, fault_tags: [high_vibration]}}
  negative:
    - {log: tools/calibrate/logs/95b077d9-*.ulg}
```

没有这一层，第三方的规则无法被验证，70/30 分成也就无从谈起；
有了它，`compare_baseline.py` 可以退化成"跑每条经验自带的 fixtures"。

## 完整示例（一条经验的全文）

> ⚠️ **这一节是最初设计的 7 层 schema**，里面的 `phase` / `min_samples` / `excludes_if` /
> `confidence` / `safety` / `thresholds_source` / `calibration` / `fixtures` 都**没有落地**
> （哪些落了、为什么没落见开头那张「与设计的落地差异」表）。**当前真实写法**看站内
> [规则编写参考](/guide/rule-schema)，或直接读 `rules/vibration.yaml`——
> 顶层字段只有 10 个，`compute` 是表达式，取数修饰写在 `ref(...)` 上。

```yaml
# knowledge/px4/rules/vibration.yaml
id: px4-vibration
name: 高频振动 / IMU 削波
version: 1.3.0
category: vibration
status: stable
author: {name: NextPilot 内置}
license: CC-BY-4.0
changelog:
  - {version: 1.3.0, date: 2026-09-14, note: "削波阈值按 5 份真实日志校准"}

firmware: ">=1.14"
airframe: any
phase: [takeoff, hover, maneuver, fw_cruise, cruise]
min_samples: 50
requires:
  any_of: [vehicle_imu_status]
excludes_if:
  tags: [collision_detected]

compute:
  - {out: vibe, from: vehicle_imu_status.accel_vibration_metric, op: mean,
     per_instance: worst, unit: m/s^2,
     fallback: {from: [vehicle_imu_status.stddev_accel_x_m_s2,
                       vehicle_imu_status.stddev_accel_y_m_s2,
                       vehicle_imu_status.stddev_accel_z_m_s2], op: rss_mean}}
  - {out: clip, from: [vehicle_imu_status.accel_clipping_0,
                       vehicle_imu_status.accel_clipping_1,
                       vehicle_imu_status.accel_clipping_2],
     op: delta_last_first, per_instance: worst, unit: count}

triggers:
  - expr: "vibe >= 9.81"
    severity: critical
    confidence: high
    title: "高频振动严重超标（IMU #{instance}）"
    suggestion: "Flight Review 红色区间（>9.81 m/s^2）。结合故障库排查桨叶/电机/机架/减震。"
    next_action: "落地后先做桨叶目视与电机手感检查，再复飞"
    safety: "未排查振动前禁止继续大机动"
  - expr: "vibe >= 4.905"
    severity: warning
    confidence: medium
    title: "高频振动偏大（IMU #{instance}）"
    suggestion: "橙色区间（4.905~9.81）。排查桨叶动平衡/电机/IMU 减震。"
  - expr: "clip >= 1000"
    severity: critical
    confidence: high
    title: "加速度计削波严重（IMU #{instance} 轴 #{axis}，累计 {clip} 次）"
  - expr: "clip > 0"
    severity: info
    confidence: low
    title: "偶发加速度计削波（IMU #{instance}，累计 {clip} 次）"

emit:
  fault_tags: [high_vibration]
  related_faults: [F001]
  doc: https://docs.px4.io/main/en/assembly/vibration_isolation.html
  field_text: "vehicle_imu_status.accel_vibration_metric(均值)"
  stats_keys: [imuAccelVibrationMean, imuAccelClippingCountMax]
  llm_hint: "振动是机械问题的强指示；先排除机械再怀疑参数"

thresholds_source:
  vibe_warn: {kind: documented, ref: "Flight Review 色带 0.5g", value: 4.905}
  vibe_crit: {kind: documented, ref: "Flight Review 色带 1g", value: 9.81}
  clip_warn: {kind: provisional, samples: 5}
  clip_crit: {kind: provisional, samples: 5}
calibration:
  status: provisional
  sample_size: 5
  false_positive_rate: null
  last_calibrated_at: 2026-09-14

fixtures:
  positive:
    - {log: tools/calibrate/logs/39f26cce-337a-4f83-a967-45352f6e1e82.ulg,
       expect: {severity: warning, fault_tags: [high_vibration]}}
  negative:
    - {log: tools/calibrate/logs/95b077d9-d719-45ea-bf91-5926170cbc52.ulg}
```

**统一用 YAML**（经验、guard、字典同一格式，详见下方「格式结论」一节）。

## 必填 vs 可选（防"空洞经验"）

- **必填**：`id` `name` `firmware` `airframe` `compute`(≥1 个算子节点，每个节点的
  `in`/`out` 数量须与算子签名一致) `triggers`(≥1，每项 `expr/severity` 齐全) `emit`
- **`firmware`/`airframe` 即使不限也必须显式写 `any`** —— 不允许"没写就是任意"的隐式豁免，
  隐式豁免正是空洞条目的入口
- 可选但强烈建议：`requires` `min_samples` `confidence` `safety` `thresholds_source`
  `calibration` `fixtures` —— 缺失时构建成功但打警告（列出"未声明数据依赖的经验"清单）
- **删除 `px4-thresholds.toml`**：数值只存在于某条完整经验里；
  guard 也写成完整经验（`guards/*.yaml`，`emit.guard_tag`），于是"全局参数"概念消失

## 内置变量与内置函数（不用声明，直接引用）

基础事实层已经算出来的量，规则里**直接引用**，不必写进 `compute`。
但必须**分层**——样本级的量只能在逐样本求值处用，日志级的量才能在聚合后的 `triggers.expr` 里用：

| 层级 | 用在哪 | 可用变量 |
| --- | --- | --- |
| **样本级**（逐样本求值） | `scope.when` / `filter` | `armed`（布尔）、`nav_state`、`timestamp`、`t_sec`（相对起点秒）、`phase`（该样本所处阶段）、`hagl` |
| **日志级**（聚合后求值） | `triggers[].expr` / `requires` / `excludes_if` | 下列全部 |
| **变量级** | `triggers[].expr` | `compute` 里 `out:` 声明的名字 |

**日志级内置变量**：

| 变量 | 含义 |
| --- | --- |
| `firmware` `fw_major` `fw_minor` `fw_profile` | 固件版本对象 / 主次版本号 / `px4-1.15+`\|`px4-legacy` |
| `airframe` `vehicle_type` | 机架字符串（`rotary_wing`…）/ PX4 原始码（1/2/3/4） |
| `is_rotary_wing` `is_fixed_wing` `is_vtol` `is_rover` | 布尔别名，比 `airframe == 'fixed_wing'` 好读 |
| `duration_s` `armed_s` | 日志总时长 / armed 总时长（`armed_s` 现由 guard 用） |
| `dropout_ms` `restart_detected` | 丢包总时长 / 是否中途重启 |
| `phases` | 本次日志出现过的阶段集合（`'hover' in phases`） |
| `hardware` `sys_name` | `ver_hw`（如 `PX4_FMU_V6X`）/ 飞控名 |
| `tags` `guard_tags` | 已命中的异常标签 / 数据质量标签集合 |
| `armed_intervals` | armed 区间列表（供 `in_armed()` 用） |

**内置函数**（并入表达式白名单）：

> ⚠️ **这一节也是最初设计**：`has_topic()` / `in_armed()` / `phase_at()` 与 `scope` / `filter` /
> `excludes_if` **都没有落地**。现在的表达式里只能调**算子**（见 `engine/operators.py`）加
> `ref(...)`（带修饰的取数）与 `_try(...)`（容错求值）；样本级筛选由算子自己的参数承担
> （如 `masked_any_in` / `active_window_mask` 收 `armed_intervals` 与 `codes`）。

| 函数 | 用途 |
| --- | --- |
| `has_topic('vehicle_imu_status')` | 数据依赖判定（`requires` 亦可写成 `any_of: [...]`） |
| `in_armed(t_sec)` | 某时刻是否处于 armed 区间 |
| `phase_at(t_sec)` | 某时刻的飞行阶段 |
| `count(x)` `len(x)` `abs/min/max/round` | 通用数学（白名单内，非任意调用） |

**实际写法**（把现在命令式的 armed 掩码 / 阶段筛选收口）：

```yaml
compute:
  - {out: spread, from: actuator_motors.control_0..11, op: masked_spread,
     scope: {when: "armed and nav_state in hover_ish"},   # ← 直接引用内置变量
     min_channels: 4}
  - {out: sag, from: battery_status.voltage_cell_v, op: head_tail_median_diff,
     scope: {when: "armed", skip_first_s: 5}}
  - {out: rem, from: battery_status.remaining, op: min,
     filter: {when: "remaining >= 0"}}                    # -1 表示未知，过滤掉

requires:
  any_of: [vehicle_imu_status]
excludes_if:
  when: "'collision_detected' in tags or restart_detected"
triggers:
  - expr: "spread >= 0.15 and is_rotary_wing"
    severity: critical
```

**`topics/` 是字段字典：一 tag 一目录、一个 topic 一个 YAML，对照 uORB `msg/*.msg`**
（与 PX4 上游一一对应，便于同步与评审；`NAV_*` 与 failsafe 名称映射的重复定义合并成一份，
同时收编 `pick_versioned` 那套散在代码里的字段候选顺序）

下面是**合并后**的样子（`type`/`values` 由上游 `.msg` 生成，`groups` 来自人工的 `topic-overrides.yaml`）：

```yaml
# meta/<tag>.json 里 topics.vehicle_status（与 topic-overrides.yaml 的合并视图）
topic: vehicle_status
msg: VehicleStatus.msg            # 对应 PX4 原始定义，便于对照同步
fields:
  nav_state:
    type: enum
    values:
      0: Manual        1: Altitude      2: Position      3: Mission
      4: Hold          5: Auto.RTL      6: PositionSlow  8: AltitudeCruise
      10: Acro         12: Descend      13: Termination  14: Offboard
      15: Stabilized   17: Auto.Takeoff 18: Auto.Land    20: Auto.Loiter
      21: Orbit        22: Auto.PrecisionLand
    groups:                       # 命名集合，可直接在表达式 / phase 里引用
      takeoff:    [17, 22]
      hover_ish:  [2, 4, 6, 14, 21]
      maneuver:   [0, 1, 10, 15]
      fw_cruise:  [3, 8]
      land:       [18, 20]
      rtl_descend: [5, 12, 13]
      failsafe_nav: {5: AUTO_RTL, 12: DESCEND, 13: TERMINATION, 18: LAND}
  vehicle_type:
    type: enum
    values: {1: rotary_wing, 2: fixed_wing, 3: rover, 4: airship}
  arming_state:
    type: enum
    values: {0: INIT, 1: STANDBY, 2: ARMED, 3: STANDBY_ERROR, 4: SHUTDOWN, 5: IN_AIR_RESTORE}
    note: 引擎以 arming_state == 2 作为 armed 区间起点
  failsafe:        {type: bool, note: 失效保护已激活}
  rc_signal_lost:  {type: bool}
  data_link_lost:  {type: bool}
  engine_failure:  {type: bool}
  mission_failure: {type: bool}
  vtol_in_trans_mode: {type: uint8, note: 非 0 表示处于 VTOL 转换}
  timestamp:       {type: uint64, unit: us}
```

```yaml
# meta/<tag>.json 里 topics.vehicle_gps_position
fields:
  eph:
    type: scalar
    aliases: [eph_m]              # 新旧命名变体，引擎自动回退
    unit: mm
    scale: 0.001                  # 换算为 m 后再比阈值
    note: 水平位置误差
  satellites_used: {type: uint8, unit: 颗}
  lat:  {type: int32, unit: degE7}
  lon:  {type: int32, unit: degE7}
```

```yaml
# 1.15 之前的 tag 的 meta/<tag>.json 里才有 topics.estimator_status
topic: estimator_status
msg: EstimatorStatus.msg
fields:
  states:
    type: array
    slots: {10: gyro_bias_x, 11: gyro_bias_y, 12: gyro_bias_z}
    note: 1.15 前陀螺零偏藏在 EKF 状态里
  filter_fault_flags:
    type: bitmask
    bits:
      0: 速度融合拒绝   1: 水平位置融合拒绝  2: 垂直位置融合拒绝
      3: 磁罗盘X        4: 磁罗盘Y         5: 磁罗盘Z
      6: 航向          7: 空速            8: 侧滑
      9: 离地高度      10: 光流X          11: 光流Y
    groups:
      critical_union: [0, 1, 2, 3, 4, 5]   # 引擎只对这几位报 critical
      benign:         [10]                  # 视觉拒绝：未用 VIO 时正常
  innovation_check_flags: {type: bitmask, note: 位定义同上（1.15 前的创新检验）}
```

```yaml
# 1.15 及之后的 tag 的 meta/<tag>.json 里才有 topics.estimator_sensor_bias（零偏拆成独立 topic）
topic: estimator_sensor_bias
fields:
  gyro_bias: {type: array, unit: rad/s, note: 可直读陀螺零偏}
```

```yaml
# meta/<tag>.json 里 topics.battery_status
topic: battery_status
fields:
  voltage_cell_v: {type: array, unit: V, note: 索引即电芯序号，0 表示未接}
  cell_count:     {type: uint8}
  remaining:      {type: scalar, unit: "0..1", invalid: -1, note: -1 表示未知，判定前需过滤}
```

**字段级规则**（都在 topic 文件内声明，框架自动执行）：

| 声明 | 作用 |
| --- | --- |
| `msg` | 对应的 PX4 `.msg` 文件名，便于与上游对照同步 |
| `aliases` | 字段命名变体（`eph` ↔ `eph_m`），引擎自动回退 |
| `scale` / `unit` | 单位换算；声明后阈值直接按换算后的单位写 |
| `values` / `bits` / `slots` | 枚举、位掩码、数组槽位的含义 → finding 里显示 `AUTO_RTL` 而不是 `5` |
| `groups` | 命名集合，可在 `scope.when` / `phase` 里按名引用，避免码值散落 |
| `invalid` | 无效值标记（如 `remaining = -1`），框架在判定前过滤 |
| `msg` | 对应的 PX4 `.msg` 文件名，便于与上游对照同步 |

构建期校验：规则里引用的每个 `topic.field` **必须已在 `topics/` 登记**
（否则报"未登记字段"并失败）；表达式/`phase` 里引用的集合名必须存在于某个 `groups`。
规则里 `phase: [hover]` 也按 `nav_state.groups` 展开——"阶段判定"与"scope 筛选"
用同一份码值定义，不可能再走散。

## 预定函数清单

| 类别 | 函数 |
| --- | --- |
| 取数 | `read`（多字段打包成向量，如四元数 `[q_0..q_3]`） |
| 标量统计 | `mean` `max` `min` `median` `p95` `p99` `std` `range` `abs_max` `rms` `rss_mean` |
| 累计 / 计数 | `delta_last_first` `count_above(x)` `count_where(expr)` `ratio_above(x)` `ratio_equal_to(x)` |
| 位掩码 | `bit_any(bits)` `bit_all(bits)` `bit_value` |
| 数学变换（多进多出） | `quat_to_euler`(4→3) `angle_diff_deg`(2→1) `vec_norm`(n→1) `quat_error_p99`(2→1) |
| 时序 | `head_tail_median_diff` `tail_median(frac)` `slope` `zero_cross_hz` `adjacent_rate_max` `adjacent_rate_count(limit)` |
| 区间 / 掩码 | `masked_spread` `masked_absmax_range` `max_tilt_in_interval` `edge_true_count` `edge_in_set_count` |
| 引擎事实 | `armed_duration_s` `duration_s` `total_duration_ms`（guard 用） |
| 修饰 | `per_instance` `scope{armed,phase,skip_first_s,tail_frac}` `filter` `scale` |

每个算子在 `operators.py` 用 `@operator(in_arity=…, out_arity=…, out_names=[…])` 注册签名，
**构建期按签名校验规则里 `in`/`out` 的数量与命名**——多输入/多输出不靠约定，靠校验。

## 故障库与规则的分工（`fault-kb.yaml` 保留，但要划清边界）

有人会问：既然规则文件已经能写"建议/下一步"，`fault-kb.yaml` 还有必要吗？**有必要**，
因为它与规则是**两种不同的知识**、且是**多对多**关系：

- **多对多**：F001（高频振动）会被三条规则指向（振动均值、stddev、削波）；合并进规则就要
  复制三份根因清单——正是要消灭的重复
- **白名单机制**：CLAUDE.md 铁律"LLM 根因只能出自命中的故障库条目"，这个白名单必须是
  **可枚举的独立集合**才能统一校验；散在各规则里就落不了地
- **独立演进 / 独立贡献**：改检测逻辑与改根因排查步骤是两拨人、两个节奏；CLAUDE.md 把
  "检查规则 / 阈值逻辑 / **故障模式知识**"列为三种并列的可贡献物——合并会让"只贡献故障
  模式知识"的人无处安放，而这正是规则市场分成的主要供给

### 职责边界（互不重复）

| 文件 | 只回答 | 归谁维护 |
| --- | --- | --- |
| `rules/*.yaml` | **怎么发现**：读哪些 `topic.field`、用什么算子、满足什么条件触发 | 检测 / 数据工程 |
| `fault-kb.yaml` | **发现之后意味着什么**：可能根因（按排查优先级）、排查步骤（由简到繁）、风险等级、禁忌 | 领域 / 故障分析 |
| `meta/<tag>.json` | 字段与参数字典：**一 tag 一份**，`topics` 由 uORB `.msg` 生成、`parameters` 由 `parameters.json` 生成 | 跟固件版本的人 |

**去重动作**：规则里现在那些"结合故障库 F001 排查桨叶/电机"的文案要删掉，规则只留
`emit.related_faults: [F001]`；根因与排查步骤只存在于故障库。规则侧仅保留与该阈值直接
相关的即时建议（`suggestion` / `next_action` / `safety`）。

### 双向校验（把两个文件接起来，避免各写各的）

构建期强制检查：

1. 每条规则 `emit.fault_tags` 里的标签，**必须能被某个故障库条目消费** → 否则报"无知识
   支撑的标签"
2. 每个故障库条目的 `trigger_tags`，**必须能被某条规则产出** → 否则报"永远命不中的死条目"
3. 规则 `emit.related_faults` 引用的 F0xx 必须存在

这三条让"两份文件是否会不一致"变成机器可查，孤儿标签与死条目当场暴露。

**不做"故障库内联进规则"**：那会把多对多压成一对多，制造三份重复，并让白名单机制失效。

## 表达式安全（不用 eval）

构建期做受限校验（变量必须先声明、只允许 `+ - * /`、比较、`and/or/not`、括号、白名单函数
`abs/min/max/round`），运行期用 Python `ast` 白名单求值，**不调用 `eval/exec`**。

## 工具：从 PX4 上游同步 uORB msg 与 parameters.json → 一 tag 一目录

`tags/` 不应手写（字段随固件版本漂移，手写必然脱节），而是**从上游自动同步**：

```bash
# 拉取指定 release tag 的 msg 与 parameters.json，生成/更新 meta/<tag>.json
python tools/px4/sync_px4_msg.py --tags v1.13.3,v1.14.4,v1.15.0,v1.16.0,main

# CI / 本地校验：只比对不写入，若上游已变则非零退出
python tools/px4/sync_px4_msg.py --check
```

**落盘结构：缓存与产物都按 tag 组织**——一个 tag 一个文件夹，里面的东西都属于该版本。
不在"按 topic"与"按 tag"两套维度之间来回映射（`parameters.json` 天然是按 tag 一份，
msg 也放同一维度，最简单）：

```text
.cache/px4/<tag>/                 # 原始素材，**不入库**，可随时删
  msg/*.msg                       # 该 tag 的全部 uORB .msg（约 200 个）
  parameters.json                 # 该 tag 的参数元数据

knowledge/px4/               # 知识产物，入库
  tags.yaml                       # tag 顺序与版本映射
  meta/v1.15.0.json                    # 该版本全部元数据：topics + parameters（生成物）
  meta/v1.16.0.json ... meta/main.json # 三份合计约 1.5MB
  topic-overrides.yaml            # 跨 tag 的人工语义层（见下）
```

**版本适用性不用额外字段**：每个 tag 目录自带该版本的完整字段定义，
"这个固件有没有这个字段"就是"该 tag 的 `topics/` 里有没有它"——事实即结构。

```yaml
# tags.yaml —— 引擎用日志的 ver_sw_release 找到 ≤ 它的最大 tag，再加载那个目录
tags:
  - {tag: v1.13.3, version: "1.13.3"}
  - {tag: v1.14.4, version: "1.14.4"}
  - {tag: v1.15.0, version: "1.15.0"}
  - {tag: v1.16.0, version: "1.16.0"}
  - {tag: main,    version: null}      # 开发主干，当作最新
```

**跨 tag 的人工语义层 `topic-overrides.yaml`**（上游生成不出来的部分，跨 tag 共享一份）：

```yaml
aliases:                     # 字段改名 → 引擎自动回退（跨 tag diff 产出候选，人工确认）
  vehicle_gps_position.eph: [eph_m]
  vehicle_imu_status.stddev_accel_x_m_s2: [stddev_accel_x]
groups:                      # 命名集合 → 可在 scope.when / phase 里按名引用
  nav_state.hover_ish: [2, 4, 6, 14, 21]
  nav_state.failsafe_nav: {5: AUTO_RTL, 12: DESCEND, 13: TERMINATION, 18: LAND}
  filter_fault_flags.critical_union: [0, 1, 2, 3, 4, 5]
invalid:                     # 无效值标记（判定前过滤）
  battery_status.remaining: -1
units:                       # 单位修正（上游注释缺失或不准时）
  vehicle_imu_status.accel_vibration_metric: m/s^2
```

**代价说清楚**：同一 topic 会在多个 tag 目录里各有一份（都是生成物、单文件 1–3KB、
合计约 1–3MB）。换来的是"一 tag 一文件夹、不在两个维度间映射"。若日后觉得体积碍事，
可再加 `--dedupe` 生成模式（完全相同的 topic 抽到共享目录、tag 目录只留差异）——
但那是后续优化，起步以简单为要。

**跨 tag diff 仍会被用到**（产出的是 overrides 的候选，而不是每个 topic 的版本标注）：

- 字段在某 tag 缺失 → 该 tag 的 `topics/` 里就没有它（无需标注）
- 字段改名（`eph` ↔ `eph_m`）→ 自动产出 `aliases` 候选写进 `topic-overrides.yaml`
- 体系拆分（零偏从 `estimator_status.states[10..12]` 拆到 `estimator_sensor_bias.gyro_bias`）→
  **两个 topic 各自一个文件**，天然分离、不重复
- 枚举码值变化 → 以最新 tag 为准，并在 `values` 条目标注起效 tag

**拉取**：每个 tag 下载归档包（`archive/refs/tags/<tag>.tar.gz`，`main` 用
`archive/refs/heads/main.tar.gz`），解出 `msg/`；`parameters.json` 单独下载（PX4 参数元数据由
构建系统生成发布，**可用 URL 在实现时先实测确认**，工具提供 `--params-url` 覆盖 + 缺失时降级
为跳过并告警，不假设某个固定地址长期有效）。已缓存则跳过下载，`--base-url` 可指向镜像。

**两类元数据 → 两份字典**：

| 来源 | 生成 | 用途 |
| --- | --- | --- |
| `msg/*.msg` | `topics/<topic>.yaml` | 日志字段字典（读日志用） |
| `parameters.json` | `params/<group>.yaml` | **参数字典**：名称、类型、默认值、取值范围、单位、适用机型、说明 —— "参数审计"类经验（配置是否合理/是否被改动）的前提 |

参数字典字段精简为：`name / type / default / min / max / unit / reboot_required / airframes / description`。
全量参数有数千条，**构建期内联时只注入被经验引用到的子集**（`--only-used` 亦可在生成时裁剪），
避免把几 MB JSON 塞进 Pyodide。

**解析规则**（uORB `.msg` → `topics/<topic>.yaml`）：

| `.msg` 里的写法 | 生成到 YAML |
| --- | --- |
| `uint64 timestamp` | `fields.timestamp: {type: uint64, unit: us}` |
| `float32 xyz[3]` | `fields.xyz: {type: array, len: 3}` |
| `uint8 NAV_STATE_POSITION = 2` 等常量块 | `fields.nav_state.values: {2: Position, ...}`（按前缀归组） |
| `# 水平位置误差 (m)` 尾部/行内注释 | `fields.eph.note` + 从注释里的 `(m)` 提取 `unit` |
| `# [0] X  [1] Y  [2] Z` 数组槽位注释 | `fields.<name>.slots: {0: X, 1: Y, 2: Z}` |
| `*_flags` / `fault_flags` 类字段 + 位常量 | `fields.<name>.bits: {0: ..., 1: ...}` |
| 引用了另一个 msg（如 `VehicleStatus vehicle_status`） | `type: <msg 名>`，并在文件里保留 `file:` 上游路径 |
| 文件名 `VehicleStatus.msg` | 输出 `topics/vehicle_status.yaml`（PX4 主题为 snake_case） |

**生成物 vs 人工补充**（与现有"生成物不手改"约定一致）：

| 文件 | 性质 | 内容 |
| --- | --- | --- |
| `knowledge/px4/meta/<tag>.json` | **生成物**（提交进仓库） | 该版本字段字典 + 参数字典（一份文件里两块） |
| `knowledge/px4/topic-overrides.yaml` | **人工维护** | 上游没有的语义：`groups`（如 `hover_ish`、`critical_union`）、单位修正、`invalid` 标记（如 `remaining = -1`）、补充 `note` |
| `.cache/px4/<tag>/` | 本地缓存，不入库 | 一个 tag 一个文件夹：`msg/` + `parameters.json` |

构建期把两者合并成最终的 `__TOPICS__`；冲突时 overrides 优先，并在构建输出里提示被覆盖的条目。

**ArduPilot**：其日志结构来自 `LogStructure.h` 的 C 宏（不是 uORB msg），格式完全不同，
本轮**不做**，但工具按"每种上游一个 parser"的结构留出接口
（`sync-apm-logstruct.py` 后续补），避免以后推翻重来。

## 格式结论：统一 YAML，去掉 TOML

拿本 schema 的形态逐条对比后的结论：**经验、guard、字典全部用 YAML，不再保留任何 TOML**。

| 维度 | YAML | TOML |
| --- | --- | --- |
| 对象数组（`compute` / `triggers` 节点） | 一条规则一眼看完 | `[[triggers]]` 把属性块切开，要在文件里上下跳 |
| 深层嵌套（`compute.in/out` + `fallback`） | 自然 | 需子表或行内表，行内表还不能跨行 |
| 中文长文案（`suggestion`、排查步骤） | `\|` 块标量很舒服 | 多行字符串在嵌套表里受限，长句得拆表 |
| 扁平字典（`nav_state` 码值） | 够用 | 略紧凑（唯一优势，差距很小） |
| 评审 / 社区贡献友好度 | 高（CI/K8s 通用语） | 中 |

决定性因素是**形态**：本 schema 是「深层嵌套 + 对象数组 + 中文长文案」，正是 YAML 的主场；
TOML 的优势（扁平键值）恰好是已被否掉的"空洞经验"那种形态。

**工程收益**：`web/scripts/build-knowledge.mjs` 现在维护着**两个自写解析器**（极简 YAML + 极简 TOML），
统一后可以删掉 TOML 解析器，少一处要维护、要测试的代码。

**YAML 的两个真实坑与对策**（必须承认）：

1. 缩进敏感、缩进错误会静默改变语义 → 构建期严格 schema 校验（必填、类型、算子 arity）
2. 类型陷阱（`no`→false、`1.0`→float）→ `expr` 强制字符串类型、阈值强制数值类型，不符即构建失败

若将来真出现一批"纯扁平阈值"的简单经验，那时再为它们单独开 TOML 不迟——当前 schema 已定为嵌套结构，用不上。

## 目录形态

```text
knowledge/px4/
  rules/         # 检查经验（一条一文件）
  guards/        # 数据质量经验（同 schema，emit guard_tag）
  topics/        # 字段字典（生成物）：一 tag 一子目录，<tag>/<topic>.yaml
    v1.15.0/vehicle_status.yaml ...
  params/        # 参数字典（生成物）：一 tag 一文件，<tag>.yaml
    v1.15.0.yaml ...
  tags.yaml      # tag 顺序与版本映射
  topic-overrides.yaml  # 跨 tag 人工语义层：aliases 别名、groups 命名集合、invalid、单位修正
  engine/operators.py   # 预定函数（白名单注册表）
  engine/rule_engine.py # 瘦身为框架：基础事实层 + 加载经验 + 取数 + 算子 + 表达式求值 + 发射（原 ulog_checks.py）
  fault-kb.yaml
  px4-ulog-rules.md
```

> 上图是**最初设计**。实际落地的目录结构与上述设想有几处不同（`guards/` 并入 `rules/` 用
> slot 区分、`topics/`+`params/` 合并成 `meta/<tag>.json`、`tags.yaml` 与
> `topic-overrides.yaml` 未建、文档按受众分进 `design/` `guides/` `reference/` `llm/`）：
> 现状请看站内 [/guide/rule-catalogue](/guide/rule-catalogue) 与
> 站内 /guide/rule-schema，差异清单见本文开头的
> 「实施状态与落地差异」。

`fault-kb.yaml` 保持单文件（故障模式会有几十条）。`topics/` 为生成物（提交进仓库，
便于离线与 CI），人工语义放 `topic-overrides.yaml`；两者在构建期合并，顺带合并现有
`NAV_*` 与 failsafe `{5:"AUTO_RTL",...}` 两份重复定义。

## 实施步骤

- **阶段 0 冻结基线**：`tools/calibrate/dump_baseline.py` 把 5 个日志的完整输出冻结成
  `tools/calibrate/baseline/*.json` 提交（findings 全字段 + tags/guards/phases/checks*）
- **阶段 0.5 同步字段与参数字典**：`tools/px4/sync_px4_msg.py` 按 tag（v1.13.3 / v1.14.4 /
  v1.15.0 / v1.16.0 / main）各建一个文件夹，下载 `msg/` 与 `parameters.json`，生成
  `meta/<tag>.json`（该版本字段字典 + 参数字典）；
  人工补 `topic-overrides.yaml` 的 `aliases` / `groups` / `invalid`
- **阶段 1**：`operators.py` + 框架改造 + 12 条标准型 + 全部 guard 迁移 + `meta/<tag>.json` +
  `build-knowledge.mjs` 必填/表达式校验 + **删掉已无用的 TOML 解析器**（统一 YAML 后只剩一个）；
  `compare_baseline.py` 验等价
- **阶段 2（已完成）**：补时序/掩码类 9 个函数，迁剩余 10 个告警点，引擎侧改为 `engine/rule_engine.py`，原 `ulog_checks.py` 已删除
- **阶段 3（可选）**：`fixtures` 跑通后，回归从"比对整体基线"升级为"每条经验自带正反例"

## 验证

1. **反空洞护栏**：删掉某条的 `airframe` 或 `triggers` → `pnpm build:kb` 必须失败；
   算子名拼错、表达式引用未声明变量同样失败
2. **等价回归（核心）**：`compare_baseline.py` 要求 5 个日志输出与冻结基线逐条逐字段完全相同。
   基线：ce302d3b=9/F004、39f26cce=4/F001·F006·F009、95b077d9=0、两个 sample=0
3. `px4log_engine_runner.py --probe-data` 结构不变
4. `tsc --noEmit` + `pnpm build`；`node tools/browser/check-upload.mjs <ulog> <png>` 浏览器端跑通
5. 抽查：改 `rules/vibration.yaml` 的阈值 → 报告页 finding 文案随之变化

## 风险与边界

- **不是纯配置**：约 10 个告警点仍需时序/掩码算子代码，用 `fn: <函数名>` 写明边界
- **等价性是最大风险**：39 个告警点文案与证据字段必须一字不差，靠阶段 0 基线兜住
- **schema 膨胀风险**：7 层字段很多。因此分"必填 / 可选但建议"，可选缺失只警告不阻塞，
  避免把贡献门槛抬到没人愿意写
- 表达式求值必须严格走 AST 白名单
