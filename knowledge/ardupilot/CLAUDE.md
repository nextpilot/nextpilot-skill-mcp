# ArduPilot 知识层（`.bin` / DataFlash）：给 AI 的项目上下文

> **改本目录下的任何文件前先读这一篇**，尤其是"写新规则必须遵守的约定"那一节——
> 里面的每一条都是本轮**实测撞出来的**，不是从文档抄的。
>
> **最重要的两件事，先说：**
>
> 1. **本目录已接线（2026-09），34 条规则进构建产物、跑 `.bin` 时会真的执行。**
>    构建脚本按固件族扫描：`knowledge/<族名>/` 配
>    `knowledge/engine/providers/<族名>.py`，**两边同名即一族**。产物按 `log_type`
>    分组，引擎按 `provider.log_type` 挑自己那一套知识。别把任何族名写回脚本里。
> 2. **全部 34 条的 `status` 是 `draft`，没有一条经过真实 `.bin` 验证。**
>    不要因为"文件里写了阈值"就以为它验证过。验证清单在 `PENDING.md` 的第五节。
>
> 上游来源与偏差记在 `ATTRIBUTION.md`，上游 198 条假设审计逐字保留在 `docs/SOURCES.md`。
> 面向人的入口是 `../README.md`。

## 目录形态，以及和 px4/ 的差异

```
knowledge/ardupilot/
├── facts.yaml          码表 + 规则元数据 + 概览指标（15 个顶层键）
├── PENDING.md          待办：接线清单、占位总表、算子缺口、draft 验证清单
├── CLAUDE.md           本文件
├── ATTRIBUTION.md      上游署名、迁了什么、改了什么
├── docs/SOURCES.md     上游 198 条假设审计（引用文本，逐字保留，不进 prettier）
└── rules/  12 个文件，34 条规则
```

**故意没有的东西**，别当成遗漏去补：

| 缺什么          | 为什么                                                                  |
| --------------- | ----------------------------------------------------------------------- |
| `meta/`         | 没有抓取脚本。缺它 = `field_units` 空、不换算，只告警，不影响跑         |
| `plot/`         | 缺它 = 空曲线数组。构建脚本容忍缺失，不抛错                             |
| `fault-kb.yaml` | `trigger_tags` 必须是引擎真产出过的标签，本轮一条都没验证过，写了就是编 |

不在本表：`llm/`、两个 `*-template.yml` 已提到 `knowledge/` 根下（与固件族无关，
各族共用一份），所以这里不是"缺"，是不该有。

`facts.yaml` 的键也**没有照抄** px4 那份：APM 没有 nav_state 数值轴、没有键值信息消息、
格式自描述因而没有固定消息码表——照抄那 4 个键等于编造。每个键为什么在、为什么不抄，
都写在 `facts.yaml` 的注释里。

## 规则总表（34 条 = 能跑 23 + 占位 11）

| 文件             | 条数 | 说明                                                              |
| ---------------- | ---- | ----------------------------------------------------------------- |
| `vibration.yaml` | 6    | 三轴振动 30/60 m/s² + 10% 持续占比；三 IMU 削波 >=100 转 critical |
| `ekf.yaml`       | 4    | XKF4/NKF4 的 SV/SP/SH/SM 检验比，0.8 警告 / 1.0 拒绝线            |
| `power.yaml`     | 3    | 最低电压、负载压降、电压突降（占位）                              |
| `gps.yaml`       | 3    | 3D 定位、搜星 4/6、HDOP 2.0/5.0                                   |
| `attitude.yaml`  | 3    | 横滚/俯仰峰值 30°；航向占位                                       |
| `events.yaml`    | 3    | ERR 子系统错误、EV 关键事件、MODE 时间线（占位）                  |
| `sensors.yaml`   | 3    | 罗盘健康标志；测距仪与 GPS 的"配置但无数据"（占位）               |
| `config.yaml`    | 3    | 三条参数检查，均占位                                              |
| `motors.yaml`    | 2    | 不平衡与饱和，均占位                                              |
| `timing.yaml`    | 2    | PM 长循环；日志间隙（占位）                                       |
| `compass.yaml`   | 1    | 场强极差比 0.60                                                   |
| `rcin.yaml`      | 1    | 四主通道同时低于 1000us                                           |

