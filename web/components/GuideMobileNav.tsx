"use client";

import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/routing";
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
    const close = () => setOpenPanel(null);

    // Escape 收起：lg:hidden 意味着桌面把窗口拉窄时同样会用这套界面，键盘用户不该只能再找一次按钮
    useEffect(() => {
        if (!openPanel) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpenPanel(null);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [openPanel]);

    // 悬浮面板的公共外壳。为什么不用 card 类：它的 box-shadow（--shadow-card）只有 1px 级，
    // 是给「平铺在文档流里的卡片」用的；浮层压在正文上，必须靠更重的投影才能从内容里浮出来。
    const panelClass =
        "absolute inset-x-0 top-full z-30 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-surface px-4 py-3 shadow-xl";

    return (
        <div className="mb-5 flex gap-2 lg:hidden">
            {/* 开始菜单 */}
            <div className="card group relative min-w-0 flex-1">
                <button
                    className="relative z-30 flex w-full cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium"
                    aria-expanded={openPanel === "nav"}
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
                    <>
                        {/* 点面板外任意处收起：透明、只吃点击，不遮挡也不锁滚动。z 压在面板下、正文上。
              两个按钮各自 relative z-30 抬到遮罩之上：面板开着时另一个按钮仍可直达，
              互斥切换不用先点一下收起再点开（遮罩若盖住按钮，点它只会白关一次）。 */}
                        <div className="fixed inset-0 z-20" onClick={close} aria-hidden="true" />
                        {/* 悬浮展开：盖在正文上方，不再把整个页面往下推。z-30 在遮罩上、
              sticky header（z-40）下——面板从卡片下缘展开，正常滚动态不与 header 重叠 */}
                        <div className={panelClass}>
                            <nav>
                                {groups.map((group) => (
                                    <div key={group.zh} className="mb-4 last:mb-0">
                                        <p className="mb-1.5 text-xs font-semibold text-muted">
                                            {t(group.zh, group.en)}
                                        </p>
                                        <ul className="space-y-0.5">
                                            {group.items.map((item) => (
                                                <li key={item.href}>
                                                    <Link
                                                        href={item.href}
                                                        aria-current={pathname === item.href ? "page" : undefined}
                                                        onClick={close}
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
                    </>
                )}
            </div>

            {/* 本页目录 */}
            {headings.length > 0 && (
                <div className="card group relative min-w-0 flex-1">
                    <button
                        className="relative z-30 flex w-full cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium"
                        aria-expanded={openPanel === "outline"}
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
                        <>
                            <div className="fixed inset-0 z-20" onClick={close} aria-hidden="true" />
                            <div className={panelClass}>
                                <ul className="border-l border-border">
                                    {headings.map((h) => (
                                        <li key={h.id}>
                                            <a
                                                href={`#${encodeURIComponent(h.id)}`}
                                                onClick={close}
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
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
