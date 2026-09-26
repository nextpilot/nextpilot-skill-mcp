import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { makePageMeta } from "@/lib/seo";
import { GuideArticle } from "@/components/GuideArticle";
import { getGuideDoc } from "@/lib/guide";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const doc = getGuideDoc("");
    if (!doc) return {};
    return makePageMeta({
        title: `${doc.title} · 使用指南`,
        description: doc.description,
        path: "/guide",
        locale,
        ogType: "article",
    });
}

export default function GuideIndexPage() {
    // index.mdx 对应 /guide 本身
    const doc = getGuideDoc("");
    if (!doc) notFound();

    return <GuideArticle doc={doc} />;
}
