"use client";

import { useMemo, useState } from "react";
import Fuse from "fuse.js";
import { Search } from "lucide-react";
import type { SkillMeta } from "@/lib/types";
import { CATEGORIES, type CategoryKey } from "@/lib/constants";
import { SkillCard } from "./SkillCard";

export function SkillExplorer({
  skills,
  initialCategory,
}: {
  skills: SkillMeta[];
  initialCategory?: CategoryKey;
}) {
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
          placeholder="我想做 X，例如：识别画面里的人、室内无 GPS 飞行、分析炸机日志…"
          className="w-full rounded-xl border border-border bg-surface py-3 pr-4 pl-10 text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-primary/60"
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <FilterChip
          active={category === "all"}
          onClick={() => setCategory("all")}
        >
          全部
        </FilterChip>
        {CATEGORIES.map((c) => (
          <FilterChip
            key={c.key}
            active={category === c.key}
            onClick={() => setCategory(c.key)}
          >
            {c.label}
            <span className="ml-1 text-xs opacity-70">{c.desc}</span>
          </FilterChip>
        ))}
      </div>

      {result.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted">
          没有匹配的 Skill，换个关键词试试
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.map((skill) => (
            <SkillCard key={skill.slug} skill={skill} />
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-muted">
        当前为关键词搜索（Fuse.js），语义搜索将在冲刺 3 上线（本地 BGE 向量匹配）
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
          : "border-border text-muted hover:border-primary/40 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
