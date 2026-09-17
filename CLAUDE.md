# NextPilot Skill MCP —— 飞控 AI Skill / MCP 平台

## 1. 项目定位

建设一个飞控方向的 AI 技术网站，用于飞控周边的 AI 技术交流与分享，核心主题是"让无人机 / 飞行器更智能"。

平台由两部分组成：

1. **Skill / MCP 社区（Skill Hub）**：飞控 AI Skill 与 MCP 服务的提交、浏览、语义搜索、在线试用与评分分享，免费开放引流。
2. **飞控日志分析服务（内置核心服务）**：平台自营的确定性日志诊断服务，**首发支持 PX4 `.ulg`（已上线，32 条检查经验 + 74 个算子），ArduPilot `.bin` 待排期**，输出结构化检查结果与 LLM 中文报告，是主要收费锚点。

内容与能力按 **感知 → 决策 → 控制 → 工具链** 四个维度组织。

### 核心设计原则

- **确定性引擎是唯一真相来源，LLM 只负责解释和引用，从不做数值判断或决策。**
- 日志分析是平台**内置系统**，不是可下载的 Skill；壁垒在于检查规则、阈值逻辑和故障模式知识，而不是 prompt。
- 社区内容（Skill）免费引流，确定性高价值服务（日志分析、规则库、API）收费。

---

## 2. 产品架构总览

```text
┌──────────────────────────────────────────────────────────┐
│         │                  NextPilot Skill 平台          │
├───────────────┬──────────────────────┬───────────────────┤
│  Skill Hub    │  日志分析服务（内置）│  平台 MCP 服务    │
│  社区 / 免费  │  确定性引擎 + LLM 解 │  对外能力分发     │
├───────────────┴──────────────────────┴───────────────────┤
│ 当前：EdgeOne Pages + KV + Blob；端侧 Pyodide 解析        │
│ 后续：轻量云服务器（FastAPI + SQLite + MCP 长连接）        │
└──────────────────────────────────────────────────────────┘
```

**当前已上线：**

- Next.js 全栈站点（EdgeOne Pages）：Skill Hub + GitHub/邮箱登录 + EdgeOne KV
- `.ulg` 日志端侧解析 → 结构化报告 → LLM 中文解释闭环（32 条检查经验覆盖 16 个维度）
- Skill 列表 / 详情 + 关键词搜索（客户端 Fuse.js）

在线试用、评分评论、`.bin`（ArduPilot）支持等均放在上线后迭代，详见第 8 节路线图。

---

## 3. Skill Hub

### 3.1 Skill 卡片规范

每个 Skill 卡片必须包含以下字段，宁缺毋滥：

| 字段 | 说明 / 示例 |
| --- | --- |
| 名称 | 如"航拍目标检测" |
| 一句话描述 | 解决什么飞控场景的问题 |
| System Prompt / 核心逻辑 | 可复制的 prompt 或算法描述 |
| 输入示例 | 如"一张航拍图" |
| 输出示例 | 如"检测到 3 人、2 车" |
| 适用平台 | PX4 / ArduPilot / Betaflight / 仿真 |
| 依赖模型 | GPT-4o / LLaVA / YOLO / Whisper 等 |
| 实测效果 / 评分 | 跑过的案例和结果 |

### 3.2 核心功能

- **Skill 卡片**：名称、描述、prompt、示例输入输出、评分（字段见 3.1）。
- **在线试用**：不跳转就能跑，是留存关键。
- **语义搜索**：冲刺 3 实现（EdgeOne KV 无向量检索，Skill 规模小，采用 embedding 内存暴力匹配：Skill 向量由 BGE 小模型构建时离线生成、打包静态文件走 Blob/CDN，用户查询向量由同一 BGE 模型在浏览器端经 transformers.js 生成，再算余弦相似度）；远期迁 SQLite sqlite-vec / Postgres pgvector。支持"我想做 X"式的自然语言检索（向量为 description 与示例输入输出的联合 embedding）。
- **一键复制 / 导入**：支持导出到 Coze、GPTs、Claude Projects。
- **实测评分**：用 LLM 自动跑测试用例，给出客观评分。
- **组合编排**：多个 Skill 串成工作流（上线后迭代）。
- **Skill 编写技巧**专栏内容。

### 3.3 内容分类框架

#### 一、感知类 Skill（让飞控"看得懂"）

| Skill 示例 | 说明 |
| --- | --- |
| 航拍图像目标检测 | 识别人员、车辆、塔架等，用于搜救和巡检 |
| 语义分割 | 区分作物与杂草、屋顶与天窗，用于精准农业 |
| 视觉语言理解（VLM） | 让无人机"看懂"场景并用语言描述，如 LLaVA、Qwen-VL |
| 深度估计 | 立体 / 单目深度估计，用于避障和安全着陆 |

