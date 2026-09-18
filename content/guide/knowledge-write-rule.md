---
title: 如何编写一条规则
titleEn: Writing a rule
description: 从必填字段到数据流表达式、触发条件与输出，附算子目录与常见坑。
descriptionEn: Required fields, data-flow expressions, triggers and outputs — plus the operator catalogue and pitfalls.
group: 知识库
groupEn: Knowledge base
order: 11
---

写一条经验的权威参考：字段级定义、数据流（`compute`）语义、触发与输出、内置变量、
算子目录，以及构建期会直接拒绝的写法。内部设计（动机、实施状态与已知缺口）见仓库里的
`knowledge/px4/CLAUDE.md`；现有规则清单：[当前有哪些规则](/guide/knowledge-rules)。

> **本页是这份文档的唯一一份**：原先在 `knowledge/px4/guides/writing-rules.md`，现搬到指南的
> 内容目录，不再由构建生成（同组的「当前有哪些规则」才是构建生成的）。
> 单一事实源是 `knowledge/px4/rules/*.yaml`；标了 `<!-- BEGIN/END -->` 的两张表由
> `python tools/px4/gen_rule_reference.py` 从 `engine/operators.py`（算子）与
> `engine/providers/api.py`（内置变量）注入，改完算子或契约请重跑该脚本，
> 标记之间不要手改，其余内容手维护。

## 0. 一条经验怎么跑起来

```
rules/<经验>.yaml        ──┐
facts.yaml（码表/文案/    ──┤ 构建期校验（字段/算子/表达式/文案、group 是否登记、
  展示口径/group 顺序）    ──┤  facts 键是否齐全、provider 有没有漏实现契约）
engine/operators.py      ──┤                                    ── 产物内联进 Python
engine/providers/*.py    ──┤   ↓                                    ↓
engine/rule_engine.py    ──┘  web/workers/ulog-check-script.ts  →  Pyodide（浏览器）执行：
                              provider 打开日志 → 按 group 顺序跑经验 → 取字段/调算子/
                              求值表达式 → 发射 finding
```

`engine/providers/<格式>.py` 是**唯一认识某一种日志**的地方（PX4 的 topic 名、字段名、
固件版本怎么解码都在那儿）；框架与算子只认它给出的契约 —— 加一种日志格式就是加一个适配器。

改完经验后的三步：

```bash
node web/scripts/build-knowledge.mjs      # 构建（校验失败会直接报错）
python tools/calibrate/compare_baseline.py  # 6 条真实日志与冻结基线逐字段比对
python tools/calibrate/lint_rules.py        # 字段引用与版本错配检查
```

## 1. 最小可用示例

```yaml
id: px4-cpu-load               # 稳定标识，即 finding.ruleId
name: CPU 负载
group: cpu                    # 执行分组（见 §3）
order: 1                      # 同 group 内的次序，缺省 100000
version: 1.0.0                # 可省，缺省 1.0.0；偏离默认时才写（如 1.1.0）

conditions:                   # 适用范围：整块可省（省 = 什么都适用、没有 topic 依赖）
  firmware: any               # 固件：any / ">=1.15" / "<1.15" / ">=1.14,<1.15"
  airframe: any               # 机架：any / 机架名 / [fixed_wing, vtol]
  topics:                     # 日志里得有这些 topic；conditions 各键不满足都会留痕（见 §2.1）
    - cpuload

compute:                      # 数据流：一行一条表达式，右边是算式（见 §4）
  - cpu_max = max(cpuload.load)     # 取 topic.field；不写实例下标 = 所有实例

outputs:                      # 规则自己的记账与副产品（见 §5.2）；可整个省略
  stats:
    cpuLoadMax: {var: cpu_max, round: 3}   # 写进报告 stats 的键

triggers:                     # 自上而下，命中第一条即发射一条 finding（见 §5.1）
  - when: "cpu_max >= 0.95"
    severity: critical        # critical | warning | info
    threshold: 0.95           # 写进 evidence.threshold
    value: f"{cpu_max:.3f}"   # 写进 evidence.value（表达式，f-string 管格式化）
    field: "cpuload.load(max)"
    title: "CPU 负载峰值 {cpu_max:.0%} 超阈值"
    suggestion: "CPU 长期接近满载会导致控制环丢步。"
```

**没写的字段不等于没有**——下面这些由构建期从 `facts.yaml` 的 `rule_meta` 派生，
规则里只在**确实偏离**时才写（见 §2）：

| 派生字段 | 从哪来 |
| --- | --- |
| `category` | 该 `group` 的分类 |
| `outputs.check` | 缺省 = `group`（个别例子不同，显式写） |
| `doc` | 该 `group` 的官方文档链接（**规则级**字段，不是 `outputs` 的一部分） |
| `version` `status` `license` `author` | 仓库级默认值 |

