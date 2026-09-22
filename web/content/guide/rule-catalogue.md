---
title: 现在规则清单
titleEn: Rule catalogue
description: 全部检查经验的清单：各自读什么字段、什么条件触发、产出什么标签。
descriptionEn: Every built-in check — the fields it reads, the condition that fires it, and the tags it emits.
group: 知识库
groupEn: Knowledge base
order: 12
---

引擎当前内置的 **31 条检查经验**，按执行位置（slot，即下面每一节的标题）分组。
每条给出：**适用**（固件 / 机架 / 依赖）、**取值**（读哪些字段、过哪个算子）、**判定**（自上而下
命中第一条即发射）、**产出**（写进报告的 check 名、喂故障库匹配的标签、UI 用的统计）。

判定阈值就写在各自的经验 YAML 里；slot 决定执行顺序（报告里的 F01、F02… 编号按发射顺序生成）。
所有判定都由确定性引擎在浏览器本地完成——LLM 只把结论翻译成中文报告，不参与任何数值判断。
本页在构建时从 `rules/*.yaml` 自动生成。

---

## airspeed（group: `airspeed`）

### px4-airspeed-invalid — 空速健康

- 文件：`rules/airspeed.yaml` ｜ 位置：group `airspeed` #1
- 适用：机架 fixed_wing ｜ 需要 airspeed_validated
- 取值：
- `cruise_ok = require_true(masked_any_in(vehicle_status.nav_state, vehicle_status.timestamp, ARMED_INTERVALS, codes=[3, 8]))`
- `invalid_frac = _try(ratio_equal( ref("airspeed_validated.airspeed_sensor_measurement_valid"), value=0))`
- `has_invalid = invalid_frac is not None`
- `tas_min = _try(min(airspeed_validated.true_airspeed_m_s))`
- 判定：
- **critical** ｜ `has_invalid and invalid_frac >= 0.50` ｜ 阈值 0.5 ｜ 标题「空速传感器在固定翼段大部分时间无效（\{invalid_frac:.0%\} 样本）」
- **warning** ｜ `has_invalid and invalid_frac >= 0.10` ｜ 阈值 0.1 ｜ 标题「空速传感器间歇无效（\{invalid_frac:.0%\} 样本）」
- 产出：check=airspeed，tag=low_airspeed，stats=airspeedInvalidRatio(round 3), airspeedMinM(round 1)

## attitude_tracking（group: `attitude_tracking`）

### px4-attitude-overshoot — 姿态跟踪超调

- 文件：`rules/attitude-overshoot.yaml` ｜ 位置：group `attitude_tracking` #1
- 适用：需要 vehicle_attitude ｜ 需要 vehicle_attitude_setpoint
- 取值：
- `p99, osc_hz, seg_n = _try(att_tracking_stats(
  att_q=vehicle_attitude.q,
  # 指令源：两路都给，**有 q_d 就用 q_d**（新版只记它），没有才回退 roll/pitch_body。
  # 顺序由算子定，规则不用管版本——按存在性挑，不按版本号挑。
  sp_q=ref("vehicle_attitude_setpoint.q_d"),
  sp_roll=ref("vehicle_attitude_setpoint.roll_body"),
  sp_pitch=ref("vehicle_attitude_setpoint.pitch_body"),
  att_ts=vehicle_attitude.timestamp,
  sp_ts=vehicle_attitude_setpoint.timestamp,
  intervals=ARMED_INTERVALS,
  tilt_min_deg=10.0, min_samples=50, sample_rate=50))`
