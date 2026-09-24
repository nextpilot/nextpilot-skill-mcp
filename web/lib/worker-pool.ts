"use client";

import type { TopicManifest } from "./types";

export type WorkerMsg =
    | { type: "stage"; stage: string; detail?: string }
    | { type: "done"; report: unknown; manifest: TopicManifest; info: unknown; logId: string }
    | { type: "series"; reqId: string; data: unknown }
    | { type: "track"; reqId: string; data: unknown }
    | { type: "error"; message: string };

let sharedWorker: Worker | null = null;
const sharedListeners = new Set<(msg: WorkerMsg) => void>();
const sharedErrorListeners = new Set<(msg: string) => void>();

export function getSharedWorker(): Worker | null {
    if (typeof Worker === "undefined") return null;
    if (sharedWorker) return sharedWorker;
    try {
        const w = new Worker(new URL("../workers/analysis-worker.ts", import.meta.url), { type: "module" });
        w.onmessage = (e: MessageEvent<WorkerMsg>) => {
            for (const l of sharedListeners) l(e.data);
        };
        w.onerror = () => {
            const msg = "本地解析引擎加载失败，请刷新页面重试。";
            for (const l of sharedErrorListeners) l(msg);
        };
        sharedWorker = w;
        return w;
    } catch {
        return null;
    }
}

export function addWorkerListener(fn: (msg: WorkerMsg) => void) {
    sharedListeners.add(fn);
}

export function removeWorkerListener(fn: (msg: WorkerMsg) => void) {
    sharedListeners.delete(fn);
}

export function addWorkerErrorListener(fn: (msg: string) => void) {
    sharedErrorListeners.add(fn);
}

export function removeWorkerErrorListener(fn: (msg: string) => void) {
    sharedErrorListeners.delete(fn);
}
