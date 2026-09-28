// GET/DELETE /api/reports/:id —— 单份报告详情或删除（仅限本人前缀）。
//
// ⚠️ 文件名用 `[[default]].js` 而非 `[id].js`：线上实测（2026-09-28）
// `functions/api/reports/[id].js` 形式的**子目录 + 一级动态段**未被 EdgeOne
// 部署（/api/reports/abc123 带 eo-pages-inner-scf-status 穿透到 SSR，靠
// app/api/[[...path]] 兜底返回 404；而同目录静态的 /api/download/track 正常）。
// 官方文档明确支持 `[[default]].js` 多级动态路径，故改用兜底式动态路由：
// 该文件接住 /api/reports/<任意>（不含更深层级）。
// 两种命名的 params 键不同，取值处同时兼容 params.id 与 params.default。
import { getKv, reportPrefix, sanitizeId, REPORT_TTL_MS } from "../../_lib/kv.js";
import { getSessionUser } from "../../_lib/auth.js";
import { jsonResponse } from "../../_lib/http.js";

/** 兼容 [id].js（params.id）与 [[default]].js（params.default）两种路由命名 */
function reportId(params) {
    const raw = params?.id ?? params?.default;
    return sanitizeId(Array.isArray(raw) ? raw[0] : raw);
}

export async function onRequestGet({ request, env, params }) {
    const session = await getSessionUser(request, env);
    if (!session) return jsonResponse({ error: "unauthorized" }, 401);
    const kv = getKv(env);
    if (!kv) return jsonResponse({ error: "KV binding missing" }, 500);

    const id = reportId(params);
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

    const id = reportId(params);
    await kv.delete(`${reportPrefix(session.uid)}${id}`);
    return jsonResponse({ ok: true });
}
