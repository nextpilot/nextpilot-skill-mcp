# 上游有什么：一个 plot、一条 rule

本文逐条对表：上游每个产品具体给了什么（一张图、一条检查、一个子系统），本仓对应做了没有。
同类文档：[`gap.md`](gap.md) 讲差距与取舍，[`coverage.md`](coverage.md) 讲规则对 topic 的覆盖，
分工见 [`README.md`](README.md)。

先给结论：

1. 图表对表 Flight Review：上游 45 个构造点加 6 个概览区块，本仓 `knowledge/px4/plot/`
   建了 40 个文件，对上 34 项，4 项口径有差。没建的是 7 张频谱图（同一个原因：引擎没有
   谱算子）、Motor RPM、参数变更和 3 个概览块。
2. 检查规则：robotto 的 8 项 PX4 检查全部迁完（4 条更强、2 条等价、2 条有已声明的降级）；
   ardupilot-mcp 的 16 项 APM 检查 13 条齐平、2 条主动降级、1 条未迁。
3. 子系统：3D 回放、PID 分析、机队总览三块还没有，排在 plan 批 C/D。
4. 频谱是当前唯一的共性阻塞项，出路见本文件第五节的四条路线对比。

状态只用五个词：已有 / 部分 / 占位 / 没有 / 不做。

---

## 一、十个上游

| #   | 上游                       | 仓                                         | 形态                     | 授权 | 与本仓的关系                      |
| --- | -------------------------- | ------------------------------------------ | ------------------------ | ---- | --------------------------------- |
| U1  | Flight Review              | `PX4/flight_review`                        | Python / Bokeh Web       | BSD  | PX4 图表 + PID + 3D 的唯一上游    |
| U2  | robotto ai-drone-toolkit   | `robotto` → `robotto-drone-core`           | Python 库                | —    | 本仓的直接前身，`rules/` 迁移来源 |
| U3  | Auterion ecl_ekf_analysis  | `Auterion/ecl_ekf_analysis`                | Python CLI               | BSD  | EKF 阈值权威                      |
| U4  | px4_log_analyzer           | `riccardodamiani/px4_log_analyzer`         | Python + YAML            | —    | 与本仓 compute+trigger 同构       |
| U5  | ardupilot-mcp              | `furkanisikay/ardupilot-mcp`（PyPI 0.1.2） | Python MCP，16 检查      | MIT  | 本仓 APM 知识的直接源头           |
| U6  | ArduPilot WebTools（官方） | `ArduPilot/WebTools`                       | 纯浏览器（JS + Pyodide） | GPL  | 同架构可互证；PID/FFT 参考        |
| U7  | FlightMD                   | `Praddyx15/FlightMD`                       | Web 应用，7 规则 + 评分  | —    | 评分 / 参数建议 / 回归集做法      |
| U8  | smarttune-cli              | `raylanlin/smarttune-cli`                  | CLI + MCP，16 工具       | —    | 参数存在性校验门禁                |
| U9  | 其他同类 / 桌面工具        | `pyulog`、PlotJuggler、Foxglove …          | 库 / 脚本 / 桌面         | —    | 备查                              |
| U10 | ML 分类器                  | `BeastAyyG/*`、`Sathvik12004/*`            | 训练权重                 | —    | 不做：权重不可审计                |

要逐条对表的是 U1、U2、U5 三个，下面分别展开；其余在第五节一并说。

## 二、U1 Flight Review：图表 45 处构造点

上游实码在 `configured_plots.py` 的 `generate_plots()`，45 处 `data_plot =` 构造点
（`grep -cE "^\s*(data_plot|plot) = "` 实测）。上游 45 对单张标题 39，差在 6 个构造点
写在了 `for` 循环里（姿态与角速率、局部位置 XYZ、FIFO 三路 IMU），运行时按日志内容展开
成多张。本仓把其中一部分循环合并进一个 YAML，比如 `fifo-accel.yml` 用
`split_by_instance: true` 展开成 IMU0/1/2。本仓实码是 `knowledge/px4/plot/*.yml`，40 个文件。

### 位置 / 姿态 / 速度（14 项，全部已建）

