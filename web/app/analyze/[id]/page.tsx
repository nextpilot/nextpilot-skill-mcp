import type { Metadata } from "next";
import { AnalyzeResultClient } from "./AnalyzeResultClient";

export const metadata: Metadata = {
  title: "分析结果 · NextPilot Skill",
  description: "PX4 飞行日志确定性分析结果：检查结论、数据图表、事件消息、飞控参数与 AI 中文解读。",
};

export default function AnalyzeResultPage() {
  return <AnalyzeResultClient />;
}