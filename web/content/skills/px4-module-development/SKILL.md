---
name: px4-module-development
description: "从零建一个 PX4 模块——CMake、工作队列还是独立任务、启动脚本注册、参数接入，以及编译不过或起不来的排查。当用户提到 PX4 模块、新建模块、ScheduledWorkItem、work_queue、px4_add_module、CMakeLists、启动脚本、模块 start 报命令不存在时使用。"
license: "BSD-3-Clause"
compatibility: "PX4 v1.14 源码树 + CMake 构建（px4_add_module）；不适用 NextPilot（scons + Kconfig + RT-Thread 体系）"
metadata:
  display_name: "PX4 模块开发脚手架"
  summary: "从零搭一个 PX4 模块，覆盖 CMake、工作队列与独立任务的选型、启动脚本注册、参数接入，以及编译不过、命令不存在、起来不跑的排查"
  icon: "🧱"
  category: "toolchain"
  platforms: "PX4"
  capability: "config"
  models: "DeepSeek, GPT-4o-mini, GLM"
  tags: "模块开发, CMake, work_queue, 启动脚本"
  clients: "Claude, Cursor, Claude Code"
  author: "开源社区"
  seed_rating: "4.0"
  seed_downloads: "0"
  featured: "false"
---

# PX4 模块开发脚手架

> **关于本目录下的其它文件**
> `README.md` 与 `CHANGELOG.md` 是给人类维护者看的，**执行任务时不需要读取**。
> 需要更多场景时读 [EXAMPLE.md](./EXAMPLE.md)，需要详细字段/参数字典时读 `references/`。

## 解决什么问题

想加一个周期性执行的任务，不知道该建工作队列还是独立任务、CMake 怎么写、为什么 `start` 报命令不存在、为什么模块不自动启动。

## 核心逻辑

**新模块优先用工作队列**，只有需要阻塞等待（串口读、网络）时才用独立任务。

```text
src/modules/<name>/
├── CMakeLists.txt    px4_add_module(MODULE modules__<name> MAIN <name> ...)
├── <name>.cpp        ModuleBase + ScheduledWorkItem
└── params.yaml       可选，模块参数
```

启动脚本按载具类型选：`rc.mc_apps`（多旋翼）/ `rc.fw_apps`（固定翼）/ `rc.vtol_apps` / `rc.sensors`。加一行 `<name> start`。

工作队列选型：`rate_ctrl`（角速率控制，最高频）> `nav_and_controllers` > `hp_default` > `lp_default`；IMU/SPI 驱动用 `INS0..3` / `SPI0..`。

## 输入示例

```text
要加一个 100Hz 读姿态并输出计算结果的模块，该怎么搭？
```

## 输出示例

```cpp
// init() 里调度，否则 Run() 一次都不跑
bool MyModule::init()
{
    ScheduleOnInterval(10000);   // 微秒 → 100Hz
    return true;
}

void MyModule::Run()
{
    if (should_exit()) { ScheduleClear(); exit_and_cleanup(); return; }
    updateParams();                       // 同步参数变更

    vehicle_attitude_s att{};
    if (_att_sub.update(&att)) {
        my_output_s out{};
        out.timestamp = hrt_absolute_time();   // 必填
        _out_pub.publish(out);
    }
}
```

## 使用建议

- `start` 报命令不存在 = CMake 未加入构建，或该板级配置未启用此模块。
- 模块起来了但不执行 = 忘了 `ScheduleOnInterval()` / `ScheduleNow()`。
- 退出后重启失败 = 没调 `exit_and_cleanup()`。
- 高频模块掉帧 = 队列优先级不够，换更高优先级队列。
- **不要在工作队列里做阻塞操作**，那是独立任务的活。
- **NextPilot 差异**：用 `scons` + `SConscript`（不是 CMake）、`Kconfig` + `menuconfig` 裁剪、RT-Thread 自动初始化机制（不是启动脚本），模块在 `apps/` 下按类别分目录（`controller` / `estimator` / `telemetry`）。照搬 PX4 教程会扑空。

---

更多完整场景见 [EXAMPLE.md](./EXAMPLE.md)。
