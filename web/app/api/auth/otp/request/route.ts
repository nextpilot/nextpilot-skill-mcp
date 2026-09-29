import { NextRequest, NextResponse } from "next/server";
import { requestEmailOtp } from "@/lib/internal-kv";
import { isMailConfigured, sendOtpEmail } from "@/lib/mailer";
import { log } from "@/lib/log";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
    let body: { email?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
    }

    const email = String(body.email ?? "")
        .toLowerCase()
        .trim();
    if (!EMAIL_RE.test(email) || email.length > 200) {
        return NextResponse.json({ ok: false, error: "邮箱格式不正确" }, { status: 400 });
    }
    // await 不能省：isMailConfigured 现在是 async（SMTP 密码可能来自后台 KV）。
    // 少了 await，`!Promise` 恒为 false，"邮件服务没配"这个分支就成了死代码。
    if (!(await isMailConfigured())) {
        return NextResponse.json({ ok: false, error: "邮件服务尚未配置 SMTP，暂时无法发送验证码" }, { status: 503 });
    }

    const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;

    const result = await requestEmailOtp(email, ip).catch((err: unknown) => {
        log.err("requestEmailOtp failed", err);
        return null;
    });
    if (!result) {
        return NextResponse.json({ ok: false, error: "验证码服务暂时不可用" }, { status: 502 });
    }
    if (!result.ok) {
        if (result.reason === "too-frequent") {
            return NextResponse.json(
                { ok: false, error: `发送过于频繁，请 ${result.retryAfter ?? 60} 秒后再试` },
                { status: 429 },
            );
        }
        if (result.reason.includes("daily-limit")) {
            return NextResponse.json({ ok: false, error: "今日验证码发送次数已达上限" }, { status: 429 });
        }
        return NextResponse.json({ ok: false, error: "验证码发送失败" }, { status: 400 });
    }

    try {
        await sendOtpEmail(email, result.code);
    } catch (err) {
        log.err("sendOtpEmail failed", err);
        return NextResponse.json({ ok: false, error: "邮件发送失败，请稍后再试" }, { status: 502 });
    }

    // 不回传验证码；只提示成功
    return NextResponse.json({ ok: true });
}
