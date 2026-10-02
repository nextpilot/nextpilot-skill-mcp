# 覆盖情况：该检查什么，现在检查了什么

PX4 那一堆 topic 里，我们检查了哪些、漏了哪些、先补哪些。本文只回答「覆盖没覆盖」，
阈值准不准见 [`gap.md`](gap.md) §2.4，上游具体有哪些检查见 [`upstream.md`](upstream.md)。

摸底时间 2026-09-30；批 1 落地后（2026-10）PX4 规则数由 26 涨到 31，批 2 再涨到 33；
批 A（A1–A7，2026-10）把零覆盖 topic 清零后涨到 61（另有 ardupilot 43 条，两平台合计 104）。
批 C 加 PID 跟踪误差 2 条（PX4 63）、批 B/W9 与批 C 陆续补 APM 侧；批 E（2026-10，
上游搬迁收尾）PX4 加 `ekf-gps-check-fails`/`ekf-timeout`/`param-changed` 3 条
（66），APM 加 `vehicle-profile` 1 条（44），两平台合计 **110 条**；批 E 复查删除
`param-changed`（`changed_parameters` 是 ULog PARAMETER 段非 data topic，取数够不到，
见 upstream.md §二 S11），回落 **109 条**（px4 65 + apm 44）。

## 结论速览

- 现状 61 条 PX4 规则，覆盖 `meta` 里的 26 个 topic（批 1 新增
  `failure_detector_status`、`sensor_gyro_fft`、`estimator_gps_status`、`system_power`、
  `vehicle_land_detected`；批 2 新增 `input_rc`、`home_position`；批 A 新增
  `esc_status`、`sensor_baro`、`distance_sensor`、`health_report`、`mission_result`、
  `tecs_status`、`vehicle_global_position`）。
- 「该检查但完全没检查」的高价值 topic **已清零**——第二节原清单 7 项全部于批 A
  （A1–A7）落地，7 个新组 23 条规则。
- 取数层的嵌套数组支持（W6 落地）在批 A 规则里全面用上。有个坑值得留给后续作者：
  `esc_status.esc[0].esc_rpm` 这类三层链在规则层**必须显式写 `_ref("...")`**——
  裸写在构建期放行、运行期会断链（engine 的引用改写只认两段式），见
  `rules/esc-status.yaml` 文件头注释。
- 9 份基线里，`power-sag` / `motor-unbalance` / `imu-bias-drift` 每份都跳过，
  `airspeed-invalid` / `ekf-innovation` / `wind-estimate` 多数跳过。
  跳过率高未必是 bug（多旋翼本来没空速、没风估），但要能一眼看出是"不适用"还是"取不到数"。

---

## 一、现状：61 条规则按维度

| 维度         | group                          | 规则数 | 依赖 topic                                                 |
| ------------ | ------------------------------ | ------ | ---------------------------------------------------------- |
| 数据质量守卫 | `guards_early`/`guards`        | 4      | 无（看日志元信息）                                         |
| 振动         | `vibration`                    | 2      | `vehicle_imu_status`                                       |
| EKF 融合     | `ekf_innovations`/`ekf_faults` | 2      | `estimator_status`                                         |
| 位置可信度   | `position`                     | 3      | `vehicle_global_position`                                  |
| 气压计       | `baro`                         | 4      | `sensor_baro`/`vehicle_air_data`/`vehicle_global_position` |
| 测距         | `range_finder`                 | 3      | `distance_sensor`                                          |
| 电池         | `battery`                      | 3      | `battery_status`                                           |
| CPU          | `cpu`                          | 1      | `cpuload`                                                  |
| GPS          | `gps_health`                   | 3      | `vehicle_gps_position`                                     |
| 失效保护     | `failsafe`                     | 6      | `vehicle_status`                                           |
| 健康汇总     | `health`                       | 3      | `health_report`                                            |
| 模式抖动     | `mode_thrash`                  | 1      | `vehicle_status`                                           |
| 任务         | `mission`                      | 3      | `mission_result`                                           |
| 电机         | `motor_balance`                | 1      | `actuator_motors`                                          |
| 电机级 ESC   | `esc`                          | 4      | `esc_status`                                               |
| IMU 零偏     | `imu_bias`                     | 1      | `estimator_sensor_bias`                                    |
| 姿态跟踪     | `attitude_tracking`            | 2      | `vehicle_attitude(_setpoint)`                              |
| 空速         | `airspeed`                     | 1      | `airspeed_validated`                                       |
| TECS         | `tecs`                         | 3      | `tecs_status`/`airspeed_validated`                         |
| VTOL 转换    | `vtol_transition`              | 1      | `vtol_vehicle_status`                                      |
| 风扰         | `wind_estimate`                | 1      | `estimator_wind`                                           |
| 日志消息     | `logged_messages`              | 2      | 消息流                                                     |
| 故障检测器   | `fd_status`                    | 1      | `failure_detector_status`                                  |
| 陀螺频谱     | `gyro_fft`                     | 1      | `sensor_gyro_fft`                                          |
| GPS 明细     | `gps_detailed`                 | 1      | `estimator_gps_status`                                     |
| 供电健康     | `power_supply`                 | 1      | `system_power`                                             |
| 落地检测     | `land_detection`               | 1      | `vehicle_land_detected`                                    |
| 遥控链路     | `rc_link`                      | 1      | `input_rc`                                                 |
| 返航点       | `home_position`                | 1      | `home_position`                                            |

