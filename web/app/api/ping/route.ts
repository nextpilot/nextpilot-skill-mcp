// GET /api/ping：冒烟探针（直接 Next.js 实现，无需 KV）。
import { NextResponse } from "next/server";

export function GET() {
    return NextResponse.json({ ok: true, runtime: "nextjs", ts: Date.now() });
}
