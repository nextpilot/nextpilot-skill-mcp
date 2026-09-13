# 规则知识库编写规范（工程师经验 → Agent 方法论）

> 状态：规范定稿于冲刺 2；故障知识库首版 10 条见
> [engine/src/nextpilot_engine/rules/px4-fault-kb.yaml](../../engine/src/nextpilot_engine/rules/px4-fault-kb.yaml)。
> 引擎按本规范接入是冲刺 3 的工作（见文末"落地差距"）。

## 0. 核心原则

**不要让 Agent"学习/记住"工程师的经验。** 把经验拆成四类可执行产物，Agent 只负责检索、组装、翻译，不凭空脑补：

| 经验类型 | 交付形式 | 执行者 |
| --- | --- | --- |
| ① 阈值类（可量化） | 代码常量 / 规则 JSON，输出标签 | **确定性代码判断**，不进 prompt |
| ② 故障树（多条件耦合的隐性经验） | 结构化故障知识库 YAML | **代码匹配检索**，Agent 只用命中的条目 |
| ③ 推理逻辑（工程师的思考方式） | System Prompt | Agent 遵守 |
| ④ 边界 / 禁忌（什么情况下不能下结论） | 前置过滤代码标签 + Prompt + 后置校验 | **代码先拦**，Prompt 兜底 |

与平台既有铁律一致（CLAUDE.md 4.1）：**确定性引擎是唯一真相来源，LLM 只翻译和引用，从不做数值判断或决策。**

### 0.1 系统四层（只有最上层是 AI）

单纯一段 Skill/Prompt 做不了真实日志分析——外场 ULog 翻车的 Demo 都死在把四层工作丢给模型。
真实系统分四层，第 2 层承载约 70% 的工程师经验：

| 层 | 职责（全部非 AI，除第 4 层） | 我们的载体 |
| --- | --- | --- |
| ① 二进制解析层 | `.ulg` 解析：topic、元数据、固件/机型、起止时间、重启与截断识别；输出时间序列结构化数据 | Pyodide + pyulog（[ulog-worker.ts](../../web/workers/ulog-worker.ts)） |
| ② 信号预处理与特征提取层 | 滑窗 RMS（选窗口、剔除起飞冲击/大机动）、瞬时 vs 持续压降、GPS EPH 统计、**飞行阶段识别**、事件识别、**数据质量识别**（日志过短/中途重启/topic 缺失）、阈值与时序逻辑 → 异常标签集合 + 统计摘要 + 关键片段 | [ulog-check-script.ts](../../web/workers/ulog-check-script.ts)（冲刺 3 大改，见第 6 节） |
| ③ 知识库检索层 | 按标签 + 阶段 + 排除条件匹配故障库，只取命中条目；数据质量差直接跳过 LLM | 冲刺 3：引擎内 YAML 匹配器（确定性代码，非生成式 AI） |
| ④ AI 生成层 | 只做"整理成 GJB-841 规范文档"：不解析、不算信号、不判时序、不发明故障 | [functions/api/explain.js](../../web/functions/api/explain.js) + DeepSeek |

要点：AI 看不到几万行采样点，只收到第 2 层的**标签 + 统计摘要 + 关键片段**。
窗口选错、没剔除机动就算错 RMS，后面模型再强也错——这层预处理逻辑就是壁垒，prompt 被抄走也抄不走它。
时序因果（如"先电压跌落、后振动增大"）必须在第 2 层识别成标签/事件顺序，不靠模型读摘要猜先后。

数据质量标签（第 2 层 guard 输出，命中则第 3 层可直接短路）：
`insufficient_data`（时长 <60s）、`data_quality_warning:log_truncated`、`restart_detected`、
`topic_missing:{name}`、`collision_detected`、`temperature_change_large`、`wind_strong`。

## 1. 阈值类经验：规则 JSON

数值判断全部在预处理代码里完成，输出稳定标签。Agent 看不到原始公式，只收标签：

```json
{
  "rule_id": "imu_vibration_check",
  "condition": "imu_rms > 0.08",
  "tag": "high_vibration",
  "risk": "medium_high"
}
```

