import type { Finding, LogFacts, LogInfo, MatchedFault, MetricEntry, TrackData, TrackSeries } from "./types";
import type { StoredPlotPanel, StoredPlotSeries } from "./chart-presets";

/**
 * 报告存档（IndexedDB）。localStorage 装不下派生数据（曲线/参数等大对象），且有 5MB 配额、
 * 隐私模式写不进。三个 store：reports=结论记录（列表页直接读）；reportData=派生数据（按键取）；
 * logs=log-cache.ts 的原始 .ulg 字节。内存镜像：启动载入 reports，读写先落镜像再异步写库。
 */

const DB_NAME = "nextpilot";
const STORE_REPORTS = "reports";
const STORE_DATA = "reportData";
const VERSION = 2;

/** 老版本用的 localStorage 键：首次启动迁移进 IndexedDB，然后删掉 */
const LEGACY_KEY = "nextpilot:reports";

/** 结论记录条数上限（每条约几十 KB） */
export const REPORT_MAX_ENTRIES = 100;

/** 派生数据只留最近 N 个报告：曲线一份约 0.66MB，100 份就是 68MB；更老的报告看结论仍可，看图要重新选文件 */
export const REPORT_DATA_KEEP = 20;

export interface SavedReport {
    id: string;
    fileName: string;
    fileSize: number;
    durationSec?: number;
    platform: string;
    vehicleType?: string;
    /** 飞控软件版本（ver_sw 截断） */
    verSw?: string;
    /** 飞控硬件版本（ver_hw） */
    verHw?: string;
    parserVersion: string;
    /** 日志内容指纹（SHA-256 hex）；同一份日志重复上传时据此命中已有结果 */
    logHash?: string;
    findings: Finding[];
    /** 事实层的两块（见 types.ts 的 LogFacts 与 knowledge/engine/rule_engine.py 的报告组装） */
    facts?: LogFacts;
    metrics?: MetricEntry[];
    tags?: string[];
    guardTags?: string[];
    matchedFaults?: MatchedFault[];
    aiMarkdown: string | null;
    analyzedAt: string;
    /** 轨迹缩略图（降采样后的 [lat, lon]）：历史卡片左边那格小图用 */
    trackThumb?: TrackThumb;
}

/** 轨迹缩略图：降采样后的经纬点（约 40 个），只够画形状。不直接读派生数据里的轨迹，
 *  是因为那份记录还塞着曲线（每份约 0.66MB），读列表会整批拉进内存 */
export type TrackThumb = [number, number][];

/** 与结论分开存的派生数据：命中时直接给「消息 / 参数 / 图表」用，不必再解析原始日志 */
export interface ReportData {
    /** 产出该数据的引擎版本（源文件哈希）；与当前不一致 = 旧引擎生成，打开时重解析一次 */
    derivedVersion?: string;
    /** np_materials() 的产物：系统信息 / 消息 / 丢包 / 参数 / 变更参数 / 阶段 */
    info?: LogInfo;
    /** 曲线：各预设解析出的面板（含标题/单位/参考线/字段），打开历史时不必再要 manifest */
    plotPanels?: StoredPlotPanel[];
    /** 曲线数据：键 `${presetId}#${面板序号}` → SeriesResponse（降采样后的时序） */
    plotSeries?: StoredPlotSeries;
    /** GPS 轨迹（地图用；约 1500 点，很小） */
    track?: TrackData;
    savedAt?: number;
}

type StoredReport = SavedReport & { savedAt?: number };

/** 读取边界补默认值（老记录可能缺字段，真机上 crash 过）。这是所有外部来源进 SavedReport 的
 *  唯一闸门（索引库旧记录、localStorage 迁移、云端 KV TTL 内的旧部署记录），到前端都是无类型
 *  JSON，必须过这里；不要写 `xxx as SavedReport`（强转关掉检查，缺字段渲染时才炸）。
 *  名字刻意不叫 normalize：error-policy.js 已有一个 normalize（脱敏正则），同名不同义是 §6.4 禁的。 */
