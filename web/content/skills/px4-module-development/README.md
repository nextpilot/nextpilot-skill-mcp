# PX4 模块开发脚手架

> 给人看的设计说明。给 AI 看的指令在 [SKILL.md](./SKILL.md)，评分等运营数据在站点上。

## 做什么

从零搭一个 PX4 模块：CMake 怎么写、该用工作队列还是独立任务、怎么注册到启动脚本、参数怎么接进来，以及编译不过 / 起不来 / 起来不执行的排查。

核心判断：**新模块优先用工作队列，只有需要阻塞等待（串口读、网络）时才用独立任务。**

## 不做什么

| 不管 | 归谁 |
|---|---|
| 模块内部怎么用 uORB 收发数据 | [`px4-uorb-messaging`](../px4-uorb-messaging/) |
| 模块的参数怎么声明和刷新 | [`px4-parameter-system`](../px4-parameter-system/) |
| 驱动层（SPI/I2C 总线时序） | 另一类 Skill |
| NextPilot 的完整适配 | SKILL.md 里只给了差异清单，不做完整教程 |

## 为什么把 `capability` 标成 `config`

虽然写的是代码，但这条链路的终点是把固件刷到飞行器上。标 `read-only` 会让人以为这是纯咨询。

## 这条 Skill 里最有价值的部分

不是 CMake 模板——模板到处都有。是**工作队列的选型表**和**三个沉默失败**：

```
rate_ctrl（角速率控制，最高频）
  ↓
nav_and_controllers
  ↓
hp_default
  ↓
lp_default
IMU/SPI 驱动走 INS0..3 / SPI0..
```

选错优先级的表现很隐蔽：代码逻辑全对，编译通过，模块正常启动——就是周期性掉帧。因为它在低优先级队列里排在高负载模块后面。

三个沉默失败之所以单独强调，是因为**它们都不会报错**：

| 现象 | 原因 | 报错吗 |
|---|---|---|
| `start` 报命令不存在 | CMake 未加入构建 / 板级配置未启用 | 报了，但信息没指向真正原因 |
| 模块起来了但不执行 | 忘了 `ScheduleOnInterval()` | **不报错** |
| 退出后重启失败 | 没调 `exit_and_cleanup()` | **不报错** |

第二条最阴——`start` 返回成功，`top` 里进程在跑，`Run()` 一次都不执行。没人提醒的话，能查一整天。

## NextPilot 差异（重要）

这套内容以 PX4 (CMake + NuttX) 为准。NextPilot (RT-Thread) 的差异写在 SKILL.md 最后一条，因为**照搬 PX4 教程会直接扑空**：

| PX4 | NextPilot |
|---|---|
| CMake | `scons` + `SConscript` |
| 板级 .px4board / Kconfig | `Kconfig` + `menuconfig` |
| 启动脚本注册 | RT-Thread 自动初始化宏 |
| `src/modules/<name>/` | `apps/` 下按类别分目录（`controller` / `estimator` / `telemetry`） |

这不是"稍微改改"，是两套完全不同的构建体系。

## 适用版本

PX4 v1.14。`px4_add_module()` 的写法在 v1.13 之后稳定，标记 `MAIN` 的方式没有变化。

## 维护

改 SKILL.md 的**正文**等于改 AI 的行为，需要走 PR review。改 README 不影响 Skill 表现，可以随手改。
