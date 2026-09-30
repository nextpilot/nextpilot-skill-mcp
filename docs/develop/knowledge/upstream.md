# 上游有什么：一个 plot、一条 rule

> **本文回答一个问题**：上游每个产品**具体提供了什么**（一张图、一条检查、一个子系统），
> **本仓对应实现了没有**。逐条列，不概括。
>
> 本目录四份文档的分工：
>
> | 文档                         | 回答什么                            |
> | ---------------------------- | ----------------------------------- |
> | **本文 `upstream.md`**       | 上游有哪些、上游做了什么（逐条）    |
> | [`gap.md`](gap.md)           | 我们差在哪、取舍、可借鉴什么        |
> | [`coverage.md`](coverage.md) | 我们现在的覆盖情况（规则 vs topic） |
> | [`README.md`](README.md)     | 怎么读、架构入口                    |
>
> 状态口径：**✅ 已有** / **🟡 部分** / **🔵 占位** / **❌ 没有** / **🚫 明确不做**。

---

## 零、上游全景：一共几个上游

| #   | 上游                           | 仓                                                                    | 形态                         | 授权 | 与本仓的关系                            |
| --- | ------------------------------ | --------------------------------------------------------------------- | ---------------------------- | ---- | --------------------------------------- |
| U1  | **Flight Review**              | `PX4/flight_review`                                                   | Python / Bokeh Web           | BSD  | **PX4 图表 + PID + 3D 的唯一上游**      |
| U2  | **robotto ai-drone-toolkit**   | `robotto` → `robotto-drone-core`                                      | Python 库                    | —    | **本仓的直接前身**（`rules/` 迁移来源） |
| U3  | **Auterion ecl_ekf_analysis**  | `Auterion/ecl_ekf_analysis`                                           | Python CLI                   | BSD  | EKF 专用分析，阈值权威                  |
| U4  | **px4_log_analyzer**           | `riccardodamiani/px4_log_analyzer`                                    | Python + YAML                | —    | 与本仓 `compute`+`trigger` 同构         |
| U5  | **ardupilot-mcp**              | `furkanisikay/ardupilot-mcp`（PyPI 0.1.2）                            | Python MCP，16 检查          | MIT  | **本仓 APM 知识的直接源头**             |
| U6  | **ArduPilot WebTools**（官方） | `ArduPilot/WebTools`                                                  | **纯浏览器**（JS + Pyodide） | GPL  | 同架构可互证；PID/FFT 参考              |
| U7  | **FlightMD**                   | `Praddyx15/FlightMD`                                                  | Web 应用，7 规则 + 评分      | —    | 评分 / 参数改动建议 / 回归集做法        |
| U8  | **smarttune-cli**              | `raylanlin/smarttune-cli`                                             | CLI + MCP，16 工具           | —    | 参数存在性校验门禁                      |
| U9  | 其他同类 / 桌面工具            | `pyulog`、`flight-tools`、`px4-log-analysis`、PlotJuggler、Foxglove … | 库 / 脚本 / 桌面             | —    | 备查                                    |
| U10 | ML 分类器                      | `BeastAyyG/*`、`Sathvik12004/*`                                       | 训练权重                     | —    | **🚫 不学**（权重不可审计）             |

**三个"必须逐条对表"的**：**U1**（图表 + PID + 3D）、**U2**（PX4 规则）、**U5**（APM 规则）。

---

## 一、U1 Flight Review 图表逐条对表

**上游实码**：`configured_plots.py`（62 KB），`generate_plots()`，**45 处 `data_plot =` 构造点**
（`grep -cE "^\s*(data_plot|plot) = "` = 45）。

**本仓实码**：`knowledge/px4/plot/*.yml` —— **40 个 plot 文件**。

> **为什么上游是 45、单张标题 39**：6 个构造点在 `for` 循环里（Roll/Pitch/Yaw 的姿态与角速率、
> 局部位置 X/Y/Z、FIFO 三路 IMU、输出若干实例），运行时按日志内容展开成多张。
> 本仓侧把部分循环**合并进一个 YAML**（如 `fifo-accel.yml` 用 `split_by_instance: true` 展开成 IMU0/1/2）。

### 1.1 位置 / 姿态 / 速度 / 高度（14 项 → 本仓全部已建）

