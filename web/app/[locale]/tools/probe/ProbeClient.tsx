"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLogProbe } from "@/hooks/useLogProbe";
import { UploadCloud, Loader2, Search, X, Plus, Trash2, BarChart3 } from "lucide-react";
import type { TopicManifest, SeriesResponse, TopicMeta } from "@/lib/types";
import type { SeriesRequest } from "@/lib/chart-presets";

type PlotlyType = {
    react: (el: HTMLElement, data: unknown[], layout: Record<string, unknown>, cfg?: unknown) => Promise<unknown>;
    newPlot: (el: HTMLElement, data: unknown[], layout: Record<string, unknown>, cfg?: unknown) => Promise<unknown>;
    purge: (el: HTMLElement) => void;
    Plots: { resize: (el: HTMLElement) => void };
};

let plotlyPromise: Promise<PlotlyType> | null = null;
function getPlotly(): Promise<PlotlyType> {
    if (!plotlyPromise) {
        plotlyPromise = import("plotly.js-basic-dist-min").then((m) => (m.default ?? m) as unknown as PlotlyType);
    }
    return plotlyPromise;
}

const COLORS = [
    "#6366f1",
    "#22c55e",
    "#f59e0b",
    "#ef4444",
    "#06b6d4",
    "#a855f7",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#3b82f6",
    "#84cc16",
    "#d946ef",
];

// ── 单个图表的 Plotly 渲染 ──

