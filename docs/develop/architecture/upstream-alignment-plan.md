# 上游对齐计划：照搬 Flight Review → 再拉开差距

> 目标（用户 2026-09-30 定）：**先把上游优点全盘覆盖**（PLOT 图表、PID tune、3D view），
> **再细化拉开差距**；知识库学上游的 EKF 分析、UAV 分析。
>
> 原则：**先覆盖，后精调**。阈值不纠结，一律 `[暂定]`；先把检查与图表挂上。
>
> 前置事实见 `../rules/upstream-gap.md`、`../rules/coverage-plan.md`。

---

## 0. 结论：差距分三类，做法完全不同

| 类别                      | 规模                                                 | 做法                                   |
| ------------------------- | ---------------------------------------------------- | -------------------------------------- |
| **A. 图表补齐**           | 45 张里已有 36 张，缺 **9 张**（含 6 张需 FFT/频谱） | 照搬 —— 但**先补渲染能力**，见图表引擎 |
| **B. PID tune / 3D view** | 各 1 个完整子系统，本仓**完全没有**                  | 照搬 —— 是两块新战场，非「补几张图」   |
| **C. 规则覆盖**           | 上游 8 项全已迁移；零覆盖 topic 14 个                | 先补覆盖（批 1+2），再谈精调           |

---

## 1. 现状盘点（已核实，非估算）

**图表**：45 张里本仓已有 36 张（`knowledge/px4/plot/` 41 份 YAML，含地图）。
缺 9 张：

| 缺的图                      | 前置能力               |
| --------------------------- | ---------------------- |
| Actuator Controls FFT       | FFT 算子               |
| Angular Velocity FFT        | FFT 算子               |
| Angular Acceleration FFT    | FFT 算子（需新 topic） |
| Acceleration PSD            | 频谱算子               |
| Angular Velocity PSD        | 频谱算子               |
| Angular/Accel PSD (FIFO ×2) | 频谱算子               |
| Sampling Regularity (FIFO)  | 差分 + dropout 标注    |
| Motor RPM (`esc_status`)    | 无（纯新图）           |
| Manual Control Inputs       | 无（纯新图）           |

**PID tune**：上游 `pid_analysis.py`（20KB）是一个**完整子系统** ——
Wiener 反卷积求阶跃响应、Tukey/Hanning 窗叠加、2D 直方图、按油门分层、噪声谱。
**本仓零对应物**，且它不是"一张图"，是"一整套信号处理 + 一个新页面"。

**3D view**：上游是 `link_to_3d_page` + 独立 3D 站点（Cesium/three.js），
本仓只有 2D 地图轨迹（`track.yml`）。**本仓零对应物**。

**规则**：上游 robotto `diagnose_flight` 的 8 项检查**已全部迁移**（详见 `upstream-gap.md`），
本仓是超集。待补的是 14 个零覆盖 topic（`coverage-plan.md`）。

---

## 2. 计划：四个批次

### 批 A —— 规则覆盖（先做，最快见效）

用户已确认：**批 1 + 批 2，阈值一律 `[暂定]`**。

| 批次 | 内容                                                                                                                                          | 规则数 | 产出       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- |
| A1   | `failure_detector_status`、`sensor_gyro_fft`、`estimator_gps_status`、`system_power`、`vehicle_land_detected`（固件已算好结论，读现成标志位） | +5     | 26 → 31    |
| A2   | `esc_status`/`esc_report`（电机级）、`input_rc`/`rc_channels`（链路）、`home_position`（返航点）                                              | +3~4   | 31 → 34~35 |
| A3   | 补字段：GPS 干扰（`noise_per_ms`/`jamming_indicator`）、陀螺振动、电池温度                                                                    | +3     | → 37~38    |
| A4   | 待定：`estimator_status.vibe[2]`（上游第 4 条的原数据源，与现有 vibration 互补）                                                              | +1     | → 39       |

**验收**：`compare_baseline.py` 只允许新增 finding/skipped，不许改既有 finding。
**约束**：每条新 group 要登记进 `facts.yaml` 的 `group_order` 与 `rule_meta.by_group`。

### 批 B —— 图表渲染能力（照搬的硬前提）

缺的 9 张图里 6 张卡在**没有频谱/FFT 能力**。所以先建能力，再铺图。

