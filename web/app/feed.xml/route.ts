import { getAllSkills } from "@/lib/skills";
import { getAllMcpServers } from "@/lib/mcp";
import { getAllGuideDocs } from "@/lib/guide";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site-config";

export const runtime = "nodejs";

export function GET() {
    // RSS 的 <link> 与 <guid> 是订阅者点开的地址，域名取自构建期常量（`SITE_URL`）。
    const siteUrl = SITE_URL;
    const siteName = SITE_NAME;
    const siteDescription = SITE_DESCRIPTION;
    const items: string[] = [];

    const skills = getAllSkills();
    for (const skill of skills) {
        const url = `${siteUrl}/zh/skills/${skill.slug}`;
        const date = skill.updatedAt ? new Date(skill.updatedAt) : new Date();
        items.push(`    <item>
      <title>${xmlEscape(skill.name)}</title>
      <link>${xmlEscape(url)}</link>
      <guid isPermaLink="true">${xmlEscape(url)}</guid>
      <description>${xmlEscape(skill.description || skill.name)}</description>
      <category>Skill</category>
      <pubDate>${date.toUTCString()}</pubDate>
    </item>`);
    }

    const mcps = getAllMcpServers();
    for (const mcp of mcps) {
        const url = `${siteUrl}/zh/mcp/${mcp.slug}`;
        const date = mcp.updatedAt ? new Date(mcp.updatedAt) : new Date();
        items.push(`    <item>
      <title>${xmlEscape(mcp.name)}</title>
      <link>${xmlEscape(url)}</link>
      <guid isPermaLink="true">${xmlEscape(url)}</guid>
      <description>${xmlEscape(mcp.description || mcp.name)}</description>
      <category>MCP</category>
      <pubDate>${date.toUTCString()}</pubDate>
    </item>`);
    }

    const guides = getAllGuideDocs();
    for (const guide of guides) {
        if (!guide.slug) continue;
        const url = `${siteUrl}${guide.href}`;
        items.push(`    <item>
      <title>${xmlEscape(guide.title || guide.slug)}</title>
      <link>${xmlEscape(url)}</link>
      <guid isPermaLink="true">${xmlEscape(url)}</guid>
      <description>${xmlEscape(guide.description || guide.title || "")}</description>
      <category>Guide</category>
      <pubDate>${new Date().toUTCString()}</pubDate>
    </item>`);
    }

    items.sort((a, b) => b.localeCompare(a));

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(siteName)}</title>
    <link>${xmlEscape(siteUrl)}</link>
    <description>${xmlEscape(siteDescription)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${xmlEscape(`${siteUrl}/feed.xml`)}" rel="self" type="application/rss+xml"/>
${items.join("\n")}
  </channel>
</rss>`;

    return new Response(rss, {
        headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
    });
}

function xmlEscape(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