占位那 11 条各自缺什么、`PENDING.md` 第二节有逐条的表。要认出一条占位规则：
它有 `conditions.placeholder`，值就是一句"缺什么"的原因文案——引擎跳过本条并原样
显示这句话。2026-09 之前这个机制靠往 `precheck` 里塞字符串字面量实现，现在是一等字段。

## 写新规则必须遵守的约定（本轮踩过的坑）

### `outputs.tag` 一律带 `apm_` 前缀

标签是**两族共用**的命名空间：引擎把所有命中标签塞进同一个 `tags` 集合，
`match_fault_kb()` 也按它匹配故障库。APM 规则原本与 PX4 用同一套裸名
（`high_vibration`、`accel_clipping`…），其中 `high_vibration` 与
`motor_output_unbalance` 跟 PX4 **字面重名**——两族一旦同时接线，就分不清
是哪个固件报的，也没法给两族各配一份故障库。

2026-09-25 起，本目录 34 条规则的 `tag` 全部改成 `apm_` 开头（下划线，
与标签的 snake_case 一致；规则 `id` 那边是连字符 `apm-`，两套分隔符不同，
但各自内部一致）。**新写的规则照此办理。**

直接后果：APM **不再能复用** `knowledge/px4/fault-kb.yaml`（它的 `trigger_tags`
是 PX4 裸标签）。APM 将来要建自己的一份，`trigger_tags` 写 `apm_*`，
理由与排期见 `PENDING.md` 第六节。

### `trigger` 的 `when` / `value` 不是随便写的表达式

`knowledge/engine/engine.py` 的 `_eval_expr` 有一份 AST 白名单：

- 函数调用**只允许 `has_topic('字符串')` 这一个**，且实参必须是字符串字面量；
- 不允许属性访问、下标、推导式；
- 允许 `and` / `or` / 比较 / 四则 / `in [..]` 列表 / f-string。

而 `compute` 走的是 `_eval_compute`（`exec`），算子随便调，**另有两个 when 里没有的放行调用**：
`has_topic()` 与 `param('NAME', default=None)`——后者读飞控参数（见 `PENDING.md` 第四节）。
**所以参数只能在 compute 里取成变量，再拿去 when 比**，直接写
`when: "param('ARMING_CHECK') == 0"` 是**非法**的。
**两者的规则完全不同。**
踩过的实例：compass 里写 `when: "range_ratio > 0.60 and length_of(mag) >= 10"` 是**非法的**，
必须把 `length_of(mag)` 挪进 `compute` 存成变量。

### 一条规则最多出一条 finding

`triggers` 是**自上而下第一条命中即 `break`**。上游"每轴一条 finding"的语义只能靠
**拆成多条规则**复现（`vibration.yaml` 拆成 6 条就是因为这个）。
要一条规则展开成多条，得用 `foreach` + 事件列表算子。

### `conditions.topics` 支持 `A || B`

一项里有多个候选时，**任意一个在日志里就算满足**；项与项之间是"都要有"。
引擎报缺失时给的原因文案是 `"a / b not in log"`。XKF4/NKF4、BAT/CURR 都靠它。

### `ref()` 的位置参数是候选组

`ref("XKF4.SV", "NKF4.SV")` 按顺序取**第一个在日志里存在的**，都没有才返回 `None`。
改名的场合一律用它，没有"这个引用只适用于某版本"这种写法。
`topics` 的 `||` 与 `ref` 的候选组**必须成对写**，只写一处会出现"判过 topic 却取不到数"。

### `conditions` 的判定顺序：占位 → 固件 → 机架 → topics → mode → armed

**占位排在最前**（它说的是"这条还没写完"，与适用范围无关），所以占位规则
**可以**写 `topics` 了——2026-09 之前占位靠 `precheck` 实现，而 precheck 排在
topics **之后**，写了 topics 就会被 `"topic not in log"` 盖掉那句"缺什么能力"。
现在不会了。

### 独立字段要先 `stack_columns` 拼成矩阵

`column_spread_stats` / `column_ratio_events` 这类矩阵算子吃的是"每元素一列"的矩阵。
APM 的 `RCOU.C1..C8` 是八个**独立字段**（不像 PX4 的 `actuator_motors.control` 那样
是数组字段、被 provider 摊平成多列），所以得先 `stack_columns(c1, ..., c8)` 再喂进去；
四轴只有 C1..C4 时其余传 `None`，缺失的列会被跳过而不是占位。
矩阵算子的 `mask` 传 `None` 表示**不筛时段**（上游判"活跃通道"用的是全程均值）。

