# PX4 `.ulg` 基础检查规则（冲刺 1）

> 对应实现：[web/workers/ulog-check-script.ts](../../web/workers/ulog-check-script.ts)
> 本地回归入口：[scripts/calibrate/run_checks_locally.py](../../scripts/calibrate/run_checks_locally.py)
>
> 铁律（CLAUDE.md 4.1）：所有数值判断只发生在确定性引擎；LLM 只翻译，不更改数值。
> 冲刺 2 目标：10-20 个真实日志校准，误报率 < 10%。标注"暂定"的阈值需在该阶段复核。

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

实现见 [ulog-check-script.ts](../../web/workers/ulog-check-script.ts)，方法论见
[knowledge-authoring.md](knowledge-authoring.md)。引擎输出新增 `tags / guardTags /
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

故障库匹配：`px4-fault-kb.yaml` 按 trigger_tags ∩ tags + flight_phase + exclude_tags
确定性检索，只把命中条目（possibleRootCause/troubleshootingSteps/note）注入 LLM；
LLM 的 GJB-841 报告根因不得超出命中条目。

## 待办

- [ ] 扩到 10-20 个日志（多旋翼为主，覆盖固定翼 / rover），校准削波、test ratio、电芯电压、eph、压降阈值。
- [ ] 浏览器端实测 Pyodide 加载 / 解析耗时与内存。
- [ ] 规则继续向 16 项补齐：电机输出不平衡（actuator_motors）、IMU bias 漂移、空速管、VTOL 转换姿态、碰撞检测、风扰等（标签已在故障库 F003/F005/F006/F008/F009/F010 预留）。
- [ ] LLM 输出后置校验：故障编号白名单，引用未注入故障模式时重生成。
- [ ] ArduPilot `.bin`（pymavlink + ardupilot-mcp 检查套件）。

## 报告页数据层（对标 Flight Review A/B/C）

`/analyze` 报告页在 findings 之外另有三类视图，数据由同一份端侧引擎按需抽取
（见 [web/workers/ulog-data-script.ts](../../web/workers/ulog-data-script.ts)）：

- **A 图表**（[web/components/LogCharts.tsx](../../web/components/LogCharts.tsx)）：
  振动 / IMU 原始加速度 / 姿态（四元数转欧拉）/ EKF `*_test_ratio` / 电源（多面板共享时间轴）/
  GPS，LTTB 降采样到 ≤3000 点，Plotly `plotly.js-basic-dist-min` 懒加载。
- **B 事件与参数**（[web/components/LogEventsParams.tsx](../../web/components/LogEventsParams.tsx)）：
  系统信息、事件消息（含级别）、丢包、参数表（可过滤 + 变更标记）。
- **C 飞行阶段**：`vehicle_status.nav_state` 游程编码为阶段带，叠加到图表背景与顶部时间条。

图表分类色取自 dataviz 参考调色板（已对站点浅/深表面通过校验），状态色沿用站点
`critical/warning/ok` token；单 Y 轴约束，多量纲拆面板。本地回归入口
`scripts/calibrate/run_checks_locally.py --probe-data` 校验 manifest / info / series
的结构、JSON 合法性（NaN→null）与降采样点数。