- `seg_ok = seg_n > 50 if seg_n else False`
- `p99_stat = p99 if seg_ok else None`
- `osc_stat = osc_hz if seg_ok else None`
- 判定：
- **critical** ｜ `p99_stat >= 40.0 and IS_FIXED_WING` ｜ 阈值 25 ｜ 单位 ° ｜ 标题「姿态跟踪误差过大（p99 \{p99_stat:.1f\}°）」
- **warning** ｜ `p99_stat >= 25.0 and IS_FIXED_WING` ｜ 阈值 25 ｜ 单位 ° ｜ 标题「姿态跟踪误差偏大（p99 \{p99_stat:.1f\}°）」
- **critical** ｜ `p99_stat >= 30.0 and not IS_FIXED_WING` ｜ 阈值 15 ｜ 单位 ° ｜ 标题「姿态跟踪误差过大（p99 \{p99_stat:.1f\}°）」
- **warning** ｜ `p99_stat >= 15.0 and not IS_FIXED_WING` ｜ 阈值 15 ｜ 单位 ° ｜ 标题「姿态跟踪误差偏大（p99 \{p99_stat:.1f\}°）」
- 产出：check=attitude_tracking，tag=attitude_overshoot，stats=attitudeErrDegP99(round 1), attitudeOscHz(round 2)

### px4-attitude-oscillation — 姿态误差高频振荡

- 文件：`rules/attitude-oscillation.yaml` ｜ 位置：group `attitude_tracking` #2
- 适用：需要 vehicle_attitude ｜ 需要 vehicle_attitude_setpoint
- 取值：
- `p99, osc_hz, seg_n = _try(att_tracking_stats(
  att_q=vehicle_attitude.q,
  # 指令源：两路都给，**有 q_d 就用 q_d**（新版只记它），没有才回退 roll/pitch_body。
  # 顺序由算子定，规则不用管版本——按存在性挑，不按版本号挑。
  sp_q=ref("vehicle_attitude_setpoint.q_d"),
  sp_roll=ref("vehicle_attitude_setpoint.roll_body"),
  sp_pitch=ref("vehicle_attitude_setpoint.pitch_body"),
  att_ts=vehicle_attitude.timestamp,
  sp_ts=vehicle_attitude_setpoint.timestamp,
  intervals=ARMED_INTERVALS,
  tilt_min_deg=10.0, min_samples=50, sample_rate=50))`
- `seg_ok = seg_n > 50 if seg_n else False`
- `p99_stat = p99 if seg_ok else None`
- `osc_stat = osc_hz if seg_ok else None`
- 判定：
- **warning** ｜ `osc_stat >= 4.0 and p99_stat >= 25.0 and IS_FIXED_WING` ｜ 阈值 4 ｜ 单位 Hz ｜ 标题「姿态误差高频振荡（约 \{osc_stat:.1f\} Hz）」
- **warning** ｜ `osc_stat >= 4.0 and p99_stat >= 15.0 and not IS_FIXED_WING` ｜ 阈值 4 ｜ 单位 Hz ｜ 标题「姿态误差高频振荡（约 \{osc_stat:.1f\} Hz）」
- 产出：check=attitude_tracking，tag=attitude_overshoot，stats=attitudeErrDegP99(round 1), attitudeOscHz(round 2)

## battery（group: `battery`）

### px4-power-cell-voltage — 单电芯电压

- 文件：`rules/power-cell-voltage.yaml` ｜ 位置：group `battery` #1
- 适用：需要 battery_status
- 取值：
- `vmin, cell_min, cells, have_measured, have_fallback, no_cell = _try(cell_voltage_min( ref("battery_status[0].voltage_cell_v"), ref("battery_status[0].voltage_v"), ref("battery_status[0].voltage_filtered_v"), ref("battery_status[0].cell_count")))`
- 判定：
- **critical** ｜ `have_measured and cell_min < 3.55` ｜ 阈值 3.55 ｜ 单位 V/cell ｜ 标题「电芯电压严重过低」
- **critical** ｜ `have_fallback and not have_measured and cell_min < 3.55` ｜ 阈值 3.55 ｜ 单位 V/cell ｜ 标题「电芯电压严重过低」
- **warning** ｜ `have_measured and cell_min < 3.70` ｜ 阈值 3.7 ｜ 单位 V/cell ｜ 标题「电芯电压偏低」
- **warning** ｜ `have_fallback and not have_measured and cell_min < 3.70` ｜ 阈值 3.7 ｜ 单位 V/cell ｜ 标题「电芯电压偏低」
- **info** ｜ `no_cell` ｜ 标题「日志缺少电芯电压与 cell_count，未做单电芯判断」
- 产出：check=battery，tag=battery_voltage_drop，stats=batteryVoltageMin(round 2), batteryCellCount(round -), batteryCellVoltageMin(round 3)

