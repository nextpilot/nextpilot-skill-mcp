import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText, Star, Download } from "lucide-react";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getAllSkills, getSkillBySlug } from "@/lib/skills";
import { CATEGORY_LABEL } from "@/lib/constants";

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
  return { title: `${skill.name} · NextPilot UAV AI`, description: skill.description };
}

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const skill = getSkillBySlug(slug);
  if (!skill) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/skills"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        返回 Skill 库
      </Link>

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
      </div>

      <h1 className="text-3xl font-bold">{skill.name}</h1>
      <p className="mt-3 leading-7 text-muted">{skill.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted">
        <span className="flex items-center gap-1">
          <Star className="h-4 w-4 fill-warning text-warning" />
          {skill.rating.toFixed(1)}
        </span>
        <span className="flex items-center gap-1">
          <Download className="h-4 w-4" />
          {skill.downloads} 次获取
        </span>
        <span>更新于 {skill.updatedAt}</span>
      </div>

      {(skill.sourceUrl || skill.paperUrl) && (
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
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
              <span
                key={m}
                className="rounded-md bg-surface-2 px-2.5 py-1 text-xs text-[#c3d0e0]"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      <article className="prose-skill mt-8">
        <MDXRemote source={skill.body} />
      </article>
    </div>
  );
}
