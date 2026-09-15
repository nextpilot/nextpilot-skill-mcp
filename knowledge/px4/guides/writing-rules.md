# 经验文件（rules/*.yaml）完整参考

这是**写一条经验的权威参考**：字段级定义、取值语义、内置变量、算子目录、常见坑。
设计动机与演进史见 [rule-schema-design.md](../design/rule-schema-design.md)；
全部经验的清单见 [rules-index.md](../reference/rules-index.md)（生成物）。

> 单一事实源：`knowledge/px4/rules/*.yaml`。本文件里标了 `<!-- BEGIN/END -->` 的两张表
> 由 `python tools/px4/gen-rule-reference.py` 从 `operators.py` 与 `ulog_checks.py` 生成，
> 改完算子请重跑该脚本；其余内容人工维护。

## 0. 一条经验怎么跑起来

```
rules/<经验>.yaml  ──┐
operators.py       ──┤ 构建期校验（字段/算子/表达式/文案）      ── 产物内联进 Python
ulog_checks.py     ──┘   ↓                                      ↓
                     web/workers/ulog-check-script.ts  →  Pyodide（浏览器）执行：
                     事实层 → 按 slot 顺序跑经验 → 取字段/调算子/求值表达式 → 发射 finding
```

改完经验后的三步：

```bash
node web/scripts/build-knowledge.mjs      # 构建（校验失败会直接报错）
python tools/calibrate/compare-baseline.py  # 6 条真实日志与冻结基线逐字段比对
python tools/calibrate/lint-rules.py        # 字段引用与版本错配检查
```

## 1. 最小可用示例

```yaml
id: px4-cpu-load                # 稳定标识，即 finding.ruleId
slot: cpu                      # 执行位置（见 §3）
order: 1                       # 同 slot 内的次序，缺省 100000
name: CPU 负载
version: 1.0.0
category: system               # 分类：vibration/power/ekf/gps/...
status: stable                 # draft | experimental | stable | deprecated
author: {name: NextPilot 内置}  # 规则市场分成主体
license: CC-BY-4.0
changelog:
  - {version: 1.0.0, date: "2026-09-15", note: 初版}

firmware: any                  # 适用范围轴①：固件（不限也必须显式写 any）
airframe: any                  # 适用范围轴②：机架

requires:
  any_of: [cpuload]            # 依赖 topic；缺则不跑、留一条 skipped
skip_reason: cpuload not in log

compute:                       # 数据流：逐个节点执行，输出命名进环境
  - out: cpu_max
    from: cpuload.load         # 取 topic.field（多实例会拼接）
    op: max

triggers:                      # 自上而下，命中第一条即发射
  - expr: "cpu_max >= 0.95"
    severity: critical         # critical | warning | info
    threshold: 0.95            # 写进 evidence.threshold
    value: cpu_max             # 写进 evidence.value
    round: 3
    field: "cpuload.load(max)"
    title: "CPU 负载峰值 {cpu_max:.0%} 超阈值"
    suggestion: "CPU 长期接近满载会导致控制环丢步。"

emit:
  check: cpu_load              # checksRun / checksSkipped 里的名字
  doc: https://docs.px4.io/main/en/log/flight_log_analysis.html
  stats:
    cpuLoadMax: {var: cpu_max, round: 3}   # 写进报告 stats 的键
```

## 2. 规则级字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | ✅ | 唯一标识，即 `finding.ruleId`；也被故障库、白名单、报告引用 |
| `slot` | ✅ | 执行位置（见 §3），必须与它所替换的检查位置一致 |
| `order` | | 同 slot 内排序，缺省 100000；再按 `id` 兜底 |
| `name` | ✅ | 人读名字 |
| `version` `category` `status` `author` `license` `changelog` | | 归属与分发元数据（规则市场需要） |
| `firmware` | ✅ | 适用范围轴①：`any` ｜ `">=1.15"` ｜ `"<1.15"` ｜ `">=1.14,<1.15"`（逗号=与） |
| `airframe` | ✅ | 适用范围轴②：`any` ｜ `fixed_wing` ｜ `[rotary_wing, vtol]` |
| `requires.any_of` | | 依赖 topic，**任一**存在即可（多版本同义 topic 场景） |
| `requires.all_of` | | 依赖 topic，**必须全部**存在 |
| `skip_reason` | | 依赖不满足时写进 `checksSkipped` 的原因文案 |
| `not_applicable.when` | | 表达式为真 → 整条不适用，按 `not_applicable.skip_reason` 记一条 skipped |
| `silent_when` | | 表达式为真 → **静默**跳过（既不 ran 也不 skipped） |
| `skip_reason_axis` | | 机型/固件轴不匹配时若要留痕，写在这里（默认静默） |
| `skip_reason_no_data` | | compute 中途数据不足时记一条 skipped（默认静默） |
| `ran_on_success` | | `true` 时把 `ran()` 推迟到 compute 成功之后（原实现把 ran 放在数据判定之后的情形） |
| `ran_when` | | 表达式为真才记 `ran()`（如"机动段样本足够"才算跑过） |
| `known_legacy` | | 已知遗留字段清单（如 `estimator_status.states`），供 `lint-rules.py` 免报 |
| `compute` | ✅ | 数据流节点数组（guard 类经验可省，见 §7） |
| `foreach` | | 把事件列表展开成多条 finding，见 §6.3 |
| `triggers` | ✅ | 触发条件数组（guard 类经验可省） |
| `emit` | ✅ | 输出声明（见 §5） |

