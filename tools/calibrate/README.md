# 日志规则校准脚本

冲刺 2 用 10-20 个真实 `.ulg` 校准阈值（CLAUDE.md 4.3 / 8）的本地工具。
它**直接跑 knowledge/ulog/px4 下的 Python 源与 TOML 阈值**，与浏览器端 Pyodide
执行的是同一份规则源码、同一份数值——改完 `knowledge/` 无需 Node 构建即可回归。

- `run_checks_locally.py <file.ulg> ...`：输出完整 findings JSON（规则文档见
  [knowledge/ulog/px4/px4-ulog-rules.md](../../knowledge/ulog/px4/px4-ulog-rules.md)）。
- `run_checks_locally.py --probe-data <file.ulg> ...`：校验数据层三个 API
  （`np_manifest` / `np_log_info` / `np_series`）的结构、JSON 合法性（NaN→null）
  与降采样点数。
- `probe_stats.py <file.ulg> ...`：dump 三个关键消息的原始指标分布，用于定阈值。
- `inspect_fields.py <file.ulg>`：打印 `vehicle_imu_status / estimator_status /
  battery_status / sensor_imu` 的真实字段名（不同 PX4 版本字段差异很大）。

依赖：`pip install pyulog numpy`；Python **3.11+**（读 TOML 用标准库 `tomllib`）。

`../engine/tests/logs/` 存放校准用真实日志（含 GPS 轨迹，勿提交大文件 / 涉密日志）。
