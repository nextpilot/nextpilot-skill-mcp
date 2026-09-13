import Link from "next/link";
import { Star, Download } from "lucide-react";
import type { SkillMeta } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/constants";

export function SkillCard({ skill }: { skill: SkillMeta }) {
  return (
    <Link
      href={`/skills/${skill.slug}`}
      className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-sky-500/5"
    >
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
          {CATEGORY_LABEL[skill.category]}
        </span>
        {skill.platforms.slice(0, 2).map((p) => (
          <span
            key={p}
            className="rounded-md border border-border px-2 py-0.5 text-muted"
          >
            {p}
          </span>
        ))}
      </div>

      <h3 className="mb-1.5 font-semibold text-white group-hover:text-primary">
        {skill.name}
      </h3>
      <p className="line-clamp-3 flex-1 text-sm leading-6 text-muted">
        {skill.description}
      </p>

      <div className="mt-4 flex items-center justify-between text-xs text-muted">
        <div className="flex flex-wrap gap-1.5">
          {skill.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-[11px]">
              #{t}
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-warning text-warning" />
            {skill.rating.toFixed(1)}
          </span>
          <span className="flex items-center gap-1">
            <Download className="h-3.5 w-3.5" />
            {skill.downloads}
          </span>
        </div>
      </div>
    </Link>
  );
}
