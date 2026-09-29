// 边缘侧读取服务密钥：后台 KV 覆盖 > 环境变量。
//
// 密钥也进后台的原因：轮换要动控制台环境变量 + 重新部署，而密钥恰恰是"说换就换"的东西（泄漏、到期、
// 换供应商）；放进后台改完最迟 60 秒生效，且能倒查是谁改的。
// 优先级与站点信息三层一致，只是第二层换成环境变量：密钥没有代码字面量地板（硬编码是安全事故），
// 所以 `fallback` 只能是空串。
import { getKv } from "./kv.js";
import { SETTINGS_KEY } from "./settings-schema.js";

/** 与 Node 侧 `site-settings.ts` 的 60 秒同频：改完最迟 1 分钟生效，不给每次请求加 KV 读 */
const CACHE_TTL_MS = 60_000;

// 模块级缓存（边缘实例内复用；冷启动重新读一次，不会读到一直不更新的旧值）
let cached = null;

async function loadOverrides(kv) {
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.values;
    const raw = await kv.get(SETTINGS_KEY, { type: "json" }).catch(() => null);
    const values = raw && typeof raw === "object" ? raw : null;
    cached = { at: Date.now(), values };
    return values;
}

/**
 * @param {Record<string,string|undefined>} env 边缘环境变量
 * @param {string} settingsKey 后台字段 key
 * @param {string} envName 环境变量名（没配后台时的来源）
 * @returns {Promise<string>} 空串表示"两边都没配"
 */
export async function getSecret(env, settingsKey, envName) {
    const fromEnv = String(env?.[envName] ?? "").trim();
    const kv = getKv(env);
    if (!kv) return fromEnv;

    const overrides = await loadOverrides(kv);
    const stored = overrides?.[settingsKey];
    return typeof stored === "string" && stored.trim() ? stored.trim() : fromEnv;
}