### px4-power-sag — 飞行中持续压降

- 文件：`rules/power-sag.yaml` ｜ 位置：group `battery` #2
- 适用：需要 battery_status
- 取值：
- `cell_min_t = rows_aggregate(ref("battery_status[0].voltage_cell_v"), agg="min", gt=0)`
- `drop, tail = head_tail_median_drop(cell_min_t, ref("battery_status[0].timestamp"), ARMED_INTERVALS, skip_first_s=5, min_seg=20)`
- 判定：
- **warning** ｜ `drop >= 0.30 and tail < 3.70` ｜ 阈值 0.3 ｜ 单位 V ｜ 标题「飞行中单电芯持续压降 \{drop:.2f\} V（尾段中位 \{tail:.2f\} V）」
- 产出：check=battery，tag=battery_voltage_drop，stats=batteryCellSagFlight(round 3)

### px4-power-remaining — 电池剩余电量

- 文件：`rules/power-remaining.yaml` ｜ 位置：group `battery` #3
- 适用：需要 battery_status
- 取值：
- `rem = min_ge(ref("battery_status[0].remaining"), ge=0)`
- `rem_pct = rem * 100`
- 判定：
- **critical** ｜ `rem <= 0.10` ｜ 阈值 0.1 ｜ 标题「电池剩余电量极低（\{rem_pct:.0f\}%）」
- **warning** ｜ `rem <= 0.20` ｜ 阈值 0.2 ｜ 标题「电池剩余电量偏低（\{rem_pct:.0f\}%）」
- 产出：check=battery，tag=battery_voltage_drop，stats=batteryRemainingMin(round 3)

## cpu（group: `cpu`）

### px4-cpu-load — CPU 负载

- 文件：`rules/cpu-load.yaml` ｜ 位置：group `cpu` #—
- 适用：需要 cpuload
- 取值：
- `cpu_max = max(cpuload.load)`
- 判定：
- **critical** ｜ `cpu_max >= 0.95` ｜ 阈值 0.95 ｜ 标题「CPU 负载峰值 \{cpu_max:.0%\} 超阈值」
- **warning** ｜ `cpu_max >= 0.90` ｜ 阈值 0.9 ｜ 标题「CPU 负载峰值 \{cpu_max:.0%\} 偏高」
- 产出：check=cpu_load，stats=cpuLoadMax(round 3)

## ekf_faults（group: `ekf_faults`）

### px4-ekf-fault — EKF 融合硬故障

- 文件：`rules/ekf-faults.yaml` ｜ 位置：group `ekf_faults` #1
- 适用：需要 estimator_status
- 取值：
- `fault_raw = _try(bit_or_max( ref("estimator_status[:].filter_fault_flags")))`
- `fault_union = _try(coalesce(fault_raw, 0))`
- `crit_bits = _try(has_bits(fault_union, 63))`
- 判定：
- **critical** ｜ `crit_bits` ｜ 阈值 0 ｜ 标题「EKF 报告核心融合硬故障（filter_fault_flags=\{fault_union\}）」
- **info** ｜ `fault_union > 0 and not crit_bits` ｜ 阈值 0 ｜ 标题「EKF 报告非核心辅助传感器融合拒绝（filter_fault_flags=\{fault_union\}，常见为未使用视觉/光流）」
- 产出：check=ekf_faults，tag=ekf_innovation_failure

## ekf_innovations（group: `ekf_innovations`）

### px4-ekf-innovation — EKF 创新检验

