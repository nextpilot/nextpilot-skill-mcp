// GET/DELETE /api/reports/:id —— 单份报告详情或删除（仅限本人前缀）。
import { getKv, reportPrefix, sanitizeId, REPORT_TTL_MS } from "../../_lib/kv.js";
import { getSessionUser } from "../../_lib/auth.js";
import { jsonResponse } from "../../_lib/http.js";

export async function onRequestGet({ request, env, params }) {
    const session = await getSessionUser(request, env);
    if (!session) return jsonResponse({ error: "unauthorized" }, 401);
    const kv = getKv(env);
    if (!kv) return jsonResponse({ error: "KV binding missing" }, 500);

    const id = sanitizeId(params.id);
    const rec = await kv.get(`${reportPrefix(session.uid)}${id}`, { type: "json" });
    if (!rec) return jsonResponse({ error: "not found" }, 404);
    const expiresAt = typeof rec.expiresAt === "number" ? rec.expiresAt : Date.parse(rec.analyzedAt) + REPORT_TTL_MS;
    if (Date.now() > expiresAt) {
        await kv.delete(`${reportPrefix(session.uid)}${id}`);
        return jsonResponse({ error: "expired" }, 404);
    }
    return jsonResponse({ report: rec });
}

export async function onRequestDelete({ request, env, params }) {
    const session = await getSessionUser(request, env);
    if (!session) return jsonResponse({ error: "unauthorized" }, 401);
    const kv = getKv(env);
    if (!kv) return jsonResponse({ error: "KV binding missing" }, 500);

    const id = sanitizeId(params.id);
    await kv.delete(`${reportPrefix(session.uid)}${id}`);
    return jsonResponse({ ok: true });
}