## 2. 规则级字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | ✅ | 唯一标识，即 `finding.ruleId`；也被故障库、白名单、报告引用 |
| `name` | ✅ | 人读名字 |
| `group` | ✅ | 执行分组（见 §3），必须与它所替换的检查位置一致 |
| `order` | | 同 group 内排序，缺省 100000；再按 `id` 兜底 |
| `conditions` | | 适用范围，整块可省。四个键都能省，见 §2.1 |
| `ran_when` | | 表达式为真才记 `ran()`（如"机动段样本足够"才算跑过）。**算不出来**（compute 抛异常）时一律记一条 `skipped`「数据不足」，不算跑过——所以没有 `ran_on_success` 这个字段了 |
| `compute` | ✅ | 数据流表达式数组（guard 类经验可省，见 §4 / §6.4） |
| `foreach` | | 把事件列表展开成多条 finding，见 §6.3 |
| `triggers` | ✅ | 触发条件数组（guard 类经验可省） |
| `outputs` | | 规则自己的记账与副产品（见 §5.2）。可整个省略 |
| `doc` | | 官方文档链接，写进 `finding.docUrl`（CLAUDE.md 红线：每条 finding 必须可溯源）。**可省**：按 `group` 从 `facts.yaml` 的 `rule_meta` 派生，偏离时才写 |
| `category` `version` `status` `license` `author` `outputs.check` | | **可省**：从 `facts.yaml` 的 `rule_meta` 按 group 派生（见 §1 末尾的表）。只在**确实偏离**时才写——比如 `px4-cpu-load` 的 `group` 是 `cpu` 而 `outputs.check` 要叫 `cpu_load`，那就显式写 |

### 2.1 适用范围只有一个地方写：`conditions`

固件、机架、数据依赖三样都收在一个块里，都能省：

```yaml
conditions:
  firmware: ">=1.15"                      # 省 = any
  airframe: [fixed_wing, unknown]         # 省 = any；机架词表由日志格式的适配器定义
  topics:                                 # 省 = 没有依赖
    - vehicle_imu_status
    - estimator_wind || wind_estimate     # 项内 `||` = 其中任意一个在日志里就够
  precheck:                               # 省 = 没有先决条件
    - "not HAS_ARMED"                     # 命中即不跑（会记一条 skipped，文案就是这句）
```

- **固件**：`any` / `">=1.15"` / `"<1.15"` / `">=1.14,<1.15"`（逗号 = 与）。**这是"哪一版"唯一的
  写法**——引用上不再有版本条件（升级换代的字段差异用候选组按存在性挑，见 §4）。
- **机架**：`any` / 机架名 / 机架名列表。词表见 `facts.yaml` 的 `vehicle_types`
  （`rotary_wing` / `fixed_wing` / `rover` / `airship`，另有 `unknown`）；简写 **`mc`** /
  **`fw`** 也认（构建期换成规范名，产物里只留规范名）。
- **topics**：日志里要有这些 topic，缺了就记一条 `skipped`（文案自动生成为
  `X not in log`，含 `||` 时是 `a / b not in log`）。**项间是「都要有」**。
  只列"缺了就不该判"的 topic——走过 `_try` 的可选字段别列进来，那会把原本能跑的规则变成跳过。
- **precheck**：先决条件，命中任意一条就不跑本条。放"不用算就知道跟我无关"的场合
  （如没有 armed 段就谈不上飞行中的零偏判定）。它在 compute **之前**求值，所以只认内置变量
  （大写）与 `has_topic()`——拿不到 compute 的输出，也没有 `no_data` 这类"算完才知道"的量
  （那种情形由 compute 自己失败来表达，见 §4 末尾）。

**`conditions` 不满足一律记一条 `skipped`**：报告里要能看出"这条为什么没跑"，而不是让读者
以为它跑过了。四条原因的自动文案：

| 原因 | 文案 |
| --- | --- |
| `firmware` | `固件不满足 >=1.15`（规则里写的那串原样） |
| `airframe` | `机架不适用 fixed_wing`（列表用 ` / ` 连接） |
| `precheck` | `先决条件命中：not HAS_ARMED`（作者写的那句判据原样） |
| `topics` | `vehicle_status not in log` |

**没有 `skip` 这个字段了。** 原先 `skip` 里那三类"要算一遍才知道"的条件各有去向：

| 原来写在 skip 里 | 现在 |
| --- | --- |
| `not has_topic('X')` | 写进 `conditions.topics` |
| `no_data`（数据不足） | 不写。compute 抛异常就**自动**记一条 `skipped`「数据不足，本条没算出结论」 |
| `not has_armed` / `airframe == 'unknown'` 这类 | 写进 `conditions.precheck`（命中即不跑、记一条 skipped），或由 trigger `when` 兜住 |

**一个 YAML 可以装多条经验**（顶层写成数组），适合形态完全相同的兄弟经验：
`rules/failsafe.yaml` 一个文件装了 6 条（5 个布尔事件 + 导航状态）。一般情况下仍是一条经验一个文件。

## 3. group：执行分组决定 finding 编号

finding 的 `id`（F01、F02…）按**发射顺序**生成，所以每条经验的 `group` 必须与它所替换的
原检查位置一致，否则报告里的编号会整体错位。现有 group（按执行顺序）：

```
vibration → ekf_innovations → ekf_faults → battery → cpu → gps_health → failsafe
→ mode_thrash → motor_balance → imu_bias → attitude_tracking → airspeed
→ vtol_transition → wind_estimate → logged_messages → guards_early → guards
```

