import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getAllSkills, getSkillBySlug } from "@/lib/skills";
import { CATEGORY_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { SkillActionsBar } from "@/components/SkillActionsBar";
import { SkillContentTabs } from "@/components/SkillContentTabs";
import { CopyChip } from "@/components/CopyChip";
import { LocalizedText } from "@/components/LocalizedText";

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

  // “复制 Skill 内容”给出可直接粘贴给 AI 助手的完整文本（含标题与描述）
  const copyText = `# ${skill.name}\n\n${skill.description}\n\n${skill.body}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/skills"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        返回 Skill 库
      </Link>

      {/* 元信息行：分类 / 平台 / 许可证 / 版本 / 更新时间 + 可复制 slug */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
          {CATEGORY_LABEL[skill.category]}
        </span>
        {skill.platforms.map((p) => (
          <span key={p} className="rounded-md border border-border px-2 py-0.5 text-muted">
            {p}
          </span>
        ))}
        {skill.license && (
          <span className="rounded-md border border-border px-2 py-0.5 text-muted">
            {skill.license}
          </span>
        )}
        {skill.version && (
          <span className="rounded-md border border-border px-2 py-0.5 text-muted">
            v{skill.version}
          </span>
        )}
        <span className="text-muted">
          <LocalizedText zh="更新于" en="Updated" /> {formatDate(skill.updatedAt)}
        </span>
        <CopyChip value={skill.slug} title="点击复制 slug" className="ml-auto" />
      </div>

      <h1 className="text-3xl font-bold">{skill.name}</h1>
      <p className="mt-3 leading-7 text-muted">{skill.description}</p>

      <SkillActionsBar
        kind="skill"
        slug={skill.slug}
        baseRating={skill.rating}
        baseDownloads={skill.downloads}
        copyText={copyText}
        copyLabel="复制 Skill 内容"
      />

      {(skill.sourceUrl || skill.paperUrl) && (
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {skill.sourceUrl && (
            <a
              href={skill.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 hover:border-primary/50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              开源仓库
            </a>
          )}
          {skill.paperUrl && (
            <a
              href={skill.paperUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 hover:border-primary/50"
            >
              <FileText className="h-3.5 w-3.5" />
              相关论文
            </a>
          )}
        </div>
      )}

      {skill.models.length > 0 && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-4">
          <p className="mb-2 text-xs text-muted">依赖模型 / 技术</p>
          <div className="flex flex-wrap gap-2">
            {skill.models.map((m) => (
              <span key={m} className="rounded-md bg-surface-2 px-2.5 py-1 text-xs text-text">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 内容区：正文（渲染）/ Markdown 原文，原文可复制、可下载 .md */}
      <SkillContentTabs
        contentHtml={
          <article className="prose-skill">
            <MDXRemote source={skill.body} />
          </article>
        }
        markdown={copyText}
        fileName={`${skill.slug}.md`}
      />
    </div>
  );
}
