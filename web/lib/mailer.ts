import "server-only";
import nodemailer from "nodemailer";
import { getSiteSettings } from "@/lib/site-settings";

/**
 * 零资质发信：个人 QQ / 163 邮箱 SMTP（授权码登录，非登录密码）。
 * 环境变量：SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS SMTP_FROM
 * 例：smtp.qq.com / 465 / true / 发件邮箱 / 授权码
 *
 * SMTP_PASS 后台可覆盖（`/admin/settings`）：授权码过期或被吊销时，改一下就能继续发信，
 * 不用动控制台再重新部署。取值口径是 `后台值 || 环境变量`，后台没填就用环境变量。
 */

let transporterPromise: ReturnType<typeof nodemailer.createTransport> | null = null;

async function getTransporter() {
    // 注意：transporter 会缓存，但密码不缓存，每次发信前重新取一次，
    // 后台换掉授权码后最多 60 秒（site-settings 的缓存时长）生效。
    const pass = (await getSiteSettings()).smtpPass || process.env.SMTP_PASS;
    if (transporterPromise) {
        // 复用连接配置，但把最新的密码塞回去（nodemailer 的 auth 是可变对象）
        const t = transporterPromise as unknown as { options?: { auth?: { pass?: string } } };
        if (t.options?.auth) t.options.auth.pass = pass;
        return transporterPromise;
    }
    // `??` 兜不住空字符串（控制台把 SMTP_PORT 留空时 env 是 ""，Number("") === 0 → 端口 0，
    // OTP 邮件全挂），项目在 Pyodide 路径上踩过同款坑，凡 env 兜底一律用 `||`。
    const port = Number(process.env.SMTP_PORT) || 465;
    transporterPromise = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass } : undefined,
    });
    return transporterPromise;
}

export async function isMailConfigured(): Promise<boolean> {
    const pass = (await getSiteSettings()).smtpPass || process.env.SMTP_PASS;
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && pass);
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
    const displayName = "NextPilot Skill";
    await (
        await getTransporter()
    ).sendMail({
        from: `${displayName} <${from}>`,
        to,
        subject: `【NextPilot】登录验证码 ${code}`,
        text: `您的登录验证码是：${code}\n\n10 分钟内有效，请勿泄露给他人。如非本人操作，请忽略本邮件。`,
        html: `<div style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 16px">NextPilot Skill 登录</h2>
  <p style="color:#444">您的验证码是：</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:12px 0">${code}</p>
  <p style="color:#888;font-size:13px">10 分钟内有效，请勿泄露给他人。如非本人操作，请忽略本邮件。</p>
</div>`,
    });
}