#### 二、决策与规划类 Skill（让飞控"想得清"）

| Skill 示例 | 说明 |
| --- | --- |
| 自然语言任务规划 | 说"去东边那块田看看"，LLM 自动分解为飞行计划 |
| LLM 自主导航决策 | LLM 作为 drone operator，结合视觉输入推理出行动指令，下发给 PX4 |
| 路径规划算法 | Ego-Planner、Fast-Planner、RRT* 等，多旋翼 / 固定翼通用 |
| 避障策略生成 | 学习辅助导航，加速局部避障决策 |

#### 三、控制类 Skill（让飞控"飞得稳"）

| Skill 示例 | 说明 |
| --- | --- |
| 语言引导精细飞行 | 北航 Flow 范式：说"环绕我飞"，无人机直接执行原子动作 |
| 视觉伺服控制 | 基于图像的视觉伺服（IBVS），无需 GPS 即可室内飞行 |
| 神经-解析控制 | 知识蒸馏，学生模型推理速度比传统 IBVS 快 11 倍 |
| 自适应 / 鲁棒控制 | 神经网络 + 机器学习用于固定翼 / 旋翼的制导与控制 |
| PID 控制器调参 | 针对不同机型的控制参数自动调优 |

#### 四、系统与工具链 Skill（让飞控"用得上"）

| Skill 示例 | 说明 |
| --- | --- |
| PX4 / ArduPilot 集成 | 将 LLM 决策输出对接真实飞控栈 |
| MAVLink 协议交互 | 飞控通信协议解析与指令封装 |
| MBSE 智能建模 | 用 AI 大模型 + 知识图谱做飞控系统建模 |
| MSFS 模拟飞行控制 | MCP 服务让 LLM 直接读仪表、控舵面、执行起降 |
| 机载部署优化 | 量化、剪枝、NPU 加速，把模型塞进 1.7M 参数以内 |

### 3.4 冷启动种子内容

冷启动阶段手工整理 **8-10 个高质量 Skill 首发**（上线后每周新增 2-3 个，逐步补到 15-20 个），覆盖"感知 - 决策 - 控制 - 工具链"最小闭环；优先收录有论文或开源代码背书的项目：

- 北航 Flow 语言控制范式（控制类）
- LLM + PX4 自主导航框架（决策类）
- IBVS 视觉伺服、神经-解析控制蒸馏（控制类）
- MSFS MCP 模拟飞行工具（工具链 / 仿真类）
- PX4 ULog Analyzer、ardupilot-mcp 作为**工具链入口**收录；日志分析服务本体保持平台内置，不作为 Skill 分发。其中 **PX4 ULog Analyzer 是首发 fork 底座**

---

## 4. 日志分析服务（平台内置核心服务）

### 4.1 定位

飞控日志分析是平台内置的**确定性分析服务**，不是一个可下载的 Skill。

- 不做"一个 skill 分析日志"，要做"一个系统承载分析能力"。
- 作者贡献的是检查规则、阈值判断逻辑、故障模式知识——这才是有壁垒、可积累、用户愿意付费的东西。
- 每条 finding 必须可溯源到具体字段、阈值和官方文档链接；LLM 不得输出无出处的数值结论。

**LLM 的角色是"翻译"而非"分析"**：首发 PX4 `.ulg` 场景下，比如把 `vehicle_imu_status` 中的加速度计削波 / 振动指标越限翻译成"飞控检测到异常振动，可能由电机轴承磨损或桨叶不平衡引起，建议检查电机 2 和 3"；或把 `estimator_status.innovation_check_flags` 置位翻译成"EKF 创新检验失败，某项传感器数据与估计值持续偏离，建议检查 GPS / 磁罗盘 / 气压计健康度"。

### 4.2 三层架构

```text
用户选择 .ulg（首发）/ .bin（后续）文件（全程留在浏览器，不上传原始文件）
        ↓
┌─────────────────────────────────────┐
│ 第一层：确定性解析引擎（浏览器端）    │
│ Pyodide (WASM Python) 跑在 Web      │
│ Worker 中：首发 pyulog；第3-4周加    │
│ pymavlink（blackbox_decode 推后）   │
│ 输出：结构化 JSON（时间序列 + 统计）  │
└─────────────────────────────────────┘
        ↓
┌─────────────────────────────────────┐
│ 第二层：规则检查库（插件化，端侧执行）│
│ 振动阈值 / EKF 创新检验 / 电源电压 /  │
│ GPS 健康度 / 电机平衡 / 参数审计      │
│ 输出：严重度排序的 findings[]        │
└─────────────────────────────────────┘
        ↓ 仅上传结构化 findings（不含完整原始日志）
┌─────────────────────────────────────┐
│ 第三层：LLM 解释层（服务端）          │
│ DeepSeek 翻译成自然语言 + 文档链接   │
│ 不参与任何数值判断                    │
└─────────────────────────────────────┘
```

