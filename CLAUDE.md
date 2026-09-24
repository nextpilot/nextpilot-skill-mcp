# NextPilot Skill MCP —— 飞控 AI Skill / MCP 平台

## 1. 项目定位

建设一个飞控方向的 AI 技术网站，用于飞控周边的 AI 技术交流与分享，核心主题是 "让无人机 / 飞行器更智能"。

平台由两部分组成：

1. **Skill / MCP 社区（Skill Hub）**：飞控 AI Skill 与 MCP 服务的提交、浏览、语义搜索、在线试用与评分分享，免费开放引流。

2. **飞控日志分析服务（内置核心服务）**：平台自营的确定性日志诊断服务，**首发支持 PX4&#x20;**`.ulg`**（已上线，32 条检查经验 + 74 个算子），ArduPilot&#x20;**`.bin`**&#x20;待排期**，输出结构化检查结果与 LLM 中文报告，是主要收费锚点。

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

- Next.js 全栈站点（EdgeOne Pages）：Skill Hub + GitHub / 邮箱登录 + EdgeOne KV

- `.ulg` 日志端侧解析 → 结构化报告 → LLM 中文解释闭环（32 条检查经验覆盖 16 个维度）

- Skill 列表 / 详情 + 关键词搜索（客户端 Fuse.js）

在线试用、评分评论、`.bin`（ArduPilot）支持等均放在上线后迭代，详见第 8 节路线图。

---

## 3. Skill Hub

### 3.1 Skill 卡片规范

> **内容的存放形态**
>
> ：每个 Skill 是
>
> `knowledge/skills/<slug>/`
>
> 下的一个目录，
> `SKILL.md`
>
> （给 AI，按 Agent Skills 规范）/
>
> `README.md`
>
> （给人）/
>
> `CHANGELOG.md`
>
> （版本历史唯一真源）。
> 字段约束、为什么这么放、校验怎么跑，见
>
> `knowledge/README.md`
>
> **&#x20;的「skills/ 一个 Skill 一个目录」**
>
> ，
> 不在本节重复（本节只说卡片上要有哪几类信息）。
> 三份文件都能在仓库里直接改、提 PR：详情页每个内容 Tab 右上角就是
>
> **那一份文件**
>
> 的编辑入口。

**MCP 条目是另一回事，别照抄上面这套。** 它也拆成了 `knowledge/mcp/<slug>/`，但规范文件是

`server.json`（MCP Registry）而不是 `SKILL.md`——`name` 是反向 DNS（`io.github.<owner>/<repo>`），

与 Skill 的 kebab 命名**互斥**，所以两个目录各有各的守卫（`check-skill-spec.mjs` /

`check-mcp-spec.mjs`），合并必然有一边不合规。见 `knowledge/README.md` 的「mcp/ 一个 MCP 服务一个目录」。

每个 Skill 卡片必须包含以下字段，宁缺毋滥：

| 字段                     | 说明 / 示例                         |
| ------------------------ | ----------------------------------- |
| 名称                     | 如 "航拍目标检测"                   |
| 一句话描述               | 解决什么飞控场景的问题              |
| System Prompt / 核心逻辑 | 可复制的 prompt 或算法描述          |
| 输入示例                 | 如 "一张航拍图"                     |
| 输出示例                 | 如 "检测到 3 人、2 车"              |
| 适用平台                 | PX4 / ArduPilot / Betaflight / 仿真 |
| 依赖模型                 | GPT-4o / LLaVA / YOLO / Whisper 等  |
| 实测效果 / 评分          | 跑过的案例和结果                    |

### 3.2 核心功能

- **Skill 卡片**：名称、描述、prompt、示例输入输出、评分（字段见 3.1）。

- **在线试用**：不跳转就能跑，是留存关键。

- **语义搜索**：冲刺 3 实现（EdgeOne KV 无向量检索，Skill 规模小，采用 embedding 内存暴力匹配：Skill 向量由 BGE 小模型构建时离线生成、打包静态文件走 Blob/CDN，用户查询向量由同一 BGE 模型在浏览器端经 transformers.js 生成，再算余弦相似度）；远期迁 SQLite sqlite-vec / Postgres pgvector。支持 "我想做 X" 式的自然语言检索（向量为 description 与示例输入输出的联合 embedding）。

- **一键复制 / 导入**：支持导出到 Coze、GPTs、Claude Projects。

- **实测评分**：用 LLM 自动跑测试用例，给出客观评分。

- **组合编排**：多个 Skill 串成工作流（上线后迭代）。

- **Skill 编写技巧**专栏内容。

### 3.3 内容分类框架

#### 一、感知类 Skill（让飞控 "看得懂"）

| Skill 示例          | 说明                                                |
| ------------------- | --------------------------------------------------- |
| 航拍图像目标检测    | 识别人员、车辆、塔架等，用于搜救和巡检              |
| 语义分割            | 区分作物与杂草、屋顶与天窗，用于精准农业            |
| 视觉语言理解（VLM） | 让无人机 "看懂" 场景并用语言描述，如 LLaVA、Qwen-VL |
| 深度估计            | 立体 / 单目深度估计，用于避障和安全着陆             |

#### 二、决策与规划类 Skill（让飞控 "想得清"）

| Skill 示例       | 说明                                                            |
| ---------------- | --------------------------------------------------------------- |
| 自然语言任务规划 | 说 "去东边那块田看看"，LLM 自动分解为飞行计划                   |
| LLM 自主导航决策 | LLM 作为 drone operator，结合视觉输入推理出行动指令，下发给 PX4 |
| 路径规划算法     | Ego-Planner、Fast-Planner、RRT\* 等，多旋翼 / 固定翼通用        |
| 避障策略生成     | 学习辅助导航，加速局部避障决策                                  |

#### 三、控制类 Skill（让飞控 "飞得稳"）

| Skill 示例        | 说明                                                  |
| ----------------- | ----------------------------------------------------- |
| 语言引导精细飞行  | 北航 Flow 范式：说 "环绕我飞"，无人机直接执行原子动作 |
| 视觉伺服控制      | 基于图像的视觉伺服（IBVS），无需 GPS 即可室内飞行     |
| 神经 - 解析控制   | 知识蒸馏，学生模型推理速度比传统 IBVS 快 11 倍        |
| 自适应 / 鲁棒控制 | 神经网络 + 机器学习用于固定翼 / 旋翼的制导与控制      |
| PID 控制器调参    | 针对不同机型的控制参数自动调优                        |

#### 四、系统与工具链 Skill（让飞控 "用得上"）

| Skill 示例           | 说明                                           |
| -------------------- | ---------------------------------------------- |
| PX4 / ArduPilot 集成 | 将 LLM 决策输出对接真实飞控栈                  |
| MAVLink 协议交互     | 飞控通信协议解析与指令封装                     |
| MBSE 智能建模        | 用 AI 大模型 + 知识图谱做飞控系统建模          |
| MSFS 模拟飞行控制    | MCP 服务让 LLM 直接读仪表、控舵面、执行起降    |
| 机载部署优化         | 量化、剪枝、NPU 加速，把模型塞进 1.7M 参数以内 |

### 3.4 冷启动种子内容

冷启动阶段手工整理 **8-10 个高质量 Skill 首发**（上线后每周新增 2-3 个，逐步补到 15-20 个），覆盖 "感知 - 决策 - 控制 - 工具链" 最小闭环；优先收录有论文或开源代码背书的项目：

- 北航 Flow 语言控制范式（控制类）

- LLM + PX4 自主导航框架（决策类）

- IBVS 视觉伺服、神经 - 解析控制蒸馏（控制类）

- MSFS MCP 模拟飞行工具（工具链 / 仿真类）

- PX4 ULog Analyzer、ardupilot-mcp 作为**工具链入口**收录；日志分析服务本体保持平台内置，不作为 Skill 分发。其中 **PX4 ULog Analyzer 是首发 fork 底座**

---

## 4. 日志分析服务（平台内置核心服务）

### 4.1 定位

飞控日志分析是平台内置的**确定性分析服务**，不是一个可下载的 Skill。

- 不做 "一个 skill 分析日志"，要做 "一个系统承载分析能力"。

- 作者贡献的是检查规则、阈值判断逻辑、故障模式知识 —— 这才是有壁垒、可积累、用户愿意付费的东西。

- 每条 finding 必须可溯源到具体字段、阈值和官方文档链接；LLM 不得输出无出处的数值结论。

**LLM 的角色是 "翻译" 而非 "分析"**：首发 PX4 `.ulg` 场景下，比如把 `vehicle_imu_status` 中的加速度计削波 / 振动指标越限翻译成 "飞控检测到异常振动，可能由电机轴承磨损或桨叶不平衡引起，建议检查电机 2 和 3"；或把 `estimator_status.innovation_check_flags` 置位翻译成 "EKF 创新检验失败，某项传感器数据与估计值持续偏离，建议检查 GPS / 磁罗盘 / 气压计健康度"。

### 4.2 三层架构

