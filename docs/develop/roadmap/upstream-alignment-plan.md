# 上游对齐实施 Plan：复刻 Flight Review → 借鉴 EKF/APM 生态 → 拉开差距

> 用户需求（2026-09-30）：**先把上游优点全盘覆盖**（绘图、PID tune、3D view），**再细化拉开差距**；
> PX4 侧借鉴 `ecl_ekf_analysis` / `px4_log_analyzer` / `ai-drone-toolkit`；APM 侧对比 `ardupilot-mcp`
> 及其它 MCP；并在 GitHub 上找值得借鉴的日志分析知识。
>
> 原则：**先覆盖，后精调**。阈值一律 `[暂定]`，先把检查与图表挂上。
>
> 本文是**可执行 plan**，不是评估报告。事实底账见 `../knowledge/upstream-gap.md`、
> `../knowledge/coverage-plan.md`、`../knowledge/upstream-kb-collection.md`、`../architecture/plot-schema.md`。

---

## 1. 项目启动

| 项                   | 内容                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **项目类型**         | 内置确定性日志诊断引擎的**能力补齐与生态对齐**（非新建项目）                                                                                                                                  |
| **初始需求**         | 四条：①复刻 Flight Review 核心（绘图/PID/3D）并对比差距 ②PX4 借鉴 ecl_ekf_analysis / px4_log_analyzer / ai-drone-toolkit ③APM 对比 ardupilot-mcp 等 MCP ④GitHub 搜集可借鉴的日志分析知识      |
| **技术栈**           | 引擎 Python（无重依赖，拼接后进 Worker）→ Pyodide 浏览器侧；前端 Next.js + plotly.js；门禁 `tools/ci` 34 项                                                                                   |
| **是否存在终极功能** | 是                                                                                                                                                                                            |
| **终极功能定义**     | 用户上传一份 `.ulg`/`.bin`，端侧产出「规则结论 + 可交互诊断图 + 频谱 + PID 分析 + 3D 姿态轨迹」，LLM 只做中文解释，原始日志不出设备                                                           |
| **技术约束**         | ①引擎必须**字段无关**（`check_engine_purity` 拦 `vehicle_`/`cpuload` 等具体名）②构建期**不执行**引擎代码只搬运，改引擎必须重跑 `pnpm web:build:kb` ③规则阈值一律 `[暂定]` ④端侧解析零算力成本 |
| **默认循环轮次**     | 3                                                                                                                                                                                             |
| **安全最大轮次**     | 6                                                                                                                                                                                             |
| **每轮最大改动点**   | 3                                                                                                                                                                                             |
| **角色配置**         | 主控（编排）/ 架构师（引擎与前端边界）/ 程序员 / 测试员（门禁 + 基线回归）                                                                                                                    |

**成功标准（可判定）**

1. 规则 **26 → 34~35**（PX4），新 group 全部登记进 `facts.yaml` 的 `group_order` 与 `rule_meta.by_group`。
2. `compare_baseline.py` 跑 6 份 PX4 基线：**只允许新增 finding / skipped，既有 finding 一字不改**。
3. 前端能渲染 `container: spectrogram` 的图；6 张频谱图在基线上不报错。
4. PID 页能画出「setpoint vs 实测」跟踪误差曲线 + 统计值。
5. 报告页 3D tab 能看轨迹 + 姿态。
6. `python tools/ci/check_all.py --push` 34 项全绿。

**In scope**

- 批 A 规则覆盖（A1 / A2）、批 B 频谱能力与频谱图、批 C PID 跟踪误差降压版、批 D 3D view 中档 `D2`。
- APM 侧：`phases` 空数组修复（唯一阻塞 APM 诊断深度的问题）。
- 门禁、基线、文档同步。

**Out of scope**

- 阈值精调（本轮一律 `[暂定]`）。
- 45 张图**全量**铺开（只补缺口 9 张）。
- Cesium 完整三维地球（高成本 `D3`）。
- PID 的 Wiener 反卷积 / 频域裕度（第二阶段 `C3`）。
- APM 43 条规则的阈值校准（缺真实 `.bin` 样本，另立项）。
- 工时估算 / 排期 / 里程碑（**本 plan 边界外**）。

---

## 2. 现状盘点（已实测，非估算）

