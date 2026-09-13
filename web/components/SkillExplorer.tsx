"use client";

import { useMemo, useState } from "react";
import Fuse from "fuse.js";
import { Search } from "lucide-react";
import type { SkillMeta } from "@/lib/types";
import { CATEGORIES, type CategoryKey } from "@/lib/constants";
import { useLanguage } from "./LanguageProvider";
import { SkillCard } from "./SkillCard";

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

  const fuse = useMemo(
    () =>
      new Fuse(skills, {
        keys: ["name", "description", "tags", "models", "platforms"],
        threshold: 0.35,
      }),
    [skills],
  );

  const result = useMemo(() => {
    const byCategory =
      category === "all"
        ? skills
        : skills.filter((s) => s.category === category);
    if (!query.trim()) return byCategory;
    return fuse.search(query).map((r) => r.item);
  }, [query, category, fuse, skills]);

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
          className="w-full rounded-xl border border-border bg-surface py-3 pr-4 pl-10 text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-primary/60"
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <FilterChip
          active={category === "all"}
          onClick={() => setCategory("all")}
        >
          {t("全部", "All")}
        </FilterChip>
        {CATEGORIES.map((c) => (
          <FilterChip
            key={c.key}
            active={category === c.key}
            onClick={() => setCategory(c.key)}
          >
            {language === "zh"
              ? c.label
              : { perception: "Perception", decision: "Decision", control: "Control", toolchain: "Toolchain" }[c.key]}
            <span className="ml-1 text-xs opacity-70">
              {language === "zh"
                ? c.desc
                : { perception: "See", decision: "Plan", control: "Fly", toolchain: "Build" }[c.key]}
            </span>
          </FilterChip>
        ))}
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
          "当前为关键词搜索（Fuse.js），语义搜索将在冲刺 3 上线（本地 BGE 向量匹配）",
          "Keyword search powered by Fuse.js. Local BGE semantic search is planned for Sprint 3.",
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
      className={`rounded-full border px-3.5 py-1.5 transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted hover:border-primary/40 hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}
