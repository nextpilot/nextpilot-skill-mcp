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
> `python tools/px4/gen_rule_reference.py` 从 `engine/operators.py` 与 `engine/rule_engine.py` 注入，
> 改完算子请重跑该脚本，标记之间不要手改，其余内容手维护。

## 0. 一条经验怎么跑起来

```
rules/<经验>.yaml     ──┐
facts.yaml（数据绑定/   ──┤ 构建期校验（字段/算子/表达式/文案、
  码表/group 顺序）      ──┤   group 是否登记、facts 键是否齐全）  ── 产物内联进 Python
engine/operators.py    ──┤
engine/rule_engine.py  ──┘   ↓                                      ↓
                     web/workers/ulog-check-script.ts  →  Pyodide（浏览器）执行：
                     事实层 → 按 group 顺序跑经验 → 取字段/调算子/求值表达式 → 发射 finding
```

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

firmware: "True"              # 适用范围轴①：固件。**写 Python 表达式**，不限就写 True
airframe: "True"              # 适用范围轴②：机架（不限写 True，如 is_fixed_wing）

skip:                         # 不适用就不跑；写了 reason → 报告里能看到原因，不写 → 静默
  - {when: "not has_topic('cpuload')", reason: cpuload not in log}

compute:                      # 数据流：一行一条表达式，右边是算式（见 §4）
  - cpu_max = max(cpuload.load)     # 取 topic.field（多实例会拼接）

triggers:                     # 自上而下，命中第一条即发射
  - when: "cpu_max >= 0.95"
    severity: critical        # critical | warning | info
    threshold: 0.95           # 写进 evidence.threshold
    value: f"{cpu_max:.3f}"   # 写进 evidence.value（表达式，f-string 管格式化）
    field: "cpuload.load(max)"
    title: "CPU 负载峰值 {cpu_max:.0%} 超阈值"
    suggestion: "CPU 长期接近满载会导致控制环丢步。"

emit:
  stats:
    cpuLoadMax: {var: cpu_max, round: 3}   # 写进报告 stats 的键
```

**没写的字段不等于没有**——下面这些由构建期从 `facts.yaml` 的 `rule_meta` 派生，
规则里只在**确实偏离**时才写（见 §2）：

| 派生字段 | 从哪来 |
| --- | --- |
| `category` | 该 `group` 的分类 |
| `emit.check` | 缺省 = `group`（个别例子不同，显式写） |
| `emit.doc` | 该 `group` 的官方文档链接 |
| `version` `status` `license` `author` | 仓库级默认值 |

## 2. 规则级字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | ✅ | 唯一标识，即 `finding.ruleId`；也被故障库、白名单、报告引用 |
| `name` | ✅ | 人读名字 |
| `group` | ✅ | 执行分组（见 §3），必须与它所替换的检查位置一致 |
| `order` | | 同 group 内排序，缺省 100000；再按 `id` 兜底 |
| `firmware` | ✅ | 适用范围轴①：**Python 表达式**，在 compute 之前求值（只认内置变量）。不限写 `"True"` |
| `airframe` | ✅ | 适用范围轴②：同上，如 `"is_fixed_wing"` / `"is_rotary_wing or is_vtol"` |
| `skip` | | `[{when, reason?}]`：**按顺序**判，命中第一条即跳过本条。写了 `reason` → 记一条 skipped（报告里能看到"为什么没跑"）；**不写 `reason`** → **静默**跳过，用于"这本来就跟我无关"的场合（如非 VTOL 机谈不上转换段）。`when` 是与 compute 同一套 Python 子集 |
| `ran_on_success` | | `true` 时把 `ran()` 推迟到 compute 成功之后（原实现把 ran 放在数据判定之后的情形） |
| `ran_when` | | 表达式为真才记 `ran()`（如"机动段样本足够"才算跑过） |
| `known_legacy` | | 已知遗留字段清单（如 `estimator_status.states`），供 `lint_rules.py` 免报 |
| `compute` | ✅ | 数据流表达式数组（guard 类经验可省，见 §4 / §6.4） |
| `foreach` | | 把事件列表展开成多条 finding，见 §6.3 |
| `triggers` | ✅ | 触发条件数组（guard 类经验可省） |
| `emit` | | 输出声明（见 §5）。可整个省略 |
| `category` `version` `status` `license` `author` `emit.check` `emit.doc` | | **可省**：从 `facts.yaml` 的 `rule_meta` 按 group 派生（见 §1 末尾的表）。只在**确实偏离**时才写——比如 `px4-cpu-load` 的 `group` 是 `cpu` 而 `emit.check` 要叫 `cpu_load`，那就显式写 |

**"不适用"只有一个地方写**（早先分散在 `requires` / `not_applicable` / `silent_when` /
`skip_reason_no_data` 四个字段里，现在合成 `skip` 一个列表）：

```yaml
skip:
  - {when: "not has_topic('vehicle_imu_status')", reason: vehicle_imu_status not in log}
  - {when: "airframe == 'unknown'", reason: 机型未知，无法判定固定翼巡航段}
  - {when: "not has_topic('vehicle_attitude_setpoint')"}     # 不写 reason = 静默
  - {when: "no_data", reason: 数据不足，没算出结论}
