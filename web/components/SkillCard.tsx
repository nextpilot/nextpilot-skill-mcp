"use client";

import { Link } from "@/i18n/routing";
import { Star, Download } from "lucide-react";
import type { SkillMeta } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export interface MatchHighlights {
    name?: [number, number][];
    description?: [number, number][];
    tags?: [number, number][];
}

function HighlightedText({ text, indices }: { text: string; indices?: [number, number][] }) {
    if (!indices || indices.length === 0) return <>{text}</>;

    // Merge overlapping / adjacent ranges
    const sorted = [...indices].sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const prev = merged[merged.length - 1];
        if (sorted[i][0] <= prev[1] + 1) {
            prev[1] = Math.max(prev[1], sorted[i][1]);
        } else {
            merged.push([...sorted[i]]);
        }
    }

    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const [start, end] of merged) {
        if (start > cursor) parts.push(text.slice(cursor, start));
        parts.push(
            <mark key={start} className="rounded-sm bg-warning/25 px-0.5 text-inherit">
                {text.slice(start, end + 1)}
            </mark>,
        );
        cursor = end + 1;
    }
    if (cursor < text.length) parts.push(text.slice(cursor));

    return <>{parts}</>;
}

export function SkillCard({ skill, highlights }: { skill: SkillMeta; highlights?: MatchHighlights }) {
    return (
        <Link
            href={`/skills/${skill.slug}`}
            className="card group flex h-full flex-col p-5 transition-colors hover:border-border-strong"
        >
            <div className="mb-3 flex items-start gap-3">
                {skill.icon && (
                    <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-lg"
                        aria-hidden
                    >
                        {skill.icon}
                    </span>
                )}
                <div className="min-w-0">
                    <h3 className="truncate font-medium text-text group-hover:text-primary">
                        <HighlightedText text={skill.name} indices={highlights?.name} />
                    </h3>
                    <p className="mt-0.5 text-[11px] text-faint">
                        {CATEGORY_LABEL[skill.category]} · {skill.platforms.slice(0, 2).join(" / ")}
                    </p>
                </div>
            </div>

            <p className="line-clamp-2 flex-1 text-sm leading-6 text-muted">
                <HighlightedText text={skill.description} indices={highlights?.description} />
            </p>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
                <span className="flex flex-wrap gap-1.5">
                    {skill.tags.slice(0, 2).map((t) => (
                        <span key={t} className="text-faint">
                            #{t}
                        </span>
                    ))}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                    <span className="flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                        {skill.rating.toFixed(1)}
                    </span>
                    <span className="flex items-center gap-1">
                        <Download className="h-3.5 w-3.5" />
                        {skill.downloads}
                    </span>
                    <span className="text-faint">{formatDate(skill.updatedAt)}</span>
                </span>
            </div>
        </Link>
    );
}
