"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, List, List as ListIcon } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import type { GuideNavGroup, GuideHeading } from "@/lib/guide";

type MobilePanel = "nav" | "outline" | null;

export function GuideMobileNav({ groups, headings }: { groups: GuideNavGroup[]; headings: GuideHeading[] }) {
    const { t } = useLanguage();
    const pathname = usePathname();
    const current = groups.flatMap((g) => g.items).find((i) => i.href === pathname);

    const [openPanel, setOpenPanel] = useState<MobilePanel>(null);
    const togglePanel = (panel: MobilePanel) => setOpenPanel((prev) => (prev === panel ? null : panel));

    return (
        <div className="mb-5 flex gap-2 lg:hidden">
            {/* 开始菜单 */}
            <div className="card group min-w-0 flex-1">
                <button
                    className="flex w-full cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium"
                    onClick={() => togglePanel("nav")}
                >
                    <span className="inline-flex min-w-0 items-center gap-2 truncate">
                        <ListIcon className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">{current ? t(current.zh, current.en) : t("指南目录", "Guide")}</span>
                    </span>
                    <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted transition-transform ${openPanel === "nav" ? "rotate-180" : ""}`}
                    />
                </button>
                {openPanel === "nav" && (
                    <div className="max-h-[60vh] overflow-y-auto border-t border-border px-4 py-3">
                        <nav>
                            {groups.map((group) => (
                                <div key={group.zh} className="mb-4 last:mb-0">
                                    <p className="mb-1.5 text-xs font-semibold text-muted">{t(group.zh, group.en)}</p>
                                    <ul className="space-y-0.5">
                                        {group.items.map((item) => (
                                            <li key={item.href}>
                                                <Link
                                                    href={item.href}
                                                    aria-current={pathname === item.href ? "page" : undefined}
                                                    className={`block rounded px-2 py-1.5 text-sm ${
                                                        pathname === item.href
                                                            ? "bg-primary-soft font-medium text-primary"
                                                            : "text-muted hover:bg-surface-2 hover:text-text"
                                                    }`}
                                                >
                                                    {t(item.zh, item.en)}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </nav>
                    </div>
                )}
            </div>

            {/* 本页目录 */}
            {headings.length > 0 && (
                <div className="card group min-w-0 flex-1">
                    <button
                        className="flex w-full cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium"
                        onClick={() => togglePanel("outline")}
                    >
                        <span className="inline-flex min-w-0 items-center gap-2 truncate">
                            <List className="h-4 w-4 shrink-0 text-primary" />
                            <span className="truncate">{t("本页目录", "On this page")}</span>
                        </span>
                        <ChevronDown
                            className={`h-4 w-4 shrink-0 text-muted transition-transform ${openPanel === "outline" ? "rotate-180" : ""}`}
                        />
                    </button>
                    {openPanel === "outline" && (
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
                                            {t(h.zh, h.en)}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
