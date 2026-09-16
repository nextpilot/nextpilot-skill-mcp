"use client";

import { Flame, Trophy } from "lucide-react";
import Link from "next/link";
import { useLeaderboard } from "@/lib/community-stats";
import { LocalizedText } from "@/components/LocalizedText";

export interface LeaderboardBase {
  slug: string;
  name: string;
  downloads: number;
}

function LeaderboardList({
  kind,
  base,
}: {
  kind: "skill" | "mcp";
  base: LeaderboardBase[];
}) {
  const board = useLeaderboard(kind);
  const bySlug = new Map(base.map((b) => [b.slug, b]));

  const deltaMap = new Map(board.map((b) => [b.slug, b.delta]));
  const ranked = base
    .map((b) => ({ ...b, total: b.downloads + (deltaMap.get(b.slug) ?? 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const max = ranked[0]?.total || 1;
  const path = kind === "skill" ? "/skills" : "/mcp";

  if (ranked.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Flame className="mb-3 h-8 w-8 text-muted/40" />
        <p className="text-sm text-muted">
          {kind === "skill"
            ? "Skill 收录中，敬请期待"
            : "MCP Server 收录中，敬请期待"}
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-2.5">
      {ranked.map((s, i) => (
        <li key={s.slug}>
          <Link
            href={`${path}/${s.slug}`}
            className="group flex items-center gap-2.5 rounded-lg p-2 -mx-2 text-sm transition-colors hover:bg-surface-2"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold ${
                i === 0
                  ? "bg-warning/20 text-warning"
                  : i < 3
                    ? "bg-primary/10 text-primary"
                    : "bg-surface-2 text-muted"
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate group-hover:text-primary">
                {s.name}
              </span>
              <span className="mt-0.5 block h-1 overflow-hidden rounded bg-surface-2">
                <span
                  className="block h-full rounded bg-primary/40"
                  style={{
                    width: `${Math.max(8, (s.total / max) * 100)}%`,
                  }}
                />
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted">{s.total}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function HomeLeaderboards({
  skills,
  mcps,
}: {
  skills: LeaderboardBase[];
  mcps: LeaderboardBase[];
}) {
  return (
    <section className="border-b border-border">
      <div className="page-shell py-16">
        <div className="mb-8 text-center">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            Trending
          </p>
          <h2 className="text-2xl font-semibold tracking-[-0.01em]">
            <LocalizedText zh="热门内容" en="Trending" />
          </h2>
          <p className="mt-3 text-[15px] text-muted">
            <LocalizedText
              zh="社区最受欢迎的 Skill 与 MCP Server"
              en="Most popular skills and MCP servers in the community"
            />
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="card p-5">
            <h3 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-text">
              <Trophy className="h-4 w-4 text-warning" />
              <LocalizedText zh="热门 Skill" en="Hot Skills" />
            </h3>
            <LeaderboardList kind="skill" base={skills} />
          </div>
          <div className="card p-5">
            <h3 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-text">
              <Trophy className="h-4 w-4 text-warning" />
              <LocalizedText zh="热门 MCP Server" en="Hot MCP Servers" />
            </h3>
            <LeaderboardList kind="mcp" base={mcps} />
          </div>
        </div>
      </div>
    </section>
  );
}