- 禁止把"当 RMS 大于 0.08 就要注意振动"写进 prompt——大模型会记错、忽略数值。
- 每条规则必须有官方来源或校准记录；阈值现状见 [px4-ulog-rules.md](px4-ulog-rules.md)。
- 一条规则输出：`tag`、严重度、命中字段、实测值、阈值、官方文档链接（沿用现有 Finding 结构）。

## 2. 故障树经验：故障知识库 YAML

工程师最核心的隐性经验是**多条件耦合 + 排查优先级 + 禁忌**，不允许写成散文交给模型自由发挥。

### 2.1 条目 schema

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `fault_id` | ✓ | 稳定编号（F001…），勿复用、勿改义 |
| `fault_tag` | ✓ | 主故障标签，与阈值规则的 `tag` 对齐 |
| `trigger_tags` | ✓ | 命中所需异常标签（当前语义：任一命中即候选） |
| `flight_phase` | ✓ | 适用阶段；`all` 不限。阶段枚举：`takeoff` `hover` `maneuver` `vtol_transition` `fw_cruise` `cruise` `all` |
| `exclude_tags` | ✓ | 出现这些标签时整条失效（如碰撞、强风、温度剧变）；无则空数组 |
| `possible_root_cause` | ✓ | 根因列表，**已按排查优先级排序，LLM 不得自行重排** |
| `troubleshooting_steps` | ✓ | 排查步骤，遵循"由简到繁：机械→装配→传感器→参数→算法" |
| `risk_level` | ✓ | 高 / 中高 / 中 / 低 |
| `note` | ✗ | 禁忌与边界，LLM 必须原样遵守（如"禁止直接大幅下调 PID"） |

### 2.2 匹配规则（代码执行，不交给 LLM）

1. 阈值规则产出标签集合 + 引擎推断飞行阶段（armed/nav_state 区间，见上游 `list_value_changes` 经验）；
2. 候选条目：`trigger_tags` 与标签集合相交，且 `flight_phase` 匹配；
3. 排除：`exclude_tags` 任一命中则丢弃（如 F001 在 `collision_detected` 下失效）；
4. **只把命中的条目注入 Agent 上下文**，禁止传入全量知识库；
5. 无命中 = 无匹配故障模式，Agent 不得使用内部记忆补根因。

环境因素（如 F010 大风）也是知识库条目：命中后把异常归为外部扰动，阻止硬件/参数误判。

## 3. 推理逻辑经验：System Prompt（思考范式）

告诉 Agent"工程师怎么思考"，不是灌输事实。冲刺 3 以下面 8 条替换/增强现有 explain prompt：

```text
你是资深飞控测试工程师，分析飞行日志请严格遵守下面思考范式：
1. 先区分现象：哪些是硬件问题，哪些是参数配置问题，哪些是环境扰动（风、GPS干扰）。
2. 排查顺序由简到繁：硬件机械检查 → 安装装配 → 传感器状态 → 飞控参数 → 算法逻辑。
3. 如果同时出现多个异常，识别主故障与次生故障，不要把次生现象当成根因。
4. VTOL机型必须区分故障发生在：多旋翼模式 / 转换过渡阶段 / 固定翼巡航阶段。
5. 证据不足时禁止编造根因；证据不足输出：【现有数据不足以确定根因，建议复现试验，同步增加机载记录】。
6. 输出格式遵循GJB-841故障归零规范：故障现象描述 → 数据依据 → 初步原因分析 → 排查与验证建议。
7. 禁止输出会带来炸机风险的参数修改建议；给出参数建议时要标注安全边界。
8. 所有分析结论必须基于【本次提供的日志统计摘要】和【本次匹配的故障知识库】，禁止调用你内部记忆中未提供的故障模式。
```

GJB-841 输出四段式：**故障现象描述 → 数据依据 → 初步原因分析 → 排查与验证建议**。
报告结尾继续保留固定免责声明（CLAUDE.md 9）："本报告为辅助判读，不替代人工排查。"

## 4. 边界 / 禁忌经验：前置标签 + Prompt + 后置校验

