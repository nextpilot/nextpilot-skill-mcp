# 上游清单：上游到底有哪些，我们有哪些

> **本文回答一个问题**：上游每个产品**具体提供了什么**（一张图、一条检查、一个工具），
> **本仓对应实现了没有**。逐条列，不概括。
>
> 配套文档：
>
> - `upstream-itemized.md`(upstream-itemized.md) —— **检查/规则**逐条对表（PX4 8 项 + APM 16 项）
> - 本文 —— **图表 / 子系统 / 工具**逐条对表
> - [`baselines.md`](baselines.md) —— 基线日志为什么入库、放哪、CI 怎么用
>
> 状态口径：**✅ 已有** / **🟡 部分**（做成但要补） / **🔵 占位**（声明了但没数据/没算子） /
> **❌ 没有** / **🚫 明确不做**（写清为什么）。

---

## 零、上游全景：一共几个上游

| #   | 上游                           | 仓                                         | 形态                         | 授权 | 与本仓的关系                       |
| --- | ------------------------------ | ------------------------------------------ | ---------------------------- | ---- | ---------------------------------- |
| U1  | **Flight Review**              | `PX4/flight_review`                        | Python / Bokeh Web           | BSD  | **PX4 图表 + PID + 3D 的唯一上游** |
| U2  | **robotto ai-drone-toolkit**   | `robotto` → `robotto-drone-core`           | Python 库                    | —    | **本仓 PX4 规则的直接祖先**        |
| U3  | **Auterion ecl_ekf_analysis**  | `Auterion/ecl_ekf_analysis`                | Python CLI                   | BSD  | EKF 专用分析，本仓 EKF 规则对标源  |
| U4  | **px4_log_analyzer**           | pyulog 之上的声明式事件分析                | Python + YAML                | —    | 与本仓 `compute`+`trigger` 同构    |
| U5  | **ardupilot-mcp**              | `furkanisikay/ardupilot-mcp`（PyPI 0.1.2） | Python MCP，16 检查          | MIT  | **本仓 APM 知识的直接源头**        |
| U6  | **ArduPilot WebTools**（官方） | `ArduPilot/WebTools`                       | **纯浏览器**（JS + Pyodide） | GPL  | 同架构可互证；PID/FFT 参考         |
| U7  | **FlightMD**                   | `Praddyx15/FlightMD`                       | Web 应用，7 规则 + 评分      | —    | 评分 / 参数改动建议 / 回归集做法   |
| U8  | **smarttune-cli**              | `raylanlin/smarttune-cli`                  | CLI + MCP，16 工具           | —    | 参数存在性校验门禁                 |
| U9  | ardupilot-log-diagnosis（2）   | `BeastAyyG/*`、`Sathvik12004/*`            | ML 分类器                    | —    | **🚫 不学**（权重不可审计）        |
| U10 | `fossuav/aap`                  | AI Playbooks                               | AI 剧本                      | —    | 仅观察                             |

**三个"必须逐条对表"的**：**U1**（图表 + PID + 3D）、**U2**（PX4 规则）、**U5**（APM 规则）。
U3/U4 是旁证。U6–U8 是能力参考。U9/U10 明确不学。

---

## 一、U1 Flight Review 图表逐条对表

**上游实码**：`configured_plots.py`（62 KB），`generate_plots()`，**45 处 `data_plot =` 构造点**
（`grep -cE "^\s*(data_plot|plot) = "` = 45）。

**本仓实码**：`knowledge/px4/plot/*.yml` —— **40 个 plot 文件**（`ls | wc -l` = 40，另有 `README.md`）。

> **为什么上游是 45、单张标题 39**：6 个构造点在 `for` 循环里（Roll/Pitch/Yaw 的姿态与角速率、
> 局部位置 X/Y/Z、FIFO 三路 IMU、输出若干实例），运行时按日志内容展开成多张。下表用**上游构造点**计。
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
> 本仓 ❌ 无此分支（`is_vtol_tailsitter` 场景少，非阻塞）。

