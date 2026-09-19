import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { splitHeading, headingId } from "./heading";
import { GUIDE_DIR } from "./content-dir";

export interface GuideHeading {
  id: string;
  /** 锚点用中文生成，不受界面语言影响 */
  zh: string;
  en: string;
  level: 2 | 3;
}

export interface GuideDoc {
  slug: string;
  href: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  group: string;
  groupEn: string;
  order: number;
  body: string;
  headings: GuideHeading[];
  /**
   * 正文渲染器。手写页面是 `.mdx`（走 MDX，可用 <Callout> 等组件）；
   * `knowledge/` 派生过来的 `.md` 走普通 markdown——那些文档里有 `{占位符}`、
   * `meta/<tag>.json` 这类内容，MDX 会当成 JSX 表达式解析。
   */
  renderer: "mdx" | "md";
}

export interface GuideNavItem {
  href: string;
  zh: string;
  en: string;
}

export interface GuideNavGroup {
  zh: string;
  en: string;
  items: GuideNavItem[];
}

/**
 * 抽取目录用的标题。
 * 只认正文里的 `##` / `###`，且必须跳过围栏代码块——提示词示例里出现 `# 注释` 是常态。
 */
function extractHeadings(body: string): GuideHeading[] {
  const headings: GuideHeading[] = [];
  let inFence = false;

  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;

    const { zh, en } = splitHeading(match[2]);
    headings.push({ id: headingId(zh), zh, en, level: match[1].length as 2 | 3 });
  }

  return headings;
}

/** index.mdx 对应用户访问的 /guide，其余文件用文件名做 slug */
function slugOf(fileName: string): string {
  const base = fileName.replace(/\.mdx?$/, "");
  return base === "index" ? "" : base;
}

export function hrefOf(slug: string): string {
  return slug ? `/guide/${slug}` : "/guide";
}

function parseGuideFile(fileName: string): GuideDoc {
  const raw = fs.readFileSync(path.join(GUIDE_DIR, fileName), "utf8");
  const { data, content } = matter(raw);
  const body = content.trim();
  const slug = slugOf(fileName);

  return {
    slug,
    href: hrefOf(slug),
    title: String(data.title ?? slug),
    titleEn: String(data.titleEn ?? data.title ?? slug),
    description: String(data.description ?? ""),
    descriptionEn: String(data.descriptionEn ?? data.description ?? ""),
    group: String(data.group ?? "其他"),
    groupEn: String(data.groupEn ?? data.group ?? "Other"),
    order: Number(data.order ?? 999),
    body,
    headings: extractHeadings(body),
    renderer: fileName.endsWith(".mdx") ? "mdx" : "md",
  };
}

export function getAllGuideDocs(): GuideDoc[] {
  if (!fs.existsSync(GUIDE_DIR)) return [];
  return fs
    .readdirSync(GUIDE_DIR)
    .filter((f) => /\.mdx?$/.test(f))
    .map(parseGuideFile)
    .sort((a, b) => a.order - b.order);
}

export function getGuideDoc(slug: string): GuideDoc | undefined {
  return getAllGuideDocs().find((doc) => doc.slug === slug);
}

/**
 * 左侧导航。分组不单独维护，按组内最小 order 排序——
 * 新增一页只需写 frontmatter，不用再回来改导航数组。
 */
export function getGuideNav(): GuideNavGroup[] {
  const groups = new Map<string, { groupEn: string; minOrder: number; items: GuideNavItem[] }>();

  for (const doc of getAllGuideDocs()) {
    const entry = groups.get(doc.group) ?? {
      groupEn: doc.groupEn,
      minOrder: doc.order,
      items: [],
    };
    entry.minOrder = Math.min(entry.minOrder, doc.order);
    entry.items.push({ href: doc.href, zh: doc.title, en: doc.titleEn });
    groups.set(doc.group, entry);
  }

  return [...groups.entries()]
    .sort((a, b) => a[1].minOrder - b[1].minOrder)
    .map(([zh, entry]) => ({ zh, en: entry.groupEn, items: entry.items }));
}

/** 页脚的上/下一篇 */
export function getGuideNeighbors(slug: string) {
  const docs = getAllGuideDocs();
  const index = docs.findIndex((doc) => doc.slug === slug);
  return {
    prev: index > 0 ? docs[index - 1] : undefined,
    next: index >= 0 && index < docs.length - 1 ? docs[index + 1] : undefined,
  };
}