一个 group 可以装多条经验，它们在报告里连着出现——比如 `vibration` 就有 2 条
（`vibration` / `imu-clipping`），靠 `order` 决定组内次序。

`guards_early` 在最前（`insufficient_data` 必须是第一个 guard 标签），`guards` 在最后
（重启 / 缺 topic / 丢包）。**执行顺序写在 `facts.yaml` 的 `group_order` 里**——新增一条经验时把它加进那个列表
（或复用已有 group）即可，不用改任何 Python；构建期会校验每条经验的 group 是否都已登记。

## 4. compute：表达式

`compute` 是一串**表达式**，一行一条，按顺序求值；左边赋值、右边是算式，后面的行能用前面
赋过的变量。写法与 `triggers.when` 都是同一套（Python 的子集）。

```yaml
compute:
  - vibe_mean, vibe_p95, vibe_max, imu_idx = worst_mean_stats(
      ref("vehicle_imu_status[:].accel_vibration_metric"), min_mean=0)
  - pct = vibe_mean / 9.81 * 100
  - p99_stat = p99 if seg_n and seg_n > 50 else None
```

| 写法 | 含义 |
| --- | --- |
| `a, b, c = f(x, kw=1)` | 赋值。多左值解包要求个数等于算子的输出数 |
| `pct = frac * 100` | 算术：`+ - * / % **` |
| `x if cond else y` | 三元（只求值被选中的那一支） |
| `a and b` / `a or b` / `not a` | 逻辑 |
| `x in S` / `x is None` | 比较 |
| `topic.field` | **裸字段引用**——取数不带修饰时就用它；不写实例下标 = 所有实例 |
| `ref("topic.field", …)` | **带修饰的取数**，见下 |
| `_try(...)` | 容错求值：内层抛异常或得 `None` 时结果为 `None`，**而不是让整条中止** |
| `worst_mean_stats(…)` | 算子调用，名字必须在 `engine/operators.py` 注册（目录见 §4.1） |

### `ref(...)`：带修饰的取数

裸写的 `topic.field` 后面挂不了东西，需要修饰时用 `ref`。**位置参数是字段名字符串**
（不能写成 `ref(topic.field)`——那样 Python 会先把字段读出来，修饰就来不及生效了），
可以给多个，那是候选组，见下面「字段跨版本怎么办」。

**字段名的完整形态是 `topic[N].field[M]`** —— 第 N 个实例的字段的第 M 个元素；两个下标各自可省，
省掉的含义不同，别混：

| 写法 | 含义 |
| --- | --- |
| `estimator_status[2].q_d[0]` | **完整形态**：第 2 个实例的 `q_d` 的第 0 个元素 |
| `estimator_status[0].vel_test_ratio` | 只取第 N 个实例（`[-1]` = 最后一个，按 Python 语义） |
| `vehicle_attitude.q[0]` | 数组字段的第 M 个元素（这里 `q` 是四元数，取第 0 个分量） |
| `estimator_status.vel_test_ratio` 或 `estimator_status[:].vel_test_ratio` | **所有实例**（两种写法**等效**）：多实例时给「每实例一组」交给会分组的算子（如 `worst_mean_stats`）；**只有一个实例时就是那一条序列**，所以单实例字段照旧直接参与运算 |
| `vehicle_attitude.q[0]` | **数组字段的元素下标**（`q` 的第 0 个分量） |

裸写的字段引用**不能**带实例下标——`cpuload[0].load` 会报错并提示改写；
要指定实例就写成 `ref("estimator_status[2].vel_test_ratio")`。实例号只能写在名字里，
没有 `instance=` 这个修饰键。

| 修饰 | 含义 |
| --- | --- |
| `ref("新名", "旧名")` | **候选组**：按顺序取第一个在日志里存在的；都没有返回 `None`（组内必须同实例） |
| `alias="clipping"` | 字段的备用命名——**等价于把备用名放进候选组**（`ref("名", "clipping")`） |
| `unit="deg"` | **期望输出的单位**：源单位从 `meta/<tag>.json` 查（`meta/topic-overrides.yaml` 可补），取到谁都换算成它。不写就是不换算 |

`vehicle_status.nav_state` 与 `ref("vehicle_status.nav_state")` 完全等价，所以**不需要修饰
就别包 `ref`**。

**什么会让整条经验中止**：表达式里拿到 `None` 再参与运算（`None >= 9.81`）会抛异常，
引擎按"数据不足"处理——整条就此中止，报告里记一条 `skipped`「数据不足，本条没算出结论」。
要容错就用 `_try(...)`、`coalesce(...)` 或 `x if x is not None else y`；反过来，
**去掉一层 `_try` 也是正当写法**——需要"缺数据就别判"的中止时就这么写。

**字段跨版本怎么办**（三个版本之间换名、换单位，各有各的表达）：