| 资产       | 数量                       | 说明                                                       |
| ---------- | -------------------------- | ---------------------------------------------------------- |
| PX4 规则   | **26**                     | 覆盖 `meta` 的 227 个 topic 里的 12 个                     |
| APM 规则   | **43**                     | 全部 `status: draft`，无真实 `.bin` 验证                   |
| PLOT 预设  | **40**                     | 上游 Flight Review 45 张，缺 9 张                          |
| 引擎算子   | **91**                     | 无 `fft` / `psd` / `spectrogram`；**已有 `zero_cross_hz`** |
| 前端图表库 | `plotly.js-basic-dist-min` | `container` 是判别位，`spectrogram` 为其预留扩展点         |
| 基线       | 6 份 PX4                   | `tools/testdata/baseline/*.json`                           |

**Flight Review 缺的 9 张图**：Actuator Controls FFT、Angular Velocity FFT、Angular Acceleration FFT、
Acceleration PSD、Angular Velocity PSD、Angular/Accel PSD（FIFO ×2）、Sampling Regularity（FIFO）、
Motor RPM、Manual Control Inputs。**其中 6 张卡在同一个前置能力：没有频谱/FFT。**

---

## 3. 外部生态对比（需求 2/3/4 的调研结论）

### 3.1 PX4 侧：三个上游

| 上游                            | 是什么                                                    | 与本仓的关系                                                                                                                                                                                                                                         | 该借鉴什么                                                                                                  |
| ------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **`robotto` ai-drone-toolkit**  | monorepo，`ulog_tools.py` 的 `diagnose_flight()` 8 项检查 | **本仓规则直接祖先**，8/8 已迁移：`logged_errors`/`ekf_innovations`/`battery`/`failsafe` 4 条更强、`cpu_load`/`mode_thrash` 2 条等价、`ekf_faults`/`vibration` 2 条已声明降级。**逐条对表见 [`../knowledge/upstream.md`](../knowledge/upstream.md)** | 仅剩 2 处未对齐：`estimator_status.nan_flags`（未查）、`estimator_status.vibe[2]`（换了数据源，数值不可比） |
| **`Auterion/ecl_ekf_analysis`** | EKF 专用批处理 CLI，管 EKF 创新与创新比                   | 本仓 `ekf-innovation.yaml` / `ekf-faults.yaml` 已覆盖，**阈值是 `[暂定]`**                                                                                                                                                                           | ①创新比阈值对表 `params/` ②**四步结构化分析**作为报告叙事骨架                                               |
| **`px4_log_analyzer`**          | `events.yaml` 声明 ~80 参数 + `time_window_sec` 去抖      | 与本仓 `compute`+`trigger` **几乎同构**                                                                                                                                                                                                              | 事件的**时间窗去抖**（本仓 `excursion_events` 已有雏形）；`complex_data` 组合派生                           |

**PX4 官方「结构化四步分析」**（应写进报告页叙事）：① 日志完整性（是否空中截断）② 控制器是否跟踪设定值
③ 传感器是否有效 ④ 排除电源故障。第 2 步＝批 C；第 4 步需 SD 卡 `fault_*.log`，**日志里拿不到，明确不做**。

### 3.2 APM 侧：`ardupilot-mcp` 与同类

