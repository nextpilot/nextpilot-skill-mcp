import { SITE_URL } from "@/lib/site-config";

export const runtime = "nodejs";

export async function GET() {
    const body = [
        `Contact: mailto:latercomer@qq.com`,
        `Expires: ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()}`,
        `Preferred-Languages: zh, en`,
        `Canonical: ${SITE_URL}/.well-known/security.txt`,
        `Policy: ${SITE_URL}/security`,
        "",
    ].join("\n");

    return new Response(body, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
    });
}
