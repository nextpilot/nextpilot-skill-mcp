"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
    AnalysisReport,
    LogInfo,
    SeriesResponse,
    TopicManifest,
    TrackData,
} from "@/lib/types";
import type { WorkerOutMessage, WorkerStage } from "@/workers/ulog-worker";
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
    patchReport,
    saveReport,
    saveReportData,
    type SavedReport,
} from "@/lib/report-history";
import { getDeviceId } from "@/lib/device-id";
import { DERIVED_DATA_VERSION } from "@/lib/knowledge/derived-version.generated";
import { fallbackLogKey, hashLogBytes } from "@/lib/log-hash";
import { cacheUsage, cachedLogHashes, getCachedLog, putCachedLog } from "@/lib/log-cache";
import type { HistoryItem } from "@/components/HistoryList";

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

function getSharedWorker(): Worker | null {
    if (typeof Worker === "undefined") return null;
    if (sharedWorker) return sharedWorker;
    try {
        const w = new Worker(new URL("../workers/ulog-worker.ts", import.meta.url), { type: "module" });
        w.onmessage = (e: MessageEvent) => {
            for (const l of sharedListeners) l(e.data);
        };
        w.onerror = (e) =>
            broadcastError(
                `本地解析引擎加载失败：${e.message || "无法加载 Worker 脚本"}。` +
                    `若是网络原因（Pyodide 从 CDN 加载），请检查网络后重试。`,
            );
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
}

/**
 * 刚分析完的那一份结果（模块级）。
 *
 * 为什么需要：在列表页分析完会跳到结果页，而结果页是**另一个 hook 实例**，它去 IndexedDB
 * 读派生数据时，后台的曲线抽取（约 1 秒）往往还没写完 —— 于是只看到参数/消息、没有曲线，
 * 图表 tab 就被判成"不可用"。这里把内存里的结果直接交接过去，既消除竞态，也省掉一次重复解析。
 */
let liveAnalysis: {
    id: string;
    manifest: TopicManifest;
    info: LogInfo;
    storedPlots?: { panels: StoredPlotPanel[]; series: StoredPlotSeries; };
} | null = null;

export function useLogAnalyzer() {
    const inputRef = useRef<HTMLInputElement>(null);
    const pendingRef = useRef<Map<string, (data: unknown) => void>>(new Map());
    const reqIdRef = useRef(0);
    const reportIdRef = useRef<string>("");
    const pendingFileRef = useRef<{ name: string; size: number; }>({ name: "", size: 0 });
    const pendingHashRef = useRef<string>("");
    const pendingAiRef = useRef<string | null>(null);
    const pendingBytesRef = useRef<Uint8Array | null>(null);

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
    const [cacheInfo, setCacheInfo] = useState<{ entries: number; bytes: number; }>({
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
            return (data.reports ?? []).map(
                (r: Record<string, unknown>): HistoryItem => ({
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
                }),
            );
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


    const persist = useCallback(
        (r: AnalysisReport, id: string, ai: string | null, hash?: string) => {
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
        },
        [],
    );

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
                    markdown = `> ${data.error ?? "今日免费额度已用完"}。额度每日 0 点（UTC）重置。`;
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

    const requestSeries = useCallback(
        (req: SeriesRequest): Promise<SeriesResponse> => {
            const worker = getSharedWorker();
            if (!worker) return Promise.resolve({ error: "worker 未就绪" } as SeriesResponse);
            const reqId = `s${reqIdRef.current++}`;
            return new Promise((resolve) => {
                pendingRef.current.set(reqId, (data) => resolve(data as SeriesResponse));
                worker.postMessage({
                    type: "series",
                    reqId,
                    topic: req.topic,
                    instance: req.instance,
                    fields: req.fields,
                });
            });
        },
        [],
    );

    /** 要一份 GPS 轨迹；与 requestSeries 同一套 pending 机制 */
    const requestTrack = useCallback((): Promise<TrackData> => {
        const worker = getSharedWorker();
        if (!worker) return Promise.resolve({ error: "worker 未就绪" } as unknown as TrackData);
        const reqId = `t${reqIdRef.current++}`;
        return new Promise((resolve) => {
            pendingRef.current.set(reqId, (data) => resolve(data as TrackData));
            worker.postMessage({ type: "track", reqId });
        });
    }, []);

    /** 把各预设的曲线抽出来存进报告存档（键与 LogCharts 的 seriesKey 一致：`presetId#面板序号`） */
    const extractPlots = useCallback(
        async (id: string, manifest: TopicManifest, info: LogInfo) => {
            try {
                const panels = resolvePlotPanels(manifest);
                if (panels.length === 0) return;
                const series: StoredPlotSeries = {};
                for (const sp of panels) {
                    for (let i = 0; i < sp.panels.length; i++) {
                        const req = sp.panels[i].requests[0];
                        if (!req) continue;
                        const resp = await requestSeries(req);
                        if (resp && !(resp as { error?: string }).error) series[`${sp.presetId}#${i}`] = resp;
                    }
                }
                setStoredPlots({ panels, series });
                if (liveAnalysis?.id === id) liveAnalysis.storedPlots = { panels, series };
                // 轨迹（地图用）：一次抽好存下，之后打开历史不必再解析
                const track = await requestTrack();
                const hasTrack = track && !track.error && (track.lat?.length ?? 0) > 1;
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

    const viewSaved = useCallback((saved: SavedReport) => {
        setError(null);
        setManifest(null);
        setInfo(null);
        setAiMarkdown(saved.aiMarkdown);
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
    }, []);

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
            } else if (m.type === "done") {
                const r = m.report as AnalysisReport;
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
        [cacheCurrentLog, extractPlots, persist],
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

    /** 拿共享 Worker；本 hook 的监听器在挂载 effect 里注册（只注册一次） */
    const ensureWorker = useCallback((): Worker | null => {
        const worker = getSharedWorker();
        if (!worker) {
            setError("本地解析引擎无法启动（浏览器不支持 Web Worker？）");
            setStage("idle");
        }
        return worker;
    }, []);

    const parseBytes = useCallback(
        (
            bytes: Uint8Array,
            meta: {
                name: string;
                size: number;
                hash: string;
                reportId: string;
                priorAi: string | null;
            },
        ) => {
            const worker = ensureWorker();
            if (!worker) return;
            pendingFileRef.current = { name: meta.name, size: meta.size };
            pendingHashRef.current = meta.hash;
            pendingAiRef.current = meta.priorAi;
            pendingBytesRef.current = bytes;
            reportIdRef.current = meta.reportId;
            setAiMarkdown(meta.priorAi);
            setPendingBytes(null);
            setStage("loading-runtime");
            worker.postMessage({ type: "analyze", file: bytes });
        },
        [ensureWorker],
    );

    /** 读存档的派生数据并填充 UI；告诉调用方"参数/消息"与"曲线"各有没有、是不是旧引擎生成的 */
    const loadReportData = useCallback(
        async (
            id: string,
        ): Promise<{ hasInfo: boolean; hasPlots: boolean; hasTrack: boolean; stale: boolean; }> => {
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
     * 返回 reparsing / stale 供调用方决定提示文案与是否补一次解析。
     */
    const openSaved = useCallback(
        async (saved: SavedReport): Promise<{ reparsing: boolean; stale: boolean }> => {
            viewSaved(saved);
            reportIdRef.current = saved.id;
            if (adoptLiveAnalysis(saved.id)) return { reparsing: false, stale: false };
            const { hasPlots, hasTrack, stale } = await loadReportData(saved.id);
            // 曲线、轨迹都齐了、且是当前引擎生成的，才算"不必解析"
            if (hasPlots && hasTrack && !stale) return { reparsing: false, stale: false };
            if (saved.logHash) {
                const cached = await getCachedLog(saved.logHash);
                if (cached) {
                    parseBytes(cached.bytes, {
                        name: cached.name || saved.fileName,
                        size: cached.bytes.byteLength,
                        hash: saved.logHash,
                        reportId: saved.id,
                        priorAi: saved.aiMarkdown,
                    });
                    return { reparsing: true, stale };
                }
            }
            return { reparsing: false, stale };
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

            if (!file.name.toLowerCase().endsWith(".ulg")) {
                setError("冲刺 1 仅支持 PX4 .ulg 日志，ArduPilot .bin 将在冲刺 3 支持");
                return null;
            }

            if (file.size === 0) {
                setError("日志文件为空，请选择有效的 PX4 .ulg 文件。");
                return null;
            }

            try {
                const bytes = new Uint8Array(await file.arrayBuffer());

                const hash =
                    (await hashLogBytes(bytes)) ||
                    fallbackLogKey(file.name, file.size, file.lastModified);
                const existing = await findExistingByHash(hash);
                if (existing) {
                    let opened: { reparsing: boolean; stale: boolean } = { reparsing: false, stale: false };
                    if (existing.source === "cloud") {
                        // 云端列表只给了摘要，先取回完整记录再走统一的打开路径
                        try {
                            const resp = await fetch(`/api/reports/${existing.id}`);
                            if (resp.ok) {
                                const data = await resp.json();
                                if (data.report) opened = await openSaved(data.report as SavedReport);
                            }
                        } catch {
                            // 取不到就只提示"已分析过"，不阻断
                        }
                    } else {
                        opened = await openSaved(existing);
                    }
                    // 存档是旧引擎生成的、而原始日志又不在本机缓存里（被淘汰或来自别的设备）：
                    // 手里正好有新上传的字节，直接重新解析一遍补上，别让用户看旧格式
                    let reparsing = opened.reparsing;
                    if (opened.stale && !reparsing) {
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
                        reparsing
                            ? "这份日志此前已分析过，但那份存档是旧版本引擎生成的（消息/参数的呈现方式已更新），已重新解析一遍。"
                            : "这份日志此前已分析过（内容一致），已直接载入历史结论，未重复解析。",
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
                setError(
                    `日志上传失败：${err instanceof Error ? err.message : String(err)}。请确认文件未损坏后重试。`,
                );
                return null;
            }
        },
        [findExistingByHash, openSaved, parseBytes],
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
                await fetch(`/api/reports/${encodeURIComponent(id)}`, { method: "DELETE" });
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
        clearLocal,
        deleteLocal,
        deleteCloud,
        parseBytes,
    };
}