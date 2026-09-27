import type { MetadataRoute } from "next";
import { getAllSkills } from "@/lib/skills";
import { getAllMcpServers } from "@/lib/mcp";
import { getAllGuideDocs } from "@/lib/guide";
import { getSiteSettings } from "@/lib/site-settings";

// sitemap 里的每条 URL 都是给搜索引擎的"门牌号"——用构建期的常量域名拼，后台改完域名后
// 整份 sitemap 全是错地址（比没有 sitemap 更糟：等于主动提交一批死链）。
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = (await getSiteSettings()).siteUrl;

    const locales = ["zh", "en"];

    const staticPaths = [
        { path: "", priority: 1, changeFreq: "weekly" as const },
        { path: "/analyze", priority: 0.9, changeFreq: "weekly" as const },
        { path: "/guide", priority: 0.8, changeFreq: "weekly" as const },
        { path: "/skills", priority: 0.8, changeFreq: "daily" as const },
        { path: "/mcp", priority: 0.8, changeFreq: "weekly" as const },
        { path: "/issue", priority: 0.4, changeFreq: "monthly" as const },
        { path: "/tools/editor", priority: 0.5, changeFreq: "monthly" as const },
        { path: "/tools/probe", priority: 0.5, changeFreq: "monthly" as const },
    ];

    const entries: MetadataRoute.Sitemap = [];

    for (const locale of locales) {
        for (const { path, priority, changeFreq } of staticPaths) {
            entries.push({
                url: `${baseUrl}/${locale}${path}`,
                lastModified: new Date(),
                changeFrequency: changeFreq,
                priority,
                alternates: {
                    languages: Object.fromEntries(
                        locales.map((l) => [l === "zh" ? "zh-CN" : "en", `${baseUrl}/${l}${path}`]),
                    ),
                },
            });
        }
    }

    const guideDocs = getAllGuideDocs();
    for (const doc of guideDocs) {
        if (!doc.slug) continue;
        for (const locale of locales) {
            entries.push({
                url: `${baseUrl}/${locale}${doc.href}`,
                lastModified: new Date(),
                changeFrequency: "monthly" as const,
                priority: 0.6,
                alternates: {
                    languages: Object.fromEntries(
                        locales.map((l) => [l === "zh" ? "zh-CN" : "en", `${baseUrl}/${l}${doc.href}`]),
                    ),
                },
            });
        }
    }

    const skills = getAllSkills();
    for (const skill of skills) {
        for (const locale of locales) {
            entries.push({
                url: `${baseUrl}/${locale}/skills/${skill.slug}`,
                lastModified: skill.updatedAt ? new Date(skill.updatedAt) : new Date(),
                changeFrequency: "weekly" as const,
                priority: 0.7,
                alternates: {
                    languages: Object.fromEntries(
                        locales.map((l) => [l === "zh" ? "zh-CN" : "en", `${baseUrl}/${l}/skills/${skill.slug}`]),
                    ),
                },
            });
        }
    }

    const mcps = getAllMcpServers();
    for (const mcp of mcps) {
        for (const locale of locales) {
            entries.push({
                url: `${baseUrl}/${locale}/mcp/${mcp.slug}`,
                lastModified: mcp.updatedAt ? new Date(mcp.updatedAt) : new Date(),
                changeFrequency: "weekly" as const,
                priority: 0.7,
                alternates: {
                    languages: Object.fromEntries(
                        locales.map((l) => [l === "zh" ? "zh-CN" : "en", `${baseUrl}/${l}/mcp/${mcp.slug}`]),
                    ),
                },
            });
        }
    }

    return entries;
}
