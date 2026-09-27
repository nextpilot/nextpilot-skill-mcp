---
name: px4-ulog-analyzer
description: "按字段解析 PX4 .ulg 日志，定位炸机与异常飞行根因（振动、EKF、电源、GPS），每条结论回指字段与阈值；本平台端侧日志分析的开源 fork 底座。当用户提供 .ulg 日志、要排查炸机、分析 ULog 或看 EKF 创新时使用。"
license: "BSD-3-Clause"
compatibility: "PX4 v1.14 字段表为准；解析 .ulg 需 pyulog（pip install pyulog）。v1.13 零偏字段绑定不同"
metadata:
  display_name: "PX4 ULog 日志字段诊断"
  summary: "按字段解析 .ulg 日志，定位振动、EKF 创新、电源跌落、GPS、电机不平衡、零偏漂移等问题，每条结论回指到具体字段与阈值"
  icon: "📊"
  category: "toolchain"
  platforms: "PX4"
  capability: "read-only"
  models: "DeepSeek, GPT-4o-mini, GLM"
  tags: "ULog, pyulog, 日志分析, 炸机排查, EKF"
  clients: "Claude, Cursor, Claude Code"
  author: "开源社区"
  seed_rating: "4.6"
  seed_downloads: "720"
  featured: "true"
  repo_url: "https://github.com/robotto-xyz"
---

# PX4 ULog 日志字段诊断

> **关于本目录下的其它文件**
> `README.md` 与 `CHANGELOG.md` 是给人类维护者看的，**执行任务时不需要读取**。
> `assets/*.ulg` 是回归测试用的**合成日志**，既不是用户的飞行数据，
> 也不要当用户没给日志时拿来当分析样本——那是测试夹具，不是参考知识。
> 需要更多场景时读 [EXAMPLE.md](./EXAMPLE.md)，需要详细字段/参数字典时读 `references/`。

## 解决什么问题

炸机或异常飞行后，面对一份 `.ulg` 日志不知道该看哪个字段。本 Skill 把症状映射到具体主题字段，按确定顺序逐层排查，避免一上来扎进曲线里凭手感猜。

## 核心逻辑

**先从字段拿确定的数，再解释发生了什么。** 诊断顺序固定：

1. `logged_message` —— 飞控自己说了什么（最高优先级）
2. `vehicle_status` —— 是否触发 failsafe、nav_state 是否抖动
3. 振动 / 削波 —— 数据不可信的话，后面全白看
4. EKF（`innovation_check_flags`）—— 估计是否正常
5. 电源 —— 电压跌落能同时解释 GPS 丢星、重启、失控
6. GPS —— 定位质量
7. 执行器输出 —— 是否饱和、是否不平衡
8. 姿态跟踪 —— 控制效果
9. 零偏 —— 长时间漂移

## 字段速查（按症状）

| 症状        | 主题.字段                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------- |
| 振动 / 削波 | `vehicle_imu_status.accel_vibration_metric`、`gyro_clipping[]`（>0 即量程打满，比振动指标更严重） |
| EKF 创新    | `estimator_status.innovation_check_flags`（按位解析）、`health_flags`、`timeout_flags`            |
| 电源跌落    | `battery_status.cell_voltage[]`（找最差电芯）、`voltage_v`、`system_power.voltage5v_v`            |
| GPS 健康    | `vehicle_gps_position.fix_type`（<3 不可用）、`satellites_used`、`eph`、`jamming_indicator`       |
| 电机平衡    | `actuator_outputs.output[]` / `actuator_motors.control[]`（按固件版本选）                         |
| 零偏漂移    | `estimator_sensor_bias.gyro_bias[3]`、`accel_bias[3]`                                             |
| 姿态振荡    | `vehicle_attitude.q[4]` vs `vehicle_attitude_setpoint.q_d[]`、`vehicle_rates_setpoint`            |
| 失效保护    | `vehicle_status.nav_state`（频繁跳变即模式抖动）、`failsafe`、`rc_signal_lost`                    |
| 空速 / VTOL | `airspeed_validated.true_airspeed_m_s`、`vtol_vehicle_status.vtol_in_trans_mode`                  |
| 机载消息    | `logged_message.severity`（0 emergency → 7 debug）、`message`                                     |

**版本差异**：较新固件把零偏从 `estimator_status.states[]` 拆到独立的 `estimator_sensor_bias`；解析时按固件版本切换字段绑定，否则老日志读不到。

## 输入示例

```text
一份 PX4 .ulg 日志；或一句症状描述，如「悬停机头持续右偏」
```

## 输出示例

```json
{
  "severity": "warning",
  "rule": "ekf_innovation",
  "field": "estimator_status.innovation_check_flags",
  "title": "EKF 创新检验位置位",
  "value": 12,
  "threshold": 0,
  "docUrl": "https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"
}
```

## 先跑脚本，再谈结论

拿到的数值必须是**从日志里读出来的**，不是从印象里猜出来的：

```bash
python3 scripts/quick_check.py flight.ulg
```

输出是 JSON，含振动、削波、EKF 创新位、最差电芯、GPS 定位质量。阈值写在脚本顶部的 `THRESHOLDS` 里，**换机架要改**（5 寸穿越机与 1m 轴距六轴的振动基线差一个量级）。

没装 pyulog 时脚本会返回 `{"status": "无法判定"}`——这时候就**如实说无法判定**，不要凭印象编数值。

## 开源来源与平台关系

- 来源：<https://github.com/robotto-xyz>。「确定性 pyulog 解析 → 插件化检查器输出严重度排序 findings → LLM 只做解释」这套三层架构出自该项目。
- 本平台直接 fork 其解析与检查器逻辑，改造为 Pyodide 包在浏览器端运行。日志分析能力本身是平台内置服务，这份 Skill 是它**可下载、可离线使用**的形态。

## 使用建议

- 每条结论必须回指到**主题 + 字段 + 阈值 + 文档出处**，不可凭曲线形状下判断。
- 数值判断交给规则引擎，模型只做解释，不改写任何数值。
- 阈值按机架实测标定（5 寸穿越机与 1m 轴距六轴的振动基线差一个量级），规则里写明适用固件与机架。
- 区分「飞控问题」与「操作 / 环境问题」——对照 `manual_control_setpoint` 看是不是打杆打出来的。
- 读不到某字段时明确返回「无法判定」，不猜测数值。

---

更多完整场景见 [EXAMPLE.md](./EXAMPLE.md)。