### 1.2 VIO（视觉里程计，5 项 → 本仓全部已建）

| #   | 上游图                        | 取主题                    | 本仓文件                       | 状态 |
| --- | ----------------------------- | ------------------------- | ------------------------------ | ---- |
| P15 | Visual Odometry Position      | `vehicle_visual_odometry` | `plot/visual-odom-pos.yml`     | ✅   |
| P16 | Visual Odometry Velocity      | 同上                      | `plot/visual-odom-vel.yml`     | ✅   |
| P17 | Visual Odometry Attitude      | 同上                      | `plot/visual-odom-att.yml`     | ✅   |
| P18 | Visual Odometry Attitude Rate | 同上                      | `plot/visual-odom-rate.yml`    | ✅   |
| P19 | Visual Odometry Latency       | 同上（`latency`）         | `plot/visual-odom-latency.yml` | ✅   |

### 1.3 控制 / 动力 / 舵面（8 项构造点 → 本仓 6 已建 / 2 缺）

| #   | 上游图                                                               | 干什么                                 | 取主题                                                                 | 本仓文件                                                      | 状态 |
| --- | -------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- | ---- |
| C1  | Airspeed（条件：有效空速或 VTOL）                                    | 空速 vs 地速                           | `airspeed`、`vehicle_gps_position`                                     | `plot/airspeed.yml`                                           | ✅   |
| C2  | TECS（fixed-wing / VTOL）                                            | 总能量控制：高度率 + 高度率设定值      | `tecs_status`                                                          | `plot/tecs.yml`                                               | ✅   |
| C3  | Manual Control Inputs（Radio or Joystick）                           | 摇杆四通道 + Aux1/2 + 模式 / Kill 开关 | `manual_control_setpoint`、`manual_control_switches`                   | `plot/rc.yml`                                                 | ✅   |
| C4  | Raw Radio Control Inputs（老日志回退分支）                           | 原始 RC 通道                           | `rc_channels`                                                          | `plot/rc.yml`（同文件，候选组）                               | ✅   |
| C5  | Actuator Controls（attitude+thrust）                                 | 控制器输出 roll/pitch/yaw/thrust       | `actuator_controls_0`                                                  | `plot/actuator-controls-0.yml`                                | ✅   |
| C6  | Actuator Controls 1 (VTOL in Fixed-Wing mode)                        | VTOL 固定翼模式扭矩 + 前推力           | `actuator_controls_1`                                                  | `plot/actuator-controls-1.yml`                                | ✅   |
| C7  | **Actuator Controls FFT**                                            | 作动器输出**频谱**（y 限 0–0.01）      | `actuator_controls_0` + FFT                                            | ❌ **缺频谱算子**                                             | ❌   |
| C8  | **_Actuator Outputs（Main/AUX/EXTRA）×3，动态分配时为 Motor/Servo_** | 舵机 / 执行器输出                      | `actuator_outputs`（inst 0/1/2）或 `actuator_motors`/`actuator_servos` | `plot/actuator-outputs.yml`（4 个容器：Motor/Servo/Main/AUX） | ✅   |

> **C7 是本区唯一缺口**，与 §1.4 的 PSD 一族同因：**引擎无频谱算子**。

### 1.4 振动 / 频谱 / 滤波（9 项构造点，运行时展开 17 张 → 本仓 4 已建 / 5 缺）

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

> **关键**：上游 `DataPlotSpec`（注意不是 `DataPlot`）自动对信号做谱变换 —— 谱能力在
> **绘图类**里，不在"判定"里。本仓把这层抽到引擎算子，于是**谱算子缺失 = 5 张图同时缺**。

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

### 1.6 Motor RPM（1 项）

| #   | 上游图        | 取主题               | 本仓 | 状态                                                  |
| --- | ------------- | -------------------- | ---- | ----------------------------------------------------- |
| M1  | **Motor RPM** | `esc_status.esc_rpm` | ❌   | ❌ 本仓 `motors` **规则**覆盖饱和/不平衡，但无 RPM 图 |

