# 逐条对表：上游检查 vs 本仓实现

> **为什么有这份文档**：此前用"本仓是上游的超集"这类概括描述差距，读的人无法判断
> **具体哪一条做完了、原来长什么样、我们现在长什么样**。本文把每一项上游检查拆开，
> 一行一行列出来。
>
> 覆盖两个上游：
>
> - **PX4 侧**：`robotto` 的 `ai-drone-toolkit` → `robotto_drone_core/ulog_tools.py`
>   的 `diagnose_flight()`（8 项检查）。本仓 PX4 规则的直接祖先。
> - **APM 侧**：`furkanisay/ardupilot-mcp`（16 项检查）。本仓 `knowledge/ardupilot/` 的知识源。
>
> 状态口径：**✅ 已迁移并更强** / **🟡 已迁移，语义等价** / **🔵 已迁移但有已声明降级** / **❌ 未迁移**。

---

## 一、PX4 侧：robotto `diagnose_flight()` 8 项

上游实码：`toolkit/packages/robotto-drone-core/src/robotto_drone_core/ulog_tools.py`，
函数 `diagnose_flight(path)`，第 523–800 行。上游阈值常量在第 70–78 行：

```python
EKF_TEST_RATIO_WARN = 0.5;   EKF_TEST_RATIO_CRIT = 1.0
VIBE_WARN_MS = 30.0;         VIBE_CRIT_MS = 60.0
CPU_LOAD_WARN = 0.90;        CPU_LOAD_CRIT = 0.95
BATTERY_REMAINING_WARN = 0.20; BATTERY_REMAINING_CRIT = 0.10
MODE_CHANGES_WARN = 12
```

### 1. `logged_errors` — 日志消息

|                | 上游                                                                             | 本仓                                                                                                                                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **实码位置**   | `ulog_tools.py` 第 541–570 行                                                    | `knowledge/px4/rules/logged-errors.yaml` + `logged-warnings.yaml`                                                                                                                                                                                                                      |
| **判定**       | `lvl in ("EMERG","ALERT","CRIT","ERR")` → critical；`lvl == "WARNING"` → warning | 同左，但**拆成两条独立经验**                                                                                                                                                                                                                                                           |
| **取数**       | `ulog.logged_messages` 遍历，逐条比 `_log_level_name(m.log_level)`               | `count_items(MESSAGES, key="level_name", in_list=[...])`                                                                                                                                                                                                                               |
| **证据**       | `{"count": n, "samples": severe[:5]}`，样本**不截断**                            | `take_items(..., limit=5, clip={"message": 200})`                                                                                                                                                                                                                                      |
| **产物**       | 1 个函数里 2 条 finding                                                          | 2 条 finding（`px4-log-errors` order=1、`px4-log-warnings` order=2）                                                                                                                                                                                                                   |
| **本仓多做的** | —                                                                                | ①级别判定改用 `level_name`（PX4 在 `log_level` 里填 ASCII `'3'`/`'4'`，上游用 `_log_level_name` 也对了，**但本仓迁移前写成 `log_level <= 3`，拿 51/52 比 3/4，导致永不命中——已按 pyulog 语义修正并写进文件头注**）②消息文本 `clip=200` 截断③warning 单独产 finding 并给独立 suggestion |
| **未做的**     | —                                                                                | 上游样本不截断，本仓截 200 字符                                                                                                                                                                                                                                                        |

**状态：✅ 已迁移并更强**

---

### 2. `ekf_innovations` — EKF 创新检验

