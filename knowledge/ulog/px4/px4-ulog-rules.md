# PX4 `.ulg` 检查规则

> 规则实现：[ulog_checks.py](ulog_checks.py)（源，Pyodide 与本地校准跑同一份）；
> 阈值：`px4-thresholds.toml`；故障树：`px4-fault-kb.yaml`。
> 本地回归入口：[scripts/calibrate/run_checks_locally.py](../../../scripts/calibrate/run_checks_locally.py)
>
> 铁律（CLAUDE.md 4.1）：所有数值判断只发生在确定性引擎；LLM 只翻译，不更改数值。
> 当前 **15 个检查组 / 39 个告警发射点 / 10 条故障库**；冲刺 2 目标：10-20 个真实日志校准，误报率 < 10%。标注"暂定"的阈值需在该阶段复核。

## 机型识别

读取 `vehicle_status.vehicle_type`（末样本）：`1` 旋翼类 / `2` 固定翼 / `3` rover /
`4` 飞艇（枚举来源：PX4 `msg/VehicleStatus.msg`）。极旧日志回退 `is_rotary_wing` 布尔。
机型随报告输出（`vehicleType`），LLM 解释按机型组织建议；当前三规则对所有机型生效，
机型差异化阈值待校准样本积累后再拆。

## R1 振动 / IMU 削波（`px4-vibration` / `px4-imu-clipping`）

遍历全部 `vehicle_imu_status` 实例取最差 IMU。

| 指标 | 字段 | warning | critical | 来源 / 状态 |
| --- | --- | --- | --- | --- |
| 高频振动均值 | `accel_vibration_metric`（1.14+） | ≥ 4.905 m/s² | ≥ 9.81 m/s² | Flight Review "Vibration Metrics" 背景色带 green/orange/red = 4.905 / 9.81（0.5g / 1g） |
| 加速度标准差 RSS 均值（旧固件） | `stddev_accel_{x,y,z}[_m_s2]` | ≥ 0.5 m/s² | ≥ 1.0 m/s² | 暂定 |
| 削波次数（全日志增量，取最差轴） | `accel_clipping[0..2]`（累计计数，理想值 0） | ≥ 100 次（1~99 报 info） | ≥ 1000 次 | 暂定。字段语义见 `VehicleImuStatus.msg`："total clipping per axis" |

注意：

- `accel_clipping` 是**单调递增的累计次数**，不是百分比；用 `max-min` 取日志区间增量。
- pyulog 数组字段展开为方括号名（`accel_clipping[0]`），旧版才可能出现下划线形式。
- 1.14 起 `stddev_accel_*` 被 `mean_accel[3] / var_accel[3]` 取代，新日志以
  `accel_vibration_metric` 为准（`var_accel` 量纲与旧 stddev 不可直接比较，暂不使用）。

## R2 EKF 创新检验（`px4-ekf-innovation`）

遍历全部 `estimator_status` 实例取最差通道。

- **1.15+ 固件**：字段已改为连续的 `*_test_ratio`（创新值 / 检验门限，**≥ 1.0 即该路观测被 EKF 拒绝**）。
  检查 `vel / pos / hgt / hdg(旧固件为 mag) / tas / hagl / beta` 八路，NaN 不参与统计，
  被拒样本 **≥ 3 个**且占比 ≥ 1% 报 warning，≥ 5% 报 critical（占比阈值暂定）。
- **旧固件**：`innovation_check_flags` 置位占比，同样要求置位样本 ≥ 3。位定义来源
  `EstimatorStatus.msg`（v1.14）：0 速度 / 1 水平位置 / 2 垂直位置 / 3-5 磁罗盘 XYZ /
  6 航向 / 7 空速 / 8 侧滑 / 9 离地高度 / 10-11 光流 XY。

参考：Flight Review `configured_plots.py` 对新旧两种字段的兼容处理。

## R3 电源 / 单电芯欠压（`px4-power-cell-voltage`）

取 `battery_status` 第一个实例。

1. 优先用实测电芯电压 `voltage_cell_v[0..13]`：所有非零电芯在全时段的最小值；
2. 缺失时回退 `min(voltage_v) / max(cell_count)`；两者都没有报 info（无法判断）。