| #   | 上游图                             | 干什么                                           | 取主题                                                                                           | 本仓文件                                             | 状态 |
| --- | ---------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ---- |
| P1  | Position plot（`DataPlot2D` 大图） | XY 平面轨迹**叠加地图** + setpoint + 真值        | `vehicle_local_position` + `_setpoint` + `_groundtruth`                                          | `plot/position.yml`（`container: map`）+ `track.yml` | ✅   |
| P2  | Leaflet Map                        | 地理轨迹，按飞行模式着色                         | `vehicle_gps_position`                                                                           | `plot/track.yml`（`container: map`）                 | ✅   |
| P3  | Altitude Estimate                  | GPS 高度 / 气压高度 / 融合高度 / 设定值          | `vehicle_gps_position`、`baro_alt_meter`、`vehicle_global_position`、`position_setpoint_triplet` | `plot/altitude.yml`                                  | ✅   |
| P4  | Roll Angle（循环 ×1）              | 横滚估计 vs 设定值 + 真值                        | `vehicle_attitude` / `_setpoint` / `_groundtruth`                                                | `plot/roll-angle.yml`                                | ✅   |
| P5  | Pitch Angle（循环 ×1）             | 俯仰估计 vs 设定值                               | 同上                                                                                             | `plot/pitch-angle.yml`                               | ✅   |
| P6  | Yaw Angle（循环 ×1）               | 偏航估计 vs 设定值 + **前馈 `yaw_sp_move_rate`** | 同上 + `vehicle_attitude_setpoint.yaw_sp_move_rate`                                              | `plot/yaw-angle.yml`                                 | ✅   |
| P7  | Roll Angular Rate（循环 ×1）       | 角速率估计 vs 设定值 + **积分项**                | `vehicle_angular_velocity`、`vehicle_rates_setpoint`、`rate_ctrl_status`                         | `plot/roll-rate.yml`                                 | ✅   |
| P8  | Pitch Angular Rate（循环 ×1）      | 同上                                             | 同上                                                                                             | `plot/pitch-rate.yml`                                | ✅   |
| P9  | Yaw Angular Rate（循环 ×1）        | 同上                                             | 同上                                                                                             | `plot/yaw-rate.yml`                                  | ✅   |
| P10 | Local Position X（循环 ×1）        | 局部位置 X 估计 vs 设定值                        | `vehicle_local_position` + `_setpoint`                                                           | `plot/local-x.yml`                                   | ✅   |
| P11 | Local Position Y（循环 ×1）        | 同上 Y                                           | 同上                                                                                             | `plot/local-y.yml`                                   | ✅   |
| P12 | Local Position Z（循环 ×1）        | 同上 Z                                           | 同上                                                                                             | `plot/local-z.yml`                                   | ✅   |
| P13 | Velocity                           | 三轴速度估计 vs 设定值                           | `vehicle_local_position.v[xyz]` + `_setpoint`                                                    | `plot/velocity.yml`                                  | ✅   |
| P14 | Local Position 真值 / 地面真值     | SITL 真值叠加                                    | `vehicle_local_position_groundtruth`                                                             | 含在 P1/P10–P12 的 `_ref` 候选组                     | ✅   |

> **VTOL 尾巴座特化**：上游 `vtol_tailsitter.py` 检测到 tailsitter 时改写姿态与角速率数据。
> 本仓 ❌ 无此分支（场景少，非阻塞）。

### 1.2 VIO（视觉里程计，5 项 → 本仓全部已建）

| #   | 上游图                        | 取主题                    | 本仓文件                       | 状态 |
| --- | ----------------------------- | ------------------------- | ------------------------------ | ---- |
| P15 | Visual Odometry Position      | `vehicle_visual_odometry` | `plot/visual-odom-pos.yml`     | ✅   |
| P16 | Visual Odometry Velocity      | 同上                      | `plot/visual-odom-vel.yml`     | ✅   |
| P17 | Visual Odometry Attitude      | 同上                      | `plot/visual-odom-att.yml`     | ✅   |
| P18 | Visual Odometry Attitude Rate | 同上                      | `plot/visual-odom-rate.yml`    | ✅   |
| P19 | Visual Odometry Latency       | 同上（`latency`）         | `plot/visual-odom-latency.yml` | ✅   |

### 1.3 控制 / 动力 / 舵面（8 项构造点 → 本仓 7 已建 / 1 缺）

| #   | 上游图                                                             | 干什么                                 | 取主题                                                                 | 本仓文件                                                      | 状态 |
| --- | ------------------------------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- | ---- |
| C1  | Airspeed（条件：有效空速或 VTOL）                                  | 空速 vs 地速                           | `airspeed`、`vehicle_gps_position`                                     | `plot/airspeed.yml`                                           | ✅   |
| C2  | TECS（fixed-wing / VTOL）                                          | 总能量控制：高度率 + 高度率设定值      | `tecs_status`                                                          | `plot/tecs.yml`                                               | ✅   |
| C3  | Manual Control Inputs（Radio or Joystick）                         | 摇杆四通道 + Aux1/2 + 模式 / Kill 开关 | `manual_control_setpoint`、`manual_control_switches`                   | `plot/rc.yml`                                                 | ✅   |
| C4  | Raw Radio Control Inputs（老日志回退分支）                         | 原始 RC 通道                           | `rc_channels`                                                          | `plot/rc.yml`（同文件，候选组）                               | ✅   |
| C5  | Actuator Controls（attitude+thrust）                               | 控制器输出 roll/pitch/yaw/thrust       | `actuator_controls_0`                                                  | `plot/actuator-controls-0.yml`                                | ✅   |
| C6  | Actuator Controls 1 (VTOL in Fixed-Wing mode)                      | VTOL 固定翼模式扭矩 + 前推力           | `actuator_controls_1`                                                  | `plot/actuator-controls-1.yml`                                | ✅   |
| C7  | **Actuator Controls FFT**                                          | 作动器输出**频谱**（y 限 0–0.01）      | `actuator_controls_0` + FFT                                            | ❌ **缺频谱算子**                                             | ❌   |
| C8  | **Actuator Outputs（Main/AUX/EXTRA）×3**，动态分配时为 Motor/Servo | 舵机 / 执行器输出                      | `actuator_outputs`（inst 0/1/2）或 `actuator_motors`/`actuator_servos` | `plot/actuator-outputs.yml`（4 个容器：Motor/Servo/Main/AUX） | ✅   |

