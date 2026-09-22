// 冲刺 2 阶段 0 Spike：验证 Next.js 全栈构建与 /functions 边缘函数并存、路由可命中。
// 访问 GET /ping 应返回 JSON。
export function onRequestGet() {
    return new Response(JSON.stringify({ ok: true, runtime: "edge-function", ts: Date.now() }), {
        headers: { "content-type": "application/json; charset=utf-8" },
    });
}
