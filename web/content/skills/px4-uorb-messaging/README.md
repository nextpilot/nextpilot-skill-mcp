# PX4 uORB 消息发布订阅

> 给人看的设计说明。给 AI 看的指令在 [SKILL.md](./SKILL.md)，评分等运营数据在站点上。

## 做什么

覆盖 uORB 主题的**定义、发布、订阅、多实例**四个环节，重点解决"消息传不过去"这一类问题。PX4 里所有模块交换数据都走 uORB，这类问题是模块开发的第一道坎，而且原因高度集中——基本就那几处。

## 不做什么

| 不管 | 归谁 |
|---|---|
| 某个字段代表什么物理含义 | [`px4-ulog-analyzer`](../px4-ulog-analyzer/) |
| 怎么建一个完整模块 | [`px4-module-development`](../px4-module-development/) |
| MAVLink 与外部通信 | 不在范围内 |
| ArduPilot 的消息总线 | 机制不同，另写一份 |

**只讲机制，不讲语义。** 不回答"该订阅哪个主题"（那是任务相关），只回答"订阅了为什么拿不到"。

## 为什么这么组织

按**发布端到订阅端的数据流**排排查顺序，而不是按 API 字母序。理由：`uorb top` 看到频率为 0 时，有 bug 的地方八成在发布端；从订阅端开始查是绝大多数人的直觉，也是绝大多数人的时间黑洞。

排查顺序写死在 SKILL.md 里，不允许模型自由发挥——诊断顺序一旦随机，同样的问题会给出不同的排查路径，用户没法复现。

## 适用版本

SKILL.md 给的是 **v1.14+ 的新 C++ API**（`uORB::Publication` / `uORB::Subscription`）。

v1.13 及更早是老 C API（`orb_advertise` / `orb_subscribe`），形态不同但**排查逻辑完全通用**——同样是"至少 publish 一次"、"update vs updated"、`device_id` 区分实例。拿到老代码时按这套逻辑判断即可。

**NextPilot 差异**：RT-Thread 版的 uORB 在 `pkgs/lib/uORB/`（不是 README 里写的 `pkgs/uORB/`，那个路径已过时，是第一天必踩的坑）。

## 已知边界

- `startup/` 之外的模块如果从未跑到 publish 那一行，主题节点根本不会创建，`listener` 输出为空——这不是 bug，是设计如此。
- 工作队列回调里的耗时操作会让整个队列上所有模块一起延迟。SKILL.md 里反复强调这点，因为它是"代码逻辑全对但系统变慢"最常见的成因。

## 维护

改 SKILL.md 的**正文**等于改 AI 的行为，需要走 PR review。改 README 不影响 Skill 表现，可以随手改。
