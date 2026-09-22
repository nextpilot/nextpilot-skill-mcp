/**
 * 首页上传 → 分析页自动解析的文件传递。
 * 用 IndexedDB 暂存一个 File 对象（localStorage 存不了二进制），
 * 分析页挂载时取出并立即开始分析，读完即删。
 */
const DB_NAME = "nextpilot";
const STORE = "pending";
const KEY = "log";

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function putPendingLog(file: File): Promise<boolean> {
    if (typeof indexedDB === "undefined") return false;
    try {
        const db = await openDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put(file, KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
        return true;
    } catch {
        return false;
    }
}

export async function takePendingLog(): Promise<File | null> {
    if (typeof indexedDB === "undefined") return null;
    try {
        const db = await openDb();
        const file = await new Promise<File | null>((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            const store = tx.objectStore(STORE);
            const get = store.get(KEY);
            get.onsuccess = () => {
                const value = get.result as File | undefined;
                store.delete(KEY);
                resolve(value instanceof File ? value : null);
            };
            get.onerror = () => reject(get.error);
        });
        db.close();
        return file;
    } catch {
        return null;
    }
}