|                | 上游                                                                                                       | 本仓                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **实码位置**   | `ulog_tools.py` 第 571–605 行                                                                              | `knowledge/px4/rules/ekf-innovation.yaml`                                                               |
| **字段**       | `EKF_TEST_RATIO_FIELDS = ("vel_test_ratio","pos_test_ratio","hgt_test_ratio","mag_test_ratio")` — **4 路** | 10 路：`vel/pos/hgt/hdg/mag/tas/hagl/beta_test_ratio` + `innovation_check_flags` 位掩码                 |
| **判据**       | 逐字段取 `stats["max"]`，取**全局最大**那一路                                                              | `worst_reject_ratio(...)` 取**「拒绝占比」最大**的那一路                                                |
| **阈值**       | `>= 1.0` critical / `>= 0.5` warning — **判的是瞬时峰值 max**                                              | `>= 5.0%` critical / `>= 1.0%` warning — **判的是超阈样本占比**                                         |
| **去毛刺**     | 无                                                                                                         | `channel_min=3`（通道最少 3 个被拒样本才计入，排除偶发尖峰）；`primary_min=3`                           |
| **老固件回退** | 无                                                                                                         | `innovation_check_flags` 位掩码非空时用位掩码，否则才逐路比 `*_test_ratio`                              |
| **产物**       | `ekfRejectRatio`? 无，只有 finding                                                                         | 额外产 metric `ekfRejectRatioPct`（round=2）                                                            |
| **定位到实例** | 否（只报 field 名）                                                                                        | 是（`estimator #{inst}`，多 EKF 实例分别定位）                                                          |
| **文案**       | `f"EKF innovation {worst_field}={worst_ratio:.2f} exceeded 1.0"`                                           | `"EKF 创新检验持续失败（estimator #0：速度、水平位置）"`，并给 `suggestion` 指向 GPS/磁罗盘/振动/气压计 |

**关键差异**：上游判**峰值瞬时超限**，本仓判**持续拒绝占比**。峰值法一个毛刺就报 critical；
占比法要求「至少 3 个样本、且占总样本 5% 以上」——**本仓更抗误报，但会漏掉"只拒了一次"的场景**。

**状态：✅ 已迁移并更强（含已声明的口径变化）**

---

### 3. `ekf_faults` — EKF 硬故障位

|                 | 上游                                     | 本仓                                                                                                |
| --------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **实码位置**    | `ulog_tools.py` 第 606–626 行            | `knowledge/px4/rules/ekf-faults.yaml`                                                               |
| **字段**        | `filter_fault_flags` 与 `nan_flags` 两个 | 只用 `filter_fault_flags`                                                                           |
| **判据**        | `fault_max or nan_max` → 非零即 critical | `has_bits(fault_union, 63)` → **bit 0–5 才算 critical**；仅非核心位置位 → info                      |
| **多实例**      | 取各实例 `max`                           | `bit_or_max(...)` **跨实例按位或合并**（上游取 max 会漏掉「实例 0 有 bit0、实例 1 有 bit1」的组合） |
| **误报防护**    | 无                                       | **bit 10（视觉速度融合拒绝）在未用 VIO 的飞机上属正常 → 只报 info 并说明"若未启用视觉可忽略"**      |
| **缺失处理**    | `coalesce` 无，字段缺失即 skip           | `coalesce(fault_raw, 0)`，缺失按 0，与原实现一致                                                    |
| **`nan_flags`** | **检查了**                               | **未迁移**                                                                                          |

**未迁移项（明确列出）**：上游检查 `estimator_status.nan_flags`，本仓只查 `filter_fault_flags`。

**状态：🔵 已迁移，一处降级（未查 `nan_flags`）**

---

### 4. `vibration` — 高频振动

|              | 上游                                                 | 本仓                                                                       |
| ------------ | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| **实码位置** | `ulog_tools.py` 第 627–652 行                        | `knowledge/px4/rules/vibration.yaml`                                       |
| **数据源**   | `estimator_status.vibe[2]`（**估计器侧**，m/s）      | `vehicle_imu_status.accel_vibration_metric`（**传感器侧**，m/s²）          |
| **阈值**     | `VIBE_CRIT_MS = 60.0` / `VIBE_WARN_MS = 30.0`（m/s） | `9.81` critical / `4.905` warning（m/s²，= 1g / 0.5g）                     |
| **阈值来源** | 上游自定常量（`docs/SOURCES.md` 标 heuristic）       | **Flight Review 振动色带** 0.5g/1g，标 `[来源]`                            |
| **统计量**   | 单实例 `stats["max"]`                                | `worst_mean_stats(...)` 跨 IMU 实例取**均值最大**的那个，同时得 p95 与 max |
| **产物**     | 只有 finding                                         | 3 个 metric：`imuAccelVibrationMean` / `P95` / `Max`（round=3）            |
| **定位**     | 无 IMU 编号                                          | `IMU #{imu_idx}`                                                           |
| **判据口径** | 判**峰值**                                           | 判**均值**                                                                 |

