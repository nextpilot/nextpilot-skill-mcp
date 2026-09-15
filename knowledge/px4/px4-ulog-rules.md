# PX4 `.ulg` 检查经验索引

> ⚠️ 本文件由 `python tools/px4/gen-rules-index.py` 从 `rules/*.yaml` 汇总生成，请勿手改；
> 改经验请直接改 `rules/<名字>.yaml`，然后重跑该脚本。
>
> 当前共 **32 条经验**（27 个 YAML 文件），算子 73 个。
> 判定阈值**就在各自经验文件里**（原先集中在 px4-thresholds.toml，已退场）。
>
> 铁律（CLAUDE.md 4.1）：所有数值判断只发生在确定性引擎；LLM 只翻译，不改数值。

## 怎么读这张表

- **slot** 决定执行位置：finding 的 `id`（F01、F02…）按发射顺序生成，所以 slot 必须与
  它所替换的原过程式检查位置一致；同一 slot 内按 `order` 排序。
- **取值** 是 `compute` 数据流（`topic.field` 或前序输出 → 算子）；字段名与阈值都写在经验里，
  算子本身不认识具体 topic。
- **判定** 自上而下命中第一条即发射；`expr` 走 AST 白名单求值（不用 eval）。
- **产出** 里的 check 名用于 `checksRun`/`checksSkipped`；tag 喂给故障知识库匹配。

---



## airspeed（slot: `airspeed`）

### px4-airspeed-invalid — 空速健康

- 文件：`rules/airspeed.yaml` ｜ 位置：slot `airspeed` #1
- 适用：firmware any ｜ airframe fixed_wing ｜ 依赖(任一) airspeed_validated ｜ 不适用当 airframe == 'unknown' ｜ 静默当 'vehicle_attitude_setpoint' not in topics
- 取值：
- `masked_any_in` codes=[3, 8] → **fw_cruise**
    输入：`vehicle_status.nav_state`, `vehicle_status.timestamp`, `armed_intervals`
- `require_true` → **cruise_ok**
    输入：`fw_cruise`
- `ratio_equal` value=0 → **invalid_frac**
    输入：`airspeed_validated.airspeed_sensor_measurement_valid`
- `is_not_none` → **has_invalid**
    输入：`invalid_frac`
- `min` → **tas_min**
    输入：`airspeed_validated.true_airspeed_m_s`
- 判定：
- **critical** ｜ `has_invalid and invalid_frac >= 0.50` ｜ 阈值 0.5 ｜ 标题「空速传感器在固定翼段大部分时间无效（{invalid_frac:.0%} 样本）」
- **warning** ｜ `has_invalid and invalid_frac >= 0.10` ｜ 阈值 0.1 ｜ 标题「空速传感器间歇无效（{invalid_frac:.0%} 样本）」
- 产出：check=airspeed，tag=low_airspeed，stats=airspeedInvalidRatio(round 3), airspeedMinM(round 1)


## attitude_tracking（slot: `attitude_tracking`）

### px4-attitude-overshoot — 姿态跟踪超调

- 文件：`rules/attitude-overshoot.yaml` ｜ 位置：slot `attitude_tracking` #1
- 适用：firmware any ｜ airframe any ｜ 依赖(全部) vehicle_attitude, vehicle_attitude_setpoint ｜ 不适用当 not has_armed
- 取值：
- `att_tracking_stats` tilt_min_deg=10.0, min_samples=50, sample_rate=50 → **p99, osc_hz, seg_n**
    输入：`vehicle_attitude.q`, `vehicle_attitude_setpoint.q_d`, `vehicle_attitude_setpoint.roll_body`, `vehicle_attitude_setpoint.pitch_body`, `vehicle_attitude.timestamp`, `vehicle_attitude_setpoint.timestamp`, `armed_intervals`, `fw_minor`
- `gt` → **seg_ok**
    输入：`seg_n`, `50`
- `value_if` → **p99_stat**
    输入：`seg_ok`, `p99`
- `value_if` → **osc_stat**
    输入：`seg_ok`, `osc_hz`
