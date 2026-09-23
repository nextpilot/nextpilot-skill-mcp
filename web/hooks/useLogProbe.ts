"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TopicManifest, SeriesResponse } from "@/lib/types";
import type { SeriesRequest } from "@/lib/chart-presets";
import { hashLogBytes } from "@/lib/log-hash";
import {
    getSharedWorker,
    addWorkerListener,
    removeWorkerListener,
    addWorkerErrorListener,
    removeWorkerErrorListener,
    type WorkerMsg,
} from "@/lib/worker-pool";

export function useLogProbe() {
    const inputRef = useRef<HTMLInputElement>(null);
    const reqIdRef = useRef(0);
    const pendingRef = useRef<Map<string, (data: unknown) => void>>(new Map());

    const [stage, setStage] = useState<string>("idle");
    const [error, setError] = useState<string | null>(null);
    const [manifest, setManifest] = useState<TopicManifest | null>(null);
    const [logId, setLogId] = useState<string | null>(null);
    const [parsed, setParsed] = useState(false);

    useEffect(() => {
        const w = getSharedWorker();
        if (!w) return;

        const listener = (msg: WorkerMsg) => {
            if (msg.type === "stage") {
                setStage(msg.stage);
            } else if (msg.type === "done") {
                setStage("done");
                setManifest(msg.manifest);
                setLogId(msg.logId);
                setParsed(true);
            } else if (msg.type === "series") {
                const cb = pendingRef.current.get(msg.reqId);
                if (cb) {
                    pendingRef.current.delete(msg.reqId);
                    cb(msg.data);
                }
            } else if (msg.type === "error") {
                setError(msg.message);
                setStage("idle");
            }
        };

        addWorkerListener(listener);
        const errListener = (msg: string) => setError(msg);
        addWorkerErrorListener(errListener);

        return () => {
            removeWorkerListener(listener);
            removeWorkerErrorListener(errListener);
        };
    }, []);

    const handleFile = useCallback(async (file: File) => {
        setError(null);
        setStage("reading");
        setParsed(false);
        setManifest(null);

        try {
            const buf = await file.arrayBuffer();
            const bytes = new Uint8Array(buf);
            const logHash = await hashLogBytes(bytes);

            const w = getSharedWorker();
            if (!w) {
                setError("此浏览器不支持 Web Worker");
                return;
            }

            setStage("parsing");
            w.postMessage({ type: "analyze", file: bytes, logId: logHash });
        } catch (e) {
            setError(e instanceof Error ? e.message : "文件读取失败");
            setStage("idle");
        }
    }, []);

    const requestSeries = useCallback(
        async (req: SeriesRequest): Promise<SeriesResponse> => {
            const w = getSharedWorker();
            if (!w) return { t: [], x: null, series: [], fullCount: 0, error: "Worker 不可用" };
            if (!logId) return { t: [], x: null, series: [], fullCount: 0, error: "未解析日志" };

            const reqId = String(++reqIdRef.current);
            const promise = new Promise<unknown>((resolve) => {
                pendingRef.current.set(reqId, resolve);
            });

            w.postMessage({ type: "series", reqId, request: req, logId });

            const raw = await promise;
            const data = raw as SeriesResponse;
            if (data.error) {
                return { t: [], x: null, series: [], fullCount: 0, error: data.error };
            }
            return data;
        },
        [logId],
    );

    const reset = useCallback(() => {
        setManifest(null);
        setLogId(null);
        setParsed(false);
        setStage("idle");
        setError(null);
    }, []);

    return {
        inputRef,
        stage,
        error,
        manifest,
        logId,
        parsed,
        handleFile,
        requestSeries,
        reset,
    };
}