端侧架构的额外收益：原始日志（含 GPS 轨迹）永不离开用户设备，隐私合规压力最小；服务端无解析算力成本。大文件（如 50MB 以上）性能不足或需要批量 API 时，再把同一套引擎下沉为 FastAPI 服务（见 6.1）。

### 4.3 实施步骤（首发 PX4 `.ulg`，浏览器端解析）

1. PX4 `.ulg` 解析：用 **Pyodide 在 Web Worker 中运行 pyulog**，集成 **32 条自包含检查经验**（见 `knowledge/px4/rules/*.yaml`），覆盖振动/IMU 削波、EKF 创新检验、电源、GPS、姿态跟踪、电机平衡、失效保护、模式切换、固件消息等 16 个维度。
2. 解析与规则检查全部在浏览器本地完成，仅将结构化 findings POST 到服务端。
3. LLM 解释层在服务端调用 DeepSeek（国内直连、中文报告质量好、成本低），prompt 层保持模型无关，必要时可切换 GLM / Qwen，把 findings 翻译成中文报告（GJB-841 格式）。
4. 前端：选择文件 + 本地解析进度 + 完整报告展示（含图表、飞行轨迹、事件消息、参数审计、AI 解读）。
5. 6 条真实日志冻结基线回归，逐字段比对通过；构建期校验（字段名/算子名/表达式）保证错误不进浏览器。
6. ArduPilot `.bin` 支持（pymavlink，复用 ardupilot-mcp 的检查套件，同样打包进 Pyodide）待排期。

### 4.4 参考实现与研究项目

| 项目 | 作者 / 来源 | 借鉴点 |
| --- | --- | --- |
| **PX4 ULog Analyzer** ⭐首发底座 | robotto-xyz | PX4 `.ulg` 日志分析，"确定性工具解析 + LLM 只做解释"架构（pyulog 解析 + 检查器骨架） |
| **ardupilot-mcp** | furkanisikay，MIT | ArduPilot `.bin` 诊断 MCP 服务，16 项检查（振动、EKF、电源、GPS、电机平衡、参数审计等），每条发现附带阈值来源（docs/SOURCES.md）与官方文档链接；40 个真实炸机日志验证；贡献指南开放。检查套件设计（analyze_log 返回严重度排序的 findings）是规则层的直接模板，接入 `.bin` 时复用 |
| **ArduPilot 实时连接 MCP** | rmeadomavic，MIT | 通过 MAVLink 实时读状态、改参数、切模式、诊断无法解锁原因；**默认只读**，致动功能需显式传参启用，对真实载具有额外安全门禁——平台安全设计的参照 |
| **PX4 SITL MCP** | — | 仅仿真环境，向 PX4 SITL 发送指令并带安全门禁 |
| **UAV-Insight-Toolkit** | — | Streamlit + pymavlink + GLM-4.5 已跑通同类流程，可作为工程参考 |
| **UFA 框架（学术）** | — | 直接处理 DAT / TXT / ULOG 等多种原始日志并统一转 JSON，结合 RAG 法规知识库，LoRA 微调 7 个主流模型（Qwen、Llama、Gemma 等），准确率 99.2%，单案取证从 945 秒压缩到 42.5 秒 |
| **UAV Log Viewer（学术）** | — | 多智能体架构：Schema Agent 理解字段含义，Planner Agent 拆解问题，Executor Agent 调度 Data Agent 在沙箱中跑 Python / SQL 查询。未来自然语言查日志的演进方向 |

两套引擎共同的设计哲学：`.ulg` / `.bin` → pyulog / pymavlink 解析 → 纯领域模型 FlightLog → 插件化检查器 → 每个发现附带官方文档链接，LLM 只把结构化结果翻译成自然语言，不直接"理解"原始日志。解析与规则代码在浏览器（Pyodide）与未来服务端引擎之间保持同一份 Python 源码、两种运行方式。

### 4.5 报告页结构（前端）

**一个 tab 一个组件**（`web/components/Log*Msg.tsx`），顺序如下（打开默认停在「基本情况」）：