```

`no_data` 是内置变量：compute 算不出来时为真。所以"数据不足要记一条 skipped"也只是列表里的
一条普通条件，不必再单设字段。求值分两轮——compute 之前一轮（`no_data` 为假），compute
失败后再一轮（此时 `no_data` 为真）。

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

一个 group 可以装多条经验，它们在报告里连着出现——比如 `vibration` 就有 3 条
（`vibration` / `vibration-stddev` / `imu-clipping`），靠 `order` 决定组内次序。

`guards_early` 在最前（`insufficient_data` 必须是第一个 guard 标签），`guards` 在最后
（重启 / 缺 topic / 丢包）。**执行顺序写在 `facts.yaml` 的 `group_order` 里**——新增一条经验时把它加进那个列表
（或复用已有 group）即可，不用改任何 Python；构建期会校验每条经验的 group 是否都已登记。

## 4. compute：表达式

`compute` 是一串**表达式**，一行一条，按顺序求值；左边赋值、右边是算式，后面的行能用前面
赋过的变量。写法与 `triggers.when`、`skip[].when` 都是同一套（Python 的子集）。

```yaml
compute:
  - vibe_mean, vibe_p95, vibe_max, imu_idx = worst_mean_stats(
      ref("vehicle_imu_status.accel_vibration_metric", per_instance=True), min_mean=0)
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
| `topic.field` | **裸字段引用**——取数不带修饰时就用它（多实例会拼接） |
| `ref("topic.field", …)` | **带修饰的取数**，见下 |
| `_try(...)` | 容错求值：内层抛异常或得 `None` 时结果为 `None`，**而不是让整条中止** |
| `worst_mean_stats(…)` | 算子调用，名字必须在 `engine/operators.py` 注册（目录见 §4.1） |

### `ref(...)`：带修饰的取数

裸写的 `topic.field` 后面挂不了东西，需要修饰时用 `ref`。第一个参数是**字段名字符串**
（不能写成 `ref(topic.field)`——那样 Python 会先把字段读出来，修饰就来不及生效了）：

| 修饰 | 含义 |
| --- | --- |
| `per_instance=True` | 按实例分组读（每实例一组），交给需要分组的算子（`worst_mean_stats` 等） |
| `instance=0` | 只取第 N 个实例 |
| `alias="clipping"` | 字段的备用命名（旧固件改过名），可给字符串或字符串列表 |
| `when_fw=">=1.15"` | 固件版本不满足就返回 `None`，交给 `coalesce` 选另一支 |

`vehicle_status.nav_state` 与 `ref("vehicle_status.nav_state")` 完全等价，所以**不需要修饰
就别包 `ref`**。