### 1.4 振动 / 频谱 / 滤波（13 项构造点，运行时展开成更多 → 本仓 6 已建 / 7 缺）

| #   | 上游图                                          | 干什么                                                                      | 取主题                                        | 本仓文件                                     | 状态            |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------- | --------------- |
| V1  | Raw Acceleration                                | 三轴原始加速度（`sensor_combined`）                                         | `sensor_combined.accelerometer_m_s2[xyz]`     | `plot/raw-accel.yml`                         | ✅              |
| V2  | **Vibration Metrics**                           | 振动指标 + 三色背景带 4.905 / 9.81（**上游唯一硬编码判定**）                | `vehicle_imu_status.accel_vibration_metric`   | `plot/vibration.yml`                         | ✅              |
| V3  | Raw Angular Speed (Gyroscope)                   | 陀螺三轴原始角速度                                                          | `sensor_combined.gyro_rad[xyz]`               | `plot/raw-gyro.yml`                          | ✅              |
| V4  | Sampling Regularity of Sensor Data              | 采样规律性 `[us]`（丢采样检测）                                             | 时间戳（本仓用 `estimator_status.time_slip`） | `plot/sampling.yml`                          | 🟡 **口径不同** |
| V5  | **Acceleration Power Spectral Density**         | 加速度**功率谱密度** `[Hz]`                                                 | `sensor_combined` + PSD                       | ❌                                           | ❌              |
| V6  | **Angular velocity Power Spectral Density**     | 角速度 PSD                                                                  | `vehicle_angular_velocity` + PSD              | ❌                                           | ❌              |
| V7  | **Angular acceleration Power Spectral Density** | 角加速度 PSD                                                                | `vehicle_angular_acceleration` + PSD          | ❌                                           | ❌              |
| V8  | **Raw Acceleration (FIFO, IMU0/1/2)** ×3        | FIFO 原始加速度                                                             | `sensor_accel_fifo_virtual`                   | `plot/fifo-accel.yml`（`split_by_instance`） | ✅              |
| V9  | **Acceleration PSD (FIFO, IMU0/1/2)** ×3        | FIFO 加速度 PSD                                                             | `sensor_accel_fifo_virtual` + PSD             | ❌                                           | ❌              |
| V10 | **Sampling Regularity (FIFO, IMU0/1/2)** ×3     | FIFO **采样规律性**                                                         | `sensor_accel_fifo_virtual`                   | `plot/sampling.yml`（部分）                  | 🟡              |
| V11 | **Raw Gyro (FIFO, IMU0/1/2)** ×3                | FIFO 原始陀螺                                                               | `sensor_gyro_fifo_virtual`                    | `plot/fifo-gyro.yml`                         | ✅              |
| V12 | **Gyro PSD (FIFO, IMU0/1/2)** ×3                | FIFO 陀螺 PSD                                                               | `sensor_gyro_fifo_virtual` + PSD              | ❌                                           | ❌              |
| V13 | **Angular Acceleration FFT**                    | 角加速度 FFT，**标注 `IMU_DGYRO_CUTOFF` / `IMU_GYRO_NF_FREQ` 滤波器频率线** | `vehicle_angular_acceleration` + 参数         | ❌                                           | ❌              |

> **关键**：上游 `DataPlotSpec`（注意不是 `DataPlot`）自动对信号做谱变换 —— 谱能力在**绘图类**里，
> 不在"判定"里。本仓把这层抽到引擎算子，于是**谱算子缺失 = 7 张图同时缺**。

### 1.5 传感器 / 罗盘 / GPS / 电源 / 温度（11 项 → 本仓全部已建）

