---
name: vlm-scene-understanding
description: "让无人机用语言描述相机看到的场景，支持\"东边田里有没有人\"这类自然语言提问，基于 Qwen-VL / LLaVA。当用户想让无人机用自然语言描述现场，或回答开放式视觉问题（如田里有没有人）时使用。触发词：视觉语言模型、VLM、场景描述、视觉问答、Qwen-VL、LLaVA。"
metadata:
  display_name: "视觉语言场景理解（VLM）"
  icon: "👁️"
  category: "perception"
  platforms: "通用"
  models: "Qwen2-VL, LLaVA-1.6, GPT-4o"
  tags: "VLM, 场景描述, 视觉问答"
  clients: "Claude, ChatGPT, Gemini"
  seed_rating: "4.4"
  seed_downloads: "760"
  featured: "false"
---

# 视觉语言场景理解（VLM）

## 何时使用

当用户想让无人机用自然语言描述现场，或回答开放式视觉问题（如田里有没有人）时使用。

- 视觉语言模型
- VLM
- 场景描述
- 视觉问答
- Qwen-VL
- LLaVA

## 背景

目标检测只能回答"有没有预设类别"，VLM（视觉语言模型）能回答开放式问题：描述现场环境、判断异常情况、回答飞手的自然语言提问。

## 工作流

周期性将关键帧（每隔 N 秒或由触发条件选取）送入多模态大模型，配合固定 system prompt 约束输出为简短、面向任务的中文描述，并要求在不确定时明确说明。

## 输入示例

```text
图像 + 提问："这片农田里有没有人员或异常情况？用一句话回答。"
```

## 输出示例

```text
"画面中央田埂附近有 1 人弯腰作业，东侧停放 1 辆白色皮卡，未见烟雾或明显异常。"
```

## 注意事项

- 不要逐帧调用 VLM（慢且贵），先用轻量检测器触发，再让 VLM 对关键帧做语义解释。
- prompt 中强制"只描述可见内容、不推测"，降低幻觉。
- 边缘部署可量化后跑 Qwen2-VL-2B；地面站或云端可用更大模型。