**什么会让整条经验中止**：表达式里拿到 `None` 再参与运算（`None >= 9.81`）会抛异常，
引擎按"数据不足"处理——不发 finding，也不记 skipped（除非 `skip` 列表里有 `when: "no_data"`
的一项）。要容错就用 `_try(...)`、`coalesce(...)` 或 `x if x is not None else y`。

**版本分支**（同一物理量在不同固件换了 topic/字段名）用三元，注意必须判 `None`：

```yaml
compute:
  - >-
    wn = estimator_wind.windspeed_north if (fw_minor is None or fw_minor >= 15)
         else wind_estimate.windspeed_north
```

`fw_minor` 只有"日志里写了固件版本"时才有值，老日志上是 `None`，而 `None >= 15` 会抛异常、
让整条经验静默失效。**构建期会拦下漏写 `is None` 的写法**。另一种写法是
`ref("...", when_fw=">=1.15")` 配 `coalesce`——版本未知时两个引用都算适用、取前一个，
额外还兼做"该 topic 在这份日志里不存在"的兜底。

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

**多实例传感器（per-instance）**

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
| `quat_to_euler` | 4 | roll, pitch, yaw | 四元数四列（w, x, y, z）→ 欧拉角（度） |
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
| `quat_to_euler` | 4 | roll, pitch, yaw | 四元数 (w,x,y,z) 三路序列 → 欧拉角序列 |

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
| `att_tracking_stats` | 8 | p99, osc_hz, seg_n | 姿态跟踪统计：把姿态与姿态指令在时间轴上对齐（取较短长度、指令线性插值到姿态时间轴），只在 armed 且非悬停（指令倾角 > tilt_min_deg）样本上算跟踪误差，输出 p99（度）、误差过零频率（Hz）、参与统计的样本数 |
| `cell_voltage_min` | 4 | vmin, cell_min, cells, have_measured, have_fallback, no_cell | 单电芯最低电压：优先 voltage_cell_v[] 实测（各列 > 0 的最小值中的最小值），缺失时回退 总压最小值 / 电芯数（两者都 > 0 才成立） |
| `column_spread_stats` | 2 | spread, busiest, idlest, n_active | 多通道均值极差：掩码内逐通道求均值，只保留均值 > min_mean 的通道（排除未接/未用），活跃通道数不足 min_channels 时返回 None |
| `gyro_bias_series` | 7 | bx, by, bz, bts, src_text | 陀螺零偏取源：1.15+ 直读零偏列（fw_minor >= 15 时优先），否则用 EKF 状态槽 10..12（estimator_states 优先、estimator_status 兜底） |
| `gyro_bias_worst` | 5 | abs_max, abs_axis, drift, drift_axis | 三轴零偏在 armed 区间内逐轴取 |最大值| 与极差（漂移），回传各自最差的轴名 |
| `max_temp_range` | 2 | 1 个值 | 两个温度来源各自取极差（样本 < 2 的来源忽略），返回较大者 |

共 **74** 个算子。输入个数与左值个数由算子签名强制校验（对不上则构建失败）；各算子的可调参数（如 `gt` / `p` / `factor` / `codes` / `labels` / `min_count`）写成算子调用的**关键字实参**（如 `percentile(w, p=95)`）；取数修饰（`per_instance` / `instance` / `alias` / `when_fw`）写在 `ref(...)` 上。
<!-- END:operators -->

## 5. triggers 与 emit

### 5.1 触发条件（自上而下，命中第一条即发射一条 finding）

