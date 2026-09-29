/**
 * /api/* 兜底路由：没有对应边缘函数 / 真实 route 的 /api/* 请求到这里。
 *
 * 线上实测确认的执行模型：EdgeOne 把 functions/ 部署为边缘函数、按 method 匹配拦截；
 * method 不匹配（如 explain 只有 Post、请求 GET）或路径无函数则穿透回源 SSR；
 * 而 opennext SSR 运行时不应用 rewrites()，穿透请求直接走文件系统路由 → 被 [locale]
 * 动态段截胡（/api/issue 渲染出 200 HTML「提交反馈」页，比 404 更糟）。
 *
 * 兜底路由在文件系统路由里排在一切具体路由之后，因此只接住「其他谁都没匹配」的
 * /api/* 请求，让它们返回 JSON 404 而不是 HTML 页。本地 dev 下 beforeFiles rewrite
 * 优先于文件系统路由，白名单内的路径照常进垫片，白名单外的落到这里，两端行为一致。
 */
export const runtime = "nodejs";

function notFound(): Response {
    return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: {
            "content-type": "application/json; charset=utf-8",
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
