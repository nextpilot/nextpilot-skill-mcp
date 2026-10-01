"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ChevronDown, Loader2, LineChart, Maximize2, RotateCcw, Share2, X } from "lucide-react";
import type { FlightPhase, SeriesResponse, SpectrumResponse, TopicManifest } from "@/lib/types";
import {
    CHART_PRESETS,
    SERIES_COLORS_DARK,
    SERIES_COLORS_LIGHT,
    type PanelSpec,
    type StoredPlotPanel,
    type StoredPlotSeries,
    type SeriesRequest,
} from "@/lib/chart-presets";

type PlotlyType = {
    react: (el: HTMLElement, data: unknown[], layout: Record<string, unknown>, cfg?: unknown) => Promise<unknown>;
    newPlot: (el: HTMLElement, data: unknown[], layout: Record<string, unknown>, cfg?: unknown) => Promise<unknown>;
    relayout: (el: HTMLElement, update: Record<string, unknown>) => Promise<unknown>;
    purge: (el: HTMLElement) => void;
    Plots: {
        resize: (el: HTMLElement) => void;
    };
};

let plotlyPromise: Promise<PlotlyType> | null = null;
function getPlotly(): Promise<PlotlyType> {
    if (!plotlyPromise) {
        plotlyPromise = import("plotly.js-basic-dist-min").then((m) => (m.default ?? m) as unknown as PlotlyType);
    }
    return plotlyPromise;
}

function isDark(): boolean {
    return document.documentElement.dataset.theme === "dark";
}

/** 预设里的 `style` → Plotly 的 `line.dash`。
 *  预设有意用通用叫法（solid / dashed / dotted），换绘图库时只改这一处映射。 */
function plotlyDash(style: string | null): string {
    if (style === "dashed") return "dash";
    if (style === "dotted") return "dot";
    return "solid";
}

