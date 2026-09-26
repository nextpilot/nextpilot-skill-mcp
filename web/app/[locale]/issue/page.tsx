import type { Metadata } from "next";
import { makePageMeta } from "@/lib/seo";
import { IssueForm } from "@/components/IssueForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    return makePageMeta({
        title: "提交反馈",
        description: "提交问题反馈或功能建议，帮助改进 NextPilot Skill 平台。",
        path: "/issue",
        locale,
    });
}

export default function IssuePage() {
    return (
        <div className="page-shell flex justify-center py-16">
            <IssueForm />
        </div>
    );
}