| 工具                                                 | 形态                        | 覆盖面                                                                                                           | 该借鉴什么                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`furkanisikay/ardupilot-mcp`**（本仓 APM 知识源）  | MCP，16 检查                | 飞行动态 + **配置/安装**（参数审计/校准/接线/预解锁）+ **物理推理**（功率裕度/推重比）                           | **16/16 已对齐**：13 齐平 + 2 主动降级（`power` 阈值待验证、`gps` 有意 skip）+ `vehicle_profile` **未迁移**。**逐条对表见 [`../knowledge/upstream.md`](../knowledge/upstream.md) §二**；可借鉴：①`vehicle_profile` 物理推理 ②规则**注册表** ③**按机型跳过不适用的检查**（heli 不跑电机平衡） |
| **`Praddyx15/FlightMD`**                             | Web 应用，7 规则引擎 + 评分 | 振荡/振动/EKF/电池/GPS/参数/电机 + 上升回收；**50 份真实日志验证**                                               | ①**health score 0–100 + 权重**（本仓无总评分）②**每条 finding 给确切参数改动**（`MPC_XY_P: 0.95 → 1.4`）③**50 份真实日志验证**的做法 ④3D 轨迹按风速/HDOP 着色                                                                                                                                |
| **`ArduPilot/WebTools`**（官方）                     | **纯浏览器**套件            | FilterReview（FFT+滤波仿真）/ AnalyticTune / **PIDReview** / FilterTool（Bode）/ SysID / MAGFit / HardwareReport | ①**纯客户端零上传**（与本仓同一架构，可互相印证）②`fft.js` + Pyodide 的数学栈 ③**PIDReview 的频域做法** ④MAGFit 罗盘拟合 ⑤FilterTool 的 Bode 图                                                                                                                                              |
| **`raylanlin/smarttune-cli`**                        | CLI + MCP，16 工具          | PID/FFT/Filter/Mag/SysID/Hardware；**APM+Betaflight+PX4 多平台**                                                 | ①**参数存在性校验门禁**（推荐参数前先验参数在固件里存在且在范围内）——**这是本仓最该抄的一条** ②**6 层知识库为纯 JSON**（Agent 可读写）③每条建议带**置信度 + 推理过程**                                                                                                                       |
| `BeastAyyG` / `Sathvik12004` ardupilot-log-diagnosis | ML 分类器                   | 异常分类 + GPS/IMU 故障                                                                                          | **不学**：结果是训练权重，不可从代码审计（与「确定性引擎是唯一真相源」冲突）                                                                                                                                                                                                                 |
| `fossuav/aap`（AI Playbooks）                        | AI 剧本                     | —                                                                                                                | 观察即可                                                                                                                                                                                                                                                                                     |

### 3.3 社区共识（重要，影响产品定位）

ArduPilot Discourse 的「自动日志分析工具清单」帖里，核心开发者反复表达：

> 「我至今没见过一个 AI 工具产出过一条可信的日志分析」
> 「多数项目是 vibe coding 出来的，作者在编程和飞控两个领域基础都薄弱」
> 「与其事后分析为什么炸机，不如改进配置和操作规程来预防」

**对本仓的含义**：本仓「**确定性引擎是唯一真相来源，LLM 只负责解释和引用**」的定位
**恰好是社区想要的、也是当前生态稀缺的**。不要往「LLM 直接看图下结论」的方向长。

### 3.4 共性缺口 —— 本仓最该补的三件事

1. **真实日志验证集**：FlightMD 用 50 份真实日志验证、ardupilot-mcp 用 40 份真实炸机日志验证，
   本仓 `knowledge/engine/tests/` **只有算子与引擎单测，无端到端真实日志回归**。
2. **参数存在性 / 范围校验**：smarttune 把它做成**强制门禁**；本仓 `_cfg()` 读参数但无校验。
3. **总评分与物理推理**：FlightMD 的 health score、ardupilot-mcp 的推重比，本仓都没有。

---

## 4. 行为契约

