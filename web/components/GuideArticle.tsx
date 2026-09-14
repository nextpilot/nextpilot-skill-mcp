import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { LocalizedText } from "@/components/LocalizedText";
import { GuideMdx } from "@/components/GuideMdx";
import { GuideOutline, GuideOutlineMobile } from "@/components/GuideOutline";
import { GuideDocsSelect } from "@/components/GuideSidebar";
import { getGuideNav } from "@/lib/guide";
import { getGuideNeighbors, type GuideDoc } from "@/lib/guide";

/**
 * 一篇指南文档：标题区 + MD 正文 + 右侧本页目录 + 上/下一篇。
 * 左侧导航在 app/guide/layout.tsx，与本组件同宽于外层 flex。
 */
export function GuideArticle({ doc }: { doc: GuideDoc }) {
  const { prev, next } = getGuideNeighbors(doc.slug);

  return (
    <div className="flex min-w-0 gap-10">
      <article className="min-w-0 max-w-3xl flex-1">
        <header className="mb-8 border-b border-border pb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
            <LocalizedText zh={doc.title} en={doc.titleEn} />
          </h1>
          <p className="mt-4 text-base leading-8 text-muted">
            <LocalizedText zh={doc.description} en={doc.descriptionEn} />
          </p>
        </header>

        <div className="mb-5 flex gap-2 lg:hidden">
          <GuideDocsSelect groups={getGuideNav()} />
          <GuideOutlineMobile headings={doc.headings} />
        </div>

        <div className="prose-guide">
          <GuideMdx source={doc.body} />
        </div>

        {(prev || next) && (
          <nav className="mt-12 flex flex-wrap items-center gap-3 border-t border-border pt-6 text-sm">
            {prev && (
              <Link
                href={prev.href}
                className="group inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2 text-muted hover:border-primary hover:text-text"
              >
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                <LocalizedText zh={prev.title} en={prev.titleEn} />
              </Link>
            )}
            {next && (
              <Link
                href={next.href}
                className="group ml-auto inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2 text-muted hover:border-primary hover:text-text"
              >
                <LocalizedText zh={next.title} en={next.titleEn} />
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
          </nav>
        )}
      </article>

      <GuideOutline headings={doc.headings} />
    </div>
  );
}