| #   | 上游图                      | 干什么                                                    | 取主题                                                                    | 本仓文件                   | 状态 |
| --- | --------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------- | ---- |
| S1  | Raw Magnetic Field Strength | 三轴磁场强度                                              | `sensor_mag` / `vehicle_magnetometer`                                     | `plot/mag.yml`             | ✅   |
| S2  | Distance Sensor             | 测距距离 + 方差 + 估计器 `dist_bottom` + 有效性           | `distance_sensor`、`vehicle_local_position`                               | `plot/distance.yml`        | ✅   |
| S3  | GPS Uncertainty             | 精度 / HDOP / VDOP / 速度精度 / 卫星数 / fix（y 限 0–40） | `vehicle_gps_position`                                                    | `plot/gps-uncertainty.yml` | ✅   |
| S4  | GPS Noise & Jamming         | 噪声/ms + 干扰指示                                        | `vehicle_gps_position.noise_per_ms`/`jamming_indicator`                   | `plot/gps-noise.yml`       | ✅   |
| S5  | Thrust and Magnetic Field   | 磁场模长 **vs 推力**（磁干扰 ↔ 电流相关）                 | `magnetometer_ga` + `actuator_controls_0.thrust`                          | `plot/thrust-mag.yml`      | ✅   |
| S6  | Power                       | 电压/电流/放电量/剩余 + OCV 估计 + 内阻 + 5V/3.3V         | `battery_status` + `system_power`                                         | `plot/power.yml`           | ✅   |
| S7  | Temperature                 | 气压计/加速度计/空速/电池/ESC 温度                        | `sensor_baro`、`sensor_accel`、`airspeed`、`battery_status`、`esc_status` | `plot/temperature.yml`     | ✅   |
| S8  | Estimator Flags             | 估计器状态标志位随时间                                    | `estimator_status`                                                        | `plot/estimator-flags.yml` | ✅   |
| S9  | Failsafe Flags              | 失效保护标志位随时间                                      | failsafe 字段                                                             | `plot/failsafe-flags.yml`  | ✅   |
| S10 | CPU & RAM                   | CPU 负载与内存                                            | `cpuload`、`system_load`                                                  | `plot/cpu-ram.yml`         | ✅   |
| S11 | 参数变更（按钮占位）        | 飞行中改过的参数                                          | `changed_parameters`                                                      | ❌                         | ❌   |

### 1.6 Motor RPM 与概览区

| #   | 上游产物                   | 干什么                                        | 本仓 | 备注                                             |
| --- | -------------------------- | --------------------------------------------- | ---- | ------------------------------------------------ |
| M1  | **Motor RPM**              | ESC 转速 `esc_status.esc_rpm`                 | ❌   | 本仓 `motors` **规则**覆盖饱和/不平衡，无 RPM 图 |
| H1  | `get_heading_html`         | 机型 / 固件 / 时长 + **3D 链接 + PID 页链接** | 🟡   | 本仓有报告头，无 3D / PID 链接                   |
| H2  | `get_info_table_html`      | 时长、最大速度、飞行距离等                    | 🟡   | 本仓有 `facts`，未成统一信息表                   |
| H3  | **`get_hardfault_html`**   | 硬故障（Hardfault）报警横幅                   | ❌   | 上游从 `msg_info_dict` 取                        |
| H4  | **`get_corrupt_log_html`** | 日志损坏（截断）报警横幅                      | 🟡   | 本仓 `integrity.yaml`（APM 侧）有                |
| H5  | 参数变更按钮               | 同 S11                                        | ❌   |                                                  |
| H6  | 错误标签图例               | flight mode 背景带 + error 标签图例           | ❌   | 本仓图不含 mode 背景带                           |

### 1.7 图表总汇总

| 状态                 | 项数   | 明细                                                                |
| -------------------- | ------ | ------------------------------------------------------------------- |
| ✅ 已有              | **34** | P1–P19、C1–C6、C8、V1–V3、V8、V11、S1–S10                           |
| 🟡 部分              | **4**  | V4 采样（口径不同）、V10 FIFO 采样、H1、H2、H4                      |
| ❌ 没有              | **7+** | C7、V5、V6、V7、V9、V12、V13（**全是频谱**）+ M1 + S11/H5 + H3 + H6 |
| 其中卡在**频谱算力** | **7**  | C7、V5、V6、V7、V9、V12、V13                                        |

> **本仓 `knowledge/px4/plot/` 实测 40 个 plot 文件** —— **34 项已建**，
> 位置/姿态/速度/VIO/GPS/电源/温度/磁/测距/舵面**全部已对表**。
> 未建的集中在**频谱一族**（7 张，同一根因）与 Motor RPM / 参数变更 / 三个概览块。

---

## 二、U1 Flight Review 非图表子系统