**一个 YAML 可以装多条经验**（顶层写成数组），适合形态完全相同的兄弟经验：
`rules/failsafe.yaml` 一个文件装了 6 条（5 个布尔事件 + 导航状态）。一般情况下仍是一条经验一个文件。

## 3. slot：执行位置决定 finding 编号

finding 的 `id`（F01、F02…）按**发射顺序**生成，所以每条经验的 `slot` 必须与它所替换的
原检查位置一致，否则报告里的编号会整体错位。现有 slot（按执行顺序）：

```
vibration → ekf_innovations → ekf_faults → battery → cpu → gps_health → failsafe
→ mode_thrash → motor_balance → imu_bias → attitude_tracking → airspeed
→ vtol_transition → wind_estimate → logged_messages → guards_early → guards
```

`guards_early` 在最前（`insufficient_data` 必须是第一个 guard 标签），`guards` 在最后
（重启 / 缺 topic / 丢包）。新增 slot 需要同时在 `ulog_checks.py` 的 `_SLOT_ORDER` 与调用处登记。

## 4. compute：数据流节点

每个节点执行一次，输出命名进环境，后续节点与 `triggers` 都能引用。

| 节点键 | 说明 |
| --- | --- |
| `op` | 算子名（必须在 `operators.py` 注册，见 §4.3） |
| `in` | 输入列表。每项可以是 `topic.field`、前序输出名、或字面量（数字/数组，如 `in: [step, 50.0]`、`in: [nav_at, [2,4,6,14,21]]`） |
| `from` | 单输入的短写法（等价 `in: [x]`） |
| `out` | 输出名；多输出写列表 `out: [a, b, c]`，数量必须与算子签名一致 |
| `optional` | `true` 时允许输入/输出为 `None`（缺失沿数据流传播，而不是让整条中止） |
| `per_instance` | 多实例 topic 按实例分组喂给算子（每个实例一组），配合 `worst_*` 类算子取"最差实例" |
| `instance` | 只取第 N 个实例（对应原实现的 `xxx_list[0]`；不写则多实例**拼接**） |
| `aliases` | 该引用的备用字段名（跨版本改名），如 `{vehicle_imu_status.stddev_accel_x_m_s2: [stddev_accel_x]}` |
| `when_fw` | 节点级版本条件（如 `">=1.15"`）：不满足则跳过该节点、输出置 `None` |
| 其它键 | 直接传给算子作为可调参数（`gt` / `p` / `factor` / `codes` / `labels` / `min_count` / `unit` …） |

**断裂与中止**：算子返回 `None` 或输入含 `None` 时——非 `optional` 节点会让**整条经验中止**
（不发 finding；若声明了 `skip_reason_no_data` 则记一条 skipped）；标了 `optional` 则继续，
输出为 `None`，由后续 `coalesce` / `choose` / `value_if` 决定怎么用。

**版本分支的标准写法**（同一物理量在不同固件换了 topic/字段名）：

```yaml
compute:
  - {out: n_new, from: estimator_wind.windspeed_north, op: read, when_fw: ">=1.15", optional: true}
  - {out: n_old, from: wind_estimate.windspeed_north,  op: read, when_fw: "<1.15",  optional: true}
  - {out: wn, in: [n_new, n_old], op: coalesce, optional: true}
```

### 4.3 算子目录

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

共 **73** 个算子。入参个数由算子签名强制校验（`in:`/`out:` 数量对不上则构建失败）；各算子的可调参数（如 `gt` / `p` / `factor` / `codes` / `labels` / `min_count`）写在节点的同层键上。
<!-- END:operators -->

## 5. triggers 与 emit

### 5.1 触发条件（自上而下，命中第一条即发射一条 finding）

