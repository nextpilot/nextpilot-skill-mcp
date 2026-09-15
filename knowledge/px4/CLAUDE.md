# 检查规则改为「一条经验一个配置文件」：一条经验的完整画像

> **这是给 AI（Claude Code）读的项目上下文**：改 `rules/*.yaml`、`engine/` 下的算子与框架、
> 或构建脚本前，先按这里的约定来——它记着每条设计决策的动机、
> 与最初设计的落地差异（避免把有意为之当成 bug 改回去）、以及已知缺口。
> 面向人的入口见 `../README.md`（怎么读）与站内 [如何编写一条规则](/guide/knowledge-write-rule)（怎么写经验）。
> 本文件不发布到网站：里面有实施状态、已知缺口与提交记录。

## 实施状态（2026-09-15：已实施）

**已完成**：15 组过程式检查（`ulog_checks.py` 1095 行）→ **32 条自包含经验**（含 4 条数据质量
guard），**73 个通用算子**；`px4-thresholds.toml` 已退场（阈值随各自经验内联）。引擎侧每个
检查块只剩一行 `_run_rules("<slot>")`。6 条真实日志的冻结基线逐字段一致；生成产物真实执行
通过；构建期护栏生效（算子名/入参数量、表达式与文案里的未声明名字、缺 `firmware`/`airframe`、
guard 条件写错名字都会构建失败，而不是进浏览器才炸）。

字段级权威参考（写经验时看这份）：站内 **[如何编写一条规则](/guide/knowledge-write-rule)**（源文件 `content/guide/knowledge-write-rule.md`）；
经验索引（站内页面，构建时生成）：**[/guide/knowledge-rules](/guide/knowledge-rules)**；迁移过程中顺带修掉的 6 处
真实缺陷见提交 `6a081d5` 的说明（最要紧的一条：日志消息级别判据按 ASCII 语义修正后，
`Kill engaged / Flight termination active`、`no barometer found` 这类"冒烟的枪"才浮出来）。

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
- motor_balance：通道数不足（<4 列）与活跃通道不足（<4 个）共用同一条 skip 文案
- airspeed：缺 `airspeed_validated` 与无固定翼巡航段共用同一条 skip 文案

### 版本分支：规则级 `firmware` + 节点级 `when_fw`

同一语义在不同固件里会换 topic / 字段名，所以两级版本条件都要有：

| 层级 | 字段 | 作用 |
| --- | --- | --- |
| 规则 | `firmware: ">=1.15"` | 整条经验是否适用于该日志（不适用则既不 ran 也不产 finding） |
| 节点 | `when_fw: ">=1.15"` | 单个 compute 节点是否执行；不满足就跳过、输出置 `None`，由后续 `coalesce` 选另一支 |

写法示例（`rules/wind-estimate.yaml`，同一物理量的新旧 topic）：

```yaml
compute:
  - {out: n_new, from: estimator_wind.windspeed_north, op: read, when_fw: ">=1.15", optional: true}
  - {out: n_old, from: wind_estimate.windspeed_north, op: read, when_fw: "<1.15",  optional: true}
  - {out: wn, in: [n_new, n_old], op: coalesce, optional: true}
```

这样"哪个固件用哪个字段"就写在经验文件里，人可读、机器可查；需要算子内部处理更复杂
版本差异时（如陀螺零偏的双固件取源、姿态指令 q_d 与 roll/pitch_body 的选源），
把 `fw_minor` 作为算子入参传进去即可（复合算子 `gyro_bias_series` / `att_tracking_stats`）。

**字段校验（`tools/calibrate/lint-rules.py`）按这两级版本条件判定**：对每个引用，取
「规则 `firmware` ∩ 节点 `when_fw`」圈定的版本范围，在该范围的**回归日志实测字段**与
**上游字典**里找，分类为 命中 / 版本错配 / 已声明遗留（`aliases`、`known_legacy`）/ 可疑。
自检过：把 `wind_estimate` 那支错标成 `>=1.15` 会精确报出"仅存在于 1.11"。

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

**怎么验证**：`python tools/calibrate/compare-baseline.py`（6 条日志逐字段比对）、
`python tools/calibrate/check-artifact.py`（生成产物真实执行）、
`python tools/calibrate/lint-rules.py`（字段引用 + 版本错配）、
`python tools/calibrate/probe_rule.py <log.ulg> <rule_id>`（单条经验逐节点诊断）。