| #   | 上游图                             | 干什么                          | 本仓文件                                             | 状态 |
| --- | ---------------------------------- | ------------------------------- | ---------------------------------------------------- | ---- |
| P1  | Position plot（`DataPlot2D` 大图） | XY 轨迹叠地图 + setpoint + 真值 | `plot/position.yml`（`container: map`）+ `track.yml` | 已有 |
| P2  | Leaflet Map                        | 地理轨迹，按飞行模式着色        | `plot/track.yml`                                     | 已有 |
| P3  | Altitude Estimate                  | GPS / 气压 / 融合高度 / 设定值  | `plot/altitude.yml`                                  | 已有 |
| P4  | Roll Angle                         | 横滚估计 vs 设定值 + 真值       | `plot/roll-angle.yml`                                | 已有 |
| P5  | Pitch Angle                        | 俯仰估计 vs 设定值              | `plot/pitch-angle.yml`                               | 已有 |
| P6  | Yaw Angle                          | 偏航 + 前馈 `yaw_sp_move_rate`  | `plot/yaw-angle.yml`                                 | 已有 |
| P7  | Roll Angular Rate                  | 角速率 + 积分项                 | `plot/roll-rate.yml`                                 | 已有 |
| P8  | Pitch Angular Rate                 | 同上                            | `plot/pitch-rate.yml`                                | 已有 |
| P9  | Yaw Angular Rate                   | 同上                            | `plot/yaw-rate.yml`                                  | 已有 |
| P10 | Local Position X / Y / Z           | 局部位置三轴 vs 设定值          | `plot/local-x.yml`、`local-y.yml`、`local-z.yml`     | 已有 |
| P13 | Velocity                           | 三轴速度 vs 设定值              | `plot/velocity.yml`                                  | 已有 |
| P14 | Local Position 真值                | SITL 真值叠加                   | 并入 P1/P10 的 `_ref` 候选组                         | 已有 |

上游另有 `vtol_tailsitter.py`，检测到尾座机时改写姿态与角速率数据；本仓没有这个分支，
场景少，不阻塞。

### VIO 与传感器（16 项，全部已建）

VIO 五项（P15–P19：位置/速度/姿态/角速率/延迟，数据源 `vehicle_visual_odometry`）
对应 `plot/visual-odom-*.yml` 五个文件，全部已建。

传感器 11 项里 10 项已建：磁场（`plot/mag.yml`）、测距（`distance.yml`）、GPS 精度
（`gps-uncertainty.yml`）、GPS 噪声（`gps-noise.yml`）、磁场对推力（`thrust-mag.yml`）、
电源（`power.yml`）、温度（`temperature.yml`）、估计器标志（`estimator-flags.yml`）、
失效保护标志（`failsafe-flags.yml`）、CPU 与内存（`cpu-ram.yml`）。唯一没建的是
S11 参数变更（`changed_parameters`），上游也只是个按钮占位。

### 控制与作动器（8 项构造点，7 已建）

| #   | 上游图                   | 干什么                         | 本仓文件                                                                    | 状态           |
| --- | ------------------------ | ------------------------------ | --------------------------------------------------------------------------- | -------------- |
| C1  | Airspeed                 | 空速 vs 地速                   | `plot/airspeed.yml`                                                         | 已有           |
| C2  | TECS                     | 总能量控制                     | `plot/tecs.yml`                                                             | 已有           |
| C3  | Manual Control Inputs    | 摇杆四通道 + 开关              | `plot/rc.yml`                                                               | 已有           |
| C4  | Raw Radio Control Inputs | 原始 RC 通道（老日志回退分支） | `plot/rc.yml`（同文件候选组）                                               | 已有           |
| C5  | Actuator Controls 0      | 姿态+推力控制输出              | `plot/actuator-controls-0.yml`                                              | 已有           |
| C6  | Actuator Controls 1      | VTOL 固定翼模式                | `plot/actuator-controls-1.yml`                                              | 已有           |
| C7  | Actuator Controls FFT    | 作动器输出频谱（y 限 0–0.01）  | `plot/spectrum-actuator-controls.yml`（window="none"、ymax 0.01、参数标线） | **已有（W6）** |
| C8  | Actuator Outputs ×3      | 舵机 / 执行器输出              | `plot/actuator-outputs.yml`（Motor/Servo/Main/AUX 四容器）                  | 已有           |

### 振动与频谱（13 项构造点，11 已建 / 2 推迟）

已建十一项：原始加速度（`raw-accel.yml`）、振动指标（`vibration.yml`，上游唯一
硬编码判定的三色带 4.905 / 9.81）、原始陀螺（`raw-gyro.yml`）、FIFO 三路加速度
（`fifo-accel.yml`）、FIFO 三路陀螺（`fifo-gyro.yml`）、FIFO 采样规律性
（`sampling.yml`，W6 补齐了 delta t 线，口径与上游对齐），
以及 **W6 铺的谱图**（W5 样板 `spectrum-gyro.yml`，陀螺 X 单边幅度谱，沿用）：

