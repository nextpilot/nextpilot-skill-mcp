"use client";

import { Link } from "@/i18n/routing";
import { Trophy } from "lucide-react";
import { useLeaderboard } from "@/lib/community-stats";

/** 热门榜：KV 实时获取次数 Top N，点击跳转对应详情页 */
export function Leaderboard({
    kind,
    base,
}: {
    kind: "skill" | "mcp";
    /** slug → 名称/下载基值映射，用于显示中文名并叠加增量 */
    base: { slug: string; name: string; downloads: number }[];
}) {
    const board = useLeaderboard(kind);

    // 榜单 = 静态基值 + KV 增量合并排序
    const deltaMap = new Map(board.map((b) => [b.slug, b.delta]));
    const ranked = base
        .map((b) => ({ ...b, total: b.downloads + (deltaMap.get(b.slug) ?? 0) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
    const max = ranked[0]?.total || 1;
    const path = kind === "skill" ? "/skills" : "/mcp";

    return (
        <div className="card p-4">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                <Trophy className="h-4 w-4 text-warning" />
                热门榜
            </h2>
            <ol className="space-y-2.5">
                {ranked.map((s, i) => (
                    <li key={s.slug}>
                        <Link href={`${path}/${s.slug}`} className="group flex items-center gap-2.5 text-sm">
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
                                <span className="block truncate group-hover:text-primary">{s.name}</span>
                                <span className="mt-0.5 block h-1 overflow-hidden rounded bg-surface-2">
                                    <span
                                        className="block h-full rounded bg-primary/40"
                                        style={{ width: `${Math.max(8, (s.total / max) * 100)}%` }}
                                    />
                                </span>
                            </span>
                            <span className="shrink-0 text-xs text-muted">{s.total}</span>
                        </Link>
                    </li>
                ))}
            </ol>
        </div>
    );
}
