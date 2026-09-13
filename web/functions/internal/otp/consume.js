// POST /internal/otp/consume  仅供 Node 侧 SSR 调用（INTERNAL_SECRET）。
// 校验验证码：10 分钟过期、最多错 5 次、成功一次性消费（删除）。
import { getKv, sha256Hex } from "../../_lib/kv.js";
import { jsonResponse, readJson, assertInternal, isValidEmail } from "../../_lib/http.js";

const MAX_ATTEMPTS = 5;

export async function onRequestPost({ request, env }) {
  if (!assertInternal(request, env)) return jsonResponse({ error: "forbidden" }, 403);

  const body = await readJson(request);
  if (!body || !isValidEmail(body.email) || typeof body.code !== "string") {
    return jsonResponse({ ok: false, reason: "invalid-request" }, 400);
  }
  const email = body.email.toLowerCase().trim();
  const kv = getKv(env);
  if (!kv) return jsonResponse({ error: "KV binding missing" }, 500);

  const emailHash = await sha256Hex(email);
  const key = `otp_${emailHash}`;
  const record = await kv.get(key, { type: "json" });

  if (!record?.codeHash) return jsonResponse({ ok: false, reason: "no-code" }, 400);

  if (Date.now() > record.expiresAt) {
    await kv.delete(key);
    return jsonResponse({ ok: false, reason: "expired" }, 400);
  }
  if ((record.attempts ?? 0) >= MAX_ATTEMPTS) {
    await kv.delete(key);
    return jsonResponse({ ok: false, reason: "too-many-attempts" }, 429);
  }

  const codeHash = await sha256Hex(body.code.trim());
  if (codeHash !== record.codeHash) {
    await kv.put(
      key,
      JSON.stringify({ ...record, attempts: (record.attempts ?? 0) + 1 }),
    );
    return jsonResponse({ ok: false, reason: "wrong-code" }, 400);
  }

  await kv.delete(key);
  return jsonResponse({ ok: true });
}
