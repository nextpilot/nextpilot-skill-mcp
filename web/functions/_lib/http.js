// 边缘函数统一响应与鉴权小工具。
export function jsonResponse(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
    });
}

export async function readJson(request) {
    try {
        return await request.json();
    } catch {
        return null;
    }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email) {
    return typeof email === "string" && email.length <= 200 && EMAIL_RE.test(email);
}

/** /functions/internal/* 只允许 Node 侧 SSR 持 AUTH_EDGE_SECRET 调用 */
export function assertInternal(request, env) {
    const expected = env?.AUTH_EDGE_SECRET;
    const got = request.headers.get("x-internal-secret");
    if (!expected || !got) return false;
    if (got.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0 && got.length === expected.length;
}
