// GET  /api/rating?kind=skill&slug=...  → {avg, count, mine}
// POST /api/rating {kind, slug, stars(1-5), deviceId} → 更新当前设备评分（同设备可改）
//
// KV：
//   rte_{kind}_{slugKey}_{deviceHash} = 1..5   一设备一键（改评分覆盖）
//   rts_{kind}_{slugKey}                        slugKey → 原始 slug
import {
  getKv,
  listAll,
  sha256Hex,
  sanitizeId,
  clientIp,
} from "../_lib/kv.js";
import { jsonResponse, readJson } from "../_lib/http.js";

const KINDS = new Set(["skill", "mcp"]);
const SLUG_RE = /^[a-z0-9-]{1,128}$/;

function ratingPrefix(kind, slugKey) {
  return `rte_${kind}_${slugKey}_`;
}

async function aggregate(kv, kind, slugKey, deviceHash) {
  const keys = await listAll(kv, ratingPrefix(kind, slugKey));
  let sum = 0;
  let count = 0;
  let mine = 0;
  for (const key of keys) {
    const v = Number(await kv.get(key));
    if (!v || v < 1 || v > 5) continue;
    sum += v;
    count += 1;
    if (deviceHash && key.endsWith(`_${deviceHash}`)) mine = v;
  }
  return { avg: count ? Math.round((sum / count) * 10) / 10 : 0, count, mine };
}

export async function onRequestGet({ request, env }) {
  const kv = getKv(env);
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "skill";
  const slug = url.searchParams.get("slug") ?? "";
  if (!KINDS.has(kind) || !SLUG_RE.test(slug)) {
    return jsonResponse({ error: "bad kind/slug" }, 400);
  }
  if (!kv) return jsonResponse({ avg: 0, count: 0, mine: 0 });

  const deviceRaw = (request.headers.get("x-device-id") ?? "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 64);
  const deviceHash = deviceRaw || (await sha256Hex(clientIp(request)));
  const stats = await aggregate(kv, kind, sanitizeId(slug), deviceHash);
  return jsonResponse(stats);
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const kind = body?.kind;
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const stars = Number(body?.stars);
  if (!KINDS.has(kind) || !SLUG_RE.test(slug) || ![1, 2, 3, 4, 5].includes(stars)) {
    return jsonResponse({ error: "参数不合法" }, 400);
  }
  const kv = getKv(env);
  if (!kv) return jsonResponse({ error: "KV 未绑定", avg: 0, count: 0 }, 503);

  const deviceRaw = typeof body.deviceId === "string"
    ? body.deviceId.replace(/[^A-Za-z0-9_]/g, "").slice(0, 64)
    : "";
  const deviceHash = deviceRaw || (await sha256Hex(clientIp(request)));
  const slugKey = sanitizeId(slug);
  await kv.put(`${ratingPrefix(kind, slugKey)}${deviceHash}`, String(stars));
  await kv.put(`rts_${kind}_${slugKey}`, slug);

  const stats = await aggregate(kv, kind, slugKey, deviceHash);
  return jsonResponse({ ok: true, ...stats });
}
