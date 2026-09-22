# PX4 ULog 日志分析（工具链入口）

> 开源 PX4 .ulg 日志分析器：确定性 pyulog 解析 + 规则检查 + LLM 只做解释。本平台端侧日志分析的首发 fork 底座

| 项         | 值                             |
| ---------- | ------------------------------ |
| 分类       | 系统与工具链                   |
| 适用平台   | PX4                            |
| 依赖模型   | DeepSeek, GPT-4o-mini, GLM     |
| 适用客户端 | Claude, Cursor, Claude Code    |
| 来源       | https://github.com/robotto-xyz |

## 解决什么问题

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

## 使用建议

- 平台冲刺 1 直接 fork 其解析与检查器逻辑，改造为 Pyodide 包在浏览器端运行。
- 每条 finding 必须保留字段名、阈值和官方文档链接，LLM 只解释、不改数值。

---

本页内容来自本 Skill 的 `README.md`，AI 可读的指令原文见 `SKILL.md`，版本历史见 `CHANGELOG.md`。
