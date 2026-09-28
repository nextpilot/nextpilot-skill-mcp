import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { makePageMeta, articleJsonLd, extractFaqItems, faqPageJsonLd } from "@/lib/seo";
import { GuideArticle } from "@/components/GuideArticle";
import { getAllGuideDocs, getGuideDoc } from "@/lib/guide";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL } from "@/lib/site-config";

export function generateStaticParams() {
    return getAllGuideDocs()
        .filter((doc) => doc.slug !== "")
        .map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
    const { slug, locale } = await params;
    const doc = getGuideDoc(slug);
    if (!doc) return {};
    return makePageMeta({
        title: `${doc.title} · 使用指南`,
        description: doc.description,
        path: `/guide/${slug}`,
        locale,
        ogType: "article",
    });
}

export default async function GuideDocPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const doc = getGuideDoc(slug);
    if (!doc) notFound();
    const siteUrl = SITE_URL;

    return (
        <>
            <GuideArticle doc={doc} />
            <JsonLd
                data={articleJsonLd({
                    url: `${siteUrl}/guide/${slug}`,
                    title: `${doc.title} · 使用指南`,
                    description: doc.description,
                })}
            />
            {slug === "faq" && <JsonLd data={faqPageJsonLd(extractFaqItems(doc.body))} />}
        </>
    );
}
