/**
 * /api/* 兜底路由 —— 没有对应 Edge Function 或专用路由的 /api/* 请求到这里。
 *
 * EdgeOne 的 Edge Functions 优先于 Next.js 路由。如果某个 /api/* 有对应的
 * functions/api/*.js 的边缘函数，它会在边缘层被拦截并返回。只有边缘函数不存在
 * 或崩溃时才落到这里。
 *
 * 不落到 [locale] catch-all 渲染首页 —— API 请求应该始终返回 JSON。
 */
export const runtime = "nodejs";

function notFound(): Response {
    return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
        },
    });
}

export function GET() {
    return notFound();
}

export function POST() {
    return notFound();
}

export function PUT() {
    return notFound();
}

export function DELETE() {
    return notFound();
}

export function PATCH() {
    return notFound();
}