| tab | 组件 | 内容 |
| --- | --- | --- |
| 基本情况 | `AnalyzeReport.tsx` 内 · `MetricsTab` | 规则产出的关键数字（metrics，声明在 `facts.yaml`） |
| 系统消息 | `LogSystemMsg.tsx` | 消息记录统计（逐字节数 `MSG_TYPE`）+ Information Message 字典（变量名 / 取值 / 说明） |
| 事件消息 | `LogEventsMsg.tsx` | PX4 事件解码 + 固件文本消息 + 多值信息（'M'），可按级别过滤 |
| 飞控参数 | `LogParamsMsg.tsx` | 参数 / 当前值 / 默认值 / 最小值 / 最大值 / 说明；**当前值 ≠ 默认值则整行标红**；默认按"与默认不同"筛 |
| 数据图表 | `LogCharts.tsx` | 曲线预设（`knowledge/px4/plot/*.yml`），含飞行阶段底色 |
| 检查结论 | `AnalyzeReport.tsx` 内 | findings + 故障知识库命中条目 |
| AI 中文解读 | `AnalyzeReport.tsx` 内 | DeepSeek 报告 |

报告页之外还有两块常驻区域：**飞行阶段条**（`PhaseStrip.tsx`）紧贴 **飞行轨迹地图**（`LogFlightMap.tsx`，高德瓦片：国内可达；轨迹按 WGS-84 → GCJ-02 换算后绘制，换算见 `lib/coord.ts`）。

时间口径全站统一：**开机以来的秒数**，显示成 `hh:MM:ss`（与 Flight Review 一致）。数据层的硬规则与坑（事件解码、多值信息拼接、参数默认值怎么来、派生数据版本）见 **`knowledge/px4/CLAUDE.md` 的「报告页数据层」**——改 `engine/report_data.py` 前必读。

---

## 5. 平台 MCP 服务

网站本身对外暴露一个 MCP 服务，让 Claude / Cursor 等客户端直接调用平台能力，是最自然的分发渠道。**上线时间在阶段二（轻量云服务器）之后**——MCP 为长连接，边缘 Functions 不适合承载。工具定义先行设计：

| Tool | 说明 |
| --- | --- |
| `search_skills(query, platform?, category?)` | 语义检索 Skill，返回卡片摘要 |
| `get_skill(id)` | 返回完整 prompt、输入输出示例、一键导入格式 |
| `analyze_findings(findings)` | 提交端侧解析得到的结构化 findings，返回解释后的报告（鉴权 + 配额）。原始日志直传（`analyze_log(file)`）待远期腾讯云独立解析服务上线后开放 |
| `explain_finding(report_id, finding_id)` | 单条发现的自然语言解释 + 官方文档链接 |
| `submit_skill(...)` | 提交 / 更新 Skill（需作者鉴权） |

**安全红线**：平台永不直接致动真实载具。致动类能力（arm/disarm、模式切换）只以开源 Skill 形式提供，并强制三重门禁：

1. 默认只读；
2. 显式 `--enable-actuation` 参数才启用致动；
3. 仿真环境优先，对真实载具设置额外安全门禁。

（参照 rmeadomavic 的 ArduPilot MCP 与 PX4 SITL MCP 设计。）

---

## 6. 技术栈与部署

### 6.1 技术栈

面向国内用户选型：

- **前端 / 全栈**：Next.js + TypeScript + Tailwind CSS + shadcn/ui，**代码位于 `web/` 子目录**；校验用真实日志放 `tools/calibrate/logs/`（不入库，含 GPS 轨迹），校准脚本与冻结基线在 `tools/calibrate/`
- **登录认证**：Auth.js（NextAuth）。**当前支持 GitHub + 邮箱验证码 / Magic Link（零资质，个人开发者可直接上线）**；**微信扫码、手机号验证码待注册企业主体后再接入**（微信开放平台网站应用需企业资质 + 300 元认证，短信签名 / 模板需企业资质审核）
- **数据存储（EdgeOne 内置两层）**：
  - **EdgeOne KV**：已启用，小尺寸键值、读多写少，存元数据与索引——用户、配额计数、评论、报告元数据。配额计数用唯一键 + 前缀列举避免竞态；注意最终一致，写后不立即回读。
  - **EdgeOne Blob**：大对象与二进制——Pyodide 运行时 / 自定义 wheel、语义向量静态文件、报告分享页（HTML / PDF）、KV 定期导出的 JSON 备份，均通过 CDN 分发。原始日志默认仍不上传；未来云端留存 / MCP 文件直传时再放 Blob（需签名 URL 支持，以官方能力为准）。
  - 语义搜索（待实现）：Skill 数量小，embedding 文件放 Blob，浏览器 / Function 内暴力匹配，无需专用向量库。**向量来源：同一个 BGE 小模型（如 bge-small-zh）两端使用**——Skill 侧在构建时本机离线生成，随版本静态发布（DeepSeek 仅提供对话模型、无 embedding 接口）；用户查询侧在浏览器用 transformers.js / onnxruntime-web 实时生成。运行时零成本、零外部依赖；以后 Skill 频繁更新或需检索日志报告时，再改用云端 embedding API（阿里 text-embedding-v3 / 混元 embedding）。
  - 不追求 SQL 能力。**存储演进顺序（写死，不提前采购）**：
    1. **阶段一（当前）**：EdgeOne KV + Blob，零服务器、零外部存储费用，Blob 是唯一对象存储；
    2. **阶段二（触发条件出现时）**：腾讯云轻量服务器，承载 SQLite + sqlite-vec / PostgreSQL 与 FastAPI + Redis 解析服务；备份仍继续写 Blob。
    从第一天起封装薄存储接口，实体字段对齐远期关系型表结构，控制阶段间迁移成本。