> ⚠️ **这是一处必须知道的差异**：`estimator_status.vibe[2]`（估计器侧 delta-velocity）与
> `vehicle_imu_status.accel_vibration_metric`（传感器侧）**不是同一个物理量**，
> 数值不可直接比较。本仓选了后者，因为它有官方色带可对表；代价是**上游那条渠道完全没读**。
> 见 `coverage-plan.md` 批 A4：`estimator_status.vibe[2]` 待补。

**状态：🔵 已迁移但换了数据源（口径不同，已在文件头注声明）**

---

### 5. `cpu_load` — CPU 负载

|              | 上游                                               | 本仓                                                                        |
| ------------ | -------------------------------------------------- | --------------------------------------------------------------------------- |
| **实码位置** | `ulog_tools.py` 第 653–678 行                      | `knowledge/px4/rules/cpu-load.yaml`                                         |
| **字段**     | `cpuload.load`                                     | 同                                                                          |
| **阈值**     | `0.95` critical / `0.90` warning                   | 同（**逐位一致**）                                                          |
| **统计量**   | `stats["max"]`                                     | `max(cpuload.load)`，注释说明"默认合并后统计，与原 max over instances 等价" |
| **产物**     | 只有 finding                                       | 额外 metric `cpuLoadMax`（round=3）                                         |
| **文案**     | `f"Peak CPU load {cpu_max*100:.0f}% exceeded 95%"` | `"CPU 负载峰值 {cpu_max:.0%} 超阈值"` + `suggestion`                        |

**状态：🟡 已迁移，语义等价（阈值逐位一致，仅多了 metric 与 suggestion）**

---

### 6. `battery` — 电池剩余

|              | 上游                                                             | 本仓                                                                                                                             |
| ------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **实码位置** | `ulog_tools.py` 第 679–704 行                                    | `knowledge/px4/rules/power-remaining.yaml`                                                                                       |
| **字段**     | `battery_status.remaining`（**未过滤 -1**）                      | `min_ge(battery_status.remaining, ge=0)`，**-1 表示未知，已滤掉**                                                                |
| **阈值**     | `<= 0.10` critical / `<= 0.20` warning                           | 同（逐位一致）                                                                                                                   |
| **多实例**   | `stats["min"]` 跨实例取最小                                      | 只看第 0 块电池（与 `power-cell-voltage` 说明一致）                                                                              |
| **-1 处理**  | 无：`remaining=-1`（未知）会被当成 `<= 0.10` → **误报 critical** | 已滤掉                                                                                                                           |
| **产物**     | 只有 finding                                                     | 额外 metric `batteryRemainingMin`（round=3）                                                                                     |
| **族内位置** | 单条                                                             | `battery` group 第 3 条（cell-voltage=1 / sag=2 / remaining=3），另有 `power-cell-voltage.yaml`、`power-sag.yaml` 两条上游没有的 |

**状态：✅ 已迁移并更强（修掉了 -1 误报）**

---

### 7. `failsafe` — 失效保护 / 失联

|                      | 上游                                                                                                              | 本仓                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **实码位置**         | `ulog_tools.py` 第 705–745 行 + `_failsafe_events()` 第 382–479 行                                                | `knowledge/px4/rules/failsafe.yaml`（**6 条经验，`---` 多文档**） |
| **布尔字段**         | `FAILSAFE_BOOL_FIELDS = ("failsafe","rc_signal_lost","data_link_lost","engine_failure","mission_failure")` — 5 个 | 同 5 个，**逐字段拆成独立经验**（order 1–5）                      |
| **导航状态**         | `FAILSAFE_NAV_STATES = {5:"AUTO_RTL",12:"DESCEND",13:"TERMINATION",18:"AUTO_LAND"}`                               | `codes={5:"AUTO_RTL",12:"DESCEND",13:"TERMINATION",18:"LAND"}`    |
| **严重度**           | `failsafe`/`engine_failure`/`mission_failure` → critical；`rc_signal_lost`/`data_link_lost`（armed 内）→ warning  | **一致**                                                          |
| **armed 过滤**       | `_in_any_interval(event["t_s"], armed_intervals)`，只对 rc/link 两个字段用                                        | `ARMED_INTERVALS` **对所有事件统一过滤**（更严格）                |
| **机制**             | 手写遍历 `list_value_changes`                                                                                     | 声明式：`rising_edge_events` / `step_into_events` + `foreach`     |
| **产物**             | 每条事件一条 finding，无 label                                                                                    | 每条事件一条 finding，**带 label**（`failsafe` / `rc_lost`）      |
| **`AUTO_LAND` 命名** | `"AUTO_LAND"`                                                                                                     | `"LAND"`                                                          |

