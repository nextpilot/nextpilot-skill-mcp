import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GuideArticle } from "@/components/GuideArticle";
import { getAllGuideDocs, getGuideDoc } from "@/lib/guide";

export function generateStaticParams() {
    // 空 slug 由 app/guide/page.tsx 提供，这里只出子页面，避免两条路由抢同一个地址
    return getAllGuideDocs()
        .filter((doc) => doc.slug !== "")
        .map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params;
    const doc = getGuideDoc(slug);
    if (!doc) return {};
    return { title: `${doc.title} · 使用指南`, description: doc.description };
}

export default async function GuideDocPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const doc = getGuideDoc(slug);
    if (!doc) notFound();

    return <GuideArticle doc={doc} />;
}
