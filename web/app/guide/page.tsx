import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GuideArticle } from "@/components/GuideArticle";
import { getGuideDoc } from "@/lib/guide";

export async function generateMetadata(): Promise<Metadata> {
  const doc = getGuideDoc("");
  if (!doc) return {};
  return { title: `${doc.title} · 使用指南`, description: doc.description };
}

export default function GuideIndexPage() {
  // index.mdx 对应 /guide 本身
  const doc = getGuideDoc("");
  if (!doc) notFound();

  return <GuideArticle doc={doc} />;
}
