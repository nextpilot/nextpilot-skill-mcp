import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
}

/** 全站统一面包屑：最后一项为当前页（不可点） */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="breadcrumb"
      className="mb-6 flex flex-wrap items-center gap-1 text-sm text-muted"
    >
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 opacity-50" />}
            {item.href && !last ? (
              <Link href={item.href} className="transition-colors hover:text-text">
                {item.label}
              </Link>
            ) : (
              <span className={last ? "font-medium text-text" : ""} aria-current={last ? "page" : undefined}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
