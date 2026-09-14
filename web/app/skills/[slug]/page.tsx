import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getAllSkills, getSkillBySlug } from "@/lib/skills";
import { CATEGORY_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { SkillSidebar, type SidebarMetaRow } from "@/components/SkillSidebar";
import { SkillContentTabs } from "@/components/SkillContentTabs";
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

  const meta: SidebarMetaRow[] = [
    { label: "分类", value: CATEGORY_LABEL[skill.category] },
    { label: "适用平台", value: skill.platforms.join(" / ") || "—" },
    { label: "依赖模型", value: skill.models.join("、") || "—" },
    { label: "版本", value: skill.version ? `v${skill.version}` : "—" },
    { label: "更新时间", value: formatDate(skill.updatedAt) },
    { label: "许可证", value: skill.license ?? "—" },
    {
      label: "来源",
      value:
        skill.sourceUrl || skill.paperUrl ? (
          <span className="flex flex-col items-end gap-1">
            {skill.sourceUrl && (
              <a
                href={skill.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                开源仓库
              </a>
            )}
            {skill.paperUrl && (
              <a
                href={skill.paperUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <FileText className="h-3 w-3" />
                相关论文
              </a>
            )}
          </span>
        ) : (
          "—"
        ),
    },
  ];

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
          {/* 标题区 */}
          <header className="mb-8">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                {CATEGORY_LABEL[skill.category]}
              </span>
              {skill.platforms.map((p) => (
                <span key={p} className="rounded-md border border-border px-2 py-0.5 text-muted">
                  {p}
                </span>
              ))}
              {skill.version && (
                <span className="rounded-md border border-border px-2 py-0.5 text-muted">
                  v{skill.version}
                </span>
              )}
              <span className="text-muted">更新于 {formatDate(skill.updatedAt)}</span>
              <CopyChip value={skill.slug} title="点击复制 slug" className="ml-auto" />
            </div>

            <h1 className="text-2xl font-bold md:text-3xl">{skill.name}</h1>
            <p className="mt-2 font-mono text-[13px] text-muted">{skill.slug}</p>
            <p className="mt-4 leading-7 text-muted">{skill.description}</p>
          </header>

          {/* 内容区：Tab 切换正文 / Markdown 原文 */}
          <SkillContentTabs
            contentHtml={
              <article className="prose-skill">
                <MDXRemote source={skill.body} />
              </article>
            }
            markdown={copyText}
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
            meta={meta}
            related={related}
          />
        </aside>
      </div>
    </div>
  );
}
