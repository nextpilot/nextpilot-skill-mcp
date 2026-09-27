// GET /api/issue-probe —— 代理到根层边缘函数 /issue-probe（含 KV + DeepSeek 探测）。
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

async function proxy(target: string, request: NextRequest) {
    try {
        const resp = await fetch(target, { headers: request.headers });
        const body = await resp.text();
        return new NextResponse(body, {
            status: resp.status,
            headers: { "content-type": resp.headers.get("content-type") ?? "application/json" },
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ ok: false, error: `代理失败: ${message}` }, { status: 502 });
    }
}

export function GET(request: NextRequest) {
    const url = new URL(request.url);
    return proxy(`${url.origin}/issue-probe${url.search}`, request);
}