---

## 四类经验 → 四种载体

工程师的经验不能整段丢给模型；按性质拆四类、各归其位，Agent 只负责检索 / 组装 / 翻译：

| 经验类型 | 载体 | 谁执行 |
| --- | --- | --- |
| ① 量化阈值（振动多大算异常） | `rules/*.yaml` 的 `compute` + `triggers[].threshold` | 确定性引擎判定，产出标签 |
| ② 故障树（多条件耦合、排查优先级、禁忌） | `px4-fault-kb.yaml` 条目（字段定义见该文件头注释） | 引擎按 标签 / 阶段 / 排除标签 匹配，只把命中条目喂 LLM |
| ③ 推理逻辑（工程师怎么想） | `llm/gjb841-system-prompt.md` | LLM 遵守 |
| ④ 边界 / 禁忌（什么情况下不许下结论） | `rules/*.yaml` 的 `emit.guard_tags` → guard 标签（如 `insufficient_data`） | 引擎先拦（命中即可短路），Prompt 兜底 |

"我这块经验该写成什么"按这张表判断；"我想做 X 去看哪个文件"见 `../README.md` 的导航表。

## Context（为什么做）

现状的反例正是 `px4-thresholds.toml`：

```toml
[cpu]
load_warn = 0.90     # ← 空洞：没名字、没固件、没机架、没字段、没处理、没触发条件
load_crit = 0.95
```

