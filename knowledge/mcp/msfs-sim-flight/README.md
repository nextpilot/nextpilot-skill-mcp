---
name: MSFS 模拟飞行 MCP 控制
description: 通过 MCP 服务让 LLM 直接读取微软模拟飞行仪表、操纵舵面、执行起降程序，用于训练飞行语言智能体与自动化测试
icon: "🛩️"
clients: ["Claude", "Cursor", "Claude Code"]
platforms: ["仿真", "MSFS"]
models: ["Claude", "GPT-4o", "DeepSeek-V3"]
tools: ["get_instruments", "set_controls", "run_checklist"]
transport: stdio
readOnly: false
tags: ["MSFS", "模拟飞行", "仿真", "致动"]
rating: 4.2
downloads: 540
featured: true
upstream_status: "pending"
---

<!--
维护者说明（不渲染到站点）：

上游未确认，暂缺 server.json。收录时没有记 sourceUrl，而 get_instruments /
set_controls / run_checklist 这三个工具名在公开可查的几个 MSFS MCP 项目里都对不上，
所以在核实之前不填 manifest —— 填了就是编造。

upstream_status: "pending" 是给 check-mcp-spec.mjs 看的：它据此放过"缺 server.json"，
但每次校验都会在输出里把这条列出来，不会悄悄溜过去。核实后补上 server.json
并删掉 frontmatter 里的 upstream_status 与 transport 即转为正常条目。

frontmatter 里的 transport 只是 pending 期间的过渡值：一旦有了 server.json，
传输方式以 server.json 的 packages[].transport 为唯一真源，这里再写一份就会被守卫判成双真源。
-->

# MSFS 模拟飞行 MCP 控制

在接触真机前，需要一个安全、可无限重试的环境验证"语言 → 飞行动作"链路。MSFS MCP 服务把模拟飞行的仪表数据和舵面操纵封装成 MCP 工具，LLM 可以读姿态、速度、航向，操作油门 / 副翼 / 升降舵，并执行检查单式起降。

## 核心逻辑

```text
MSFS（SimConnect SDK）
   ↕ 仪表变量 / 控制事件
MCP 服务（工具：get_instruments、set_controls、run_checklist）
   ↕
LLM 客户端（Claude / Cursor 等）
```

## 输入示例

```text
"读取当前仪表，判断是否满足起飞条件，满足则执行起飞检查单并起飞。"
```

## 输出示例

```json
{
  "instruments": { "ias_kt": 0, "rpm": 2100, "flaps": "TO" },
  "actions": ["release_parking_brake", "advance_throttle", "rotate_at_55kt"],
  "checklist_result": "complete"
}
```

## 使用建议

- 仿真是致动类能力的安全沙箱：语言控机逻辑先在 MSFS / SITL 中验证，再考虑真实载具。
- 收录时注明许可协议，并在描述中明确"仅限仿真"。**本条目尚未补齐许可协议。**