| 阈值 | warning | critical | 状态 |
| --- | --- | --- | --- |
| 单电芯最低电压 | < 3.70 V | < 3.55 V | 暂定 |

文档：<https://docs.px4.io/main/en/config/battery.html>

## 校准记录（2026-09-14，5 个日志）

| 日志 | 机型 | 时长 | findings | 备注 |
| --- | --- | --- | --- | --- |
| `39f26cce…ulg` | fixed_wing | 203s | vibration warning（均值 4.985，贴线）、clipping warning（120 次） | 橙色区间，合理 |
| `95b077d9…ulg` | rover | 73s | 无 | 干净 |
| `ce302d3b…ulg` | fixed_wing | 633s | 电源 critical（3.339 V/cell，飞行末段低压）、EKF 空速 warning（1479 采样中 17 次被拒，max ratio 2.0，确有 `airspeed_validated`）、clipping info（81） | 合理 |
| pyulog `sample.ulg` | rotary_wing | 182s | 无 | 旧格式兼容 |
| pyulog `sample_log_small.ulg` | rotary_wing | 7s | 无 | 旧格式兼容（含 2016 年风格字段） |

## 冲刺 2 升级：四层架构 + 8 条规则 + 故障库匹配

实现见 [ulog_checks.py](ulog_checks.py)（阈值在同目录 `px4-thresholds.toml`），方法论见
[knowledge-authoring.md](../knowledge-authoring.md)。引擎输出新增 `tags / guardTags /
phases / matchedFaults / checksRun / checksSkipped`。

| 规则 | ruleId | 标签 / 阈值 |
| --- | --- | --- |
| 振动 / 削波（原有 3 项） | `px4-vibration` `px4-imu-clipping` | tag `high_vibration`（仅 warning/critical，info 不打） |
| EKF 创新检验 + 硬故障位 | `px4-ekf-innovation` `px4-ekf-fault` | tag `ekf_innovation_failure`；`filter_fault_flags` 只有 bit0-5（位置/速度/高度/偏航核心融合）报 critical，bit10（视觉拒绝）未用 VIO 时仅 info |
| 电源（单芯电压 + 余量 + 飞行中持续压降） | `px4-power-cell-voltage` `px4-power-remaining` `px4-power-sag` | tag `battery_voltage_drop`；压降用 armed 段剔除起飞冲击 5s、尾段 20% 中位数 |
| CPU 负载 | `px4-cpu-load` | `cpuload.load` p95/max 90%/95% |
| GPS 健康 | `px4-gps-eph` `px4-gps-sats` `px4-gps-jump` | tag `gps_eph_high`/`gps_jump`；eph p95 5/10m、卫星 ≤6/8、lat/lon 差分速度 >50m/s 跳点 |
| Failsafe / 失联边沿 | `px4-failsafe-*` | 只报置位沿，且必须落在 armed 区间（借鉴 robotto）；tag `rc_lost`/`failsafe` |
| 模式抖动 | `px4-mode-thrash` | nav_state 变化 >12 次 |
| 日志消息聚合 | `px4-log-errors` `px4-log-warnings` | `logged_messages` level≤3 聚合为 critical，附最多 5 条带时间戳原文 |

飞行阶段（`phases`）：只从 **armed 段**的 nav_state 推断（takeoff/hover/maneuver/
fw_cruise/landing/vtol_transition）；未解锁的地面操作不产生阶段、不参与故障库匹配。

数据质量 guard：`insufficient_data`（armed <60s）、`restart_detected`（topic 时间戳回退）、
`topic_missing:{name}`、`log_dropouts_high`（丢包 >1s）。命中 `insufficient_data` 时
短路故障库匹配，只描述现象不出根因。

故障库匹配：`px4-fault-kb.yaml`（同目录）按 trigger_tags ∩ tags + flight_phase + exclude_tags
确定性检索，只把命中条目（possibleRootCause/troubleshootingSteps/note）注入 LLM；
LLM 的 GJB-841 报告根因不得超出命中条目。