- 判定：
- **critical** ｜ `p99_stat >= 40.0 and is_fixed_wing` ｜ 阈值 25.0 ｜ 单位 ° ｜ 标题「姿态跟踪误差过大（p99 {p99_stat:.1f}°）」
- **warning** ｜ `p99_stat >= 25.0 and is_fixed_wing` ｜ 阈值 25.0 ｜ 单位 ° ｜ 标题「姿态跟踪误差偏大（p99 {p99_stat:.1f}°）」
- **critical** ｜ `p99_stat >= 30.0 and not is_fixed_wing` ｜ 阈值 15.0 ｜ 单位 ° ｜ 标题「姿态跟踪误差过大（p99 {p99_stat:.1f}°）」
- **warning** ｜ `p99_stat >= 15.0 and not is_fixed_wing` ｜ 阈值 15.0 ｜ 单位 ° ｜ 标题「姿态跟踪误差偏大（p99 {p99_stat:.1f}°）」
- 产出：check=attitude_tracking，tag=attitude_overshoot，stats=attitudeErrDegP99(round 1), attitudeOscHz(round 2)

### px4-attitude-oscillation — 姿态误差高频振荡

- 文件：`rules/attitude-oscillation.yaml` ｜ 位置：slot `attitude_tracking` #2
- 适用：firmware any ｜ airframe any ｜ 依赖(全部) vehicle_attitude, vehicle_attitude_setpoint ｜ 不适用当 not has_armed
- 取值：
- `att_tracking_stats` tilt_min_deg=10.0, min_samples=50, sample_rate=50 → **p99, osc_hz, seg_n**
    输入：`vehicle_attitude.q`, `vehicle_attitude_setpoint.q_d`, `vehicle_attitude_setpoint.roll_body`, `vehicle_attitude_setpoint.pitch_body`, `vehicle_attitude.timestamp`, `vehicle_attitude_setpoint.timestamp`, `armed_intervals`, `fw_minor`
- `gt` → **seg_ok**
    输入：`seg_n`, `50`
- `value_if` → **p99_stat**
    输入：`seg_ok`, `p99`
- `value_if` → **osc_stat**
    输入：`seg_ok`, `osc_hz`
- 判定：
- **warning** ｜ `osc_stat >= 4.0 and p99_stat >= 25.0 and is_fixed_wing` ｜ 阈值 4.0 ｜ 单位 Hz ｜ 标题「姿态误差高频振荡（约 {osc_stat:.1f} Hz）」
- **warning** ｜ `osc_stat >= 4.0 and p99_stat >= 15.0 and not is_fixed_wing` ｜ 阈值 4.0 ｜ 单位 Hz ｜ 标题「姿态误差高频振荡（约 {osc_stat:.1f} Hz）」
- 产出：check=attitude_tracking，tag=attitude_overshoot，stats=attitudeErrDegP99(round 1), attitudeOscHz(round 2)


## battery（slot: `battery`）

### px4-power-cell-voltage — 单电芯电压

- 文件：`rules/power-cell-voltage.yaml` ｜ 位置：slot `battery` #1
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) battery_status
- 取值：
- `cell_voltage_min` → **vmin, cell_min, cells, have_measured, have_fallback, no_cell**
    输入：`battery_status.voltage_cell_v`, `battery_status.voltage_v`, `battery_status.voltage_filtered_v`, `battery_status.cell_count`
- 判定：
- **critical** ｜ `have_measured and cell_min < 3.55` ｜ 阈值 3.55 ｜ 单位 V/cell ｜ 标题「电芯电压严重过低」
- **critical** ｜ `have_fallback and not have_measured and cell_min < 3.55` ｜ 阈值 3.55 ｜ 单位 V/cell ｜ 标题「电芯电压严重过低」
- **warning** ｜ `have_measured and cell_min < 3.70` ｜ 阈值 3.7 ｜ 单位 V/cell ｜ 标题「电芯电压偏低」
- **warning** ｜ `have_fallback and not have_measured and cell_min < 3.70` ｜ 阈值 3.7 ｜ 单位 V/cell ｜ 标题「电芯电压偏低」
- **info** ｜ `no_cell` ｜ 标题「日志缺少电芯电压与 cell_count，未做单电芯判断」
- 产出：check=battery，tag=battery_voltage_drop，stats=batteryVoltageMin(round 2), batteryCellCount(round -), batteryCellVoltageMin(round 3)

### px4-power-sag — 飞行中持续压降

- 文件：`rules/power-sag.yaml` ｜ 位置：slot `battery` #2
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) battery_status
- 取值：
- `rows_aggregate` agg=min, gt=0 → **cell_min_t**
    输入：`battery_status.voltage_cell_v`
