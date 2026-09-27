// GET /api/ping —— EdgeOne Pages 冒烟探针（Next.js API Route 实现）。
import { NextResponse } from "next/server";

export function GET() {
    return NextResponse.json({ ok: true, runtime: "nextjs", ts: Date.now() });
}