| 上游构造点                                  | 本仓文件                                                                        | 口径                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 加速度 PSD（V5，2D 热图）                   | `plot/spectrogram-acceleration.yml`                                             | `container: spectrogram`：hann 256/128、帧内去均值、三轴 PSD 求和、10·log10 dB、fs≥100 门                                            |
| 角速度 PSD（V6，2D 热图）                   | `plot/spectrogram-angular-velocity.yml`                                         | 同上                                                                                                                                 |
| 角加速度 PSD（V7，2D 热图）                 | `plot/spectrogram-angular-acceleration.yml`                                     | 同上                                                                                                                                 |
| 作动器 FFT（C7，线图）                      | `plot/spectrum-actuator-controls.yml`                                           | 上游 DataPlotFFT 口径：无窗、2/N 归一、ymax 0.01；IMU_DGYRO/GYRO/MC_DTERM_CUTOFF 参数标线                                            |
| 角速度 FFT 标滤波器频率线（V13 的姊妹口径） | `plot/spectrum-angular-velocity.yml` / `plot/spectrum-angular-acceleration.yml` | 角速度/角加速度幅度谱 + IMU_GYRO_CUTOFF / IMU_DGYRO_CUTOFF / IMU_GYRO_NF_FREQ 参数标线（解不出的线消失并留说明，绝不画在猜的频率上） |

谱图从 W4/W5 的「有算子无图」变成 W6 的「有算子有图」：构建期 `compileSpectrogram`
（2D 热图，`container: spectrogram`）与 `compileSpectrum`（线图，`container: spectrum`）
是两条独立容器，引擎侧 `spectrum(...)`（单序列谱）与 `stft(...)`（三轴 PSD 求和时频谱，
94 个算子里的两个）平行。

推迟的两项是 FIFO PSD（V9/V12，`spectrogram-*.yml` 的 FIFO 版本）：样例日志没有
`sensor_accel_fifo`/`sensor_gyro_fifo`，铺了也无法满足 L0（真实浏览器渲染断言），
登记到 W7 后有真实 FIFO 日志再铺。多实例（多 IMU）频谱拆分同理推迟（见
`coverage.md` §4.5）。

另一张超出上游的：Motor RPM（`plot/motor-rpm.yml`，`esc_status.esc[0..7].esc_rpm`
嵌套字段引用）——上游没有这张图，本仓补上。它依赖 W6 顺带修好的**取数层嵌套数组
支持**（构建期字段引用正则允许中间段带元素下标，运行期 provider 按字面 data key 命中）。

### 概览区与非图表子系统

概览区六块：机型信息头（部分，有报告头无 3D/PID 链接）、信息表（部分，有 `facts`
未成表）、硬故障横幅（没有）、日志损坏横幅（部分，APM 侧 `integrity.yaml` 有）、
参数变更按钮（没有）、错误标签图例（没有）。Motor RPM 图 **W6 已补**
（`plot/motor-rpm.yml`，见上节），`motors` 规则继续覆盖饱和与不平衡。

非图表子系统：3D View、PID Analysis、Overview 页没有（前两项在 plan 批 C/D）；
统计表、配置表算部分；日志浏览与数据库明确不做（本仓纯客户端零上传）；VTOL 尾座机
没有；pyulog 之上的取数封装已有（`providers/` 等价）。

PID 分析是一个子系统，能力清单留作参照：Wiener 反卷积求阶跃响应、Hanning/Tukey
叠窗频域、按油门与幅值分层统计（阈值 500 deg/s）、加权众数 2D 直方图、D 项误差噪声谱、
等间隔重采样。核心参数 `framelen=1s`、`resplen=0.5s`、`cutfreq=25Hz`、`superpos=16`。

## 三、U2 robotto：PX4 检查 8 项，8/8 迁移

上游实码：`packages/robotto-drone-core/src/robotto_drone_core/ulog_tools.py`
的 `diagnose_flight(path)`（第 523–800 行），阈值常量在第 70–78 行。

| #   | 上游 check        | 上游判据与阈值                            | 本仓现状                                               |
| --- | ----------------- | ----------------------------------------- | ------------------------------------------------------ |
| 1   | `logged_errors`   | `ERR+` 聚合 critical                      | 已有，拆成 `log-errors` + `log-warnings`               |
| 2   | `ekf_innovations` | 四路检验比峰值，warn 0.5 / crit 1.0       | 已有，口径改「拒绝占比」1%/5%，扩到 10 路              |
| 3   | `ekf_faults`      | `filter_fault_flags` 或 `nan_flags` 非零  | 占位，位掩码逐位判，`nan_flags` 未查                   |
| 4   | `vibration`       | `vibe[2]` 峰值，warn 30 / crit 60 m/s     | 占位，换数据源 `vehicle_imu_status`（4.905/9.81 m/s²） |
| 5   | `cpu_load`        | `cpuload.load`，warn 0.90 / crit 0.95     | 部分，阈值相同                                         |
| 6   | `battery`         | `remaining` 最小值，warn 0.20 / crit 0.10 | 已有，更细且修掉 -1 误报                               |
| 7   | `failsafe`        | 5 布尔边沿 + `nav_state` 进降级状态       | 已有，完整复刻，armed 过滤更严                         |
| 8   | `mode_thrash`     | `nav_state` 变化次数 >12                  | 部分，阈值相同                                         |