- `head_tail_median_drop` skip_first_s=5, min_seg=20 → **drop, tail**
    输入：`cell_min_t`, `battery_status.timestamp`, `armed_intervals`
- 判定：
- **warning** ｜ `drop >= 0.30 and tail < 3.70` ｜ 阈值 0.3 ｜ 单位 V ｜ 标题「飞行中单电芯持续压降 {drop:.2f} V（尾段中位 {tail:.2f} V）」
- 产出：check=battery，tag=battery_voltage_drop，stats=batteryCellSagFlight(round 3)

### px4-power-remaining — 电池剩余电量

- 文件：`rules/power-remaining.yaml` ｜ 位置：slot `battery` #3
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) battery_status
- 取值：
- `min_ge` ge=0 → **rem**
    输入：`battery_status.remaining`
- `scale` factor=100 → **rem_pct**
    输入：`rem`
- 判定：
- **critical** ｜ `rem <= 0.10` ｜ 阈值 0.1 ｜ 标题「电池剩余电量极低（{rem_pct:.0f}%）」
- **warning** ｜ `rem <= 0.20` ｜ 阈值 0.2 ｜ 标题「电池剩余电量偏低（{rem_pct:.0f}%）」
- 产出：check=battery，tag=battery_voltage_drop，stats=batteryRemainingMin(round 3)


## cpu（slot: `cpu`）

### px4-cpu-load — CPU 负载

- 文件：`rules/cpu-load.yaml` ｜ 位置：slot `cpu` #—
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) cpuload
- 取值：
- `max` → **cpu_max**
    输入：`cpuload.load`
- 判定：
- **critical** ｜ `cpu_max >= 0.95` ｜ 阈值 0.95 ｜ 标题「CPU 负载峰值 {cpu_max:.0%} 超阈值」
- **warning** ｜ `cpu_max >= 0.90` ｜ 阈值 0.9 ｜ 标题「CPU 负载峰值 {cpu_max:.0%} 偏高」
- 产出：check=cpu_load，stats=cpuLoadMax(round 3)


## ekf_faults（slot: `ekf_faults`）

### px4-ekf-fault — EKF 融合硬故障

- 文件：`rules/ekf-faults.yaml` ｜ 位置：slot `ekf_faults` #1
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) estimator_status
- 取值：
- `bit_or_max` per_instance=True → **fault_raw**
    输入：`estimator_status.filter_fault_flags`
- `max_of_max` per_instance=True → **nan_raw**
    输入：`estimator_status.nan_flags`
- `coalesce` → **fault_union**
    输入：`fault_raw`, `0`
- `coalesce` → **nan_v**
    输入：`nan_raw`, `0`
- `to_int` → **nan_max**
    输入：`nan_v`
- `has_bits` → **crit_bits**
    输入：`fault_union`, `63`
- 判定：
- **critical** ｜ `nan_max > 0 or crit_bits` ｜ 阈值 0 ｜ 标题「EKF 报告核心融合硬故障（filter_fault_flags={fault_union}, nan_flags={nan_max}）」
- **info** ｜ `fault_union > 0 and not crit_bits and nan_max == 0` ｜ 阈值 0 ｜ 标题「EKF 报告非核心辅助传感器融合拒绝（filter_fault_flags={fault_union}，常见为未使用视觉/光流）」
- 产出：check=ekf_faults，tag=ekf_innovation_failure


## ekf_innovations（slot: `ekf_innovations`）

### px4-ekf-innovation — EKF 创新检验

- 文件：`rules/ekf-innovation.yaml` ｜ 位置：slot `ekf_innovations` #1
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) estimator_status
- 取值：
- `worst_reject_ratio` per_instance=True, primary_min=3, primary_names=['速度', '水平位置', '垂直位置', '磁罗盘 X', '磁罗盘 Y', '磁罗盘 Z', '航向', '空速', '侧滑', '离地高度', '光流 X', '光流 Y'], ge=1.0, channel_min=3, channel_labels=['速度', '水平位置', '垂直高度', '航向', '磁罗盘', '空速', '离地高度', '侧滑'], fallback_label=未知通道 → **frac, names, inst**
    输入：`estimator_status.innovation_check_flags`, `estimator_status.vel_test_ratio`, `estimator_status.pos_test_ratio`, `estimator_status.hgt_test_ratio`, `estimator_status.hdg_test_ratio`, `estimator_status.mag_test_ratio`, `estimator_status.tas_test_ratio`, `estimator_status.hagl_test_ratio`, `estimator_status.beta_test_ratio`