- 文件：`rules/ekf-innovation.yaml` ｜ 位置：group `ekf_innovations` #1
- 适用：需要 estimator_status
- 取值：
- `frac, names, inst = worst_reject_ratio(
ref("estimator_status[:].innovation_check_flags"),
ref("estimator_status[:].vel_test_ratio"),
ref("estimator_status[:].pos_test_ratio"),
ref("estimator_status[:].hgt_test_ratio"),
ref("estimator_status[:].hdg_test_ratio"),
ref("estimator_status[:].mag_test_ratio"),
ref("estimator_status[:].tas_test_ratio"),
ref("estimator_status[:].hagl_test_ratio"),
ref("estimator_status[:].beta_test_ratio"),
primary_min=3,
primary_names=["速度", "水平位置", "垂直位置", "磁罗盘 X", "磁罗盘 Y", "磁罗盘 Z",
             "航向", "空速", "侧滑", "离地高度", "光流 X", "光流 Y"],
ge=1.0,                    # 通道判拒阈值：ratio >= 1 即该路观测被 EKF 拒绝
channel_min=3,             # 通道最少被拒样本数，去偶发尖峰毛刺
channel_labels=["速度", "水平位置", "垂直高度", "航向", "磁罗盘", "空速", "离地高度", "侧滑"],
fallback_label="未知通道")`
- `pct = frac * 100`
- 判定：
- **critical** ｜ `pct >= 5.0` ｜ 阈值 5 ｜ 单位 % ｜ 标题「EKF 创新检验持续失败（estimator #\{inst\}：\{names\}）」
- **warning** ｜ `pct >= 1.0` ｜ 阈值 1 ｜ 单位 % ｜ 标题「EKF 创新检验偶发失败（estimator #\{inst\}：\{names\}）」
- 产出：check=ekf_innovations，tag=ekf_innovation_failure，stats=ekfRejectRatioPct(round 2)

## failsafe（group: `failsafe`）

### px4-failsafe-failsafe — 失效保护触发

- 文件：`rules/failsafe.yaml` ｜ 位置：group `failsafe` #1
- 适用：总是适用
- 取值：
- `events = rising_edge_events(vehicle_status.failsafe, vehicle_status.timestamp, ARMED_INTERVALS, T0_US)`
- 判定：
- **critical** ｜ `True` ｜ 标题「触发失效保护（飞行中，t=\{t_s:.1f\}s）」
- 产出：check=failsafe

### px4-failsafe-rc_signal_lost — 遥控信号丢失

- 文件：`rules/failsafe.yaml` ｜ 位置：group `failsafe` #2
- 适用：总是适用
- 取值：
- `events = rising_edge_events(vehicle_status.rc_signal_lost, vehicle_status.timestamp, ARMED_INTERVALS, T0_US)`
- 判定：
- **warning** ｜ `True` ｜ 标题「遥控信号丢失（飞行中，t=\{t_s:.1f\}s）」
- 产出：check=failsafe

### px4-failsafe-data_link_lost — 数据链路丢失

- 文件：`rules/failsafe.yaml` ｜ 位置：group `failsafe` #3
- 适用：总是适用
- 取值：
- `events = rising_edge_events(vehicle_status.data_link_lost, vehicle_status.timestamp, ARMED_INTERVALS, T0_US)`
- 判定：
- **warning** ｜ `True` ｜ 标题「数据链路丢失（飞行中，t=\{t_s:.1f\}s）」
- 产出：check=failsafe

### px4-failsafe-engine_failure — 动力故障保护

- 文件：`rules/failsafe.yaml` ｜ 位置：group `failsafe` #4
- 适用：总是适用
- 取值：
- `events = rising_edge_events(vehicle_status.engine_failure, vehicle_status.timestamp, ARMED_INTERVALS, T0_US)`
- 判定：
- **critical** ｜ `True` ｜ 标题「发动机/动力故障保护（飞行中，t=\{t_s:.1f\}s）」
- 产出：check=failsafe

### px4-failsafe-mission_failure — 任务失效保护

