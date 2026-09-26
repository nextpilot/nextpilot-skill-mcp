import { Link } from "@/i18n/routing";
import { ChevronRight, Home } from "lucide-react";
import { SITE_URL } from "@/lib/site-config";

export interface Crumb {
    label: string;
    href?: string;
}

function breadcrumbJsonLd(items: Crumb[]) {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: item.label,
            item: item.href ? `${SITE_URL}${item.href}` : undefined,
        })),
    };
}

/**
 * 全站统一面包屑：整宽浅灰底条（占满所在容器宽度），含「首页」入口。
 * 最后一项为当前页（深色、不可点）。
 */
export function Breadcrumbs({ items, showHome = true }: { items: Crumb[]; showHome?: boolean }) {
    if (items.length === 0) return null;
    const all: Crumb[] = showHome ? [{ label: "首页", href: "/" }, ...items] : items;

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(all)) }}
            />
            <nav
                aria-label="breadcrumb"
                className="mb-6 flex w-full flex-wrap items-center gap-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-[13px] text-muted"
            >
                {all.map((item, i) => {
                    const last = i === all.length - 1;
                    return (
                        <span key={`${item.label}-${i}`} className="inline-flex min-w-0 items-center gap-1">
                            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />}
                            {item.href && !last ? (
                                <Link
                                    href={item.href}
                                    className="inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-text"
                                >
                                    {i === 0 && showHome && <Home className="h-3.5 w-3.5" />}
                                    {item.label}
                                </Link>
                            ) : (
                                <span
                                    className={`truncate ${last ? "font-medium text-text" : ""}`}
                                    aria-current={last ? "page" : undefined}
                                >
                                    {i === 0 && showHome && <Home className="mr-1 inline h-3.5 w-3.5" />}
                                    {item.label}
                                </span>
                            )}
                        </span>
                    );
                })}
            </nav>
        </>
    );
}
