"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisReport, LogInfo, SeriesResponse, TopicManifest, TrackData } from "@/lib/types";
import type { WorkerOutMessage, WorkerStage } from "@/workers/analysis-worker";
import {
    resolvePlotPanels,
    type SeriesRequest,
    type StoredPlotPanel,
    type StoredPlotSeries,
} from "@/lib/chart-presets";
import {
    clearReports,
    deleteReport,
    getReportData,
    initReportStore,
    listReports,
    newReportId,
    makeTrackThumb,
    normalizeSavedReport,
    patchReport,
    saveReport,
    saveReportData,
    type SavedReport,
} from "@/lib/report-history";
import { getDeviceId } from "@/lib/device-id";
import { DERIVED_DATA_VERSION } from "@/lib/knowledge/derived-version.generated";
import { fallbackLogKey, hashLogBytes } from "@/lib/log-hash";
import { cacheUsage, cachedLogHashes, getCachedLog, putCachedLog } from "@/lib/log-cache";
import type { HistoryItem } from "@/components/ReportHistoryList";
import { reportError } from "@/lib/issue-bridge";

/**
 * Worker 跨路由复用（模块级单例）。
 *
 * 为什么不能跟 hook 一起销毁：本 hook 在 /analyze 与 /analyze/[id] 各挂一次，卸载时会 terminate；
 * 而 Worker 里的 Pyodide 初始化很贵——运行时（约 10MB）要下载并做 WASM 编译，还要装 numpy
 * （约 6MB wheel）与 pyulog（micropym 会去 PyPI 查索引）。跟 hook 一起销毁的话，
 * 列表↔结果页来回切一趟就要重来一遍，表现出来就是"每次上传都要重新下载 pyulog"。
 *
 * 现在：Worker 常驻到页面关闭（或自身出错被丢弃）；多个 hook 实例通过监听器广播共享它，
 * 各自只管自己的 pending（在飞的 series 请求、当前文件信息）。
 */
let sharedWorker: Worker | null = null;
const sharedListeners = new Set<(msg: WorkerOutMessage) => void>();
const sharedErrorListeners = new Set<(message: string) => void>();

function broadcastError(message: string) {
    for (const l of sharedErrorListeners) l(message);
}

/**
 * Worker **现在装着哪一份**日志（内容指纹）。
 *
 * 为什么必须是模块级、而不是每个 hook 一份：Worker 本身是模块级单例（见上），
 * "里面装着谁"是 Worker 的属性、不是某个页面的属性。同一个页面开着两份报告时，
 * 各存各的就会互相撒欢——A 以为装着 A、B 以为装着 B。
 *
 * `null` = 不知道／没装上（Worker 刚建、还装的是别的日志、上次 analyze 失败了）。
 * 只在 `done` 里按 Worker 回传的 logId 记，**不靠"我发过 analyze"推断**：
 * analyze 是会失败的（pyulog 装不上、日志损坏），推断出来的"装着"会让后续
 * 取数拿到上一份日志的数据——静默错，比报错难查得多。
 */
let workerLoadedHash: string | null = null;

/** 正在为哪份日志补解析（键 = 内容指纹）。同样必须是模块级：Worker 只有一份，
 *  同一份日志的解析请求也就只该有一次，任何一个页面发起的都算数。 */
const analyzeInFlight = new Map<string, Promise<boolean>>();

function getSharedWorker(): Worker | null {
    if (typeof Worker === "undefined") return null;
    if (sharedWorker) return sharedWorker;
    try {
        const w = new Worker(new URL("../workers/analysis-worker.ts", import.meta.url), { type: "module" });
        w.onmessage = (e: MessageEvent) => {
            for (const l of sharedListeners) l(e.data);
        };
        w.onerror = (e) => {
            broadcastError(
                `本地解析引擎加载失败：${e.message || "无法加载 Worker 脚本"}。` +
                    `若是网络原因（Pyodide 从 CDN 加载），请检查网络后重试。`,
            );
            // Worker 内未捕获异常：整份日志都解析不了，最该上报的一类
            reportError({
                level: "fatal",
                type: "WorkerLoadError",
                message: e.message || "无法加载 Worker 脚本",
                stack: e.error?.stack ?? "",
            });
        };
        w.onmessageerror = () => broadcastError("本地解析引擎消息解析失败，请刷新页面重试。");
        sharedWorker = w;
        return w;
    } catch {
        return null;
    }
}

/** 只在 Worker 自己坏掉时丢弃（下一次分析会重建）；正常卸载不调用 */
function dropSharedWorker() {
    sharedWorker?.terminate();
    sharedWorker = null;
    // 新 Worker 的命名空间是空的：不跟着清，"装着谁"就会对着一个已经不在的 Worker 说话
    workerLoadedHash = null;
}

/**
 * 刚分析完的那一份结果（模块级）。
 *
 * 为什么需要：在列表页分析完会跳到结果页，而结果页是**另一个 hook 实例**，它去 IndexedDB
 * 读派生数据时，后台的曲线抽取（约 1 秒）往往还没写完 —— 于是只看到参数/消息、没有曲线，
 * 图表 tab 就被判成"不可用"。这里把内存里的结果直接交接过去，既消除竞态，也省掉一次重复解析。
 */
/** parseBytes 的入参（也是"补解析"时用的那份描述） */
type ParseBytesMeta = {
    name: string;
    size: number;
    hash: string;
    reportId: string;
    priorAi: string | null;
};

/**
 * Worker 交上来的报告 → 前端敢直接解引用的形状（外部边界，见 CLAUDE.md §6.5）。
 *
 * 为什么 Worker 也算外部：它是模块级单例、**常驻且从不因代码更新重建**（见下面的说明），
 * 所以"页面已经是新代码、Worker 还揣着上一版产物"是常态。判据（写入方与读取方可能不是
 * 同一版本）成立。
 *
 * 这里只保证**前端会直接解引用的字段**：`findings` 是唯一一个（`GeneralInfo` 里
 * `report.findings.filter`，缺了整页白屏）。其余字段 UI 本来就用 `?.` / `?? []` 取，
 * 缺了不会白屏——也就不该在这里编个默认值假装它有。
 */