"什么情况下不能下结论"不能指望模型自觉，必须代码先拦：

| 边界 | 确定性 guard | 标签 | 效果 |
| --- | --- | --- | --- |
| 日志过短，样本不足 | 飞行时长 < 60s | `insufficient_data` | 不做 PID/振动根源诊断，直接输出数据不足 |
| 发生过碰撞 | 碰撞事件/冲击检测 | `collision_detected` | 振动类条目（F001/F008）失效，优先排查撞击损伤 |
| GPS 信号差 | satellites/eph 越限 | `gps_eph_high` | 姿态/位置相关结论降级并标注可信度 |
| 温度剧变 | IMU 温度变化率越限 | `temperature_change_large` | IMU 漂移（F005）失效，优先排除温度 |
| 强风 | 风速/姿态-指令残差代理指标 | `wind_strong` | F003/F006 归因环境扰动，禁止改 PID |

实现要求：guard 与阈值规则同在 Python 引擎执行，标签进统计摘要；Prompt 中再约束一次；
服务端后置校验发现 LLM 引用了未注入的故障模式或数值，整段打回（冲刺 3 可先做关键词/编号白名单校验）。

## 5. Agent 输入报文契约（实际传给 LLM 的全部上下文）

```text
【System Prompt】
{第 3 节思考范式 + GJB-841 输出约束}

【本次日志统计摘要（来自代码预处理）】
飞行时长：212s
机型：VTOL
固件版本：PX4-1.14
飞行阶段：悬停
标签：["high_vibration","hover"]

【本次匹配的故障知识库片段（检索得到，不是全量库）】
{匹配到的 YAML 条目，如 F001}

要求：
依据上面全部信息输出GJB-841格式故障分析。
不允许引入未提供的故障模式。证据不足直接说明。
```

约束：

- 报文中**只有**：System Prompt、统计摘要（含标签/阶段/机型）、命中的知识库条目；
- 原始数值由 Finding 的 evidence 携带（字段、实测值、阈值、文档链接），保持现状；
- 报文里没有的故障模式，输出中出现即视为违规（后置校验对象）；
- 无 findings 时不调用 LLM、不消耗配额（现边缘函数已实现）。

## 6. 落地差距（当前实现 → 本规范，冲刺 3）

当前冲刺 2 的 [functions/api/explain.js](../../web/functions/api/explain.js) 只把 findings JSON 交给 LLM，
prompt 无工程师思考范式，引擎也不产出标签/阶段/故障树匹配。冲刺 3 改造项：

1. **引擎产出标签**：[web/workers/ulog-check-script.ts](../../web/workers/ulog-check-script.ts) 每条规则补稳定 `tag`；
   新增飞行阶段推断（参考 robotto armed/nav_state 边沿法）；新增 5 个 guard 标签。
2. **故障树匹配器（Python，随引擎打包）**：加载 [px4-fault-kb.yaml](../../engine/src/nextpilot_engine/rules/px4-fault-kb.yaml)，
   按 2.2 节规则输出命中条目，挂到结果 JSON。Pyodide 内可用极简 YAML 解析（条目结构固定）或构建期转 JSON 打包。
3. **报文改造**：边缘函数 explain 按第 5 节契约组装，System Prompt 换成第 3 节 8 条 + 四段式。
4. **输出后置校验**：finding/故障编号白名单校验，违规重生成或降级为纯条目翻译。
5. **阈值来源收敛**：工程师给的 `imu_rms > 0.08g` 等新阈值与现有 Flight Review 色带阈值（4.905/9.81 m/s²）
   在 10-20 个真实日志校准中统一（同一指标不同量纲：g ↔ m/s²，0.08g ≈ 0.785 m/s²，注意 RMS 与均值口径差异）。
6. 标签字典（首版）：
   `high_vibration gps_jump gps_eph_high vtol_convert_attitude_over battery_voltage_drop imu_bias_drift attitude_overshoot rc_lost motor_output_unbalance low_airspeed wind_strong`
   ＋ guard 标签 `insufficient_data collision_detected temperature_change_large`。
