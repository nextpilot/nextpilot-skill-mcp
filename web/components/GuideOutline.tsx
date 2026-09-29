"use client";

import { useEffect, useState } from "react";
import { ChevronDown, List as ListIcon } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import type { GuideHeading } from "@/lib/guide";

/**
 * 右侧「本页目录」。VitePress 式：标题常驻、随滚动高亮当前小节。
 * 窄屏收起，正文本身已经够长，再挤一列会把行宽压到不可读。
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
            // 顶部让出 sticky header，底部收窄，避免最后一节一直不激活
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
                        className={`-ml-px block border-l-2 py-1.5 text-base transition-colors ${
                            h.level === 3 ? "pl-6" : "pl-3.5"
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
            {/* 桌面端：右侧粘性目录。
          宽度跟标题文字走（w-max），和左侧栏同一套规矩：写死 w-56 时目录文字只有 ~85px，
          列内右侧常年空 126px；上限 max-w-56（标题再长也不许反过来挤正文，换行）。
          断点要用 lg（1024）而不是 xl（1280）：1280 的窗口扣掉滚动条只剩 ~1263，
          xl 踩不准，目录整列消失，正文右缘到内容区右缘量出 176px 死白（1152/1200/1240/1263
          全是 176）。降到 lg 后最窄 1024 时正文仍有 ~672px，可读；1263 时正文能到 768 上限。 */}
            <aside className="hidden w-max min-w-28 max-w-56 shrink-0 lg:block">
                <nav className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-10">
                    <p className="mb-3 text-sm font-semibold text-muted">
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