覆盖的 26 个 topic = 上表 22 行里点名的：`actuator_motors`、`airspeed_validated`、
`battery_status`、`cpuload`、`distance_sensor`、`esc_status`、`estimator_gps_status`、
`estimator_sensor_bias`、`estimator_states`、`estimator_status`、`failure_detector_status`、
`health_report`、`home_position`、`input_rc`、`mission_result`、`sensor_baro`、
`sensor_gyro_fft`、`system_power`、`tecs_status`、`vehicle_air_data`、
`vehicle_global_position`、`vehicle_imu_status`、`vehicle_land_detected`、
`vehicle_status` + guard 用的日志元信息。

---

## 二、缺口：高价值但完全没检查的 topic（已于批 A 清零）

按「检查了有没有用」排序的原清单（共 7 项，编号沿用了初版 14 项清单里批 1/批 2
先落地的余号）。**批 A（A1–A7，2026-10）已全部落地**，此表留档：

| #   | topic                              | 关键字段                                                                                  | 能判什么                                                                                          | 落地规则（条数）               |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | `esc_status` / `esc_report`        | `esc_rpm`、`esc_current`、`esc_voltage`、`esc_temperature`、`esc_errorcount`、`esc_state` | 电机级故障：转速异常、电流失衡、过温、ESC 报错。比现在的 `actuator_motors` 输出推断精细一个数量级 | A1 `esc-status.yaml`（4）      |
| 7   | `sensor_baro` / `vehicle_air_data` | `pressure`、`temperature`、`error_count`、`temperature_source`                            | 气压计故障：`error_count` 增长 = 传感器在报错；温度异常 = 影响高度估计                            | A2 `baro.yaml`（4）            |
| 8   | `distance_sensor`                  | `current_distance`、`signal_quality`、`variance`                                          | 定高/避障传感器：信号质量、读数跳变                                                               | A3 `distance-sensor.yaml`（3） |
| 10  | `health_report`                    | `health_error_flags`、`arming_check_error_flags`、`can_arm_mode_flags`                    | 健康汇总与解锁拒绝原因（PX4 1.16 新 topic）                                                       | A4 `health-report.yaml`（3）   |
| 12  | `mission_result`                   | `failure`、`finished`、`seq_current`、`geofence_id`                                       | 任务执行：任务失败原因、地理围栏触发                                                              | A5 `mission-result.yaml`（3）  |
| 13  | `tecs_status`                      | `altitude_sp`、`height_rate_*`、`airspeed` 相关                                           | TECS 高度/速度控制（固定翼核心）：跟踪误差                                                        | A6 `tecs.yaml`（3）            |
| 14  | `vehicle_global_position`          | `dead_reckoning`、`eph`、`epv`、`alt_valid`                                               | 全局位置可信度：`dead_reckoning` = 在纯推算（GPS 丢了）                                           | A7 `global-position.yaml`（3） |

批 A 全程零新增算子——23 条规则全部用既有算子组合（`stack_columns`、
`active_column_means`、`items_spread`、`rows_aggregate`、`interval_mask`+`apply_mask`、
`interp_to`、`bit_or_max`、`worst_mean_stats`、`head_tail_median_drop` 等）拼出来。
`esc_state` 是 vendor-specific 位域、不做规则；`health_report` 位名不写死
（`health_component_t` 位序随版本扩），规则透传 mask 数值并指引地面站健康页按位定位。

---

## 三、缺口：已有规则里没检查的子维度

不是没 topic，是同一个 topic 里还有没看的字段：