export function normalizeSavedReport(raw: unknown): SavedReport {
    // 入参用 unknown 而非 Partial<SavedReport>：边界上拿到的就是无类型数据（§6.5），强转集中在这一行
    const r = (raw ?? {}) as Partial<SavedReport>;
    return {
        id: String(r.id ?? ""),
        fileName: String(r.fileName ?? ""),
        fileSize: Number(r.fileSize ?? 0),
        durationSec: typeof r.durationSec === "number" ? r.durationSec : undefined,
        platform: String(r.platform ?? "px4"),
        vehicleType: r.vehicleType ? String(r.vehicleType) : undefined,
        verSw: r.verSw ? String(r.verSw) : undefined,
        verHw: r.verHw ? String(r.verHw) : undefined,
        parserVersion: String(r.parserVersion ?? ""),
        logHash: r.logHash ? String(r.logHash) : undefined,
        findings: Array.isArray(r.findings) ? r.findings : [],
        facts: r.facts && typeof r.facts === "object" ? r.facts : undefined,
        metrics: Array.isArray(r.metrics) ? r.metrics : undefined,
        tags: Array.isArray(r.tags) ? r.tags : undefined,
        guardTags: Array.isArray(r.guardTags) ? r.guardTags : undefined,
        matchedFaults: Array.isArray(r.matchedFaults) ? r.matchedFaults : undefined,
        aiMarkdown: typeof r.aiMarkdown === "string" ? r.aiMarkdown : null,
        analyzedAt: String(r.analyzedAt ?? ""),
        trackThumb: Array.isArray(r.trackThumb) ? r.trackThumb : undefined,
    };
}

/** 从完整轨迹抽一份缩略图（等距抽样 + 保留末点）。多条轨道时取第一条（主 GNSS） */
export function makeTrackThumb(track: TrackData | null | undefined, maxPoints = 40): TrackThumb | undefined {
    // 兼容改造前的单条形状（老存档里 track 直接是 {lat, lon, …}）
    const one = Array.isArray(track?.tracks) ? track?.tracks[0] : (track as unknown as TrackSeries | undefined);
    const lat = one?.lat;
    const lon = one?.lon;
    if (!lat?.length || !lon?.length) return undefined;
    const push = (out: TrackThumb, i: number) => {
        const la = lat[i];
        const lo = lon[i];
        if (typeof la === "number" && typeof lo === "number") {
            out.push([Number(la.toFixed(5)), Number(lo.toFixed(5))]);
        }
    };
    const out: TrackThumb = [];
    const step = Math.max(1, Math.floor(lat.length / maxPoints));
    for (let i = 0; i < lat.length; i += step) push(out, i);
    push(out, lat.length - 1); // 末点补上，形状才完整
    return out.length >= 2 ? out : undefined;
}

/** 只补结论记录里的一两个字段（目前用于轨迹缩略图），内存镜像同步更新 */
export async function patchReport(id: string, patch: Partial<SavedReport>): Promise<void> {
    const idx = mirror.findIndex((r) => r.id === id);
    if (idx >= 0) mirror[idx] = { ...mirror[idx], ...patch };
    try {
        const rec = await get<StoredReport>(STORE_REPORTS, id);
        if (rec) await put(STORE_REPORTS, { ...rec, ...patch });
    } catch {
        // 补不上不影响已有记录
    }
}

