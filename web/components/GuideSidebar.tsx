"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";
import type { GuideNavGroup } from "@/lib/guide";

/**
 * 左侧文档导航：一个 MD 文件一条链接，按 frontmatter 的 group 分组。
 * 分组与顺序由 lib/guide 从文件推导，这里不维护任何硬编码列表。
 */
export function GuideSidebar({ groups }: { groups: GuideNavGroup[] }) {
  const { t } = useLanguage();
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 lg:block">
      <nav className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-10">
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
    </aside>
  );
}