export function LogCharts({
    manifest,
    storedPanels,
    storedSeries,
    phases,
    requestSeries,
    requestSpectrum,
    notes,
}: {
    /** 实时分析：用 manifest 解析面板；打开历史：manifest 为空、改用下面两项 */
    manifest?: TopicManifest | null;
    storedPanels?: StoredPlotPanel[] | null;
    storedSeries?: StoredPlotSeries | null;
    phases: FlightPhase[];
    requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
    /** 取频谱图：与 requestSeries 平行的第二条通道（返回形状不同，不合并） */
    requestSpectrum: (req: SeriesRequest) => Promise<SpectrumResponse>;
    /** 报告级的取数提示（规则侧的实例越界等），与图上的提示一起进告警栏 */
    notes?: string[] | null;
}) {
    /** 面板来源：存档优先（打开历史不必解析），否则用 manifest 现解析 */
    const presets = useMemo(() => {
        if (storedPanels && storedPanels.length > 0) {
            return storedPanels.map((sp) => ({
                preset: { id: sp.presetId, title: sp.title, description: sp.description },
                panels: sp.panels,
            }));
        }
        if (!manifest) return [];
        return CHART_PRESETS.map((p) => ({ preset: p, panels: p.resolve(manifest) })).filter(
            (x) => x.panels && x.panels.length > 0,
        );
    }, [manifest, storedPanels]);

    // 告警栏的两批来源：解析时就知道的（面板上带着）和取数后引擎回来才知道的（PanelChart 回调）。
    // 后者要在多个面板并发取数时去重，同一条提示会被每张图重复报一次
    const [runtimeWarnings, setRuntimeWarnings] = useState<string[]>([]);
    const seenRef = useRef<Set<string>>(new Set());
    const pushWarnings = useCallback((ws: string[]) => {
        const fresh = ws.filter((w) => w && !seenRef.current.has(w));
        if (fresh.length === 0) return;
        for (const w of fresh) seenRef.current.add(w);
        setRuntimeWarnings((prev) => [...prev, ...fresh]);
    }, []);

    const notices = useMemo(() => {
        const all = [
            ...(notes ?? []),
            ...presets.flatMap((p) => p.panels?.flatMap((pp) => pp.warnings ?? []) ?? []),
            ...runtimeWarnings,
        ];
        return [...new Set(all.filter(Boolean))];
    }, [notes, presets, runtimeWarnings]);

    // 没有飞行阶段：时间序列图依赖阶段底色，没它就整块不画（原来直接早退整页）。
    // 但频谱图不看阶段（x 轴是频率），混在这种日志里不该被一起挡掉——只要有频谱面板就继续渲染。
    const hasSpectrum = presets.some((x) => (x.panels ?? []).some((p) => p.spectrum === true));
    if (phases.length === 0 && !hasSpectrum) {
        return (
            <p className="text-sm text-muted">该日志未记录飞行模式（vehicle_status.nav_state），无法绘制阶段背景。</p>
        );
    }

    return (
        <div className="space-y-6">
            {phases.length === 0 && (
                <p className="text-sm text-muted">
                    该日志未记录飞行模式（vehicle_status.nav_state），时间序列图不绘制阶段背景；频谱图不受影响。
                </p>
            )}
            {notices.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/[0.08] px-4 py-3 text-sm">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                        <div className="min-w-0">
                            <p className="font-medium text-text">取数提示（{notices.length}）</p>
                            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
                                {notices.map((w, i) => (
                                    <li key={i}>{w}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}
            {presets.length === 0 ? (
                <p className="text-sm text-muted">
                    该日志未记录可绘制的图表话题（振动 / IMU / 姿态 / EKF / 电源 / GPS）。
                </p>
            ) : (
                <div className="divide-y divide-border/50">
                    {presets.map(({ preset, panels }) => (
                        <PresetCard
                            key={preset.id}
                            id={preset.id}
                            title={preset.title}
                            description={preset.description}
                            panels={panels!}
                            phases={phases}
                            requestSeries={requestSeries}
                            requestSpectrum={requestSpectrum}
                            storedSeries={storedSeries ?? null}
                            onWarnings={pushWarnings}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function PresetCard({
    id,
    title,
    description,
    panels,
    phases,
    requestSeries,
    requestSpectrum,
    storedSeries,
    onWarnings,
}: {
    id: string;
    title: string;
    description: string;
    panels: PanelSpec[];
    phases: FlightPhase[];
    requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
    requestSpectrum: (req: SeriesRequest) => Promise<SpectrumResponse>;
    storedSeries: StoredPlotSeries | null;
    onWarnings: (ws: string[]) => void;
}) {
    const [open, setOpen] = useState(false);
    const [xRange, setXRange] = useState<[number, number] | null>(null);

    const handleXRangeChange = useCallback((range: [number, number] | null) => {
        setXRange(range);
    }, []);

    const handleResetXRange = useCallback(() => {
        setXRange(null);
    }, []);

    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center gap-2 py-3 text-left"
            >
                <LineChart className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm font-semibold">{title}</span>
                <span className="hidden text-xs text-muted sm:inline">{description}</span>
                <ChevronDown
                    className={`ml-auto h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                />
            </button>
            {open && (
                <div>
                    {xRange && panels.length > 1 && panels.some((p) => p.spectrum !== true) && (
                        <div className="mb-3 flex items-center gap-2">
                            <span className="text-xs text-muted">
                                X 轴已同步：{xRange[0].toFixed(1)}s – {xRange[1].toFixed(1)}s
                            </span>
                            <button
                                type="button"
                                onClick={handleResetXRange}
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10"
                            >
                                <RotateCcw className="h-3 w-3" />
                                恢复
                            </button>
                        </div>
                    )}
                    <div className="space-y-5 pb-5">
                        {panels.map((panel, i) => (
                            <PanelChart
                                key={panel.title}
                                panel={panel}
                                phases={phases}
                                requestSeries={requestSeries}
                                requestSpectrum={requestSpectrum}
                                storedSeries={storedSeries}
                                seriesKey={`${id}#${i}`}
                                groupKey={id}
                                xRange={xRange}
                                onXRangeChange={handleXRangeChange}
                                onWarnings={onWarnings}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function PanelChart({
    panel,
    phases,
    requestSeries,
    requestSpectrum,
    storedSeries,
    seriesKey,
    groupKey,
    xRange,
    onXRangeChange,
    onWarnings,
}: {
    panel: PanelSpec;
    phases: FlightPhase[];
    requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
    requestSpectrum: (req: SeriesRequest) => Promise<SpectrumResponse>;
    /** 存档里的曲线：命中就直接画，不打扰 Worker（打开历史时无 Worker 可问） */
    storedSeries: StoredPlotSeries | null;
    /** `${presetId}#${面板序号}`，与落盘时的键一致 */
    seriesKey: string;
    groupKey: string;
    xRange: [number, number] | null;
    onXRangeChange: (range: [number, number] | null) => void;
    /** 引擎回来的取数提示，交给上层的告警栏 */
    onWarnings: (ws: string[]) => void;
}) {
    const elRef = useRef<HTMLDivElement>(null);
    const localRangeRef = useRef<[number, number] | null>(null);
    const ignoreNextRelayout = useRef(false);
    const [state, setState] = useState<"loading" | "error" | "done">("loading");
    const [error, setError] = useState<string | null>(null);
    const [fullscreen, setFullscreen] = useState(false);
    // portal 需要挂载后才拿得到 document.body
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const fullscreenRef = useRef<HTMLDivElement>(null);
    const cacheRef = useRef<{ traces: unknown[]; layout: Record<string, unknown> } | null>(null);

    /** 复位缩放：让本面板回到自动量程（并把 X 轴的同步状态一并清掉，与顶部的「恢复」等价） */
    const resetAxes = useCallback(() => {
        localRangeRef.current = null;
        onXRangeChange(null);
        // 全屏时操作的是全屏图：内联图此刻被浮层盖住，relayout 它用户看不到任何变化
        const target = (fullscreen ? fullscreenRef.current : null) ?? elRef.current;
        if (!target) return;
        void getPlotly()
            .then((Plotly) => {
                Plotly.relayout(target, { "xaxis.autorange": true, "yaxis.autorange": true });
            })
            .catch(() => {});
    }, [onXRangeChange, fullscreen]);

    // 容器可见后让 Plotly 重新量一次尺寸（tab 切换时容器宽度会变）
    useEffect(() => {
        if (state !== "done" || !elRef.current) return;
        const timer = setTimeout(async () => {
            try {
                const Plotly = await getPlotly();
                Plotly.Plots.resize(elRef.current!);
            } catch {
                // ignore
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [state]);

    // Render chart in fullscreen overlay
    useEffect(() => {
        if (!fullscreen || !fullscreenRef.current || !cacheRef.current) return;
        const cached = cacheRef.current;

        const plotlyConfig = {
            responsive: true,
            displayModeBar: false, // 工具栏改用图右侧那列自绘按钮，避免两组按钮叠在一起
            modeBarButtonsToRemove: [
                "sendDataToCloud",
                "editInChartStudio",
                "lasso2d",
                "select2d",
                "hoverClosestCartesian",
                "hoverCompareCartesian",
                "toggleSpikelines",
                "zoom2d",
                "resetScale2d",
                "toImage",
                "pan2d",
                "zoomIn2d",
                "zoomOut2d",
                "autoScale2d",
            ],
            modeBarButtonsToAdd: ["resetScale2d", "toImage", "pan2d", "zoomIn2d", "zoomOut2d", "autoScale2d"],
            displaylogo: false,
        };

        const fullscreenLayout = {
            ...cached.layout,
            height: window.innerHeight - 64 - 44 - 12,
            margin: { l: 52, r: 34, t: 22, b: 48 },
        };

        let cancelled = false;
        // unmount 时 React 先把 ref 置 null 再跑 cleanup，cleanup 里要 purge 的话
        // 得用这里捕获的引用，到时再读 fullscreenRef.current 拿到的是 null
        const el = fullscreenRef.current;
        (async () => {
            const Plotly = await getPlotly();
            if (cancelled || !el) return;
            await Plotly.newPlot(el, cached.traces, fullscreenLayout, plotlyConfig);
        })();

        return () => {
            cancelled = true;
            // 全屏图与内联图是两个独立 graph（各自挂 resize 监听），关全屏或带全屏状态离开
            // 页面都要清掉，否则双份持有数据持续泄漏
            if (el) {
                void getPlotly()
                    .then((P) => P.purge(el))
                    .catch(() => {});
            }
        };
    }, [fullscreen]);

    // Apply external xRange changes to the plot
    useEffect(() => {
        if (state !== "done" || !elRef.current) return;
        // 频谱不参与时间轴联动：外部的 xRange（别的图拖出来的）不往频谱图上套
        if (panel.spectrum === true) return;
        const el = elRef.current;
        const applyRange = async () => {
            try {
                const Plotly = await getPlotly();
                if (xRange) {
                    if (localRangeRef.current?.[0] !== xRange[0] || localRangeRef.current?.[1] !== xRange[1]) {
                        ignoreNextRelayout.current = true;
                        await Plotly.relayout(el, {
                            "xaxis.range": [xRange[0], xRange[1]],
                        } as Record<string, unknown>);
                        localRangeRef.current = xRange;
                    }
                } else if (localRangeRef.current) {
                    ignoreNextRelayout.current = true;
                    await Plotly.relayout(el, {
                        "xaxis.autorange": true,
                    } as Record<string, unknown>);
                    localRangeRef.current = null;
                }
            } catch {
                // ignore relayout errors
            }
        };
        void applyRange();
    }, [xRange, state, panel.spectrum]);

    useEffect(() => {
        let cancelled = false;
        // cleanup 里要 purge（见其他 effect 的说明）：unmount 时 React 已把 ref 置 null，
        // 得在 effect 同步段捕获元素引用
        const el = elRef.current;
        if (!el) return;
        (async () => {
            try {
                // 存档可能是旧版格式（`ydata` 是取数声明改版后才有的）：那种情况说清楚，
                // 别让 Plotly 拿着半截请求去画
                const stale = panel.requests.find((r) => !Array.isArray(r.ydata) || r.ydata.length === 0 || !r.series);
                if (stale) {
                    setError("这份存档的曲线是旧版格式，重新选择该日志文件解析一次即可恢复");
                    setState("error");
                    return;
                }
                const stored = storedSeries?.[seriesKey];
                // 频谱与时间序列是两条取数通道（返回形状不同），按面板判别位各走各的
                const isSpectrum = panel.spectrum === true;
                const responses = await Promise.all(
                    panel.requests.map((r, i) =>
                        stored && stored[i]
                            ? Promise.resolve(stored[i])
                            : isSpectrum
                              ? requestSpectrum(r)
                              : requestSeries(r),
                    ),
                );
                if (cancelled) return;
                onWarnings(responses.flatMap((r) => r?.warnings ?? []));
                const Plotly = await getPlotly();
                if (cancelled) return;

                const colors = isDark() ? SERIES_COLORS_DARK : SERIES_COLORS_LIGHT;
                const traces: unknown[] = [];
                let colorIdx = 0;
                if (isSpectrum) {
                    // 频谱：x 轴是频率（resp.f），y 轴是幅度（series[si].p）。与时间序列各写各的，
                    // 不复用 `const x = resp.x ?? resp.t`（那条是时间轴，频谱没有）
                    panel.requests.forEach((req, ri) => {
                        const resp = responses[ri] as SpectrumResponse | undefined;
                        if (!resp || resp.error || !resp.f) return;
                        req.series.forEach((meta, si) => {
                            const entry = resp.series?.[si];
                            if (!entry) return;
                            traces.push({
                                x: resp.f,
                                y: entry.p,
                                type: "scatter",
                                mode: "lines",
                                name: meta.label,
                                line: {
                                    color: meta.color ?? colors[colorIdx++ % colors.length],
                                    width: 2,
                                    dash: plotlyDash(meta.style),
                                },
                                connectgaps: false,
                            });
                        });
                    });
                } else {
                    // 一条线画什么完全由预设定（label / color / style），引擎只按 ydata 顺序把序列给回来：
                    // 取不到的那条是 null，跳过即可（老固件少个字段就少一条线，不用另写回退）
                    panel.requests.forEach((req, ri) => {
                        const resp = responses[ri] as SeriesResponse | undefined;
                        if (!resp || resp.error) return;
                        const x = resp.x ?? resp.t;
                        req.series.forEach((meta, si) => {
                            const vals = resp.series?.[si];
                            if (!vals) return;
                            traces.push({
                                x,
                                y: vals,
                                type: "scatter",
                                mode: "lines",
                                name: meta.label,
                                line: {
                                    color: meta.color ?? colors[colorIdx++ % colors.length],
                                    width: 2,
                                    dash: plotlyDash(meta.style),
                                },
                                connectgaps: false,
                            });
                        });
                    });
                }

                if (panel.hlines) {
                    for (const h of panel.hlines) {
                        traces.push({
                            x: [null],
                            y: [null],
                            type: "scatter",
                            mode: "lines",
                            name: h.label ?? String(h.value),
                            line: { color: h.color, width: 1, dash: "dash" },
                        });
                    }
                }

                const dark = isDark();
                const layout = buildLayout(panel, phases, dark);
                if (panel.hlines?.length) {
                    layout.shapes = panel.hlines.map((h) => ({
                        type: "line",
                        xref: "paper",
                        x0: 0,
                        x1: 1,
                        yref: "y",
                        y0: h.value,
                        y1: h.value,
                        line: { color: h.color, width: 1, dash: "dash" },
                    }));
                }

                await Plotly.newPlot(el, traces, layout, {
                    responsive: true,
                    displayModeBar: false, // 工具栏改用图右侧那列自绘按钮，避免两组按钮叠在一起
                    modeBarButtonsToRemove: [
                        "sendDataToCloud",
                        "editInChartStudio",
                        "lasso2d",
                        "select2d",
                        "hoverClosestCartesian",
                        "hoverCompareCartesian",
                        "toggleSpikelines",
                        "zoom2d",
                        "resetScale2d",
                        "toImage",
                        "pan2d",
                        "zoomIn2d",
                        "zoomOut2d",
                        "autoScale2d",
                    ],
                    modeBarButtonsToAdd: ["resetScale2d", "toImage", "pan2d", "zoomIn2d", "zoomOut2d", "autoScale2d"],
                    displaylogo: false,
                });

                cacheRef.current = { traces, layout };

                // Listen for relayout events (zoom/pan)
                const gd = el as unknown as {
                    on?: (event: string, cb: (e: Record<string, unknown>) => void) => void;
                };
                if (!cancelled)
                    gd.on?.("plotly_relayout", (eventData) => {
                        // 频谱图的 x 轴是频率，绝不参与时间轴联动（用户明确纠正：只有时间序列图才 link 时间轴）
                        if (isSpectrum) return;
                        if (ignoreNextRelayout.current) {
                            ignoreNextRelayout.current = false;
                            return;
                        }
                        const r0 = eventData["xaxis.range[0]"] as number | undefined;
                        const r1 = eventData["xaxis.range[1]"] as number | undefined;
                        if (r0 !== undefined && r1 !== undefined) {
                            localRangeRef.current = [r0, r1];
                            onXRangeChange([r0, r1]);
                        } else if (eventData["xaxis.autorange"] === true) {
                            localRangeRef.current = null;
                            onXRangeChange(null);
                        }
                    });

                if (!cancelled) setState("done");
            } catch (err) {
                if (!cancelled) {
                    setError((err as Error).message);
                    setState("error");
                }
            }
        })();
        return () => {
            cancelled = true;
            // responsive:true 会挂 window resize 监听并持有图数据；newPlot 反复在同一个 div 上
            // 重建 graph 也会累积旧事件绑定，不 purge 的话切 tab / 换报告反复挂载就持续泄漏内存
            void getPlotly()
                .then((P) => P.purge(el))
                .catch(() => {});
        };
    }, [panel, phases, requestSeries, requestSpectrum, groupKey, onWarnings]);

    return (
        <div className="w-full min-w-0">
            <p className="mb-1 text-sm font-medium text-muted">{panel.title}</p>
            <div className="relative">
                <div className="relative min-w-0">
                    {state === "loading" && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-surface-1/80 text-sm text-muted">
                            <Loader2 className="h-4 w-4 animate-spin" /> 正在抽取数据…
                        </div>
                    )}
                    {state === "error" && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-1/80 text-sm text-critical">
                            绘图失败：{error}
                        </div>
                    )}
                    <div ref={elRef} className="w-full" style={{ minHeight: "300px" }} />
                </div>
                {/* 工具栏：浮在图的右上角、落在那圈留给刻度标签的白边里（layout 的 margin.r = 34），
            所以既不压曲线也不离图远；竖排一列不存在互相重叠。 */}
                {state === "done" && (
                    <div className="absolute top-1 right-1 flex w-7 flex-col items-center gap-1 rounded-md bg-surface-1/85 py-1 backdrop-blur-sm">
                        <button
                            className="rounded p-1 text-muted transition hover:bg-surface-2 hover:text-text"
                            onClick={resetAxes}
                            title="复位缩放"
                        >
                            <RotateCcw className="h-4 w-4" />
                        </button>
                        <button
                            className="rounded p-1 text-muted transition hover:bg-surface-2 hover:text-text"
                            onClick={() => {
                                void navigator.clipboard.writeText(window.location.href).catch(() => {});
                            }}
                            title="复制链接"
                        >
                            <Share2 className="h-4 w-4" />
                        </button>
                        <button
                            className="rounded p-1 text-muted transition hover:bg-surface-2 hover:text-text"
                            onClick={() => setFullscreen(true)}
                            title="全屏"
                        >
                            <Maximize2 className="h-4 w-4" />
                        </button>
                    </div>
                )}
            </div>

            {/*
        全屏浮层用 portal 挂到 body：`position: fixed` 遇上带 transform / filter / contain 的祖先
        会以那个祖先（而不是视口）为基准，浮层整体偏出去、按钮跑到屏幕外。挂到 body 就没这层依赖。
      */}
            {fullscreen &&
                mounted &&
                createPortal(
                    // top-16：从站点导航栏下面开始，不再把关闭按钮压到导航栏上
                    <div className="fixed inset-x-0 top-16 bottom-0 z-[1000] flex flex-col overflow-hidden bg-surface-1">
                        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
                            <span className="min-w-0 truncate text-sm font-semibold">{panel.title}</span>
                        </div>
                        <div className="relative min-h-0 flex-1 px-3 pt-2 pb-3">
                            <div ref={fullscreenRef} className="h-full w-full" />
                            {/* 与内联视图同一套：浮在图右上角的白边里，退出全屏也在其中 */}
                            <div className="absolute top-3 right-4 flex w-7 flex-col items-center gap-1 rounded-md bg-surface-1/85 py-1 backdrop-blur-sm">
                                <button
                                    className="rounded p-1 text-muted transition hover:bg-surface-2 hover:text-text"
                                    onClick={resetAxes}
                                    title="复位缩放"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                </button>
                                <button
                                    className="rounded p-1 text-muted transition hover:bg-surface-2 hover:text-text"
                                    onClick={() => {
                                        void navigator.clipboard.writeText(window.location.href).catch(() => {});
                                    }}
                                    title="复制链接"
                                >
                                    <Share2 className="h-4 w-4" />
                                </button>
                                <button
                                    className="rounded p-1 text-muted transition hover:bg-surface-2 hover:text-text"
                                    onClick={() => setFullscreen(false)}
                                    title="退出全屏"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
        </div>
    );
}

function buildLayout(panel: PanelSpec, phases: FlightPhase[], dark: boolean): Record<string, unknown> {
    const text = dark ? "#e6eee8" : "#172019";
    const muted = dark ? "#93a397" : "#5c665e";
    const grid = dark ? "rgba(230,238,232,0.08)" : "rgba(23,32,25,0.08)";
    const axisLine = dark ? "#2f3d34" : "#ced4c6";
    // 图表落在白色画布（surface）内，故绘图区取面板内的「凹陷块」surface-2，
    // 再用 mirror 轴框住四边。这两个值是 globals.css 里 --app-surface-2 的拷贝，改配色时一并改。
    const plotBg = dark ? "#232e27" : "#eef1ee";
    const shapes: unknown[] = [];
    // 阶段背景带：用低透明度中性色，模式颜色由报告页顶部那条飞行阶段条承载。
    // 频谱图的 x 轴是频率、不是时间，画阶段带就错位了——只给时间序列图加。
    if (panel.spectrum !== true) {
        for (const p of phases) {
            shapes.push({
                type: "rect",
                xref: "x",
                x0: p.startSec,
                x1: p.endSec,
                yref: "paper",
                y0: 0,
                y1: 1,
                fillcolor: p.armed ? "rgba(105,211,157,0.06)" : "rgba(128,128,128,0.03)",
                line: { width: 0 },
                layer: "below",
            });
        }
    }
    // 坐标轴：范围 / 翻转 / 网格都是面板级属性（一张图一个量纲、一个视野）
    const xaxis: Record<string, unknown> = {
        title: { text: panel.xLabel, font: { color: muted, size: 10 } },
        gridcolor: grid,
        zeroline: false,
        tickfont: { color: muted },
        showline: true,
        mirror: true,
        linecolor: axisLine,
        linewidth: 1,
        showgrid: panel.grid,
    };
    if (panel.flipx) xaxis.autorange = "reversed";
    // 频谱图：x 轴按 fmax 截关注频段（两轴都按数据范围自动，没有 fmax 就全谱）；不设 range / 不翻转
    if (panel.spectrum === true) {
        if (panel.fmax) xaxis.range = [0, panel.fmax];
    } else if (panel.range) {
        xaxis.range = [panel.range[0], panel.range[1]];
    }
    const yaxis: Record<string, unknown> = {
        title: { text: panel.yLabel, font: { color: muted, size: 10 } },
        gridcolor: grid,
        zeroline: false,
        tickfont: { color: muted },
        showline: true,
        mirror: true,
        linecolor: axisLine,
        linewidth: 1,
        showgrid: panel.grid,
    };
    if (panel.flipy) yaxis.autorange = "reversed";
    if (panel.range && panel.range.length === 4) yaxis.range = [panel.range[2], panel.range[3]];
    return {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: plotBg,
        font: { color: text, size: 11, family: "PingFang SC, Microsoft YaHei, sans-serif" },
        // r=34：既容得下最后一个刻度标签，也正好给右上角那列工具栏当落脚处
        margin: { l: 44, r: 34, t: 0, b: 40 },
        modebar: {
            orientation: "h", // 横排（原来 "v" 竖排时按钮叠在面板标题那一行上）
            bgcolor: "rgba(0,0,0,0)",
            color: muted,
            activecolor: text,
        },
        xaxis,
        yaxis,
        showlegend: panel.legend,
        legend: { font: { color: muted, size: 10 }, orientation: "h", x: 0, y: 1.02 },
        hovermode: "x unified",
        shapes,
        height: 300,
    };
}
