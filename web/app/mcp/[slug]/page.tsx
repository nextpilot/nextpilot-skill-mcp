import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Eye, Terminal, Zap } from "lucide-react";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getAllMcpServers, getMcpServerBySlug } from "@/lib/mcp";
import { LocalizedText } from "@/components/LocalizedText";

export function generateStaticParams() {
  return getAllMcpServers().map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const server = getMcpServerBySlug(slug);
  if (!server) return {};
  return { title: `${server.name} · MCP Server`, description: server.description };
}

export default async function McpDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const server = getMcpServerBySlug(slug);
  if (!server) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/mcp"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" />
        <LocalizedText zh="返回 MCP Server 目录" en="Back to MCP servers" />
      </Link>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
          <Terminal className="h-3 w-3" />
          MCP Server
        </span>
        <span className="rounded-md border border-border px-2 py-0.5 font-mono text-muted">
          {server.transport}
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
        {server.platforms.map((p) => (
          <span key={p} className="rounded-md border border-border px-2 py-0.5 text-muted">
            {p}
          </span>
        ))}
        {server.license && (
          <span className="rounded-md border border-border px-2 py-0.5 text-muted">
            {server.license}
          </span>
        )}
      </div>

      <h1 className="text-3xl font-bold text-text">{server.name}</h1>
      <p className="mt-3 leading-7 text-muted">{server.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted">
        <span>
          ★ {server.rating.toFixed(1)}
        </span>
        <span>{server.downloads} <LocalizedText zh="次获取" en="fetches" /></span>
        <span><LocalizedText zh="更新于" en="Updated" /> {server.updatedAt}</span>
      </div>

      {server.sourceUrl && (
        <div className="mt-5">
          <a
            href={server.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary/50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <LocalizedText zh="开源仓库" en="Source repository" />
          </a>
        </div>
      )}

      {/* 工具清单是 MCP 条目的核心信息：调用方要先知道能调什么、会不会写数据 */}
      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <p className="mb-3 text-xs text-muted">
          <LocalizedText zh="暴露的工具" en="Exposed tools" />
        </p>
        <ul className="flex flex-wrap gap-2">
          {server.tools.map((tool) => (
            <li key={tool}>
              <code className="rounded-md bg-surface-2 px-2.5 py-1 font-mono text-xs text-text">
                {tool}
              </code>
            </li>
          ))}
        </ul>
        {!server.readOnly && (
          <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-xs leading-5 text-warning">
            <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <LocalizedText
              zh="该 Server 具备写入或控制能力：启用前请确认已在仿真环境验证，并显式开启致动参数。"
              en="This server can write or control. Validate in simulation first and enable actuation explicitly."
            />
          </p>
        )}
      </section>

      {server.models.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <p className="mb-2 text-xs text-muted">
            <LocalizedText zh="验证过的客户端 / 模型" en="Tested clients / models" />
          </p>
          <div className="flex flex-wrap gap-2">
            {server.models.map((m) => (
              <span key={m} className="rounded-md bg-surface-2 px-2.5 py-1 text-xs text-text">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      <article className="prose-skill mt-8">
        <MDXRemote source={server.body} />
      </article>
    </div>
  );
}
