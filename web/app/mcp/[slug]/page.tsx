import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import { Eye, Zap } from "lucide-react";
import { getAllMcpServers, getMcpServerBySlug } from "@/lib/mcp";
import { CommunityStatLine, SkillMetaGroups } from "@/components/SkillHeaderMeta";
import { SkillSidebar } from "@/components/SkillSidebar";
import { SkillContentTabs } from "@/components/SkillContentTabs";
import { SkillComments } from "@/components/SkillComments";
import { ChangelogList } from "@/components/ChangelogList";
import { CopyChip } from "@/components/CopyChip";

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

  // 复制给 AI 客户端的完整配置说明
  const copyText = `# ${server.name}\n\n${server.description}\n\n## 工具\n${server.tools
    .map((t) => `- ${t}`)
    .join("\n")}\n\n## 传输方式\n${server.transport}\n\n${
    server.readOnly ? "默认只读，不含致动能力。" : "含致动能力，默认需显式开启。"
  }\n\n${server.body}`;

  // 同类推荐：MCP 数量少，取其余全部
  const related = getAllMcpServers()
    .filter((s) => s.slug !== server.slug)
    .slice(0, 4)
    .map((s) => ({ slug: s.slug, name: s.name, description: s.description, icon: s.icon }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav className="mb-8 flex items-center gap-2 text-sm" aria-label="breadcrumb">
        <Link href="/mcp" className="text-muted transition-colors hover:text-text">
          MCP Server /
        </Link>
        <span className="font-semibold">{server.slug}</span>
      </nav>

      <div className="lg:grid lg:gap-x-3 lg:[grid-template-columns:minmax(0,1fr)_390px]">
        <div className="min-w-0 rounded-2xl bg-surface p-5 sm:p-6">
          <header className="mb-8">
            <div className="flex items-start gap-4">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface text-2xl"
                aria-hidden
              >
                {server.icon ?? "🔌"}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold md:text-[26px]">{server.name}</h1>
                  {server.readOnly ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-muted">
                      <Eye className="h-3 w-3" />
                      默认只读
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                      <Zap className="h-3 w-3" />
                      含致动能力
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="truncate font-mono text-[13px] text-muted">{server.slug}</span>
                  <CopyChip value={server.slug} title="点击复制 slug" iconOnly />
                </div>
                <CommunityStatLine
                  kind="mcp"
                  slug={server.slug}
                  baseRating={server.rating}
                  baseDownloads={server.downloads}
                  version={server.version}
                  updatedAt={server.updatedAt}
                />
              </div>
            </div>

            <p className="mt-4 leading-7 text-muted">{server.description}</p>

            {server.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                {server.tags.map((t) => (
                  <span key={t} className="rounded bg-surface-2 px-1.5 py-0.5 text-muted">
                    #{t}
                  </span>
                ))}
              </div>
            )}

            <SkillMetaGroups
              platforms={server.platforms}
              clients={server.clients}
              models={server.models}
              featured={server.featured}
              sourceUrl={server.sourceUrl}
              license={server.license}
              extraRows={[
                {
                  label: "暴露工具",
                  value: (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {server.tools.map((t) => (
                        <code
                          key={t}
                          className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]"
                        >
                          {t}
                        </code>
                      ))}
                    </span>
                  ),
                },
                { label: "传输方式", value: <span className="font-mono">{server.transport}</span> },
                {
                  label: "致动能力",
                  value: (
                    <span className={server.readOnly ? "text-muted" : "text-warning"}>
                      {server.readOnly
                        ? "无（默认只读，不写数据）"
                        : "有（需显式开启，仿真环境优先）"}
                    </span>
                  ),
                },
              ]}
            />
          </header>

          <SkillContentTabs
            overview={
              <article className="prose-skill">
                <MDXRemote source={server.body} />
              </article>
            }
            comments={<SkillComments kind="mcp" slug={server.slug} />}
            changelog={
              <ChangelogList entries={server.changelog ?? []} currentVersion={server.version} />
            }
            changelogCount={server.changelog?.length ?? 0}
          />
        </div>

        <aside className="mb-10 lg:mb-0 lg:self-start">
          <SkillSidebar
            kind="mcp"
            slug={server.slug}
            name={server.name}
            baseDownloads={server.downloads}
            copyText={copyText}
            installHint="复制下方内容，粘贴到 Claude / Cursor 等支持 MCP 的客户端的配置中即可接入；致动类工具默认关闭，需要时显式开启。"
            installTitle="把配置发给你的 AI 客户端，即可接入该 MCP Server"
            related={related}
          />
        </aside>
      </div>
    </div>
  );
}
