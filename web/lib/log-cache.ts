/**
 * 本机原始日志缓存（IndexedDB）。历史回看只存档"结论 + AI 报告"，图表/事件/参数要重新
 * 解析原始 .ulg 才能恢复；原始日志从不上传，本机留一份即可一键恢复完整视图。
 * 容量双上限（总预算 + 条目数），超出按 LRU（lastUsedAt）淘汰；数据只落用户浏览器（隐私约定见 CLAUDE.md）。
 */
const DB_NAME = "nextpilot-cache";
const STORE = "logs";
const VERSION = 1;

/** 总预算 300MB；条目上限 10 份（.ulg 常见 2–16MB，够用又不至于失控） */
export const LOG_CACHE_BUDGET_BYTES = 300 * 1024 * 1024;
export const LOG_CACHE_MAX_ENTRIES = 10;

interface CachedLog {
    hash: string;
    name: string;
    size: number;
    savedAt: number;
    /** 最近一次被用于恢复的时间，LRU 依据 */
    lastUsedAt: number;
    bytes: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "hash" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
    return new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** 超出上限时按 lastUsedAt 从旧到新淘汰；先算总量再删，保证一次到位 */
async function evictIfNeeded(db: IDBDatabase): Promise<void> {
    const all = await tx<CachedLog[]>(db, "readonly", (s) => s.getAll() as IDBRequest<CachedLog[]>);
    let total = all.reduce((n, e) => n + (e.size || 0), 0);
    let count = all.length;
    if (total <= LOG_CACHE_BUDGET_BYTES && count <= LOG_CACHE_MAX_ENTRIES) return;

    const byAge = [...all].sort((a, b) => (a.lastUsedAt || a.savedAt) - (b.lastUsedAt || b.savedAt));
    for (const entry of byAge) {
        if (total <= LOG_CACHE_BUDGET_BYTES && count <= LOG_CACHE_MAX_ENTRIES) break;
        await tx(db, "readwrite", (s) => s.delete(entry.hash) as IDBRequest<undefined>);
        total -= entry.size || 0;
        count -= 1;
    }
}

/** 缓存一份原始日志（同 hash 覆盖）；返回是否成功 */
export async function putCachedLog(hash: string, name: string, bytes: Uint8Array): Promise<boolean> {
    if (!hash || typeof indexedDB === "undefined") return false;
    try {
        const db = await openDb();
        const now = Date.now();
        // 复制成独立 ArrayBuffer，避免持有更大的底层 buffer
        const buf = bytes.slice().buffer;
        await tx(
            db,
            "readwrite",
            (s) =>
                s.put({
                    hash,
                    name,
                    size: buf.byteLength,
                    savedAt: now,
                    lastUsedAt: now,
                    bytes: buf,
                }) as IDBRequest<IDBValidKey>,
        );
        await evictIfNeeded(db);
        db.close();
        return true;
    } catch {
        return false;
    }
}

/** 取出缓存日志；顺带更新 lastUsedAt（LRU） */
export async function getCachedLog(hash: string): Promise<{ name: string; bytes: Uint8Array } | null> {
    if (!hash || typeof indexedDB === "undefined") return null;
    try {
        const db = await openDb();
        const entry = await tx<CachedLog | undefined>(
            db,
            "readonly",
            (s) => s.get(hash) as IDBRequest<CachedLog | undefined>,
        );
        if (!entry) {
            db.close();
            return null;
        }
        await tx(db, "readwrite", (s) => s.put({ ...entry, lastUsedAt: Date.now() }) as IDBRequest<IDBValidKey>);
        db.close();
        return { name: entry.name, bytes: new Uint8Array(entry.bytes) };
    } catch {
        return null;
    }
}

/** 本机已缓存的日志指纹集合（用于决定历史条目上是否显示"恢复完整数据"） */
export async function cachedLogHashes(): Promise<Set<string>> {
    if (typeof indexedDB === "undefined") return new Set();
    try {
        const db = await openDb();
        const all = await tx<CachedLog[]>(db, "readonly", (s) => s.getAll() as IDBRequest<CachedLog[]>);
        db.close();
        return new Set(all.map((e) => e.hash));
    } catch {
        return new Set();
    }
}

export async function removeCachedLog(hash: string): Promise<void> {
    if (!hash || typeof indexedDB === "undefined") return;
    try {
        const db = await openDb();
        await tx(db, "readwrite", (s) => s.delete(hash) as IDBRequest<undefined>);
        db.close();
    } catch {
        /* 忽略 */
    }
}

export async function clearCachedLogs(): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    try {
        const db = await openDb();
        await tx(db, "readwrite", (s) => s.clear() as IDBRequest<undefined>);
        db.close();
    } catch {
        /* 忽略 */
    }
}

/** 缓存占用（份数 + 字节），用于在界面上如实告知用户 */
export async function cacheUsage(): Promise<{ entries: number; bytes: number }> {
    if (typeof indexedDB === "undefined") return { entries: 0, bytes: 0 };
    try {
        const db = await openDb();
        const all = await tx<CachedLog[]>(db, "readonly", (s) => s.getAll() as IDBRequest<CachedLog[]>);
        db.close();
        return { entries: all.length, bytes: all.reduce((n, e) => n + (e.size || 0), 0) };
    } catch {
        return { entries: 0, bytes: 0 };
    }
}
