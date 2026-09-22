// POST /api/download/track —— Skill/MCP "获取"计数（防刷：设备+IP 每日只计一次）。
// GET  /api/download/track —— 排行榜（实时从 KV 唯一键聚合，seed 基值见 body 外的 stats 接口）。
//
// KV 计数键（key 只能含字母数字下划线）：
//   dle_{kind}_{slugKey}_{day}_{deviceHash}   设备日唯一事件（计数用）
//   dip_{ipHash}_{day}_{...}                  无设备 ID 时的 IP 兜底
// slug → slugKey 映射存 dst_{kind}_{slugKey} = 原始 slug（首次事件时写入）。
import { getKv, listAll, sha256Hex, dateStamp, sanitizeId, clientIp } from "../../_lib/kv.js";
import { jsonResponse, readJson } from "../../_lib/http.js";

const KINDS = new Set(["skill", "mcp"]);
const eventPrefix = (kind, slugKey, day) => `dle_${kind}_${slugKey}_${day}_`;
// 全量事件键：dle_{kind}_{slugKey}_{day}_{device}，按 kind 聚合用
const kindPrefix = (kind) => `dle_${kind}_`;

/** 从事件键解析 kind/slugKey/day：dle_skill_aerial_xxx_20260914_dev */
function parseEventKey(key) {
    const rest = key.slice(4); // kind_...
    const m = rest.match(/^([a-z]+)_(.+)_(\d{8})_[A-Za-z0-9_]+$/);
    if (!m) return null;
    return { kind: m[1], slugKey: m[2], day: m[3] };
}

async function recordEvent(kv, { kind, slug, deviceId, ipHash }) {
    const slugKey = sanitizeId(slug);
    const day = dateStamp();
    const deviceHash = deviceId ? sanitizeId(deviceId) : ipHash;
    const eventKey = `${eventPrefix(kind, slugKey, day)}${deviceHash}`;
    // 唯一键 put 天然去重（同设备同日覆盖）
    await kv.put(eventKey, String(Date.now()));
    await kv.put(`dst_${kind}_${slugKey}`, slug);
    if (!deviceId) {
        await kv.put(`dip_${ipHash}_${day}_${kind}_${slugKey}`, String(Date.now()));
    }
}

async function aggregate(kv, kind) {
    const keys = await listAll(kv, kindPrefix(kind));
    const counts = new Map(); // slugKey -> count（跨天去重设备已由唯一键保证）
    for (const key of keys) {
        const p = parseEventKey(key);
        if (!p || p.kind !== kind) continue;
        counts.set(p.slugKey, (counts.get(p.slugKey) ?? 0) + 1);
    }
    // 取回原始 slug
    const entries = await Promise.all(
        [...counts.entries()].map(async ([slugKey, count]) => {
            const slug = (await kv.get(`dst_${kind}_${slugKey}`)) ?? slugKey;
            return { slug: String(slug), delta: count };
        }),
    );
    return entries;
}

export async function onRequestPost({ request, env }) {
    const body = await readJson(request);
    const kind = body?.kind;
    const slug = typeof body?.slug === "string" ? body.slug : "";
    if (!KINDS.has(kind) || !/^[a-z0-9-]{1,128}$/.test(slug)) {
        return jsonResponse({ error: "bad kind/slug" }, 400);
    }
    const kv = getKv(env);
    if (!kv) return jsonResponse({ ok: true, delta: 0, note: "KV 未绑定，仅本地展示" });

    const deviceId = typeof body.deviceId === "string" ? sanitizeId(body.deviceId).slice(0, 64) : "";
    const ipHash = await sha256Hex(clientIp(request));
    await recordEvent(kv, { kind, slug, deviceId, ipHash });
    return jsonResponse({ ok: true });
}

export async function onRequestGet({ request, env, url }) {
    const kv = getKv(env);
    if (!kv) return jsonResponse({ leaderboard: [] });
    const kind = (url ? new URL(request.url).searchParams.get("kind") : "skill") ?? "skill";
    if (!KINDS.has(kind)) return jsonResponse({ error: "bad kind" }, 400);
    const entries = await aggregate(kv, kind);
    entries.sort((a, b) => b.delta - a.delta);
    return jsonResponse({ leaderboard: entries.slice(0, 20) });
}
