import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { makePageMeta, softwareAppJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/lib/site-config";
import { GuideBody } from "@/components/GuideBody";
import { Eye, Sparkles, Zap } from "lucide-react";
import { getAllMcpServers, getMcpServerBySlug } from "@/lib/mcp";
import { contentEditUrl } from "@/lib/constants";
import { CommunityStatLine, EntryMetaGroups } from "@/components/EntryHeaderMeta";
import { EntrySidebar } from "@/components/EntrySidebar";
import { EntryContentTabs } from "@/components/EntryContentTabs";
import { EntryComments } from "@/components/EntryComments";
import { ChangelogList } from "@/components/ChangelogList";
import { CopyChip } from "@/components/CopyChip";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";

export function generateStaticParams() {
    return getAllMcpServers().map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
    const { slug, locale } = await params;
    const server = getMcpServerBySlug(slug);
    if (!server) return {};
    return makePageMeta({
        title: server.name,
        description: server.description,
        path: `/mcp/${slug}`,
        locale,
        ...(server.updatedAt ? { modifiedTime: server.updatedAt } : {}),
    });
}

export default async function McpDetailPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const server = getMcpServerBySlug(slug);
    if (!server) notFound();
    const siteUrl = SITE_URL;

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
        <div className="page-shell pt-4 pb-10 sm:pt-5">
            <Breadcrumbs items={[{ label: "MCP 服务", href: "/mcp" }, { label: server.slug }]} />

            {/* 与 /skills/[slug] 同构：320px 侧栏 + 12px 列距（EntrySidebar 宽度交给轨道，
                gap 收窄理由见那边注释） */}
            <div className="flex flex-col gap-4 lg:grid lg:gap-x-3 lg:[grid-template-columns:minmax(0,1fr)_320px]">
                <div className="card min-w-0 p-5 sm:p-6">
                    <header className="mb-8">
                        <div className="flex items-start gap-4">
                            <span
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-xl"
                                aria-hidden
                            >
                                {server.icon ?? "🔌"}
                            </span>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{server.name}</h1>
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
                                    {server.featured && (
                                        <span className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                                            <Sparkles className="h-3 w-3" />
                                            推荐
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

                        <EntryMetaGroups
                            platforms={server.platforms}
                            clients={server.clients}
                            models={server.models}
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

                    <EntryContentTabs
                        overview={
                            <article className="prose-skill">
                                <GuideBody renderer="md" source={server.body} />
                            </article>
                        }
                        comments={<EntryComments kind="mcp" slug={server.slug} />}
                        changelog={<ChangelogList entries={server.changelog ?? []} currentVersion={server.version} />}
                        changelogCount={server.changelog?.length ?? 0}
                        editUrls={{
                            readme: contentEditUrl("mcp", server.slug, "README.md"),
                            changelog: contentEditUrl("mcp", server.slug, "CHANGELOG.md"),
                        }}
                    />
                </div>

                {/* 右栏：不做 sticky——与 skills/[slug] 同一结论（2026-09-26 试过又撤，
                    用户实测「跟随滚动不好用」）。self-start 保持顶对齐。 */}
                <aside className="lg:self-start">
                    <EntrySidebar
                        kind="mcp"
                        slug={server.slug}
                        name={server.name}
                        baseDownloads={server.downloads}
                        copyText={copyText}
                        installHint="复制下方内容，粘贴到 Claude / Cursor 等支持 MCP 的客户端的配置中即可接入；致动类工具默认关闭，需要时显式开启。"
                        installTitle="把配置发给你的 AI 客户端，即可接入该 MCP 服务"
                        related={related}
                    />
                </aside>

                <JsonLd
                    data={softwareAppJsonLd({
                        url: `${siteUrl}/mcp/${slug}`,
                        name: server.name,
                        description: server.description,
                        version: server.version,
                        dateModified: server.updatedAt,
                    })}
                />
            </div>
        </div>
    );
}
