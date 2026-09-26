import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { makePageMeta, softwareAppJsonLd, SITE_URL } from "@/lib/seo";
import { Eye, Sparkles, Zap } from "lucide-react";
import { getAllSkills, getSkillBySlug } from "@/lib/skills";
import { JsonLd } from "@/components/JsonLd";
import { CATEGORY_GLYPH, CATEGORY_LABEL, skillEditUrls } from "@/lib/constants";
import { GuideBody } from "@/components/GuideBody";
import { CommunityStatLine, EntryMetaGroups } from "@/components/EntryHeaderMeta";
import { EntrySidebar } from "@/components/EntrySidebar";
import { EntryContentTabs } from "@/components/EntryContentTabs";
import { EntryComments } from "@/components/EntryComments";
import { ChangelogList } from "@/components/ChangelogList";
import { CopyChip } from "@/components/CopyChip";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export function generateStaticParams() {
    return getAllSkills().map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
    const { slug, locale } = await params;
    const skill = getSkillBySlug(slug);
    if (!skill) return {};
    return makePageMeta({
        title: skill.name,
        description: skill.description,
        path: `/skills/${slug}`,
        locale,
        ...(skill.updatedAt ? { modifiedTime: skill.updatedAt } : {}),
    });
}

export default async function SkillDetailPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const skill = getSkillBySlug(slug);
    if (!skill) notFound();

    // 同类推荐（同分类下取前 4 个，排除自身）
    const related = getAllSkills()
        .filter((s) => s.slug !== skill.slug && s.category === skill.category)
        .slice(0, 4)
        .map((s) => ({ slug: s.slug, name: s.name, description: s.description, icon: s.icon }));

    const editUrls = skillEditUrls(skill.slug);

    return (
        <div className="page-shell pt-4 pb-10 sm:pt-5">
            <Breadcrumbs items={[{ label: "Skill 技能库", href: "/skills" }, { label: skill.slug }]} />

            {/* 两栏：左栏 = 标题 + 内容（纵向堆叠），右栏 = 390px 侧栏（与 EntrySidebar
                的说明、/mcp/[slug] 一致；gap 收到 12px——左右卡各自有 20px+ 内边距，
                再叠 24px 的 gap，中缝看着有一掌宽，用户点过名「空白可以减少一些」） */}
            <div className="flex flex-col gap-4 lg:grid lg:gap-x-3 lg:[grid-template-columns:minmax(0,1fr)_390px]">
                <div className="card min-w-0 p-5 sm:p-6">
                    {/* 标题区：图标 + 标题 + slug，其后按组展示头部信息（见 EntryHeaderMeta） */}
                    <header className="mb-8">
                        <div className="flex items-start gap-4">
                            <span
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-xl"
                                aria-hidden
                            >
                                {skill.icon ?? CATEGORY_GLYPH[skill.category]}
                            </span>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{skill.name}</h1>
                                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                        {CATEGORY_LABEL[skill.category]}
                                    </span>
                                    {skill.capability && (
                                        <span
                                            className={
                                                skill.capability === "read-only"
                                                    ? "inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-muted"
                                                    : "inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
                                            }
                                        >
                                            {skill.capability === "read-only" ? (
                                                <>
                                                    <Eye className="h-3 w-3" />
                                                    只读
                                                </>
                                            ) : (
                                                <>
                                                    <Zap className="h-3 w-3" />
                                                    可调参
                                                </>
                                            )}
                                        </span>
                                    )}
                                    {skill.featured && (
                                        <span className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                                            <Sparkles className="h-3 w-3" />
                                            推荐
                                        </span>
                                    )}
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                    <span className="truncate font-mono text-[13px] text-muted">{skill.slug}</span>
                                    <CopyChip value={skill.slug} title="点击复制 slug" iconOnly />
                                </div>
                                {/* 社区信息紧跟标题：下载 / 评分 / 收藏 / 版本 / 更新时间 */}
                                <CommunityStatLine
                                    kind="skill"
                                    slug={skill.slug}
                                    baseRating={skill.rating}
                                    baseDownloads={skill.downloads}
                                    version={skill.version}
                                    updatedAt={skill.updatedAt}
                                />
                            </div>
                        </div>

                        <p className="mt-4 leading-7 text-muted">{skill.description}</p>

                        {/* 标签：紧贴描述下方，不放进分组表 */}
                        {skill.tags.length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                                {skill.tags.map((t) => (
                                    <span key={t} className="rounded bg-surface-2 px-1.5 py-0.5 text-muted">
                                        #{t}
                                    </span>
                                ))}
                            </div>
                        )}

                        <EntryMetaGroups
                            platforms={skill.platforms}
                            clients={skill.clients}
                            models={skill.models}
                            sourceUrl={skill.sourceUrl}
                            paperUrl={skill.paperUrl}
                            license={skill.license}
                        />
                    </header>

                    {/* 内容区：概述 / SKILL.md / 版本历史 / 评论
              三个内容 Tab 各对应 skills/<slug>/ 下的一份文件，各自带一个仓库编辑入口 */}
                    <EntryContentTabs
                        overview={
                            <article className="prose-skill">
                                <GuideBody renderer="md" source={skill.readme} />
                            </article>
                        }
                        skillMdRaw={skill.skillMd}
                        changelog={<ChangelogList entries={skill.changelog ?? []} currentVersion={skill.version} />}
                        comments={<EntryComments kind="skill" slug={skill.slug} />}
                        changelogCount={skill.changelog?.length ?? 0}
                        editUrls={editUrls}
                    />
                </div>

                {/* 右栏 */}
                <aside className="lg:self-start">
                    <EntrySidebar
                        kind="skill"
                        slug={skill.slug}
                        name={skill.name}
                        baseDownloads={skill.downloads}
                        copyText={skill.skillMd}
                        editUrl={editUrls.skillMd}
                        installHint="复制下方全部内容，粘贴到 Claude / ChatGPT / Cursor 等对话里，或作为 System Prompt 使用；也可把整个目录放进 .claude/skills/ 直接作为 Skill 加载。原始 .ulg 等数据始终留在你自己的设备上。"
                        related={related}
                    />
                </aside>

                <JsonLd
                    data={softwareAppJsonLd({
                        url: `${SITE_URL}/skills/${slug}`,
                        name: skill.name,
                        description: skill.description,
                        version: skill.version,
                        dateModified: skill.updatedAt,
                    })}
                />
            </div>
        </div>
    );
}
