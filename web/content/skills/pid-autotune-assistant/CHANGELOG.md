# 版本历史

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 只有 **SKILL.md 正文的改动**才影响版本号。改 README / EXAMPLE / CHANGELOG 不改 AI 行为，不 bump。

## 1.1.0 — 2026-09-25

### Added

- 由内向外的调参顺序（角速率环 → 姿态环 → 速度环 → 位置环）与每一步的验证字段
- 症状 → 参数对照表，含反向条目（"禁止做什么"）
- 先排物理问题再调增益的前置约束（`gyro_clipping` 必须为 0，振动超标时一切基于 IMU 的结论都不可信）
- 单轴抖动必须先查物理（桨、电机、减振），拒绝盲目调增益
- 设定值 vs 实际值（`vehicle_rates_setpoint` vs `vehicle_attitude.rollspeed`）的日志验证方法
- 新版时间常数参数（`MC_ROLL_TC`）与旧版纯增益的版本差异说明
- 平台差异说明：调参顺序与症状判断与固件无关，增益名以 PX4 为准，其他固件请查各自文档
- `EXAMPLE.md` 场景库与 `evals/cases.yaml` 回归用例

## 1.0.0 — 2026-08-15

- 首次收录
