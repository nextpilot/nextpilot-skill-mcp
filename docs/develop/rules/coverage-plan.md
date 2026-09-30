# PX4 规则覆盖清单：该检查什么，现在检查了什么

> **口径**：本文只回答「覆盖没覆盖」，不回答「阈值准不准」。阈值精调是另一笔（见 `../upstream-gap.md` §2.4）。
>
> 2026-09-30 摸底。数据面来自 `meta/v1.16.0.json`（227 个 topic），
> 现状来自 26 条规则 + 6 份 PX4 基线日志的实测。

## 结论速览

- 现状 **26 条规则 / 16 个维度**，覆盖 `meta` 里的 **12 个 topic**。
- 「该检查但完全没检查」的高价值 topic **14 个** —— 这是要补的清单。
- 6 份基线里，`power-sag` / `motor-unbalance` / `imu-bias-drift` **每份都跳过**，
  `airspeed-invalid` / `ekf-innovation` / `wind-estimate` 多数跳过。
  **跳过率高未必是 bug**（多旋翼本来没空速、没风估），但要能一眼看出是"不适用"还是"取不到数"。

## 一、现状：26 条规则按维度

| 维度         | group                          | 规则数 | 依赖 topic                    |
| ------------ | ------------------------------ | ------ | ----------------------------- |
| 数据质量守卫 | `guards_early`/`guards`        | 4      | 无（看日志元信息）            |
| 振动         | `vibration`                    | 2      | `vehicle_imu_status`          |
| EKF 融合     | `ekf_innovations`/`ekf_faults` | 2      | `estimator_status`            |
| 电池         | `battery`                      | 3      | `battery_status`              |
| CPU          | `cpu`                          | 1      | `cpuload`                     |
| GPS          | `gps_health`                   | 3      | `vehicle_gps_position`        |
| 失效保护     | `failsafe`                     | 6      | `vehicle_status`              |
| 模式抖动     | `mode_thrash`                  | 1      | `vehicle_status`              |
| 电机         | `motor_balance`                | 1      | `actuator_motors`             |
| IMU 零偏     | `imu_bias`                     | 1      | `estimator_sensor_bias`       |
| 姿态跟踪     | `attitude_tracking`            | 2      | `vehicle_attitude(_setpoint)` |
| 空速         | `airspeed`                     | 1      | `airspeed_validated`          |
| VTOL 转换    | `vtol_transition`              | 1      | `vtol_vehicle_status`         |
| 风扰         | `wind_estimate`                | 1      | `estimator_wind`              |
| 日志消息     | `logged_messages`              | 2      | 消息流                        |

覆盖的 12 个 topic：`actuator_motors`、`airspeed_validated`、`battery_status`、`cpuload`、
`estimator_sensor_bias`、`estimator_states`、`estimator_status`、`vehicle_air_data`、
`vehicle_imu_status`、`vehicle_status` + guard 用的日志元信息。

## 二、缺口：高价值但完全没检查的 topic

按「检查了有没有用」排序，**全部 14 个当前零覆盖**：

| #   | topic                              | 关键字段                                                                                  | 能判什么                                                                                              | 优先级 |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------ |
| 1   | `esc_status` / `esc_report`        | `esc_rpm`、`esc_current`、`esc_voltage`、`esc_temperature`、`esc_errorcount`、`esc_state` | **电机级故障**：转速异常、电流失衡、过温、ESC 报错。比现在的 `actuator_motors` 输出推断精细一个数量级 | 高     |
| 2   | `failure_detector_status`          | `fd_roll/pitch/alt/battery/motor`、`fd_imbalanced_prop`、`motor_failure_mask`             | **PX4 自带的故障检测器**已经给出结论，我们一条都没读。最省事的"白捡"检查                              | 高     |
| 3   | `sensor_gyro_fft`                  | `peak_frequencies_x/y/z`、`peak_snr_x/y/z`                                                | **振动频点**：PX4 固件已算好 FFT 峰值。补这里等于拿到了上游频谱图的分析结论，不用自己算 FFT           | 高     |
| 4   | `input_rc` / `rc_channels`         | `rssi`、`link_quality`、`rc_lost`、`rc_failsafe`、`frame_drop_count`                      | **遥控链路质量**：失控前兆、丢帧、信号弱。当前只有 `failsafe` 事后判定                                | 高     |
| 5   | `vehicle_land_detected`            | `landed`、`ground_contact`、`at_rest`、`freefall`、`in_descend`                           | **落地/自由落体**：`freefall` 是坠机强信号；`ground_contact` 可切分起降段                             | 高     |
| 6   | `system_power`                     | `brick_valid`、`servo_valid`、`usb_valid`、`periph_5v_oc`、`hipower_5v_oc`                | **供电健康**：5V 过流、电源砖失效 —— 这类问题会直接导致飞控重启                                       | 高     |
| 7   | `sensor_baro` / `vehicle_air_data` | `pressure`、`temperature`、`error_count`、`temperature_source`                            | **气压计故障**：`error_count` 增长 = 传感器在报错；温度异常 = 影响高度估计                            | 中     |
| 8   | `distance_sensor`                  | `current_distance`、`signal_quality`、`variance`                                          | **定高/避障传感器**：信号质量、读数跳变                                                               | 中     |
| 9   | `home_position`                    | `valid_alt`、`valid_hpos`、`update_count`                                                 | **返航点有效性**：家点没定好 = 失控返航会瞎飞                                                         | 中     |
| 10  | `health_report`                    | `health_error_flags`、`arming_check_error_flags`、`can_arm_mode_flags`                    | **健康汇总与解锁拒绝原因**（PX4 1.16 新 topic）                                                       | 中     |
| 11  | `estimator_gps_status`             | `check_fail_*` 一串（fix/sat/drift/err/pdop/spoofed）                                     | **GPS 检查明细**：PX4 逐项列出 GPS 哪项没过，比现在的 eph/sats 粗判细                                 | 中     |
| 12  | `mission_result`                   | `failure`、`finished`、`seq_current`、`geofence_id`                                       | **任务执行**：任务失败原因、地理围栏触发                                                              | 中     |
| 13  | `tecs_status`                      | `altitude_sp`、`height_rate_*`、`airspeed` 相关                                           | **TECS 高度/速度控制**（固定翼核心）：跟踪误差                                                        | 中     |
| 14  | `vehicle_global_position`          | `dead_reckoning`、`eph`、`epv`、`alt_valid`                                               | **全局位置可信度**：`dead_reckoning`= 在纯推算（GPS 丢了）                                            | 低     |