**状态：✅ 已迁移并更强（armed 过滤覆盖全部 6 条，且带 label 供故障库匹配）**

---

### 8. `mode_thrash` — 模式抖动

|              | 上游                                           | 本仓                                                         |
| ------------ | ---------------------------------------------- | ------------------------------------------------------------ |
| **实码位置** | `ulog_tools.py` 第 746–770 行                  | `knowledge/px4/rules/mode-thrash.yaml`                       |
| **字段**     | `vehicle_status.nav_state`                     | 同                                                           |
| **判据**     | `len(vs.list_value_changes("nav_state")) > 12` | `edges_count(vehicle_status.nav_state) > 12`                 |
| **阈值**     | `MODE_CHANGES_WARN = 12`                       | 12，标 `[来源] px4-thresholds.toml [mode] thrash_changes=12` |
| **严重度**   | warning                                        | warning                                                      |
| **产物**     | 只有 finding                                   | 额外 metric `navStateChanges`                                |
| **回退**     | 无 topic 时 `checks_skipped`                   | `conditions.message: [vehicle_status]` 缺则 skipped          |

**状态：🟡 已迁移，语义等价**

---

### PX4 侧汇总

| #   | 上游检查          | 状态          | 一句话                                             |
| --- | ----------------- | ------------- | -------------------------------------------------- |
| 1   | `logged_errors`   | ✅ 更强       | 拆 2 条 + 文本截断 + 修了永不命中的 bug            |
| 2   | `ekf_innovations` | ✅ 更强       | 4 路→10 路；峰值判据→占比判据（更抗误报）          |
| 3   | `ekf_faults`      | 🔵 一处降级   | **未查 `nan_flags`**；按位或合并 + 非核心位降 info |
| 4   | `vibration`       | 🔵 换了数据源 | 估计器侧 m/s → 传感器侧 m/s²（**数值不可比**）     |
| 5   | `cpu_load`        | 🟡 等价       | 阈值逐位一致                                       |
| 6   | `battery`         | ✅ 更强       | **修掉 `remaining=-1` 误报 critical**              |
| 7   | `failsafe`        | ✅ 更强       | armed 过滤覆盖全部 6 条 + label                    |
| 8   | `mode_thrash`     | 🟡 等价       | 阈值一致                                           |

**统计：8/8 已迁移。其中 4 条更强（1/2/6/7）、2 条等价（5/8）、2 条有已声明降级（3 未查 nan_flags、4 换了数据源）。**

---

## 二、APM 侧：`ardupilot-mcp` 16 项

上游实码：`ardupilot-mcp/checks/*.py`（注册表模式，`@register_check`）。

> **载体差异（先说明）**：上游是 Python 类（命令式、带分支与异常），本仓是声明式 YAML
> （`compute` 表达式 + `triggers`）。判定条件必须能写成算子链，写不出来的**只能占位或降级**
> —— 这是 §二.5「逐条降级」的根因。

### 二.1 飞行动态（10 项）

