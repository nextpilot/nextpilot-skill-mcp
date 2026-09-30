# 上游知识收集：规则 / 图表 / PID / 3D

> 2026-09-30 收集。**只做清点，不做取舍**——取舍见 `../rules/upstream-gap.md`、
> `../rules/coverage-plan.md`、`upstream-alignment-plan.md`。
>
> 取数：沙箱直连 GitHub 被拦，走 `cdn.jsdelivr.net/gh/<repo>@<branch>/<path>` 拿源码原文。

## 0. 最重要的发现：本仓的直接上游是 robotto

`knowledge/px4/rules/` 注释里到处写着「（robotto）」。对上号了：

| 上游                                         | 关系                                                      | 状态       |
| -------------------------------------------- | --------------------------------------------------------- | ---------- |
| **`robotto-xyz/ai-drone-toolkit`**           | **本项目的直接前身**                                      | 已找到源码 |
| └ `robotto_drone_core/ulog_tools.py`（27KB） | **本仓 26 条规则的"迁移前"原始实现**（`diagnose_flight`） | 已拉取     |
| └ `tools/px4-ulog-mcp`                       | ULog 检查 MCP（MCP 对接参照）                             | 已定位     |
| `PX4/flight_review`                          | 图表 / PID tune / 3D view 的参照                          | 已拉取     |
| `Auterion/ecl_ekf_analysis`                  | EKF 分析的权威                                            | 已拉取     |
| `ARK-Electronics/px4-log-analysis`           | 同类：Claude Code skill 形态                              | 已定位     |
| `CopterCamTech/flight-tools`                 | 同类：PX4 + ArduPilot 双格式                              | 已定位     |

---

## 1. robotto `diagnose_flight` 完整检查清单（8 项）

> `packages/robotto-drone-core/src/robotto_drone_core/ulog_tools.py`

| #   | check             | 判据                                          | 上游阈值                      | 本仓现状                                         |
| --- | ----------------- | --------------------------------------------- | ----------------------------- | ------------------------------------------------ |
| 1   | `logged_errors`   | ERR+ 聚合 critical；WARNING 单独 warning      | 无                            | ✅ 拆成 `log-errors`+`log-warnings`              |
| 2   | `ekf_innovations` | `vel/pos/hgt/mag_test_ratio` 的最大值         | warn **0.5** / crit **1.0**   | ✅ 但口径改为「拒绝占比」1%/5%                   |
| 3   | `ekf_faults`      | `filter_fault_flags` 或 `nan_flags` 非零      | 非零即 critical               | ✅ 更细（位掩码逐位判）                          |
| 4   | `vibration`       | `estimator_status.vibe[2]` 最大值             | warn **30** / crit **60**     | ⚠️ 换了数据源 → `vehicle_imu_status`，4.905/9.81 |
| 5   | `cpu_load`        | `cpuload.load` 最大值                         | warn **0.90** / crit **0.95** | ✅ 阈值相同                                      |
| 6   | `battery`         | `battery_status.remaining` 最小值             | warn **0.20** / crit **0.10** | ✅ 更细（+cell-voltage/sag）                     |
| 7   | `failsafe`        | 5 布尔边沿 + nav_state 进 DESCEND/TERMINATION | 无                            | ✅ 完整复刻（6 条）                              |
| 8   | `mode_thrash`     | `nav_state` 变化次数                          | **>12**                       | ✅ 阈值相同                                      |

**结论：8 项全部迁移，且多数做得更细。本仓是它的超集。**

值得回头看的只有第 4 条（见 `coverage-plan.md` 批 A4）：
上游用 `estimator_status.vibe[2]`（估计器侧，m/s），我们用传感器侧 `accel_vibration_metric`（m/s²）。
**两者不是同一个量**，上游阈值不可直接搬；但 `estimator_status.vibe` 我们完全没读，互补，建议补。

上游 `_failsafe_events()` 里的 `armed_intervals` 切段算法（含 `IN_AIR_RESTORE` 边界），
比本仓依赖的引擎内置 `ARMED_INTERVALS` 更完整，可对照核对边界。

---

## 2. Flight Review 图表清单（45 张）与缺口

> `app/plot_app/configured_plots.py`（62KB）。逐张对表见 `../rules/upstream-gap.md` §1.3。

**缺 9 张**：

| 缺的图                     | 前置能力             |
| -------------------------- | -------------------- |
| Actuator Controls FFT      | FFT 算子             |
| Angular Velocity FFT       | FFT 算子             |
| Angular Acceleration FFT   | FFT 算子（新 topic） |
| Acceleration PSD           | 频谱算子             |
| Angular Velocity PSD       | 频谱算子             |
| Accel / Gyro PSD (FIFO)    | 频谱算子             |
| Sampling Regularity (FIFO) | 差分 + dropout 标注  |
| Motor RPM (`esc_status`)   | 无（纯新图）         |
| Manual Control Inputs      | 无（纯新图）         |