| 情形 | 写法 |
| --- | --- |
| 整条规则只服务某版本 / 某机型 | `conditions.firmware` / `conditions.airframe` 写死（如 `firmware: ">=1.15"`、`airframe: mc`） |
| **同义改名**（值的含义一样） | 候选组：`ref("新名", "旧名")` —— 有谁用谁，不用维护"哪个版本叫什么" |
| **改名且改了单位**（`lat` 是 degE7、`latitude_deg` 是 deg） | 候选组 + `unit=`：`ref("latitude_deg", "lat", unit="deg")` —— 取到谁都换算成度，一次表达完 |
| **同名换了语义**（换算不足以表达） | 换算不够就只能**拆成两条规则**（各写自己的 `conditions.firmware`），或让算子按"给了哪一路"挑（如 `att_tracking_stats` 的指令源） |

**引用上没有 `when_fw`**：升级换代本来就是"老名字没了、新名字在"，按存在性挑就够。要按版本
分段的是**语义**差异（不是字段差异），那种拆规则最清楚。

单位换算的源单位**不在规则里猜**：构建期按 `meta/topic-map.yaml` 找到字典键去查 `unit`，
查不到就告警（不是失败），补一行到 `knowledge/px4/meta/topic-overrides.yaml` 的 `units` 里即可。
量纲不一致（长度 ↔ 角度）构建期直接报错。

**没有"已知遗留字段"白名单**：`lint_rules.py` 按候选组判——组里任意一个在某版本存在就不算错；
组里全部版本都找不到，就是**死引用**（多半是拼错，或那条经验本来就不该存在）。
要是你拿不准某个字段的名字，去 `knowledge/px4/meta/<tag>.json` 里查，别猜。

**版本分流用三元**时注意必须判 `None`：

```yaml
compute:
  - >-
    wn = estimator_wind.windspeed_north if (FW_MINOR is None or FW_MINOR >= 15)
         else wind_estimate.windspeed_north
```

`FW_MINOR` 只有"日志里写了固件版本"时才有值，老日志上是 `None`，而 `None >= 15` 会抛异常、
让整条经验静默失效。**构建期会拦下漏写 `is None` 的写法**。字段换代别用它——那用候选组。

### 4.1 算子目录

<!-- BEGIN:operators -->
**标量统计**

| 算子 | 入参 | 输出 | 说明 |
| --- | --- | --- | --- |
| `max` | 1 | 1 个值 | 最大值（忽略 NaN） |
| `mean` | 1 | 1 个值 | 均值（忽略 NaN） |
| `min` | 1 | 1 个值 | 最小值（忽略 NaN） |
| `min_ge` | 1 | 1 个值 | 有限且 >= ge 的最小值（排除无效值，如 remaining=-1 表示未知） |
| `scale` | 1 | 1 个值 | 标量乘以系数（如比例 → 百分比） |

**空值 / 逻辑 / 算术（通用积木）**

| 算子 | 入参 | 输出 | 说明 |
| --- | --- | --- | --- |
| `both` | 2 | 1 个值 | 逻辑与：两个布尔量皆真 |
| `coalesce` | 2 | 1 个值 | 返回第一个非 None 的值，都缺失则 None |
| `div` | 2 | 1 个值 | a / b |
| `gt` | 2 | 1 个值 | a > b 的布尔结果（把阈值条件变成可喂给 value_if 的标记） |
| `is_none` | 1 | 1 个值 | 值是否为 None（数据缺失在数据流里显式传播，而不是断链） |
| `is_not_none` | 1 | 1 个值 | 值是否非 None |
| `value_if` | 2 | 1 个值 | cond 为真返回 x，否则 None（条件性产出统计值） |

**定长数组字段（任意 float32[n] 时间序列列集合）**

| 算子 | 入参 | 输出 | 说明 |
| --- | --- | --- | --- |
| `columns_aggregate` | 1 | 1 个值 | 先对每列做 column_op 标量归约，再用 combine 跨列归约（如各电芯最小值中的最小值，gt=0 排除占位 0） |
| `head_tail_median_drop` | 3 | drop, tail_median | 第一个区间内（跳过前 skip_first_s 秒）头段中位数 - 尾段中位数 |
| `rows_aggregate` | 1 | 1 个值 | 跨列逐时刻归约成一条时间序列（如每个时刻各电芯的最低电压） |

**多实例传感器（分组取数）**

| 算子 | 入参 | 输出 | 说明 |
| --- | --- | --- | --- |
| `worst_column_delta` | 1 | count, instance, axis | 每个实例一组等长列（如 float32[3] 计数序列）：逐列取 max-min，回传全局最大差值及其实例/列序号 |
| `worst_mean_stats` | 1 | mean, p95, vmax, instance | 每个实例一条标量序列：取均值最大的实例，回传其均值/p95/最大值/实例序号 |
| `worst_rss_mean` | 3 | rss, instance | 每个实例三轴序列：mean(sqrt(x^2+y^2+z^2))，取 RSS 最大的实例及序号 |

**位掩码 / 跨实例归约（通用）**