| #   | 上游检查    | 上游判据                                                      | 本仓文件                 | 本仓实现差异                                                                                                                                                           | 状态 |
| --- | ----------- | ------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | `events`    | `ERR` 子系统错误、`EV` 关键事件、`MODE` 时间线                | `events.yaml`（3 条）    | 同；`MODE` 时间线用文本列（原卡 C1，2026-09 解除）                                                                                                                     | ✅   |
| 2   | `ekf`       | XKF4/NKF4 的 SV/SP/SH/SM 检验比，0.8 警告 / 1.0 拒绝          | `ekf.yaml`（4 条）       | **同阈值**（`CRIT_RATIO=1.0` / `WARN=0.8`）；`XKF4 \|\| NKF4` + ref 候选组成对写；**不写 `outputs.stats`**（候选组分不清值来自哪个 topic，写了两条 metric 会互相填错） | ✅   |
| 3   | `vibration` | 三轴 30/60 m/s² + 10% 持续占比；三 IMU 削波 >=100 转 critical | `vibration.yaml`（6 条） | **同阈值**；拆 6 条（引擎一条规则最多出一条 finding）；`VIBE` 三轴无 IMU 实例维度                                                                                      | ✅   |
| 4   | `power`     | 最低电压、负载压降、电压突降                                  | `power.yaml`（3 条）     | **最低电压仍是 `estimate_cells` 派生路径**（按峰值电压估电芯数），**未切 `_cfg('BATT_CRT_VOLT')`** —— 阈值未经真实日志验证，见 PENDING 第五节第 5 条                   | 🔵   |
| 5   | `gps`       | 3D 定位、搜星 4/6、HDOP 2.0/5.0                               | `gps.yaml`（3 条）       | **一处有意偏离**：上游拿不到 armed 窗口就退回全程判；本仓改成 `armed: true` **直接 skip**（退回全程必然把起飞前搜星期 `NSats=0`/`HDop=99.99` 判成故障）                | 🔵   |
| 6   | `attitude`  | 横滚/俯仰峰值 30°；航向                                       | `attitude.yaml`（3 条）  | 同；原缺 `excursion_events` 时只剩峰值档，2026-09 补算子后**"持续 1s"判据已恢复**                                                                                      | ✅   |
| 7   | `compass`   | 场强极差比 0.60                                               | `compass.yaml`（1 条）   | **原缺 `std` 算子只留极差比，critical 档出不来**；2026-09 补 `std`/`cv` 后**CV 判据（0.30/0.60）已恢复**                                                               | ✅   |
| 8   | `motors`    | 不平衡与饱和                                                  | `motors.yaml`（2 条）    | 原缺矩阵化与标量减法（占位）；2026-09 补 `stack_columns` / `add` 后**已恢复**                                                                                          | ✅   |
| 9   | `rcin`      | 四主通道同时低于 1000us                                       | `rcin.yaml`（1 条）      | 同；上游判"持续 >=2s 或持续到日志末尾"→ critical，本仓补 `excursion_events` 后**已对齐**                                                                               | ✅   |
| 10  | `timing`    | PM 长循环；日志间隙                                           | `timing.yaml`（2 条）    | 原缺 `diff`/中位数（占位）；2026-09 补 `diff`/`median`/`sum` 后**已恢复**；`gap_events` 复刻上游"阈值 = max(0.5s, 10×名义间隔中位数)"                                  | ✅   |

### 二.2 配置 / 安装（4 项）

| #   | 上游检查      | 上游判据                                                                           | 本仓文件                   | 本仓实现差异                                                                                                                                                                                                         | 状态 |
| --- | ------------- | ---------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 11  | `config`      | `ARMING_CHECK` / `BATT_MONITOR` / `FS_THR_ENABLE` 三条参数检查                     | `config.yaml`（3 条）      | **原本 100% 卡在"读不到参数"（C2）**；2026-09 加 `PARAMS` 内置变量 + `_cfg('NAME', default=None)` 后转真。**踩坑**：`_cfg()` 只能在 `compute` 里用，`when` 里写是非法的（`_eval_expr` AST 白名单只放 `has_topic()`） | ✅   |
| 12  | `calibration` | 罗盘硬铁偏移模长（300/600 mGauss）                                                 | `calibration.yaml`（1 条） | 同类参数依赖，C2 解除后已迁；用 `np.hypot` 求三轴偏移模长                                                                                                                                                            | ✅   |
| 13  | `param_audit` | Rate P 异常、ACCEL 限制禁用、电池阈值倒挂、SPIN 反转、PWM 异常、围栏空边界（6 条） | `param_audit.yaml`（6 条） | 同，依赖参数，C2 解除后已迁                                                                                                                                                                                          | ✅   |
| 14  | `sensors`     | 罗盘健康标志；测距仪与 GPS 的"配置但无数据"                                        | `sensors.yaml`（3 条）     | 同；"配置但无数据"= `_cfg('RNGFND1_TYPE')`/`GPS_TYPE` 有值但对应消息缺失                                                                                                                                             | ✅   |