```text
用户选择 .ulg（首发）/ .bin（后续）文件（全程留在浏览器，不上传原始文件）

&#x20;       ↓

┌─────────────────────────────────────┐

│ 第一层：确定性解析引擎（浏览器端）    │

│ Pyodide (WASM Python) 跑在 Web      │

│ Worker 中：首发 pyulog；第3-4周加    │

│ pymavlink（blackbox\_decode 推后）   │

│ 输出：结构化 JSON（时间序列 + 统计）  │

└─────────────────────────────────────┘

&#x20;       ↓

┌─────────────────────────────────────┐

│ 第二层：规则检查库（插件化，端侧执行）│

│ 振动阈值 / EKF 创新检验 / 电源电压 /  │

│ GPS 健康度 / 电机平衡 / 参数审计      │

│ 输出：严重度排序的 findings\[]        │

└─────────────────────────────────────┘

&#x20;       ↓ 仅上传结构化 findings（不含完整原始日志）

┌─────────────────────────────────────┐

│ 第三层：LLM 解释层（服务端）          │

│ DeepSeek 翻译成自然语言 + 文档链接   │

│ 不参与任何数值判断                    │

└─────────────────────────────────────┘
```

端侧架构的额外收益：原始日志（含 GPS 轨迹）永不离开用户设备，隐私合规压力最小；服务端无解析算力成本。大文件（如 50MB 以上）性能不足或需要批量 API 时，再把同一套引擎下沉为 FastAPI 服务（见 6.1）。

### 4.3 实施步骤（首发 PX4 `.ulg`，浏览器端解析）

1. PX4 `.ulg` 解析：用 **Pyodide 在 Web Worker 中运行 pyulog**，集成 **32 条自包含检查经验**（见 `knowledge/px4/rules/*.yaml`），覆盖振动 / IMU 削波、EKF 创新检验、电源、GPS、姿态跟踪、电机平衡、失效保护、模式切换、固件消息等 16 个维度。

2. 解析与规则检查全部在浏览器本地完成，仅将结构化 findings POST 到服务端。

3. LLM 解释层在服务端调用 DeepSeek（国内直连、中文报告质量好、成本低），prompt 层保持模型无关，必要时可切换 GLM / Qwen，把 findings 翻译成中文报告（GJB-841 格式）。

4. 前端：选择文件 + 本地解析进度 + 完整报告展示（含图表、飞行轨迹、事件消息、参数审计、AI 解读）。

5. 6 条真实日志冻结基线回归，逐字段比对通过；构建期校验（字段名 / 算子名 / 表达式）保证错误不进浏览器。

6. ArduPilot `.bin` 支持：**已落地**，`engine/providers/ardupilot.py` 是本项目唯一认识 ArduPilot 的地方（按 `providers/api.py` 契约自注册，引擎一行未改）。解析是**自研**的（只依赖 `struct` + `numpy`，不引 pymavlink —— `.bin` 开头自带 FMT 声明，按表通解即可；pymavlink 带整套 mavlink 协议表，进 Pyodide 代价大而这里用不上）。ardupilot-mcp 那 16 项检查套件仍待排期。

### 4.4 参考实现与研究项目

| 项目                             | 作者 / 来源       | 借鉴点                                                                                                                                                                                                                                                                            |
| -------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PX4 ULog Analyzer** ⭐首发底座 | robotto-xyz       | PX4 `.ulg` 日志分析，"确定性工具解析 + LLM 只做解释" 架构（pyulog 解析 + 检查器骨架）                                                                                                                                                                                             |
| **ardupilot-mcp**                | furkanisikay，MIT | ArduPilot `.bin` 诊断 MCP 服务，16 项检查（振动、EKF、电源、GPS、电机平衡、参数审计等），每条发现附带阈值来源（docs/SOURCES.md）与官方文档链接；40 个真实炸机日志验证；贡献指南开放。检查套件设计（analyze\_log 返回严重度排序的 findings）是规则层的直接模板，接入 `.bin` 时复用 |
| **ArduPilot 实时连接 MCP**       | rmeadomavic，MIT  | 通过 MAVLink 实时读状态、改参数、切模式、诊断无法解锁原因；**默认只读**，致动功能需显式传参启用，对真实载具有额外安全门禁 —— 平台安全设计的参照                                                                                                                                   |
| **PX4 SITL MCP**                 | —                 | 仅仿真环境，向 PX4 SITL 发送指令并带安全门禁                                                                                                                                                                                                                                      |
| **UAV-Insight-Toolkit**          | —                 | Streamlit + pymavlink + GLM-4.5 已跑通同类流程，可作为工程参考                                                                                                                                                                                                                    |
| **UFA 框架（学术）**             | —                 | 直接处理 DAT / TXT / ULOG 等多种原始日志并统一转 JSON，结合 RAG 法规知识库，LoRA 微调 7 个主流模型（Qwen、Llama、Gemma 等），准确率 99.2%，单案取证从 945 秒压缩到 42.5 秒                                                                                                        |
| **UAV Log Viewer（学术）**       | —                 | 多智能体架构：Schema Agent 理解字段含义，Planner Agent 拆解问题，Executor Agent 调度 Data Agent 在沙箱中跑 Python / SQL 查询。未来自然语言查日志的演进方向                                                                                                                        |

两套引擎共同的设计哲学：`.ulg` / `.bin` → pyulog /pymavlink 解析 → 纯领域模型 FlightLog → 插件化检查器 → 每个发现附带官方文档链接，LLM 只把结构化结果翻译成自然语言，不直接 "理解" 原始日志。解析与规则代码在浏览器（Pyodide）与未来服务端引擎之间保持同一份 Python 源码、两种运行方式。

### 4.5 报告页结构（前端）

**一个 tab 一个组件**（`web/components/Log*Msg.tsx`），顺序如下（打开默认停在「基本情况」）：

| tab      | 组件                             | 内容                                                                                                   |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 基本情况 | `LogReport.tsx` 内・`MetricsTab` | 规则产出的关键数字（metrics，声明在 `facts.yaml`）                                                     |
| 系统消息 | `LogSystemMsg.tsx`               | 消息记录统计（逐字节数 `MSG_TYPE`）+ Information Message 字典（变量名 / 取值 / 说明）                  |
| 事件消息 | `LogEventsMsg.tsx`               | PX4 事件解码 + 固件文本消息 + 多值信息（'M'），可按级别过滤                                            |
| 飞控参数 | `LogParamsMsg.tsx`               | 参数 / 当前值 / 默认值 / 最小值 / 最大值 / 说明；**当前值 ≠ 默认值则整行标红**；默认按 "与默认不同" 筛 |
| 数据图表 | `LogCharts.tsx`                  | 曲线预设（`knowledge/px4/plot/*.yml`），含飞行阶段底色                                                 |
| 检查结论 | `LogReport.tsx` 内               | findings + 故障知识库命中条目                                                                          |
| AI 解读  | `LogReport.tsx` 内               | DeepSeek 报告                                                                                          |

报告页之外还有两块常驻区域：**飞行阶段条**（`LogPhaseStrip.tsx`）紧贴 **飞行轨迹地图**（`LogFlightMap.tsx`，高德瓦片：国内可达；轨迹按 WGS-84 → GCJ-02 换算后绘制，换算见 `lib/coord.ts`）。

时间口径全站统一：**开机以来的秒数**，显示成 `hh:MM:ss`（与 Flight Review 一致）。数据层的硬规则与坑（事件解码、多值信息拼接、参数默认值怎么来、派生数据版本）见 `knowledge/px4/CLAUDE.md`**&#x20;的「报告页数据层」**—— 改 `engine/report_data.py` 前必读。

---

## 5. 平台 MCP 服务

网站本身对外暴露一个 MCP 服务，让 Claude / Cursor 等客户端直接调用平台能力，是最自然的分发渠道。**上线时间在阶段二（轻量云服务器）之后**——MCP 为长连接，边缘 Functions 不适合承载。工具定义先行设计：

| Tool                                         | 说明                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `search_skills(query, platform?, category?)` | 语义检索 Skill，返回卡片摘要                                                                                                              |
| `get_skill(id)`                              | 返回完整 prompt、输入输出示例、一键导入格式                                                                                               |
| `analyze_findings(findings)`                 | 提交端侧解析得到的结构化 findings，返回解释后的报告（鉴权 + 配额）。原始日志直传（`analyze_log(file)`）待远期腾讯云独立解析服务上线后开放 |
| `explain_finding(report_id, finding_id)`     | 单条发现的自然语言解释 + 官方文档链接                                                                                                     |
| `submit_skill(...)`                          | 提交 / 更新 Skill（需作者鉴权）                                                                                                           |

**安全红线**：平台永不直接致动真实载具。致动类能力（arm/disarm、模式切换）只以开源 Skill 形式提供，并强制三重门禁：

1. 默认只读；

2. 显式 `--enable-actuation` 参数才启用致动；

3. 仿真环境优先，对真实载具设置额外安全门禁。

（参照 rmeadomavic 的 ArduPilot MCP 与 PX4 SITL MCP 设计。）

---

## 6. 技术栈与部署

### 6.1 技术栈

面向国内用户选型：

- **前端 / 全栈**：Next.js + TypeScript + Tailwind CSS + shadcn/ui，**代码位于&#x20;**`web/`**&#x20;子目录**；校验用真实日志放 `tools/testdata/logs/`（不入库，含 GPS 轨迹），冻结基线在 `tools/testdata/baseline/`，脚本在 `tools/engine/` 与 `tools/dev/`