### 标量加减 / 取模（2026-09 补齐）

- `add` / `sub` / `abs` / `mod`：两个标量进 → 标量出，否则按较短长度逐样本。
  `column_spread_stats` 回的是 **0 起算的列号**，通道号要用 `add(hot, 1)` 换算
  （语言里没有下标，取不了元素）。
- `abs_diff` / `sum_abs` 以前对**标量**输入直接 `IndexError`（实现是 `x[:n]`，标量进
  `np.asarray` 是 0 维数组，切不了），现在两个标量进也能用。

### `field_units` 目前不参与运行期换算

APM 没有 `meta/` 目录，所以规则里**不要写 `unit=`**（查不到源单位只会告警，不换算）。
展示用的单位由规则自己在 `triggers[].unit` 里写死，照抄 `facts.yaml` 的 `field_units` 即可。

### `metrics` 里 `field: [a, b, c]` 是候选字段名

语义是"取第一个存在的字段"，**不是**多列一起算。多列归约必须走规则
（规则里能用 `larger()` 逐样本取大再 `max()` 收成标量）。

## 三条既有事实约束

| 编号   | 事实                                                                                                                                          | 后果                                                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| C1     | provider 的 `get_series()` 把文本列的 float 转换失败吞成 `None`                                                                               | `MSG.Message` / `MODE.Mode` / `STATUSTEXT.Text` / `PARM.Name` 一律取不到                                                            |
| ~~C2~~ | ~~`BUILTIN_VARIABLES` 里没有任何参数类变量~~ 2026-09 已解除：新增 `PARAMS` 内置变量与 `param('NAME', default=None)`，详见 `PENDING.md` 第四节 | 依赖参数的检查已全部转真                                                                                                            |
| C3     | 上游 `FRAME_CLASSES[3]=Octo`（旋翼）与本仓库 `_FRAME_CLASS_MAP[3]=fixed_wing` **冲突**                                                        | `conditions.vehicle` 只能填 `rotary_wing / fixed_wing / unknown`，**不能写 copter/heli/plane**（引擎只做精确比对，写错就静默 skip） |

`facts.yaml` 的 `vehicle_types` 是**按 provider 的实际行为**写的（`3: fixed_wing`），
权威码表放在 `frame_classes`（`3: Octo`）。两表冲突是有意为之，别去"修正"其中一份。
C3 还有个必须在接线时处理的后果：provider 把 heli 也归到 `rotary_wing`，
所以电机平衡那两条将来在直升机上会误报。

## 改动后的自检

本目录下的规则**已进构建**，所以 `pnpm web:build:kb` 会替你校验它们（YAML、必填字段、
group 登记、算子名与签名、`when`/`value` 的白名单、`param()` 的写法）。
它**不校验**的、需要手动过的：

1. YAML 能解析（多文档 `---` 分隔）、必填字段齐全、`group` 已在 `facts.yaml`
   的 `group_order` 与 `rule_meta.by_group` 里登记；
2. 表达式里的算子名确实在 `knowledge/engine/operators.py` 的 `OPERATORS` 里；
3. `when` / `value` 符合上面说的 `_eval_expr` 白名单（`precheck` 已于 2026-09 退役，
   它的活由 `armed` / `mode` / `placeholder` 三个一等字段接走，都不走 `_eval_expr`）；
4. 文案里的 `{占位符}` 都能在 `compute` 产出的变量里找到；
5. 用了 `foreach` 的规则：事件键要写在 `foreach.keys` 里（构建期靠它校验占位符），
   运行期事件字典的键会叠加进文案环境。

`title` / `suggestion` / `field` 走的是 `str.format_map`，**占位符里不能写表达式**
（`{dt_s*1000:.0f}` 会 KeyError）；要算就挪进 `value`（那里是真正的表达式求值）。

另外跑 `tools/engine/check_apm_e2e.py`（已挂在 push 门禁 `check-apm-e2e` 上）：
它用合成 `.bin` 端到端验一遍"认得格式、装对规则、`param()` 取得数、参数规则真发射"。
`PENDING.md` 第六节还留着"把静态规则校验脚本也固化进 CI"这条待办——在它落地之前，
改完规则请手动过一遍上面几项。