- `scale` factor=100 → **pct**
    输入：`frac`
- 判定：
- **critical** ｜ `pct >= 5.0` ｜ 阈值 5.0 ｜ 单位 % ｜ 标题「EKF 创新检验持续失败（estimator #{inst}：{names}）」
- **warning** ｜ `pct >= 1.0` ｜ 阈值 1.0 ｜ 单位 % ｜ 标题「EKF 创新检验偶发失败（estimator #{inst}：{names}）」
- 产出：check=ekf_innovations，tag=ekf_innovation_failure，stats=ekfRejectRatioPct(round 2)


## failsafe（slot: `failsafe`）

### px4-failsafe-failsafe — 失效保护触发

- 文件：`rules/failsafe.yaml` ｜ 位置：slot `failsafe` #1
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) vehicle_status
- 取值：
- `rising_edge_events` → **events**
    输入：`vehicle_status.failsafe`, `vehicle_status.timestamp`, `armed_intervals`, `t0_us`
- 判定：
- **critical** ｜ `True` ｜ 标题「触发失效保护（飞行中，t={t_s:.1f}s）」
- 产出：check=failsafe

### px4-failsafe-rc_signal_lost — 遥控信号丢失

- 文件：`rules/failsafe.yaml` ｜ 位置：slot `failsafe` #2
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) vehicle_status
- 取值：
- `rising_edge_events` → **events**
    输入：`vehicle_status.rc_signal_lost`, `vehicle_status.timestamp`, `armed_intervals`, `t0_us`
- 判定：
- **warning** ｜ `True` ｜ 标题「遥控信号丢失（飞行中，t={t_s:.1f}s）」
- 产出：check=failsafe

### px4-failsafe-data_link_lost — 数据链路丢失

- 文件：`rules/failsafe.yaml` ｜ 位置：slot `failsafe` #3
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) vehicle_status
- 取值：
- `rising_edge_events` → **events**
    输入：`vehicle_status.data_link_lost`, `vehicle_status.timestamp`, `armed_intervals`, `t0_us`
- 判定：
- **warning** ｜ `True` ｜ 标题「数据链路丢失（飞行中，t={t_s:.1f}s）」
- 产出：check=failsafe

### px4-failsafe-engine_failure — 动力故障保护

- 文件：`rules/failsafe.yaml` ｜ 位置：slot `failsafe` #4
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) vehicle_status
- 取值：
- `rising_edge_events` → **events**
    输入：`vehicle_status.engine_failure`, `vehicle_status.timestamp`, `armed_intervals`, `t0_us`
- 判定：
- **critical** ｜ `True` ｜ 标题「发动机/动力故障保护（飞行中，t={t_s:.1f}s）」
- 产出：check=failsafe

### px4-failsafe-mission_failure — 任务失效保护

- 文件：`rules/failsafe.yaml` ｜ 位置：slot `failsafe` #5
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) vehicle_status
- 取值：
- `rising_edge_events` → **events**
    输入：`vehicle_status.mission_failure`, `vehicle_status.timestamp`, `armed_intervals`, `t0_us`
- 判定：
- **critical** ｜ `True` ｜ 标题「任务失效保护（飞行中，t={t_s:.1f}s）」
- 产出：check=failsafe

### px4-failsafe-nav — 失效保护导航状态

- 文件：`rules/failsafe.yaml` ｜ 位置：slot `failsafe` #6
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) vehicle_status
- 取值：
- `step_into_events` codes={5: 'AUTO_RTL', 12: 'DESCEND', 13: 'TERMINATION', 18: 'LAND'} → **events**
    输入：`vehicle_status.nav_state`, `vehicle_status.timestamp`, `armed_intervals`, `t0_us`
- 判定：
- **critical** ｜ `True` ｜ 标题「飞行中导航状态切换为 {name}（t={t_s:.1f}s）」
- 产出：check=failsafe


## gps_health（slot: `gps_health`）

### px4-gps-eph — GPS 水平位置误差