### 1.7 概览区（不是曲线图，但是报告页必需）

| #   | 上游产物                   | 干什么                                        | 本仓 | 备注                              |
| --- | -------------------------- | --------------------------------------------- | ---- | --------------------------------- |
| H1  | `get_heading_html`         | 机型 / 固件 / 时长 + **3D 链接 + PID 页链接** | 🟡   | 本仓有报告头，无 3D / PID 链接    |
| H2  | `get_info_table_html`      | 时长、最大速度、飞行距离等                    | 🟡   | 本仓有 `facts`，未成统一信息表    |
| H3  | **`get_hardfault_html`**   | 硬故障（Hardfault）报警横幅                   | ❌   | 上游从 `msg_info_dict` 取         |
| H4  | **`get_corrupt_log_html`** | 日志损坏（截断）报警横幅                      | 🟡   | 本仓 `integrity.yaml`（APM 侧）有 |
| H5  | 参数变更按钮               | 显示飞行中改过的参数                          | ❌   | 同 S11                            |
| H6  | 错误标签图例               | flight mode 背景带 + error 标签图例           | ❌   | 本仓图不含 mode 背景带            |

### 1.8 图表总汇总

| 状态                 | 项数   | 明细                                                                                     |
| -------------------- | ------ | ---------------------------------------------------------------------------------------- |
| ✅ 已有              | **34** | P1–P14、P15–P19、C1–C6、C8、V1–V3、V8、V11、S1–S10                                       |
| 🟡 部分              | **4**  | V4 采样（口径不同）、V10 FIFO 采样、H1、H2、H4                                           |
| ❌ 没有              | **7**  | C7、V5、V6、V7、V9、V12、V13（**全是频谱**）+ M1 Motor RPM + S11 参数变更 + H3 / H5 / H6 |
| 其中卡在**频谱算力** | **6**  | C7、V5、V6、V7、V9、V12、V13 → **7 张**（含 V13 FFT）                                    |

> **修正此前的错误说法**：早前草稿写"本仓只做了 7 张、缺 22 张"——**那是错的**。
> 实测本仓 `knowledge/px4/plot/` 有 **40 个 plot 文件**，**34 项已建、4 项部分、7 项（全是频谱）+ 若干概览块未建**。
> 位置/姿态/速度/VIO/GPS/电源/温度/磁/测距/舵面**全部已对表**。

---

## 二、U1 Flight Review 非图表子系统

| 子系统               | 上游文件                               | 干什么                                       | 本仓 | 备注                                            |
| -------------------- | -------------------------------------- | -------------------------------------------- | ---- | ----------------------------------------------- |
| **3D View**          | `link_to_3d_page` → 独立 3D 页         | Three.js 回放姿态 + 轨迹 + 速度矢量          | ❌   | plan 批 D（建议档位 D2：three.js）              |
| **PID Analysis**     | `pid_analysis.py`（20.8 KB）           | 阶跃响应、跟踪误差、**频域辨识**、增益余量   | ❌   | plan 批 C；另见 U6 PIDReview                    |
| **Overview 页**      | `overview_generator.py`                | 机队总览                                     | ❌   | 平台能力，非日志分析                            |
| **Plotted Tables**   | `plotted_tables.py`（29 KB）           | 统计量做成表 + 图                            | 🟡   | 本仓有 stats 面板                               |
| **Config Tables**    | `config_tables.py`                     | 参数配置表                                   | 🟡   | 本仓 `param_audit` 是规则，非表                 |
| **Browse / DB**      | `browse.py`、`db.py`                   | 日志浏览与数据库（上传/对比）                | 🚫   | **明确不做**：本仓纯客户端零上传                |
| **VTOL Tailsitter**  | `vtol_tailsitter.py`                   | 尾巴座姿态换算                               | ❌   | 场景少                                          |
| **PX4 ULog helpers** | `px4_log.py`、`px4mod.py`、`helper.py` | pyulog 之上的取数封装                        | ✅   | 本仓 `providers/` 等价                          |
| **U4 事件去抖**      | `events.py` + `log_analysis.py`        | 声明式 ~80 参数 + **`time_window_sec` 去抖** | 🟡   | 本仓 `compute`+`trigger` 同构，**缺时间窗去抖** |

