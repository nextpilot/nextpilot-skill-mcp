"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, List } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import type { GuideNavGroup } from "@/lib/guide";

/**
 * 左侧文档导航：一个 MD 文件一条链接，按 frontmatter 的 group 分组。
 * 桌面端：粘性侧栏；手机端：折叠下拉（原生 details，无额外 JS）。
 * 数据由 app/guide/layout.tsx 通过 getGuideNav() 注入，栏目样式随 layout 生效。
 */
export function GuideSidebar({ groups }: { groups: GuideNavGroup[] }) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const current = groups
    .flatMap((g) => g.items)
    .find((i) => i.href === pathname);

  const nav = (
    <nav>
      {groups.map((group) => (
        <div key={group.zh} className="mb-6 last:mb-0 lg:mb-6">
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
    <>
      {/* 桌面端粘性侧栏 */}
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-10">{nav}</div>
      </aside>

      {/* 手机端：当前篇名 + 可展开的目录 */}
      <details className="group mb-5 w-full rounded-xl border border-border bg-surface lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm">
          <span className="inline-flex items-center gap-2 font-medium">
            <List className="h-4 w-4 text-primary" />
            {current ? t(current.zh, current.en) : t("使用指南目录", "Guide contents")}
          </span>
          <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="max-h-[60vh] overflow-y-auto border-t border-border px-4 py-3">{nav}</div>
      </details>
    </>
  );
}