## robotto 8 条 ↔ 我们 15 条（阈值校准基线）

fork 底座是 robotto-xyz/ai-drone-toolkit 的 `diagnose_flight`（`robotto_drone_core.ulog_tools.py`）。
下表逐条对齐**原版 8 条**与**我们的实现**：读取字段、阈值、改了什么、为什么改。
**后续校准阈值以本表为基线**——改阈值时同步 `px4-thresholds.toml` 与本表，并在"校准记录"追加样本依据。

| robotto 检查（severity） | 原版字段 / 阈值 | 我们的 ruleId / 字段 | 我们的阈值 | 改了什么 · 为什么 |
| --- | --- | --- | --- | --- |
| **1 日志错误** logged_errors（ERR/CRIT 每条 critical） | `logged_messages`，按 syslog level 分桶 | `px4-log-errors` / `px4-log-warnings` | level≤3 聚合 critical（附 ≤5 条带时间戳原文），warning 单列 | 原版每条报错各成一条 finding，噪声大且刷屏；聚合后可溯源又不淹没主故障。逻辑沿用"冒烟的枪" |
| **2 EKF 创新检验** ekf_innovations | `estimator_status.{vel,pos,hgt,mag}_test_ratio`；峰值 >0.5 warn / ≥1.0 crit | `px4-ekf-innovation`；八路 `vel/pos/hgt/hdg/tas/hagl/beta`（1.15+ 在 `estimator_innovation_test_ratios`，旧版回退 `innovation_check_flags` 位置位占比） | 被拒样本**占比** ≥1% warn / ≥5% crit（且被拒样本 ≥3）；**峰值**沿用 0.5/1.0 | 原版只看瞬时峰值，1 个毛刺就 critical 误报；改为"占比+最小样本数"去毛刺，并扩到 8 路、做 1.15 字段适配 |
| **3 EKF 硬故障位** ekf_faults | `estimator_status` fault flags 置位 | `px4-ekf-fault`；`filter_fault_flags` + `nan_flags` | bit0-5（位置/速度/高度/偏航核心融合拒绝）critical；**bit10（视觉拒绝）未用 VIO 时仅 info** | 修了一个实测误报：未配视觉/光流的常规机也会置 bit10，原版会误判成"EKF 核心拒绝" |
| **4 振动** vibration | `estimator_status.vibe[2]`（高频 Δv）峰值 30 / 60 m/s | `px4-vibration` + `px4-imu-clipping`；`vehicle_imu_status.accel_vibration_metric`（旧版回退 `stddev_accel_*` RSS）+ `accel_clipping[]` | 振动 4.905 / 9.81 m/s²；stddev 0.5/1.0（暂定）；削波累计增量 100 warn / 1000 crit，1-99 info | **量纲/口径不同**：vibe[2] 是高频速度积分（30/60），`accel_vibration_metric` 是等效加速度，对应 Flight Review 色带 0.5g/1g。逐 IMU 实例取最差，旧日志回退 stddev；削波看单调累计计数的区间增量 |
| **5 CPU** cpu_load | `cpuload.load` 峰值 0.90 / 0.95 | `px4-cpu-load`；`cpuload.load` | 0.90 / 0.95 | **完全沿用**，阈值有官方依据未改 |
| **6 电量** battery | `battery_status.remaining` 最低 ≤20% / ≤10% | `px4-power-remaining`（余量）+ `px4-power-cell-voltage`（单芯电压）+ `px4-power-sag`（飞行中持续压降） | 余量 20%/10%（沿用）；单芯 <3.70/3.55 V（暂定）；armed 段剔除起飞冲击 5s 后尾段 20% 中位数压降 ≥0.30 V | 原版只看剩余百分比，电量估算不准时会漏报；补单芯**实测电压**和**飞行中 sag**（扣掉着陆），更贴近真实炸机电芯低压。cell 阈值待真实日志钉死 |
| **7 Failsafe / 失联** failsafe | failsafe / engine / mission 失效置位 critical；RC / data-link 失联**仅 armed 段** warning；RTL/DESCEND/TERMINATION critical | `px4-failsafe-{flag}`、`px4-failsafe-nav`；`vehicle_status.{failsafe,engine_failure,mission_failure,rc_signal_lost,data_link_lost}` + `nav_state` | 沿用同一严重度矩阵；只报**置位沿**且必须落在 armed 区间，附 `t=` 秒戳 | 逻辑基本沿用 robotto（边沿 + armed 门限是它最有价值的经验）；改成只报边沿避免长时段 failsafe 重复刷 finding；nav 模式映射 `5=AUTO_RTL / 12=DESCEND / 13=TERMINATION / 18=AUTO_LAND` |
| **8 模式抖动** mode_thrash | `nav_state` 变化次数 >12 warn | `px4-mode-thrash`；`vehicle_status.nav_state` list_value_changes | >12 | **完全沿用** robotto 阈值（经验值，暂无更多样本推翻） |

