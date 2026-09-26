import type { Metadata } from "next";
import { makePageMeta } from "@/lib/seo";
import EditorClient from "./EditorClient";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    return makePageMeta({
        title: "YAML 编辑器",
        description: "在线编写和测试飞控日志曲线预设 YAML，实时渲染 Plotly 图表。支持 PX4 与 ArduPilot 日志字段查询。",
        path: "/tools/editor",
        locale,
    });
}

export default function EditorPage() {
    return <EditorClient />;
}
