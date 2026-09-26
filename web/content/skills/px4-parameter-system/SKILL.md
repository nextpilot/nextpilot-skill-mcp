---
name: px4-parameter-system
description: "定位某个行为该调哪个参数，排查改了不生效、找不到、重启丢失，以及新增自定义参数的正确姿势。当用户提到 param、参数、param set、param save、SYS_AUTOSTART、改了没生效、重启后参数丢失、导入导出参数时使用。"
license: "BSD-3-Clause"
compatibility: "PX4 v1.14 参数名为准；v1.13 及更早部分命名与单位有差异（尤其 BAT_* 系列）。不适用 ArduPilot"
metadata:
  display_name: "PX4 参数体系与调参"
  summary: "提供行为到参数的定位路径与关键参数速查，覆盖改了不生效、param find 找不到、重启丢失、自定义参数这几类问题"
  icon: "⚙️"
  category: "toolchain"
  platforms: "PX4"
  capability: "config"
  models: "DeepSeek, GPT-4o-mini, GLM"
  tags: "param, 参数, SYS_AUTOSTART, 配置"
  clients: "Claude, Cursor, Claude Code"
  author: "开源社区"
  seed_rating: "4.0"
  seed_downloads: "0"
  featured: "false"
---

# PX4 参数体系与调参

> **关于本目录下的其它文件**
> `README.md` 与 `CHANGELOG.md` 是给人类维护者看的，**执行任务时不需要读取**。
> 需要更多场景时读 [EXAMPLE.md](./EXAMPLE.md)，需要详细字段/参数字典时读 `references/`。

## 解决什么问题

知道要改什么行为，不知道对应哪个参数；改了重启就丢；`param find` 找不到；换了机架参数混乱。参数是 PX4 的运行时配置层，几乎所有可调项都在这里。

## 核心逻辑

**`param set` 只在内存生效，必须跟 `param save` 才持久化。** 这是新人第一大坑。

调试顺序：

```text
param diff        先看改动了哪些，避免盲调
param dump 备份   改之前留一份
param set / save  改完必须 save
param diff        复飞前再核对一次
```

## 关键参数速查

| 用途          | 参数                                                                         |
| ------------- | ---------------------------------------------------------------------------- |
| 机型          | `SYS_AUTOSTART`（决定启动哪些模块）、`SYS_AUTOCONFIG`                        |
| 姿态 / 速率环 | `MC_ROLL_P`、`MC_ROLLRATE_P/I/D`、`MC_PITCHRATE_*`、`MC_YAWRATE_*`           |
| 位置 / 速度环 | `MPC_XY_P`、`MPC_Z_P`、`MPC_ACC_HOR`、`MPC_TILTMAX_AIR`                      |
| 估计器        | `EKF2_*`、`EKF2_MAG_TYPE`、`EKF2_GPS_*`                                      |
| 失效保护      | `COM_RCL_ACT`、`COM_LOW_BAT_ACT`、`NAV_DLL_ACT`、`GF_*`、`RTL_*`             |
| 电池          | `BAT_*`、`BAT_LOW_THR`、`BAT_CRIT_THR`、`BAT_N_CELLS`                        |
| 传感器校准    | `CAL_GYRO0_ID`、`CAL_ACC0_ID`、`CAL_MAG0_ID`（多实例按 ID 区分，不是按序号） |
| 日志          | `SDLOG_MODE`、`SDLOG_PROFILE`（自定义主题不进日志查这里）                    |
| 输出          | `PWM_MAIN_*`、`DSHOT_*`                                                      |

## 输入示例

```text
「悬停时机头缓慢右偏」→ 该查哪个参数？
```

## 输出示例

```json
{
  "check": ["CAL_MAG0_ID 是否与当前磁罗盘匹配", "vehicle_magnetometer 是否有干扰", "MC_YAWRATE_I 是否过小"],
  "params": ["CAL_MAG0_ID", "MC_YAWRATE_I", "EKF2_MAG_TYPE"],
  "steps": ["param diff 确认改过什么", "param set 后必须 param save", "需重启的参数记下来重启后复验"],
  "note": "偏航漂移多数是磁罗盘干扰，不是 yaw PID 的问题——先排除再调参"
}
```

## 使用建议

- 给参数建议时必须说明**单位**（rad/s 还是 deg/s，ms 还是 us）。
- 参数名长度上限约 16 字符，超了会被截断导致 `param_find` 失败。
- 换机架时 `SYS_AUTOSTART` 要配合 `SYS_AUTOCONFIG=1` 重启，否则旧参数残留。
- 模块内监听 `parameter_update` 主题或用 `ModuleParams::updateParams()` 自动刷新。
- 地面站连接时会同步参数，注意别被覆盖。

---

更多完整场景见 [EXAMPLE.md](./EXAMPLE.md)。
