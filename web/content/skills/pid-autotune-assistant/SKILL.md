---
name: pid-autotune-assistant
description: "按内环到外环顺序调多旋翼 PID 增益，据阶跃响应判断过冲、振荡、漂移成因并给出下一组参数；适配 PX4 / ArduPilot / Betaflight。当用户提到调参、PID 整定、过冲、抖动、MC_ROLLRATE、速率环、姿态环时使用。"
license: "BSD-3-Clause"
compatibility: "PX4 v1.14 多旋翼控制器；较新固件为时间常数参数（MC_ROLL_TC），旧固件为纯增益。验证需 pyulog 读日志"
metadata:
  display_name: "PX4 多旋翼 PID 调参"
  summary: "按内环到外环的顺序调多旋翼增益，根据日志阶跃响应判断过冲/振荡/漂移成因，指出该改哪个参数"
  icon: "🎛️"
  category: "control"
  platforms: "PX4, ArduPilot, Betaflight, 通用"
  capability: "config"
  models: "DeepSeek, GPT-4o-mini, GLM"
  tags: "PID, 调参, 姿态环, 速率环, 振荡"
  clients: "Claude, Cursor, Claude Code"
  author: "开源社区"
  seed_rating: "4.1"
  seed_downloads: "1520"
  featured: "false"
---

# PX4 多旋翼 PID 调参

> **关于本目录下的其它文件**
> `README.md` 与 `CHANGELOG.md` 是给人类维护者看的，**执行任务时不需要读取**。
> 需要更多场景时读 [EXAMPLE.md](./EXAMPLE.md)，需要详细字段/参数字典时读 `references/`。

## 解决什么问题

飞行抖动、打杆过冲、悬停漂移，却不知道该动哪个增益。本 Skill 给出由内向外的调参顺序和「症状 → 参数」对照，并要求用日志验证而不是凭手感。

## 核心逻辑

**先排物理问题，再由内向外调增益。**

振动超标、零漂未校准、桨不平衡时调 PID 只是在补偿故障——调得越"稳"，隐患越大。确认 `vehicle_imu_status.gyro_clipping[]` 无计数后再开始。

控制层级与顺序：

```text
位置环 MPC_XY_P / MPC_Z_P
  ↓
速度环 MPC_*_VEL_*
  ↓
姿态环 MC_ROLL_P / MC_PITCH_P / MC_YAW_P
  ↓
角速率环 MC_ROLLRATE_P/I/D  ← 先调这一层
```

内环没调好，外环怎么调都稳不下来。每次只改一个参数，改后复飞。

## 症状 → 参数对照

| 症状 | 先试 |
|---|---|
| 起飞就高频抖动 | 降 `MC_*RATE_D`；调 `IMU_DGYRO_CUTOFF` |
| 打杆过冲、回弹 | 加 `MC_*RATE_D` |
| 悬停缓慢漂移 | 加 `MC_*RATE_I`（先确认零偏已校准） |
| 松杆回中缓慢或过冲 | 降 `MC_*RATE_I`（积分饱和） |
| 姿态跟不上设定值 | 先查角速率环 P，再看姿态环 P |
| 偏航持续漂移 | 查 `vehicle_magnetometer`，不是调 yaw PID |
| 大油门段手感变软 | 调 `THR_MDL_FAC` |
| 只有某个轴抖 | 查该轴电机/桨/机臂，不是调参 |
| 高频"嗡嗡响" | 用 `IMU_GYRO_NF_FREQ` 陷波对准机架频率，不是一味降 D |

## 输入示例

```json
{
  "symptom": "起飞后机身高频抖动",
  "axis": "roll",
  "current": { "P": 0.15, "I": 0.08, "D": 0.003 },
  "log": { "gyro_clipping": 0, "accel_vibration_metric": 0.09 }
}
```

## 输出示例

```json
{
  "next": { "P": 0.15, "I": 0.08, "D": 0.0021 },
  "reason": "振动指标 0.09 在合理范围且无削波，排除机械问题；抖动集中在大油门段，判断为 D 偏大放大噪声，下调 30% 并同步收紧 D 项低通。",
  "verify": ["对比 vehicle_rates_setpoint.roll 与 vehicle_attitude.rollspeed", "复飞确认抖动消失且响应未变肉"],
  "safety": ["每次只改一个轴一个变量", "改动前 param dump 备份", "小风无干扰条件下复飞"]
}
```

## 平台差异

调参顺序与症状判断（内环到外环、过冲降 P 升 D）与固件无关，这部分通用。

**增益名以 PX4 为准**（`MC_ROLLRATE_P` 等）。ArduPilot / Betaflight 的对应参数名请查各自文档——本 Skill 不猜测其他固件的参数名，猜错的代价是用户照着改炸机。

## 使用建议

- 用**设定值 vs 实际值**验证，不凭手感：过冲加 D、持续滞后加 P、稳态偏差加 I。
- 输出必须经飞手确认后才写入参数；`param set` 后要 `param save` 才持久化。
- 降增益能压住抖动但会牺牲带宽——那是掩盖问题，不是解决问题。
- 分轴调，不要同比放大所有增益。
- 较新固件用 `MC_ROLL_TC` 等时间常数参数，旧固件是纯 PID 增益，先确认版本。

---

更多完整场景见 [EXAMPLE.md](./EXAMPLE.md)。
