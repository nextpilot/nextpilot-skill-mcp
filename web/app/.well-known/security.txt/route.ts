import { SITE_URL } from "@/lib/site-config";
import { log } from "@/lib/log";

export async function GET() {
    try {
        const body = [
            `Contact: mailto:latercomer@qq.com`,
            `Expires: ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()}`,
            `Preferred-Languages: zh, en`,
            `Canonical: ${SITE_URL}/.well-known/security.txt`,
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