- **登录认证**：Auth.js（NextAuth）。**当前支持 GitHub + 邮箱验证码 / Magic Link（零资质，个人开发者可直接上线）**；**微信扫码、手机号验证码待注册企业主体后再接入**（微信开放平台网站应用需企业资质 + 300 元认证，短信签名 / 模板需企业资质审核）

- **数据存储（EdgeOne 内置两层）**：

  - **EdgeOne KV**：已启用，小尺寸键值、读多写少，存元数据与索引 —— 用户、配额计数、评论、报告元数据。配额计数用唯一键 + 前缀列举避免竞态；注意最终一致，写后不立即回读。

  - **EdgeOne Blob**：大对象与二进制 ——Pyodide 运行时 / 自定义 wheel、语义向量静态文件、报告分享页（HTML / PDF）、KV 定期导出的 JSON 备份，均通过 CDN 分发。原始日志默认仍不上传；未来云端留存 / MCP 文件直传时再放 Blob（需签名 URL 支持，以官方能力为准）。

  - 语义搜索（待实现）：Skill 数量小，embedding 文件放 Blob，浏览器 / Function 内暴力匹配，无需专用向量库。**向量来源：同一个 BGE 小模型（如 bge-small-zh）两端使用**——Skill 侧在构建时本机离线生成，随版本静态发布（DeepSeek 仅提供对话模型、无 embedding 接口）；用户查询侧在浏览器用 transformers.js/onnxruntime-web 实时生成。运行时零成本、零外部依赖；以后 Skill 频繁更新或需检索日志报告时，再改用云端 embedding API（阿里 text-embedding-v3 / 混元 embedding）。

  - 不追求 SQL 能力。**存储演进顺序（写死，不提前采购）**：

1. **阶段一（当前）**：EdgeOne KV + Blob，零服务器、零外部存储费用，Blob 是唯一对象存储；

2. **阶段二（触发条件出现时）**：腾讯云轻量服务器，承载 SQLite + sqlite-vec / PostgreSQL 与 FastAPI + Redis 解析服务；备份仍继续写 Blob。

   从第一天起封装薄存储接口，实体字段对齐远期关系型表结构，控制阶段间迁移成本。

- **日志解析（端侧优先）**：**Pyodide（WASM Python）运行在 Web Worker 中**，首发加载 pyulog（PX4 `.ulg`）；ArduPilot `.bin` 已支持，解析器自研（无 pymavlink，随引擎一起内联进产物，不需额外下载）；规则检查器与解析器为同一份纯 Python 包，浏览器与服务端共用。**blackbox\_decode（Betaflight）推后**：它是 C 编译二进制、无法直接进 Pyodide，需 WASM 重写或等阶段二服务端引擎支持

- **任务形态**：解析在端侧异步进行，无需服务端队列；当前不部署独立 Python 服务。大文件（约 50MB 以上）或批量分析 API 阶段，再把同一套引擎下沉为 FastAPI + Redis（ARQ / BullMQ）常驻容器服务

- **LLM**：服务端调用 **DeepSeek** 首选，prompt 保持模型无关，GLM-4.5-flash /qwen-turbo 作为备选；仅接收结构化 findings，不接触原始日志；配合 prompt 缓存与报告缓存，单份报告成本控制在 ¥0.1 以内

- **MCP 服务**：TypeScript MCP SDK，独立小服务；**上线时间后移到阶段二**（购买轻量云服务器后）——MCP 为 SSE / 长连接，无状态、有超时的边缘 Functions 不适合承载

### 6.2 部署与第三方服务

- 前端 / 边缘：腾讯 EdgeOne Pages，**使用境外节点、无需 ICP 备案即可绑定自定义域名**（代价：大陆用户访问延迟略高于国内备案节点；产品成熟、主体齐备后再备案切国内节点）；**持久化与大对象全部使用 EdgeOne 内置的 KV 与 Blob，不另购对象存储**

- 对象存储：**EdgeOne Blob 为唯一对象存储**（Pyodide 资源、向量文件、分享报告、各阶段备份），全周期不引入外部对象存储服务

- 计算 / 服务器：**当前不买服务器**—— 站点与 Pages Functions 部署在 EdgeOne。**阶段二采购腾讯云轻量服务器的触发条件**：出现复杂多表统计 / 后台需求、团队空间、需要关系型数据库（SQLite + sqlite-vec / PostgreSQL），或大文件 / 批量 API 需要 FastAPI + Redis 日志解析服务

- 收款：**微信支付 + 支付宝**（订阅制；个人开发阶段可先用虎皮椒 / Payjs 等聚合支付过渡）

> 实施前需以 EdgeOne 官方文档核实：KV / Blob 的免费额度与上限（读写次数、单对象大小、总存储）、Functions 是否可直接写 Blob、CDN 流出流量计费口径、Blob 是否支持签名 / 私有 URL 与对象列举。

### 6.3 数据模型（EdgeOne KV + Blob）

当前按 "KV 存元数据、Blob 存大对象" 分工，实体字段保持与远期关系型表结构一致，便于迁移：

**KV 键设计：**

