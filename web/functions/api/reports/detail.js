// GET/DELETE /api/reports/detail?id=<id> —— 单份报告详情 / 删除单条（仅限本人前缀）。
// 超过 7 天 TTL 的记录惰性删除。
//
// ⚠️ 为什么用 `detail?id=` 而不是 REST 风格的 `/api/reports/:id`（[id].js）：
// 线上实测（2026-09-28，响应头 eo-pages-inner-scf-status 区分执行层）——
// EdgeOne 边缘函数**不部署带动态段 [xxx] 的函数文件名**：
//   · functions/api/reports/index.js  → /api/reports 正常（401，无穿透标记）
//   · functions/api/reports/[id].js   → /api/reports/<id> 穿透到 SSR、落兜底 404
//   · functions/api/reports/[[default]].js → 同样不部署
// 导致「查看分析结果」「删除云端记录」线上全废。改用静态路径 + 查询参数：
// 前端调 /api/reports/detail?id=<id>，本文件为静态名 detail.js，可正常部署。
// 另注：顶层 api/reports.js（列表）与 api/reports/ 子目录同名共存时子目录会被丢弃，
// 故列表也放进了子目录（./index.js）。
import { getKv, reportPrefix, sanitizeId, REPORT_TTL_MS } from "../../_lib/kv.js";
import { getSessionUser } from "../../_lib/auth.js";
import { jsonResponse } from "../../_lib/http.js";

function queryId(request) {
    return sanitizeId(new URL(request.url).searchParams.get("id") ?? "");
}

export async function onRequestGet({ request, env }) {
    const session = await getSessionUser(request, env);
    if (!session) return jsonResponse({ error: "unauthorized" }, 401);
    const kv = getKv(env);
    if (!kv) return jsonResponse({ error: "KV binding missing" }, 500);

    const id = queryId(request);
    if (!id) return jsonResponse({ error: "not found" }, 404);
    const rec = await kv.get(`${reportPrefix(session.uid)}${id}`, { type: "json" });
    if (!rec) return jsonResponse({ error: "not found" }, 404);
    const expiresAt = typeof rec.expiresAt === "number" ? rec.expiresAt : Date.parse(rec.analyzedAt) + REPORT_TTL_MS;
    if (Date.now() > expiresAt) {
        await kv.delete(`${reportPrefix(session.uid)}${id}`);
        return jsonResponse({ error: "expired" }, 404);
    }
    return jsonResponse({ report: rec });
}

export async function onRequestDelete({ request, env }) {
    const session = await getSessionUser(request, env);
    if (!session) return jsonResponse({ error: "unauthorized" }, 401);
    const kv = getKv(env);
    if (!kv) return jsonResponse({ error: "KV binding missing" }, 500);

    const id = queryId(request);
    if (!id) return jsonResponse({ error: "not found" }, 404);
    await kv.delete(`${reportPrefix(session.uid)}${id}`);
    return jsonResponse({ ok: true });
}
