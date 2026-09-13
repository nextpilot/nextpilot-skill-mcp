# 共享日志引擎

预留浏览器端与服务端共用的纯 Python 解析、领域模型和确定性检查规则。

建议目录：

- `src/nextpilot_engine/parsers/`：`.ulg`、`.bin` 等日志解析器
- `src/nextpilot_engine/models/`：统一的 FlightLog 与 finding 模型
- `src/nextpilot_engine/rules/`：可组合的确定性检查规则
- `tests/`：真实日志与规则回归测试