| KV 键模式                                 | 内容                                                                                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user:{id}` / `user:wx:{openid}` 等索引键 | 用户资料、贡献者等级（对应远期 `profiles`）                                                                                                                                                       |
| `skill:{slug}`                            | Skill 元数据：name /description/prompt /examples/platform\_tags /model\_tags/category /status/downloads\_count /rating；当前仍以 MDX 为唯一数据源，KV 仅在支持在线提交后启用（对应远期 `skills`） |
| `review:{skillSlug}:{userId}`             | 评分 + 评论 + 实测用例结果，按前缀列举（对应远期 `reviews`）                                                                                                                                      |
| `report:{id}`                             | 报告元数据与结构化结果摘要（findings JSON + LLM 解释，控制单值大小）；完整 HTML / PDF 放 Blob；**原始日志不入库、不上传，仅存在于用户浏览器**（对应远期 `analysis_reports`）                      |
| `share:{id}`                              | 报告分享索引：→ Blob 公开 URL、所属用户、时间、严重度统计                                                                                                                                         |
| `usage:{userId}:{月份}:{reportId}`        | 配额计数：每次分析写唯一键，按前缀列举计数，避免读 - 改 - 写竞态（对应远期 `usage_counters`）                                                                                                     |
| `purchase:{userId}:{packId}`              | 规则包购买与分成计费（对应远期 `rule_pack_purchases`）                                                                                                                                            |

**Blob 对象设计：**

| Blob 路径模式                          | 内容                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `runtime/pyodide/`、`wheels/*.whl`     | Pyodide 运行时与自定义 pyulog 检查器 wheel，长缓存（已启用）                             |
| `embeddings/skills-{version}.json`     | Skill 联合 embedding 静态文件，供语义搜索内存匹配（待实现）                              |
| `reports/{id}.html` / `.pdf`           | 可分享的完整报告，公开 / 签名 URL 访问（已启用）                                         |
| `backups/kv-{日期}.json`               | KV 定期导出备份                                                                          |
| `logs/{userId}/{reportId}.ulg`（远期） | 用户主动要求云端留存、或 MCP 文件直传时的原始日志；默认功能不启用，需签名 URL 与隐私提示 |

不进 KV / Blob 的数据：

- `check_rules`：检查规则随端侧引擎打包发布（版本化），不存云端。

- 向量检索：冲刺 3 用 Blob 静态文件 + Function 内存计算，不建向量表；迁数据库后用 sqlite-vec /pgvector。

**浏览器本机持久化（IndexedDB，仅本机、从不上传）：**

| 本机存储                          | 内容                                        | 用途                                                                                                                               |
| --------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `nextpilot-cache` / `logs`        | 原始 `.ulg` 字节（key = 日志 SHA-256 指纹） | 历史回看一键 "恢复完整数据"：报告存档只有结论与 AI 文本，图表 / 事件 / 参数需重新解析原始日志。上限 10 份 / 300MB，超出按 LRU 淘汰 |
| `nextpilot` / `pending`           | 首页上传卡暂存的待分析文件                  | 首页选文件 → 跳分析页自动解析，读完即删                                                                                            |
| `localStorage: nextpilot:reports` | 报告存档（findings + AI 报告 + 日志指纹）   | 匿名用户的历史记录（跨设备靠登录后的 KV 存档）                                                                                     |

重新解析必须沿用已有的 AI 报告（`pendingAiRef`），否则会把花过额度生成的解读覆盖成空。

---

### 6.4 文件命名规范

统一约定（新建文件务必遵循，命名不清时先查本节）：

| 类型                                      | 规则                                                                                                | 示例                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| React 组件                                | PascalCase + `.tsx`                                                                                 | `LogAnalyzer.tsx`、`SkillCard.tsx`                                             |
| 分析页 tab 组件                           | 一个 tab 一个文件：`Log<用途>Msg.tsx`                                                               | `LogEventsMsg.tsx`、`LogParamsMsg.tsx`、`LogSystemMsg.tsx`、`LogFlightMap.tsx` |
| 库 / 类型 / 常量                          | kebab-case + `.ts`                                                                                  | `chart-presets.ts`、`types.ts`、`constants.ts`                                 |
| **两侧共用**的库（浏览器 + 边缘函数都引） | kebab-case + `.js`（例外：边缘那 22 个文件全是 `.js`，`.ts` 能否被 EdgeOne 打包器吃下本地验证不了） | `lib/error-policy.js`                                                          |
| Web Worker 入口                           | kebab-case + `-worker.ts`                                                                           | `pyodide-px4log-worker.ts`                                                     |
| Worker 内嵌脚本 /helper                   | kebab-case + `-script.ts` / `-engine.ts` / `-data.ts`                                               | 现由 `build-knowledge.mjs` **生成**，不手改                                    |
| Next.js 路由                              | `page.tsx` / `route.ts` / `layout.tsx`（目录即路由）                                                | `app/analyze/page.tsx`、`app/api/explain/route.ts`                             |
| Python 模块                               | snake\_case + `.py`                                                                                 | `engine/rule_engine.py`、`engine/operators.py`、`engine/report_data.py`        |
| 知识 / 经验文件                           | 见 `knowledge/README.md`；规则 `rules/*.yaml`、故障库 `fault-kb.yaml`                               | `rules/vibration.yaml`、`fault-kb.yaml`                                        |
| 文档                                      | kebab-case + `.md`                                                                                  | `llm/gjb841-system-prompt.md`                                                  |
| 边缘函数（`web/functions/`）              | kebab-case + `.js`，**文件名即路由**（`functions/api/x.js` → `/api/x`）                             | `api/me.js`、`api/issues.js`、`_lib/issue-filer.js`                            |

**名字要能望文生义**（只满足上面那张表的 "类型规则" 不够 —— 它只告诉你后缀是 `.ts` 还是 `.tsx`，看不出这个文件干什么）：

1. **一条功能链上，每个文件占一个不重复的角色词**，名字连起来要能读成一句 "谁采 → 谁收 → 谁建单"。

   例：`lib/issue-bridge.ts`（浏览器采集 + 投递）→ `functions/api/issues.js`（边缘入口，只接收）

   → `functions/_lib/issue-filer.js`（边缘，判定 + 建单）。

2. **禁止只差词序 / 单复数 / 一两个字母的孪生名**：`error-reporter` 与 `report-error` 这样的名字真的并排出现过，

   读的人分不出哪个是模块、哪个是路由。同理不要 `foo-bar` / `bar-foo` 并存。

   **更要防 "读起来有上下级、其实是并列" 的一对**：`GuideMarkdown` / `GuideMdx` 只差一个字母，

   而 `Markdown ⊂ MDX` 让人以为前者是后者的基础版 —— 于是 "删掉基础版" 看起来是简化，实际会把带

   `{占位符}` 的文档交给 JSX 解析器（2026-09-18 已合并成 `GuideBody.tsx`，守卫 §\[14] 钉住）。

   **名字读出来的关系必须与真实关系一致**：不一致的名字比难读更坏，它会指错方向。

3. **领域词先查有没有被占用**：本仓库 `report` 已指 "飞行分析报告"（`/api/reports`、`lib/report-history.ts`），

   所以 "线上报错自动建单" 这条链统一用 `issue` 词根，不用 `report`。

   （也曾试过 `telemetry`：它不撞任何词根，但**语义比实际宽**—— 这条链只装错误上报这一件事，

   叫 "遥测" 是名不副实，读者会以为里面还有性能 / 使用统计。**泛词当避让词用，终究要还债。**）

4. **运行时由目录表达**，不要在文件名里重复编码侧别：`web/lib/`＝浏览器、`web/functions/`＝边缘。

   也别用 `-edge` / `-route` 这类**位置后缀**去补区分 ——`functions/` 整个目录就是边缘、

   `api/x.js` 的文件名本身就是路由，再写一遍纯属冗余；而且位置是这堆东西里**最会变的一维**，

   文件一挪后缀就开始撒谎（职责不会挪）。

   分工靠这个组合：一条链共用**同一个领域词根**，每个文件各占一个**不重复的角色词**

   （`issue-bridge` 桥接 → `issues` 入口 → `issue-filer` 建单）。

   **词根认亲，角色词分工**—— 少了词根，看不出三个文件是一条链上的；少了角色词，

   就只能靠位置后缀硬分，又回到上面那句。

5. **同一目录里不许出现 "开头一样、意思不同" 的名字**（`/api/reports` 与 `/api/report-error` 前缀相同、

   一个名词一个动词，并列在 `functions/api/` 里）。

6. **词根要读出一族文件的共同不变量，不能只图好看**。`web/components/` 的 `Log*` 家族定义是

   " 渲染**某一份**日志的分析结果 "——**不是**"手里有日志字节"（从历史打开时字节可能已被淘汰，

   这些组件各自处理了那条路：`isHistory` / `manifest?` / `storedPanels` / 存档轨迹）。据此：

- 单份的组件一律 `Log*`。`LogReport.tsx` 是那六个 tab 组件的父壳，2026-09-18 由 `AnalyzeReport`

  改来 ——`Analyze` 是**路由**的词（`app/analyze/` + `Analyze*Client` + `useLogAnalyzer` 已占着），

  给 `components/` 里的共享组件再挂一次，读者看不出它在 `Log*` 家族里占哪一格。

- **集合类不在此列**：一次列很多份的，用**数据模型**的词。`ReportHistoryList.tsx`

  （2026-09-18 由 `HistoryList` 改来）列的是 `SavedReport` / `HistoryItem`，与

  `lib/report-history.ts` 认亲。

- 判据：**这条记录能不能比它依赖的东西活得久**。报告能 —— 字节被 `REPORT_DATA_KEEP` 淘汰、

  或报告本来就来自别的设备（`source: "cloud"`），此时只剩结论；日志字节不能。所以给列表挂

  `Log` 词根是在承诺 "日志在这"，而那张表里恰恰经常没有。名字读出的承诺必须是数据模型能兑现的。

1. **被并列的多类内容共用的组件，不许挂其中任何一类的名字**。站内「Skill 技能」与「MCP 服务」

   是并列的两类，详情页共用 `EntryContentTabs` / `EntrySidebar` / `EntryComments` /

   `EntryHeaderMeta` —— 家族名取两类共有的上位词 "收录条目"，两类差异全部走参数：`kind`

   决定统计接口与文案口径，`skillMdRaw` / `editUrls.skillMd` 这类可选参数决定 " 有没有

   SKILL.md 那一格 "（MCP 走 server.json，没有这一格），所以组件本身不含任何 `if (是 Skill)`

   的分支。**不带&#x20;**`kind`**&#x20;的那个（**`EntryContentTabs`**）不是漏了，是它压根不需要知道类别**

   —— 按 "有没有这份文件" 分就够了。

   它们曾叫 `SkillContentTabs` 等：MCP 页面用着 `Skill*` 组件，名字在读的人眼里就是说

   "这个组件只服务 Skill"，而照名字去 "修正" 的正解是复制一份 `McpContentTabs`—— 于是长出

   一对只差前缀的孪生组件，改一边漏一边（2026-09-20 已改，守卫 §\[17] 钉住）。

   判据：**这个名字出现在另一类内容的页面上时，读起来是不是假的**。

   同理反向也成立：只服务一类的（列表页 `SkillExplorer` / `McpGrid`）**不要**为了 "统一"

   改成中立名 —— 那会让 "这是哪一类的列表" 从名字里消失。

> 注意：Worker 相关文件统一用连字符（
>
> `pyodide-px4log-worker.ts`
>
> ），不要用点号（❌
>
> `pyodide-px4log.worker.ts`
>
> ）。
> **日志分析的人工经验（阈值 / 故障树 / 检查逻辑 / LLM 范式 / 事实层绑定与码表）单一事实源在仓库根**
> `knowledge/px4/`
>
> （=
>
> `rules/*.yaml`
>
> \+
>
> `fault-kb.yaml`
>
> \+
>
> `facts.yaml`
>
> \+
>
> `llm/*.md`
>
> ；
> 引擎机制在
>
> `engine/`
>
> ，同样不含业务数据），web 与未来 MCP 服务都只消费其派生产物（
>
> `web/workers/*`
>
> 、
> `web/lib/knowledge/*.generated.js`
>
> 、
>
> `web/.generated/guide/*.md`
>
> **后者必须按普通 markdown 渲染**
> ——
>
> `web/components/GuideBody.tsx`
>
> 按扩展名分流，
>
> `.md`
>
> 走 react-markdown；那些文档里有
>
> `{占位符}`
>
> 、
> `meta/<tag>.json`
>
> ，交给 MDX 会被当 JSX 表达式解析。改经验只改
> `knowledge/`
>
> ，然后
>
> `cd web && pnpm build:kb`
>
> （只比对不写入：
>
> `cd web && pnpm build:kb --check`
>
> ）。
> 改
>
> `knowledge/px4/`
>
> 下的规则、算子或引擎前，先读同目录的
>
> `knowledge/px4/CLAUDE.md`
>
> ：
> 那里记着每条设计决策的动机、与最初设计的落地差异（有意为之，别当 bug 改回去）和已知缺口；
> 它是给 AI 与维护者的上下文，不发布到网站。
>
> **报告页数据层**
>
> （
>
> `engine/report_data.py`
>
> ）的硬规则
> 也在那一份里（时间基准、事件解码、多值信息拼接、参数默认值怎么来、派生数据版本）。
> **Python（**
>
> `engine/`
>
> **&#x20;与&#x20;**
>
> `tools/`
>
> **）的风格约定**
>
> ：格式化的唯一权威是
>
> `ruff format`
>
> ，配置在仓库根
> `pyproject.toml`
>
> （行长 100、双引号），工具版本钉在
>
> `requirements-dev.txt`
>
> 。改完自查
> `python -m ruff format --check . && python -m ruff check .`
>
> 。
>
> **别跑&#x20;**
>
> `ruff check --fix`
>
> **、别开编辑器**
> **的 "保存时自动修复"**
>
> ：
>
> `engine/`
>
> 下的文件是拼接片段，那样会误删东西（清单见
>
> `engine/README.md`
>
> ）。
> 这条约定的由来：在它之前每个编辑器各按自己的默认格式化器改文件，有一轮提交里混进了 500 行纯格式改动。
> **校验入口与 CI**
>
> ：所有校验收在
>
> `python tools/ci/check_all.py`
>
> 一处 —— 云端 CI
> （
>
> `.github/workflows/ci.yml`
>
> ）与
>
> `.githooks/pre-push`
>
> 都只调它，要加校验只改这一处。
> 校验按「是否需要真实
>
> `.ulg`
>
> 日志」分两组：
>
> **不需要日志的**
>
> （ruff /
>
> `build:kb --check`
>
> /
> 指南页算子表是否跟上
>
> `engine/`
>
> 源码 / 产物是否为合法 Python /
>
> `tsc`
>
> /
>
> `next build`
>
> ）云 CI
> 每次提交都跑；
>
> **需要日志的**
>
> （6 条冻结基线逐字段比对、适配器契约测试、数据层 probe）
> **云 CI 跑不了**
>
> —— 原始日志含 GPS 轨迹、按隐私规则不入库，CI 的 checkout 里没有这些文件，
> 它们只在开发机跑（
>
> `git config core.hooksPath .githooks`
>
> 启用，每台机器做一次）。
> 所以
>
> **CI 全绿不等于回归过了**
>
> ：改规则、算子或
>
> `engine/`
>
> 之后必须在本机跑一次。
> 派生数据版本（
>
> `web/lib/knowledge/derived-version.generated.ts`
>
> ，构建期算的引擎源文件哈希）：
> 改了
>
> `engine/report_data.py`
>
> /
>
> `engine/rule_engine.py`
>
> /
>
> `facts.yaml`
>
> /
>
> `plot/*.yml`
>
> ，用户本机存档
> 会在打开时
>
> **自动重解析一次**
>
> （facts /findings 一并刷新，AI 报告保留），不用挨个提醒重新上传。

---

### 6.5 外部数据的读取边界（只许一个归一函数，禁止 `as`）

**适用判据一句话：写入方与读取方可能不是同一版本。** 静态站与边缘函数分开部署、KV 记录能跨版本

活 7 天、IndexedDB /localStorage 里躺着几个月前老代码写的记录 —— 只要数据能跨部署存活，它读回来时

就可能缺字段、多字段、甚至换了个形状。而 **TypeScript 在这里一点用都没有**：类型是编译期的，JSON 是运行期的。

**Worker 的&#x20;**`done`**&#x20;消息在这一列**（2026-09-18 更正；原文写的是 "不在"，错了）：Worker 是模块级单例、

**常驻且从不因代码更新重建**（见 `hooks/useLogAnalyzer.ts` 文件头），所以 " 页面已经是新代码、Worker

还揣着上一版产物 " 是常态而非意外 —— 判据（写入方与读取方可能不是同一版本）成立，改代码后只热更新

页面、不刷新浏览器就能复现。引擎 Python 侧的跨版本失效仍由 `derived-version.generated.ts` 的

自动重解析兜住，那一层不受这里影响。

规则：

1. **一个外部形状，一个&#x20;**`normalizeXxx(raw: unknown): T`，且在**唯一入口**调用一次。

   入参写 `unknown` 而不是 `Partial<T>`—— 边界上的 JSON 本来就没有类型，写 `Partial` 只是让读者

   误以为字段已经对上了。禁止 `as T`：强转把类型检查关掉，缺字段的值会一路走到 UI 才炸，

   而**炸在入口有文件名和行号，炸在 UI 只有一句&#x20;**`Cannot read properties of undefined`。

2. **归一只做三件事**：补默认值、收窄类型（`typeof x === "number"`）、丢掉坏记录（返回 `null` 或过滤）。

   它不抛错、不校验业务 —— 一条坏数据只该让那一条不显示，不该让整个页面白屏。

3. **内部代码信任类型**，不在各处补 `?? []`。逐字段兜底是治标，还会掩盖 "边界没归一" 这个真问题。

   （例外：类型上本来就**可选**的字段，如 `report.metrics`，照常用 `?.`—— 那是类型允许的缺失，性质不同。）

4. `as Record<string, unknown>` / `as unknown` **允许**，但只许出现在归一函数**内部**——

   它是把 "无类型" 变成 "可检查" 的桥，不是绕过检查的后门。

5. **同一形状不许有两份归一实现**：两份必然分叉，分叉之后没人知道该信哪份（同 §6.4 第①条的病）。

现有归一函数（新增外部形状时照着写）：

| 外部形状                                                                           | 归一函数                                                                                            | 唯一入口                                    |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 报告存档 `SavedReport`（索引库 /localStorage/ `/api/reports/:id`）                 | `lib/report-history.ts` `normalizeSavedReport`                                                      | `hooks/useLogAnalyzer.ts` `openSaved()`     |
| 收藏 / 评分 / 排行榜（`/api/favorite`、`/api/rating`、`/api/download/track`）      | `lib/community-stats.ts` `normalizeFavoriteStats` / `normalizeRatingStats` / `normalizeLeaderboard` | 该文件里各自的 fetch 包装函数               |
| 内部接口（`/internal/users/upsert`、`/internal/otp/set`、`/internal/otp/consume`） | `lib/internal-kv.ts` `normalizeInternalUser` / `normalizeOtpRequest` / `normalizeOtpConsume`        | 该文件里各自的调用包装函数                  |
| Worker 的 `done` 消息（`report`）                                                  | `hooks/useLogAnalyzer.ts` `normalizeWorkerReport`                                                   | 同文件 `handleWorkerMessage` 的 `done` 分支 |

**与形状无关的通用判断**（`asRecord` / `toCount`）收在 `lib/json-boundary.ts`，别在各自文件里重写；

"缺哪个字段、缺了当什么" 则是那个形状自己的知识，留在上表那些模块里。这个文件不叫 `normalize.ts`——

`lib/error-policy.js` 已经导出一个 `normalize`（脱敏用的正则替换），同名不同义正是 §6.4 第⑤条禁的迷惑。

> 由来（同一形状栽过两次，报告存档那次是线上白屏）：构建期的
>
> `__FACTS__`
>
> 哨兵 ——Python 全量
> `replace`
>
> 与 JS 只换一处，两条替换路径只有一条被机器校验；报告存档 ——
>
> `SavedReport`
>
> 有一半来自
> 外部 JSON，但兜底只装在了本地一侧（索引库），云端一侧靠
>
> `as SavedReport`
>
> 接住，于是线上炸在
> `LogReport`
>
> 的
>
> `report.findings.filter`
>
> （
>
> `GeneralInfo`
>
> 白屏）。
> **两次都不是 " 少写一个&#x20;**
>
> `?.`
>
> **"，都是" 同一份数据有两个入口，只有一个被校验 "。**
> 守住这条的是
>
> `web/scripts/test-issue-filer.mjs`
>
> §[10]：全仓库扫
>
> `.ts/.tsx`
>
> ，
>
> **同一行里同时出现**
> `.json()`
>
> **&#x20;与&#x20;**
>
> `as <具名类型>`
>
> 即红（
>
> `as unknown`
>
> /
>
> `as Record<…>`
>
> 放行，它们只该活在归一函数里），
> 另外单独禁止
>
> `as SavedReport`
>
> ，并检查归一函数仍被导出、唯一入口仍在调用。

---

### 6.6 守卫自己也要被校验（判空查的名字必须真实存在）

**适用判据一句话：凡是你写了一个 "有没有 X" 的判断，X 必须真的有机器能证明它在。**

守卫写错的代价不是崩溃，而是**某个功能永远不可用**，或者更糟 ——**静默取到别的数据**：

它不抛异常、不进错误上报，用户看到的是一句听起来很合理的提示。这类 bug 比崩溃难查一个量级。

规则：

1. **判据要落在真值来源上，别凭记忆写名字。** 想知道 "引擎解析过了没有"，就查 bootstrap

   真正建立的全局名；写完用 `grep` 核一遍它真的被赋值或被导入过。

2. **每加一个守卫，同时交付一个能证明它会红的检查**（写的时候先让它红一次，再让它绿）。

   恒真的守卫和没写守卫的区别，只有这个检查能看出来。

3. **跨语言的名字（Python 全局、环境变量、KV 键、URL 段）必须由机器核对**：人眼看得懂

   `provider` 和 `ulog` 长得很像，编译器看得懂，解释器也看得懂 —— 只有 "没这个变量" 这件事，

   JS 侧查不出来（Pyodide 的 `globals.get("不存在的名字")` 返回 `undefined`，不报错）。

4. **守卫要答两件不同的事时，两件必须一起成立。** 例：`track`/`series` 请求既要 "命名空间装载了"

   又要 "装的就是这一份日志"—— 少后半句，工作区里装着日志 A 时打开没有轨迹存档的报告 B，

   会把 A 的航线画成 B 的飞行记录（`web/workers/pyodide-px4log-worker.ts` 的 `logNotLoadedReason`）。

5. **"缺字段" 和 "空" 是两个答案，判空不许给同一个。** `result.get("findings", [])` 对 "字段没交付"

   和 "本来就没有告警" 返回同一个 0—— 守卫看着是绿的，其实什么也没查。查 "在不在" 就直说：

   `if "findings" not in result` / `if not isinstance(..., list)`。同型的还有不区分来源的

   `dict.get(k, None)`、把 "取不到" 和 "本来就是空" 混在一起的 `?? {}`。

> 由来（
>
> **同一形状栽过三次**
>
> ，前两次见 §6.5）：
>
> `__FACTS__`
>
> 哨兵、
>
> `as SavedReport`
>
> 、
> 以及 2026-09-18 的
>
> `pyodide.globals.get("ulog")`
>
> —— 产物里从来没有名为
>
> `ulog`
>
> 的全局
> （bootstrap 那行是
>
> `provider = open_log(...)`
>
> ，
>
> `from pyulog import ULog`
>
> 只带来
>
> `ULog`
>
> ）。
> 于是守卫恒真，轨迹请求
>
> **永远**
>
> 返回 "这份日志还没在解析过，重选文件即可恢复"：
> 轨迹画不出来、也从未进过存档，界面还一直叫用户重选文件 —— 照做一遍回来看到同一句，
> 因为复解析是成功的，被挡掉的是紧跟其后的 track 请求。
> **三次都不是 "少写一个判断"，都是 "判断本身没有被任何东西检查过"。**
> 守住这条的是
>
> `tools/engine/check_engine_pyodide.py`
>
> ：它真执行编译产物，把
>
> `pyodide-px4log-worker.ts`
>
> 里
> 所有
>
> `pyodide.globals.get("…")`
>
> 的名字
>
> **逐个拿到那个命名空间里核**
>
> （核对前先按 worker 的顺序
> 调一遍
>
> `np_report`
>
> /
>
> `np_manifest`
>
> /
>
> `np_log_info`
>
> /
>
> `np_track`
>
> ，
>
> `__result`
>
> 这类由函数内部
> `global`
>
> 摆出来的名字才真的存在），不存在即红并打印命名空间里真实存在的名字。
> 它还检查交付给前端的报告
>
> **必需字段在不在**
>
> —— 这一格以前用的是
>
> `result.get("findings", [])`
>
> ，
> 缺字段时照样打印
>
> `findings=0`
>
> 并放行（同一形状的第四次，见规则 5）。
> 第五、第六次（2026-09-18 晚，同一天内）：
>
> `track`
>
> 的 "取不到要说清缺什么" 那条契约，
> **回归日志恰好有 GPS**
>
> ，失败分支一次都不会被执行 → 守卫恒绿（做法：
>
> **构造反向用例**
>
> ，
> 改运行期配置把分支逼出来，见
>
> `check_engine_pyodide.py`
>
> 的两道 probe）；以及
> `px4log_engine_runner.py --probe-data`
>
> **对每一份日志都打 ERROR 却&#x20;**
>
> `return 0`
>
> ——
> 它的
>
> `np_series`
>
> 调用还停在旧的 4 参签名上，签名改成请求体之后没人跟着改，
> 于是
>
> `series`
>
> 那一路
>
> **很久没被真的检过**
>
> ，而
>
> `check_all.py`
>
> 只看退出码、一直报 OK。
> **一次失败要不要算失败，是守卫的一部分**
>
> ；只打印不计数等于没写。

---

### 6.7 共享常驻 Worker：取数据前先确保它装着当前这份日志

Worker 里一次只装得下一份日志，而它是模块级单例、跨路由与跨报告常驻（理由见

`hooks/useLogAnalyzer.ts` 文件头：Pyodide 初始化太贵）。于是 "打开的历史报告" 与 "Worker 里现在装的"

很容易不是同一份 ——**这是常态，不是异常**，必须有个人负责兜住，而且只能是前端：Worker 手里没有

字节，它救不了自己。

规则：

1. **取数据（**`track`**&#x20;/&#x20;**`series`**）之前，先&#x20;**`await ensureLogLoaded(pendingHashRef.current)`**。**

   装着 → 直接走；不是这份 → 用手里的字节补一次解析并等它结束；**手里也没字节**（历史记录 +

   本机缓存被淘汰／记录来自别的设备）→ 才让 Worker 回那句实话、界面给 "重新选择该 .ulg 文件"。

2. **字节必须与指纹配对**（`pendingBytesHashRef`）：`pendingHashRef` 会被 `viewSaved` 改成 " 当前

   显示的报告 "，而字节还是上一份的 —— 不配对就会出现" 拿 A 的字节去补 B 的数据 "，比报错难查得多。

3. **Worker 侧的拒绝照旧保留**：它是 "绝不静默交出另一份日志的数据" 的最后一道闸。

   前端补装成功是常态，闸门只在真的给不出数据时说话。

4. **同一份日志的补解析要能去重**（`analyzeInFlight`），别让三个图表面板各解析一遍。

5. **等待必须有出口**：解析失败（`error`）时把所有等待者放行。否则一个 `await` 永远挂着，

   界面卡在 "加载中"—— 用户连 "重新选择文件" 的按钮都看不到。

6. `done`**&#x20;要认领自己的结果**：补解析是在页面**已经把报告渲染出来之后**才发起的，而 Pyodide

   首次初始化要十几秒 —— 用户完全可能在这中间回列表打开另一份报告。所以 `done` 只在

   `logId === pendingHashRef.current`（= 这份数据正是当前页面要的）时才写 `report`/`manifest`/`info`；

   否则只记账（`workerLoadedHash`）、`settleAnalyze`，不落 state。缺了这条就是 " 头部显示 C、

   结论是 B"，而 `liveAnalysis` 还会被记成「C 的 id + B 的 manifest」，随后的结果页交接一并错。

7. **补解析要沿用 "当前显示的报告" 那份 AI 解读**（`aiMarkdownRef`，跟着 `aiMarkdown` state 走），

   **不是** `pendingAiRef`（那是 "上一次解析那份日志的 priorAi"，从历史打开第二份报告时它还是

   上一份的值、常常是 `null`）。写错的后果不只是显示：`done` 紧接着就 `persist`，

   用户花额度换来的 AI 报告会被**永久覆盖成空**。同理，别逐个 `setAiMarkdown` 调用点去写这个

   ref——`setAiMarkdown` 是导出给调用方的，漏一处就静默丢一次。

> 由来（2026-09-18，用户连着报了三轮 "还是这个问题"）：Worker 里的闸门查出 "装的是另一份日志"，
> 界面就只给一句 "重新选择该 .ulg 文件即可恢复"。可沿着这条链每一步看都没错 —— 它错在
>
> **没有人**
> **负责 "把这份日志装进 Worker"**
>
> ：字节往往就在手里（刚选过的那份、或本机缓存里的），
> 却要用户再选一遍；曲线那条路连按钮都没有，用户只能一直看不到图。
> **判据：让用户做一件应用自己能做到的事，就是 bug。**
> 顺手接上的两个坑（同一个根因的另一面：
>
> `parseBytes`
>
> 以前只由用户的显式动作触发，
> 现在会被
>
> `ensureLogLoaded`
>
> 在后台触发，于是 "解析在飞的时候页面已经换了" 变成了可达状态）：
> `done`
>
> 的落 state 必须先认领
>
> `logId`
>
> （规则 6）；补解析传入的
>
> `priorAi`
>
> 必须是当前报告的
> 那一份（规则 7），否则一次后台补装就把存档里的 AI 报告抹掉。
> 守住这条的是
>
> `web/scripts/test-issue-filer.mjs`
>
> §[12]：Worker 必须在
>
> `done`
>
> 里回传
>
> `logId`
> （前端
>
> **不许**
>
> 靠 "我发过 analyze" 推断 ——analyze 是会失败的），
>
> `workerLoadedHash`
>
> 必须是模块级、
> 丢弃 Worker 时要一并清掉，两个取数入口都要先
>
> `ensureLogLoaded`
>
> ，且
>
> `ensureLogLoaded`
> 必须有 "手里没字节就返回 false" 的出口（不许硬编、不许拿别的日志凑）；
>
> `done`
>
> 必须拿
> `logId`
>
> 与当前页面对照；补解析的
>
> `priorAi`
>
> 必须是
>
> `aiMarkdownRef.current`
>
> 。

---

### 6.8 报错要说清 "缺什么"，不许给一句概括

**适用判据一句话：一句概括只有在 "它恰好是唯一原因" 时才是对的；有 N 种原因时，它就是 N 分之一。**

失败信息是产品的一部分，不是日志。用户拿到的若是 "没有可用的定位轨迹" 这种话，他既不能确认

是不是自己弄错了，也无从下手；更糟的是**它常常是错的**—— 同一句概括被套在六种不同的原因上，

其中五种下它都在指向一个不存在的事实。

规则：

1. **一条失败路径有几种原因，就交出几条**，逐条带上是哪个 topic / 哪个字段 / 多少采样。

   界面上并列渲染（`TrackData.errorReasons` → `LogFlightMap` 的列表），不要合成一句。

2. **概括句只许当标题，而且必须由具体的那一条拼出来**（`"这段日志里没有可用的定位轨迹——" + headline`），

   不许另写一句泛化的文案。多条原因时取**最后**一条作标题：候选是按优先级依次试的，

   最后试的那个才是 "把整串试完" 的那一个，它前面几条只是 "为什么跳过了它"。

3. **原因文案只许有一处实现。** 缺 topic 的判据复用 `rule_engine._missing_topics`（规则与绘图

   预设共用，见 §6.5）；provider 里再写一份，两边迟早分叉。

4. **声明期的判据必须真的送到判定的那一侧，并且每次搬家都要有守卫。** `conditions.topics`

   写在 `plot/track.yml`，判定在引擎侧 —— 构建期把这份声明搬进 `facts.track` 时漏过一次，

   于是引擎 "看不到" 闸门，只能退回那句概括。搬家的丢失只有产物看得见，所以

   `check_engine_pyodide.py` 拿 `track.yml` 的声明与产物里的 `facts.track.conditions.topics` 对账。

5. **"缺什么" 要和 "实际有什么" 成对出现。** 只说缺，用户分不清是固件版本不同、还是字段改了名；

   附一句 "这份日志里带经纬度字段的 topic 有：…" 才有对照物。挑对照物要按**字段**而不是 topic 名 ——

   `vehicle_local_position` 这个名字看不出它只有参考原点 `ref_lat/ref_lon`、没有逐点经纬度，

   而那恰恰是答案。**判据里的关键词必须独立成段**（`^` / `.` / `_` 起、`.` / `_` / `$` 止）：

   裸子串 `"lat" in name` 会把 `relative_test_ratio`、`accelerometer_timestamp_relative` 当成纬度，

   于是对照物里列出 `estimator_selector_status`、`sensor_combined`——**比不给对照物更糟**，

   因为它以 "听起来很具体" 的方式把人带偏（实测第一版就是这个错）。同理 "有没有坐标" 只看经纬度：

   高度到处都有（`baro_alt_meter`、`fd_alt`、`mode_req_local_alt` 里的 `alt` 甚至有布尔标志），

   算进来只会淹没答案。

6. **"给不出原因" 本身要报成解析器缺陷**，不许伪装成 "你的数据里没有这项"（同 §6.6 规则 5）。

   否则我们自己的 bug 会被当成用户的数据问题：用户不会反馈，我们也永远不知道。

> 由来（2026-09-18，用户："这段日志里没有可用的定位轨迹 直接告诉用户缺少什么字段，不要这么空洞的提示"）：
> 那句概括只对应六种原因里的一种 —— 日志里没有 GPS 相关的 topic；另外五种是 " 有 topic 但缺
> 坐标字段 "、" 字段改了名 "、" 有采样但全程没拿到 3D 定位（fix_type 一直 < 3）"、" 采样数对不上 "、
> "没有 timestamp 列"。实测本机两份日志（
>
> `efd2ee9d`
>
> 、
>
> `sample`
>
> ）走的正是第一种，
> 但它们在界面上和第五种
>
> **长得一模一样**
>
> 。
> 空洞只是表象，底下还有一层：用户补了一句 "
>
> `conditions.topics`
>
> 里没有
>
> `sensor_gps`
>
> /
> `vehicle_gps_position`
>
> 就会退出，会创建一个 skip reason，把原因发给前端就好了 "——
> 这个机制
>
> **早就有**
>
> ，文案也
>
> **早就只在一个地方生成**
>
> （
>
> `_missing_topics`
>
> ），
> 断的是构建期那一段：
>
> `compileMap`
>
> 只把
>
> `children`
>
> 搬进了
>
> `facts.track`
>
> ，
>
> `conditions`
>
> 留在原地。
> **机制存在 ≠ 机制可达**
>
> ；
>
> `conditions`
>
> 这类 "声明" 在链路上每经过一次搬运，都值得配一道对账的守卫。
> 守住这条的是
>
> `tools/engine/check_engine_pyodide.py`
>
> （对账
>
> `conditions`
>
> 搬运 + 真执行
>
> `np_track()`
> 核返回体契约，并且
>
> **构造两道反向用例**
>
> —— 一道逼出 "声明的 topic 不在日志里"，一道逼出 "字段取不到"，
> 因为回归日志有 GPS，不构造的话失败分支一次都不会被执行，守卫恒绿）与
>
> `test-issue-filer.mjs`
> §[16]（界面那半：失败分支真的填、列表真的渲染、切了日志清空）。§[16] 只留
>
> `tsc`
>
> **看不见**
> 的那几条 —— 第一版把 "类型声明了字段""state 声明了 " 也写成守卫，变异怎么打都不红，
> 因为
>
> `tsc`
>
> 早就拦住了（§6.6 那条 "守卫自己也要被校验"）。

---

### 6.9 CI/CD 流水线与合并门禁

提交 → 合并到主分支的完整流水线：

```
代码提交

&#x20; │

&#x20; ▼

┌─────────────────────────────────────────────┐

│ 第一关：静态检查（必须全绿）                   │

│ python tools/ci/check\_all.py --skip-logs    │

│   · ruff format --check（Python 风格）       │

│   · ruff check（Python lint）                │

│   · build:kb --check（知识库契约与产物一致）    │

│   · check_engine_pyodide（产物是合法 Python）  │

│   · check\_engine\_purity（三处共用源码纯净性）   │

│   · tsc --noEmit（TypeScript 类型检查）       │

│   · test-issue-filer.mjs（报错上报自测）      │

│   · check\_hygiene（校验机制自身卫生）          │

│   · mutate\_guards（守卫自证：每条先红一次）     │

│ · eslint .（Web 侧 ESLint）                  │

└──────────────┬──────────────────────────────┘

&#x20;              │ 全部通过

&#x20;              ▼

┌─────────────────────────────────────────────┐

│ 第二关：单元测试（算子 / CEL 表达式）           │

│   · compare\_baseline.py                     │

│     （6 条冻结日志基线逐字段比对）              │

│   · guard_provider_contract.py（适配器契约测试）        │

│   · px4log\_engine\_runner.py --probe-data      │

│     （数据层结构自检 + 真抽一次 series）        │

│   · lint\_rules.py --strict                  │

│     （字段引用 / 版本错配校验）                 │

└──────────────┬──────────────────────────────┘

&#x20;              │ 全部通过

&#x20;              ▼

┌─────────────────────────────────────────────┐

│ 第三关：冒烟测试（少量 E2E 主干用例）           │

│ · pnpm exec playwright test pages.spec.ts  │

│   （29 个用例：关键页面渲染 + Skill/          │

│    MCP 详情页 + 页面交互功能）                 │

│ · pnpm exec playwright test analyze.spec.ts│

│   （11 个用例：分析入口 + 上传 + 边缘场景）     │

└──────────────┬──────────────────────────────┘

&#x20;              │

&#x20;         ┌────┴────┐

&#x20;         │ 冒烟通过？ │

&#x20;         └────┬────┘

&#x20;      不通过   │   通过

&#x20;        ▼      │    ▼

&#x20;   ❌ 阻断合并   │  ✅ 合并放行

&#x20;                │

&#x20;                ▼

┌─────────────────────────────────────────────┐

│ 第四关：全套 E2E 测试（合并后自动触发）          │

│ · pnpm exec playwright test（全量 40 用例）   │

│ · next build（站点真编译，--stage build）      │

└──────────────┬──────────────────────────────┘

&#x20;              │ 全部通过

&#x20;              ▼

┌─────────────────────────────────────────────┐

│ 第五关：打包部署                              │

│ · EdgeOne Pages 自动部署（Git 分支绑定）       │

└─────────────────────────────────────────────┘
```

**本地一键检查**（开发者提交前运行）：

```bash
\# 仅静态检查 + ESLint（快速，每次提交前跑）

.\tools\check\_all.ps1 -SkipLogs

\# 含冒烟测试（需要 dev server 已在运行）

.\tools\check\_all.ps1 -SkipLogs -WithE2E

\# 全套（含日志类单元测试 + 冒烟 + 编译）

.\tools\check\_all.ps1 -WithE2E -WithBuild
```

**脚本说明**：

| 脚本                                    | 用途                                                      | 调用方式              |
| --------------------------------------- | --------------------------------------------------------- | --------------------- |
| `tools/ci/check_all.ps1`                | 本地一键检查入口：调用 `check_all.py` + ESLint + 可选 E2E | 手动，提交前          |
| `tools/ci/check_all.py`                 | CI 规范入口：静态检查 + 单元测试 + 编译                   | CI workflow 自动调用  |
| `web/package.json` → `lint`             | ESLint 静态分析（`eslint .`）                             | check\_all.ps1 内调用 |
| `web/package.json` → `test:e2e`         | Playwright 全量 E2E（`playwright test`）                  | CI 第四关             |
| `web/package.json` → `test:e2e:smoke`   | Playwright 冒烟（排除日志分析流程）                       | CI 第三关             |
| `web/package.json` → `test:e2e:analyze` | Playwright 日志分析流程专用                               | 本地调试用            |

**E2E 测试覆盖一览**（`web/e2e/`）：

| 文件              | 用例数 | 覆盖                                                                                                                                           |
| ----------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages.spec.ts`   | 29     | 15 个关键页面（首页、指南、技能广场、MCP 目录、个人中心、登录等）+ 8 个 Skill 详情页 + 2 个 MCP 详情页 + 搜索 / 导航交互                       |
| `analyze.spec.ts` | 11     | 日志分析全流程（入口渲染、上传 .ulg、历史记录、上传区域、拖拽提示、关键 UI）+ 边缘场景（非 .ulg 文件、空历史、快速导航、未选提交、扩展名校验） |

**关键门禁规则**：

1. **冒烟不通过 = 阻断合并**：第三关任何失败都阻止 PR 合并。

2. **全套 E2E 失败**：合并后自动跑第四关，失败通知提交者修复。

3. **既有代码警告**：ESLint 当前 0 错误 / 5 警告（均为既存未使用变量），不阻断合并，但新增代码引入的警告需关注。

4. **日志类校验不在云端 CI**：`compare_baseline`、`guard_provider_contract` 等需要真实 `.ulg` 日志的检查仅在本地有日志时运行；云端 CI 全绿**不等于**规则 / 引擎回归过了，改规则 / 引擎后必须在本地跑一次完整检查。

### 6.9.1 `mutate_guards.py` Windows 兼容说明

`mutate_guards.py` 的「某一节丢了编号」守卫在 Windows 控制台（GBK）下会因打印 `\ufffd` 字符触发 `UnicodeEncodeError` 而失败。这是已知的**既存问题**，不影响守卫本身的逻辑正确性（仅在打印报错信息时编码失败），修复方案见该文件注释。在 Windows 上运行 `check_all.py` 时可暂时接受此项失败，其余检查的通过 / 失败判定不变。

---

## 7. 商业模式

**核心原则**：社区内容（Skill）免费引流，确定性高价值服务（日志分析、规则库、API）收费。收费锚点是 "确定性结论 + 规则库 + 数据积累"。

支付方式：**微信支付 + 支付宝**（个人开发阶段可先用虎皮椒 / Payjs 等聚合支付过渡，主体注册后切官方商户号）。

| 层级              | 价格              | 内容                                                                                                                   |
| ----------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 免费版            | ¥0                | Skill 浏览 / 语义搜索 / 下载；每月 5 次日志分析（首发仅 PX4 `.ulg`），仅基础三项检查（振动、EKF、电源），报告保留 7 天 |
| Pro 个人版        | ¥39 / 月          | 无限次分析；16+ 检查规则；PX4 / ArduPilot 双格式；历史报告对比；完整 LLM 中文报告；在线试用额度提升                    |
| 团队版            | ¥199 / 月（5 席） | 团队日志空间、故障知识库沉淀、报告批注协作、私有 Skill                                                                 |
| 企业版 / 私有部署 | 议价              | 白标、批量分析 API、自定义检查规则、SLA；面向飞控厂商、培训机构、检测机构                                              |

其他收入来源：

- **规则市场分成**：社区贡献检查规则 / 故障知识包，按调用量 **70/30 分成**。这是 "壁垒可积累" 的核心机制 —— 作者贡献领域知识，不是 prompt。

- **数据集与行业报告**：脱敏后的飞行故障数据集、年度事故模式报告（面向保险、质检、监管机构）。

- **付费课程 / 专栏**：Skill 编写技巧、PID 调参实战、日志判读案例库，可向 UFA、Flow 等学术项目作者约稿。

---

## 8. 开发路线图（按产品板块切分冲刺）

| 阶段                               | 状态                         | 目标                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 冲刺 1：Skill/MCP 社区网站         | ✅ 已上线                    | 网站基础框架与内容：预制 Skill（8 个种子）+ MCP 专区 + 使用指南；**登录与账号体系（GitHub + 邮箱验证码，微信 / 手机号待企业资质）**；EdgeOne KV 持久化；**社区指标：真实下载 / 获取次数（设备 + IP 每日去重的 KV 事件计数）、1-5 星评分、按下载 / 评分 / 更新排序、热门排行榜**；关键词搜索（客户端 Fuse.js）。语义搜索（BGE 端侧 embedding）待补。详情页：头部元信息、复制提示词 / 安装命令、评分与获取入口、版本 / 许可证 / 更新时间。 |
| 冲刺 2：日志分析（核心收费锚点）   | ✅ 核心已上线（.bin 待排期） | **确定性日志诊断引擎 + 所有用户免费试用**。PX4 `.ulg`：32 条检查经验覆盖 16 个维度，六条真实日志冻结基线回归；四层架构（pyulog 解析 → rule\_engine/operators → 规则匹配 → LLM 按 GJB-841 组装输出中文报告）。**ArduPilot&#x20;**`.bin`**&#x20;待排期**（pymavlink + ardupilot-mcp 检查套件，同样打包进 Pyodide）。多日志趋势对比与误报率精细校准待后续迭代。                                                                             |
| 冲刺 3：会员与社区商业化           | ⏳ 待启动                    | **会员 / 付费体系**（免费 / Pro / 团队，微信支付 + 支付宝），在线试用（不跳转就能跑）；规则 / 故障知识包贡献与 **70/30 分成**；Skill 组合编排；LLM 自动实测评分；语义搜索；**微信 / 手机号登录（取得企业资质后）**。                                                                                                                                                                                                                     |
| 冲刺 4：轻量服务器 → 平台 MCP 服务 | ⏳ 待启动                    | **先解决承载，再对外分发**。见下方分步说明。                                                                                                                                                                                                                                                                                                                                                                                             |

**冲刺 4 的三步顺序（不可颠倒）：**

1. **采购腾讯云轻量服务器**（前置依赖 ——MCP 是长连接，边缘 Functions 承载不了）：迁关系型数据库（SQLite + sqlite-vec 或 PostgreSQL，支撑复杂统计 / 团队空间 / 向量检索）、部署独立 FastAPI + Redis 日志解析服务（大文件与批量 API 下沉），并为后续支付 / 订单等有状态服务提供常驻环境。届时把 `engine/*.py` 包成可 `import` 的 `nextpilot_engine`（parsers /models/rules 三层，规则仍从 `knowledge/` 加载，不另存一份），供服务端与 MCP 复用；ArduPilot `.bin` 适配器也加在这一层。

2. **平台 MCP 服务上线**（依赖第 1 步）：对外提供 `search_skills` / `get_skill` / `analyze_findings` / `explain_finding` / `submit_skill`；检索走数据库向量列，解析走已下沉的 FastAPI，鉴权复用 KV/DB 里的用户与配额。

3. **企业侧**：私有部署、脱敏故障数据集对外输出。

> 冲刺边界按 "可独立上线的产品板块" 划分，取代旧版按周（第 1/2/3-4 周）的切分；各冲刺内部仍可小步发布。

### 冷启动清单（与开发并行）

1. 手工整理 8-10 个高质量种子 Skill（优先 3.4 中有论文 / 开源背书的），填全示例输入输出、适用平台、实测效果；保持每周新增 2-3 个。

2. 收集 10-20 个真实 PX4 `.ulg` 与 ArduPilot `.bin` 日志（公开炸机日志、自飞、社区征集），建规则回归集，校准误报率目标 < 10%。

3. 跑通 "选择日志 → 浏览器本地解析 → findings / 故障树 → DeepSeek 中文 GJB-841 报告" 闭环。

4. 在知乎、PX4 / ArduPilot 中文社区发布真实日志判读实战帖引流。

### 提速取舍（明确不做的事）

- 日志分析在线试用、多日志趋势对比等体验增强需求，在与会员体系同步推进。

- **不租用独立日志服务器**：解析全部放在浏览器（Pyodide + Web Worker），零解析算力成本；等大文件 / 批量 API 需求出现后再下沉。

- **当前零服务器**：持久化用 EdgeOne 内置 KV / Blob，无需 CVM / 数据库实例 / 外部对象存储。KV 最终一致、写后不回读；配额用唯一键 + 前缀计数；定期导出 JSON 备份。

- 解析引擎与规则**复用开源**（PX4 侧：官方 pyulog + 借鉴 PX4 ULog Analyzer 的 `diagnose_flight` 与 Flight Review 阈值 / 阶段经验；ArduPilot 侧：fork ardupilot-mcp 检查套件），自有精力集中在规则校准、故障知识库、LLM 解释层和前端体验。

---

## 9. 风险与边界

- **安全**：致动类能力永不进托管服务，只做开源 Skill + 强制三重门禁（见第 5 节）。

- **误报责任**：所有报告标注 "辅助判读，不替代人工排查"；每条 finding 必须可溯源到具体字段、阈值和官方文档链接，不允许 LLM 输出无出处的数值结论。

- **隐私**：飞行日志含 GPS 轨迹和作业信息；端侧解析架构下**原始日志始终留在用户设备、不上传服务器**，页面需明确告知；上送服务端的仅为结构化 findings，对其中坐标等敏感字段做脱敏；远期服务端解析上线后，再提供坐标模糊化选项并执行原始文件 30 天自动删除。

- **版权**：只收录 MIT / Apache 等宽松许可或已取得授权的项目；prompt 类内容要求贡献者声明原创。

- **成本**：LLM 只在解释层调用，使用 DeepSeek（GLM / Qwen 备选）+ prompt 缓存 + 报告缓存，单份报告成本 ≤ ¥0.1。
