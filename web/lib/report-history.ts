import type { Finding, LogFacts, LogInfo, MatchedFault, MetricEntry, TrackData } from "./types";
import type { StoredPlotPanel, StoredPlotSeries } from "./chart-presets";

/**
 * 报告存档（IndexedDB）。
 *
 * 为什么从 localStorage 搬到这里：
 * - localStorage 一个键装整个数组，每次保存全量序列化，**只留 20 条**，5MB 配额、隐私模式写不进；
 * - "命中即看"要求把**派生数据**（参数 / 消息 / 曲线降采样）也存下来，才能不再等一次解析——
 *   这些是大对象，只有 IndexedDB 装得下。
 *
 * 三个 store 分工（不同库，互不干扰）：
 *   reports      这里：结论记录（findings / metrics / facts / aiMarkdown / 元信息），列表页直接读
 *   reportData   这里：派生数据（info = 参数/消息/阶段/系统信息；plotData = 曲线），按键取
 *   logs         log-cache.ts：原始 .ulg 字节（LRU 300MB/10 份），用于"重新分析"而非展示
 *
 * 内存镜像：列表接口保持同步（UI 多处同步调用），启动时把 reports 载入内存镜像，
 * 之后的读写都先落镜像、再异步写库。
 */

const DB_NAME = "nextpilot";
const STORE_REPORTS = "reports";
const STORE_DATA = "reportData";
const VERSION = 2;

/** 老版本用的 localStorage 键：首次启动迁移进 IndexedDB，然后删掉 */
const LEGACY_KEY = "nextpilot:reports";

/** 结论记录条数上限（每条约几十 KB，100 条 ≈ 几 MB，IndexedDB 完全放得下） */
export const REPORT_MAX_ENTRIES = 100;

/**
 * 派生数据只保留最近这么多个报告：曲线一份约 0.66MB（1500 点/线），
 * 不设上限的话 100 份就是 68MB。更老的报告仍能看结论 + AI，只是要重新选文件才能看图。
 */
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
  /** 事实层的两块（见 types.ts 的 LogFacts 与 engine/rule_engine.py 的报告组装） */
  facts?: LogFacts;
  metrics?: MetricEntry[];
  tags?: string[];
  guardTags?: string[];
  matchedFaults?: MatchedFault[];
  aiMarkdown: string | null;
  analyzedAt: string;
}

/** 与结论分开存的**派生数据**：命中时直接给「消息 / 参数 / 图表」用，不必再解析原始日志 */
export interface ReportData {
  /** 产出这份派生数据的引擎版本（build 期算的源文件哈希）。
   *  与当前版本不一致 = 旧引擎生成的（比如多值信息的分行规则变了），打开时重解析一次。 */
  derivedVersion?: string;
  /** np_log_info() 的产物：系统信息 / 消息 / 丢包 / 参数 / 变更参数 / 阶段 */
  info?: LogInfo;
  /** 曲线：各预设解析出的面板（含标题/单位/参考线/字段），打开历史时不必再要 manifest */
  plotPanels?: StoredPlotPanel[];
  /** 曲线数据：键 `${presetId}#${面板序号}` → SeriesResponse（降采样后的时序） */
  plotSeries?: StoredPlotSeries;
  /** GPS 轨迹（地图用；约 1500 点，很小） */
  track?: TrackData;
  savedAt?: number;
}

type StoredReport = SavedReport & { savedAt?: number; };

/** 老版本写入的记录可能缺字段（如早期没有 findings）；在读取边界补默认值，
 *  避免 UI 里 r.findings.length 之类直接抛错（真机上出现过 crash）。 */
function normalize(raw: Partial<SavedReport> | null | undefined): SavedReport {
  const r = raw ?? {};
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
  };
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
let initialized = false;

/** 把老版本 localStorage 里的记录搬进 IndexedDB（只做一次，搬完删键） */
async function migrateFromLocalStorage(): Promise<void> {
  if (typeof window === "undefined") return;
  let raw: string | null = null;
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
        const rec = normalize(item as Partial<SavedReport>);
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

/** 打开库、迁移旧记录、把结论记录载入内存镜像。界面挂载时调一次即可 */
export async function initReportStore(): Promise<void> {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    await migrateFromLocalStorage();
    const db = await openDb();
    const all = await new Promise<StoredReport[]>((resolve, reject) => {
      const req = db.transaction(STORE_REPORTS, "readonly").objectStore(STORE_REPORTS).getAll();
      req.onsuccess = () => resolve(req.result as StoredReport[]);
      req.onerror = () => reject(req.error);
    });
    mirror = all
      .map((x) => normalize(x))
      .sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
  } catch {
    // IndexedDB 不可用（隐私模式等）：退化为"仅本次会话内存有效"
    mirror = [];
  }
}

// ─────────────────────────── 结论记录（同步接口 + 异步落库）───────────────────────────

export function saveReport(report: SavedReport): void {
  const rec = normalize(report);
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

export function clearReports(): void {
  const ids = mirror.map((r) => r.id);
  mirror = [];
  void removeMany(ids);
}

export function newReportId(): string {
  const c = globalThis.crypto as { randomUUID?: () => string; } | undefined;
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

/** 存派生数据（参数/消息/曲线）：分析完成或首次画图后调，之后命中就能直接渲染。
 *  **按字段合并**而不是整条覆盖：两处调用各带一部分数据（分析完成只有 info，抽完曲线才有
 *  plotPanels/track），谁后到都不该把对方写没了。 */
export async function saveReportData(id: string, data: ReportData): Promise<void> {
  if (typeof window === "undefined" || !id) return;
  try {
    const prev = await get<ReportData & { id: string; }>(STORE_DATA, id);
    await put(STORE_DATA, { ...prev, id, ...data, savedAt: Date.now() });
    await pruneReportData();
  } catch {
    // 落库失败不阻断展示
  }
}

/** 取派生数据；没有（老记录、别的设备）返回 undefined，调用方退回"重新解析"路径 */
export async function getReportData(id: string): Promise<ReportData | undefined> {
  if (typeof window === "undefined" || !id) return undefined;
  try {
    const rec = await get<ReportData & { id: string; }>(STORE_DATA, id);
    if (!rec) return undefined;
    const { id: _id, ...rest } = rec;
    return rest;
  } catch {
    return undefined;
  }
}