- **日志解析（端侧优先）**：**Pyodide（WASM Python）运行在 Web Worker 中**，首发加载 pyulog（PX4 `.ulg`），ArduPilot `.bin`（pymavlink）待排期；规则检查器与解析器为同一份纯 Python 包，浏览器与服务端共用。**blackbox_decode（Betaflight）推后**：它是 C 编译二进制、无法直接进 Pyodide，需 WASM 重写或等阶段二服务端引擎支持
- **任务形态**：解析在端侧异步进行，无需服务端队列；当前不部署独立 Python 服务。大文件（约 50MB 以上）或批量分析 API 阶段，再把同一套引擎下沉为 FastAPI + Redis（ARQ / BullMQ）常驻容器服务
- **LLM**：服务端调用 **DeepSeek** 首选，prompt 保持模型无关，GLM-4.5-flash / qwen-turbo 作为备选；仅接收结构化 findings，不接触原始日志；配合 prompt 缓存与报告缓存，单份报告成本控制在 ¥0.1 以内
- **MCP 服务**：TypeScript MCP SDK，独立小服务；**上线时间后移到阶段二**（购买轻量云服务器后）——MCP 为 SSE / 长连接，无状态、有超时的边缘 Functions 不适合承载

### 6.2 部署与第三方服务

- 前端 / 边缘：腾讯 EdgeOne Pages，**使用境外节点、无需 ICP 备案即可绑定自定义域名**（代价：大陆用户访问延迟略高于国内备案节点；产品成熟、主体齐备后再备案切国内节点）；**持久化与大对象全部使用 EdgeOne 内置的 KV 与 Blob，不另购对象存储**
- 对象存储：**EdgeOne Blob 为唯一对象存储**（Pyodide 资源、向量文件、分享报告、各阶段备份），全周期不引入外部对象存储服务
- 计算 / 服务器：**当前不买服务器**——站点与 Pages Functions 部署在 EdgeOne。**阶段二采购腾讯云轻量服务器的触发条件**：出现复杂多表统计 / 后台需求、团队空间、需要关系型数据库（SQLite + sqlite-vec / PostgreSQL），或大文件 / 批量 API 需要 FastAPI + Redis 日志解析服务
- 收款：**微信支付 + 支付宝**（订阅制；个人开发阶段可先用虎皮椒 / Payjs 等聚合支付过渡）

> 实施前需以 EdgeOne 官方文档核实：KV / Blob 的免费额度与上限（读写次数、单对象大小、总存储）、Functions 是否可直接写 Blob、CDN 流出流量计费口径、Blob 是否支持签名 / 私有 URL 与对象列举。

### 6.3 数据模型（EdgeOne KV + Blob）

当前按"KV 存元数据、Blob 存大对象"分工，实体字段保持与远期关系型表结构一致，便于迁移：

**KV 键设计：**

| KV 键模式 | 内容 |
| --- | --- |
| `user:{id}` / `user:wx:{openid}` 等索引键 | 用户资料、贡献者等级（对应远期 `profiles`） |
| `skill:{slug}` | Skill 元数据：name / description / prompt / examples / platform_tags / model_tags / category / status / downloads_count / rating；当前仍以 MDX 为唯一数据源，KV 仅在支持在线提交后启用（对应远期 `skills`） |
| `review:{skillSlug}:{userId}` | 评分 + 评论 + 实测用例结果，按前缀列举（对应远期 `reviews`） |
| `report:{id}` | 报告元数据与结构化结果摘要（findings JSON + LLM 解释，控制单值大小）；完整 HTML / PDF 放 Blob；**原始日志不入库、不上传，仅存在于用户浏览器**（对应远期 `analysis_reports`） |
| `share:{id}` | 报告分享索引：→ Blob 公开 URL、所属用户、时间、严重度统计 |
| `usage:{userId}:{月份}:{reportId}` | 配额计数：每次分析写唯一键，按前缀列举计数，避免读-改-写竞态（对应远期 `usage_counters`） |
| `purchase:{userId}:{packId}` | 规则包购买与分成计费（对应远期 `rule_pack_purchases`） |