| 子系统               | 上游文件                               | 干什么                                      | 本仓 | 备注                               |
| -------------------- | -------------------------------------- | ------------------------------------------- | ---- | ---------------------------------- |
| **3D View**          | `link_to_3d_page` → 独立 3D 页         | Three.js 回放姿态 + 轨迹 + 速度矢量         | ❌   | plan 批 D（建议档位 D2：three.js） |
| **PID Analysis**     | `pid_analysis.py`（20.8 KB）           | 阶跃响应反卷积、叠窗频域、2D 直方图、噪声谱 | ❌   | plan 批 C；另见 U6 PIDReview       |
| **Overview 页**      | `overview_generator.py`                | 机队总览                                    | ❌   | 平台能力，非日志分析               |
| **Plotted Tables**   | `plotted_tables.py`（29 KB）           | 统计量做成表 + 图                           | 🟡   | 本仓有 stats 面板                  |
| **Config Tables**    | `config_tables.py`                     | 参数配置表                                  | 🟡   | 本仓 `param_audit` 是规则，非表    |
| **Browse / DB**      | `browse.py`、`db.py`                   | 日志浏览与数据库（上传/对比）               | 🚫   | **明确不做**：本仓纯客户端零上传   |
| **VTOL Tailsitter**  | `vtol_tailsitter.py`                   | 尾巴座姿态换算                              | ❌   | 场景少                             |
| **PX4 ULog helpers** | `px4_log.py`、`px4mod.py`、`helper.py` | pyulog 之上的取数封装                       | ✅   | 本仓 `providers/` 等价             |

**PID tune 的完整能力清单**（`pid_analysis.py`，这是**一个子系统不是一张图**）：

| 能力           | 上游实现                                                |
| -------------- | ------------------------------------------------------- |
| 阶跃响应反卷积 | Wiener 反卷积（`wiener_deconvolution`）求系统响应       |
| 叠窗频域分析   | Hanning/Tukey 窗 + 叠加（`winstacker`/`stackspectrum`） |
| 分层统计       | 按油门与输入幅值分层（`low_high_mask`，阈值 500 deg/s） |
| 2D 直方图      | `hist2d` 加权众数平均（`weighted_mode_avr`）            |
| 噪声谱         | D 项误差频谱（`noise_gyro`/`noise_d`）                  |
| 采样对齐       | `equalize_data` 等间隔重采样                            |

核心参数：`framelen=1s`、`resplen=0.5s`、`cutfreq=25Hz`、`superpos=16`。

---

## 三、U2 robotto：PX4 检查 8 项

上游实码：`packages/robotto-drone-core/src/robotto_drone_core/ulog_tools.py`，
函数 `diagnose_flight(path)`，第 523–800 行。阈值常量在第 70–78 行。

| #   | 上游 check        | 上游判据                                            | 上游阈值                      | 本仓现状                                              |
| --- | ----------------- | --------------------------------------------------- | ----------------------------- | ----------------------------------------------------- |
| 1   | `logged_errors`   | `ERR+` 聚合 critical；`WARNING` 单独 warning        | 无                            | ✅ 拆成 `log-errors` + `log-warnings`                 |
| 2   | `ekf_innovations` | `vel/pos/hgt/mag_test_ratio` 的**最大值**           | warn **0.5** / crit **1.0**   | ✅ 口径改为「拒绝占比」1%/5%，且扩到 10 路            |
| 3   | `ekf_faults`      | `filter_fault_flags` **或 `nan_flags`** 非零        | 非零即 critical               | 🔵 位掩码逐位判；**`nan_flags` 未查**                 |
| 4   | `vibration`       | `estimator_status.vibe[2]` 最大值                   | warn **30** / crit **60** m/s | 🔵 换了数据源 → `vehicle_imu_status`，4.905/9.81 m/s² |
| 5   | `cpu_load`        | `cpuload.load` 最大值                               | warn **0.90** / crit **0.95** | 🟡 阈值相同                                           |
| 6   | `battery`         | `battery_status.remaining` 最小值                   | warn **0.20** / crit **0.10** | ✅ 更细（+cell-voltage/sag），且**修掉 -1 误报**      |
| 7   | `failsafe`        | 5 布尔边沿 + `nav_state` 进 `DESCEND`/`TERMINATION` | 无                            | ✅ 完整复刻（6 条），armed 过滤更严                   |
| 8   | `mode_thrash`     | `nav_state` 变化次数                                | **>12**                       | 🟡 阈值相同                                           |

**8/8 已迁移：4 条更强（1/2/6/7）、2 条等价（5/8）、2 条有已声明降级（3 未查 `nan_flags`、4 换了数据源）。**

**逐条实现差异（上游怎么写的 → 本仓怎么写的）**：