| 现有规则              | 已有 topic             | 漏掉的字段                                                           | 能补什么                              |
| --------------------- | ---------------------- | -------------------------------------------------------------------- | ------------------------------------- |
| `motor-balance`       | `actuator_motors`      | `actuator_outputs.noutputs`、`actuator_servos`                       | 舵机通道、输出饱和                    |
| `gps-*` 三条          | `vehicle_gps_position` | `noise_per_ms`、`jamming_indicator`、`hdop`/`vdop`、`s_variance_m_s` | GPS 干扰/压制（上游有专图）、精度因子 |
| `power-*` 三条        | `battery_status`       | `temperature`、`cell_count`、`connected`                             | 电池温度、电芯数校验                  |
| `vibration`           | `vehicle_imu_status`   | `gyro_vibration_metric`、`delta_angle_dt` 等                         | 陀螺振动（现在只看加速度计）          |
| `log-errors/warnings` | 消息流                 | 未按来源模块分类                                                     | 区分"哪类模块在报错"                  |

---

## 四、上游有、我们没有任何对应检查的

从 `configured_plots.py` 与 PX4 文档反推（不计已列的 topic 缺口）：

| 检查                               | 上游表现                         | 我们的状态                                                                                                             |
| ---------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| PID 跟踪性能（setpoint vs actual） | 每张图都有 estimated vs setpoint | **角速率已判**（批 C：`rate-tracking` 两条规则 + `rate-error` 误差曲线图，降压版——不做反卷积/频域）；姿态 PID 分析仍无 |
| 执行器饱和                         | `Actuator Outputs` 图            | 无                                                                                                                     |
| 磁力计推力相关性                   | `Thrust and Magnetic Field` 图   | 无（磁干扰是常见坠机诱因）                                                                                             |
| 估计器看门狗                       | `Estimator Flags` 图             | `ekf-faults` 覆盖了一部分                                                                                              |
| 采样规律 / 时间滑移                | `Sampling Regularity` 图         | `sampling.yml` 有 delta t + time_slip（W6 补齐）+ 丢包守卫                                                             |
| 谱分析（PSD / FFT）                | 6 张 FFT/PSD 图 + 作动器 FFT     | **W6 已铺 8 张**（见第四点五节）；FIFO PSD 两张推迟                                                                    |

---

## 四点五、频谱：W6 已铺图（2026-10）

W4/W5 解掉「缺算子」根因、W6 把图铺完。三种容器的分工与口径：

| 容器                     | 形状                         | 口径与用途                                                                                       |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `container: spectrum`    | 线图（x 轴 Hz）              | `spectrum(...)` 单序列谱：去直流 + Hann（或 `window="none"` 复刻上游 2/N 归一）；`ymax` 压幅度轴 |
| `container: spectrogram` | 2D 热图（x 时间/y Hz/色 dB） | `stft(...)` 三轴 PSD 求和：hann 256/128、帧内去均值、density、10·log10、-inf 换最小有限值        |
| `vlines`（仅 spectrum）  | 参数标线                     | `param: IMU_GYRO_CUTOFF` 等由引擎查 initial_parameters 解；解不出线消失 + warning                |

**已铺的图（px4/plot/）**：

| 图                                     | 容器        | 对应上游                         |
| -------------------------------------- | ----------- | -------------------------------- |
| `spectrum-gyro.yml`（W5 样板）         | spectrum    | Gyro FFT（幅度谱口径）           |
| `spectrum-actuator-controls.yml`       | spectrum    | C7 作动器 FFT（无窗、ymax 0.01） |
| `spectrum-angular-velocity.yml`        | spectrum    | 角速度 FFT + 滤波器标线          |
| `spectrum-angular-acceleration.yml`    | spectrum    | 角加速度 FFT + 滤波器标线        |
| `spectrogram-acceleration.yml`         | spectrogram | V5 加速度 PSD 热图               |
| `spectrogram-angular-velocity.yml`     | spectrogram | V6 角速度 PSD 热图               |
| `spectrogram-angular-acceleration.yml` | spectrogram | V7 角加速度 PSD 热图             |
| `motor-rpm.yml`（超出上游）            | axes        | ESC 转速（嵌套取数已通）         |
| `sampling.yml` 补 delta t 线           | axes        | Sampling Regularity 对齐         |

**推迟与原因（登记不是遗漏）**：

| 项                       | 原因                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| FIFO PSD 两张（V9/V12）  | 样例日志没有 `sensor_accel_fifo`/`sensor_gyro_fifo`，铺了也无法过 L0（真实浏览器渲染断言）       |
| 多实例（多 IMU）频谱拆分 | 同上需真实多 IMU 日志驱动；`spectrum-*` 现只出实例 0，`resolveSpectrum` 按实例拆分留待有数据再做 |
| FIFO 原始数据图          | `fifo-accel/fifo-gyro.yml` 已有，但样例日志无 FIFO 话题，L0 一直靠有 FIFO 数据的日志             |

