"use client";

import { useEffect, useState } from "react";
import { ChevronDown, List as ListIcon } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import type { GuideHeading } from "@/lib/guide";

/**
 * 右侧「本页目录」。VitePress 式：标题常驻、随滚动高亮当前小节。
 * 窄屏收起——正文本身已经够长，再挤一列会把行宽压到不可读。
 */
export function GuideOutline({ headings }: { headings: GuideHeading[] }) {
  const { language } = useLanguage();
  const [active, setActive] = useState(headings[0]?.id ?? "");

  const key = headings.map((h) => h.id).join(",");

  useEffect(() => {
    const els = key
      .split(",")
      .filter(Boolean)
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // 取视口内最靠上的一段作为当前小节
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // 顶部让出 sticky header，底部收窄，避免最后一节永远不激活
      { rootMargin: "-88px 0px -70% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);

  if (headings.length === 0) return null;

  const list = (
    <ul className="border-l border-border">
      {headings.map((h) => (
        <li key={h.id}>
          <a
            href={`#${encodeURIComponent(h.id)}`}
            aria-current={active === h.id ? "true" : undefined}
            className={`-ml-px block border-l-2 py-1 text-sm leading-5 transition-colors ${
              h.level === 3 ? "pl-6" : "pl-3"
            } ${
              active === h.id
                ? "border-primary font-medium text-primary"
                : "border-transparent text-muted hover:border-border hover:text-text"
            }`}
          >
            {language === "zh" ? h.zh : h.en}
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {/* 桌面端：右侧粘性目录 */}
      <aside className="hidden w-56 shrink-0 xl:block">
        <nav className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-10">
          <p className="mb-3 text-xs font-semibold tracking-wider text-muted">
            <span className="inline-flex min-w-0 items-center gap-2 truncate">
          <ListIcon className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{language === "zh" ? "本页目录" : "On this page"}</span>
        </span>
          </p>
          {list}
        </nav>
      </aside>

    </>
  );
}

/** 手机端折叠目录：在文章标题下方渲染（桌面端隐藏） */
export function GuideOutlineMobile({ headings }: { headings: GuideHeading[] }) {
  const { language } = useLanguage();
  if (headings.length === 0) return null;
  return (
    <details className="card group min-w-0 flex-1 xl:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-medium">
        <span className="inline-flex min-w-0 items-center gap-2 truncate">
          <ListIcon className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{language === "zh" ? "本页目录" : "On this page"}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="max-h-[60vh] overflow-y-auto border-t border-border px-4 py-3">
        <ul className="border-l border-border">
          {headings.map((h) => (
            <li key={h.id}>
              <a
                href={`#${encodeURIComponent(h.id)}`}
                className={`-ml-px block border-l-2 py-1 text-sm leading-5 transition-colors ${
                  h.level === 3 ? "pl-6" : "pl-3"
                } border-transparent text-muted hover:border-border hover:text-text`}
              >
                {language === "zh" ? h.zh : h.en}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

