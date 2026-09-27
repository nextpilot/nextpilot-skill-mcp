// /api/blob —— 代理到根层边缘函数 /blob（含 EdgeOne Blob 存储绑定）。
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

async function proxy(target: string, request: NextRequest) {
    try {
        const resp = await fetch(target, {
            method: request.method,
            headers: request.headers,
            body: request.method !== "GET" && request.method !== "HEAD" ? await request.arrayBuffer() : undefined,
        });
        const body = await resp.arrayBuffer();
        return new NextResponse(body, {
            status: resp.status,
            headers: {
                "content-type": resp.headers.get("content-type") ?? "application/octet-stream",
                "cache-control": resp.headers.get("cache-control") ?? "no-cache",
            },
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ ok: false, error: `代理失败: ${message}` }, { status: 502 });
    }
}

export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    return proxy(`${url.origin}/blob${url.search}`, request);
}
export async function POST(request: NextRequest) {
    const url = new URL(request.url);
    return proxy(`${url.origin}/blob${url.search}`, request);
}
export async function DELETE(request: NextRequest) {
    const url = new URL(request.url);
    return proxy(`${url.origin}/blob${url.search}`, request);
}