端到端实测（sample.ulg，真实驱动 `np_spectrum`/`np_stft`）：四张频谱 fs 自推
403.9–404.0 Hz（角速度族）/ 204.6 Hz（sensor_combined）；`IMU_DGYRO_CUTOFF=15`、
`IMU_GYRO_CUTOFF=40` 从日志初始参数解出并画线，`MC_DTERM_CUTOFF`/`IMU_GYRO_NF_FREQ`
缺失走 warning 路径；三张热图 0–fs/2 全谱、-inf 已替换、峰值落 6–24 Hz 低频段。

---

## 五、建议的补法（分批）

不追求一次补齐阈值，先把检查挂上、阈值用 `[暂定]` 标注，跑起来再说：

- 批 1（白捡型，成本最低）：`failure_detector_status`、`sensor_gyro_fft`、
  `estimator_gps_status`、`system_power`、`vehicle_land_detected` —— 都是「读现成结论/现成标志位」，
  不需要复杂算子。**已于 2026-10 落地**：对应规则 `px4-fd-status`、`px4-gyro-fft`、
  `px4-gps-detailed`、`px4-power-supply`、`px4-land-detection`，规则数 26 → 31。
- 批 2（新维度）：`esc_status`/`esc_report`（电机级）、`input_rc`/`rc_channels`（链路）、
  `home_position`（返航点）。**部分落地（2026-10）**：`px4-rc-link`、`px4-home-position`
  两条已做，规则数 31 → 33；`esc_*` 嵌套取数支持已随 W6 落地，规则在批 A 补齐。
- 批 A（零覆盖 topic 清零，2026-10）：A1–A7 七批共 23 条规则、7 个新组，规则数 38 → 61，
  见第二节留档表。验收同批 1：既有基线只新增 finding/skipped。
- 批 3（补字段）：GPS 干扰（`noise_per_ms`/`jamming_indicator`）、陀螺振动、电池温度。
- 批 3.5（谱图，2026-02）：借 W4/W5 落地的 `spectrum` 算子与 `spectrogram` 容器铺 6 张谱图，
  见第四点五节。这是唯一"算子已在、只差声明"的一批，成本最低。**已完成（W6）**。
- 批 4（需新算子）：PID 跟踪误差、磁力计推力相关性、执行器饱和。
  **PID 部分已落地（批 C，2026-10）**：新算子 `rate_tracking_stats`（95），
  `rate_tracking` 组 2 条规则（RMS 30 / P95 60 deg/s [暂定]）+ `plot/rate-error.yml`
  误差曲线（setpoint 插值到实测轴逐时刻作差）。sample.ulg 实测：P95 60.1 deg/s
  （Pitch 轴）发射 warning，误差曲线三轴 1812 点与 finding 数值自洽。
  磁力计推力相关性、执行器饱和**仍未做**。
- 批 E（上游搬迁收尾，2026-10）：PX4 侧补 3 条——`ekf-gps-check-fails`
  （ecl U3 权威：`gps_check_fail_flags` 解锁后拒绝 GPS 融合占比 ≥50% 且坏样本 ≥100
  → warning）、`ekf-timeout`（`timeout_flags` 跨实例位或非零 → warning）、
  `param-changed`（飞行中改参计数 → info）。APM 侧补 `vehicle-profile`
  （U5 16/16 收官，见 upstream.md §四）。sample.ulg 实跑：gps-check-fails 发射
  warning（armed 占比 81%、最严位 40=bit3+bit5）、timeout 不发射（全 0）。
  `nan_flags` 标不做（新固件已移除，restart guard 覆盖）。
  **批 E 复查（同月）**：`param-changed` 删除——`changed_parameters` 在 ULog 里是
  PARAMETER 消息段（pyulog `MSG_TYPE_PARAMETER`），不是 data topic，引擎 `topic.field`
  取数路径结构上够不到（此前"自动 skip"只是碰巧不报错）。正确实现需 provider 把该段
  合成 topic，登记为独立基建候选；上游 Flight Review 也只是按钮占位。

每批的验收标准：新规则在基线上跑通，产出的差异只允许新增 finding/skipped，
不允许改动既有 finding，用 `tools/engine/compare_baseline.py` 卡。

批 1+2 做完，覆盖数从 26 → 33，`[暂定]` 阈值从 15 条涨到 22 条；批 A 再涨到 61 条规则、
`[暂定]` 阈值约 45 条。这是预期的——先有覆盖，再校准。`thresholds_source` 字段
（设计里第 6 层，尚未落地）就是为此准备的，字段定义见网站
`/guide/rule-schema` 与 [`../../knowledge/px4/rules`](../../../knowledge/px4/rules)。