---

## 三、U2 robotto：PX4 规则 8 项

> **逐条对表（实码位置/判定/取数/证据/产物/本仓多做的/未做的）见
> `upstream-itemized.md`(upstream-itemized.md) §一**。此处只放汇总。

| #   | 上游检查          | 状态          | 一句话                                         |
| --- | ----------------- | ------------- | ---------------------------------------------- |
| 1   | `logged_errors`   | ✅ 更强       | 拆 2 条 + 文本截断 + 修了永不命中的 bug        |
| 2   | `ekf_innovations` | ✅ 更强       | 4 路→10 路；峰值判据→占比判据                  |
| 3   | `ekf_faults`      | 🔵 一处降级   | **未查 `nan_flags`**；按位或合并               |
| 4   | `vibration`       | 🔵 换了数据源 | 估计器侧 m/s → 传感器侧 m/s²（**数值不可比**） |
| 5   | `cpu_load`        | 🟡 等价       | 阈值逐位一致                                   |
| 6   | `battery`         | ✅ 更强       | **修掉 `remaining=-1` 误报 critical**          |
| 7   | `failsafe`        | ✅ 更强       | armed 过滤覆盖全部 6 条 + label                |
| 8   | `mode_thrash`     | 🟡 等价       | 阈值一致                                       |

**8/8 已迁移：4 条更强、2 条等价、2 条有已声明降级。**

---

## 四、U5 ardupilot-mcp：APM 检查 16 项 + 额外能力

> **逐条对表见 `upstream-itemized.md`(upstream-itemized.md) §二。**

| 分组           | 上游检查                                                                               | 本仓                         |
| -------------- | -------------------------------------------------------------------------------------- | ---------------------------- |
| 飞行动态（10） | `events` `ekf` `vibration` `power` `gps` `attitude` `compass` `motors` `rcin` `timing` | 8 ✅ + `power` 🔵 + `gps` 🔵 |
| 配置安装（4）  | `config` `calibration` `param_audit` `sensors`                                         | 全 ✅（依赖 `_cfg()`）       |
| 完整性/预解锁  | `integrity` `prearm`                                                                   | 全 ✅                        |
| **额外能力**   | **`vehicle_profile` 物理推理**（hover 油门 → 推重比 / 功率裕度）                       | ❌ 未迁移                    |
| **额外能力**   | `recommend_tuning` 调参建议                                                            | ❌（属建议层，等 PID 分析）  |
| 阈值审计       | `docs/SOURCES.md`（confirmed/heuristic/design choice/corrected）                       | ✅ 已迁为 198 条             |
| 码表           | `_FRAME_CLASS_MAP` 等 8 张                                                             | ✅ 已迁                      |

**16/16 已对齐：13 齐平 + 2 主动降级 + `vehicle_profile` 未迁移。**

---

## 五、U3 / U4 / U6 / U7 / U8：能力参考

| 上游                      | 提供的具体能力                                                                        | 本仓 | 值得抄什么                                       |
| ------------------------- | ------------------------------------------------------------------------------------- | ---- | ------------------------------------------------ |
| **U3 ecl_ekf_analysis**   | EKF 创新比批处理；**四步结构化分析**叙事                                              | 🟡   | ①阈值对表 `params/` ②**四步分析做报告骨架**      |
| **U4 px4_log_analyzer**   | 声明式事件 + **`time_window_sec` 时间窗去抖**                                         | 🟡   | **时间窗去抖**（本仓 `excursion_events` 有雏形） |
| **U6 ArduPilot WebTools** | `fft.js` + Pyodide 数学栈；**PIDReview**；FilterTool Bode；MAGFit                     | ❌   | **`fft.js` = 频谱零上传的现成答案**；PIDReview   |
| **U7 FlightMD**           | **health score 0–100 + 权重**；每条 finding 给**确切参数改动**；**50 份真实日志验证** | ❌   | ①总评分 ②参数改动 ③**回归集做法**                |
| **U8 smarttune-cli**      | **参数存在性校验门禁**；6 层知识库纯 JSON；建议带置信度                               | ❌   | **参数存在性校验门禁**（最该抄的一条）           |
| U9 ML 分类器              | 训练权重                                                                              | 🚫   | **不学**：与"确定性引擎是唯一真相源"冲突         |