| 键 | 说明 |
| --- | --- |
| `expr` | 受限表达式（见下），求值为真即命中。支持 `and/or/not`、比较、`+ - * /`、括号、`in`，可用内置变量与 compute 输出（**不允许**属性访问/下标/函数调用/推导式） |
| `severity` | `critical` ｜ `warning` ｜ `info` |
| `tag` | 异常标签（喂故障库匹配）；写 `null` 表示这条不进标签 |
| `value` / `value_const` / `value_text` | 写进 `evidence.value`：变量名 / 常量 / 带占位符的文案（如 `"fault={fault_union},nan={nan_max}"`） |
| `round` | 对 `value` 四舍五入到 n 位 |
| `threshold` `unit` | 写进 `evidence.threshold` / `evidence.unit`（阈值显式声明，不从表达式猜） |
| `field` | 写进 `evidence.field`，可含 `{var}` 占位符（如 `accel_clipping[{clip_axis}]`） |
| `title` `suggestion` | 文案，可用 `{var}` / `{var:.1f}` / `{var:.0%}` 占位符 |
| `guard_tag` | 命中时同时打一个数据质量标签 |
| `evidence_extra` | `{证据键: 变量名}`，把额外证据挂到 finding 上（如日志消息原文 `samples`） |

### 5.2 输出与副作用

| 键 | 说明 |
| --- | --- |
| `emit.check` | `checksRun`/`checksSkipped` 里的名字（guard 类经验可省） |
| `emit.tag` | 默认异常标签（trigger 未写 `tag` 时用它） |
| `emit.doc` | 官方文档链接（每条 finding 必须可溯源） |
| `emit.stats` | `{stats 键: {var: 变量名, round: n}}`；值为 `None` 时该键不写入 |
| `emit.guard_tags` | `[{when: 表达式, tag: 标签}]`：条件成立就打数据质量标签，**不依赖是否发 finding**（如温度跨度大） |

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
| `restart_detected` | 是否有 topic 时间戳回退（疑似中途重启） |
| `dropout_ms` | 全日志丢包累计（毫秒） |
| `messages` | 日志消息条目列表 `[{tSec, message, level, level_name}]` |
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
  - out: events
    in: [vehicle_status.failsafe, vehicle_status.timestamp, armed_intervals, t0_us]
    op: rising_edge_events
foreach: {var: events, keys: [t_s]}      # keys 声明事件键，供构建期校验占位符
triggers:
  - expr: "True"                          # 每个事件都发射
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
slot: guards
emit:
  guard_tags:
    - {when: "restart_detected", tag: restart_detected}
```

## 7. 构建期会拒绝什么（越早发现越好）

- 缺 `id`/`slot`/`name`/`firmware`/`airframe`/`compute`/`triggers`/`emit`（guard 类除外）
- 算子未注册、`in`/`out` 数量与算子签名不符、`when_fw` 写法非法
- 表达式或文案里引用了未声明的名字（内置变量/compute 输出/foreach 键之外）
- `severity` 非法、trigger 缺 `expr`/`title`/`field`、guard_tag 条件写了错名字
- `lint-rules.py` 另查字段引用：字段名拼错、或声明了 `firmware: ">=1.15"` 却引用只在
  旧固件存在的字段（**版本错配**）

## 8. 常见坑

| 坑 | 说明 |
| --- | --- |
| YAML 1.1 布尔陷阱 | 裸 `yes` / `no` / `on` / `off` 会被解析成布尔（PyYAML 与浏览器侧 `yaml` 库行为还不一致）。参数名与键都别用这几个词 |
| flow 风格里的 `[` | `{from: topic.field[0], ...}` 会解析失败——flow 里的裸标量不能含 `[`，要写成 `{from: "topic.field[0]", ...}`（块风格里不需要引号） |
| `optional` 漏写 | 节点只要有一支输入可能是 `None`（版本分支、缺失字段），不写 `optional` 会让整条经验中止——表现是"统计量凭空消失"，很难查 |
| finding 顺序敏感 | 同一 slot 内多条经验的 `order` 变了，报告里的 F 编号就变了；`compare-baseline.py` 会因此失败 |
| 多实例拼接 | 不写 `instance`/`per_instance` 时，多实例 topic 会被**拼接**成一条长序列（拼错了统计就全错，如 `estimator_sensor_bias` 每 IMU 一个实例） |
| 字典名 ≠ 日志 topic 名 | `meta/<tag>.json` 按上游 `.msg` **文件名**收录；日志里的 topic 名由固件发布决定。`sensor_gps`（原始 GPS）与 `vehicle_gps_position`（处理后的位置）是两个不同的东西，不是改名 |
| 生成物不要手改 | `web/workers/*.ts`、`web/lib/knowledge/*.generated.js` 都是产物，改 `knowledge/` 后重新构建 |