| #   | 上游实现细节                                                          | 本仓实现细节                                                                           |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | 一个函数里产 2 条 finding，样本**不截断**                             | 拆 2 条独立经验 + `clip=200`；**修了迁移时 `log_level <= 3` 永不命中的 bug**           |
| 2   | 4 路字段取瞬时**峰值** `max`                                          | 10 路取**超阈样本占比**，`channel_min=3` 去毛刺 + 多 EKF 实例定位                      |
| 3   | `fault_max or nan_max`，取各实例 `max`                                | `bit_or_max` **跨实例按位或**（上游取 max 会漏组合位）；非核心位降 info                |
| 4   | 估计器侧 delta-velocity（m/s）                                        | 传感器侧 `accel_vibration_metric`（m/s²）+ 三色带对表                                  |
| 5   | `stats["max"]`                                                        | `max(cpuload.load)`，等价；多产 metric                                                 |
| 6   | `stats["min"]`，未过滤 `-1`                                           | `min_ge(..., ge=0)` 滤掉未知值；只看第 0 块电池                                        |
| 7   | 手写遍历 `list_value_changes`；**只对 rc/link 两个字段做 armed 过滤** | 声明式 `rising_edge_events`/`step_into_events`；**armed 过滤覆盖全部 6 条** + 带 label |
| 8   | `len(vs.list_value_changes("nav_state")) > 12`                        | `edges_count(vehicle_status.nav_state) > 12`                                           |

> 上游 `_failsafe_events()` 里的 `armed_intervals` 切段算法（含 `IN_AIR_RESTORE` 边界），
> 比本仓依赖的引擎内置 `ARED_INTERVALS` 更完整，可对照核对边界。
>
> 上游 `nav_state` 18 的命名是 `"AUTO_LAND"`，本仓写 `"LAND"`。

---

## 四、U5 ardupilot-mcp：APM 检查 16 项 + 额外能力

上游实码：`ardupilot-mcp/checks/*.py`（注册表模式，`@register_check`）。

> **载体差异（先说明）**：上游是 Python 类（命令式、带分支与异常），本仓是声明式 YAML
> （`compute` 表达式 + `triggers`）。判定条件必须能写成算子链，写不出来的**只能占位或降级**。

### 4.1 飞行动态（10 项）

| #   | 上游检查    | 上游判据                                                      | 本仓文件                 | 本仓实现差异                                                                                                                                    | 状态 |
| --- | ----------- | ------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | `events`    | `ERR` 子系统错误、`EV` 关键事件、`MODE` 时间线                | `events.yaml`（3 条）    | 同；`MODE` 时间线用文本列（原卡 C1，2026-09 解除）                                                                                              | ✅   |
| 2   | `ekf`       | XKF4/NKF4 的 SV/SP/SH/SM 检验比，0.8 警告 / 1.0 拒绝          | `ekf.yaml`（4 条）       | **同阈值**；`XKF4 \|\| NKF4` + ref 候选组成对写；不写 `outputs.stats`（候选组分不清值来源）                                                     | ✅   |
| 3   | `vibration` | 三轴 30/60 m/s² + 10% 持续占比；三 IMU 削波 >=100 转 critical | `vibration.yaml`（6 条） | **同阈值**；拆 6 条（引擎一条规则最多出一条 finding）；`VIBE` 三轴无 IMU 实例维度                                                               | ✅   |
| 4   | `power`     | 最低电压、负载压降、电压突降                                  | `power.yaml`（3 条）     | **最低电压仍走 `estimate_cells` 电芯估算**，未切 `_cfg('BATT_CRT_VOLT')` —— 阈值未经真实日志验证                                                | 🔵   |
| 5   | `gps`       | 3D 定位、搜星 4/6、HDOP 2.0/5.0                               | `gps.yaml`（3 条）       | **一处有意偏离**：上游拿不到 armed 窗口就退回全程判；本仓改成 `armed: true` **直接 skip**（退回全程会把起飞前 `NSats=0`/`HDop=99.99` 判成故障） | 🔵   |
| 6   | `attitude`  | 横滚/俯仰峰值 30°；航向                                       | `attitude.yaml`（3 条）  | 同；2026-09 补 `excursion_events` 后**"持续 1s"判据已恢复**                                                                                     | ✅   |
| 7   | `compass`   | 场强极差比 0.60                                               | `compass.yaml`（1 条）   | 2026-09 补 `std`/`cv` 后**CV 判据（0.30/0.60）已恢复**                                                                                          | ✅   |
| 8   | `motors`    | 不平衡与饱和                                                  | `motors.yaml`（2 条）    | 2026-09 补 `stack_columns`/`add` 后**已恢复**                                                                                                   | ✅   |
| 9   | `rcin`      | 四主通道同时低于 1000us                                       | `rcin.yaml`（1 条）      | 同；上游判"持续 >=2s 或持续到日志末尾"→ critical，本仓补 `excursion_events` 后**已对齐**                                                        | ✅   |
| 10  | `timing`    | PM 长循环；日志间隙                                           | `timing.yaml`（2 条）    | 2026-09 补 `diff`/`median`/`sum` 后**已恢复**；`gap_events` 复刻上游"阈值 = max(0.5s, 10×名义间隔中位数)"                                       | ✅   |

### 4.2 配置 / 安装（4 项）

