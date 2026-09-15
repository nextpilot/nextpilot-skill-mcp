"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
    AnalysisReport,
    LogInfo,
    SeriesResponse,
    TopicManifest,
} from "@/lib/types";
import type { WorkerStage } from "@/workers/ulog-worker";
import type { SeriesRequest } from "@/lib/chart-presets";
import {
    clearReports,
    deleteReport,
    listReports,
    newReportId,
    saveReport,
    type SavedReport,
} from "@/lib/report-history";
import { getDeviceId } from "@/lib/device-id";
import { fallbackLogKey, hashLogBytes } from "@/lib/log-hash";
import { cacheUsage, cachedLogHashes, getCachedLog, putCachedLog } from "@/lib/log-cache";
import type { HistoryItem } from "@/components/HistoryList";

export function useLogAnalyzer() {
    const workerRef = useRef<Worker | null>(null);
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
    const [cacheInfo, setCacheInfo] = useState<{ entries: number; bytes: number; }>({
        entries: 0,
        bytes: 0,
    });

    const resetWorker = useCallback(() => {
        workerRef.current?.terminate();
        workerRef.current = null;
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
                    findings: [],
                    findingCount: Number(r.findingCount ?? 0),
                    stats: {},
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

    useEffect(() => {
        setHistory(listReports());
        void refreshMe();
        void cachedLogHashes().then(setCachedHashes);
        void cacheUsage().then(setCacheInfo);
        return () => {
            resetWorker();
        };
    }, [refreshMe, resetWorker]);

    const persist = useCallback(
        (r: AnalysisReport, id: string, ai: string | null, hash?: string) => {
            saveReport({
                id,
                fileName: r.fileName,
                fileSize: r.fileSize,
                durationSec: r.durationSec,
                platform: r.platform,
                vehicleType: r.vehicleType,
                verSw: r.verSw,
                verHw: r.verHw,
                parserVersion: r.parserVersion,
                logHash: hash ?? r.logHash,
                findings: r.findings,
                stats: r.stats,
                tags: r.tags,
                guardTags: r.guardTags,
                phases: r.phases,
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
                        durationSec: r.durationSec,
                        platform: r.platform,
                        parserVersion: r.parserVersion,
                        logHash: r.logHash ?? pendingHashRef.current,
                        findings: r.findings,
                        stats: r.stats,
                        tags: r.tags ?? [],
                        guardTags: r.guardTags ?? [],
                        phases: r.phases ?? [],
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
            const worker = workerRef.current;
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
            durationSec: saved.durationSec,
            platform: saved.platform as AnalysisReport["platform"],
            vehicleType: saved.vehicleType,
            parserVersion: saved.parserVersion,
            logHash: saved.logHash,
            findings: saved.findings,
            stats: saved.stats,
            tags: saved.tags,
            guardTags: saved.guardTags,
            phases: saved.phases,
            matchedFaults: saved.matchedFaults,
            analyzedAt: saved.analyzedAt,
        });
        setStage("done");
    }, []);

    const viewHistoryItem = useCallback(
        async (item: HistoryItem) => {
            if (item.source === "cloud") {
                try {
                    const resp = await fetch(`/api/reports/${item.id}`);
                    if (!resp.ok) return;
                    const data = await resp.json();
                    if (data.report) viewSaved(data.report as SavedReport);
                } catch {
                    // 网络异常时静默
                }
                return;
            }
            viewSaved(item);
        },
        [viewSaved],
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

    const ensureWorker = useCallback((): Worker | null => {
        if (workerRef.current) return workerRef.current;
        const worker = new Worker(
            new URL("../workers/ulog-worker.ts", import.meta.url),
            { type: "module" },
        );
        worker.onerror = (e) => {
            resetWorker();
            setError(
                `本地解析引擎加载失败：${e.message || "无法加载 Worker 脚本"}。` +
                `若是网络原因（Pyodide 从 CDN 加载），请检查网络后重试。`,
            );
            setStage("idle");
        };
        worker.onmessageerror = () => {
            resetWorker();
            setError("本地解析引擎消息解析失败，请刷新页面重试。");
            setStage("idle");
        };
        worker.onmessage = (e: MessageEvent) => {
            const msg = e.data;
            if (msg.type === "stage") {
                setStage(msg.stage);
            } else if (msg.type === "error") {
                setError(msg.message);
                setStage("idle");
            } else if (msg.type === "done") {
                const r = msg.report as AnalysisReport;
                r.fileName = pendingFileRef.current.name;
                r.fileSize = pendingFileRef.current.size;
                r.analyzedAt = new Date().toISOString();
                r.logHash = pendingHashRef.current;
                const sys = (msg.info as LogInfo)?.sysInfo ?? {};
                r.verSw = sys["ver_sw"]?.slice(0, 20);
                r.verHw = sys["ver_hw"];
                setReport(r);
                setManifest(msg.manifest as TopicManifest);
                setInfo(msg.info as LogInfo);
                setStage("done");
                setAiMarkdown(pendingAiRef.current);
                persist(r, reportIdRef.current, pendingAiRef.current, pendingHashRef.current);
                void cacheCurrentLog();
            } else if (msg.type === "series") {
                const resolve = pendingRef.current.get(msg.reqId);
                if (resolve) {
                    pendingRef.current.delete(msg.reqId);
                    resolve(msg.data);
                }
            }
        };
        workerRef.current = worker;
        return worker;
    }, [cacheCurrentLog, persist, resetWorker]);

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
                    if (existing.source === "cloud") await viewHistoryItem(existing);
                    else viewSaved(existing);
                    setPendingBytes({ name: file.name, size: file.size, hash, bytes });
                    setDedupeNotice(
                        "这份日志此前已分析过（内容一致），已直接载入历史结论，未重复解析。",
                    );
                    return existing.id;
                }

                const reportId = newReportId();
                parseBytes(bytes, {
                    name: file.name,
                    size: file.size,
                    hash,
                    reportId,
                    priorAi: null,
                });
                return reportId;
            } catch (err) {
                resetWorker();
                setStage("idle");
                setError(
                    `日志上传失败：${err instanceof Error ? err.message : String(err)}。请确认文件未损坏后重试。`,
                );
                return null;
            }
        },
        [findExistingByHash, parseBytes, resetWorker, viewHistoryItem, viewSaved],
    );

    const restoreFullData = useCallback(
        async (item: HistoryItem) => {
            const hash = item.logHash;
            if (!hash) {
                setError("这条历史记录没有日志指纹，无法定位缓存文件，请重新选择该日志。");
                return;
            }
            const cached = await getCachedLog(hash);
            if (!cached) {
                setError(
                    "本机没有这份日志的缓存（可能已被容量淘汰，或报告来自其他设备）。" +
                    "重新选择该 .ulg 文件即可恢复图表与参数。",
                );
                return;
            }
            setError(null);
            setDedupeNotice(null);
            setManifest(null);
            setInfo(null);
            parseBytes(cached.bytes, {
                name: cached.name || item.fileName,
                size: cached.bytes.byteLength,
                hash,
                reportId: item.id,
                priorAi: item.aiMarkdown,
            });
        },
        [parseBytes],
    );

    const deleteHistoryItem = useCallback(
        (item: HistoryItem) => {
            if (item.source === "cloud") {
                void fetch(`/api/reports/${item.id}`, {
                    method: "DELETE",
                }).then(() => void refreshCloud());
            } else {
                deleteReport(item.id);
                setHistory(listReports());
            }
        },
        [refreshCloud],
    );

    const clearLocal = useCallback(() => {
        clearReports();
        setHistory([]);
    }, []);

    const busy = stage !== "idle" && stage !== "done";

    return {
        // refs
        inputRef,
        workerRef,
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
        viewHistoryItem,
        handleFile,
        restoreFullData,
        deleteHistoryItem,
        clearLocal,
        parseBytes,
    };
}