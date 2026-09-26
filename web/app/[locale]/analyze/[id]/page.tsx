import type { Metadata } from "next";
import { makePageMeta } from "@/lib/seo";
import { AnalyzeResultClient } from "./AnalyzeResultClient";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
    const { locale, id } = await params;
    return makePageMeta({
        title: "分析结果",
        description:
            "飞控日志（PX4 / ArduPilot）确定性分析结果：检查结论、数据图表、事件消息、飞控参数与 AI 中文解读。",
        path: `/analyze/${id}`,
        locale,
        noIndex: true,
    });
}

export default function AnalyzeResultPage() {
    return <AnalyzeResultClient />;
}