| #   | 场景                                    | 输入                                    | 输出                                 | 异常 / 错误                         | 验收标准                      |
| --- | --------------------------------------- | --------------------------------------- | ------------------------------------ | ----------------------------------- | ----------------------------- |
| C1  | 新增 `failure_detector_status` 检查     | 日志含该 topic                          | 一条 finding + metrics               | 无 topic → skipped，写明缺哪个      | 基线只新增 finding            |
| C2  | 新增 `sensor_gyro_fft` 峰值检查         | 日志含 `sensor_gyro_fft`（固件已算好）  | finding，报峰值频率与 SNR            | 老固件无 topic → skipped            | **不写 FFT 算子即可产出**     |
| C3  | 新增 `estimator_gps_status` 检查        | 日志含该 topic                          | finding，报 GPS 估计器判定           | 无 topic → skipped                  | 与 `gps-*` 不重复触发         |
| C4  | 新增 `system_power` 检查                | 日志含 `system_power`                   | finding，报 5V/舵机电压越限          | 无 topic → skipped                  | 与 `power-sag` 语义不冲突     |
| C5  | 新增 `vehicle_land_detected` 检查       | 日志含该 topic                          | finding，报异常着陆状态              | 无 topic → skipped                  | 不误报正常着陆                |
| C6  | 电机级检查（`esc_status`/`esc_report`） | 日志含 ESC 话题                         | 每电机 finding + metrics             | 无 ESC 话题 → skipped               | 新 group 已登记               |
| C7  | 链路检查（`input_rc`/`rc_channels`）    | 日志含遥控话题                          | finding + RSSI/LQ metrics            | 纯数传无遥控 → skipped              | skipped 理由明确              |
| C8  | 返航点检查（`home_position`）           | 日志含该 topic                          | finding（未设/漂移）                 | 无 topic → skipped                  | 与 `gps-*` 正交               |
| C9  | 频谱算子接入                            | `np_series` 的 `compute` 调用频谱算子   | 降采样后的频域序列                   | 长度不足 / 全 NaN → 明确错误文案    | 单测覆盖正常 + 退化两种输入   |
| C10 | `container: spectrogram` 渲染           | 声明了 `spectrogram` 容器的 plot YAML   | 前端渲染出频谱图                     | 未知 `container` → 构建期报错       | 6 份基线端到端无异常          |
| C11 | 铺 6 张频谱图                           | 照搬上游取数与坐标范围                  | 6 份 plot YAML                       | 数据缺失 → 走既有空图通道           | `pnpm web:build:kb` 通过      |
| C12 | Motor RPM + Sampling Regularity         | `esc_status` / `sensor_combined` 时间差 | 2 份 plot YAML                       | 缺 topic → 空图 + warning           | 构建期契约校验通过            |
| C13 | PID 跟踪误差页                          | setpoint 与 gyro/姿态序列               | 跟踪误差曲线 + 统计（RMS/峰值/超调） | 采样长度不等 → 复用既有对齐错误提示 | 页面可见曲线与数值            |
| C14 | 3D view tab                             | 既有 `facts.track`                      | three.js 轨迹 + 姿态                 | 无定位数据 → 隐藏 tab + 提示        | 有数据时正常渲染              |
| C15 | APM `phases` 修复                       | MODE 消息时间线                         | 非空 phases 数组                     | MODE 缺失 → 空数组（保持现状）      | `match_fault_kb()` 命中率上升 |
| C16 | 门禁与基线                              | 全部改动                                | 34 项全绿                            | 任一红 → 修到绿再提交               | `check_all.py --push` 通过    |

---

## 5. 技术方案

| 层级           | 方案                                                                                  | 说明 / 依据                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **规则层**     | 新增 YAML，复用既有 `conditions` + `compute` + `triggers`                             | schema 必填只有 `id`/`name`/`group`/`compute`；`placeholder` 是「未实现」的一等字段                                               |
| **规则分组**   | 新 group 登记进 `facts.yaml` 的 `group_order` 与 `rule_meta.by_group`                 | 不登记 = 构建期报错                                                                                                               |
| **频谱算子**   | 在 `operators.py` 加**字段无关**的频域算子；**先读已有 `zero_cross_hz`**              | 判据：`engine.py`/`operators.py` 里 grep 不到 `vehicle_` 等具体名                                                                 |
| **频谱落点**   | 走既有 `np_series(request_json, max_points=3000)` 通道                                | 该门面已支持 `compute` + 实例 + 单位换算 + LTTB 降采样                                                                            |
| **新容器**     | `container` 加 `spectrogram`                                                          | `../architecture/plot-schema.md` 明确：**`container` 是扩展点，不是枚举**，加一种容器只需加容器类型与 children 变体，其余各层不动 |
| **前端渲染**   | `chart-presets.ts` 加同级 `if (out.container !== "spectrogram") continue;` + 渲染分支 | 现有判别位 `type CompiledOutput = (UnifiedAxes & { container: "axes" }) \| { container: "map" }`                                  |
| **PID**        | 降压版：setpoint vs 实测的跟踪误差 + 统计，不做反卷积                                 | 用现有 `mask_and`/`apply_mask`/`interval_mask` 对齐；反卷积 / 频域裕度留第二阶段                                                  |
| **3D view**    | 中档 `D2`：three.js 轨迹 + 姿态，做报告页一个 tab                                     | 数据已在 `analysis-engine.generated.ts` 的 `facts.track`，**不需要改引擎**                                                        |
| **APM phases** | provider 从 `MODE` 消息切段推 `takeoff`/`hover`/`cruise`                              | `providers/ardupilot.py` 的 `get_report_facts()` 现在硬编码 `"phases": []`                                                        |
| **文档同源**   | `knowledge/engine/README.md` 算子计数校准（现写 92，实测 **91**）                     | 顺手修正                                                                                                                          |

### 5.1 频谱算子：架构权衡留痕（多候选 + 性能敏感，必填）

