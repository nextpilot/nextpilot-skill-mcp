"use client";

import Link from "next/link";
import { Star, Download, Eye, Zap } from "lucide-react";
import type { McpServerMeta } from "@/lib/types";
import { LocalizedText } from "@/components/LocalizedText";

/**
 * MCP Server 卡片。与 SkillCard 的关键差别：这里首先回答「它能碰什么」——
 * 工具数与只读 / 致动标记，比评分更该先看到。
 * 下载数由父级传入（已叠加 KV 实时增量）。
 */
export function McpCard({
  server,
  downloads,
}: {
  server: McpServerMeta;
  downloads?: number;
}) {
  const shown = downloads ?? server.downloads;
  return (
    <Link
      href={`/mcp/${server.slug}`}
      className="group flex h-full flex-col rounded-xl border border-border bg-surface p-5 transition-all hover:-translate-y-1 hover:border-primary/60"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
          {server.tools.length} <LocalizedText zh="个工具" en="tools" />
        </span>
        {server.readOnly ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-muted">
            <Eye className="h-3 w-3" />
            <LocalizedText zh="默认只读" en="Read-only" />
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-warning">
            <Zap className="h-3 w-3" />
            <LocalizedText zh="含致动能力" en="Can actuate" />
          </span>
        )}
        {server.platforms.slice(0, 1).map((p) => (
          <span key={p} className="rounded-md border border-border px-2 py-0.5 text-muted">
            {p}
          </span>
        ))}
      </div>

      <h3 className="mb-1.5 flex items-center gap-2 font-semibold text-text group-hover:text-primary">
        {server.icon && <span aria-hidden>{server.icon}</span>}
        {server.name}
      </h3>
      <p className="line-clamp-3 flex-1 text-sm leading-6 text-muted">{server.description}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {server.tools.slice(0, 3).map((tool) => (
          <code key={tool} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text">
            {tool}
          </code>
        ))}
        {server.tools.length > 3 && (
          <span className="text-[11px] text-muted">+{server.tools.length - 3}</span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
        <span className="font-mono text-[11px]">{server.transport}</span>
        <div className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-warning text-warning" />
            {server.rating.toFixed(1)}
          </span>
          <span className="flex items-center gap-1">
            <Download className="h-3.5 w-3.5" />
            {shown}
          </span>
        </div>
      </div>
    </Link>
  );
}
