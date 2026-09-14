"use client";

import { useMemo, useState } from "react";
import Fuse from "fuse.js";
import { Search } from "lucide-react";
import type { SkillMeta } from "@/lib/types";
import { CATEGORIES, type CategoryKey } from "@/lib/constants";
import { useLanguage } from "./LanguageProvider";
import { SkillCard } from "./SkillCard";
import { applyDeltas, useLeaderboard } from "@/lib/community-stats";

type SortKey = "hot" | "rating" | "newest";

const SORT_LABELS: Record<SortKey, string> = {
  hot: "最热",
  rating: "评分",
  newest: "最新",
};

export function SkillExplorer({
  skills,
  initialCategory,
}: {
  skills: SkillMeta[];
  initialCategory?: CategoryKey;
}) {
  const { language, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryKey | "all">(
    initialCategory ?? "all",
  );
  const [sort, setSort] = useState<SortKey>("hot");
  const board = useLeaderboard("skill");

  const fuse = useMemo(
    () =>
      new Fuse(skills, {
        keys: ["name", "description", "tags", "models", "platforms"],
        threshold: 0.35,
      }),
    [skills],
  );

  const enriched = useMemo(() => applyDeltas(skills, board), [skills, board]);

  const result = useMemo(() => {
    const byCategory =
      category === "all"
        ? enriched
        : enriched.filter((s) => s.category === category);
    const matched = query.trim()
      ? fuse.search(query).map((r) => {
          // Fuse 用的是传入时的对象，用 slug 找到带增量的版本
          const live = byCategory.find((b) => b.slug === r.item.slug);
          return live ?? r.item;
        })
      : byCategory;
    const sorted = [...matched];
    if (sort === "hot") sorted.sort((a, b) => b.downloads - a.downloads || b.rating - a.rating);
    if (sort === "rating") sorted.sort((a, b) => b.rating - a.rating || b.downloads - a.downloads);
    if (sort === "newest")
      sorted.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    return sorted;
  }, [query, category, sort, fuse, enriched]);

  return (
    <div>
      <div className="relative mb-4">
        <Search className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(
            "我想做 X，例如：识别画面里的人、室内无 GPS 飞行、分析炸机日志…",
            "I want to: detect people, fly indoors without GPS, analyze a crash log…",
          )}
          className="input pl-10"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
          {t("全部", "All")}
        </FilterChip>
        {CATEGORIES.map((c) => (
          <FilterChip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)}>
            {language === "zh"
              ? c.label
              : { perception: "Perception", decision: "Decision", control: "Control", toolchain: "Toolchain" }[c.key]}
          </FilterChip>
        ))}
        <span className="ml-auto flex items-center gap-1 text-xs text-muted">
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

      {result.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted">
          {t("没有匹配的 Skill，换个关键词试试", "No matching skills. Try another search.")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.map((skill) => (
            <SkillCard key={skill.slug} skill={skill} />
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-muted">
        {t(
          "当前为关键词搜索（Fuse.js），语义搜索将在冲刺 1 内上线（本地 BGE 向量匹配）",
          "Keyword search powered by Fuse.js. Local BGE semantic search is coming in Sprint 1.",
        )}
      </p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`chip px-3 py-1.5 transition-colors ${
        active
          ? "chip-brand border-transparent"
          : "hover:border-border-strong hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}