| 步骤 | 内容                                                                 | 风险                                          |
| ---- | -------------------------------------------------------------------- | --------------------------------------------- |
| B1   | 引擎加 `psd()` / `fft()` 算子（`knowledge/engine/operators.py`）     | 大 —— 要看在哪跑：构建期预算 vs 浏览器 worker |
| B2   | `container` 加 `spectrogram` 类型（`plot-schema.md` 已预留该扩展点） | 中 —— 前端要新渲染器                          |
| B3   | 铺 6 张频谱图（照搬 `configured_plots.py` 的取数与坐标范围）         | 低 —— 是声明                                  |
| B4   | 补 `esc_status` Motor RPM 图、`Sampling Regularity`(FIFO) 图         | 低                                            |

**关键决策待定**：频谱在**构建期预计算**还是**浏览器实时算**。
本仓是静态站点，构建期算会显著拉长 `build:kb`；浏览器算要过 Pyodide/worker 的性能关。
**这是批 B 的第一个技术选择点，需实测后再定。**

### 批 C —— PID tune（新子系统）

上游 `pid_analysis.py` 的能力拆解：

| 能力           | 说明                                       |
| -------------- | ------------------------------------------ |
| 阶跃响应反卷积 | Wiener 反卷积，从 setpoint/gyro 求系统响应 |
| 频域分析       | 叠窗 FFT，看控制带宽与相位裕度             |
| 分层统计       | 按油门/输入幅值分层，2D 直方图             |
| 噪声谱         | D 项误差频谱，指导滤波器配置               |

**做法**：先**降压照搬**——不做全套反卷积，先做"setpoint vs 实测"的**跟踪误差曲线 + 统计**
（这是上游 PID 图的最核心价值，也是 `docs/develop/rules/coverage-plan.md` 里"PID 跟踪"缺口的解）。
反卷积与频域分析作为**第二阶段**。

**需要的新算子**：setpoint-actual 对齐统计（可能可复用现有 `interval_mask`/`apply_mask`）。

### 批 D —— 3D view（新子系统）

上游是独立 3D 站点。本仓现状：2D 地图轨迹已有。

**做法**：三档，按成本递增：

1. **低成本**：借鉴 `leaf-diag` 的坐标系转换（NED ↔ 机体系），先把姿态叠加到 2D 轨迹上
2. **中成本**：three.js 渲染轨迹 + 姿态，做成报告页的一个 tab（数据已在 `facts.track`）
3. **高成本**：完整 Cesium 三维地球（上游形态）

**建议先做 2** —— 数据已经进产物（`analysis-engine.generated.ts` 的 `facts.track`），
前端加一个渲染器即可，不需要改引擎。

---

## 3. 执行顺序建议

```
A（规则覆盖，见效快、风险低）
  └─ A1 → A2（用户已确认）
B1（频谱能力）→ B3（6 张频谱图）
  └─ 决策点：构建期 vs 浏览器
C（PID 跟踪误差，先降压版）
D2（three.js 轨迹 + 姿态）
```

**理由**：A 风险最低且直接扩大产品面；B 是「照搬 Flight Review」的主体；
C/D 是「拉开差距」的新战场，应在照搬完成后启动。

---

## 4. 待你拍板的三件事

1. **频谱在哪算**：构建期（拉长 build，但不占用户浏览器）vs 浏览器 worker（实时，但吃性能）。
   需要实测才能定，**我先做实测**给数据？
2. **PID 的深度**：先做「跟踪误差曲线 + 统计」（降压版），还是一次到位做反卷积/频域？
3. **3D view 的档位**：建议先做 `D2`（three.js 轨迹+姿态），是否同意？

---

## 5. 已核实的事实（备查）

- 上游 robotto `diagnose_flight` 8 项检查的逐条对表 → `../rules/upstream-gap.md` §2
- 45 张图的逐张清单与缺口 → `../rules/upstream-gap.md` §1
- 14 个零覆盖 topic 的字段与优先级 → `../rules/coverage-plan.md` §2
- 取数路径：`cdn.jsdelivr.net/gh/<repo>@<branch>/<path>`（沙箱直连 GitHub 被拦）
- 上游关键文件：`configured_plots.py`(62KB)、`pid_analysis.py`(20KB)、
  `robotto_drone_core/ulog_tools.py`(27KB)、`Auterion/ecl_ekf_analysis`