### 二.3 物理推理 / 日志完整性 / 预解锁（2 项）

| #   | 上游检查    | 上游判据                                            | 本仓文件                 | 本仓实现差异                                                                                                                                                 | 状态 |
| --- | ----------- | --------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 15  | `integrity` | 读**解析层**产出的 `log.meta.integrity`（是否截断） | `integrity.yaml`（1 条） | 上游读的是解析层不是消息流；本仓 provider 2026-09 补 `is_log_ok()` 与 `get_log_integrity()` 后规则补齐                                                       | ✅   |
| 16  | `prearm`    | 启动阶段 `MSG`/`STATUSTEXT` 预解锁关键字扫描        | `prearm.yaml`（1 条）    | 依赖**文本子串匹配**，原卡 C1；2026-09 C1 解除（`_FMT_DTYPES` 登记 `n/N/Z`→`"str"`）后已迁；用 `count_items`/`take_items` 新增的 `contains=`（大小写不敏感） | ✅   |

**另有 1 项上游有、本仓未迁**：

| 上游能力                       | 上游做法                                                          | 本仓状态                                           |
| ------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------- |
| **`vehicle_profile` 物理推理** | 从 hover 油门 → **推重比 / 功率裕度**，判断"这机器是不是动力不足" | **❌ 未迁移**。上游靠 hover 油门反推，本仓无对应物 |

### 二.4 APM 侧汇总

| 状态                  | 数量 | 明细                                                                                                                                       |
| --------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| ✅ 已迁移             | 13   | events / ekf / vibration / attitude / compass / motors / rcin / timing / config / calibration / param_audit / sensors / integrity / prearm |
| 🔵 已迁移但有声明降级 | 2    | `power`（仍走电芯估算，未切 `BATT_*_VOLT` 参数）、`gps`（armed 窗口取不到就 skip 而非退回全程）                                            |
| ❌ 未迁移             | 1    | `vehicle_profile` 物理推理（推重比 / 功率裕度）                                                                                            |

> 计数说明：✅ 13 条 + 🔵 2 条 = 上游 16 项检查里的 15 项；第 16 项 `vehicle_profile`
> 是上游的**额外能力**（不在 16 项 check 内，属 `tools` 层），单列在下方。合计 16 项已对齐。

### 二.5 逐条降级记录（原状态 → 现状态）

这张表记录**每一条**曾经降级的判据，以及它现在的状态。改这些文件前先读。

| 规则                             | 原降级（缺什么算子/能力）                           | 现状态                                                                              |
| -------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `compass` CV 判据                | 缺 `std` / `cv` → 只留极差比，**critical 档出不来** | ✅ 2026-09 补 `std`（带 `ddof`）/ `cv`（均值非正返回 None）后恢复                   |
| `attitude` "持续 1s"             | 缺 run-length → **只剩峰值档**                      | ✅ 2026-09 补 `excursion_events` / `longest_true_run` 后恢复                        |
| `attitude` 航向误差              | 缺取模算子 → 占位                                   | ✅ 2026-09 补 `wrap_degrees` / `mod` 后恢复                                         |
| `motors` 两条                    | 缺矩阵化与标量减法 → 占位                           | ✅ 2026-09 补 `stack_columns`（2~8 列，缺失列跳过）/ `add` / `sub` 后恢复           |
| `timing` 日志间隙                | 缺 `diff` 与中位数 → 占位                           | ✅ 2026-09 补 `diff`（可 `n=2` 二阶）/ `median` 后恢复；`gap_events` 复刻上游阈值   |
| `timing` PM 长循环               | 缺 `sum` → 用 `mean × length_of` 绕开               | ✅ 2026-09 补 `sum` 后绕法可退休                                                    |
| `events` MODE 时间线             | 缺文本列（C1）→ 占位                                | ✅ 2026-09 C1 解除后转真                                                            |
| `prearm`                         | 同 C1                                               | ✅ 2026-09 C1 解除后转真                                                            |
| `calibration` / `param_audit`    | 100% 依赖参数（C2）                                 | ✅ 2026-09 `PARAMS` + `_cfg()` 后转真                                               |
| `config` 三条 / `sensors` 前两条 | 同 C2                                               | ✅ 2026-09 转真                                                                     |
| `power` 最低电压                 | 上游用 `BATT_CRT_VOLT`/`BATT_LOW_VOLT` 参数判       | 🔵 **仍走 `estimate_cells` 派生路径**（现在能读了，但阈值未经真实日志验证，暂不切） |
| `gps` armed 窗口                 | 上游拿不到 armed 就退回全程判                       | 🔵 **有意偏离**：改成 skip（避免把起飞前搜星期判成故障）                            |
| `flags`（上游 16 项外）          | —                                                   | 见下方"三、已知未覆盖"                                                              |