| 算子 | 入参 | 输出 | 说明 |
| --- | --- | --- | --- |
| `bit_or_max` | 1 | 1 个值 | 位掩码序列按实例分组：每实例取最大值后按位或（跨实例合并置位） |
| `has_bits` | 2 | 1 个值 | value 是否置起了 mask 中的任意一位（mask 传 -1 表示“任意位非零”） |
| `max_of_max` | 1 | 1 个值 | 数值序列按实例分组：每实例取最大值，再跨实例取最大（忽略缺失实例） |
| `to_int` | 1 | 1 个值 | 取整（位掩码/计数类字段：保证证据与文案里按整数呈现，而不是 1.0） |
| `worst_reject_ratio` | 9 | frac, names, instance | 按实例扫描“拒绝占比”：主信号（位掩码，如创新检验标志）非空时用它（非零样本占比、按位或展开位名），否则逐一比较候选通道（有限样本中 >= ge 的占比，需 >= channel_min 个） |

**序列统计 / 边沿 / 地理（通用）**

| 算子 | 入参 | 输出 | 说明 |
| --- | --- | --- | --- |
| `adjacent_speed_mps` | 3 | 1 个值 | 经纬度与时间戳（us）→ 相邻样本地面速度序列（m/s） |
| `count_above` | 1 | 1 个值 | 有限值中 > gt 的样本个数 |
| `edges_count` | 1 | 1 个值 | 相邻样本取值发生变化（不等于）的次数：状态/模式切换计数 |
| `hypot` | 2 | 1 个值 | 逐样本 sqrt(a^2 + b^2)（如由北/东风分量合成风速） |
| `is_zero` | 1 | 1 个值 | 是否等于 0（未置位/无效计数类字段的判据） |
| `keep_gt` | 1 | 1 个值 | 只保留有限且 > gt 的样本（如排除 eph<=0 的无效值），返回序列 |
| `masked_any_in` | 3 | 1 个值 | 时间轴上的“区间内取值为集合之一”判定：在 intervals（us 区间列表）内是否存在取值落在 codes 中的样本 |
| `percentile` | 1 | 1 个值 | 有限值的第 p 百分位（如 p=95） |
| `quat_to_euler` | 1 或 4 | roll, pitch, yaw | 四元数 → 欧拉角（度，先归一化） |
| `ratio_equal` | 1 | 1 个值 | 取值为 value 的样本占比（如无效标志 == 0 的比例） |
| `read` | 1 | 1 个值 | 显式取数/透传：把字段原样放进环境（供 coalesce 等后续节点使用） |
| `require_true` | 1 | 1 个值 | 门控：条件为真返回 True，否则 None（使数据流在此中止，等效于原 if 分支） |
| `scale_series` | 1 | 1 个值 | 整条序列乘系数（如 mm → m），与标量版 scale 互补 |

**事件（一个规则 → 多条 finding）**

| 算子 | 入参 | 输出 | 说明 |
| --- | --- | --- | --- |
| `rising_edge_events` | 4 | 1 个值 | 上升沿事件（前一拍 != 1 且当前 == 1）且落在 intervals 内：返回 [{t_s: 相对日志起点秒数}, ...] |
| `step_into_events` | 4 | 1 个值 | 状态切换到 codes 集合内的取值、且落在 intervals 内的事件：返回 [{t_s, code, name}, ...]，codes 形如 {5: AUTO_RTL}（名称由经验文件给出） |

**结构化条目列表（日志消息等）**

| 算子 | 入参 | 输出 | 说明 |
| --- | --- | --- | --- |
| `count_items` | 1 | 1 个值 | 条目列表里满足条件的条数：按 key 字段判定，in_list / eq / lte / gte |
| `take_items` | 1 | 1 个值 | 条目列表里满足条件的前 limit 条（drop 可去掉辅助键 |

**姿态 / 时间轴（通用）**

| 算子 | 入参 | 输出 | 说明 |
| --- | --- | --- | --- |
| `abs_values` | 1 | 1 个值 | 逐样本绝对值 |
| `count_true` | 1 | 1 个值 | 布尔掩码里为真的样本数 |
| `fill_to` | 3 | 1 个值 | 把 src_ts 上的取值按“向前保持”映射到 dst_ts（如转换段标志采样到姿态时间轴） |
| `interp_to` | 3 | 1 个值 | 把 src_ts 上的取值线性插值到 dst_ts 时间轴（如姿态指令对齐到姿态时间轴） |
| `larger` | 2 | 1 个值 | 逐样本取较大者（如 max(|roll|, |pitch|)） |
| `masked_absmax` | 2 | 1 个值 | 掩码为真的样本里 |值| 的最大值 |

**掩码 / 多通道（通用）**

| 算子 | 入参 | 输出 | 说明 |
| --- | --- | --- | --- |
| `active_column_means` | 2 | 1 个值 | 掩码内逐通道均值，只保留均值 > min_mean 的通道（未接/未用通道均值≈0，排除） |
| `choose` | 3 | 1 个值 | cond 为真取 a，否则取 b（数据流里的分支合并） |
| `count_columns` | 1 | 1 个值 | 数组字段的有效列数（跳过 None/空占位列） |
| `interval_mask` | 2 | 1 个值 | 时间戳落在 intervals 内的布尔掩码（armed 段等） |
| `items_spread` | 1 | spread, max_index, min_index | 条目列表按 value_key 求极差，并回传取最大/最小者（并列取先出现者）的 index_key |
| `mask_and` | 2 | 1 个值 | 两个布尔掩码逐样本取与 |
| `values_in` | 2 | 1 个值 | 逐样本判定取值是否落在 codes 集合内，返回布尔掩码 |

