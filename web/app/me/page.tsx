import type { Metadata } from "next";
import { MeClient } from "./MeClient";

export const metadata: Metadata = {
  title: "我的 · NextPilot Skill",
  description: "账号信息、今日 AI 解读额度与云端分析报告。",
};

export default function MePage() {
  return <MeClient />;
}