// ─────────────────────────── IndexedDB ───────────────────────────

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_REPORTS)) {
                const s = db.createObjectStore(STORE_REPORTS, { keyPath: "id" });
                s.createIndex("logHash", "logHash");
                s.createIndex("analyzedAt", "analyzedAt");
            }
            if (!db.objectStoreNames.contains(STORE_DATA)) {
                const d = db.createObjectStore(STORE_DATA, { keyPath: "id" });
                d.createIndex("savedAt", "savedAt");
            } else {
                // v1 建的库里没有这个索引：补上（修剪旧派生数据要靠它按时间倒序扫，避免整店读进内存）
                const d = req.transaction!.objectStore(STORE_DATA);
                if (!d.indexNames.contains("savedAt")) d.createIndex("savedAt", "savedAt");
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function put(store: string, value: unknown): Promise<void> {
    return openDb().then(
        (db) =>
            new Promise<void>((resolve, reject) => {
                const t = db.transaction(store, "readwrite");
                t.objectStore(store).put(value);
                t.oncomplete = () => resolve();
                t.onerror = () => reject(t.error);
            }),
    );
}

function get<T>(store: string, key: string): Promise<T | undefined> {
    return openDb().then(
        (db) =>
            new Promise<T | undefined>((resolve, reject) => {
                const req = db.transaction(store, "readonly").objectStore(store).get(key);
                req.onsuccess = () => resolve(req.result as T | undefined);
                req.onerror = () => reject(req.error);
            }),
    );
}

function del(store: string, key: string): Promise<void> {
    return openDb().then(
        (db) =>
            new Promise<void>((resolve, reject) => {
                const t = db.transaction(store, "readwrite");
                t.objectStore(store).delete(key);
                t.oncomplete = () => resolve();
                t.onerror = () => reject(t.error);
            }),
    );
}

async function removeMany(ids: string[]): Promise<void> {
    for (const id of ids) {
        try {
            await del(STORE_DATA, id);
            await del(STORE_REPORTS, id);
        } catch {
            // 删失败不影响内存镜像已更新的列表
        }
    }
}

// ─────────────────────────── 内存镜像 + 迁移 ───────────────────────────

let mirror: SavedReport[] = [];

/** 把老版本 localStorage 里的记录搬进 IndexedDB（只做一次，搬完删键） */
async function migrateFromLocalStorage(): Promise<void> {
    if (typeof window === "undefined") return;
    let raw: string | null;
    try {
        raw = window.localStorage.getItem(LEGACY_KEY);
    } catch {
        return;
    }
    if (!raw) return;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            for (const item of parsed) {
                const rec = normalizeSavedReport(item);
                if (!rec.id) continue;
                // 库里已有同 id 的不覆盖（新结构优先）
                const exists = await get<StoredReport>(STORE_REPORTS, rec.id);
                if (!exists) await put(STORE_REPORTS, { ...rec, savedAt: Date.parse(rec.analyzedAt) || Date.now() });
            }
        }
    } catch {
        // 旧数据坏了就放弃迁移，不影响新记录
    }
    try {
        window.localStorage.removeItem(LEGACY_KEY);
    } catch {
        // 删不掉也无妨，下次启动还会跳过（记录已在库里）
    }
}

/** 打开库、迁移旧记录、载入内存镜像。必须共享同一个 Promise 而非 initialized 布尔量：
 *  两个调用方先后到达时，后者会查到还没载入的镜像，表现为"刷新 /log/<id> 说未找到" */
let initPromise: Promise<void> | null = null;

export function initReportStore(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    if (!initPromise) initPromise = doInitReportStore();
    return initPromise;
}

async function doInitReportStore(): Promise<void> {
    try {
        await migrateFromLocalStorage();
        const db = await openDb();
        const all = await new Promise<StoredReport[]>((resolve, reject) => {
            const req = db.transaction(STORE_REPORTS, "readonly").objectStore(STORE_REPORTS).getAll();
            req.onsuccess = () => resolve(req.result as StoredReport[]);
            req.onerror = () => reject(req.error);
        });
        mirror = all.map((x) => normalizeSavedReport(x)).sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
    } catch {
        // IndexedDB 不可用（隐私模式等）：退化为"仅本次会话内存有效"
        mirror = [];
    }
}