| 候选                       | 做法                           | 优点                                 | 代价                                  | 撤销条件                     |
| -------------------------- | ------------------------------ | ------------------------------------ | ------------------------------------- | ---------------------------- |
| **A 构建期预计算**         | `build:kb` 阶段算好写进产物    | 用户端零开销；产物可直接检查         | **显著拉长 `build:kb`**；产物体积变大 | `build:kb` 时长增长不可接受  |
| **B 浏览器 Worker 实时算** | Pyodide + numpy 在 Worker 里算 | 零构建成本；数据不出端（零上传承诺） | 吃用户 CPU；大日志可能卡顿            | 实测在目标机型超出可接受耗时 |

**反选理由与建议**：先按 **A** 跑通并测得 `build:kb` 时长增量，再决定是否切 **B**。
参考 `ArduPilot/WebTools` 的选择——它用 `fft.js` **纯客户端**做，说明浏览器侧频谱在工程上成立，
但它是 JS 直算、不是 Pyodide 里的 numpy，**不能直接套用结论**。

> **B4 性能敏感路径：禁止无基线声称「提升」。** 两种方案都必须实测并把数字写回本节。

---

## 6. Wave 执行计划

| Wave    | 任务                                                                                                                                    | 依赖     | 验证                                                  |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------- |
| **W1**  | 基线冻结：跑 `compare_baseline.py` 存 6 份结果作为对照                                                                                  | —        | 6 份基线可复现                                        |
| **W2**  | 批 A1：`failure_detector_status` / `sensor_gyro_fft` / `estimator_gps_status` / `system_power` / `vehicle_land_detected`（+5，26 → 31） | W1       | `check_rules_fields.py --strict` + 基线只新增 finding |
| **W3**  | 批 A2：`esc_status`/`esc_report` / `input_rc`/`rc_channels` / `home_position`（+3~4，31 → 34~35）                                       | W2       | 同上；新 group 已在 `facts.yaml` 登记                 |
| **W4**  | 批 B1a：读并确认 `zero_cross_hz`；实现字段无关频谱算子（先按候选 A）                                                                    | 频谱实测 | 算子单测（正常 + 退化输入）                           |
| **W5**  | 批 B2：`container` 加 `spectrogram`；前端加判别位与渲染分支                                                                             | W4       | 6 份基线端到端无异常；`tsc` / `eslint` 绿             |
| **W6**  | 批 B3 + B4：铺 6 张频谱图 + Motor RPM + Sampling Regularity                                                                             | W5       | `pnpm web:build:kb` 通过                              |
| **W7**  | 批 C 降压版：PID 跟踪误差曲线 + 统计                                                                                                    | W3       | 页面可交互验证                                        |
| **W8**  | 批 D2：three.js 轨迹 + 姿态 tab                                                                                                         | W3       | 有数据时正常渲染；空数据隐藏 tab                      |
| **W9**  | APM `phases` 修复（从 `MODE` 切段推飞行阶段）                                                                                           | W1       | `check_apm_e2e.py` 通过；故障库命中率上升             |
| **W10** | 文档与门禁收口：算子计数校准、覆盖率文档更新、`check_all.py --push` 全绿                                                                | W2–W9    | 34 项全绿                                             |

**执行顺序**：`W1 → W2 → W3 → W4 → W5 → W6 → W7 → W8 → W9 → W10`。
理由：A 风险最低、直接扩大产品面；B 是「复刻 Flight Review」的主体；C/D 是「拉开差距」的新战场，放照搬之后。

> **CHECKPOINT 规则（C 池命中：改动文件 ≥5、改点 ≥10）**：每 5 个文件落一次 CHECKPOINT，
> 备份 `.bak` 保留 10 版，改后回读确认。`ROLLBACK > 20%` 整批回退。

---

## 7. 验证与发布