| #   | 上游检查      | 上游判据                                                                           | 本仓文件                   | 本仓实现差异                                                                                                                                  | 状态 |
| --- | ------------- | ---------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 11  | `config`      | `ARMING_CHECK` / `BATT_MONITOR` / `FS_THR_ENABLE` 三条参数检查                     | `config.yaml`（3 条）      | **原本 100% 卡在读不到参数（C2）**；2026-09 加 `PARAMS` 内置变量 + `_cfg()` 后转真。**踩坑**：`_cfg()` 只能在 `compute` 里用，`when` 里写非法 | ✅   |
| 12  | `calibration` | 罗盘硬铁偏移模长（300/600 mGauss）                                                 | `calibration.yaml`（1 条） | 同类参数依赖，C2 解除后已迁；用 `np.hypot` 求三轴偏移模长                                                                                     | ✅   |
| 13  | `param_audit` | Rate P 异常、ACCEL 限制禁用、电池阈值倒挂、SPIN 反转、PWM 异常、围栏空边界（6 条） | `param_audit.yaml`（6 条） | 同，依赖参数                                                                                                                                  | ✅   |
| 14  | `sensors`     | 罗盘健康标志；测距仪与 GPS 的"配置但无数据"                                        | `sensors.yaml`（3 条）     | 同；"配置但无数据" = `_cfg('RNGFND1_TYPE')`/`GPS_TYPE` 有值但对应消息缺失                                                                     | ✅   |

### 4.3 日志完整性 / 预解锁 / 额外能力

| #   | 上游检查                       | 上游判据                                                  | 本仓文件                 | 本仓实现差异                                                                                         | 状态 |
| --- | ------------------------------ | --------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------- | ---- |
| 15  | `integrity`                    | 读**解析层**产出的 `log.meta.integrity`（是否截断）       | `integrity.yaml`（1 条） | provider 2026-09 补 `is_log_ok()` / `get_log_integrity()` 后规则补齐                                 | ✅   |
| 16  | `prearm`                       | 启动阶段 `MSG`/`STATUSTEXT` 预解锁关键字扫描              | `prearm.yaml`（1 条）    | 依赖**文本子串匹配**，原卡 C1；C1 解除后用 `count_items`/`take_items` 的 `contains=`（大小写不敏感） | ✅   |
| —   | **`vehicle_profile` 物理推理** | 从 hover 油门 → **推重比 / 功率裕度**，判断"动力是否不足" | ❌                       | **未迁移**：需要 hover 油门反推，本仓无对应算子                                                      |      |
| —   | `recommend_tuning` 调参建议    | PID 参数建议                                              | ❌                       | 属"建议"层，等 PID 分析（批 C）                                                                      |      |

**16/16 已对齐：13 齐平 + 2 主动降级（`power` / `gps`）+ `vehicle_profile` 未迁移。**

**上游另外迁移过来的资产**：

| 资产      | 内容                                                                                         |
| --------- | -------------------------------------------------------------------------------------------- |
| 码表 8 张 | `_FRAME_CLASS_MAP`、`_MSGTYPE_*` 等                                                          |
| 阈值审计  | `docs/SOURCES.md` 198 条假设（confirmed 86 / heuristic 22 / design choice 82 / corrected 8） |
| 派生规则  | `estimate_cells` 电芯估算                                                                    |

---

## 五、U3 / U4 / U6 / U7 / U8：旁证与能力参考

| 上游                               | 提供的具体能力                                                                                                | 本仓 | 值得抄什么                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------- |
| **U3 ecl_ekf_analysis**            | EKF 创新比批处理；**四步结构化分析**叙事                                                                      | 🟡   | ①阈值对表 `params/` ②**四步分析做报告骨架**    |
| **U4 px4_log_analyzer**            | 声明式事件 + **`time_window_sec` 时间窗去抖**；`complex_data` 组合派生                                        | 🟡   | **时间窗去抖**；~80 参数的"该监控什么"清单     |
| **U6 ArduPilot WebTools**          | `fft.js` + Pyodide 数学栈；**PIDReview**；FilterTool Bode；MAGFit                                             | ❌   | **`fft.js` = 频谱零上传的现成答案**；PIDReview |
| **U7 FlightMD**                    | **health score 0–100 + 权重**；每条 finding 给**确切参数改动**；**50 份真实日志验证**                         | ❌   | ①总评分 ②参数改动 ③**回归集做法**              |
| **U8 smarttune-cli**               | **参数存在性校验门禁**；6 层知识库纯 JSON；建议带置信度                                                       | ❌   | **参数存在性校验门禁**（最该抄的一条）         |
| **PX4 官方文档四步分析**           | ① 日志是否完整 ② 控制器是否跟踪设定值 ③ 传感器是否有效 ④ 排除电源故障                                         | 🟡   | 报告页的叙事骨架                               |
| `ARK-Electronics/px4-log-analysis` | Claude skill：`profile-log` / `accel-vibration`（PSD 找陷波点）/ `baro-pressurization` / `gps-signal-quality` | ❌   | `accel-vibration` 的 PSD 做法直接对应频谱缺口  |
| `CopterCamTech/flight-tools`       | RSSI/LQ vs 3D 距离、功率图、日志浏览器                                                                        | ❌   | 「控制/遥测 RSSI 与距离的关系图」值得照搬      |
| `robotto-xyz/px4-ulog-mcp`         | 5 个 MCP 工具：`list_log_topics`/`get_log_summary`/`query_topic`/`get_failsafe_events`/`diagnose_flight`      | 🟡   | **本仓 MCP 的工具集参照**                      |
| `PX4/pyulog`                       | `ulog_info`/`ulog2csv`/`ulog2kml`                                                                             | ✅   | 本仓解析底层                                   |
| 桌面工具                           | PlotJuggler / FlightPlot / pyFlightAnalysis / MAVGCL / Foxglove                                               | 🚫   | 不学形态（那是工作台）                         |
| ML 分类器（U10）                   | 训练权重                                                                                                      | 🚫   | **不学**：与"确定性引擎是唯一真相源"冲突       |