- 文件：`rules/gps-eph.yaml` ｜ 位置：slot `gps_health` #1
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) vehicle_gps_position
- 取值：
- `keep_gt` gt=0 → **eph_pos**
    输入：`vehicle_gps_position.eph`
- `scale_series` factor=0.001 → **eph_m**
    输入：`eph_pos`
- `percentile` p=95 → **e_p95**
    输入：`eph_m`
- `max` → **e_max**
    输入：`eph_m`
- 判定：
- **warning** ｜ `e_p95 >= 10.0` ｜ 阈值 10.0 ｜ 单位 m ｜ 标题「GPS 水平位置误差持续偏大（p95 {e_p95:.1f} m）」
- **info** ｜ `e_p95 >= 5.0` ｜ 阈值 5.0 ｜ 单位 m ｜ 标题「GPS 水平位置误差偶发偏大（p95 {e_p95:.1f} m）」
- 产出：check=gps_health，tag=gps_eph_high，stats=gpsEphP95M(round 2), gpsEphMaxM(round 2)

### px4-gps-sats — GPS 卫星数

- 文件：`rules/gps-sats.yaml` ｜ 位置：slot `gps_health` #2
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) vehicle_gps_position
- 取值：
- `min` → **s_min_raw**
    输入：`vehicle_gps_position.satellites_used`
- `to_int` → **s_min**
    输入：`s_min_raw`
- 判定：
- **warning** ｜ `s_min <= 6` ｜ 阈值 8 ｜ 单位 颗 ｜ 标题「GPS 卫星数最少仅 {s_min} 颗」
- 产出：check=gps_health，tag=gps_eph_high，stats=gpsSatellitesMin(round -)

### px4-gps-jump — GPS 位置跳变

- 文件：`rules/gps-jump.yaml` ｜ 位置：slot `gps_health` #3
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) vehicle_gps_position
- 取值：
- `adjacent_speed_mps` → **step**
    输入：`vehicle_gps_position.lat`, `vehicle_gps_position.lon`, `vehicle_gps_position.timestamp`
- `count_above` gt=50.0 → **njump_raw**
    输入：`step`
- `to_int` → **njump**
    输入：`njump_raw`
- 判定：
- **warning** ｜ `njump >= 3` ｜ 阈值 3 ｜ 单位 次 ｜ 标题「GPS 位置出现 {njump} 次异常跳变（>50 m/s）」
- 产出：check=gps_health，tag=gps_jump，stats=gpsJumpCount(round -)


## 数据质量 guard（slot: `guards`）

### px4-guard-restart — 数据质量-中途重启

- 文件：`rules/guard-restart.yaml` ｜ 位置：slot `guards` #1
- 适用：firmware any ｜ airframe any
- 取值：
- （无 compute）
- 判定：
- guard：当 `restart_detected` 时打标签 `restart_detected`
- 产出：—

### px4-guard-topic-missing — 数据质量-关键 topic 缺失

- 文件：`rules/guard-topic-missing.yaml` ｜ 位置：slot `guards` #2
- 适用：firmware any ｜ airframe any
- 取值：
- （无 compute）
- 判定：
- guard：当 `'vehicle_status' not in topics` 时打标签 `topic_missing:vehicle_status`
- guard：当 `'battery_status' not in topics` 时打标签 `topic_missing:battery_status`
- guard：当 `'estimator_status' not in topics` 时打标签 `topic_missing:estimator_status`
- 产出：—

### px4-guard-log-dropouts — 数据质量-日志丢包

- 文件：`rules/guard-log-dropouts.yaml` ｜ 位置：slot `guards` #3
- 适用：firmware any ｜ airframe any
- 取值：
- （无 compute）
- 判定：
- guard：当 `dropout_ms > 1000` 时打标签 `log_dropouts_high`
- 产出：—


## 数据质量 guard（最早执行）（slot: `guards_early`）

### px4-guard-short-log — 数据质量-短日志

- 文件：`rules/guard-short-log.yaml` ｜ 位置：slot `guards_early` #1
- 适用：firmware any ｜ airframe any
- 取值：
- （无 compute）
- 判定：
- guard：当 `armed_s > 0 and armed_s < 60` 时打标签 `insufficient_data`
- guard：当 `armed_s == 0 and duration_s < 60` 时打标签 `insufficient_data`
- 产出：—


## imu_bias（slot: `imu_bias`）

### px4-imu-bias-drift — 陀螺零偏漂移

