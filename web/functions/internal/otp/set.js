// POST /internal/otp/set  仅供 Node 侧 SSR 调用（AUTH_INTERNAL_SECRET）。
// 生成 6 位验证码（哈希后存 KV），执行发码频控；明文 code 只经内网返回给 Node 侧发送邮件。
import { getKv, sha256Hex, dateStamp, clientIp } from "../../_lib/kv.js";
import { jsonResponse, readJson, assertInternal, isValidEmail } from "../../_lib/http.js";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 分钟有效
const RESEND_INTERVAL_MS = 60 * 1000; // 同邮箱 60s 一次
const DAILY_PER_EMAIL = 10;
const DAILY_PER_IP = 30;

export async function onRequestPost({ request, env }) {
  if (!assertInternal(request, env)) return jsonResponse({ error: "forbidden" }, 403);

  const body = await readJson(request);
  if (!body || !isValidEmail(body.email)) {
    return jsonResponse({ ok: false, reason: "invalid-email" }, 400);
  }
  const email = body.email.toLowerCase().trim();
  const kv = getKv(env);
  if (!kv) return jsonResponse({ error: "KV binding missing" }, 500);

  const now = Date.now();
  const day = dateStamp(new Date(now));
  const emailHash = await sha256Hex(email);
  const ipHash = await sha256Hex(clientIp(request));

  // 60 秒重发窗口
  const resendRecord = await kv.get(`otprl_${emailHash}`, { type: "json" });
  if (resendRecord?.nextAt && resendRecord.nextAt > now) {
    return jsonResponse(
      { ok: false, reason: "too-frequent", retryAfter: Math.ceil((resendRecord.nextAt - now) / 1000) },
      429,
    );
  }

  // 每日限额（按邮箱 / 按 IP）
  const emailCount = Number((await kv.get(`otpd_${day}_${emailHash}`)) ?? 0);
  if (emailCount >= DAILY_PER_EMAIL) {
    return jsonResponse({ ok: false, reason: "email-daily-limit" }, 429);
  }
  const ipCount = Number((await kv.get(`otpi_${day}_${ipHash}`)) ?? 0);
  if (ipCount >= DAILY_PER_IP) {
    return jsonResponse({ ok: false, reason: "ip-daily-limit" }, 429);
  }

  // 6 位数字验证码，明文只返回给持密钥的 Node 侧
  const code = String(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000);
  const codeHash = await sha256Hex(code);

  await kv.put(
    `otp_${emailHash}`,
    JSON.stringify({ codeHash, expiresAt: now + OTP_TTL_MS, attempts: 0 }),
  );
  await kv.put(`otprl_${emailHash}`, JSON.stringify({ nextAt: now + RESEND_INTERVAL_MS }));
  await kv.put(`otpd_${day}_${emailHash}`, String(emailCount + 1));
  await kv.put(`otpi_${day}_${ipHash}`, String(ipCount + 1));

  return jsonResponse({ ok: true, code });
}