几处实现差异值得记：上游四路创新比取瞬时峰值，本仓改成超阈样本占比加
`channel_min=3` 去毛刺，还带多 EKF 实例定位；故障位上游逐实例取 max 会漏组合位，
本仓 `bit_or_max` 跨实例按位或；failsafe 上游只对 rc/link 两个字段做 armed 过滤，
本仓的声明式边沿事件把六条全覆盖。上游 `armed_intervals` 的切段算法
（含 `IN_AIR_RESTORE` 边界）比本仓用的内置更完整，核对边界时可对照。另有一处
命名差异：上游 `nav_state` 18 叫 `"AUTO_LAND"`，本仓写 `"LAND"`。

## 四、U5 ardupilot-mcp：APM 检查 16 项

上游实码：`ardupilot-mcp/checks/*.py`（`@register_check` 注册表）。载体不同要先说清：
上游是 Python 类，命令式、带分支与异常；本仓是声明式 YAML（`compute` 表达式 +
`triggers`），判定条件必须能写成算子链，写不出来只能占位或降级。

| #   | 上游检查      | 本仓文件与条数             | 现状与差异                                                       |
| --- | ------------- | -------------------------- | ---------------------------------------------------------------- |
| 1   | `events`      | `events.yaml`（3 条）      | 已有；MODE 时间线用文本列（原卡 C1，2026-09 解除）               |
| 2   | `ekf`         | `ekf.yaml`（4 条）         | 已有，同阈值；候选组成对写，不写 `outputs.stats`                 |
| 3   | `vibration`   | `vibration.yaml`（6 条）   | 已有，同阈值；拆 6 条（一条规则最多出一条 finding）              |
| 4   | `power`       | `power.yaml`（3 条）       | 占位；仍走 `estimate_cells` 电芯估算，阈值未过真实日志验证       |
| 5   | `gps`         | `gps.yaml`（3 条）         | 占位；有意偏离：拿不到 armed 窗口时直接 skip，上游退回全程判     |
| 6   | `attitude`    | `attitude.yaml`（3 条）    | 已有；2026-09 补 `excursion_events` 后「持续 1s」判据恢复        |
| 7   | `compass`     | `compass.yaml`（1 条）     | 已有；补 `std`/`cv` 后 CV 判据（0.30/0.60）恢复                  |
| 8   | `motors`      | `motors.yaml`（2 条）      | 已有；补 `stack_columns`/`add` 后恢复                            |
| 9   | `rcin`        | `rcin.yaml`（1 条）        | 已有；补 `excursion_events` 后对齐上游「持续 ≥2s」判据           |
| 10  | `timing`      | `timing.yaml`（2 条）      | 已有；补 `diff`/`median`/`sum` 后恢复，`gap_events` 复刻上游     |
| 11  | `config`      | `config.yaml`（3 条）      | 已有；原 100% 卡在读不到参数，加 `PARAMS` 变量 + `_cfg()` 后转真 |
| 12  | `calibration` | `calibration.yaml`（1 条） | 已有；`np.hypot` 求三轴硬铁偏移模长                              |
| 13  | `param_audit` | `param_audit.yaml`（6 条） | 已有，同类参数依赖                                               |
| 14  | `sensors`     | `sensors.yaml`（3 条）     | 已有；「配置但无数据」= `_cfg` 有值但消息缺失                    |
| 15  | `integrity`   | `integrity.yaml`（1 条）   | 已有；provider 补 `is_log_ok()` 后规则补齐                       |
| 16  | `prearm`      | `prearm.yaml`（1 条）      | 已有；`count_items` 的 `contains=`，大小写不敏感                 |

`_cfg()` 有个坑：只能在 `compute` 里用，`when` 里写非法。汇总：13 齐平 +
2 主动降级（power / gps，理由在上表）+ `vehicle_profile` 未迁移（需要 hover 油门
反推推重比，本仓无对应算子）；`recommend_tuning` 属建议层，等 PID 分析。

