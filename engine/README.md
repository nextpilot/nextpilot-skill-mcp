# 共享日志引擎（monorepo 预留位）

这里是**阶段二（轻量服务器）**服务端解析引擎的预留目录，目前没有可运行代码。

## 现在日志经验在哪

飞控日志分析的全部人工经验（阈值 TOML、故障库 YAML、检查 Python、LLM 提示词）
**统一维护在仓库根 [`knowledge/px4/`](../../knowledge/px4/)**，由
`web/scripts/build-knowledge.mjs` 生成 Web 端（浏览器 Pyodide + 边缘函数）产物。
浏览器端引擎的实现落在 `web/workers/`（生成物）与 `knowledge/px4/*.py`（源）。

本目录**不再是**规则的存放地——原先放在 `src/nextpilot_engine/rules/px4-fault-kb.yaml`
的故障库已迁至 `knowledge/px4/px4-fault-kb.yaml`。

## 这个目录将来做什么

把同一份 `knowledge/` Python 源包成可 `import` 的 `nextpilot_engine` 包，供：

- 阶段二 FastAPI 解析服务（大文件 / 批量 API 下沉到常驻容器）
- 平台 MCP Server 的 `analyze_findings` / 远期 `analyze_log`
- ArduPilot `.bin` 等新格式的解析适配器

建议结构（阶段二落地）：

- `src/nextpilot_engine/parsers/`：`.ulg`、`.bin` 等日志解析适配器
- `src/nextpilot_engine/models/`：统一的 FlightLog 与 finding 模型
- `src/nextpilot_engine/rules/`：从 `knowledge/px4/` 加载并执行检查（薄封装）
- `tests/`：真实日志与规则回归测试（当前先用 `scripts/calibrate/`）