> 第 2、3、11 项特别值钱：**PX4 固件自己已经算完了结论**，我们只是没读。
> 补这三项的成本远低于从原始数据自己推（尤其 FFT，`sensor_gyro_fft` 直接给了峰值频率）。

## 三、缺口：已有规则里没检查的子维度

不是没 topic，是同一个 topic 里还有没看的字段：

| 现有规则              | 已有 topic             | 漏掉的字段                                                           | 能补什么                                  |
| --------------------- | ---------------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| `motor-balance`       | `actuator_motors`      | `actuator_outputs.noutputs`、`actuator_servos`                       | 舵机通道、输出饱和                        |
| `gps-*` 三条          | `vehicle_gps_position` | `noise_per_ms`、`jamming_indicator`、`hdop`/`vdop`、`s_variance_m_s` | **GPS 干扰/压制**（上游有专图）、精度因子 |
| `power-*` 三条        | `battery_status`       | `temperature`、`cell_count`、`connected`                             | 电池温度、电芯数校验                      |
| `vibration`           | `vehicle_imu_status`   | `gyro_vibration_metric`、`delta_angle_dt` 等                         | **陀螺振动**（现在只看加速度计）          |
| `log-errors/warnings` | 消息流                 | 未按来源模块分类                                                     | 区分"哪类模块在报错"                      |

## 四、上游有、我们没有任何对应检查的

从 `configured_plots.py` 与 PX4 文档反推（不计已列的 topic 缺口）：

| 检查                               | 上游表现                         | 我们的状态                                   |
| ---------------------------------- | -------------------------------- | -------------------------------------------- |
| PID 跟踪性能（setpoint vs actual） | 每张图都有 estimated vs setpoint | 只有 `attitude-*` 看姿态，**角速率跟踪无判** |
| 执行器饱和                         | `Actuator Outputs` 图            | 无                                           |
| 磁力计推力相关性                   | `Thrust and Magnetic Field` 图   | **无**（磁干扰是常见坠机诱因）               |
| 估计器看门狗                       | `Estimator Flags` 图             | `ekf-faults` 覆盖了一部分                    |
| 采样规律 / 时间滑移                | `Sampling Regularity` 图         | 只有 `guard-log-dropouts` 判丢包             |

## 五、建议的补法（分批）

**不追求一次补齐阈值**，先把检查挂上、阈值用 `[暂定]` 标注，跑起来再说：

- **批 1（白捡型，成本最低）**：`failure_detector_status`、`sensor_gyro_fft`、
  `estimator_gps_status`、`system_power`、`vehicle_land_detected` —— 都是「读现成结论/现成标志位」，
  不需要复杂算子。
- **批 2（新维度）**：`esc_status`/`esc_report`（电机级）、`input_rc`/`rc_channels`（链路）、
  `home_position`（返航点）。
- **批 3（补字段）**：GPS 干扰（`noise_per_ms`/`jamming_indicator`）、陀螺振动、电池温度。
- **批 4（需新算子）**：PID 跟踪误差（需要 setpoint-actual 对齐统计）、磁力计推力相关性、
  执行器饱和。

**每批的验收标准**：新规则在 6 份基线上跑通，产出的差异只允许新增 finding/skipped，
不允许改动既有 finding。用 `tools/engine/compare_baseline.py` 卡。

**与阈值精调的关系**：批 1 做完，覆盖数从 26 → 31，`[暂定]` 阈值从 15 条会涨到 20+ 条。
那是**预期的**——先有覆盖，再校准。`thresholds_source` 字段（设计里第 6 层，尚未落地）
就是为此准备的，见 `knowledge/px4/CLAUDE.md`。
