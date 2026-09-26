import type { Metadata } from "next";
import { makePageMeta } from "@/lib/seo";
import { AnalyzeEntryClient } from "./AnalyzeEntryClient";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    return makePageMeta({
        title: "飞控日志分析",
        description:
            "在浏览器本地解析 PX4 .ulg 与 ArduPilot .bin 日志：确定性检查（振动 / IMU 削波、EKF 创新检验、电源、GPS、电机平衡等）与故障知识库匹配，AI 仅负责解释。",
        path: "/analyze",
        locale,
    });
}

export default function AnalyzePage() {
    return <AnalyzeEntryClient />;
}
