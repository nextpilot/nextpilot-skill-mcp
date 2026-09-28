// KV 绑定获取、key 规则与通用计数。
// KV 平台约束（官方文档）：key 仅允许字母/数字/下划线、长度 ≤512B；value ≤25MB；
// 最终一致（60s 全球同步）；put 无 TTL，过期时间写进 value 惰性清理。
//
// ⚠️ **平台硬限制（2026-09-28 排查线上确认）**：
//   1. EdgeOne 官方明确「KV 仅边缘函数可用，Node Functions（opennext SSR 云函数）不支持」
//      —— Next.js 全栈部署下 /api/* 被 rewrite 进 SSR 垫片（见 next.config.ts），
//      因此 **SSR 侧拿不到 KV 注入，所有 KV 写路径在该形态下必然降级/丢失**；
//   2. 绑定变量是**全局变量而非 env 属性**（控制台绑定时的变量名必须与本文件的
//      NEXTPILOT_KV 约定一字不差），getKv 的 globalThis 通道 + env 兜底扫描就是为
//      兼容这两种注入方式；若哪天平台给 SSR 也注入了 KV，代码无需再改。

export const FREE_DAILY_QUOTA = 10; // 登录用户每日（冲刺 3 会员体系再分层）
export const ANONYMOUS_DAILY_QUOTA = 3; // 匿名设备每日
export const ANONYMOUS_IP_DAILY_CAP = 30; // 按 IP 的防滥用日上限（NAT 场景宽松）
export const REPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 免费版保留 7 天

/** @returns {any} */
export function getKv(env) {
    // 官方示例中绑定变量以全局方式注入，同时也可能挂在 env 上，两种都兼容
    const direct = globalThis.NEXTPILOT_KV ?? env?.NEXTPILOT_KV;
    if (direct) return direct;
    // 兜底：控制台里绑定变量名若与约定不一致，就从 env 中找出具备 KV 接口的对象。
    // 只认 get/put/list 齐备的对象，避免误命中外层普通对象。
    for (const value of Object.values(env ?? {})) {
        if (
            value &&
            typeof value.get === "function" &&
            typeof value.put === "function" &&
            typeof value.list === "function"
        ) {
            return value;
        }
    }
    return null;
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
        // 只在真正翻页时才带上 cursor：部分平台的 list 实现不接受显式的 undefined
        const options = { prefix, limit: 256 };
        if (cursor) options.cursor = cursor;
        const result = await kv.list(options);
        // 空前缀匹配时部分平台返回 keys:null 而非 []，直接 for...of 会抛错
        for (const k of result.keys ?? []) keys.push(k.key ?? k.name);
        cursor = result.complete ? null : result.cursor;
    } while (cursor);
    return keys;
}

// 日配额唯一键：登录 use_{uid}_{day}_{event}，匿名 anuse_{device}_{day}_{event}
export const usagePrefix = (uid, day = dateStamp()) => `use_${uid}_${day}_`;
export const anonUsagePrefix = (deviceHash, day = dateStamp()) => `anuse_${deviceHash}_${day}_`;
export const reportPrefix = (uid) => `rpt_${uid}_`;

/** 设备 ID 清洗为 KV key 安全片段（localStorage 随机 hex，这里再兜一层） */
export function sanitizeDeviceId(id) {
    return String(id ?? "")
        .replace(/[^A-Za-z0-9_]/g, "")
        .slice(0, 64);
}

export function clientIp(request) {
    return (
        request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
    );
}
