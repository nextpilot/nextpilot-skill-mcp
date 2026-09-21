import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { LocalizedText } from "@/components/LocalizedText";
import { GuideBody } from "@/components/GuideBody";
import { GuideOutline } from "@/components/GuideOutline";
import { GuideMobileNav } from "@/components/GuideMobileNav";
import { getGuideNav, getGuideNeighbors, type GuideDoc } from "@/lib/guide";

/**
 * 一篇指南文档：标题区 + MD 正文 + 右侧本页目录 + 上/下一篇。
 * 左侧导航在 app/guide/layout.tsx，与本组件同宽于外层 flex。
 * 移动端：面包屑下方显示「开始菜单」和「本页目录」两个互斥折叠面板。
 */
export function GuideArticle({ doc }: { doc: GuideDoc }) {
  const { prev, next } = getGuideNeighbors(doc.slug);

  return (
    // gap-8（32px）而不是 gap-10（40px）：与外层「侧栏↔正文」那道间距同宽，
    // 省下的 8px 归正文。右目录列宽跟标题文字走（见 GuideOutline 的 aside），
    // 中文页通常 ~112px，正文一般能顶到 max-w-3xl 的 768 上限。
    <div className="flex min-w-0 gap-8">
      <article className="min-w-0 max-w-3xl flex-1">
        <GuideMobileNav groups={getGuideNav()} headings={doc.headings} />

        <header className="mb-8 border-b border-border pb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
            <LocalizedText zh={doc.title} en={doc.titleEn} />
          </h1>
          <p className="mt-4 text-base leading-8 text-muted">
            <LocalizedText zh={doc.description} en={doc.descriptionEn} />
          </p>
        </header>

        <div className="prose-guide">
          <GuideBody renderer={doc.renderer} source={doc.body} />
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