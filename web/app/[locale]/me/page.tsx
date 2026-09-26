import type { Metadata } from "next";
import { makePageMeta } from "@/lib/seo";
import { MeClient } from "./MeClient";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    return makePageMeta({
        title: "个人中心",
        description: "管理你的 NextPilot Skill 账户与分析记录。",
        path: "/me",
        locale,
        noIndex: true,
    });
}

export default function MePage() {
    return <MeClient />;
}
