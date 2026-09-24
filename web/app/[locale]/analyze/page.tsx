import type { Metadata } from "next";
import { AnalyzeEntryClient } from "./AnalyzeEntryClient";

export const metadata: Metadata = {
    title: "飞控日志分析 · NextPilot Skill",
    description:
        "在浏览器本地解析 PX4 .ulg 与 ArduPilot .bin 日志：确定性检查（振动 / IMU 削波、EKF 创新检验、电源、GPS、电机平衡等）与故障知识库匹配，AI 仅负责解释。",
};

export default function AnalyzePage() {
    return <AnalyzeEntryClient />;
}
