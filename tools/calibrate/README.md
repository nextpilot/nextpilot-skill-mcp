# 日志规则校准脚本

用真实 `.ulg` 校准阈值（CLAUDE.md 4.3 / 8）的本地工具。
它**直接跑 engine/ 下的 Python 引擎与 knowledge/px4/rules/*.yaml 中的规则**，
与浏览器端 Pyodide 执行的是同一份规则源码、同一套逻辑——改完 `knowledge/` 无需 Node 构建即可回归。

- `run_checks_locally.py <file.ulg> ...`：输出完整 findings JSON（规则清单见站内
  `/guide/rule-catalogue`，构建期生成在 `web/.generated/guide/rule-catalogue.mdx`，不入库）。
- `run_checks_locally.py --probe-data <file.ulg> ...`：校验数据层三个 API
  （`np_manifest` / `np_log_info` / `np_series`）的结构、JSON 合法性（NaN→null）
  与降采样点数。
- `probe_stats.py <file.ulg> ...`：dump 三个关键消息的原始指标分布，用于定阈值。
- `inspect_fields.py <file.ulg>`：打印 `vehicle_imu_status / estimator_status /
  battery_status / sensor_imu` 的真实字段名（不同 PX4 版本字段差异很大）。

## 冻结基线与等价比对（规则重构时必用）

- `dump_baseline.py`：把 `tools/calibrate/logs/*.ulg` 的**完整引擎输出**冻结到 `baseline/<slug>.json`。
  这是"一条经验一个 YAML"重构前的唯一真相，重构规则时不得改动（除非单独提交并说明理由）。
- `compare_baseline.py`：重新跑同一份日志，与冻结基线**逐字段深度比较**
  （findings 的 id/ruleId/severity/tag/title/evidence/docUrl/suggestion 与 stats/tags/guards/
  phases/checks*/matchedFaults）。退出码 0/1，任何差异（含 finding 的**顺序变化**，id 是按顺序分配的）
  都算回归。重构每一步都必须 `compare_baseline.py` 全绿。

依赖：`pip install pyulog numpy`；Python **3.11+**。

`logs/` 存放校准用真实日志（含 GPS 轨迹，勿提交大文件 / 涉密日志）。

## 在哪儿跑（云端 CI 覆盖不到）

本目录的校验都要 `logs/` 下的真实 `.ulg`，而它们含 GPS 轨迹、按隐私规则不入库（见
`.gitignore`），**云端 CI 的 checkout 里没有这些文件，那一组必然被跳过**。所以这部分只在
开发机跑，已挂在 `.githooks/pre-push` 上：

```bash
git config core.hooksPath .githooks   # 每台机器做一次
```

统一入口是 `python tools/ci/check_all.py`（本机有日志时自动带上本目录这组校验；
校验清单与分组、以及「CI 全绿不等于回归过了」的原因，见该脚本的模块文档）。
