// GET /api/ping —— EdgeOne Pages 线上冒烟探针。
// 边缘函数版本见 functions/api/ping.js（/api/ping 也命中它，两个入口等效）。
import { NextResponse } from "next/server";

export function GET() {
    return NextResponse.json({ ok: true, runtime: "nextjs", ts: Date.now() });
}
