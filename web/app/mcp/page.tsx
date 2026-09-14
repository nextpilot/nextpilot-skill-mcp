import type { Metadata } from "next";
import { Plug, ShieldCheck } from "lucide-react";
import { getMcpIndex } from "@/lib/mcp";
import { McpGrid } from "@/components/McpGrid";
import { LocalizedText } from "@/components/LocalizedText";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const metadata: Metadata = {
  title: "MCP Server · NextPilot Skill MCP",
  description: "飞控方向的 MCP Server 目录：可被 Claude / Cursor 等客户端直接调用的工具集。",
};

export default function McpPage() {
  const servers = getMcpIndex();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Breadcrumbs items={[{ label: "MCP Server" }]} />
      <header className="mb-8">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <Plug className="h-4 w-4" />
          MCP Server
        </p>
        <h1 className="text-2xl font-bold text-text">
          <LocalizedText zh="MCP Server 目录" en="MCP server directory" />
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          <LocalizedText
            zh={`${servers.length} 个 MCP Server。与 Skill 不同：Skill 是模型读到的提示词与约定，MCP Server 是客户端能真正调用的工具集——所以这里的每个条目都要说明它暴露了哪些工具、能不能写数据。`}
            en={`${servers.length} MCP servers. Unlike a Skill — which is context the model reads — an MCP server exposes tools a client can actually call. Each entry here states which tools it offers and whether it can write.`}
          />
        </p>
      </header>

      <div className="card mb-8 flex items-start gap-2.5 p-4 text-sm leading-6 text-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          <LocalizedText
            zh="平台不直接致动真实载具。致动类能力只以开源形式提供，并强制三重门禁：默认只读、显式开启致动参数、仿真环境优先。"
            en="The platform never directly actuates real aircraft. Actuation ships only as open source, under three gates: read-only by default, actuation behind an explicit flag, and simulation first."
          />
        </p>
      </div>

      {servers.length === 0 ? (
        <p className="card p-10 text-center text-sm text-muted">
          <LocalizedText zh="暂无收录。" en="Nothing listed yet." />
        </p>
      ) : (
        <McpGrid servers={servers} />
      )}
    </div>
  );
}