**Blob 对象设计：**

| Blob 路径模式 | 内容 |
| --- | --- |
| `runtime/pyodide/`、`wheels/*.whl` | Pyodide 运行时与自定义 pyulog 检查器 wheel，长缓存（已启用） |
| `embeddings/skills-{version}.json` | Skill 联合 embedding 静态文件，供语义搜索内存匹配（待实现） |
| `reports/{id}.html` / `.pdf` | 可分享的完整报告，公开 / 签名 URL 访问（已启用） |
| `backups/kv-{日期}.json` | KV 定期导出备份 |
| `logs/{userId}/{reportId}.ulg`（远期） | 用户主动要求云端留存、或 MCP 文件直传时的原始日志；默认功能不启用，需签名 URL 与隐私提示 |

不进 KV / Blob 的数据：

- `check_rules`：检查规则随端侧引擎打包发布（版本化），不存云端。
- 向量检索：冲刺 3 用 Blob 静态文件 + Function 内存计算，不建向量表；迁数据库后用 sqlite-vec / pgvector。

**浏览器本机持久化（IndexedDB，仅本机、从不上传）：**

| 本机存储 | 内容 | 用途 |
| --- | --- | --- |
| `nextpilot-cache` / `logs` | 原始 `.ulg` 字节（key = 日志 SHA-256 指纹） | 历史回看一键"恢复完整数据"：报告存档只有结论与 AI 文本，图表/事件/参数需重新解析原始日志。上限 10 份 / 300MB，超出按 LRU 淘汰 |
| `nextpilot` / `pending` | 首页上传卡暂存的待分析文件 | 首页选文件 → 跳分析页自动解析，读完即删 |
| `localStorage: nextpilot:reports` | 报告存档（findings + AI 报告 + 日志指纹） | 匿名用户的历史记录（跨设备靠登录后的 KV 存档） |

重新解析必须沿用已有的 AI 报告（`pendingAiRef`），否则会把花过额度生成的解读覆盖成空。

---

### 6.4 文件命名规范

统一约定（新建文件务必遵循，命名不清时先查本节）：

| 类型 | 规则 | 示例 |
| --- | --- | --- |
| React 组件 | PascalCase + `.tsx` | `LogAnalyzer.tsx`、`SkillCard.tsx` |
| 分析页 tab 组件 | 一个 tab 一个文件：`Log<用途>Msg.tsx` | `LogEventsMsg.tsx`、`LogParamsMsg.tsx`、`LogSystemMsg.tsx`、`LogFlightMap.tsx` |
| 库 / 类型 / 常量 | kebab-case + `.ts` | `chart-presets.ts`、`types.ts`、`constants.ts` |
| Web Worker 入口 | kebab-case + `-worker.ts` | `ulog-worker.ts` |
| Worker 内嵌脚本 / helper | kebab-case + `-script.ts` | 现由 `build-knowledge.mjs` **生成**，不手改 |
| Next.js 路由 | `page.tsx` / `route.ts` / `layout.tsx`（目录即路由） | `app/analyze/page.tsx`、`app/api/explain/route.ts` |
| Python 模块 | snake_case + `.py` | `engine/rule_engine.py`、`engine/operators.py`、`engine/report_data.py` |
| 知识 / 经验文件 | 见 `knowledge/README.md`；规则 `rules/*.yaml`、故障库 `px4-fault-kb.yaml` | `rules/vibration.yaml`、`px4-fault-kb.yaml` |
| 文档 | kebab-case + `.md` | `llm/gjb841-system-prompt.md` |

