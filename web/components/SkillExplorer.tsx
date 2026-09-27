"use client";

import { useEffect, useMemo, useState } from "react";
import Fuse from "fuse.js";
import { Search } from "lucide-react";
import type { SkillMeta } from "@/lib/types";
import { CATEGORIES, type CategoryKey } from "@/lib/constants";
import { useLanguage } from "./LanguageProvider";
import { SkillCard, type MatchHighlights } from "./SkillCard";
import { applyDeltas, useLeaderboard } from "@/lib/community-stats";

type SortKey = "hot" | "rating" | "newest";

const VALID_CATEGORIES = new Set<string>(["perception", "decision", "control", "toolchain"]);

const SORT_LABELS: Record<SortKey, string> = {
    hot: "最热",
    rating: "评分",
    newest: "最新",
};

const CATEGORY_EN: Record<string, string> = {
    perception: "Perception",
    decision: "Decision",
    control: "Control",
    toolchain: "Toolchain",
};

export function SkillExplorer({ skills, initialCategory }: { skills: SkillMeta[]; initialCategory?: CategoryKey }) {
    const { language, t } = useLanguage();
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<CategoryKey | "all">(initialCategory ?? "all");

    useEffect(() => {
        if (initialCategory) return;
        const c = new URLSearchParams(window.location.search).get("category");
        if (c && VALID_CATEGORIES.has(c as CategoryKey)) setCategory(c as CategoryKey);
    }, [initialCategory]);
    const [sort, setSort] = useState<SortKey>("hot");
    const board = useLeaderboard("skill");

    const fuse = useMemo(
        () =>
            new Fuse(skills, {
                keys: [
                    { name: "name", weight: 3 },
                    { name: "tags", weight: 2 },
                    { name: "_pinyin", weight: 1 },
                    { name: "description", weight: 0.5 },
                    { name: "models", weight: 0.5 },
                    { name: "platforms", weight: 0.5 },
                ],
                threshold: 0.35,
                includeMatches: true,
            }),
        [skills],
    );

    const enriched = useMemo(() => applyDeltas(skills, board), [skills, board]);

    const { results, highlights } = useMemo(() => {
        const byCategory = category === "all" ? enriched : enriched.filter((s) => s.category === category);

        if (!query.trim()) {
            const sorted = [...byCategory];
            if (sort === "hot") sorted.sort((a, b) => b.downloads - a.downloads || b.rating - a.rating);
            if (sort === "rating") sorted.sort((a, b) => b.rating - a.rating || b.downloads - a.downloads);
            if (sort === "newest") sorted.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
            return { results: sorted, highlights: new Map<string, MatchHighlights>() };
        }

        const fuseResults = fuse.search(query);
        const matched: SkillMeta[] = [];
        const hlMap = new Map<string, MatchHighlights>();

        for (const r of fuseResults) {
            const live = byCategory.find((b) => b.slug === r.item.slug);
            const skill = live ?? r.item;
            matched.push(skill);

            if (r.matches) {
                const hl: MatchHighlights = {};
                for (const m of r.matches) {
                    const key = m.key === "_pinyin" ? undefined : m.key;
                    if (key && m.indices.length > 0) {
                        hl[key as keyof MatchHighlights] = [...m.indices] as [number, number][];
                    }
                }
                hlMap.set(skill.slug, hl);
            }
        }

        const sorted = [...matched];
        if (sort === "hot") sorted.sort((a, b) => b.downloads - a.downloads || b.rating - a.rating);
        if (sort === "rating") sorted.sort((a, b) => b.rating - a.rating || b.downloads - a.downloads);
        if (sort === "newest") sorted.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

        return { results: sorted, highlights: hlMap };
    }, [query, category, sort, fuse, enriched]);

    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = { all: enriched.length };
        for (const c of CATEGORIES) {
            counts[c.key] = enriched.filter((s) => s.category === c.key).length;
        }
        return counts;
    }, [enriched]);

    return (
        <div>
            <div className="relative mb-4">
                <Search className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("搜索 Skill，或描述你想做的事", "Search skills, or describe your task")}
                    className="input pl-10"
                />
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <FilterChip active={category === "all"} onClick={() => setCategory("all")} count={categoryCounts.all}>
                    {t("全部", "All")}
                </FilterChip>
                {CATEGORIES.map((c) => (
                    <FilterChip
                        key={c.key}
                        active={category === c.key}
                        onClick={() => setCategory(c.key)}
                        count={categoryCounts[c.key]}
                    >
                        {language === "zh" ? c.label : CATEGORY_EN[c.key]}
                    </FilterChip>
                ))}
                <span className="flex w-full items-center justify-end gap-1 text-xs text-muted sm:ml-auto sm:w-auto">
                    {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                        <button
                            key={k}
                            type="button"
                            onClick={() => setSort(k)}
                            className={`rounded-md px-2.5 py-1 transition-colors ${
                                sort === k ? "bg-surface-2 font-medium text-text" : "hover:text-text"
                            }`}
                        >
                            {SORT_LABELS[k]}
                        </button>
                    ))}
                </span>
            </div>

            {results.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted">
                    {t("没有匹配的 Skill，换个关键词试试", "No matching skills. Try another search.")}
                </p>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {results.map((skill) => (
                        <SkillCard key={skill.slug} skill={skill} highlights={highlights.get(skill.slug)} />
                    ))}
                </div>
            )}

            <p className="mt-6 text-xs text-muted">
                {t(
                    "当前为关键词搜索（Fuse.js + 拼音），支持中文、拼音、英文混合输入。语义搜索（本地 BGE 向量匹配）在计划中。",
                    "Keyword search (Fuse.js + Pinyin). Supports Chinese, pinyin, and English queries. Semantic search (local BGE) is planned.",
                )}
            </p>
        </div>
    );
}

function FilterChip({
    active,
    onClick,
    count,
    children,
}: {
    active: boolean;
    onClick: () => void;
    count?: number;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`chip flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                active ? "chip-brand border-transparent" : "hover:border-border-strong hover:text-text"
            }`}
        >
            {children}
            {count !== undefined && (
                <span className={`text-[11px] ${active ? "opacity-70" : "text-faint"}`}>{count}</span>
            )}
        </button>
    );
}
