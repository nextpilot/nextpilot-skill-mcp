// KV 绑定获取、key 规则与通用计数。
// KV 平台约束（官方文档）：key 仅允许字母/数字/下划线、长度 ≤512B；value ≤25MB；
// 最终一致（60s 全球同步）；put 无 TTL，过期时间写进 value 惰性清理。

export const FREE_MONTHLY_QUOTA = 5;
export const REPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 免费版保留 7 天

/** @returns {any} */
export function getKv(env) {
  // 官方示例中绑定变量以全局方式注入，同时也可能挂在 env 上，两种都兼容
  return globalThis.NEXTPILOT_KV ?? env?.NEXTPILOT_KV ?? null;
}

export async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newUid() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return "u" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 去除 UUID 连字符等非允许字符，保证 key 合法 */
export function sanitizeId(id) {
  return String(id).replace(/[^A-Za-z0-9_]/g, "");
}

export function monthStamp(d = new Date()) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function dateStamp(d = new Date()) {
  return `${monthStamp(d)}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 列举某前缀下全部 key（自动翻页，单页上限 256） */
export async function listAll(kv, prefix) {
  const keys = [];
  let cursor;
  do {
    const result = await kv.list({ prefix, limit: 256, cursor });
    for (const k of result.keys) keys.push(k.key);
    cursor = result.complete ? null : result.cursor;
  } while (cursor);
  return keys;
}

export const usagePrefix = (uid, month = monthStamp()) => `use_${uid}_${month}_`;
export const reportPrefix = (uid) => `rpt_${uid}_`;

export function clientIp(request) {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