| 维度         | 做法                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **测试**     | `compare_baseline.py`（6 份基线，只允许新增）/ `check_rules_fields.py --strict` / `pytest-engine` / `build-kb-parity` / `mutate-guards`                              |
| **功能验证** | **L0 硬约束**：凡改动有用户可达入口（报告页 / 图表 / 3D tab），必须**真实驱动**（真实入口 → 真实操作 → DOM/行为断言），**禁止仅以 lint / 纯函数 / 源码静态断言替代** |
| **安全**     | `check-secrets`；端侧解析原则不变（原始日志不出设备）；新增依赖需过审                                                                                                |
| **性能**     | 频谱两方案**先实测再定**：候选 A 记 `build:kb` 时长增量，候选 B 记 Worker 计算耗时；**无基线不得声称提升**                                                           |
| **发布**     | `python tools/ci/check_all.py --push` 全绿后提交；commit-msg 走 `docs(...)` / `feat(...)` 规范                                                                       |
| **回滚**     | `git revert <sha>` + **必须重跑 `pnpm web:build:kb`**（产物是构建期搬运的，不重跑会不一致）                                                                          |
| **监控**     | 基线对比脚本是回归哨兵；新 finding 一旦在无相关改动的提交里出现即视为回归                                                                                            |
| **告警**     | `compare-baseline` job 红即阻断 push                                                                                                                                 |
| **巡检**     | 每次新增规则后回看 `../knowledge/coverage-plan.md` 的 topic 覆盖数字是否需要更新                                                                                     |

---

## 8. 交付材料

| 材料         | 内容                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **使用说明** | 规则注释阈值标注：`[暂定]` = 未对表上游；将来回填 `[来源]`，写法与 `vibration.yaml` 统一                                                 |
| **部署说明** | 无新增服务器；改引擎后必须 `pnpm web:build:kb` 重新生成产物再部署                                                                        |
| **回滚说明** | `git revert` + 重跑 `build:kb`；产物不一致是回滚最常见的坑                                                                               |
| **运维说明** | 基线是**回归基线不是性能基线**；新增 finding 需人工确认是否本意                                                                          |
| **已知限制** | ①新阈值全部 `[暂定]` ②APM 43 条仍未校准、缺真实 `.bin` ③频谱方案未最终拍板 ④PID 只做跟踪误差 ⑤3D 只到 `D2` ⑥无总评分与物理推理（见 §10） |

---

## 9. 待拍板（不阻塞开工）

1. **频谱在哪算**：构建期（拉长 `build:kb`，不占用户浏览器）vs 浏览器 Worker（实时，吃性能）。
   **建议先实测给数据再定**，不阻塞 W1–W3。
2. **PID 深度**：先做「跟踪误差曲线 + 统计」（降压版，本 plan 默认），还是一次到位做反卷积 / 频域？
3. **3D view 档位**：建议先做 `D2`（three.js 轨迹 + 姿态），是否同意？

---

## 10. 下一轮候选（本轮不做，登记以免遗忘）

按 §3.4 的共性缺口，以下三项是**本仓相对生态最明显的空白**，建议下一轮立项：

| 候选                          | 来源                                 | 价值                                                                 |
| ----------------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| **真实日志端到端回归集**      | FlightMD 50 份 / ardupilot-mcp 40 份 | 本仓现在只有单测；缺它 = 阈值改动无回归网                            |
| **参数存在性 / 范围校验门禁** | smarttune-cli                        | 推荐参数前先验参数在固件里存在且值在范围内，避免"推荐了不存在的参数" |
| **总评分 + 物理推理**         | FlightMD / ardupilot-mcp             | health score 0–100 + 推重比 / 功率裕度，是"给用户看"的抓手           |

其余可选：MAGFit 罗盘拟合、FilterTool Bode 图、3D 轨迹按风速/HDOP 着色、KML/GPX 导出、报告 PDF。

---

## 11. 已核实的事实（备查）

- 上游 robotto `diagnose_flight` 8 项逐条对表 → `../knowledge/upstream-gap.md` §2
- 45 张图逐张清单与缺口 → `../knowledge/upstream-gap.md` §1
- 14 个零覆盖 topic 的字段与优先级 → `../knowledge/coverage-plan.md` §2
- APM 接线现状与缺口 → `knowledge/ardupilot/PENDING.md`（第六节"其它待定"）
- 取数路径：`cdn.jsdelivr.net/gh/<repo>@<branch>/<path>`（沙箱直连 GitHub 被拦）
- 上游关键文件：`configured_plots.py`(62KB)、`pid_analysis.py`(20KB)、
  `robotto_drone_core/ulog_tools.py`(27KB)、`Auterion/ecl_ekf_analysis`
- 引擎现状：`operators.py` 实测 **91** 个算子（`README.md` 写 92，待校准）；
  `np_series(request_json, max_points=3000)` 已支持 `compute` + 实例 + 换算 + LTTB；
  `../architecture/plot-schema.md` 已把 `spectrogram` 列为 `container` 预留扩展点
