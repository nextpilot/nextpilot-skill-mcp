---
name: px4-ulog-analyzer
description: "开源 PX4 .ulg 日志分析器：确定性 pyulog 解析 + 规则检查 + LLM 只做解释。本平台端侧日志分析的首发 fork 底座。当用户提供 PX4 .ulg 飞行日志，要定位炸机或异常飞行的原因（振动、EKF、电源、GPS）时使用。触发词：ULog、.ulg、日志分析、炸机分析、PX4 日志、EKF 创新。"
metadata:
  display_name: "PX4 ULog 日志分析（工具链入口）"
  icon: "📊"
  category: "toolchain"
  platforms: "PX4"
  models: "DeepSeek, GPT-4o-mini, GLM"
  tags: "MCP, ULog, 日志分析, PX4, 开源"
  clients: "Claude, Cursor, Claude Code"
  seed_rating: "4.6"
  seed_downloads: "720"
  featured: "true"
  source_url: "https://github.com/robotto-xyz"
---

# PX4 ULog 日志分析（工具链入口）

## 何时使用

当用户提供 PX4 .ulg 飞行日志，要定位炸机或异常飞行的原因（振动、EKF、电源、GPS）时使用。

- ULog
- .ulg
- 日志分析
- 炸机分析
- PX4 日志
- EKF 创新

## 背景

炸机 / 异常飞行后，从 PX4 `.ulg` 日志中快速定位振动、EKF 创新、电源、GPS 等问题，并给出带官方文档链接的中文解释。

## 与本平台的关系

这是**工具链入口收录**，指向开源项目本体；日志分析能力本身是平台内置服务，不作为可下载 Skill 分发。其架构正是平台三层架构的参照：

```text
pyulog 确定性解析 → 插件化检查器（输出严重度排序 findings）→ LLM 翻译为自然语言
```

## 输入示例

```text
一个 PX4 .ulg 飞行日志文件
```

## 输出示例

```json
{
  "severity": "warning",
  "rule": "ekf_innovation",
  "field": "estimator_status.innovation_check_flags",
  "title": "EKF 创新检验位置位",
  "docUrl": "https://docs.px4.io/"
}
```

## 注意事项

- 平台冲刺 1 直接 fork 其解析与检查器逻辑，改造为 Pyodide 包在浏览器端运行。
- 每条 finding 必须保留字段名、阈值和官方文档链接，LLM 只解释、不改数值。

## 参考

- 来源：https://github.com/robotto-xyz