- 文件：`rules/failsafe.yaml` ｜ 位置：group `failsafe` #5
- 适用：总是适用
- 取值：
- `events = rising_edge_events(vehicle_status.mission_failure, vehicle_status.timestamp, ARMED_INTERVALS, T0_US)`
- 判定：
- **critical** ｜ `True` ｜ 标题「任务失效保护（飞行中，t=\{t_s:.1f\}s）」
- 产出：check=failsafe

### px4-failsafe-nav — 失效保护导航状态

- 文件：`rules/failsafe.yaml` ｜ 位置：group `failsafe` #6
- 适用：需要 vehicle_status
- 取值：
- `events = step_into_events(vehicle_status.nav_state, vehicle_status.timestamp, ARMED_INTERVALS, T0_US, codes={5: "AUTO_RTL", 12: "DESCEND", 13: "TERMINATION", 18: "LAND"})`
- 判定：
- **critical** ｜ `True` ｜ 标题「飞行中导航状态切换为 \{name\}（t=\{t_s:.1f\}s）」
- 产出：check=failsafe

## gps_health（group: `gps_health`）

### px4-gps-eph — GPS 水平位置误差

- 文件：`rules/gps-eph.yaml` ｜ 位置：group `gps_health` #1
- 适用：需要 vehicle_gps_position
- 取值：
- `eph_pos = keep_gt(vehicle_gps_position.eph, gt=0)`
- `eph_m = eph_pos * 0.001`
- `e_p95 = percentile(eph_m, p=95)`
- `e_max = max(eph_m)`
- 判定：
- **warning** ｜ `e_p95 >= 10.0` ｜ 阈值 10 ｜ 单位 m ｜ 标题「GPS 水平位置误差持续偏大（p95 \{e_p95:.1f\} m）」
- **info** ｜ `e_p95 >= 5.0` ｜ 阈值 5 ｜ 单位 m ｜ 标题「GPS 水平位置误差偶发偏大（p95 \{e_p95:.1f\} m）」
- 产出：check=gps_health，tag=gps_eph_high，stats=gpsEphP95M(round 2), gpsEphMaxM(round 2)

### px4-gps-sats — GPS 卫星数

- 文件：`rules/gps-sats.yaml` ｜ 位置：group `gps_health` #2
- 适用：需要 vehicle_gps_position
- 取值：
- `s_min_raw = min(vehicle_gps_position.satellites_used)`
- `s_min = to_int(s_min_raw)`
- 判定：
- **warning** ｜ `s_min <= 6` ｜ 阈值 8 ｜ 单位 颗 ｜ 标题「GPS 卫星数最少仅 \{s_min\} 颗」
- 产出：check=gps_health，tag=gps_eph_high，stats=gpsSatellitesMin(round -)

### px4-gps-jump — GPS 位置跳变

- 文件：`rules/gps-jump.yaml` ｜ 位置：group `gps_health` #3
- 适用：需要 vehicle_gps_position
- 取值：
- `step = _try(adjacent_speed_mps( ref("vehicle_gps_position.latitude_deg", "vehicle_gps_position.lat", unit="deg"), ref("vehicle_gps_position.longitude_deg", "vehicle_gps_position.lon", unit="deg"), ref("vehicle_gps_position.timestamp")))`
- `njump = _try(to_int(count_above(step, gt=50.0)))`
- 判定：
- **warning** ｜ `njump >= 3` ｜ 阈值 3 ｜ 单位 次 ｜ 标题「GPS 位置出现 \{njump\} 次异常跳变（>50 m/s）」
- 产出：check=gps_health，tag=gps_jump，stats=gpsJumpCount(round -)

## 数据质量 guard（group: `guards`）

### px4-guard-restart — 数据质量-中途重启

- 文件：`rules/guard-restart.yaml` ｜ 位置：group `guards` #1
- 适用：总是适用
- 取值：
- （无 compute）
- 判定：
- guard：当 `RESTART_DETECTED` 时打标签 `restart_detected`
- 产出：—

### px4-guard-topic-missing — 数据质量-关键 topic 缺失

