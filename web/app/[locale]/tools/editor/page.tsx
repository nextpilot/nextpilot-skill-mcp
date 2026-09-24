"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLogProbe } from "@/hooks/useLogProbe";
import { yamlToPanels } from "@/lib/tools/compile-yaml-preset";
import { UploadCloud, Loader2, Play, AlertCircle, CheckCircle2, FileCode, X } from "lucide-react";
import type { SeriesResponse } from "@/lib/types";
import type { PanelSpec, SeriesRequest } from "@/lib/chart-presets";

// ── Plotly 懒加载 ──
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

function isDark(): boolean {
    return document.documentElement.dataset.theme === "dark";
}

// ── 单面板 Plotly 图表 ──
function PanelChart({
    panel,
    requestSeries,
}: {
    panel: PanelSpec;
    requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
}) {
    const elRef = useRef<HTMLDivElement>(null);
    const [state, setState] = useState<"loading" | "done" | "error">("loading");
    const [msg, setMsg] = useState("");

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            setState("loading");
            try {
                const Plotly = await getPlotly();
                const tracesList: unknown[] = [];

                for (const req of panel.requests) {
                    const data = await requestSeries(req);
                    if (cancelled) return;

                    if (data.error) {
                        setState("error");
                        setMsg(data.error);
                        return;
                    }

                    if (req.xdata) {
                        tracesList.push({
                            x: data.x ?? [],
                            y: data.series[0] ?? [],
                            type: "scattergl",
                            mode: "lines",
                            name: req.series[0].label,
                            line: {
                                color: req.series[0].color || COLORS[tracesList.length % COLORS.length],
                                width: 1.5,
                            },
                        });
                    } else {
                        for (let i = 0; i < data.series.length; i++) {
                            tracesList.push({
                                x: data.t,
                                y: data.series[i] ?? [],
                                type: "scattergl",
                                mode: "lines",
                                name: req.series[i].label,
                                line: {
                                    color: req.series[i].color || COLORS[tracesList.length % COLORS.length],
                                    width: 1.5,
                                },
                                connectgaps: false,
                            });
                        }
                    }
                }

                if (cancelled || !elRef.current) return;

                const layout: Record<string, unknown> = {
                    font: { size: 11, color: isDark() ? "#94a3b8" : "#64748b" },
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                    margin: { l: 50, r: 20, t: 10, b: 35 },
                    xaxis: {
                        title: panel.xLabel || "秒（开机起）",
                        gridcolor: isDark() ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                        zeroline: false,
                    },
                    yaxis: {
                        title: panel.yLabel || "",
                        gridcolor: isDark() ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                        zeroline: false,
                    },
                    legend: { orientation: "h", y: 1.12 },
                    hovermode: "x unified",
                    shapes: panel.hlines?.map((h) => ({
                        type: "line",
                        x0: 0,
                        x1: 1,
                        xref: "paper",
                        y0: h.value,
                        y1: h.value,
                        line: { color: h.color, width: 1, dash: "dash" },
                    })),
                };

                if (elRef.current.dataset.plotted === "1") {
                    await Plotly.react(elRef.current, tracesList, layout, { responsive: true });
                } else {
                    await Plotly.newPlot(elRef.current, tracesList, layout, { responsive: true });
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
        <div className="rounded-lg border border-border bg-card p-3">
            <p className="mb-1 text-xs font-medium text-muted">{panel.title}</p>
            {state === "loading" && (
                <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    取数中…
                </div>
            )}
            {state === "error" && <p className="py-8 text-center text-sm text-red-500">{msg}</p>}
            <div ref={elRef} className="h-72 w-full" />
        </div>
    );
}

// ── 主体：编辑器页面 ──
const SAMPLE_YAML = `id: my_custom_plot
title: Custom Plot
description: 自定义曲线
order: 99
conditions:
  topics:
    - vehicle_attitude
outputs:
  - container: axes
    title: Attitude
    ylabel: "[rad]"
    children:
      - mode: TimeSeries
        ydata:
          - ref("vehicle_attitude[0].roll")
        label:
          - Roll
      - mode: TimeSeries
        ydata:
          - ref("vehicle_attitude[0].pitch")
        label:
          - Pitch
      - mode: TimeSeries
        ydata:
          - ref("vehicle_attitude[0].yaw")
        label:
          - Yaw
`;

const STAGE_LABELS: Record<string, string> = {
    idle: "待上传",
    reading: "读取文件…",
    "loading-runtime": "加载 Pyodide 运行时…",
    "installing-parser": "安装解析器…",
    parsing: "解析日志…",
    done: "解析完成",
};

export default function EditorPage() {
    const { inputRef, stage, error, manifest, parsed, handleFile, requestSeries, reset } = useLogProbe();
    const [yamlText, setYamlText] = useState(SAMPLE_YAML);
    const [compileErr, setCompileErr] = useState<string | null>(null);
    const [appliedPanels, setAppliedPanels] = useState<PanelSpec[] | null>(null);

    const panels = useMemo(() => {
        if (!manifest || !yamlText.trim()) return [];
        try {
            const p = yamlToPanels(yamlText, manifest);
            setCompileErr(null);
            return p;
        } catch (e) {
            setCompileErr(e instanceof Error ? e.message : "编译失败");
            return [];
        }
    }, [manifest, yamlText]);

    const handleApply = useCallback(() => {
        if (!parsed || panels.length === 0) return;
        setAppliedPanels(panels);
    }, [parsed, panels]);

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        },
        [handleFile],
    );

    // ── 未上传日志时的启动页面 ──
    if (!manifest) {
        return (
            <div className="page-shell pt-4 pb-10 sm:pt-5">
                <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Plot Editor</h1>
                <p className="mt-2 text-sm text-muted">
                    编写 YAML 定义要绘制的曲线，上传一份 .ulg / .bin 日志即可立即预览效果。
                </p>

                <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div>
                        <label className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                            <FileCode className="h-4 w-4 text-primary" />
                            YAML 配置
                        </label>
                        <textarea
                            value={yamlText}
                            onChange={(e) => {
                                setYamlText(e.target.value);
                                setAppliedPanels(null);
                                setCompileErr(null);
                            }}
                            spellCheck={false}
                            className="h-[500px] w-full resize-y rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-primary/50"
                        />
                        {compileErr && (
                            <div className="mt-2 flex items-start gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 p-2">
                                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                                <p className="text-xs text-red-400">{compileErr}</p>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium">上传日志</label>
                        <div
                            onDrop={onDrop}
                            onDragOver={(e) => e.preventDefault()}
                            onClick={() => inputRef.current?.click()}
                            className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border px-8 py-16 transition-colors hover:border-primary/40 hover:bg-muted/20"
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
                                const f = e.target.files?.[0];
                                if (f) handleFile(f);
                            }}
                        />
                        {parsed && compileErr === null && panels.length > 0 && (
                            <div className="mt-3 flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 p-2">
                                <CheckCircle2 className="h-4 w-4 text-green-400" />
                                <span className="text-xs text-green-400">{panels.length} 个面板可绘制</span>
                            </div>
                        )}
                        {error && (
                            <div className="mt-3 flex items-start gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 p-2">
                                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                                <p className="text-xs text-red-400">{error}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── 已上传日志：分栏展示 ──
    return (
        <div className="page-shell flex h-[calc(100vh-64px)] flex-col pt-2">
            <div className="flex items-center justify-between border-b border-border py-2">
                <div className="flex items-center gap-3">
                    <h1 className="text-lg font-semibold">Plot Editor</h1>
                    <span className="text-xs text-muted">{manifest.topics.length} topics</span>
                </div>
                <button
                    type="button"
                    onClick={reset}
                    className="rounded-md border border-border px-3 py-1 text-xs text-muted hover:bg-muted/50"
                >
                    重新选择
                </button>
            </div>

            <div className="flex flex-1 gap-0 overflow-hidden">
                {/* 左侧：YAML 编辑器 */}
                <div className="w-80 shrink-0 border-r border-border p-3 flex flex-col">
                    <label className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                        <FileCode className="h-4 w-4 text-primary" />
                        YAML
                    </label>
                    <textarea
                        value={yamlText}
                        onChange={(e) => {
                            setYamlText(e.target.value);
                            setAppliedPanels(null);
                        }}
                        spellCheck={false}
                        className="flex-1 w-full resize-none rounded-lg border border-border bg-muted/30 p-2 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-primary/50"
                    />

                    {compileErr && (
                        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 p-2">
                            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
                            <p className="text-[11px] text-red-400">{compileErr}</p>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={!parsed || panels.length === 0}
                        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        <Play className="h-3.5 w-3.5" />
                        预览（{panels.length} 面板）
                    </button>
                </div>

                {/* 右侧：图表预览 */}
                <div className="flex-1 overflow-y-auto p-3">
                    {!appliedPanels ? (
                        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border">
                            <Play className="h-10 w-10 text-muted" />
                            <p className="text-sm text-muted">编辑 YAML 后点击「预览」查看效果</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {appliedPanels.map((p, i) => (
                                <PanelChart key={`${p.title}-${i}`} panel={p} requestSeries={requestSeries} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