> 注意：Worker 相关文件统一用连字符（`ulog-worker.ts`），不要用点号（❌ `ulog.worker.ts`）。
>
> **日志分析的人工经验（阈值 / 故障树 / 检查逻辑 / LLM 范式 / 事实层绑定与码表）单一事实源在仓库根
> `knowledge/px4/`**（= `rules/*.yaml` + `px4-fault-kb.yaml` + `facts.yaml` + `llm/*.md`；
> 引擎机制在 `engine/`，同样不含业务数据），web 与未来 MCP 服务都只消费其派生产物（`web/workers/*`、
> `web/lib/knowledge/*.generated.js`、`content/guide/knowledge-*.md`）。改经验只改
> `knowledge/`，然后 `cd web && pnpm build:kb`（只比对不写入：`cd web && pnpm build:kb --check`）。
>
> 改 `knowledge/px4/` 下的规则、算子或引擎前，先读同目录的 **`knowledge/px4/CLAUDE.md`**：
> 那里记着每条设计决策的动机、与最初设计的落地差异（有意为之，别当 bug 改回去）和已知缺口；
> 它是给 AI 与维护者的上下文，不发布到网站。**报告页数据层**（`engine/report_data.py`）的硬规则
> 也在那一份里（时间基准、事件解码、多值信息拼接、参数默认值怎么来、派生数据版本）。
>
> **Python（`engine/` 与 `tools/`）的风格约定**：格式化的唯一权威是 `ruff format`，配置在仓库根
> `pyproject.toml`（行长 100、双引号），工具版本钉在 `requirements-dev.txt`。改完自查
> `python -m ruff format --check . && python -m ruff check .`。**别跑 `ruff check --fix`、别开编辑器
> 的"保存时自动修复"**：`engine/` 下的文件是拼接片段，那样会误删东西（清单见 `engine/README.md`）。
> 这条约定的由来：在它之前每个编辑器各按自己的默认格式化器改文件，有一轮提交里混进了 500 行纯格式改动。
>
> 派生数据版本（`web/lib/knowledge/derived-version.generated.ts`，构建期算的引擎源文件哈希）：
> 改了 `engine/report_data.py` / `engine/rule_engine.py` / `facts.yaml` / `plot/*.yml`，用户本机存档
> 会在打开时**自动重解析一次**（facts / findings 一并刷新，AI 报告保留），不用挨个提醒重新上传。

---

## 7. 商业模式

**核心原则**：社区内容（Skill）免费引流，确定性高价值服务（日志分析、规则库、API）收费。收费锚点是"确定性结论 + 规则库 + 数据积累"。

支付方式：**微信支付 + 支付宝**（个人开发阶段可先用虎皮椒 / Payjs 等聚合支付过渡，主体注册后切官方商户号）。

| 层级 | 价格 | 内容 |
| --- | --- | --- |
| 免费版 | ¥0 | Skill 浏览 / 语义搜索 / 下载；每月 5 次日志分析（首发仅 PX4 `.ulg`），仅基础三项检查（振动、EKF、电源），报告保留 7 天 |
| Pro 个人版 | ¥39/月 | 无限次分析；16+ 检查规则；PX4 / ArduPilot 双格式；历史报告对比；完整 LLM 中文报告；在线试用额度提升 |
| 团队版 | ¥199/月（5 席） | 团队日志空间、故障知识库沉淀、报告批注协作、私有 Skill |
| 企业版 / 私有部署 | 议价 | 白标、批量分析 API、自定义检查规则、SLA；面向飞控厂商、培训机构、检测机构 |

其他收入来源：

- **规则市场分成**：社区贡献检查规则 / 故障知识包，按调用量 **70/30 分成**。这是"壁垒可积累"的核心机制——作者贡献领域知识，不是 prompt。
- **数据集与行业报告**：脱敏后的飞行故障数据集、年度事故模式报告（面向保险、质检、监管机构）。
- **付费课程 / 专栏**：Skill 编写技巧、PID 调参实战、日志判读案例库，可向 UFA、Flow 等学术项目作者约稿。

---

## 8. 开发路线图（按产品板块切分冲刺）

| 阶段 | 状态 | 目标 |
| --- | --- | --- |
| 冲刺 1：Skill/MCP 社区网站 | ✅ 已上线 | 网站基础框架与内容：预制 Skill（8 个种子）+ MCP 专区 + 使用指南；**登录与账号体系（GitHub + 邮箱验证码，微信/手机号待企业资质）**；EdgeOne KV 持久化；**社区指标：真实下载/获取次数（设备+IP 每日去重的 KV 事件计数）、1-5 星评分、按下载/评分/更新排序、热门排行榜**；关键词搜索（客户端 Fuse.js）。语义搜索（BGE 端侧 embedding）待补。详情页：头部元信息、复制提示词/安装命令、评分与获取入口、版本/许可证/更新时间。 |
| 冲刺 2：日志分析（核心收费锚点） | ✅ 核心已上线（.bin 待排期） | **确定性日志诊断引擎 + 所有用户免费试用**。PX4 `.ulg`：32 条检查经验覆盖 16 个维度，六条真实日志冻结基线回归；四层架构（pyulog 解析 → rule_engine/operators → 规则匹配 → LLM 按 GJB-841 组装输出中文报告）。**ArduPilot `.bin` 待排期**（pymavlink + ardupilot-mcp 检查套件，同样打包进 Pyodide）。多日志趋势对比与误报率精细校准待后续迭代。 |
| 冲刺 3：会员与社区商业化 | ⏳ 待启动 | **会员/付费体系**（免费/Pro/团队，微信支付+支付宝），在线试用（不跳转就能跑）；规则/故障知识包贡献与 **70/30 分成**；Skill 组合编排；LLM 自动实测评分；语义搜索；**微信 / 手机号登录（取得企业资质后）**。 |
| 冲刺 4：轻量服务器 → 平台 MCP 服务 | ⏳ 待启动 | **先解决承载，再对外分发**。见下方分步说明。 |

