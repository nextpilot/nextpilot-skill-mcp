# 日志规则校准脚本

冲刺 2 用 10-20 个真实 `.ulg` 校准阈值（CLAUDE.md 4.3 / 8）的本地工具，
直接从 [web/workers/ulog-check-script.ts](../../web/workers/ulog-check-script.ts)
抽取 Python 模板执行，保证与浏览器端 Pyodide 跑的是**同一份规则源码**。

- `run_checks_locally.py <file.ulg> ...`：输出完整 findings JSON（规则文档见
  [docs/rules/px4-ulog-rules.md](../../docs/rules/px4-ulog-rules.md)）。
- `run_checks_locally.py --probe-data <file.ulg> ...`：校验数据层三个 API
  （`np_manifest` / `np_log_info` / `np_series`）的结构、JSON 合法性（NaN→null）
  与降采样点数。
- `probe_stats.py <file.ulg> ...`：dump 三个关键消息的原始指标分布，用于定阈值。
- `inspect_fields.py <file.ulg>`：打印 `vehicle_imu_status / estimator_status /
  battery_status / sensor_imu` 的真实字段名（不同 PX4 版本字段差异很大）。

依赖：`pip install pyulog numpy`。

`../engine/tests/logs/` 存放校准用真实日志（含 GPS 轨迹，勿提交大文件 / 涉密日志）。
