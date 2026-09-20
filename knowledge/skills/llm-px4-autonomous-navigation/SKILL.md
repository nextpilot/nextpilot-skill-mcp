---
name: llm-px4-autonomous-navigation
description: "LLM 作为 drone operator，结合视觉观察与飞控状态推理下一步动作，经安全约束层过滤后下发给 PX4（MAVSDK/ROS 2）。当用户要让 LLM 或 VLM 充当无人机操作员做自主导航决策，并经安全约束层下发给 PX4 时使用。触发词：自主导航、drone operator、LLM 决策、VLM 导航、MAVSDK、ROS 2。"
license: "学术参考"
metadata:
  display_name: "LLM + PX4 自主导航决策"
  icon: "🧭"
  category: "decision"
  platforms: "PX4"
  models: "GPT-4o, Qwen2-VL, DeepSeek-VL"
  tags: "自主导航, drone operator, MAVSDK, ROS2"
  clients: "Claude, GPT-4o, 本地模型"
  seed_rating: "4.3"
  seed_downloads: "640"
  featured: "true"
  paper_url: "https://arxiv.org/abs/2306.12963"
---

# LLM + PX4 自主导航决策

## 何时使用

当用户要让 LLM 或 VLM 充当无人机操作员做自主导航决策，并经安全约束层下发给 PX4 时使用。

- 自主导航
- drone operator
- LLM 决策
- VLM 导航
- MAVSDK
- ROS 2

## 背景

未知环境中没有现成航线，需要根据当前画面和飞控状态实时决定"前进、绕行、悬停观察、返航"。代表性工作是把 LLM/GPT-4V 当作无人机操作员，做语义级决策，底层仍由传统控制环保证姿态稳定。

## 工作流

```text
每 N 秒：相机图像 + 飞控状态（位置、电量、模式）
   → VLM 生成观察（observe）
   → LLM 在受限动作集合中选择动作并给理由（think/act）
   → 安全约束层校验（地理围栏、电量、速度上限）
   → MAVSDK / ROS 2 下发速度 / 航点指令
```

## 输入示例

```text
图像（前方有树丛障碍）+ 状态：battery=62%，mode=OFFBOARD，距目标 80m
```

## 输出示例

```json
{
  "observation": "前方约 15 米有树木遮挡，右侧开阔",
  "action": "move_velocity",
  "params": { "vx": 0, "vy": 1.5, "vz": 0 },
  "reason": "向右绕行树丛后再恢复前进"
}
```

## 注意事项

- **动作集合必须封闭**（白名单 + JSON schema 校验），拒绝任何自由文本指令。
- 安全约束层独立于 LLM：围栏、最低电量、限速、失联 RTL，任何一条不满足即拒绝执行。
- 先在 PX4 SITL（Gazebo）里充分回归，再考虑真机，真机首飞保留飞行员随时接管。

## 参考

- 论文：https://arxiv.org/abs/2306.12963