// ─────────────────────────── 结论记录（同步接口 + 异步落库）───────────────────────────

export function saveReport(report: SavedReport): void {
    const rec = normalizeSavedReport(report);
    const idx = mirror.findIndex((r) => r.id === rec.id);
    if (idx >= 0) mirror[idx] = rec;
    else mirror.unshift(rec);

    // 超出上限：先更新内存，再异步删库（结论与派生数据一起删）
    if (mirror.length > REPORT_MAX_ENTRIES) {
        const dropped = mirror.slice(REPORT_MAX_ENTRIES).map((r) => r.id);
        mirror = mirror.slice(0, REPORT_MAX_ENTRIES);
        void removeMany(dropped);
    }
    void put(STORE_REPORTS, { ...rec, savedAt: Date.now() }).catch(() => {
        // 写库失败不影响本次会话（内存镜像已更新）
    });
}

export function listReports(): SavedReport[] {
    return [...mirror].sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
}

export function getReport(id: string): SavedReport | null {
    return mirror.find((r) => r.id === id) ?? null;
}

export function deleteReport(id: string): void {
    mirror = mirror.filter((r) => r.id !== id);
    void removeMany([id]);
}

/** 清空历史：只删 reports + reportData 两个 store。刻意不碰 nextpilot-cache/logs（留着恢复完整数据）
 *  和 SW 的 nextpilot-runtime-*（Pyodide 运行时，清历史不该重新下载）；要清得显式调 clearCachedLogs()/caches.delete() */
export function clearReports(): void {
    const ids = mirror.map((r) => r.id);
    mirror = [];
    void removeMany(ids);
}

export function newReportId(): string {
    const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
    return c?.randomUUID?.() ?? `r${Date.now()}`;
}

// ─────────────────────────── 派生数据（异步）───────────────────────────

/** 按 savedAt 倒序扫派生数据，把第 REPORT_DATA_KEEP 个之外的删掉（用索引扫，不整店读） */
async function pruneReportData(): Promise<void> {
    try {
        const db = await openDb();
        await new Promise<void>((resolve) => {
            let seen = 0;
            const t = db.transaction(STORE_DATA, "readwrite");
            const cur = t.objectStore(STORE_DATA).index("savedAt").openCursor(null, "prev");
            cur.onsuccess = () => {
                const c = cur.result;
                if (!c) return;
                seen += 1;
                if (seen > REPORT_DATA_KEEP) c.delete();
                c.continue();
            };
            t.oncomplete = () => resolve();
            t.onerror = () => resolve();
        });
    } catch {
        // 修剪失败不影响功能
    }
}

/** 存派生数据：分析完成或首次画图后调。按字段合并而非整条覆盖——两处调用各带一部分
 *  （分析完成只有 info，抽完曲线才有 plotPanels/track），谁后到都不能把对方写没了 */
export async function saveReportData(id: string, data: ReportData): Promise<void> {
    if (typeof window === "undefined" || !id) return;
    try {
        const prev = await get<ReportData & { id: string }>(STORE_DATA, id);
        await put(STORE_DATA, { ...prev, id, ...data, savedAt: Date.now() });
        await pruneReportData();
        // 顺手把轨迹缩略图补进结论记录（历史卡片要用；派生数据可能被淘汰，结论记录不会）
        const thumb = makeTrackThumb(data.track);
        if (thumb) await patchReport(id, { trackThumb: thumb });
    } catch {
        // 落库失败不阻断展示
    }
}

/** 取派生数据；没有（老记录、别的设备）返回 undefined，调用方退回"重新解析"路径 */
export async function getReportData(id: string): Promise<ReportData | undefined> {
    if (typeof window === "undefined" || !id) return undefined;
    try {
        const rec = await get<ReportData & { id: string }>(STORE_DATA, id);
        if (!rec) return undefined;
        const { id: _id, ...rest } = rec;
        return rest;
    } catch {
        return undefined;
    }
}
