import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getAllSkills, getSkillBySlug } from "@/lib/skills";
import { CATEGORY_GLYPH } from "@/lib/constants";
import { CommunityStatLine, SkillMetaGroups } from "@/components/SkillHeaderMeta";
import { SkillSidebar } from "@/components/SkillSidebar";
import { SkillContentTabs } from "@/components/SkillContentTabs";
import { SkillComments } from "@/components/SkillComments";
import { ChangelogList } from "@/components/ChangelogList";
import { CopyChip } from "@/components/CopyChip";

export function generateStaticParams() {
  return getAllSkills().map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const skill = getSkillBySlug(slug);
  if (!skill) return {};
  return { title: `${skill.name} · NextPilot Skill MCP`, description: skill.description };
}

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const skill = getSkillBySlug(slug);
  if (!skill) notFound();

  // 可直接粘贴给 AI 助手的完整文本（标题 + 描述 + 正文）
  const copyText = `# ${skill.name}\n\n${skill.description}\n\n${skill.body}`;

  // 同类推荐（同分类下取前 4 个，排除自身）
  const related = getAllSkills()
    .filter((s) => s.slug !== skill.slug && s.category === skill.category)
    .slice(0, 4)
    .map((s) => ({ slug: s.slug, name: s.name, description: s.description }));


  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* 面包屑（对应 SkillHub 顶部 技能 / slug） */}
      <nav className="mb-8 flex items-center gap-2 text-sm" aria-label="breadcrumb">
        <Link href="/skills" className="text-muted transition-colors hover:text-text">
          Skill 库 /
        </Link>
        <span className="font-semibold">{skill.slug}</span>
      </nav>

      {/* 两栏：左栏 = 标题 + 内容（纵向堆叠），右栏 = 粘性侧栏（对应 SkillHub 的 390px 侧栏） */}
      <div className="lg:grid lg:gap-x-[50px] lg:[grid-template-columns:minmax(0,1fr)_390px]">
        <div className="min-w-0">
          {/* 标题区：图标 + 标题 + slug，其后按组展示头部信息（见 SkillHeaderMeta） */}
          <header className="mb-8">
            <div className="flex items-start gap-4">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface text-2xl"
                aria-hidden
              >
                {skill.icon ?? CATEGORY_GLYPH[skill.category]}
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold md:text-[26px]">{skill.name}</h1>
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

            <SkillMetaGroups
              category={skill.category}
              tags={skill.tags}
              platforms={skill.platforms}
              clients={skill.clients}
              models={skill.models}
              featured={skill.featured}
              sourceUrl={skill.sourceUrl}
              paperUrl={skill.paperUrl}
              license={skill.license}
            />
          </header>

          {/* 内容区：概述 / 评论 / 版本历史 */}
          <SkillContentTabs
            overview={
              <article className="prose-skill">
                <MDXRemote source={skill.body} />
              </article>
            }
            comments={<SkillComments kind="skill" slug={skill.slug} />}
            changelog={
              <ChangelogList entries={skill.changelog ?? []} currentVersion={skill.version} />
            }
            changelogCount={skill.changelog?.length ?? 0}
          />
        </div>

        {/* 右栏 */}
        <aside className="mb-10 lg:mb-0 lg:self-start">
          <SkillSidebar
            kind="skill"
            slug={skill.slug}
            name={skill.name}
            baseRating={skill.rating}
            baseDownloads={skill.downloads}
            copyText={copyText}
            installHint="复制下方全部内容，粘贴到 Claude / ChatGPT / Cursor 等对话里，或作为 System Prompt 使用；原始 .ulg 等数据始终留在你自己的设备上。"
            related={related}
          />
        </aside>
      </div>
    </div>
  );
}
