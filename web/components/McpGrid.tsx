"use client";

import type { McpServerMeta } from "@/lib/types";
import { McpCard } from "./McpCard";
import { applyDeltas, useLeaderboard } from "@/lib/community-stats";

/** MCP 列表：叠加 KV 实时获取增量后的卡片网格 */
export function McpGrid({ servers }: { servers: McpServerMeta[] }) {
  const board = useLeaderboard("mcp");
  const enriched = applyDeltas(servers, board);

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {enriched.map((server) => (
        <McpCard key={server.slug} server={server} downloads={server.downloads} />
      ))}
    </div>
  );
}
