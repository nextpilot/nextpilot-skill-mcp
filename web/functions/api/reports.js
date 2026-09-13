// GET /api/reports —— 当前用户的云端报告列表（元数据，不含 findings/正文）。
// 超过 7 天 TTL 的记录惰性删除。
import { getKv, listAll, reportPrefix, REPORT_TTL_MS } from "../_lib/kv.js";
import { getSessionUser } from "../_lib/auth.js";
import { jsonResponse } from "../_lib/http.js";

export async function onRequestGet({ request, env, waitUntil }) {
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
    const expiresAt = typeof rec.expiresAt === "number" ? rec.expiresAt : Date.parse(rec.analyzedAt) + REPORT_TTL_MS;
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
      findingCount: Array.isArray(rec.findings) ? rec.findings.length : 0,
      hasReport: Boolean(rec.aiMarkdown),
      analyzedAt: rec.analyzedAt,
    });
  }
  if (cleanup.length) waitUntil?.(Promise.allSettled(cleanup));

  records.sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
  return jsonResponse({ reports: records });
}
