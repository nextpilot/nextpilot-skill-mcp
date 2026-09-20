---
name: ArduPilot 日志诊断 MCP
description: furkanisikay 开源的 ArduPilot .bin 诊断 MCP 服务，16 项检查、每条发现附阈值来源与官方文档链接，40 个真实炸机日志验证
icon: "📡"
clients: ["Claude", "Cursor", "Claude Code"]
platforms: ["ArduPilot"]
models: ["GPT-4o-mini", "Claude", "DeepSeek"]
tools: ["analyze_log", "list_checks", "explain_finding"]
readOnly: true
tags: ["bin", "日志分析", "ArduPilot", "开源", "MIT"]
license: "MIT"
rating: 4.8
downloads: 1340
featured: true
---

<!--
维护者说明（不渲染到站点）：
版本 / 传输方式 / 上游仓库等机器可读字段不写在这里，见同目录的 server.json
（MCP Registry 规范）与 CHANGELOG.md（版本历史的唯一真源）。这份 README 只管
给人看的部分：frontmatter 的卡片展示字段与下面的正文。
-->

# ArduPilot 日志诊断 MCP

ArduPilot `.bin` 日志字段繁多，人工排查耗时。该 MCP 服务内置 16 项确定性检查（振动、EKF、电源、GPS、电机平衡、参数审计等），返回按严重度排序的 findings，LLM 只负责解释，所有数值判断均由规则引擎完成，防止模型编造数字。

## 与本平台的关系

**工具链入口收录**（MIT 许可，可合规借鉴）：

- `analyze_log` 返回严重度排序 findings 的设计，是平台规则检查层的直接模板；
- `docs/SOURCES.md` 中每个阈值附来源与官方文档链接的做法，平台全面沿用；
- 平台冲刺 3 接入 ArduPilot `.bin` 时 fork 其检查套件并打包进 Pyodide。

## 输入示例

```text
一个 ArduPilot .bin 日志
```

## 输出示例

```json
{
  "severity": "critical",
  "rule": "vibration",
  "field": "VIBE.X",
  "value": 38.2,
  "threshold": 30,
  "docUrl": "https://ardupilot.org/dev/docs/common-measuring-vibration.html"
}
```

## 相关项目

rmeadomavic 的实时连接 MCP（MAVLink 读状态 / 改参数 / 诊断无法解锁）默认只读，致动需显式开启，是平台安全门禁设计的参照。