| 键 | 说明 |
| --- | --- |
| `when` | 条件表达式，求值为真即命中。与 `compute` / `skip` 同一套 Python 子集 |
| `severity` | `critical` ｜ `warning` ｜ `info` |
| `tag` | 异常标签（喂故障库匹配）；写 `null` 表示这条不进标签 |
| `value` | 写进 `evidence.value`，**是一个表达式**：写变量得原值（`value: vibe_mean`）、写 f-string 得格式化后的串（`value: f"{vibe_mean:.3f}"`）、写常量就得到常量（`value: f"missing"`） |
| `threshold` `unit` | 写进 `evidence.threshold` / `evidence.unit`（阈值显式声明，不从表达式猜）。**阈值是"这条结论拿什么当参照"，不必等于触发点**——比如固定翼超调在 40° 触发、但参照的是标称门限 25° |
| `field` | 写进 `evidence.field`，可含 `{var}` 占位符（如 `accel_clipping[{clip_axis}]`） |
| `title` `suggestion` | 文案，可用 `{var}` / `{var:.1f}` / `{var:.0%}` 占位符 |
| `evidence_extra` | `{证据键: 变量名}`，把额外证据挂到 finding 上（如日志消息原文 `samples`） |

要"命中时顺带打一个数据质量标签"，用 `emit.guard_tags`（见 §5.2）——它不依赖哪条 trigger 命中，
算得出来就带上，语义更准确。

### 5.2 输出与副作用

| 键 | 说明 |
| --- | --- |
| `emit.check` | `checksRun`/`checksSkipped` 里的名字。**缺省 = `group`**，只在例外时才写（如 `px4-cpu-load` 的 group 是 `cpu`、check 要叫 `cpu_load`）；guard 类经验不填 |
| `emit.tag` | 默认异常标签（trigger 未写 `tag` 时用它） |
| `emit.doc` | 官方文档链接（每条 finding 必须可溯源）。**缺省按 `group` 派生**（见 `facts.yaml` 的 `rule_meta.by_group`），偏离时才写 |
| `emit.stats` | `{键: {var: 变量名, round: n}}`；写进报告的 **`metrics`**（关键数据块）；值为 `None` 时该键不写入。**结果页里这项的名字/单位/顺序在 `../facts.yaml` 的 `metrics` 里声明**——键对不上就只显示键名 |
| `emit.guard_tags` | `[{when: 表达式, tag: 标签}]`：条件成立就打数据质量标签，**不依赖是否发 finding**（如"风速偏大"本身就是该进解读的背景） |

## 6. 内置变量、事件与进阶

### 6.1 内置变量（直接引用，无需在 compute 声明）

<!-- BEGIN:builtins -->
| 变量 | 含义 |
| --- | --- |
| `firmware` | 固件标签（如 `1.15.0`，无法识别时为“未知（旧固件或无版本号）”） |
| `fw_major` | 固件主版本号（int 或 None） |
| `fw_minor` | 固件次版本号（int 或 None）——版本分支最常用 |
| `fw_profile` | `px4-1.15+` 或 `px4-legacy` |
| `airframe` | 机型字符串：`rotary_wing` / `fixed_wing` / `rover` / `airship` / `unknown` |
| `is_rotary_wing` | 布尔别名（下同） |
| `is_fixed_wing` | 布尔别名 |
| `is_vtol` | 布尔别名（`vtol` 在机型串里） |
| `is_rover` | 布尔别名 |
| `duration_s` | 日志总时长（秒） |
| `armed_s` | armed 总时长（秒） |
| `phases` | 本次日志出现过的飞行阶段集合（如 `'hover' in phases`） |
| `tags` | 已命中的异常标签集合（喂故障库） |
| `guard_tags` | 已产生的数据质量标签集合 |
| `armed_intervals` | armed 区间列表 `[(start_us, end_us)]`，时序算子按它切窗 |
| `t0_us` | 日志起点时间戳（us），事件类算子算相对时刻用 |
| `has_armed` | 是否存在 armed 段（布尔） |
| `topics` | 本日志实际存在的 topic 名集合（如 `'vehicle_attitude' in topics`） |
| `has_topic` | 日志里有没有这个 topic，如 `not has_topic('cpuload')`（比 `'cpuload' not in topics` 直白）；表达式里**唯一**允许的函数调用 |
| `restart_detected` | 是否有 topic 时间戳回退（疑似中途重启） |
| `dropout_ms` | 全日志丢包累计（毫秒） |
| `messages` | 日志消息条目列表 `[{tSec, message, level, level_name}]` |
| `no_data` | compute 是否算不出来：初值 False，compute 失败后置真（`skip` 列表里用它记一条 skipped） |
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
                                armed_intervals, t0_us)
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