- 文件：`rules/guard-topic-missing.yaml` ｜ 位置：group `guards` #2
- 适用：总是适用
- 取值：
- （无 compute）
- 判定：
- guard：当 `not has_topic('vehicle_status')` 时打标签 `topic_missing:vehicle_status`
- guard：当 `not has_topic('battery_status')` 时打标签 `topic_missing:battery_status`
- guard：当 `not has_topic('estimator_status')` 时打标签 `topic_missing:estimator_status`
- 产出：—

### px4-guard-log-dropouts — 数据质量-日志丢包

- 文件：`rules/guard-log-dropouts.yaml` ｜ 位置：group `guards` #3
- 适用：总是适用
- 取值：
- （无 compute）
- 判定：
- guard：当 `DROPOUT_MS > 1000` 时打标签 `log_dropouts_high`
- 产出：—

## 数据质量 guard（最早执行）（group: `guards_early`）

### px4-guard-short-log — 数据质量-短日志

- 文件：`rules/guard-short-log.yaml` ｜ 位置：group `guards_early` #1
- 适用：总是适用
- 取值：
- （无 compute）
- 判定：
- guard：当 `ARMED_S > 0 and ARMED_S < 60` 时打标签 `insufficient_data`
- guard：当 `ARMED_S == 0 and DURATION_S < 60` 时打标签 `insufficient_data`
- 产出：—

## imu_bias（group: `imu_bias`）

### px4-imu-bias-drift — 陀螺零偏漂移

- 文件：`rules/imu-bias.yaml` ｜ 位置：group `imu_bias` #1
- 适用：不跑当 not HAS_ARMED
- 取值：
- `bx, by, bz, bts, src_text = _try(gyro_bias_series( ref("estimator_sensor_bias[0].gyro_bias"), ref("estimator_sensor_bias[0].timestamp"), ref("estimator_states[0].states"), ref("estimator_states[0].timestamp"), ref("estimator_status[0].states"), ref("estimator_status[0].timestamp"), slot=10, sources=["estimator_sensor_bias.gyro_bias[]",
     "estimator_states.states[10..12]",
     "estimator_status.states[10..12]"]))`
- `worst_abs, worst_axis, worst_drift, drift_axis = gyro_bias_worst( bx, by, bz, bts, ARMED_INTERVALS, labels=["X", "Y", "Z"], min_count=10)`
- `temp_range = _try(max_temp_range(ref("vehicle_imu_status[0].temperature_gyro"), ref("vehicle_air_data[0].ambient_temperature")))`
- `bias_stat = _try(larger(worst_abs, worst_drift))`
- 判定：
- **critical** ｜ `worst_abs >= 0.05 or worst_drift >= 0.05` ｜ 阈值 0.02 ｜ 单位 rad/s ｜ 标题「陀螺零偏异常（轴 \{worst_axis\}：绝对值 \{worst_abs:.4f\} rad/s，漂移 \{worst_drift:.4f\} rad/s）」
- **warning** ｜ `worst_abs >= 0.02 or worst_drift >= 0.02` ｜ 阈值 0.02 ｜ 单位 rad/s ｜ 标题「陀螺零偏异常（轴 \{worst_axis\}：绝对值 \{worst_abs:.4f\} rad/s，漂移 \{worst_drift:.4f\} rad/s）」
- guard：当 `temp_range >= 15` 时打标签 `temperature_change_large`
- 产出：check=imu_bias，tag=imu_bias_drift，stats=gyroBiasMaxRadS(round 4), gyroBiasDriftRadS(round 4), gyroBiasSource(round -), imuTempRangeC(round 1)

## logged_messages（group: `logged_messages`）

### px4-log-errors — 日志错误消息