### 频谱：7 张图的共同前置，上游怎么解决的

| 路线                    | 来源                            | 怎么做                                                                        | 本仓适用性                                       |
| ----------------------- | ------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ |
| **A. 构建期 Python 算** | Flight Review（`numpy.fft`）    | 服务端算完把谱数据塞进图                                                      | 本仓纯客户端，**不可用**                         |
| **B. 浏览器 JS FFT**    | **ArduPilot WebTools `fft.js`** | 纯前端算，零上传                                                              | ✅ **与本仓架构一致，首选参考**                  |
| **C. Pyodide + numpy**  | WebTools FilterReview           | 浏览器里跑 Python                                                             | ✅ 本仓已有 `check_engine_pyodide` 基建          |
| **D. 直接读固件算好的** | `sensor_gyro_fft` topic         | PX4 固件已算出峰值频率/snR                                                    | ✅ **成本最低**，见 [`coverage.md`](coverage.md) |
| **本仓现状**            | `knowledge/engine/operators.py` | **91 个算子，无 `fft`/`psd`/`spectrogram`**，只有 `zero_cross_hz`（时域过零） | ❌                                               |

---

## 六、本仓独有（上游三族都没有）

上游 **U1/U2/U5 三个项目都没有"规则层"** —— Flight Review 唯一的硬编码判定是振动图三色背景带
（4.905 / 9.81），U2 的 8 项检查是命令式 Python，U5 是 16 个 Python 类。

**本仓独有**：

| 资产                                | 内容                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------- |
| **guard 四条**                      | 安全护栏类规则（短日志 / 中途重启 / topic 缺失 / 丢包）                |
| **电池三件套**                      | `power-cell-voltage` / `power-sag` / `power-remaining`（U2 只有 1 条） |
| **电机平衡 / 姿态振荡 / 超调**      | 上游归类为"图"，本仓做成规则                                           |
| **GPS 三类**                        | `gps-eph` / `gps-sats` / `gps-jump`（U5 只有 1 个 `gps` 检查）         |
| **VTOL 越限 / 空速健康 / 风扰估计** | 上游无                                                                 |
| **日志消息分级 / IMU 零偏漂移**     | 上游无                                                                 |
| **故障知识库 `fault-kb.yaml`**      | 根因 → 排查步骤 → 禁忌（上游无此结构）                                 |
| **声明式规则 schema**               | `id`/`name`/`group`/`condition`/`compute`/`output`/`trigger`           |
| **规则与图共用一套取数**            | `_ref` 候选组、`unit=` 换算、`compute` 算子与 `rules/` 完全同源        |
| **构建期契约校验**                  | `build-knowledge.mjs` 拦字段引用、label 对齐、单图单量纲、地图唯一性   |

---

## 七、结论

1. **图表**：U1 有 **45 个构造点 + 6 个概览区块**；本仓 `knowledge/px4/plot/` **40 个文件，
   34 项 ✅ / 4 项 🟡**。未建的是 **7 张频谱图**（同一根因）+ Motor RPM + 参数变更 + 3 个概览块。
2. **规则**：U2 **8 项** + U5 **16 项**，本仓 **8/8 已迁移**、**16/16 已对齐**。
3. **子系统**：U1 有 **3D / PID / Overview / Tables**，本仓前三者全无（3D 与 PID 在 plan 批 C/D）。
4. **频谱**：**7 张图的唯一阻塞项**；除自算 FFT 外，**`sensor_gyro_fft` 直接读固件结论**是更省的路。

后续怎么补见 [`gap.md`](gap.md)；我们当前的覆盖情况见 [`coverage.md`](coverage.md)。