### 频谱：9 张图的共同前置，上游怎么解决的

| 路线                    | 来源                            | 怎么做                                                                        | 本仓适用性                              |
| ----------------------- | ------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------- |
| **A. 构建期 Python 算** | Flight Review（`numpy.fft`）    | 服务端算完把谱数据塞进图                                                      | 本仓纯客户端，**不可用**                |
| **B. 浏览器 JS FFT**    | **ArduPilot WebTools `fft.js`** | 纯前端算，零上传                                                              | ✅ **与本仓架构一致，首选参考**         |
| **C. Pyodide + numpy**  | WebTools FilterReview           | 浏览器里跑 Python                                                             | ✅ 本仓已有 `check_engine_pyodide` 基建 |
| **本仓现状**            | `knowledge/engine/operators.py` | **91 个算子，无 `fft`/`psd`/`spectrogram`**，只有 `zero_cross_hz`（时域过零） | ❌ **这是唯一阻塞项**                   |

---

## 六、本仓独有（上游三族都没有）

上游 **U1/U2/U5 三个项目都没有"规则层"** —— Flight Review 唯一的硬编码判定是振动图三色背景带
（4.905 / 9.81），U2 的 8 项检查是命令式 Python，U5 是 16 个 Python 类。

**本仓独有**：

| 资产                                | 内容                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------- |
| **guard 四条**                      | 安全护栏类规则                                                         |
| **电池三件套**                      | `power-cell-voltage` / `power-sag` / `power-remaining`（U2 只有 1 条） |
| **电机平衡 / 姿态振荡 / 超调**      | 上游归类为"图"，本仓做成规则                                           |
| **GPS 三类**                        | 分门别类（U5 只有 1 个 `gps` 检查）                                    |
| **VTOL 越限 / 空速健康 / 风扰估计** | 上游无                                                                 |
| **日志消息分级 / IMU 零偏漂移**     | 上游无                                                                 |
| **故障知识库 `fault-kb.yaml`**      | 根因 → 排查步骤 → 禁忌（上游无此结构）                                 |
| **声明式规则 schema**               | `id`/`name`/`group`/`condition`/`compute`/`output`/`trigger`           |

---

## 七、结论

**"先列出上游有哪些"的答案**：

1. **图表**：U1 有 **45 个构造点（运行时展开更多）+ 6 个概览区块**；
   本仓 `knowledge/px4/plot/` **40 个文件，34 项 ✅ / 4 项 🟡**，
   **未建的是 7 张频谱图 + Motor RPM + 参数变更 + 3 个概览块**。
2. **规则**：U2 **8 项** + U5 **16 项**，本仓 **8/8 已迁移**、**16/16 已对齐**（逐条见 `upstream-itemized.md`）。
3. **子系统**：U1 有 **3D / PID / Overview / Tables**，本仓**前三者全无**（3D 与 PID 在 plan 批 C/D）。
4. **频谱**：**7 张图的唯一阻塞项**，上游三条路线里 **U6 的 `fft.js` 与本仓架构一致**。

**因此基线日志要覆盖三类场景**（见 [`baselines.md`](baselines.md)）：

- **健康飞行** —— 主干图表 + "不该报警"的负样本
- **故障注入** —— 每条规则的**正样本**（否则规则可能永不命中）
- **边界 / 退化** —— 老固件、缺主题、截断日志、VTOL、单 IMU、fixed-wing / VTOL