**我们新增（robotto 没有，共 7 组，阈值多为暂定，靠校准日志钉死）：**

| # | 检查组 / ruleId | 读取字段 | 阈值（warn / crit） | 依据 / 状态 |
| --- | --- | --- | --- | --- |
| 9 | GPS 健康 `px4-gps-eph` `px4-gps-sats` `px4-gps-jump` | `vehicle_gps_position.{eph,eph_m,satellites_used,lat,lon}` | eph p95 5 / 10 m；星数 <8 / <6；lat-lon 差分速度 >50 m/s 判跳点 | 暂定。robotto README 自己也把 GPS-accuracy 列为待办 |
| 10 | 电机输出不平衡 `px4-motor-unbalance` | `actuator_motors.control[]`（armed 悬停段，≥4 通道） | 通道均值离散度 0.08 / 0.15 | 暂定；对应 F008，磨损/桨不平衡在电机指令上的投影 |
| 11 | 陀螺零偏漂移 `px4-imu-bias-drift` | `estimator_sensor_bias.gyro_bias[]`（旧版回退 `estimator_status.states[10..12]`） | 零偏绝对值 0.02 / 0.05 rad/s（≈1.1/2.9 °/s）；armed 段漂移量同阈值；温度变化 15/25 °C 作 guard | 暂定；对应 F005。记录 `stats.gyroBiasSource` |
| 12 | 姿态跟踪 / 振荡 `px4-attitude-overshoot` `px4-attitude-oscillation` | `vehicle_attitude.q[]` vs `vehicle_attitude_setpoint.{q_d[],roll_body,pitch_body}`（机动段误差） | p99 误差旋翼 15/30°、**固定翼 25/40°**；振荡（误差过零频率）≥4 Hz 且 p99 同时超 warn | 暂定，机型差异化；对应 F006。强风时优先归因环境（wind guard） |
| 13 | 空速健康 `px4-airspeed-invalid` | `airspeed_validated.airspeed_sensor_measurement_valid`（固定翼巡航段） | 无效样本占比 ≥10% warn / ≥50% critical | 暂定；对应 F009 空速管堵塞/管路漏气 |
| 14 | VTOL 转换姿态 `px4-vtol-transition-attitude` | `vehicle_status.vtol_in_trans_mode` 时段的姿态倾角 | 转换段最大倾角 >8° warn | 工程师经验值；对应 F003 |
| 15 | 风扰估计 `px4-wind-strong` `px4-wind-moderate` | `estimator_wind.windspeed_{north,east}`（旧版 `wind_estimate`），p95 风速 | 8 / 12 m/s（≥8 同时打 `wind_strong` guard） | 暂定；对应 F010，作为**环境 guard** 收窄姿态/位置类结论 |

> 每条检查都要么进 `checksRun`，要么进 `checksSkipped`（带"topic 不在日志/无 armed 段/机型不适用"原因）；
> findings 按 critical→warning→info 排序。所有阈值集中在
> [px4-thresholds.toml](px4-thresholds.toml)（按 [振动]/[ekf]/[power]… 分组，每项带来源注释），
> **改阈值只动 TOML + 本表，不改判断逻辑。**

## 待办

