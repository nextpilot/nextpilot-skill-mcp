# 版本历史

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 只有 **SKILL.md 正文的改动**才影响版本号。改 README / EXAMPLE / CHANGELOG 不改 AI 行为，不 bump。

## 1.4.0 — 2026-09-25

### Added

- 九层诊断顺序（logged_message → vehicle_status → 振动 → EKF → 电源 → GPS → 执行器 → 姿态 → 零偏），按「会让后续数据失效的程度」排序，不允许模型自由发挥
- 症状 → 主题.字段 速查表
- 「每条结论回指到字段 + 阈值 + 出处」的硬约束；读不到即「无法判定」，不猜
- v1.13/v1.14 零偏主题拆分（`estimator_status.states[]` → `estimator_sensor_bias`）的版本差异说明
- `scripts/quick_check.py`：快速体检，输出 JSON。**只给数，不给结论**——阈值随固件/机架变，改一处比重写 prompt 可靠
- `scripts/make_fixture.py` + `assets/*.ulg`：三份合成 fixture（振动链式失效 / 健康 / 单节欠压）
- `evals/e2e.yaml`：确定性端到端回归，不需要 API key；`evals/cases.yaml` 覆盖拒答与误触发
- `EXAMPLE.md` 场景库

### Fixed

- **电芯欠压检查从未生效过**：pyulog 把数组字段摊平成 `cell_voltage[0]`…`cell_voltage[9]`，而代码查的是裸名 `cell_voltage`，恒为 False。不报错、不崩溃，只是安静地什么都不做——写的人以为在检查，用户以为被检查过了
- **未使用的电芯槽位被当成最差电芯**：PX4 恒定写 10 元素数组、只填前 `ncells` 个，剩下是 `0.0`。原样 `min()` 会让一节不存在的电池成为"最差"。现在按 plausibility 过滤，并标注有效电芯数
- **健康日志末尾的正常压降被误报**：warning 阈值 3.5V → 3.4V。6S 负载下掉到 3.5V 完全正常，把正常说成告警，报警很快就没人看了
- 单位自洽性：若数值疑似 mV（老固件 / 第三方 CAN 电池），明确说"结论不可信"，而不是照算

### Changed

- SKILL.md 显式声明 `assets/*.ulg` 是测试夹具，既不是真实飞行数据，也不得当分析样本

## 1.3.0 — 2026-09-10

- 新增故障知识库确定性匹配（根因按排查优先级排序）
- EKF 硬故障位按位语义分级，消除视觉位误报

## 1.2.0 — 2026-08-22

- 补充电池剩余电量、CPU 负载与 GPS 健康检查

## 1.0.0 — 2026-05-30

- 首次收录（pyulog 解析 + 振动/EKF/电源三项检查）