**冲刺 4 的三步顺序（不可颠倒）：**

1. **采购腾讯云轻量服务器**（前置依赖——MCP 是长连接，边缘 Functions 承载不了）：迁关系型数据库（SQLite + sqlite-vec 或 PostgreSQL，支撑复杂统计 / 团队空间 / 向量检索）、部署独立 FastAPI + Redis 日志解析服务（大文件与批量 API 下沉），并为后续支付 / 订单等有状态服务提供常驻环境。届时把 `engine/*.py` 包成可 `import` 的 `nextpilot_engine`（parsers / models / rules 三层，规则仍从 `knowledge/` 加载，不另存一份），供服务端与 MCP 复用；ArduPilot `.bin` 适配器也加在这一层。
2. **平台 MCP 服务上线**（依赖第 1 步）：对外提供 `search_skills` / `get_skill` / `analyze_findings` / `explain_finding` / `submit_skill`；检索走数据库向量列，解析走已下沉的 FastAPI，鉴权复用 KV/DB 里的用户与配额。
3. **企业侧**：私有部署、脱敏故障数据集对外输出。

> 冲刺边界按"可独立上线的产品板块"划分，取代旧版按周（第 1/2/3-4 周）的切分；各冲刺内部仍可小步发布。

### 冷启动清单（与开发并行）

1. 手工整理 8-10 个高质量种子 Skill（优先 3.4 中有论文 / 开源背书的），填全示例输入输出、适用平台、实测效果；保持每周新增 2-3 个。
2. 收集 10-20 个真实 PX4 `.ulg` 与 ArduPilot `.bin` 日志（公开炸机日志、自飞、社区征集），建规则回归集，校准误报率目标 < 10%。
3. 跑通"选择日志 → 浏览器本地解析 → findings/故障树 → DeepSeek 中文 GJB-841 报告"闭环。
4. 在知乎、PX4 / ArduPilot 中文社区发布真实日志判读实战帖引流。

### 提速取舍（明确不做的事）

- 日志分析在线试用、多日志趋势对比等体验增强需求，在与会员体系同步推进。
- **不租用独立日志服务器**：解析全部放在浏览器（Pyodide + Web Worker），零解析算力成本；等大文件 / 批量 API 需求出现后再下沉。
- **当前零服务器**：持久化用 EdgeOne 内置 KV / Blob，无需 CVM / 数据库实例 / 外部对象存储。KV 最终一致、写后不回读；配额用唯一键 + 前缀计数；定期导出 JSON 备份。
- 解析引擎与规则**复用开源**（PX4 侧：官方 pyulog + 借鉴 PX4 ULog Analyzer 的 `diagnose_flight` 与 Flight Review 阈值/阶段经验；ArduPilot 侧：fork ardupilot-mcp 检查套件），自有精力集中在规则校准、故障知识库、LLM 解释层和前端体验。

---

## 9. 风险与边界

- **安全**：致动类能力永不进托管服务，只做开源 Skill + 强制三重门禁（见第 5 节）。
- **误报责任**：所有报告标注"辅助判读，不替代人工排查"；每条 finding 必须可溯源到具体字段、阈值和官方文档链接，不允许 LLM 输出无出处的数值结论。
- **隐私**：飞行日志含 GPS 轨迹和作业信息；端侧解析架构下**原始日志始终留在用户设备、不上传服务器**，页面需明确告知；上送服务端的仅为结构化 findings，对其中坐标等敏感字段做脱敏；远期服务端解析上线后，再提供坐标模糊化选项并执行原始文件 30 天自动删除。
- **版权**：只收录 MIT / Apache 等宽松许可或已取得授权的项目；prompt 类内容要求贡献者声明原创。
- **成本**：LLM 只在解释层调用，使用 DeepSeek（GLM / Qwen 备选）+ prompt 缓存 + 报告缓存，单份报告成本 ≤ ¥0.1。
