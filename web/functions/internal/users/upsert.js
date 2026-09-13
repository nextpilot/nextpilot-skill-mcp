// POST /internal/users/upsert  仅供 Node 侧 SSR 调用（INTERNAL_SECRET）。
// body: {mode:"email", email, name?} 或 {mode:"github", githubId, email?, name?}
import { getKv } from "../../_lib/kv.js";
import { jsonResponse, readJson, assertInternal, isValidEmail } from "../../_lib/http.js";
import { upsertEmailUser, upsertGithubUser } from "../../_lib/users.js";

export async function onRequestPost({ request, env }) {
  if (!assertInternal(request, env)) return jsonResponse({ error: "forbidden" }, 403);

  const body = await readJson(request);
  const kv = getKv(env);
  if (!kv) return jsonResponse({ error: "KV binding missing" }, 500);

  try {
    if (body?.mode === "github") {
      if (!body.githubId) return jsonResponse({ error: "githubId required" }, 400);
      const user = await upsertGithubUser(kv, body.githubId, body.email ?? null, body.name ?? null);
      return jsonResponse({ ok: true, user });
    }
    if (body?.mode === "email") {
      if (!isValidEmail(body.email)) return jsonResponse({ error: "invalid email" }, 400);
      const user = await upsertEmailUser(kv, body.email, body.name ?? null);
      return jsonResponse({ ok: true, user });
    }
    return jsonResponse({ error: "unknown mode" }, 400);
  } catch (err) {
    return jsonResponse({ error: "internal error", detail: String(err?.message ?? err) }, 500);
  }
}
