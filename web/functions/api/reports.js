// /api/reports        —— GET：当前用户的云端报告列表（元数据，不含 findings/正文）
// /api/reports/:id    —— GET：单份报告详情 / DELETE：删除单条（仅限本人前缀）
// 超过 7 天 TTL 的记录惰性删除。
//
// ⚠️ 详情/删除**并入本文件**，不用 functions/api/reports/[id].js 子目录：线上实测
// （2026-09-28）EdgeOne 边缘函数层不部署「与同名文件共存的子目录」——
// api/reports.js 正常（/api/reports → 401 无穿透标记），但 api/reports/[id].js 与
// api/reports/[[default]].js 都不被部署，请求带 eo-pages-inner-scf-status 穿透到 SSR、
// 落 app/api/[[...path]] 兜底 404，导致「查看分析结果」「删除云端记录」线上全废。
// 故改为单文件内按 URL 尾段分流：/api/reports（无 id）与 /api/reports/<id>。
import { getKv, listAll, reportPrefix, REPORT_TTL_MS } from "../_lib/kv.js";
import { getSessionUser } from "../_lib/auth.js";
import { jsonResponse } from "../_lib/http.js";

/** 从请求 URL 取出 :id 尾段；/api/reports 本身返回空串 */
function tailId(request) {
    const segs = new URL(request.url).pathname.split("/").filter(Boolean);
    // pathname 形如 /api/reports 或 /api/reports/<id>
    return segs.length >= 3 ? decodeURIComponent(segs[2]) : "";
}

function sanitizeId(id) {
    return String(id).replace(/[^A-Za-z0-9_]/g, "");
}

export async function onRequestGet({ request, env, waitUntil }) {
    const id = tailId(request);
    if (id) return getOne(request, env, id);

    const session = await getSessionUser(request, env);
    if (!session) return jsonResponse({ error: "unauthorized" }, 401);
    const kv = getKv(env);
    if (!kv) return jsonResponse({ error: "KV binding missing" }, 500);

    const keys = await listAll(kv, reportPrefix(session.uid));
    const now = Date.now();
    const records = [];
    const cleanup = [];

    for (const key of keys) {
        const rec = await kv.get(key, { type: "json" });
        if (!rec) continue;
        const expiresAt =
            typeof rec.expiresAt === "number" ? rec.expiresAt : Date.parse(rec.analyzedAt) + REPORT_TTL_MS;
        if (now > expiresAt) {
            cleanup.push(kv.delete(key));
            continue;
        }
        records.push({
            id: rec.id,
            fileName: rec.fileName,
            fileSize: rec.fileSize,
            durationSec: rec.durationSec,
            platform: rec.platform,
            vehicleType: rec.vehicleType,
            parserVersion: rec.parserVersion,
            logHash: rec.logHash,
            // 历史卡片用：记录起始时刻、机架编号与软件版本串（源是存档里的 report.facts）
            // 软件版本串必须一起带上：本地行用 facts.firmwareDisplay 渲染，云端行少了它就会退回
            // 裸哈希，同一份日志在两个来源下显示不一样
            startUtc: rec.facts?.startUtc,
            airframeId: rec.facts?.airframeId,
            firmwareDisplay: rec.facts?.firmwareDisplay,
            fwReleaseType: rec.facts?.fwReleaseType,
            firmware: rec.facts?.firmware,
            verSw: rec.verSw,
            verHw: rec.verHw,
            findingCount: Array.isArray(rec.findings) ? rec.findings.length : 0,
            hasReport: Boolean(rec.aiMarkdown),
            analyzedAt: rec.analyzedAt,
        });
    }
    if (cleanup.length) waitUntil?.(Promise.allSettled(cleanup));

    records.sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
    return jsonResponse({ reports: records });
}

/** 单份报告详情：鉴权 → 取 KV → TTL 校验 */
async function getOne(request, env, rawId) {
    const session = await getSessionUser(request, env);
    if (!session) return jsonResponse({ error: "unauthorized" }, 401);
    const kv = getKv(env);
    if (!kv) return jsonResponse({ error: "KV binding missing" }, 500);

    const id = sanitizeId(rawId);
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

    const id = sanitizeId(tailId(request));
    if (!id) return jsonResponse({ error: "not found" }, 404);
    await kv.delete(`${reportPrefix(session.uid)}${id}`);
    return jsonResponse({ ok: true });
}
