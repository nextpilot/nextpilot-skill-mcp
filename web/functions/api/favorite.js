// Skill / MCP 收藏（Edge Function，KV 存储）。
//   GET  /api/favorite?kind=skill&slug=xxx   → {count, favorited}
//   POST /api/favorite {kind, slug, deviceId} → 切换收藏，返回最新 {count, favorited}
//
// 身份维度用设备 ID（与下载计数一致，免登录可用）；登录后也可后续换成 uid。
// KV：fav_{kind}_{slugKey}_{deviceHash} = 1；fvs_{kind}_{slugKey} = 原始 slug
import { getKv, listAll, sha256Hex, sanitizeId, clientIp } from "../_lib/kv.js";
import { jsonResponse, readJson } from "../_lib/http.js";

const KINDS = new Set(["skill", "mcp"]);
const SLUG_RE = /^[a-z0-9-]{1,128}$/;

const favPrefix = (kind, slugKey) => `fav_${kind}_${slugKey}_`;

async function identity(request, body) {
    const raw = typeof body?.deviceId === "string" ? body.deviceId : (request.headers.get("x-device-id") ?? "");
    const cleaned = sanitizeId(raw).slice(0, 64);
    return cleaned || (await sha256Hex(clientIp(request)));
}

async function stats(kv, kind, slugKey, deviceHash) {
    const keys = await listAll(kv, favPrefix(kind, slugKey));
    return {
        count: keys.length,
        favorited: keys.some((k) => k.endsWith(`_${deviceHash}`)),
    };
}

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") ?? "skill";
    const slug = url.searchParams.get("slug") ?? "";
    if (!KINDS.has(kind) || !SLUG_RE.test(slug)) {
        return jsonResponse({ error: "bad kind/slug" }, 400);
    }
    const kv = getKv(env);
    if (!kv) return jsonResponse({ count: 0, favorited: false });

    const deviceHash = await identity(request, null);
    return jsonResponse(await stats(kv, kind, sanitizeId(slug), deviceHash));
}

export async function onRequestPost({ request, env }) {
    const body = await readJson(request);
    const kind = body?.kind;
    const slug = typeof body?.slug === "string" ? body.slug : "";
    if (!KINDS.has(kind) || !SLUG_RE.test(slug)) {
        return jsonResponse({ error: "参数不合法" }, 400);
    }
    const kv = getKv(env);
    if (!kv) return jsonResponse({ error: "KV 未绑定，暂时无法收藏" }, 503);

    const slugKey = sanitizeId(slug);
    const deviceHash = await identity(request, body);
    const key = `${favPrefix(kind, slugKey)}${deviceHash}`;

    const existing = await kv.get(key);
    if (existing) {
        await kv.delete(key);
    } else {
        await kv.put(key, String(Date.now()));
        await kv.put(`fvs_${kind}_${slugKey}`, slug);
    }

    return jsonResponse({ ok: true, ...(await stats(kv, kind, slugKey, deviceHash)) });
}