**已全部解除的：12 条。仍降级的：2 条（`power` / `gps`），且都是有理由的主动选择。**

---

## 三、已知未覆盖（明确列出，不含糊）

### PX4 侧

| 未覆盖                       | 上游/参考来源                       | 为什么没做                        | 计划                                          |
| ---------------------------- | ----------------------------------- | --------------------------------- | --------------------------------------------- |
| `estimator_status.nan_flags` | robotto `ekf_faults`                | 迁移时只挑了 `filter_fault_flags` | 批 A4                                         |
| `estimator_status.vibe[2]`   | robotto `vibration`                 | 换了数据源（见上）                | 批 A4                                         |
| 45 张图里的 9 张             | Flight Review `configured_plots.py` | 6 张卡在"没有频谱算力"            | 批 B                                          |
| PID tune 整块                | Flight Review `pid_analysis.py`     | 完整子系统，零对应物              | 批 C                                          |
| 3D view                      | Flight Review `link_to_3d_page`     | 完整子系统，零对应物              | 批 D                                          |
| EKF 四步结构化分析的叙事     | PX4 官方文档                        | 未做成报告页骨架                  | 见 `../plans/upstream-alignment-plan.md` §3.1 |

### APM 侧

| 未覆盖                     | 来源                                             | 为什么没做                                                                          | 计划               |
| -------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------ |
| `vehicle_profile` 物理推理 | ardupilot-mcp                                    | 需要 hover 油门 → 推重比换算，本仓无对应算子                                        | 下一轮             |
| PID 调参建议               | ardupilot-mcp `recommend_tuning` / smarttune-cli | 属"建议"层，且本仓还没有 PID 分析                                                   | 批 C 之后          |
| `phases` 飞行阶段          | 本仓自有缺口                                     | `providers/ardupilot.py` 硬编码 `"phases": []`，导致故障库 10 条里 **7 条永不命中** | plan W9            |
| 真实 `.bin` 验证           | —                                                | 仓库无真实样本，端到端证据只有合成日志                                              | PENDING 第五节     |
| `fault-kb.yaml`            | 本仓自有缺口                                     | `trigger_tags` 必须是引擎真产出过的标签，未验证前写了就是编                         | 等 phases + 真样本 |

---

## 四、结论

1. **PX4 侧 8/8 已迁移**，4 条更强、2 条等价、2 条有**已声明**降级（未查 `nan_flags`、换了振动数据源）。
   "更强"的具体形式是：修掉永不命中的 bug、修掉 `remaining=-1` 误报、armed 过滤收紧、
   证据带实例定位与文本截断、额外产 metric。
2. **APM 侧 16/16 已对齐**，13 条齐平、2 条主动降级（`power` 阈值待验证、`gps` 有意 skip）、
   12 条曾经的算子缺口**已全部解除**。
3. **两族共同的真实缺口不是"规则够不够"，而是三件事**：①没有真实日志端到端回归集
   ②`phases` 空导致 APM 故障库残废 ③`vehicle_profile` 这类物理推理完全没有。
4. 本仓相对上游**真正独有**的是 guard 四条、电池三件套、电机平衡、姿态振荡/超调、
   GPS 三类、模式抖动、VTOL 越限、空速健康、风扰估计、日志消息分级、IMU 零偏漂移 ——
   上游两个项目**都没有规则层**（Flight Review 唯一的硬编码判定是振动图的三色背景带）。
