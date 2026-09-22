// 用户 upsert 逻辑（内部边缘函数共用）。
// 索引键与资料键分离，兼容 GitHub 与邮箱两种登录方式。
import { getKv, newUid, sha256Hex } from "./kv.js";

/**
 * 邮箱登录：em_{emailHash} 索引 -> uid；首次登录自动建档。
 */
export async function upsertEmailUser(kv, email, name) {
    const normalized = email.toLowerCase().trim();
    const emailHash = await sha256Hex(normalized);
    const indexKey = `em_${emailHash}`;

    let uid = await kv.get(indexKey);
    const isNew = !uid;
    if (isNew) {
        uid = newUid();
        await kv.put(indexKey, uid);
    }

    const recordKey = `usr_${uid}`;
    const existing = await kv.get(recordKey, { type: "json" });
    if (!existing) {
        const record = {
            uid,
            email: normalized,
            name: name || normalized.split("@")[0],
            plan: "free",
            loginTypes: ["email"],
            createdAt: new Date().toISOString(),
        };
        await kv.put(recordKey, JSON.stringify(record));
        return { ...record, isNew: true };
    }
    return { ...existing, isNew };
}

/**
 * GitHub 登录：gh_{providerAccountId} 索引 -> uid；首次登录自动建档。
 */
export async function upsertGithubUser(kv, githubId, email, name) {
    const indexKey = `gh_${String(githubId).replace(/[^A-Za-z0-9_]/g, "")}`;

    let uid = await kv.get(indexKey);
    const isNew = !uid;
    if (isNew) {
        uid = newUid();
        await kv.put(indexKey, uid);
    }

    const recordKey = `usr_${uid}`;
    const existing = await kv.get(recordKey, { type: "json" });
    if (!existing) {
        const record = {
            uid,
            email: email || null,
            name: name || `gh_${githubId}`,
            plan: "free",
            githubId: String(githubId),
            loginTypes: ["github"],
            createdAt: new Date().toISOString(),
        };
        await kv.put(recordKey, JSON.stringify(record));
        return { ...record, isNew: true };
    }
    return { ...existing, isNew };
}

export { getKv };
