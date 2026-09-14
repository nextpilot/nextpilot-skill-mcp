"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, List } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import type { GuideNavGroup } from "@/lib/guide";

/**
 * 左侧文档导航：一个 MD 文件一条链接，按 frontmatter 的 group 分组。
 * - 桌面端：粘性侧栏。
 * - 手机端：与“本页目录”并排放在文章顶部（见 GuideArticle），本组件只渲染折叠的篇目录。
 * 数据由 app/guide/layout.tsx 通过 getGuideNav() 注入，栏目样式随 layout 生效。
 */
export function GuideSidebar({ groups }: { groups: GuideNavGroup[] }) {
  const { t } = useLanguage();
  const pathname = usePathname();

  const nav = (
    <nav>
      {groups.map((group) => (
        <div key={group.zh} className="mb-6 last:mb-0">
          <p className="mb-2 text-xs font-semibold tracking-wider text-muted">
            {t(group.zh, group.en)}
          </p>
          <ul className="border-l border-border">
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`-ml-px block border-l-2 py-1.5 pl-3 text-sm transition-colors ${
                      active
                        ? "border-primary font-medium text-primary"
                        : "border-transparent text-muted hover:border-border hover:text-text"
                    }`}
                  >
                    {t(item.zh, item.en)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-10">{nav}</div>
    </aside>
  );
}

/** 仅手机端使用的折叠篇目录（供 GuideArticle 在顶部行内调用，不渲染桌面侧栏） */
export function GuideDocsSelect({ groups }: { groups: GuideNavGroup[] }) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const current = groups.flatMap((g) => g.items).find((i) => i.href === pathname);

  return (
    <details className="card group min-w-0 flex-1 lg:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium">
        <span className="inline-flex min-w-0 items-center gap-2 truncate">
          <List className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">
            {current ? t(current.zh, current.en) : t("指南目录", "Guide")}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
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
    </details>
  );
}