- 文件：`rules/logged-errors.yaml` ｜ 位置：group `logged_messages` #1
- 适用：总是适用
- 取值：
- `n = count_items(MESSAGES, key="level_name", in_list=["EMERGENCY", "ALERT", "CRITICAL", "ERROR"])`
- `samples = take_items(MESSAGES, key="level_name", in_list=["EMERGENCY", "ALERT", "CRITICAL", "ERROR"], limit=5, clip={"message": 200}, drop=["level", "level_name"])`
- 判定：
- **critical** ｜ `n > 0` ｜ 阈值 0 ｜ 单位 条 ｜ 标题「日志中出现 \{n\} 条 ERROR 及以上消息」
- 产出：check=logged_messages

### px4-log-warnings — 日志警告消息

- 文件：`rules/logged-warnings.yaml` ｜ 位置：group `logged_messages` #2
- 适用：总是适用
- 取值：
- `n = count_items(MESSAGES, key="level_name", eq="WARNING")`
- `samples = take_items(MESSAGES, key="level_name", eq="WARNING", limit=5, clip={"message": 200}, drop=["level", "level_name"])`
- 判定：
- **warning** ｜ `n > 0` ｜ 阈值 0 ｜ 单位 条 ｜ 标题「日志中出现 \{n\} 条 WARNING 消息」
- 产出：check=logged_messages

## mode_thrash（group: `mode_thrash`）

### px4-mode-thrash — 飞行模式抖动

- 文件：`rules/mode-thrash.yaml` ｜ 位置：group `mode_thrash` #1
- 适用：需要 vehicle_status
- 取值：
- `n_changes_raw = edges_count(vehicle_status.nav_state)`
- `n_changes = to_int(n_changes_raw)`
- 判定：
- **warning** ｜ `n_changes > 12` ｜ 阈值 12 ｜ 单位 次 ｜ 标题「飞行模式切换 \{n_changes\} 次（>12），可能存在模式抖动」
- 产出：check=mode_thrash，stats=navStateChanges(round -)

## motor_balance（group: `motor_balance`）

### px4-motor-unbalance — 电机输出不平衡

- 文件：`rules/motor-balance.yaml` ｜ 位置：group `motor_balance` #1
- 适用：需要 actuator_motors
- 取值：
- `mts = actuator_motors.timestamp`
- `cols = actuator_motors.control`
- `seg = active_window_mask(mts, ARMED_INTERVALS, vehicle_status.nav_state, vehicle_status.timestamp, codes=[2, 4, 6, 14, 21], min_active=20)`
- `spread, busiest, idlest, n_active = column_spread_stats( cols, seg, min_mean=0.01, min_channels=4)`
- 判定：
- **critical** ｜ `spread >= 0.15` ｜ 阈值 0.15 ｜ 标题「电机输出不平衡（悬停段通道 \{busiest\} 与 \{idlest\} 差 \{spread:.3f\}）」
- **warning** ｜ `spread >= 0.08` ｜ 阈值 0.08 ｜ 标题「电机输出差异偏大（通道 \{busiest\} 与 \{idlest\} 差 \{spread:.3f\}）」
- 产出：check=motor_balance，tag=motor_output_unbalance，stats=motorControlSpread(round 3), motorCountActive(round -)

## vibration（group: `vibration`）

### px4-vibration — 高频振动

- 文件：`rules/vibration.yaml` ｜ 位置：group `vibration` #1
- 适用：需要 vehicle_imu_status
- 取值：
- `vibe_mean, vibe_p95, vibe_max, imu_idx = worst_mean_stats(
ref("vehicle_imu_status[:].accel_vibration_metric"), min_mean=0)`
- 判定：
- **critical** ｜ `vibe_mean >= 9.81` ｜ 阈值 9.81 ｜ 单位 m/s^2 ｜ 标题「高频振动严重超标（IMU #\{imu_idx\}）」
- **warning** ｜ `vibe_mean >= 4.905` ｜ 阈值 4.905 ｜ 单位 m/s^2 ｜ 标题「高频振动偏大（IMU #\{imu_idx\}）」
- 产出：check=vibration，tag=high_vibration，stats=imuAccelVibrationMean(round 3), imuAccelVibrationP95(round 3), imuAccelVibrationMax(round 3)

### px4-imu-clipping — 加速度计削波