- 文件：`rules/imu-bias.yaml` ｜ 位置：slot `imu_bias` #1
- 适用：firmware any ｜ airframe any ｜ 不适用当 not has_armed
- 取值：
- `gyro_bias_series` instance=0, slot=10 → **bx, by, bz, bts, src_text**
    输入：`estimator_sensor_bias.gyro_bias`, `estimator_sensor_bias.timestamp`, `estimator_states.states`, `estimator_states.timestamp`, `estimator_status.states`, `estimator_status.timestamp`, `fw_minor`
- `gyro_bias_worst` labels=['X', 'Y', 'Z'], min_count=10 → **worst_abs, worst_axis, worst_drift, drift_axis**
    输入：`bx`, `by`, `bz`, `bts`, `armed_intervals`
- `is_not_none` → **abs_ready**
    输入：`worst_axis`
- `require_true` → **abs_gate**
    输入：`abs_ready`
- `max_temp_range` instance=0 → **temp_range**
    输入：`vehicle_imu_status.temperature_gyro`, `vehicle_air_data.ambient_temperature`
- `larger` → **bias_stat**
    输入：`worst_abs`, `worst_drift`
- 判定：
- **critical** ｜ `worst_abs >= 0.05 or worst_drift >= 0.05` ｜ 阈值 0.02 ｜ 单位 rad/s ｜ 标题「陀螺零偏异常（轴 {worst_axis}：绝对值 {worst_abs:.4f} rad/s，漂移 {worst_drift:.4f} rad/s）」
- **warning** ｜ `worst_abs >= 0.02 or worst_drift >= 0.02` ｜ 阈值 0.02 ｜ 单位 rad/s ｜ 标题「陀螺零偏异常（轴 {worst_axis}：绝对值 {worst_abs:.4f} rad/s，漂移 {worst_drift:.4f} rad/s）」
- guard：当 `temp_range >= 15` 时打标签 `temperature_change_large`
- 产出：check=imu_bias，tag=imu_bias_drift，stats=gyroBiasMaxRadS(round 4), gyroBiasDriftRadS(round 4), gyroBiasSource(round -), imuTempRangeC(round 1)


## logged_messages（slot: `logged_messages`）

### px4-log-errors — 日志错误消息

- 文件：`rules/logged-errors.yaml` ｜ 位置：slot `logged_messages` #1
- 适用：firmware any ｜ airframe any
- 取值：
- `count_items` key=level_name, in_list=['EMERGENCY', 'ALERT', 'CRITICAL', 'ERROR'] → **n**
    输入：`messages`
- `take_items` key=level_name, in_list=['EMERGENCY', 'ALERT', 'CRITICAL', 'ERROR'], limit=5, clip={'message': 200}, drop=['level', 'level_name'] → **samples**
    输入：`messages`
- 判定：
- **critical** ｜ `n > 0` ｜ 阈值 0 ｜ 单位 条 ｜ 标题「日志中出现 {n} 条 ERROR 及以上消息」
- 产出：check=logged_messages

### px4-log-warnings — 日志警告消息

- 文件：`rules/logged-warnings.yaml` ｜ 位置：slot `logged_messages` #2
- 适用：firmware any ｜ airframe any
- 取值：
- `count_items` key=level_name, eq=WARNING → **n**
    输入：`messages`
- `take_items` key=level_name, eq=WARNING, limit=5, clip={'message': 200}, drop=['level', 'level_name'] → **samples**
    输入：`messages`
- 判定：
- **warning** ｜ `n > 0` ｜ 阈值 0 ｜ 单位 条 ｜ 标题「日志中出现 {n} 条 WARNING 消息」
- 产出：check=logged_messages


## mode_thrash（slot: `mode_thrash`）

### px4-mode-thrash — 飞行模式抖动

- 文件：`rules/mode-thrash.yaml` ｜ 位置：slot `mode_thrash` #1
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) vehicle_status
- 取值：
- `edges_count` → **n_changes_raw**
    输入：`vehicle_status.nav_state`
- `to_int` → **n_changes**
    输入：`n_changes_raw`
- 判定：
- **warning** ｜ `n_changes > 12` ｜ 阈值 12 ｜ 单位 次 ｜ 标题「飞行模式切换 {n_changes} 次（>12），可能存在模式抖动」
- 产出：check=mode_thrash，stats=navStateChanges(round -)