**多轴传感器（通用）**

| 算子 | 入参 | 输出 | 说明 |
| --- | --- | --- | --- |
| `apply_mask` | 2 | 1 个值 | 按布尔掩码筛选序列（如只保留 armed 段样本），返回新序列 |
| `label_if` | 1 | 1 个值 | cond 为真取 label_true，否则取 label_false（文案以节点选项给出 |
| `range_of` | 1 | 1 个值 | 有限样本的极差 max-min（样本 < 2 个时 None） |
| `worst_named` | 3 | value, name | 三路序列各做一次归约（reduce: absmax | range | max | min | mean），回传归约值最大的一路及名称（labels 由经验文件给出） |

**逐样本数组运算（通用）**

| 算子 | 入参 | 输出 | 说明 |
| --- | --- | --- | --- |
| `abs_diff` | 2 | 1 个值 | 逐样本 |a - b|（长度取较短者） |
| `degrees` | 1 | 1 个值 | 弧度序列 → 角度序列 |
| `either` | 2 | 1 个值 | 逻辑或（None 视作假） |
| `greater` | 2 | 1 个值 | 逐样本 a > b，返回布尔掩码 |
| `head` | 2 | 1 个值 | 取序列前 count 个样本（用于按最短长度对齐多条时间序列） |
| `length_of` | 1 | 1 个值 | 序列长度（标量） |
| `smaller` | 2 | 1 个值 | 两值取较小者 |
| `sum_abs` | 2 | 1 个值 | 逐样本 |a| + |b| |
| `zero_cross_hz` | 1 | 1 个值 | 相对中位数符号翻转频率（Hz）：翻转次数 / 2 / (样本数 / sample_rate) |

**复合算子：整段分析（多入多出）**

| 算子 | 入参 | 输出 | 说明 |
| --- | --- | --- | --- |
| `active_window_mask` | 4 | 1 个值 | 活动窗口掩码：armed 区间 ∩ 状态取值落在 codes 内的样本 |
| `att_tracking_stats` | 7 | p99, osc_hz, seg_n | 姿态跟踪统计：把姿态与姿态指令在时间轴上对齐（取较短长度、指令线性插值到姿态时间轴），只在 armed 且非悬停（指令倾角 > tilt_min_deg）样本上算跟踪误差，输出 p99（度）、误差过零频率（Hz）、参与统计的样本数 |
| `cell_voltage_min` | 4 | vmin, cell_min, cells, have_measured, have_fallback, no_cell | 单电芯最低电压：优先 voltage_cell_v[] 实测（各列 > 0 的最小值中的最小值），缺失时回退 总压最小值 / 电芯数（两者都 > 0 才成立） |
| `column_spread_stats` | 2 | spread, busiest, idlest, n_active | 多通道均值极差：掩码内逐通道求均值，只保留均值 > min_mean 的通道（排除未接/未用），活跃通道数不足 min_channels 时返回 None |
| `gyro_bias_series` | 6 | bx, by, bz, bts, src_text | 零偏取源：**谁有数据用谁**（直读列 → 状态槽 A → 状态槽 B），输入都是「数组字段的多列」或 None |
| `gyro_bias_worst` | 5 | abs_max, abs_axis, drift, drift_axis | 三轴零偏在 armed 区间内逐轴取 |最大值| 与极差（漂移），回传各自最差的轴名 |
| `max_temp_range` | 2 | 1 个值 | 两个温度来源各自取极差（样本 < 2 的来源忽略），返回较大者 |

共 **73** 个算子。输入个数与左值个数由算子签名强制校验（对不上则构建失败）；各算子的可调参数（如 `gt` / `p` / `factor` / `codes` / `labels` / `min_count`）写成算子调用的**关键字实参**（如 `percentile(w, p=95)`）；取数修饰（`instance` / `alias` / `unit`，以及位置参数给的候选组）写在 `ref(...)` 上。
<!-- END:operators -->

## 5. triggers 与 outputs

### 5.1 触发条件（自上而下，命中第一条即发射一条 finding）

| 键 | 说明 |
| --- | --- |
| `when` | 条件表达式，求值为真即命中。与 `compute` 同一套 Python 子集 |
| `severity` | `critical` ｜ `warning` ｜ `info` |
| `tag` | 异常标签（喂故障库匹配）；写 `null` 表示这条不进标签 |
| `value` | 写进 `evidence.value`，**是一个表达式**：写变量得原值（`value: vibe_mean`）、写 f-string 得格式化后的串（`value: f"{vibe_mean:.3f}"`）、写常量就得到常量（`value: f"missing"`） |
| `threshold` `unit` | 写进 `evidence.threshold` / `evidence.unit`（阈值显式声明，不从表达式猜）。**阈值是"这条结论拿什么当参照"，不必等于触发点**——比如固定翼超调在 40° 触发、但参照的是标称门限 25° |
| `field` | 写进 `evidence.field`，可含 `{var}` 占位符（如 `accel_clipping[{clip_axis}]`） |
| `title` `suggestion` | 文案，可用 `{var}` / `{var:.1f}` / `{var:.0%}` 占位符 |
| `evidence_extra` | `{证据键: 变量名}`，把额外证据挂到 finding 上（如日志消息原文 `samples`） |