- 文件：`rules/imu-clipping.yaml` ｜ 位置：group `vibration` #3
- 适用：需要 vehicle_imu_status
- 取值：
- `clip, clip_idx, clip_axis = worst_column_delta(
ref("vehicle_imu_status[:].accel_clipping", alias="clipping"))`
- `clip_stat = clip if clip > 0 else None`
- 判定：
- **critical** ｜ `clip >= 1000` ｜ 阈值 1000 ｜ 单位 count ｜ 标题「加速度计削波严重：IMU #\{clip_idx\} 轴 \{clip_axis\} 全日志累计削波 \{clip\} 次（理想值为 0）」
- **warning** ｜ `clip >= 100` ｜ 阈值 100 ｜ 单位 count ｜ 标题「检测到明显加速度计削波：IMU #\{clip_idx\} 轴 \{clip_axis\} 全日志累计削波 \{clip\} 次（理想值为 0）」
- **info** ｜ `clip > 0` ｜ 阈值 0 ｜ 单位 count ｜ 标题「偶发加速度计削波：IMU #\{clip_idx\} 轴 \{clip_axis\} 全日志累计削波 \{clip\} 次（理想值为 0）」
- 产出：check=vibration，tag=high_vibration，stats=imuAccelClippingCountMax(round -)

## vtol_transition（group: `vtol_transition`）

### px4-vtol-transition-attitude — VTOL 转换姿态越限

- 文件：`rules/vtol-transition.yaml` ｜ 位置：group `vtol_transition` #1
- 适用：需要 vtol_vehicle_status
- 取值：
- `trans_n = _try(count_above(vtol_vehicle_status.vtol_in_trans_mode, gt=0))`
- `trans_n_i = _try(to_int(trans_n))`
- `trans_mask = _try(fill_to(ref("vtol_vehicle_status.vtol_in_trans_mode"), ref("vtol_vehicle_status.timestamp"), ref("vehicle_attitude.timestamp")))`
- `roll, pitch, yaw = _try(quat_to_euler(ref("vehicle_attitude.q")))`
- `tilt_max = _try(masked_absmax(larger(abs_values(roll), abs_values(pitch)), trans_mask))`
- `trans_cnt = _try(count_true(trans_mask))`
- `enough = _try(trans_cnt > 5)`
- `has_tilt = tilt_max is not None`
- `tilt_stat = _try(tilt_max if enough else None)`
- 判定：
- **warning** ｜ `has_tilt and enough and tilt_max > 8.0` ｜ 阈值 8 ｜ 单位 ° ｜ 标题「VTOL 转换阶段姿态越限（最大 \{tilt_max:.1f\}°，限值 8°）」
- 产出：check=vtol_transition，tag=vtol_convert_attitude_over，stats=vtolTransitionSamples(round -), vtolTransitionMaxTiltDeg(round 1)

## wind_estimate（group: `wind_estimate`）

### px4-wind-estimate — 风扰估计

- 文件：`rules/wind-estimate.yaml` ｜ 位置：group `wind_estimate` #1
- 适用：需要 estimator_wind 或 wind_estimate
- 取值：
- `w_p95 = percentile(
hypot(coalesce(ref("estimator_wind[0].windspeed_north"),
             ref("wind_estimate[0].windspeed_north")),
    coalesce(ref("estimator_wind[0].windspeed_east"),
             ref("wind_estimate[0].windspeed_east"))),
p=95)`
- 判定：
- **warning** ｜ `w_p95 >= 12.0` ｜ 阈值 8 ｜ 单位 m/s ｜ 标题「估计风速较大（p95 \{w_p95:.1f\} m/s）」
- **info** ｜ `w_p95 >= 8.0` ｜ 阈值 8 ｜ 单位 m/s ｜ 标题「估计风速偏大（p95 \{w_p95:.1f\} m/s）」
- guard：当 `w_p95 >= 8.0` 时打标签 `wind_strong`
- 产出：check=wind_estimate，tag=wind_disturb，stats=windSpeedP95M(round 1)
