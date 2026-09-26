import type { Metadata } from "next";
import { makePageMeta } from "@/lib/seo";
import ProbeClient from "./ProbeClient";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    return makePageMeta({
        title: "日志探针",
        description: "在线探查飞控日志中的 topic 和字段：快速搜索、浏览字段名和类型，支持 PX4 与 ArduPilot。",
        path: "/tools/probe",
        locale,
    });
}

export default function ProbePage() {
    return <ProbeClient />;
}