从上游一并迁来的资产：码表 8 张（`_FRAME_CLASS_MAP`、`_MSGTYPE_*` 等）、
阈值审计（上游 `docs/SOURCES.md` 的 198 条假设：confirmed 86 / heuristic 22 /
design choice 82 / corrected 8）、`estimate_cells` 电芯估算。

## 五、其余上游：旁证与可借鉴

| 上游                  | 提供的能力                                             | 本仓 | 可借鉴                             |
| --------------------- | ------------------------------------------------------ | ---- | ---------------------------------- |
| U3 ecl_ekf_analysis   | EKF 创新比批处理、四步结构化分析                       | 部分 | 阈值对表；四步分析做报告骨架       |
| U4 px4_log_analyzer   | 声明式事件 + 时间窗去抖、组合派生                      | 部分 | 时间窗去抖；约 80 参数的监控清单   |
| U6 ArduPilot WebTools | `fft.js` + Pyodide；PIDReview；FilterTool Bode；MAGFit | 没有 | `fft.js` 是频谱零上传的现成答案    |
| U7 FlightMD           | health score 0–100 + 权重；确切参数改动；50 份日志验证 | 没有 | 总评分、参数改动、回归集做法       |
| U8 smarttune-cli      | 参数存在性校验门禁；6 层 JSON 知识库；置信度           | 没有 | 参数存在性校验门禁（最该抄的一条） |
| PX4 官方四步分析      | 完整性 → 跟踪 → 传感器 → 电源                          | 部分 | 报告页叙事骨架                     |
| px4-log-analysis      | Claude skill：`accel-vibration`（PSD 找陷波）等 4 个   | 没有 | PSD 做法对应频谱缺口               |
| flight-tools          | RSSI vs 距离、功率图、日志浏览器                       | 没有 | RSSI 与距离关系图值得照搬          |
| px4-ulog-mcp          | 5 个 MCP 工具（summary/query/failsafe/diagnose…）      | 部分 | 本仓 MCP 工具集的参照              |
| PX4/pyulog            | `ulog_info`/`ulog2csv`/`ulog2kml`                      | 已有 | 本仓解析底层                       |
| 桌面工具              | PlotJuggler / FlightPlot / MAVGCL …                    | 不做 | 那是工作台形态                     |
| ML 分类器（U10）      | 训练权重                                               | 不做 | 与「确定性引擎是唯一真相源」冲突   |

频谱的出路，上游给了四条路线：

| 路线             | 来源                         | 本仓适用性                                |
| ---------------- | ---------------------------- | ----------------------------------------- |
| 构建期 Python 算 | Flight Review（`numpy.fft`） | 不可用，本仓纯客户端                      |
| 浏览器 JS FFT    | WebTools `fft.js`            | 架构一致，首选参考                        |
| Pyodide + numpy  | WebTools FilterReview        | 可行，已有 `check_engine_pyodide` 基建    |
| 直接读固件算好的 | `sensor_gyro_fft` topic      | 成本最低，见 [`coverage.md`](coverage.md) |

## 六、本仓有而上游没有的

U1/U2/U5 都没有规则层：Flight Review 唯一的硬编码判定是振动图三色背景带，U2 是
命令式 Python 检查，U5 是 16 个 Python 类。本仓在这之上的部分：guard 四条（短日志/
中途重启/topic 缺失/丢包）、电池三件套、电机平衡与姿态振荡与超调（上游归为图）、
GPS 三类、VTOL 越限/空速健康/风扰估计、日志消息分级、IMU 零偏漂移、故障知识库
`fault-kb.yaml`（根因 → 排查步骤 → 禁忌）。工程上，声明式规则 schema、规则与图共用
一套取数（`_ref` 候选组、`unit=` 换算、算子同源）、构建期契约校验（拦字段引用、label
对齐、单图单量纲、地图唯一性）也是本仓的做法。

## 七、汇总

| 维度   | 上游                         | 本仓                                    |
| ------ | ---------------------------- | --------------------------------------- |
| 图表   | 45 构造点 + 6 概览区块       | 34 已有 / 4 部分 / 7 频谱 + 3 块没有    |
| 规则   | U2 8 项 + U5 16 项           | 8/8 迁移；16 项中 13 齐平 2 降级 1 未迁 |
| 子系统 | 3D / PID / Overview / Tables | 前三者没有，在 plan 批 C/D              |
| 频谱   | 四条路线都有先例             | 7 张图唯一阻塞项                        |

后续怎么补见 [`gap.md`](gap.md)，当前覆盖情况见 [`coverage.md`](coverage.md)。
