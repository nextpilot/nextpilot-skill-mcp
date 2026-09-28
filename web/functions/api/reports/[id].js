// /api/reports/:id —— GET：单份报告详情 / DELETE：删除单条（仅限本人前缀）。
// 超过 7 天 TTL 的记录惰性删除。
//
// ⚠️ 位置说明：本文件在 functions/api/reports/ 子目录里，与列表 index.js 同目录。
// 早先它曾放在顶层、与 functions/api/reports.js（列表）**同名共存**，线上实测
// （2026-09-28）EdgeOne 会丢弃整个 reports/ 子目录（api/reports 正常、api/reports/<id>
// 带 eo-pages-inner-scf-status 穿透），故把列表改为 reports/index.js，消除同名冲突。
import { getKv, reportPrefix, sanitizeId, REPORT_TTL_MS } from "../../_lib/kv.js";
import { getSessionUser } from "../../_lib/auth.js";
import { jsonResponse } from "../../_lib/http.js";

export async function onRequestGet({ request, env, params }) {
    const session = await getSessionUser(request, env);
    if (!session) return jsonResponse({ error: "unauthorized" }, 401);
    const kv = getKv(env);
    if (!kv) return jsonResponse({ error: "KV binding missing" }, 500);

    const id = sanitizeId(params?.id ?? "");
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

    const id = sanitizeId(params?.id ?? "");
    await kv.delete(`${reportPrefix(session.uid)}${id}`);
    return jsonResponse({ ok: true });
}