**6 张卡在频谱能力上** —— 这是「照搬图表」的硬前提，见 `upstream-alignment-plan.md` 批 B。

上游的图表**阈值线写法**（可照搬）：

- 振动图 `add_horizontal_background_boxes(['green','orange','red'], [4.905, 9.81])` —— 本仓 `hlines` 已实现
- 滤波器截止频率标注 `mark_frequency(IMU_GYRO_CUTOFF / IMU_DGYRO_CUTOFF / IMU_GYRO_NF_FREQ)`
  —— 本仓**没有**，是 FFT 图之外可独立照搬的一个小能力
- 坐标范围 `Range1d`：GPS 不确定性限 0~40、CPU 限 0~1、采样限 0~25e3 us → 本仓用 `range` 字段

---

## 3. PID tune（`pid_analysis.py`，20KB）

**这不是一张图，是一个完整信号处理子系统**：

| 能力           | 实现                                                    |
| -------------- | ------------------------------------------------------- |
| 阶跃响应反卷积 | Wiener 反卷积（`wiener_deconvolution`）求系统响应       |
| 叠窗频域分析   | Hanning/Tukey 窗 + 叠加（`winstacker`/`stackspectrum`） |
| 分层统计       | 按油门与输入幅值分层（`low_high_mask`，阈值 500 deg/s） |
| 2D 直方图      | `hist2d` 加权众数平均（`weighted_mode_avr`）            |
| 噪声谱         | D 项误差频谱（`noise_gyro`/`noise_d`）                  |
| 采样对齐       | `equalize_data` 等间隔重采样                            |

核心参数：`framelen=1s`、`resplen=0.5s`、`cutfreq=25Hz`、`superpos=16`。

**本仓零对应物。** 降压做法（先做跟踪误差）见 `upstream-alignment-plan.md` 批 C。

---

## 4. 3D view

上游是 `link_to_3d_page` + 独立 3D 站点（Cesium/three.js 系），本仓只有 2D 地图（`track.yml`）。
**本仓零对应物。** 分档做法见 `upstream-alignment-plan.md` 批 D。

---

## 5. EKF / UAV 分析（用户点名要学）

| 来源                                | 内容                                                                                                                                         | 可借鉴                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `Auterion/ecl_ekf_analysis`         | 创新比（`*_test_ratio`）、EKF 内部测试指标、偏置；批处理 CLI 输出 JSON                                                                       | **阈值权威**；golden log 回归测试方法       |
| PX4 官方文档（Flight Log Analysis） | 结构化四步：日志是否完整 → 控制器是否跟踪设定值 → 传感器是否有效 → 排除电源故障                                                              | 诊断流程骨架；`fault_*.log` 硬故障标识      |
| PX4 文档 EKF2 章节                  | 创新值应在 ±2σ；持续偏大/跳变/发散/振荡 → 对应参数                                                                                           | EKF 规则的解释文案                          |
| `robotto-xyz/px4-ulog-mcp`          | 5 个 MCP 工具：`list_log_topics`/`get_log_summary`/`query_topic`/`get_failsafe_events`/`diagnose_flight`                                     | **本仓 MCP 的工具集参照**                   |
| `ARK-Electronics/px4-log-analysis`  | Claude skill 形态：`profile-log`（按 topic 拆体积/频率）、`accel-vibration`（PSD/频谱找陷波点）、`baro-pressurization`、`gps-signal-quality` | **accel-vibration 的 PSD 做法直接对应批 B** |
| `CopterCamTech/flight-tools`        | 单功能脚本集：`*_range_signal`（RSSI/LQ vs 3D 距离）、`*_power_plot`、`*_log_explorer`                                                       | 「控制/遥测 RSSI 与距离的关系图」值得照搬   |

**PX4 官方文档的「结构化分析」四步**（值得作为报告的整体骨架）：

1. 日志是否完整（是否飞中截断）→ 本仓 `guard-short-log` 已覆盖
2. 控制器是否跟踪设定值（对比 roll/pitch 角速率与 setpoint）→ **本仓只有姿态，无角速率跟踪** ← 批 C
3. 传感器数据是否有效（强振动阈值：峰峰值 > 2-3 m/s²）→ 本仓 vibration 覆盖
4. 排除电源故障（`fault_*.log` 硬故障文件）→ **本仓未覆盖**（需要 SD 卡文件，日志里拿不到）

---

## 6. 其他同类项目（备查）

| 项目                                                 | 形态                                            |
| ---------------------------------------------------- | ----------------------------------------------- |
| `riccardodamiani/px4_log_analyzer`                   | 事件驱动，`events.yaml` 声明 ~80 参数           |
| `leaf-diag`（PyPI）                                  | ULog + ROS bag 时间同步                         |
| `PX4/pyulog`                                         | 底层解析库（`ulog_info`/`ulog2csv`/`ulog2kml`） |
| PlotJuggler / FlightPlot / pyFlightAnalysis / MAVGCL | 桌面工具                                        |
| Foxglove                                             | 原生 ULog，3D + 回放                            |