## motor_balance（slot: `motor_balance`）

### px4-motor-unbalance — 电机输出不平衡

- 文件：`rules/motor-balance.yaml` ｜ 位置：slot `motor_balance` #1
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) actuator_motors
- 取值：
- `read` → **mts**
    输入：`actuator_motors.timestamp`
- `read` → **cols**
    输入：`actuator_motors.control`
- `active_window_mask` codes=[2, 4, 6, 14, 21], min_active=20 → **seg**
    输入：`mts`, `armed_intervals`, `vehicle_status.nav_state`, `vehicle_status.timestamp`
- `column_spread_stats` min_mean=0.01, min_channels=4 → **spread, busiest, idlest, n_active**
    输入：`cols`, `seg`
- 判定：
- **critical** ｜ `spread >= 0.15` ｜ 阈值 0.15 ｜ 标题「电机输出不平衡（悬停段通道 {busiest} 与 {idlest} 差 {spread:.3f}）」
- **warning** ｜ `spread >= 0.08` ｜ 阈值 0.08 ｜ 标题「电机输出差异偏大（通道 {busiest} 与 {idlest} 差 {spread:.3f}）」
- 产出：check=motor_balance，tag=motor_output_unbalance，stats=motorControlSpread(round 3), motorCountActive(round -)


## vibration（slot: `vibration`）

### px4-vibration — 高频振动

- 文件：`rules/vibration.yaml` ｜ 位置：slot `vibration` #1
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) vehicle_imu_status
- 取值：
- `worst_mean_stats` per_instance=True, min_mean=0 → **vibe_mean, vibe_p95, vibe_max, imu_idx**
    输入：`vehicle_imu_status.accel_vibration_metric`
- 判定：
- **critical** ｜ `vibe_mean >= 9.81` ｜ 阈值 9.81 ｜ 单位 m/s^2 ｜ 标题「高频振动严重超标（IMU #{imu_idx}）」
- **warning** ｜ `vibe_mean >= 4.905` ｜ 阈值 4.905 ｜ 单位 m/s^2 ｜ 标题「高频振动偏大（IMU #{imu_idx}）」
- 产出：check=vibration，tag=high_vibration，stats=imuAccelVibrationMean(round 3), imuAccelVibrationP95(round 3), imuAccelVibrationMax(round 3)

### px4-vibration-stddev — IMU 加速度标准差

- 文件：`rules/vibration-stddev.yaml` ｜ 位置：slot `vibration` #2
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) vehicle_imu_status
- 取值：
- `worst_rss_mean` per_instance=True, min_mean=0, aliases={'vehicle_imu_status.stddev_accel_x_m_s2': ['stddev_accel_x'], 'vehicle_imu_status.stddev_accel_y_m_s2': ['stddev_accel_y'], 'vehicle_imu_status.stddev_accel_z_m_s2': ['stddev_accel_z']} → **stddev_rss, stddev_idx**
    输入：`vehicle_imu_status.stddev_accel_x_m_s2`, `vehicle_imu_status.stddev_accel_y_m_s2`, `vehicle_imu_status.stddev_accel_z_m_s2`
- 判定：
- **critical** ｜ `stddev_rss >= 1.0` ｜ 阈值 1.0 ｜ 单位 m/s^2 ｜ 标题「IMU 加速度标准差严重超标（IMU #{stddev_idx}）」
- **warning** ｜ `stddev_rss >= 0.5` ｜ 阈值 0.5 ｜ 单位 m/s^2 ｜ 标题「IMU 加速度标准差偏大（IMU #{stddev_idx}）」
- 产出：check=vibration，tag=high_vibration，stats=imuStddevAccelRssMax(round 3)

### px4-imu-clipping — 加速度计削波

- 文件：`rules/imu-clipping.yaml` ｜ 位置：slot `vibration` #3
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) vehicle_imu_status
- 取值：
- `worst_column_delta` per_instance=True, aliases={'vehicle_imu_status.accel_clipping': ['clipping']} → **clip, clip_idx, clip_axis**
    输入：`vehicle_imu_status.accel_clipping`
- `gt` → **clip_hit**
    输入：`clip`, `0`
- `value_if` → **clip_stat**
    输入：`clip_hit`, `clip`
