import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { SkillMeta } from "./types";

const SKILLS_DIR = path.join(process.cwd(), "content", "skills");

export interface Skill extends SkillMeta {
  /** MDX 正文（System Prompt、示例、参考资料） */
  body: string;
}

function parseSkillFile(fileName: string): Skill {
  const fullPath = path.join(SKILLS_DIR, fileName);
  const raw = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(raw);
  const slug = fileName.replace(/\.mdx$/, "");

  return {
    slug,
    name: String(data.name ?? slug),
    description: String(data.description ?? ""),
    category: data.category as SkillMeta["category"],
    platforms: (data.platforms ?? []) as SkillMeta["platforms"],
    models: (data.models ?? []) as string[],
    tags: (data.tags ?? []) as string[],
    rating: Number(data.rating ?? 0),
    downloads: Number(data.downloads ?? 0),
    featured: Boolean(data.featured),
    sourceUrl: data.sourceUrl ? String(data.sourceUrl) : undefined,
    paperUrl: data.paperUrl ? String(data.paperUrl) : undefined,
    license: data.license ? String(data.license) : undefined,
    version: data.version ? String(data.version) : undefined,
    updatedAt: String(data.updatedAt ?? ""),
    body: content.trim(),
  };
}

export function getAllSkills(): Skill[] {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  const files = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".mdx"));
  return files
    .map(parseSkillFile)
    .sort((a, b) => b.rating - a.rating || b.downloads - a.downloads);
}

export function getSkillBySlug(slug: string): Skill | undefined {
  const fullPath = path.join(SKILLS_DIR, `${slug}.mdx`);
  if (!fs.existsSync(fullPath)) return undefined;
  return parseSkillFile(`${slug}.mdx`);
}

/** 提供给客户端 Fuse.js 的轻量索引（不含正文） */
export function getSkillIndex(): SkillMeta[] {
  return getAllSkills().map(({ body: _body, ...meta }) => meta);
}