- [ ] 扩到 10-20 个日志（多旋翼为主，覆盖固定翼 / VTOL / rover），优先钉死标注"暂定"的阈值：单芯电压/sag、GPS eph、电机离散度、陀螺零偏、姿态 p99、空速无效比、风 p95。
- [ ] 校准方法固定为：`probe_stats.py` dump 分布 → 定阈值 → `run_checks_locally.py` 全量回归 → 更新本表与"校准记录"，目标误报率 < 10%。
- [ ] 浏览器端实测 Pyodide 加载 / 解析耗时与内存。
- [x] ~~规则补齐 16 项~~：电机不平衡、IMU bias 漂移、空速、VTOL 转换姿态、风扰、GPS、姿态振荡已落地（现为 15 检查组）。
- [ ] 碰撞检测（collision_detected）：预留为 F001 的 exclude_tag，尚无数据源，待 IMU 冲击特征。
- [ ] LLM 输出后置校验：故障编号白名单，引用未注入故障模式时重生成。
- [ ] ArduPilot `.bin`（pymavlink + ardupilot-mcp 检查套件）。

## 固件版本与字段矩阵（PX4 1.15 起有破坏性变更）

引擎解析后先识别固件版本（`msg_info_dict.ver_sw_release`，打包格式
`major<<24 | minor<<16 | patch<<8 | type`），输出 `stats.firmware` 与
`stats.firmwareProfile`（`px4-1.15+` / `px4-legacy`），再按版本取字段；
版本缺失时退化为字段存在性判定。

| 数据 | 1.15+ | 旧固件 | 引擎处理 |
| --- | --- | --- | --- |
| 陀螺零偏 | `estimator_sensor_bias.gyro_bias[0..2]`（直读） | `estimator_status.states[10..12]` | 版本优先直读，回退 EKF 状态；`stats.gyroBiasSource` 记录实际来源 |
| EKF 状态 | `estimator_states.states[]` | `estimator_status.states[]` | 按 profile 顺序尝试 |
| 创新检验比例 | `estimator_innovation_test_ratios`（`gps_hvel/gps_hpos/baro_vpos/mag_field/heading/airspeed/beta/hagl`） | `estimator_status.*_test_ratio` + `innovation_check_flags` | 新 topic 命中即用，否则回退 |
| 风估计 | `estimator_wind` | `wind_estimate`（字段同名） | 版本优先新 topic |
| 姿态指令 | `vehicle_attitude_setpoint.q_d[0..3]`（四元数） | `roll_body` / `pitch_body` | 按版本选取，未知时按存在性 |
| 振动 | `vehicle_imu_status.accel_vibration_metric`（1.14+） | `stddev_accel_*` | 存在性判定 |

实测：1.16.0 / 1.17.0 走新 profile，1.11.2 与无版本号老日志走 legacy profile。
机型、固件、硬件型号一并进入报告与 GJB-841 报文。

## 报告页数据层（对标 Flight Review A/B/C）

`/analyze` 报告页在 findings 之外另有三类视图，数据由同一份端侧引擎按需抽取
（见 [web/workers/ulog-data-script.ts](../../../web/workers/ulog-data-script.ts)）：

- **A 图表**（[web/components/LogCharts.tsx](../../../web/components/LogCharts.tsx)）：
  振动 / IMU 原始加速度 / 姿态（四元数转欧拉）/ EKF `*_test_ratio` / 电源（多面板共享时间轴）/
  GPS，LTTB 降采样到 ≤3000 点，Plotly `plotly.js-basic-dist-min` 懒加载。
- **B 事件与参数**（[web/components/LogEventsParams.tsx](../../../web/components/LogEventsParams.tsx)）：
  系统信息、事件消息（含级别）、丢包、参数表（可过滤 + 变更标记）。
- **C 飞行阶段**：`vehicle_status.nav_state` 游程编码为阶段带，叠加到图表背景与顶部时间条。

图表分类色取自 dataviz 参考调色板（已对站点浅/深表面通过校验），状态色沿用站点
`critical/warning/ok` token；单 Y 轴约束，多量纲拆面板。本地回归入口
`scripts/calibrate/run_checks_locally.py --probe-data` 校验 manifest / info / series
的结构、JSON 合法性（NaN→null）与降采样点数。
