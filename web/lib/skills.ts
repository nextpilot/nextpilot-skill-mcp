import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { pinyin } from "pinyin-pro";
import type { SkillFile, SkillMeta } from "./types";
import { parseChangelogFromMarkdown } from "./changelog";
import { SKILLS_DIR } from "./content-dir";

export interface Skill extends SkillMeta {
    /** README.md 正文：给人看，站点「概述」Tab */
    readme: string;
    /** SKILL.md 全文（含 frontmatter）：给 AI 看，站点「SKILL.md」Tab + 复制 / 下载 */
    skillMd: string;
}

/**
 * 一个 Skill = 一个目录，目录名即 slug，三份文件各管一件事：
 *   SKILL.md 给 AI 看，frontmatter 只放 Agent Skills 规范字段，站点额外字段一律收进 metadata
 *   （规范限定 metadata 是 string→string 映射，列表写成逗号分隔、数字写成字符串），整个目录拷进 .claude/skills/ 即可用；
 *   README.md 给人看（「概述」Tab）；CHANGELOG.md 给人看（「版本历史」Tab），同时是 version/updatedAt 唯一真源，frontmatter 不存以免分叉。
 */
function readFileOrThrow(dir: string, name: string): string {
    const full = path.join(dir, name);
    if (!fs.existsSync(full)) {
        // 缺哪份就说缺哪份：三份文件的用途不同，一句"内容不完整"让人无从下手
        throw new Error(
            `Skill ${path.basename(dir)} 缺少 ${name}（真源目录：web/content/skills/${path.basename(dir)}/）`,
        );
    }
    return fs.readFileSync(full, "utf8");
}

function parseSkillDir(dirName: string): Skill {
    const dir = path.join(SKILLS_DIR, dirName);
    const skillMd = readFileOrThrow(dir, "SKILL.md");
    const readme = readFileOrThrow(dir, "README.md");
    const changelogMd = readFileOrThrow(dir, "CHANGELOG.md");

    const { data } = matter(skillMd);
    const meta = (data.metadata ?? {}) as Record<string, string>;
    const changelog = parseChangelogFromMarkdown(changelogMd);
    const latest = changelog[0];

    return {
        slug: dirName,
        // 站点标题用中文展示名；规范要求的英文 `name` 就等于目录名，不在这里重复暴露
        name: meta.display_name ?? String(data.name ?? dirName),
        description: String(data.description ?? ""),
        category: meta.category as SkillMeta["category"],
        platforms: splitList(meta.platforms) as SkillMeta["platforms"],
        models: splitList(meta.models),
        tags: splitList(meta.tags),
        clients: splitList(meta.clients),
        rating: Number(meta.seed_rating ?? 0),
        downloads: Number(meta.seed_downloads ?? 0),
        featured: meta.featured === "true",
        sourceUrl: meta.repo_url,
        paperUrl: meta.paper_url,
        license: data.license ? String(data.license) : undefined,
        icon: meta.icon,
        capability: meta.capability as SkillMeta["capability"],
        version: latest?.version,
        changelog,
        updatedAt: latest?.date ?? "",
        readme: readme.trim(),
        skillMd: skillMd.trimEnd(),
        _pinyin: pinyinSkill(
            meta.display_name ?? String(data.name ?? dirName),
            String(data.description ?? ""),
            splitList(meta.tags),
        ),
    };
}

/** 构建期预计算拼音，用于浏览器端 Fuse.js 拼音容错搜索 */
function pinyinSkill(name: string, description: string, tags: string[]): string {
    const parts = [name, ...tags.map((t) => `#${t}`)];
    // 描述取前 60 字（足够匹配核心关键词，避免索引过长）
    if (description) parts.push(description.slice(0, 60));
    return parts.map((s) => pinyin(s, { toneType: "none", nonZh: "consecutive" }).replace(/\s+/g, " ")).join(" ");
}

/** metadata 只允许 string→string，列表在写入时被转成 `A, B, C`，这里拆回来 */
function splitList(v: string | undefined): string[] {
    if (!v) return [];
    return v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

export function getAllSkills(): Skill[] {
    if (!fs.existsSync(SKILLS_DIR)) return [];
    const dirs = fs
        .readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, d.name, "SKILL.md")))
        .map((d) => d.name);
    return dirs.map(parseSkillDir).sort((a, b) => b.rating - a.rating || b.downloads - a.downloads);
}

export function getSkillBySlug(slug: string): Skill | undefined {
    const dir = path.join(SKILLS_DIR, slug);
    if (!fs.existsSync(path.join(dir, "SKILL.md"))) return undefined;
    return parseSkillDir(slug);
}

/** 站点当文本展示的扩展名白名单，不在名单里（.ulg 等）就不进「文件」Tab */
const TEXT_EXTS = new Set([".md", ".markdown", ".yaml", ".yml", ".json", ".py", ".txt", ".toml", ".sh", ".js", ".ts"]);

/** 列出 Skill 目录下全部文本文件（含内容），供详情页「文件」Tab。只在详情页调用：
 *  getAllSkills() 不带文件内容，列表页/索引保持轻量。 */
export function getSkillFiles(slug: string): SkillFile[] {
    const dir = path.join(SKILLS_DIR, slug);
    if (!fs.existsSync(dir)) return [];
    const out: SkillFile[] = [];
    const walk = (rel: string) => {
        for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
            const relPath = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) walk(relPath);
            else if (e.isFile() && TEXT_EXTS.has(path.extname(e.name).toLowerCase())) {
                const full = path.join(dir, relPath);
                out.push({ path: relPath, size: fs.statSync(full).size, content: fs.readFileSync(full, "utf8") });
            }
        }
    };
    walk("");
    // 子目录在前、根目录文件在后，各自按路径字母序，与常见文件浏览器的「目录优先」一致
    out.sort((a, b) => {
        const da = a.path.includes("/");
        const db = b.path.includes("/");
        if (da !== db) return da ? -1 : 1;
        return a.path.localeCompare(b.path);
    });
    return out;
}

/** 提供给客户端 Fuse.js 的轻量索引（不含正文） */
export function getSkillIndex(): SkillMeta[] {
    return getAllSkills().map(({ readme: _readme, skillMd: _skillMd, ...meta }) => meta);
}
