---
name: px4-uorb-messaging
description: "新增、发布、订阅 uORB 主题，排查消息不通、频率为 0、多实例错乱、自定义主题进不了日志等问题。当用户提到 uORB、发布订阅、消息总线、orb_advertise、orb_subscribe、vehicle_attitude、uorb top、主题没数据时使用。"
license: "BSD-3-Clause"
compatibility: "PX4 v1.14（推荐用 C++ API uORB::Publication/Subscription）；v1.13 及更早为 orb_advertise/orb_subscribe，排查逻辑通用"
metadata:
  display_name: "PX4 uORB 消息发布订阅"
  summary: "讲清 uORB 主题的定义、发布、订阅与多实例区分，覆盖频率为 0、消息不通、自定义主题不进日志这几类高频坑"
  icon: "🔌"
  category: "toolchain"
  platforms: "PX4"
  capability: "read-only"
  models: "DeepSeek, GPT-4o-mini, GLM"
  tags: "uORB, 消息总线, 发布订阅, 模块开发"
  clients: "Claude, Cursor, Claude Code"
  author: "开源社区"
  seed_rating: "4.0"
  seed_downloads: "0"
  featured: "false"
---

# PX4 uORB 消息发布订阅

> **关于本目录下的其它文件**
> `README.md` 与 `CHANGELOG.md` 是给人类维护者看的，**执行任务时不需要读取**。
> 需要更多场景时读 [EXAMPLE.md](./EXAMPLE.md)，需要详细字段/参数字典时读 `references/`。

## 解决什么问题

模块之间数据传不过去、`uorb top` 里主题频率为 0、多传感器实例数据串了、自定义主题日志里抓不到。uORB 是 PX4 所有模块交换数据的唯一通道，这类问题几乎都出在发布/订阅的几个固定环节上。

## 核心逻辑

uORB 是异步发布-订阅总线，模块之间**不直接调用彼此**，只认主题名和消息结构体。

| 环节 | 要点 |
|---|---|
| 定义 | `msg/<name>.msg`，必须含 `timestamp` 字段，加入 `msg/CMakeLists.txt` |
| 发布 | 结构体 `{}` 零初始化 → 填 `timestamp` → publish。**至少发布一次**，否则主题节点不存在 |
| 订阅 | 用 `update(&data)`（= 检查 + 拷贝），不要只调 `updated()` 忘了 `copy()` |
| 多实例 | 按 `device_id` 区分，不是按数组下标 |
| 入日志 | 检查 `SDLOG_PROFILE` 是否覆盖该主题 |

## 输入示例

```cpp
// 新增主题后，订阅端永远拿不到数据
uORB::Subscription _att_sub{ORB_ID(vehicle_attitude)};
if (_att_sub.updated()) { /* 忘了 copy，下次 update 会把数据丢掉 */ }
```

## 输出示例

```cpp
// 1. 零初始化 + 填时间戳 + 发布
my_sensor_data_s data{};
data.timestamp = hrt_absolute_time();
_my_sensor_pub.publish(data);

// 2. 订阅用 update()（检查并拷贝）
vehicle_attitude_s att{};
if (_att_sub.update(&att)) { /* 用 att */ }

// 3. 排查命令
//   uorb top            看频率是否为 0
//   uorb_status         看主题的实例数与发布者数
//   listener <topic>    打印内容
```

## 使用建议

- 频率为 0 先查**发布端是否真的跑到了 publish 那行**，再查订阅端。
- `listener` 无输出多半是从未 publish 过，主题节点没创建。
- 工作队列回调里只做轻量处理，耗时操作丢给独立任务。
- 多实例传感器按 `device_id` 过滤，不要按实例序号假设顺序。
- 主题改了要重新编译生成头文件，否则改的不生效。

---

更多完整场景见 [EXAMPLE.md](./EXAMPLE.md)。