要"命中时顺带打一个数据质量标签"，用 `outputs.guard_tags`（见 §5.2）——它不依赖哪条 trigger 命中，
算得出来就带上，语义更准确。

### 5.2 输出与副作用

| 键 | 说明 |
| --- | --- |
| `outputs.check` | `checksRun`/`checksSkipped` 里的名字。**缺省 = `group`**，只在例外时才写（如 `px4-cpu-load` 的 group 是 `cpu`、check 要叫 `cpu_load`）；guard 类经验不填 |
| `outputs.tag` | 默认异常标签（trigger 未写 `tag` 时用它） |
| `outputs.stats` | `{键: {var: 变量名, round: n}}`；写进报告的 **`metrics`**（关键数据块）；值为 `None` 时该键不写入。**结果页里这项的名字/单位/顺序在 `../facts.yaml` 的 `metrics` 里声明**——键对不上就只显示键名 |
| `outputs.guard_tags` | `[{when: 表达式, tag: 标签}]`：条件成立就打数据质量标签，**不依赖是否发 finding**（如"风速偏大"本身就是该进解读的背景） |

> `doc` **不在这里**——它是**整条规则**的官方文档链接（写进 `finding.docUrl`），所以是顶层字段，见 §2。
> 同理，`outputs` 里装的是"这条规则自己的记账与副产品"，`triggers` 才是发射 finding 的地方。

## 6. 内置变量、事件与进阶

### 6.1 内置变量（直接引用，无需在 compute 声明）

<!-- BEGIN:builtins -->
| 变量 | 含义 |
| --- | --- |
| `FW_MINOR` | 固件次版本号（int 或 None）——版本分支最常用，`None` = 这份日志没写版本号 |
| `AIRFRAME` | 机型字符串：`rotary_wing` / `fixed_wing` / `rover` / `airship` / `unknown` |
| `IS_FIXED_WING` | 机型别名（比 `AIRFRAME == 'fixed_wing'` 好读） |
| `DURATION_S` | 日志总时长（秒） |
| `ARMED_S` | armed 总时长（秒） |
| `ARMED_INTERVALS` | armed 区间列表 `[(start_us, end_us)]`，升序不重叠；`end=None` 表示持续到日志结束。时序算子按它切窗 |
| `T0_US` | 日志起点时间戳（us），事件类算子算相对时刻用 |
| `HAS_ARMED` | 是否存在 armed 段（布尔） |
| `RESTART_DETECTED` | 是否有 topic 时间戳回退（疑似中途重启） |
| `DROPOUT_MS` | 全日志丢包累计（毫秒） |
| `MESSAGES` | 日志消息条目列表 `[{tSec, message, level, level_name}]` |
| `has_topic('x')` | 日志里有没有这个 topic，如 `not has_topic('cpuload')`；表达式里**唯一**允许的函数调用（其余函数一律不给） |
<!-- END:builtins -->

### 6.2 模板占位符

`title` / `field` / `suggestion` / `value_text` 都走 Python `str.format_map`，
因此可以写 `{cpu_max:.0%}`、`{p99:.1f}`、`{names}`。**只有声明过的名字（compute 输出、
内置变量、foreach 事件键）才会通过构建期校验**，写错名字构建直接失败。

### 6.3 事件列表：一条经验发多条 finding（`foreach`）

有些检查是"每次事件一条结论"（失效保护每次边沿、每次模式切换）。用事件算子产出列表，
再由框架展开：

```yaml
compute:
  - >-
    events = rising_edge_events(vehicle_status.failsafe, vehicle_status.timestamp,
                                ARMED_INTERVALS, T0_US)
foreach: {var: events, keys: [t_s]}      # keys 声明事件键，供构建期校验占位符
triggers:
  - when: "True"                          # 每个事件都发射
    severity: critical
    tag: failsafe
    value_text: "set at {t_s:.1f}s"
    field: "vehicle_status.failsafe"
    title: "触发失效保护（飞行中，t={t_s:.1f}s）"
```

### 6.4 guard 类经验（只打数据质量标签）

没有 `compute` / `triggers` / `outputs.check`，判定全在 `outputs.guard_tags` 里：

```yaml
id: px4-guard-restart
name: 中途重启
group: guards
outputs:
  guard_tags:
    - {when: "RESTART_DETECTED", tag: restart_detected}
```

## 7. 构建期会拒绝什么（越早发现越好）

- 缺 `id`/`group`/`name`（guard 类还要 `outputs.guard_tags`；普通经验要 `compute` + `triggers`）。
  `conditions` 与 `outputs` 本身可省
- `group` 没登记在 `facts.yaml` 的 `rule_meta.by_group`，或没登记在 `group_order` 里
  ——**这类经验永远不会被执行**