没有 `compute` / `triggers` / `emit.check`，判定全在 `emit.guard_tags` 里：

```yaml
id: px4-guard-restart
name: 中途重启
group: guards
firmware: "True"
airframe: "True"
emit:
  guard_tags:
    - {when: "restart_detected", tag: restart_detected}
```

## 7. 构建期会拒绝什么（越早发现越好）

- 缺 `id`/`group`/`name`/`firmware`/`airframe`（guard 类还要 `emit.guard_tags`；
  普通经验要 `compute` + `triggers`）。`emit` 本身可省
- `group` 没登记在 `facts.yaml` 的 `rule_meta.by_group`，或没登记在 `group_order` 里
  ——**这类经验永远不会被执行**
- 表达式里：算子未注册、输入个数/左值个数与算子签名不符、关键字实参名不是算子形参、
  引用了未声明的名字、多输出算子嵌在表达式中间、`_try` 不在最外层
- 字段引用写法不对（必须是 `topic.field` 两段小写名，可带 `[n]` 下标）；`ref(...)` 的修饰键
  写错、`when_fw` 不是合法固件约束串
- `fw_minor` / `fw_major` 做了大小比较却没先判 `None`（见 §4 末尾）
- `firmware` / `airframe` / `skip` 的条件写成了非字符串、或引用了**非内置变量**
  （它们在 compute 之前求值，拿不到 compute 的输出）
- `severity` 非法、trigger 缺 `when`/`title`/`field`、guard_tags 条件写了错名字
- `lint_rules.py` 另查字段引用：字段名拼错、或引用了只在别的固件版本存在的字段（**版本错配**）
- 同一个 `group` 里两条规则派生出不同的 `category` / `doc`，或写了 `firmware: ">=1.15"`
  却引用只在旧固件存在的字段

## 8. 常见坑

| 坑 | 说明 |
| --- | --- |
| YAML 1.1 布尔陷阱 | 裸 `yes` / `no` / `on` / `off` 会被解析成布尔（PyYAML 与浏览器侧 `yaml` 库行为还不一致）。参数名与键都别用这几个词 |
| flow 风格里的 `[` | 带数组下标的字段在 flow 标量里要加引号：`{when: "a.q[0] > 0"}` 不写引号会解析失败（块风格里不需要） |
| **`fw_minor` 忘了判 `None`** | 老固件日志里没有版本号，`fw_minor >= 15` 会抛异常 → **整条经验静默失效**（不报错、也不出结论）。写成 `(fw_minor is None or fw_minor >= 15)`；构建期会拦 |
| `_try` 漏写 | 某条表达式可能拿不到数据（字段缺失、版本分支）时，不包 `_try(...)` 会让整条经验中止——表现是"统计量凭空消失"，很难查 |
| finding 顺序敏感 | 同一 group 内多条经验的 `order` 变了，报告里的 F 编号就变了；`compare_baseline.py` 会因此失败 |
| 多实例拼接 | 不写 `ref(..., per_instance=True)` 或用裸字段引用时，多实例 topic 会被**拼接**成一条长序列（拼错了统计就全错，如 `estimator_sensor_bias` 每 IMU 一个实例） |
| 字典名 ≠ 日志 topic 名 | `meta/<tag>.json` 按上游 `.msg` **文件名**收录；日志里的 topic 名由固件发布决定。`sensor_gps`（原始 GPS）与 `vehicle_gps_position`（处理后的位置）是两个不同的东西，不是改名 |
| 生成物不要手改 | `web/workers/*.ts`、`web/lib/knowledge/*.generated.js` 都是产物，改 `knowledge/` 后重新构建。本页 §4.1 与 §6.1 两张表由 `python tools/px4/gen_rule_reference.py` 注入，改完算子/内置变量请重跑它 |
