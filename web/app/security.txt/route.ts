import { SITE_URL } from "@/lib/site-config";
import { log } from "@/lib/log";

export function GET() {
    try {
        // Canonical 是"本文件的权威地址"，域名取自构建期常量（`SITE_URL`）。
        const canonicalBase = SITE_URL;
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
        log.err("[security.txt] Failed to generate response:", error);
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
