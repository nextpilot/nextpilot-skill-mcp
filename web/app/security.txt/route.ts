import { SITE_URL } from "@/lib/site-config";
import { getSiteSettings } from "@/lib/site-settings";

export async function GET() {
    try {
        // 后台改了域名，security.txt 的 Canonical 也该跟着改（它是"本文件的权威地址"）。
        // getSiteSettings 失败（KV 没绑等）时回落到环境变量，绝不因为取不到设置就报错。
        const canonicalBase = (await getSiteSettings().catch(() => null))?.siteUrl ?? SITE_URL;
        const body = [
            `Contact: mailto:latercomer@qq.com`,
            `Expires: ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()}`,
            `Preferred-Languages: zh, en`,
            `Canonical: ${canonicalBase}/.well-known/security.txt`,
            `Policy: https://github.com/nextpilot/nextpilot-skill-mcp/security`,
            "",
        ].join("\n");

        return new Response(body, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "public, max-age=86400, s-maxage=86400",
            },
        });
    } catch (error) {
        console.error("[security.txt] Failed to generate response:", error);
        const fallback = [
            "Contact: mailto:latercomer@qq.com",
            "Expires: Sat, 27 Sep 2026 00:00:00 GMT",
            "Preferred-Languages: zh, en",
            "Canonical: https://skill.nextpilot.org/.well-known/security.txt",
            "Policy: https://github.com/nextpilot/nextpilot-skill-mcp/security",
            "",
        ].join("\n");

        return new Response(fallback, {
            status: 200,
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "public, max-age=3600",
            },
        });
    }
}