裸数字飘在 TOML 里，看不出属于哪条经验、读哪个 topic 的哪个字段、什么条件下成立。
同时 15 组检查 / 39 个告警点写在 `ulog_checks.py`（1095 行），阈值与实现分离，
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
  knowledge/px4/guards/*.yaml     ─┤ 解析 + 校验（必填/算子白名单/表达式合法性）
  knowledge/px4/facts.yaml        ─┤ 数据绑定与码表（字段名/码值/阶段分组/slot 顺序）
  knowledge/px4/meta/** 与 topic-overrides.yaml   ─┤
  engine/operators.py             ─┤
  engine/ulog_checks.py           ─┘
        ↓ 生成的产物（提交进仓库）
  web/workers/ulog-check-script.ts   ← Python 源码，内联 __RULES__/__GUARDS__/__TOPICS__ 的 JSON 字面量
  web/workers/fault-kb.generated.json
        ↓ 浏览器运行时
  Web Worker + Pyodide  →  执行 Python：基础事实层 → 匹配 firmware/airframe → 取字段
                            → 调 operators.py 的 fn → 受限表达式求值 → 发射 finding
```

关键点：

1. **浏览器里不存在 YAML 解析器**。YAML/TOML 在构建期被转成 JSON 字面量内联进 Python
   （和现在 `__FAULT_KB__` / `__THRESHOLDS__` 完全同一机制），所以：零额外依赖、
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
# web/workers/ulog-check-script.ts 里的 Python（自动生成，勿手改）
import json, ast
import numpy as np
from pyulog import ULog

RULES      = json.loads(r'''__RULES__''')       # 由 rules/*.yaml 编译而来
GUARDS     = json.loads(r'''__GUARDS__''')      # 由 guards/*.yaml 编译而来
TOPICS     = json.loads(r'''__TOPICS__''')      # meta/<tag>.json 与 topic-overrides.yaml 合并编译而来
FAULT_KB   = __FAULT_KB__                       # 由 px4-fault-kb.yaml 编译而来

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
    if not match_firmware(rule["firmware"], FW) or not match_airframe(rule["airframe"], vehicle_type):
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
有了它，`compare-baseline.py` 可以退化成"跑每条经验自带的 fixtures"。

## 完整示例（一条经验的全文）

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

## 故障库与规则的分工（`px4-fault-kb.yaml` 保留，但要划清边界）

有人会问：既然规则文件已经能写"建议/下一步"，`px4-fault-kb.yaml` 还有必要吗？**有必要**，
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
| `px4-fault-kb.yaml` | **发现之后意味着什么**：可能根因（按排查优先级）、排查步骤（由简到繁）、风险等级、禁忌 | 领域 / 故障分析 |
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
python tools/topics/sync-px4-msg.py --tags v1.13.3,v1.14.4,v1.15.0,v1.16.0,main

# CI / 本地校验：只比对不写入，若上游已变则非零退出
python tools/topics/sync-px4-msg.py --check
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
| `knowledge/px4/meta/<tag>.json` | **生成物**（提交进仓库） | 该版本字段字典 + 参数字典（一份文件里两块）|
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
  operators.py   # 预定函数（白名单注册表）
  ulog_checks.py # 瘦身为框架：基础事实层 + 加载经验 + 取数 + 算子 + 表达式求值 + 发射
  px4-fault-kb.yaml
  px4-ulog-rules.md
```

> 上图是**最初设计**。实际落地的目录结构与上述设想有几处不同（`guards/` 并入 `rules/` 用
> slot 区分、`topics/`+`params/` 合并成 `meta/<tag>.json`、`tags.yaml` 与
> `topic-overrides.yaml` 未建、文档按受众分进 `design/` `guides/` `reference/` `llm/`）：
> 现状请看站内 [/guide/knowledge-rules](/guide/knowledge-rules) 与
> 站内 /guide/knowledge-write-rule，差异清单见本文开头的
> 「实施状态与落地差异」。

`px4-fault-kb.yaml` 保持单文件（故障模式会有几十条）。`topics/` 为生成物（提交进仓库，
便于离线与 CI），人工语义放 `topic-overrides.yaml`；两者在构建期合并，顺带合并现有
`NAV_*` 与 failsafe `{5:"AUTO_RTL",...}` 两份重复定义。

## 实施步骤

- **阶段 0 冻结基线**：`tools/calibrate/dump-baseline.py` 把 5 个日志的完整输出冻结成
  `tools/calibrate/baseline/*.json` 提交（findings 全字段 + tags/guards/phases/checks*）
- **阶段 0.5 同步字段与参数字典**：`tools/topics/sync-px4-msg.py` 按 tag（v1.13.3 / v1.14.4 /
  v1.15.0 / v1.16.0 / main）各建一个文件夹，下载 `msg/` 与 `parameters.json`，生成
  `meta/<tag>.json`（该版本字段字典 + 参数字典）；
  人工补 `topic-overrides.yaml` 的 `aliases` / `groups` / `invalid`
- **阶段 1**：`operators.py` + 框架改造 + 12 条标准型 + 全部 guard 迁移 + `meta/<tag>.json` +
  `build-knowledge.mjs` 必填/表达式校验 + **删掉已无用的 TOML 解析器**（统一 YAML 后只剩一个）；
  `compare-baseline.py` 验等价
- **阶段 2**：补时序/掩码类 9 个函数，迁剩余 10 个告警点，`ulog_checks.py` 瘦到约 200 行
- **阶段 3（可选）**：`fixtures` 跑通后，回归从"比对整体基线"升级为"每条经验自带正反例"

## 验证

1. **反空洞护栏**：删掉某条的 `airframe` 或 `triggers` → `pnpm build:kb` 必须失败；
   算子名拼错、表达式引用未声明变量同样失败
2. **等价回归（核心）**：`compare-baseline.py` 要求 5 个日志输出与冻结基线逐条逐字段完全相同。
   基线：ce302d3b=9/F004、39f26cce=4/F001·F006·F009、95b077d9=0、两个 sample=0
3. `run_checks_locally.py --probe-data` 结构不变
4. `tsc --noEmit` + `pnpm build`；`node tools/check-upload.mjs <ulog> <png>` 浏览器端跑通
5. 抽查：改 `rules/vibration.yaml` 的阈值 → 报告页 finding 文案随之变化

## 风险与边界

- **不是纯配置**：约 10 个告警点仍需时序/掩码算子代码，用 `fn: <函数名>` 写明边界
- **等价性是最大风险**：39 个告警点文案与证据字段必须一字不差，靠阶段 0 基线兜住
- **schema 膨胀风险**：7 层字段很多。因此分"必填 / 可选但建议"，可选缺失只警告不阻塞，
  避免把贡献门槛抬到没人愿意写
- 表达式求值必须严格走 AST 白名单