function normalizeWorkerReport(raw: unknown): AnalysisReport {
    const r = (raw ?? {}) as AnalysisReport;
    if (!Array.isArray(r.findings)) {
        const keys = r && typeof r === "object" ? Object.keys(r).join(",") : typeof raw;
        r.findings = [];
        // 白屏换成"能用的页面 + 一条能查的证据"：这类缺字段只可能来自版本错位，
        // 是我们自己要修的事，不该由用户对着一个白页面猜
        reportError({
            level: "recoverable",
            type: "ReportShapeError",
            message: `worker 的报告缺 findings（实际键：${keys}）`,
        });
    }
    return r;
}

let liveAnalysis: {
    id: string;
    manifest: TopicManifest;
    info: LogInfo;
    storedPlots?: { panels: StoredPlotPanel[]; series: StoredPlotSeries };
} | null = null;

export function useLogAnalyzer() {
    const inputRef = useRef<HTMLInputElement>(null);
    const pendingRef = useRef<Map<string, (data: unknown) => void>>(new Map());
    const reqIdRef = useRef(0);
    const reportIdRef = useRef<string>("");
    const pendingFileRef = useRef<{ name: string; size: number }>({ name: "", size: 0 });
    const pendingHashRef = useRef<string>("");
    const pendingAiRef = useRef<string | null>(null);
    /** **当前显示的报告**带的那份 AI 解读，跟着 state 走。
     *  与 pendingAiRef 是两件事：后者是"上次解析那份日志的 priorAi"，只被 parseBytes 写；
     *  拿它去补解析当前报告，会把这份报告的 AI 解读覆盖成别的（或空）。
     *  补解析（ensureLogLoaded / recoverWithFile）要沿用的是这一份。 */
    const aiMarkdownRef = useRef<string | null>(null);
    const pendingBytesRef = useRef<Uint8Array | null>(null);
    /** `pendingBytesRef` 里那份字节是**哪一份日志**的。
     *  `pendingHashRef` 会被 viewSaved 改成"当前显示的报告"的指纹，而字节不会跟着变——
     *  两者配对存才不会出现"拿 A 的字节去补 B 的数据"。 */
    const pendingBytesHashRef = useRef<string>("");
    /** 等某份日志解析结束的回调（键 = 内容指纹）；done / error 时结算 */
    const analyzeWaitersRef = useRef<Map<string, ((ok: boolean) => void)[]>>(new Map());
    /** parseBytes 的引用：它声明在文件靠后的位置（依赖 dropOtherReportData 与 ensureWorker），
     *  而 ensureLogLoaded（声明在前，requestSeries/requestTrack 要用）也得调它。
     *  直接写进 deps 会在渲染期撞上 const 的 TDZ，所以走 ref。 */
    const parseBytesRef = useRef<((bytes: Uint8Array, meta: ParseBytesMeta) => void) | null>(null);

    const [stage, setStage] = useState<WorkerStage | "idle" | "explaining">("idle");
    const [error, setError] = useState<string | null>(null);
    const [report, setReport] = useState<AnalysisReport | null>(null);
    const [manifest, setManifest] = useState<TopicManifest | null>(null);
    const [info, setInfo] = useState<LogInfo | null>(null);
    const [aiMarkdown, setAiMarkdown] = useState<string | null>(null);
    const [history, setHistory] = useState<SavedReport[]>([]);
    const [quota, setQuota] = useState<{
        used: number;
        limit: number;
        anonymous?: boolean;
        loginLimit?: number;
    } | null>(null);
    const [loggedIn, setLoggedIn] = useState(false);
    const [cloudItems, setCloudItems] = useState<HistoryItem[]>([]);
    const [dedupeNotice, setDedupeNotice] = useState<string | null>(null);
    const [pendingBytes, setPendingBytes] = useState<{
        name: string;
        size: number;
        hash: string;
        bytes: Uint8Array;
    } | null>(null);
    const [cachedHashes, setCachedHashes] = useState<Set<string>>(new Set());
    /** 存档里的曲线（打开历史时直接渲染，不必解析日志）；分析完成后也会被填上 */
    const [storedPlots, setStoredPlots] = useState<{
        panels: StoredPlotPanel[];
        series: StoredPlotSeries;
    } | null>(null);
    const lastInfoRef = useRef<LogInfo | null>(null);
    /** 轨迹（地图用）：存档里有就直接画，没有就问 Worker 要 */
    const [storedTrack, setStoredTrack] = useState<TrackData | null>(null);
    const [cacheInfo, setCacheInfo] = useState<{ entries: number; bytes: number }>({
        entries: 0,
        bytes: 0,
    });

    /** 丢弃共享 Worker（仅在其自身出错时用；正常卸载只摘监听器，见下面 effect 的清理） */
    const resetWorker = useCallback(() => {
        dropSharedWorker();
        pendingRef.current.clear();
    }, []);

    const fetchCloudList = useCallback(async (): Promise<HistoryItem[]> => {
        try {
            const resp = await fetch("/api/reports", { cache: "no-store" });
            if (!resp.ok) return [];
            const data = await resp.json();
            return (data.reports ?? []).map((r: Record<string, unknown>): HistoryItem => ({
                id: String(r.id),
                fileName: String(r.fileName ?? ""),
                fileSize: Number(r.fileSize ?? 0),
                durationSec: Number(r.durationSec ?? 0) || undefined,
                platform: String(r.platform ?? "px4"),
                vehicleType: (r.vehicleType as string) ?? undefined,
                parserVersion: String(r.parserVersion ?? ""),
                logHash: r.logHash ? String(r.logHash) : undefined,
                verSw: r.verSw ? String(r.verSw) : undefined,
                verHw: r.verHw ? String(r.verHw) : undefined,
                facts: {
                    durationSec: Number(r.durationSec ?? 0) || undefined,
                    startUtc: typeof r.startUtc === "number" ? r.startUtc : undefined,
                    airframeId: typeof r.airframeId === "number" ? r.airframeId : undefined,
                    // 软件版本串跟着云端记录一起带回来，否则云端行会退回裸哈希、
                    // 与同一份日志的本地行显示不一致（见 lib/format.ts 的 formatFirmware）
                    firmwareDisplay: r.firmwareDisplay ? String(r.firmwareDisplay) : undefined,
                    fwReleaseType: typeof r.fwReleaseType === "number" ? r.fwReleaseType : null,
                    firmware: r.firmware ? String(r.firmware) : undefined,
                },
                findings: [],
                findingCount: Number(r.findingCount ?? 0),
                metrics: [],
                aiMarkdown: null,
                analyzedAt: String(r.analyzedAt),
                source: "cloud",
            }));
        } catch {
            return [];
        }
    }, []);

    const refreshCloud = useCallback(async () => {
        setCloudItems(await fetchCloudList());
    }, [fetchCloudList]);

    const refreshMe = useCallback(async () => {
        try {
            const resp = await fetch("/api/me", {
                cache: "no-store",
                headers: { "x-device-id": getDeviceId() },
            });
            if (resp.ok) {
                const data = await resp.json();
                setLoggedIn(Boolean(data.user));
                setQuota(data.quota ?? null);
                if (data.user) await refreshCloud();
                else setCloudItems([]);
            } else {
                setLoggedIn(false);
                setQuota(null);
                setCloudItems([]);
            }
        } catch {
            // 边缘函数未部署 / 网络异常时不阻断本地分析
        }
    }, [refreshCloud]);

    const persist = useCallback((r: AnalysisReport, id: string, ai: string | null, hash?: string) => {
        saveReport({
            id,
            fileName: r.fileName,
            fileSize: r.fileSize,
            durationSec: r.facts?.durationSec,
            platform: r.platform,
            vehicleType: r.facts?.vehicleType,
            verSw: r.verSw,
            verHw: r.verHw,
            parserVersion: r.parserVersion,
            logHash: hash ?? r.logHash,
            findings: r.findings,
            facts: r.facts,
            metrics: r.metrics,
            tags: r.tags,
            guardTags: r.guardTags,
            matchedFaults: r.matchedFaults,
            aiMarkdown: ai,
            analyzedAt: r.analyzedAt,
        });
        setHistory(listReports());
    }, []);

    const explain = useCallback(
        async (r: AnalysisReport, id: string) => {
            setStage("explaining");
            let markdown: string | null = null;
            let ok = false;
            try {
                const resp = await fetch("/api/explain", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-device-id": getDeviceId(),
                    },
                    body: JSON.stringify({
                        reportId: id,
                        deviceId: getDeviceId(),
                        fileName: r.fileName,
                        fileSize: r.fileSize,
                        platform: r.platform,
                        parserVersion: r.parserVersion,
                        logHash: r.logHash ?? pendingHashRef.current,
                        findings: r.findings,
                        facts: r.facts ?? {},
                        metrics: r.metrics ?? {},
                        tags: r.tags ?? [],
                        guardTags: r.guardTags ?? [],
                        checksRun: r.checksRun ?? [],
                        checksSkipped: r.checksSkipped ?? [],
                        matchedFaults: r.matchedFaults ?? [],
                    }),
                });
                const data = await resp.json();
                if (resp.status === 429) {
                    // 429 的两种来路：额度用完，或**限流**（来得太快）。服务端给了 error
                    // 就用它；没给时不许替它编"额度已用完"——那是其中一种，另一种下这句
                    // 是错的，用户按它去等第二天重置，其实重试一下就行（同 §6.8 的教训）。
                    markdown = `> ${data.error ?? "请求过于频繁或已达上限，请稍后重试"}`;
                } else if (!resp.ok) {
                    markdown = `> AI 解释暂不可用：${data.error ?? resp.statusText}`;
                } else {
                    markdown = data.markdown;
                    ok = true;
                    if (data.quota) {
                        setQuota({
                            used: data.quota.used,
                            limit: data.quota.limit,
                            anonymous: data.quota.anonymous,
                        });
                    }
                }
            } catch (err) {
                markdown = `> AI 解释请求失败：${(err as Error).message}`;
            } finally {
                setAiMarkdown(markdown);
                setStage("done");
                if (markdown !== null && ok) {
                    persist(r, id, markdown);
                    void refreshCloud();
                }
            }
        },
        [persist, refreshCloud],
    );

    /** 结算"等这份日志解析完"的回调（done = true / error = false） */
    const settleAnalyze = useCallback((hash: string, ok: boolean) => {
        const list = analyzeWaitersRef.current.get(hash);
        if (!list) return;
        analyzeWaitersRef.current.delete(hash);
        for (const done of list) done(ok);
    }, []);

    /** 解析失败、或这次解析顶掉了另一份日志时，把等待者放行：宁可让调用方拿到"取不到"，
     *  也不能让一个 await 永远挂着（界面会卡在"加载中"，连"重新选择文件"的按钮都看不到）。 */
    const failPendingAnalyze = useCallback((exceptHash?: string) => {
        const all = [...analyzeWaitersRef.current.entries()];
        analyzeWaitersRef.current.clear();
        for (const [hash, list] of all) {
            if (exceptHash && hash === exceptHash) continue;
            for (const done of list) done(false);
        }
    }, []);

    /**
     * **在取数据之前，先把当前这份日志装进 Worker。**
     *
     * 为什么必须有这一步：Worker 共享且常驻（见文件头），它可能正装着**另一份**日志——
     * 要么本会话先分析过别的日志，要么用户从历史里打开了第二份报告。
     * 以前遇到这种情况只有一个结果：Worker 回一句"当前解析的是另一份日志，重新选择该 .ulg 文件"，
     * 界面给个按钮让用户再选一次文件——**而字节明明就在手里**（刚选过的那份、或本机缓存里的），
     * 却要用户再选一遍；曲线那条路连按钮都没有，只能一直看不到图。
     *
     * 现在把"Worker 得装着这一份"做成取数的前置条件：
     *   · 装着 → 直接走；
     *   · 不是这一份 → 用手里的字节补一次解析并等它结束；
     *   · 手里也没字节（历史记录 + 本机缓存已被淘汰／来自别的设备）→ 返回 false，
     *     让 Worker 照旧回那句实话，界面给"重新选择该 .ulg 文件"——**那才是唯一真需要用户动手的情况**。
     *
     * 同一份日志的并发请求共用一次解析（analyzeInFlight 去重），不会解析好几遍。
     */
    const ensureLogLoaded = useCallback(async (hash: string): Promise<boolean> => {
        if (!hash) return false;
        if (workerLoadedHash === hash) return true;
        const running = analyzeInFlight.get(hash);
        if (running) return running;
        const job = (async () => {
            const worker = getSharedWorker();
            if (!worker) return false;
            // 字节来源一：刚选中的那份（handleFile / recoverWithFile 都经过 parseBytes）
            let bytes: Uint8Array | null = pendingBytesHashRef.current === hash ? pendingBytesRef.current : null;
            let name = pendingFileRef.current.name;
            if (!bytes) {
                // 字节来源二：本机日志缓存（从历史打开报告时走这条）
                const cached = await getCachedLog(hash);
                if (cached) {
                    bytes = cached.bytes;
                    name = cached.name || name;
                }
            }
            if (!bytes) return false;
            const parsed = new Promise<boolean>((resolve) => {
                const list = analyzeWaitersRef.current.get(hash) ?? [];
                list.push(resolve);
                analyzeWaitersRef.current.set(hash, list);
            });
            // priorAi 沿用**当前显示的报告**那份解读：这次解析只是把数据装进 Worker，
            // 不该把花过额度生成的 AI 报告覆盖成空。用 aiMarkdownRef 而不是 pendingAiRef——
            // 后者是"上一次解析那份日志的 priorAi"，从历史打开另一份报告时它还是上一份的
            // 值（常常是 null），拿它去补解析正好把这份报告的 AI 抹掉。
            parseBytesRef.current?.(bytes, {
                name,
                size: bytes.byteLength,
                hash,
                reportId: reportIdRef.current,
                priorAi: aiMarkdownRef.current,
            });
            return parsed;
        })();
        analyzeInFlight.set(hash, job);
        try {
            return await job;
        } finally {
            analyzeInFlight.delete(hash);
        }
    }, []);

    const requestSeries = useCallback(
        async (req: SeriesRequest): Promise<SeriesResponse> => {
            const worker = getSharedWorker();
            if (!worker) return { error: "worker 未就绪" } as SeriesResponse;
            // 先确保 Worker 装着这一份（见 ensureLogLoaded）；装不上就照原样发，
            // 由 Worker 回那句"没装着"的实话 + code，界面据此给按钮
            await ensureLogLoaded(pendingHashRef.current);
            const reqId = `s${reqIdRef.current++}`;
            return new Promise((resolve) => {
                pendingRef.current.set(reqId, (data) => resolve(data as SeriesResponse));
                worker.postMessage({
                    type: "series",
                    reqId,
                    // 取数声明整份发给引擎（字段引用 + 候选组 + 单位 + 换算节点）：
                    // 前端不解释它，只在 np_series 里原样用（见 report_data.py）
                    request: req,
                    // Worker 是共享的、跨报告存活：带上"要哪一份日志"的指纹，
                    // 里面装着别的日志时它宁可回错误，也别静默给别的日志的曲线
                    logId: pendingHashRef.current,
                });
            });
        },
        [ensureLogLoaded],
    );

    /** 要一份 GPS 轨迹；与 requestSeries 同一套 pending 机制 */
    const requestTrack = useCallback(async (): Promise<TrackData> => {
        const worker = getSharedWorker();
        if (!worker) return { error: "worker 未就绪" } as unknown as TrackData;
        // 同上：能自己补就自己补，别让用户去点"重新选择该 .ulg 文件"
        await ensureLogLoaded(pendingHashRef.current);
        const reqId = `t${reqIdRef.current++}`;
        return new Promise((resolve) => {
            pendingRef.current.set(reqId, (data) => resolve(data as TrackData));
            // 同上：轨迹也要说清是哪一份日志的——装错日志时画出来的是**别人**的航线
            worker.postMessage({ type: "track", reqId, logId: pendingHashRef.current });
        });
    }, [ensureLogLoaded]);

    /** 把各预设的曲线抽出来存进报告存档（键与 LogCharts 的 seriesKey 一致：`presetId#面板序号`） */
    const extractPlots = useCallback(
        async (id: string, manifest: TopicManifest, info: LogInfo) => {
            try {
                const panels = resolvePlotPanels(manifest);
                if (panels.length === 0) return;
                const series: StoredPlotSeries = {};
                for (const sp of panels) {
                    for (let i = 0; i < sp.panels.length; i++) {
                        // 一个面板可能要发多次取数（多条 child 各有自己的横轴）——
                        // 落盘时按请求顺序存成数组，键仍是 `${presetId}#面板序号`
                        const reqs = sp.panels[i].requests;
                        if (reqs.length === 0) continue;
                        const got = await Promise.all(reqs.map((r) => requestSeries(r)));
                        if (got.every((r) => r && !(r as { error?: string }).error)) {
                            series[`${sp.presetId}#${i}`] = got;
                        }
                    }
                }
                setStoredPlots({ panels, series });
                if (liveAnalysis?.id === id) liveAnalysis.storedPlots = { panels, series };
                // 轨迹（地图用）：一次抽好存下，之后打开历史不必再解析。
                // 可能有多条（多条叠画 + 图例）——一条都没有才算没轨迹。
                const track = await requestTrack();
                const hasTrack = Boolean(track && !track.error && (track.tracks?.length ?? 0) > 0);
                if (hasTrack) setStoredTrack(track);
                await saveReportData(id, {
                    derivedVersion: DERIVED_DATA_VERSION,
                    info,
                    plotPanels: panels,
                    plotSeries: series,
                    ...(hasTrack ? { track } : {}),
                });
            } catch {
                // 抽曲线失败不影响结论展示；下次打开会退回"重新解析"
            }
        },
        [requestSeries, requestTrack],
    );

    /** 地图用：优先用存档里的轨迹（打开历史时不必解析），否则问 Worker 要 */
    const loadTrack = useCallback(async (): Promise<TrackData> => {
        if (storedTrack && !storedTrack.error) return storedTrack;
        return requestTrack();
    }, [requestTrack, storedTrack]);

    /**
     * 换了一份日志：丢掉上一份的派生数据（曲线、轨迹）。
     *
     * 这两样都必须按**日志身份**清，不能留在 state 里跨报告用：
     *   · 曲线的键是 `presetId#面板序号`——**与日志无关**（预设是静态的），
     *     于是 LogCharts 会直接命中上一份的序列画出来，看起来完全正常，实际是别人的数据；
     *   · 轨迹更直白：画出来就是另一份日志的航线。
     * 分析刚完成到抽完曲线之间有几秒，抽失败（`extractPlots` 的 catch）时这个错会一直留着。
     *
     * 判据用报告 id（= 日志内容指纹）：**就地复解析**（`recoverWithFile`、打开存档补齐）
     * 的 id 不变 → 不清，那种情况下"旧数据先渲染着、后台补"正是想要的。
     */
    const dropOtherReportData = useCallback((nextId: string): void => {
        if (reportIdRef.current === nextId) return;
        setStoredPlots(null);
        setStoredTrack(null);
    }, []);

    const viewSaved = useCallback(
        (saved: SavedReport) => {
            setError(null);
            setManifest(null);
            setInfo(null);
            setAiMarkdown(saved.aiMarkdown);
            // 换了报告就把上一份的派生数据丢掉再换 id：这两步必须挨着，
            // 否则"当前显示的 id"与"state 里的曲线轨迹"会各说各话
            dropOtherReportData(saved.id);
            reportIdRef.current = saved.id;
            pendingHashRef.current = saved.logHash ?? "";
            setReport({
                fileName: saved.fileName,
                fileSize: saved.fileSize,
                platform: saved.platform as AnalysisReport["platform"],
                parserVersion: saved.parserVersion,
                logHash: saved.logHash,
                findings: saved.findings,
                facts: saved.facts,
                metrics: saved.metrics,
                tags: saved.tags,
                guardTags: saved.guardTags,
                matchedFaults: saved.matchedFaults,
                analyzedAt: saved.analyzedAt,
            });
            setStage("done");
        },
        [dropOtherReportData],
    );

    const findExistingByHash = useCallback(
        async (hash: string): Promise<HistoryItem | null> => {
            if (!hash) return null;
            const local = listReports().find((r) => r.logHash === hash);
            if (local) return { ...local, source: "local" };
            const cloud = await fetchCloudList();
            return cloud.find((c) => c.logHash === hash) ?? null;
        },
        [fetchCloudList],
    );

    const cacheCurrentLog = useCallback(async () => {
        const bytes = pendingBytesRef.current;
        const hash = pendingHashRef.current;
        if (!bytes || !hash) return;
        if (await putCachedLog(hash, pendingFileRef.current.name, bytes)) {
            setCachedHashes(await cachedLogHashes());
            setCacheInfo(await cacheUsage());
        }
    }, []);

    /** Worker 消息处理：监听器挂在模块级注册表上，Worker 重建后依然有效 */
    const handleWorkerMessage = useCallback(
        (m: WorkerOutMessage) => {
            if (m.type === "stage") {
                setStage(m.stage);
            } else if (m.type === "error") {
                setError(m.message ?? "解析失败");
                setStage("idle");
                // 等这次解析的人全部放行（它失败了，别让谁永远挂着）
                failPendingAnalyze();
                // 解析失败是"整份日志都读不了"级别的错误，也是最容易藏起来的一类：
                // Pyodide 里的 Python 异常只在用户机器上出现，本地回归覆盖不到
                // （上一轮那个 NameError: __FACTS__ 就是这么漏到线上的）。
                // Pyodide 会把整个 Python traceback 塞进 message，那就是最有用的证据。
                reportError({
                    level: "fatal",
                    type: "ParseError",
                    message: m.message ?? "解析失败",
                });
            } else if (m.type === "done") {
                // 过归一（见 normalizeWorkerReport）：Worker 实例常驻、可能比本页代码旧
                const r = normalizeWorkerReport(m.report);
                // 记下"Worker 现在装着哪一份"：取数据前要靠它判断要不要补解析
                // （见 ensureLogLoaded）。旧的 Worker 实例不回传 logId，退化成发 analyze
                // 的那个页面所记的指纹——同一份代码里 done 的处理本来就依赖它（看 r.logHash）
                const logId = typeof m.logId === "string" ? m.logId : pendingHashRef.current;
                workerLoadedHash = logId || null;
                settleAnalyze(workerLoadedHash ?? "", true);
                // **这份结果是给谁的。** 补解析（ensureLogLoaded）是在页面已经把报告渲染出来
                // 之后才发起的，而 Pyodide 首次初始化要十几秒——用户完全可能在这中间回列表
                // 打开另一份报告。这时把结果写进 state，就是"拿 B 的结论盖住 C 的页面"：
                // 页面头部显示 C、结论却是 B，liveAnalysis 还会被记成「C 的 id + B 的 manifest」。
                // Worker 里确实已经装好了（上面那行已记下），只是这一份对当前页面已经不是它要的了。
                // 判据用 Worker 回传的 logId（而不是"我发过 analyze"）：analyze 会失败，推断出来的
                // "就是它"会让上面那条竞态被误判成正常路径。
                if (logId !== pendingHashRef.current) return;
                r.fileName = pendingFileRef.current.name;
                r.fileSize = pendingFileRef.current.size;
                r.analyzedAt = new Date().toISOString();
                r.logHash = pendingHashRef.current;
                const sys = (m.info as LogInfo)?.sysInfo ?? {};
                r.verSw = sys["ver_sw"]?.slice(0, 20);
                r.verHw = sys["ver_hw"];
                setReport(r);
                setManifest(m.manifest as TopicManifest);
                setInfo(m.info as LogInfo);
                // 交接给结果页（同一次分析，避免它去 IndexedDB 抢在落盘之前读）
                liveAnalysis = {
                    id: reportIdRef.current,
                    manifest: m.manifest as TopicManifest,
                    info: m.info as LogInfo,
                };
                setStage("done");
                setAiMarkdown(pendingAiRef.current);
                persist(r, reportIdRef.current, pendingAiRef.current, pendingHashRef.current);
                void cacheCurrentLog();
                // 派生数据随报告落盘：下次打开这份报告，参数/消息/阶段/曲线直接渲染，**不再解析原始日志**。
                const info = m.info as LogInfo;
                lastInfoRef.current = info;
                void saveReportData(reportIdRef.current, { derivedVersion: DERIVED_DATA_VERSION, info });
                // 曲线：解析已结束，后台把各预设的降采样序列抽出来存下（用户此刻已在看结论页，无感）
                void extractPlots(reportIdRef.current, m.manifest as TopicManifest, info);
            } else if (m.type === "track") {
                const resolve = pendingRef.current.get(m.reqId ?? "");
                if (resolve) {
                    pendingRef.current.delete(m.reqId ?? "");
                    resolve(m.data as never);
                }
            } else if (m.type === "series") {
                const resolve = pendingRef.current.get(m.reqId ?? "");
                if (resolve) {
                    pendingRef.current.delete(m.reqId ?? "");
                    resolve(m.data);
                }
            }
        },
        [cacheCurrentLog, extractPlots, failPendingAnalyze, persist, settleAnalyze],
    );

    useEffect(() => {
        // 先初始化报告库（IndexedDB，含老 localStorage 记录的迁移），再列历史
        void (async () => {
            await initReportStore();
            setHistory(listReports());
        })();
        void refreshMe();
        void cachedLogHashes().then(setCachedHashes);
        void cacheUsage().then(setCacheInfo);

        // 订阅共享 Worker 的消息；卸载时只摘监听器——**不销毁 Worker**，
        // 否则每次路由切换都要重下 Pyodide 与 numpy/pyulog（见文件顶部说明）
        const onMsg = (msg: WorkerOutMessage) => handleWorkerMessage(msg);
        const onErr = (message: string) => {
            setError(message);
            setStage("idle");
        };
        sharedListeners.add(onMsg);
        sharedErrorListeners.add(onErr);
        return () => {
            sharedListeners.delete(onMsg);
            sharedErrorListeners.delete(onErr);
            pendingRef.current.clear();
        };
    }, [handleWorkerMessage, refreshMe]);

    /** 拿共享 Worker；本 hook 的监听器在挂载 effect 里注册（只注册一次） */ const ensureWorker =
        useCallback((): Worker | null => {
            const worker = getSharedWorker();
            if (!worker) {
                setError("本地解析引擎无法启动（浏览器不支持 Web Worker？）");
                setStage("idle");
            }
            return worker;
        }, []);

    const parseBytes = useCallback(
        (bytes: Uint8Array, meta: ParseBytesMeta) => {
            const worker = ensureWorker();
            if (!worker) return;
            pendingFileRef.current = { name: meta.name, size: meta.size };
            pendingHashRef.current = meta.hash;
            // 这次解析会顶掉 Worker 里原本装着的那一份：别的日志的等待者再等不到自己的 done，
            // 现在就放行（放行的是"没拿到"，不是"拿到了"——调用方据此说真话）
            failPendingAnalyze(meta.hash);
            // 字节和它的指纹配对存：viewSaved 之后会把 pendingHashRef 换成"当前显示的报告"，
            // 而这里的字节还是上一份的——ensureLogLoaded 靠这一对判断"手里的字节是不是你要的"
            pendingBytesHashRef.current = meta.hash;
            pendingAiRef.current = meta.priorAi;
            pendingBytesRef.current = bytes;
            // 换的是另一份日志就丢掉上一份的派生数据（见 dropOtherReportData）；
            // 就地复解析同一个报告时 id 不变，留着旧曲线继续渲染正是想要的
            dropOtherReportData(meta.reportId);
            reportIdRef.current = meta.reportId;
            setAiMarkdown(meta.priorAi);
            setPendingBytes(null);
            setStage("loading-runtime");
            worker.postMessage({ type: "analyze", file: bytes, logId: meta.hash });
        },
        [dropOtherReportData, ensureWorker, failPendingAnalyze],
    );

    useEffect(() => {
        // 让上面那些"声明得更早、却要用 parseBytes"的回调拿得到它（见 parseBytesRef 的说明）
        parseBytesRef.current = parseBytes;
    }, [parseBytes]);

    useEffect(() => {
        // 同上：ensureLogLoaded 声明在 state 之前、deps 又是空的，拿不到 aiMarkdown。
        // 它补解析时要沿用**当前这份报告**的 AI 解读（见 aiMarkdownRef 的说明）。
        // 跟着 state 走、而不是逐个 setAiMarkdown 调用点去写：setAiMarkdown 是导出给
        // 调用方的，写漏一处就会在补解析时把 AI 报告抹掉——一个只有 AI 调用过的用户
        // （花过额度的）才会踩到的静默丢失。
        aiMarkdownRef.current = aiMarkdown;
    }, [aiMarkdown]);

    /** 读存档的派生数据并填充 UI；告诉调用方"参数/消息"与"曲线"各有没有、是不是旧引擎生成的 */
    const loadReportData = useCallback(
        async (id: string): Promise<{ hasInfo: boolean; hasPlots: boolean; hasTrack: boolean; stale: boolean }> => {
            const data = await getReportData(id);
            if (!data) return { hasInfo: false, hasPlots: false, hasTrack: false, stale: false };
            // 派生数据的形状随引擎改（多值信息分行、新增 infoDict…）：版本不对就当作"得重新解析"，
            // 但**照样先用它渲染**——重解析在后台进行，页面不会白一下
            const stale = data.derivedVersion !== DERIVED_DATA_VERSION;
            if (data.info) setInfo(data.info as LogInfo);
            const panels = data.plotPanels;
            if (panels?.length) setStoredPlots({ panels, series: data.plotSeries ?? {} });
            if (data.track && !data.track.error) {
                setStoredTrack(data.track);
                // 老记录没有轨迹缩略图：打开一次就补上（列表左边那格小图用）
                void patchReport(id, { trackThumb: makeTrackThumb(data.track) });
            }
            return {
                hasInfo: Boolean(data.info),
                hasPlots: Boolean(panels?.length),
                hasTrack: Boolean(data.track && !data.track.error),
                stale,
            };
        },
        [],
    );

    /** 本会话刚分析完的那份结果，直接沿用（见文件顶部 liveAnalysis 的说明） */
    const adoptLiveAnalysis = useCallback((id: string): boolean => {
        if (!liveAnalysis || liveAnalysis.id !== id) return false;
        setManifest(liveAnalysis.manifest);
        setInfo(liveAnalysis.info);
        if (liveAnalysis.storedPlots) setStoredPlots(liveAnalysis.storedPlots);
        return true;
    }, []);

    /**
     * 打开一份已存档的报告（本机历史 / 云端记录 / 去重命中都走这里）：
     * 1) 先用存档的结论立刻渲染；
     * 2) 本会话刚分析完的，直接沿用内存里的 manifest / 曲线（不等后台落盘）；
     * 3) 否则读存档的派生数据：**齐全且版本一致**就不用解析；
     * 4) 缺曲线/轨迹，或派生数据是旧版本引擎生成的（造型改过），就退回"拿本机缓存的原始字节
     *    重新解析"补齐——旧数据先渲染着，解析完自动换成新的。
     * 返回 reparsing / stale / incomplete 供调用方决定提示文案与是否补一次解析
     * （`incomplete` = 存档里缺曲线或轨迹：本机缓存还在时这里就自己补了；缓存不在时
     *  **只有调用方手里的原始字节能补**——回一句"已载入历史结论"就完事，等于让那句
     *  "重新选择该 .ulg 文件即可恢复"变成空话）。
     */
    const openSaved = useCallback(
        async (saved: Partial<SavedReport>): Promise<{ reparsing: boolean; stale: boolean; incomplete: boolean }> => {
            // **归一放在这里，不放在调用方。** openSaved 是"打开一份存档"的唯一入口，
            // 四个调用点里有三个是外部数据：索引库旧记录、云端列表摘要、/api/reports/:id
            // 取回的完整记录（后者是 7 天 TTL 内的任意历史版本写的，字段可能缺）。
            // 以前这几处各自 `as SavedReport` 强转，类型检查被关掉，
            // 缺 findings 的记录一路走到 GeneralInfo 的 `findings.filter` 才炸。
            const rec = normalizeSavedReport(saved);
            // viewSaved 里换 id（并丢掉上一份的派生数据），这里不再重复设
            viewSaved(rec);
            if (adoptLiveAnalysis(rec.id)) {
                return { reparsing: false, stale: false, incomplete: false };
            }
            const { hasPlots, hasTrack, stale } = await loadReportData(rec.id);
            // 曲线或轨迹缺了：存档本身补不回来，只有重新解析原始日志
            const incomplete = !hasPlots || !hasTrack;
            // 曲线、轨迹都齐了、且是当前引擎生成的，才算"不必解析"
            if (!incomplete && !stale) return { reparsing: false, stale: false, incomplete: false };
            if (rec.logHash) {
                const cached = await getCachedLog(rec.logHash);
                if (cached) {
                    parseBytes(cached.bytes, {
                        name: cached.name || rec.fileName,
                        size: cached.bytes.byteLength,
                        hash: rec.logHash,
                        reportId: rec.id,
                        priorAi: rec.aiMarkdown,
                    });
                    return { reparsing: true, stale, incomplete };
                }
            }
            return { reparsing: false, stale, incomplete };
        },
        [adoptLiveAnalysis, loadReportData, parseBytes, viewSaved],
    );

    const handleFile = useCallback(
        async (file: File): Promise<string | null> => {
            setError(null);
            setReport(null);
            setManifest(null);
            setInfo(null);
            setAiMarkdown(null);
            setDedupeNotice(null);

            // 扩展名只是预筛（文件选择器也拦不住改名文件）：真正的格式判定在引擎里
            // 按文件头 magic 走（open_log → FORMATS 逐个探测），这里拦的只是明显不对的
            const name = file.name.toLowerCase();
            if (!name.endsWith(".ulg") && !name.endsWith(".bin")) {
                setError("目前支持 PX4 .ulg 与 ArduPilot .bin 日志，请选择正确的日志文件。");
                return null;
            }

            if (file.size === 0) {
                setError("日志文件为空，请选择有效的日志文件。");
                return null;
            }

            try {
                const bytes = new Uint8Array(await file.arrayBuffer());

                const hash = (await hashLogBytes(bytes)) || fallbackLogKey(file.name, file.size, file.lastModified);
                const existing = await findExistingByHash(hash);
                if (existing) {
                    let opened: { reparsing: boolean; stale: boolean; incomplete: boolean } = {
                        reparsing: false,
                        stale: false,
                        incomplete: false,
                    };
                    if (existing.source === "cloud") {
                        // 云端列表只给了摘要，先取回完整记录再走统一的打开路径
                        try {
                            const resp = await fetch(`/api/reports/detail?id=${encodeURIComponent(existing.id)}`);
                            if (resp.ok) {
                                const data = await resp.json();
                                if (data.report) opened = await openSaved(data.report);
                            }
                        } catch {
                            // 取不到就只提示"已分析过"，不阻断
                        }
                    } else {
                        opened = await openSaved(existing);
                    }
                    // 存档是旧引擎生成的、或存档里缺曲线/轨迹，而原始日志又不在本机缓存里
                    // （被容量淘汰、或这份记录来自别的设备）：
                    // 手里正好有刚选中的字节，就用它重新解析一遍补上。
                    // 少了后半条判断，"重新选择该 .ulg 文件即可恢复轨迹"就成了一句空话——
                    // 用户照做一遍，回到报告页看到的是同一句提示（存档没变，轨迹还是缺）。
                    let reparsing = opened.reparsing;
                    if (!reparsing && (opened.stale || opened.incomplete)) {
                        parseBytes(bytes, {
                            name: file.name,
                            size: file.size,
                            hash,
                            reportId: existing.id,
                            priorAi: existing.aiMarkdown,
                        });
                        reparsing = true;
                    }
                    setPendingBytes({ name: file.name, size: file.size, hash, bytes });
                    setDedupeNotice(
                        !reparsing
                            ? "这份日志此前已分析过（内容一致），已直接载入历史结论，未重复解析。"
                            : opened.stale
                              ? "这份日志此前已分析过，但那份存档是旧版本引擎生成的（消息/参数的呈现方式已更新），已重新解析一遍。"
                              : "这份日志此前已分析过，但本机存档里缺图表或轨迹数据，已用你选择的文件重新解析补齐（AI 报告保留）。",
                    );
                    return existing.id;
                }

                // 报告 id 直接用**日志内容指纹**（SHA-256）：地址栏 /analyze/<hash> 与 .ulg 一一对应，
                // 同一份日志在任何设备、任何浏览器上都是同一个链接，也不会再出现"同一份日志两条历史"。
                // 非安全上下文（局域网 http）拿不到内容哈希时，退化为大小+时间+文件名，仍是确定的，
                // 真的都没有才用随机 id。
                const reportId = hash || newReportId();
                parseBytes(bytes, {
                    name: file.name,
                    size: file.size,
                    hash,
                    reportId,
                    priorAi: null,
                });
                return reportId;
            } catch (err) {
                setStage("idle");
                setError(`日志上传失败：${err instanceof Error ? err.message : String(err)}。请确认文件未损坏后重试。`);
                return null;
            }
        },
        [findExistingByHash, openSaved, parseBytes],
    );

    /**
     * 报告页的「重新选择该 .ulg 文件」：**就地**用选中的这份字节重解析当前报告，
     * 把缺的图表/轨迹补齐（报告页不跳走、不清空已渲染的结论）。
     *
     * 为什么另写一个而不复用 handleFile：handleFile 是"上传新日志"的入口——开头会把
     * report/info/manifest 清空（报告页会闪一下"未找到该分析报告"），且查重命中时默认不再解析。
     * 这里的前提正好相反：页面已经开着这份报告（id 就是日志指纹），缺的只是派生数据。
     *
     * 指纹对不上就不解析：把另一份日志的结论写进这份存档，比什么都不做更糟。
     * （极老的记录没有 logHash，无从比对，按"用户选的就是这一份"处理。）
     */
    const recoverWithFile = useCallback(
        async (file: File): Promise<boolean> => {
            setError(null);
            if (!/\.(ulg|bin)$/.test(file.name.toLowerCase())) {
                setError("目前支持 PX4 .ulg 与 ArduPilot .bin 日志，请选择要恢复的那份日志文件。");
                return false;
            }
            if (file.size === 0) {
                setError("日志文件为空，请选择有效的日志文件。");
                return false;
            }
            try {
                const bytes = new Uint8Array(await file.arrayBuffer());
                const hash = (await hashLogBytes(bytes)) || fallbackLogKey(file.name, file.size, file.lastModified);
                if (report?.logHash && hash && hash !== report.logHash) {
                    setError(
                        `这份文件和当前报告不是同一份日志（内容指纹不同）。当前报告来自 ${report.fileName}，请选择那一份。`,
                    );
                    return false;
                }
                // priorAi：重新解析必须沿用已有的 AI 报告，否则会把花过额度生成的解读覆盖成空
                parseBytes(bytes, {
                    name: file.name,
                    size: file.size,
                    hash: hash || report?.logHash || "",
                    reportId: reportIdRef.current,
                    priorAi: aiMarkdown,
                });
                return true;
            } catch (err) {
                setError(`日志读取失败：${err instanceof Error ? err.message : String(err)}。请确认文件未损坏后重试。`);
                return false;
            }
        },
        [aiMarkdown, parseBytes, report],
    );

    const clearLocal = useCallback(() => {
        clearReports();
        setHistory([]);
    }, []);

    /** 删单条**本机**记录：结论与派生数据一起删；原始日志缓存（nextpilot-cache）保留，
     *  下次再上传同一份日志仍是秒开（缓存上限与淘汰见 log-cache.ts） */
    const deleteLocal = useCallback((id: string) => {
        deleteReport(id);
        setHistory(listReports());
    }, []);

    /** 删单条**云端**记录：调 /api/reports/:id（服务端只允许删自己前缀下的键），删完重拉列表 */
    const deleteCloud = useCallback(
        async (id: string) => {
            try {
                await fetch(`/api/reports/detail?id=${encodeURIComponent(id)}`, { method: "DELETE" });
            } catch {
                // 网络失败就保持列表不动，用户还能再试
            }
            await refreshCloud();
        },
        [refreshCloud],
    );

    const busy = stage !== "idle" && stage !== "done";

    return {
        // refs
        inputRef,
        reportIdRef,
        pendingHashRef,
        // state
        stage,
        error,
        report,
        manifest,
        info,
        aiMarkdown,
        history,
        // 配额数据继续留在这里（/api/me、explain 响应都在更新它），但**暂无任何界面消费**：
        // 次数展示 2026-09-21 全线撤掉（上传卡 / AI 解读页 / 我的页），上限以后由后台配置。
        // 后台配好之后 UI 直接从这里取，不用再动 hook 和取数逻辑——所以别把它当死代码删。
        quota,
        loggedIn,
        cloudItems,
        dedupeNotice,
        pendingBytes,
        cachedHashes,
        cacheInfo,
        busy,
        // actions
        setError,
        setReport,
        setManifest,
        setInfo,
        setAiMarkdown,
        setHistory,
        setDedupeNotice,
        resetWorker,
        refreshMe,
        refreshCloud,
        explain,
        requestSeries,
        viewSaved,
        storedPlots,
        loadTrack,
        openSaved,
        loadReportData,
        handleFile,
        recoverWithFile,
        clearLocal,
        deleteLocal,
        deleteCloud,
        parseBytes,
    };
}
