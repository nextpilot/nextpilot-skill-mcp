# 自然语言飞行任务规划

> 把"去东边那块田巡一圈再回来"这类口语指令自动分解为带航点和动作的结构化飞行计划，供飞控执行前确认

| 项 | 值 |
| --- | --- |
| 分类 | 决策与规划 |
| 适用平台 | PX4, ArduPilot, 通用 |
| 依赖模型 | DeepSeek-V3, Qwen2.5, GPT-4o |
| 适用客户端 | Claude, ChatGPT, Cursor |

## 解决什么问题

飞手不想逐条画航点。给定作业区域和一句自然语言目标，LLM 输出结构化任务草案（航点、航高、相机动作、返航条件），由人确认后下发，LLM 不直接控机。

## System Prompt 要点

```text
你是多旋翼任务规划助手。把用户目标分解为 JSON 任务：
{ waypoints:[{lat,lng,alt_m,action}], camera:{...}, abort_conditions:[...] }
规则：
1. 信息不足（位置、边界、高度）时必须提问，禁止编造坐标；
2. 首航点必须在起飞点可视范围内，末航点为返航；
3. 输出可执行 JSON，外加一段不超过 50 字的中文摘要。
```

## 输入示例

```text
"起飞点在这，去东边那块大概 20 亩的田，绕边界巡一圈，高度 25 米，每 50 米拍一张，看完回家。"
```

## 输出示例

```json
{
  "waypoints": [
    { "idx": 1, "alt_m": 25, "action": "goto", "note": "田块东北角起点" },
    { "idx": 2, "alt_m": 25, "action": "survey_boundary", "interval_m": 50 }
  ],
  "camera": { "mode": "photo", "interval_m": 50 },
  "abort_conditions": ["battery < 30%", "link_loss > 10s"]
}
```

## 使用建议

- **LLM 只规划、不致动**；任务必须经飞手确认，并在仿真中先验证。
- 涉及坐标的部分让 LLM 输出相对方位 + 由地图组件补坐标，避免幻觉经纬度。

---

本页内容来自本 Skill 的 `README.md`，AI 可读的指令原文见 `SKILL.md`，版本历史见 `CHANGELOG.md`。