- 判定：
- **critical** ｜ `clip >= 1000` ｜ 阈值 1000 ｜ 单位 count ｜ 标题「加速度计削波严重：IMU #{clip_idx} 轴 {clip_axis} 全日志累计削波 {clip} 次（理想值为 0）」
- **warning** ｜ `clip >= 100` ｜ 阈值 100 ｜ 单位 count ｜ 标题「检测到明显加速度计削波：IMU #{clip_idx} 轴 {clip_axis} 全日志累计削波 {clip} 次（理想值为 0）」
- **info** ｜ `clip > 0` ｜ 阈值 0 ｜ 单位 count ｜ 标题「偶发加速度计削波：IMU #{clip_idx} 轴 {clip_axis} 全日志累计削波 {clip} 次（理想值为 0）」
- 产出：check=vibration，tag=high_vibration，stats=imuAccelClippingCountMax(round -)


## vtol_transition（slot: `vtol_transition`）

### px4-vtol-transition-attitude — VTOL 转换姿态越限

- 文件：`rules/vtol-transition.yaml` ｜ 位置：slot `vtol_transition` #1
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) vtol_vehicle_status ｜ 静默当 not has_armed or 'vehicle_status' not in topics
- 取值：
- `count_above` gt=0 → **trans_n**
    输入：`vtol_vehicle_status.vtol_in_trans_mode`
- `to_int` → **trans_n_i**
    输入：`trans_n`
- `fill_to` → **trans_mask**
    输入：`vtol_vehicle_status.vtol_in_trans_mode`, `vtol_vehicle_status.timestamp`, `vehicle_attitude.timestamp`
- `quat_to_euler` → **roll, pitch, yaw**
    输入：`vehicle_attitude.q[0]`, `vehicle_attitude.q[1]`, `vehicle_attitude.q[2]`, `vehicle_attitude.q[3]`
- `abs_values` → **tilt_r**
    输入：`roll`
- `abs_values` → **tilt_p**
    输入：`pitch`
- `larger` → **tilt_pt**
    输入：`tilt_r`, `tilt_p`
- `masked_absmax` → **tilt_max**
    输入：`tilt_pt`, `trans_mask`
- `count_true` → **trans_cnt**
    输入：`trans_mask`
- `gt` → **enough**
    输入：`trans_cnt`, `5`
- `is_not_none` → **has_tilt**
    输入：`tilt_max`
- `value_if` → **tilt_stat**
    输入：`enough`, `tilt_max`
- 判定：
- **warning** ｜ `has_tilt and enough and tilt_max > 8.0` ｜ 阈值 8.0 ｜ 单位 ° ｜ 标题「VTOL 转换阶段姿态越限（最大 {tilt_max:.1f}°，限值 8°）」
- 产出：check=vtol_transition，tag=vtol_convert_attitude_over，stats=vtolTransitionSamples(round -), vtolTransitionMaxTiltDeg(round 1)


## wind_estimate（slot: `wind_estimate`）

### px4-wind-estimate — 风扰估计

- 文件：`rules/wind-estimate.yaml` ｜ 位置：slot `wind_estimate` #1
- 适用：firmware any ｜ airframe any ｜ 依赖(任一) estimator_wind, wind_estimate
- 取值：
- `read` when_fw=>=1.15 → **n_new**
    输入：`estimator_wind.windspeed_north`
- `read` when_fw=>=1.15 → **e_new**
    输入：`estimator_wind.windspeed_east`
- `read` when_fw=<1.15 → **n_old**
    输入：`wind_estimate.windspeed_north`
- `read` when_fw=<1.15 → **e_old**
    输入：`wind_estimate.windspeed_east`
- `coalesce` → **wn**
    输入：`n_new`, `n_old`
- `coalesce` → **we**
    输入：`e_new`, `e_old`
- `hypot` → **w**
    输入：`wn`, `we`
- `percentile` p=95 → **w_p95**
    输入：`w`
- 判定：
- **warning** ｜ `w_p95 >= 12.0` ｜ 阈值 8.0 ｜ 单位 m/s ｜ 标题「估计风速较大（p95 {w_p95:.1f} m/s）」
- **info** ｜ `w_p95 >= 8.0` ｜ 阈值 8.0 ｜ 单位 m/s ｜ 标题「估计风速偏大（p95 {w_p95:.1f} m/s）」
- 产出：check=wind_estimate，tag=wind_disturb，stats=windSpeedP95M(round 1)