- 表达式里：算子未注册、输入个数/左值个数与算子签名不符、关键字实参名不是算子形参、
  引用了未声明的名字、多输出算子嵌在表达式中间、`_try` 不在最外层
- 字段引用写法不对（必须是 `topic.field` 两段小写名；实例写 `topic[N].field`、数组元素写
  `topic.field[N]`）；`ref(...)` 的修饰键写错（只认 `alias` / `unit`）
- `FW_MINOR` 做了大小比较却没先判 `None`（见 §4 末尾）
- `conditions` 里有未知键、`firmware` 不是合法约束串、`airframe` 不是 `any`/机架名/列表、
  `topics` 项不是 topic 名（多个候选用 `||` 分隔）；顶层还写着 `skip`（该字段已移除）
- `severity` 非法、trigger 缺 `when`/`title`/`field`、guard_tags 条件写了错名字
- `lint_rules.py` 另查字段引用：字段名拼错、或引用了只在别的固件版本存在的字段（**版本错配**）
- 同一个 `group` 里两条规则派生出不同的 `category` / `doc`，或 `conditions.firmware` 写着
  `">=1.15"` 却引用只在旧固件存在的字段

## 8. 常见坑

| 坑 | 说明 |
| --- | --- |
| YAML 1.1 布尔陷阱 | 裸 `yes` / `no` / `on` / `off` 会被解析成布尔（PyYAML 与浏览器侧 `yaml` 库行为还不一致）。参数名与键都别用这几个词 |
| flow 风格里的 `[` | 带数组下标的字段在 flow 标量里要加引号：`{when: "a.q[0] > 0"}` 不写引号会解析失败（块风格里不需要） |
| **`FW_MINOR` 忘了判 `None`** | 老固件日志里没有版本号，`FW_MINOR >= 15` 会抛异常 → **整条经验静默失效**（不报错、也不出结论）。写成 `(FW_MINOR is None or FW_MINOR >= 15)`；构建期会拦 |
| `_try` 漏写 | 某条表达式可能拿不到数据（字段缺失、版本分支）时，不包 `_try(...)` 会让整条经验中止——表现是"统计量凭空消失"，很难查 |
| finding 顺序敏感 | 同一 group 内多条经验的 `order` 变了，报告里的 F 编号就变了；`compare_baseline.py` 会因此失败 |
| 多实例取数 | 多实例 topic **必须写明要哪个实例**：`ref("estimator_status[2].vel_test_ratio")` 取第 3 个；不写（或写 `[:]`）就是**所有实例**——多实例给"每实例一组"、单实例就是那一条，交给会归约的算子。以前"不加修饰＝所有实例拼成一条"的隐式语义已去掉——那种曲线里混着几个传感器的数据，读的人看不出来 |
| 字典名 ≠ 日志 topic 名 | `meta/<tag>.json` 按上游 `.msg` **文件名**收录；日志里的 topic 名由固件发布决定。`sensor_gps`（原始 GPS）与 `vehicle_gps_position`（处理后的位置）是两个不同的东西，不是改名 |
| 生成物不要手改 | `web/workers/*.ts`、`web/lib/knowledge/*.generated.js` 都是产物，改 `knowledge/` 后重新构建。本页 §4.1 与 §6.1 两张表由 `python tools/px4/gen_rule_reference.py` 注入，改完算子/内置变量请重跑它 |

## 9. 报告页的曲线与地图：同一套取数语言

「数据图表」tab 的曲线与地图上的轨迹**不是手写的**，由 `knowledge/px4/plot/*.yml` 声明、
构建期编译并校验（写错就构建失败）。它们用的是**与经验完全一样**的字段引用——`ref(...)` 候选组、
`unit=` 期望单位、实例写进字段名——所以"字段换代、改了量纲"在这里与在 `compute` 里是同一种写法。

```yaml
id: power
title: 电源
description: 电压 / 电流 / 剩余电量。
conditions:
  topics: [battery_status]           # 与规则的 conditions 同形
compute:                             # 与规则的 compute 同一套表达式与算子
  - remaining_pct = remaining * 100
outputs:
  - container: axes                  # 一张曲线图（container: map 是地图轨迹）
    title: 电压
    ylabel: V
    hlines: [{value: 4.905, level: warning, label: "4.905（警告）"}]
    children:
      - mode: TimeSeries
        ydata: >-
          ref("battery_status[0].voltage_v"),
          ref("battery_status[0].voltage_filtered_v"),
          remaining_pct
        label: 电压, 滤波后电压, 剩余电量
        style: solid, dashed, solid
```

几条与规则一致的约定：

- `label` / `style` / `color` 与 `ydata` **逐项对齐**（个数不等构建期就报错，并指出第几项）；
- 老固件少个字段**不用写回退**：那条线取到 `null`，前端自动不画；要换名字继续画就写进候选组；
- 一张图只画**一个量纲**（同一图里写了 `unit=` 的引用必须目标单位相同）；
- 图上的换算（`compute` 节点、`unit=`）一律在引擎侧做，前端只画——"前端不写数学"。

细节见 `knowledge/px4/plot/README.md`（骨架可抄 `plot-template.yml`）。