function ProbeChart({
    groupId,
    fields,
    requestSeries,
    onRemove,
}: {
    groupId: string;
    fields: { topic: string; instance: number; field: string; label: string }[];
    requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
    onRemove: () => void;
}) {
    const elRef = useRef<HTMLDivElement>(null);
    const [state, setState] = useState<"loading" | "done" | "error">("loading");
    const [msg, setMsg] = useState<string>("");

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            setState("loading");
            try {
                const req: SeriesRequest = {
                    instance: fields[0].instance,
                    xdata: null,
                    ydata: fields.map((f) => ({
                        kind: "field" as const,
                        fields: [`${f.topic}[${f.instance}].${f.field}`],
                    })),
                    compute: [],
                    series: fields.map((f, i) => ({
                        label: f.label,
                        style: null,
                        color: COLORS[i % COLORS.length],
                    })),
                };

                const data = await requestSeries(req);
                if (cancelled) return;

                if (data.error) {
                    setState("error");
                    setMsg(data.error);
                    return;
                }

                const Plotly = await getPlotly();
                if (cancelled || !elRef.current) return;

                const traces = data.series.map((s, i) => ({
                    x: data.t,
                    y: s ?? [],
                    type: "scattergl",
                    mode: "lines",
                    name: fields[i].label,
                    line: { color: COLORS[i % COLORS.length], width: 1.5 },
                    connectgaps: false,
                }));

                const layout: Record<string, unknown> = {
                    font: { size: 11, color: isDark() ? "#94a3b8" : "#64748b" },
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                    margin: { l: 50, r: 20, t: 10, b: 35 },
                    xaxis: {
                        title: "秒（开机起）",
                        gridcolor: isDark() ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                        zeroline: false,
                    },
                    yaxis: {
                        gridcolor: isDark() ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                        zeroline: false,
                    },
                    legend: { orientation: "h", y: 1.1 },
                    hovermode: "x unified",
                };

                if (elRef.current.dataset.plotted === "1") {
                    await Plotly.react(elRef.current, traces, layout, { responsive: true });
                } else {
                    await Plotly.newPlot(elRef.current, traces, layout, { responsive: true });
                    elRef.current.dataset.plotted = "1";
                }
                setState("done");
            } catch (e) {
                if (!cancelled) {
                    setState("error");
                    setMsg(e instanceof Error ? e.message : "绘图失败");
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="relative rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted">{groupId}</span>
                <button
                    type="button"
                    onClick={onRemove}
                    className="rounded p-0.5 text-muted hover:bg-muted/50 hover:text-foreground"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
            {state === "loading" && (
                <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    取数中…
                </div>
            )}
            {state === "error" && <p className="py-8 text-center text-sm text-red-500">{msg}</p>}
            <div ref={elRef} className="h-64 w-full" />
        </div>
    );
}

// ── 字段浏览器 ──

function ProbeFieldExplorer({
    manifest,
    selectedFields,
    onToggleField,
}: {
    manifest: TopicManifest;
    selectedFields: { topic: string; instance: number; field: string; label: string }[];
    onToggleField: (f: { topic: string; instance: number; field: string; label: string }) => void;
}) {
    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const filtered = useMemo(() => {
        if (!search.trim()) return manifest.topics;
        const s = search.toLowerCase();
        return manifest.topics.filter(
            (t) => t.topic.toLowerCase().includes(s) || t.fields.some((f) => f.name.toLowerCase().includes(s)),
        );
    }, [manifest, search]);

    const selSet = useMemo(
        () => new Set(selectedFields.map((f) => `${f.topic}[${f.instance}].${f.field}`)),
        [selectedFields],
    );

    const toggle = useCallback(
        (topic: string, instance: number, field: string) => {
            const label = `${topic}[${instance}].${field}`;
            onToggleField({ topic, instance, field, label });
        },
        [onToggleField],
    );

    const toggleExpand = useCallback((key: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    if (manifest.topics.length === 0) {
        return <p className="py-8 text-center text-sm text-muted">此日志没有可展示的字段。</p>;
    }

    return (
        <div>
            <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索 topic 或字段…"
                    className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground outline-none focus:border-primary/50"
                />
            </div>

            <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
                {filtered.map((topic) => {
                    const key = `${topic.topic}[${topic.instance}]`;
                    const open = expanded.has(key);
                    return (
                        <div key={key} className="border-b border-border/50 last:border-0">
                            <button
                                type="button"
                                onClick={() => toggleExpand(key)}
                                className="flex w-full items-center gap-2 py-1.5 text-left text-xs hover:bg-muted/30"
                            >
                                <span
                                    className={`ml-1 transition-transform ${open ? "rotate-90" : ""}`}
                                    style={{ fontSize: 8 }}
                                >
                                    ▶
                                </span>
                                <span className="font-mono font-medium text-foreground">{topic.topic}</span>
                                <span className="text-muted">[{topic.instance}]</span>
                                <span className="text-muted">({topic.n} 条)</span>
                            </button>
                            {open && (
                                <div className="pl-5">
                                    {topic.fields.map((f) => {
                                        const fkey = `${topic.topic}[${topic.instance}].${f.name}`;
                                        const checked = selSet.has(fkey);
                                        return (
                                            <label
                                                key={f.name}
                                                className="flex cursor-pointer items-center gap-2 py-1 text-xs hover:bg-muted/20"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggle(topic.topic, topic.instance, f.name)}
                                                    className="h-3 w-3 rounded accent-primary"
                                                />
                                                <span className="font-mono text-foreground">{f.name}</span>
                                                <span className="ml-auto text-muted">{f.dtype}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── 主页面 ──

function isDark(): boolean {
    return document.documentElement.dataset.theme === "dark";
}

const STAGE_LABELS: Record<string, string> = {
    idle: "待上传",
    reading: "读取文件…",
    "loading-runtime": "加载 Pyodide 运行时…",
    "installing-parser": "安装解析器…",
    parsing: "解析日志…",
    done: "解析完成",
};

export default function ProbeClient() {
    const { inputRef, stage, error, manifest, handleFile, requestSeries, reset } = useLogProbe();
    const [selectedFields, setSelectedFields] = useState<
        { topic: string; instance: number; field: string; label: string }[]
    >([]);
    const [chartGroups, setChartGroups] = useState<
        { id: string; fields: { topic: string; instance: number; field: string; label: string }[] }[]
    >([]);

    const handleToggleField = useCallback((f: { topic: string; instance: number; field: string; label: string }) => {
        setSelectedFields((prev) => {
            const key = `${f.topic}[${f.instance}].${f.field}`;
            const exists = prev.some((x) => `${x.topic}[${x.instance}].${x.field}` === key);
            if (exists) return prev.filter((x) => `${x.topic}[${x.instance}].${x.field}` !== key);
            return [...prev, f];
        });
    }, []);

    const addChart = useCallback(() => {
        if (selectedFields.length === 0) return;
        setChartGroups((prev) => [...prev, { id: `图 ${prev.length + 1}`, fields: [...selectedFields] }]);
        setSelectedFields([]);
    }, [selectedFields]);

    const removeChart = useCallback((idx: number) => {
        setChartGroups((prev) => prev.filter((_, i) => i !== idx));
    }, []);

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        },
        [handleFile],
    );

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    if (!manifest) {
        return (
            <div className="page-shell pt-4 pb-10 sm:pt-5">
                <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Log Probe</h1>
                <p className="mt-2 text-sm text-muted">
                    上传一份 .ulg / .bin 文件，浏览所有字段，选中即可即席绘图 —— 一切在浏览器内完成，原始日志不出本机。
                </p>

                <div
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onClick={() => inputRef.current?.click()}
                    className="mt-6 flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border px-8 py-12 transition-colors hover:border-primary/40 hover:bg-muted/20"
                >
                    {stage === "idle" ? (
                        <UploadCloud className="h-10 w-10 text-muted" />
                    ) : (
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    )}
                    <p className="text-sm font-medium text-foreground">
                        {stage === "idle" ? "拖入 .ulg / .bin 或点击选择" : STAGE_LABELS[stage]}
                    </p>
                    <p className="text-xs text-muted">支持 PX4 .ulg 与 ArduPilot .bin，解析在浏览器内进行</p>
                </div>

                <input
                    ref={inputRef}
                    type="file"
                    accept=".ulg,.bin"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFile(file);
                    }}
                />

                {error && (
                    <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                        <p className="text-sm text-red-400">{error}</p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="page-shell flex h-[calc(100vh-64px)] flex-col pt-2">
            <div className="flex items-center justify-between border-b border-border py-2">
                <div className="flex items-center gap-3">
                    <h1 className="text-lg font-semibold">Log Probe</h1>
                    <span className="text-xs text-muted">
                        {manifest.topics.length} topics, {manifest.topics.reduce((sum, t) => sum + t.fields.length, 0)}{" "}
                        fields
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={reset}
                        className="rounded-md border border-border px-3 py-1 text-xs text-muted hover:bg-muted/50"
                    >
                        重新选择
                    </button>
                </div>
            </div>

            <div className="flex flex-1 gap-0 overflow-hidden">
                {/* 左侧：字段浏览器 */}
                <div className="w-72 shrink-0 overflow-y-auto border-r border-border p-3">
                    <ProbeFieldExplorer
                        manifest={manifest}
                        selectedFields={selectedFields}
                        onToggleField={handleToggleField}
                    />
                </div>

                {/* 右侧：图表区 */}
                <div className="flex-1 overflow-y-auto p-3">
                    {/* 图组工具栏 */}
                    <div className="mb-3 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={addChart}
                            disabled={selectedFields.length === 0}
                            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            新建图（{selectedFields.length} 字段已选）
                        </button>
                        {selectedFields.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setSelectedFields([])}
                                className="rounded-md px-2 py-1.5 text-xs text-muted hover:text-foreground"
                            >
                                清除选择
                            </button>
                        )}
                    </div>

                    {chartGroups.length === 0 ? (
                        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border">
                            <BarChart3 className="h-10 w-10 text-muted" />
                            <p className="text-sm text-muted">左侧勾选字段，点击「新建图」开始绘图</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {chartGroups.map((g, i) => (
                                <ProbeChart
                                    key={g.id}
                                    groupId={g.id}
                                    fields={g.fields}
                                    requestSeries={requestSeries}
                                    onRemove={() => removeChart(i)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="mx-3 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2">
                    <p className="text-xs text-red-400">{error}</p>
                </div>
            )}
        </div>
    );
}
