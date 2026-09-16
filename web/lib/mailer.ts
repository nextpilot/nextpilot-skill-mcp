import "server-only";
import nodemailer from "nodemailer";

/**
 * 零资质发信：个人 QQ / 163 邮箱 SMTP（授权码登录，非登录密码）。
 * 环境变量：SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS SMTP_FROM
 * 例：smtp.qq.com / 465 / true / 发件邮箱 / 授权码
 */

let transporterPromise: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporterPromise) return transporterPromise;
  const port = Number(process.env.SMTP_PORT ?? 465);
  transporterPromise = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporterPromise;
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
  const displayName = "NextPilot Skill";
  await getTransporter().sendMail({
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
