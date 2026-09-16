"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, LineChart, Maximize2, RotateCcw, Share2, X } from "lucide-react";
import type { FlightPhase, SeriesResponse, TopicManifest } from "@/lib/types";
import {
  CHART_PRESETS,
  SERIES_COLORS_DARK,
  SERIES_COLORS_LIGHT,
  type PanelSpec,
  type StoredPlotPanel,
  type StoredPlotSeries,
  type SeriesRequest,
} from "@/lib/chart-presets";

// 模式配色（固定顺序，最多覆盖常见模式，其余归 "Other" 灰）
const MODE_COLORS: Record<string, string> = {
  Manual: "#3987e5",
  Altitude: "#d95926",
  Position: "#199e70",
  Mission: "#c98500",
  Hold: "#d55181",
  Return: "#008300",
  Offboard: "#9085e9",
  Takeoff: "#e66767",
  Land: "#5b8fb9",
  Stabilized: "#b08050",
  Acro: "#7f8ea3",
  Descend: "#a06cd5",
};
const MODE_OTHER_COLOR = "#6b7280";

function modeColor(mode: string): string {
  return MODE_COLORS[mode] ?? MODE_OTHER_COLOR;
}

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
    plotlyPromise = import("plotly.js-basic-dist-min").then(
      (m) => (m.default ?? m) as unknown as PlotlyType,
    );
  }
  return plotlyPromise;
}

function isDark(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

export function LogCharts({
  manifest,
  storedPanels,
  storedSeries,
  phases,
  requestSeries,
}: {
  /** 实时分析：用 manifest 解析面板；打开历史：manifest 为空、改用下面两项 */
  manifest?: TopicManifest | null;
  storedPanels?: StoredPlotPanel[] | null;
  storedSeries?: StoredPlotSeries | null;
  phases: FlightPhase[];
  requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
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

  if (phases.length === 0) {
    return (
      <p className="text-sm text-muted">
        该日志未记录飞行模式（vehicle_status.nav_state），无法绘制阶段背景。
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <PhaseStrip phases={phases} />
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
              storedSeries={storedSeries ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PhaseStrip({ phases }: { phases: FlightPhase[] }) {
  const total = phases[phases.length - 1].endSec - phases[0].startSec || 1;
  const legend = new Map<string, string>();
  for (const p of phases) legend.set(p.mode, modeColor(p.mode));
  return (
    <div>
      <p className="mb-2 text-xs text-muted">飞行阶段（相对日志开始，浅色段为未解锁）</p>
      <div className="flex h-4 w-full overflow-hidden rounded">
        {phases.map((p, i) => (
          <div
            key={i}
            title={`${p.mode} · ${p.startSec.toFixed(1)}–${p.endSec.toFixed(1)}s${p.armed ? " · 已解锁" : ""}`}
            style={{
              width: `${((p.endSec - p.startSec) / total) * 100}%`,
              background: modeColor(p.mode),
              opacity: p.armed ? 0.95 : 0.4,
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {Array.from(legend.entries()).map(([mode, color]) => (
          <span key={mode} className="flex items-center gap-1.5 text-xs text-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
            {mode}
          </span>
        ))}
      </div>
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
  storedSeries,
}: {
  id: string;
  title: string;
  description: string;
  panels: PanelSpec[];
  phases: FlightPhase[];
  requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
  storedSeries: StoredPlotSeries | null;
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
        <span className="font-medium">{title}</span>
        <span className="hidden text-xs text-muted sm:inline">{description}</span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div>
          {xRange && panels.length > 1 && (
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
                storedSeries={storedSeries}
                seriesKey={`${id}#${i}`}
                groupKey={id}
                xRange={xRange}
                onXRangeChange={handleXRangeChange}
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
  storedSeries,
  seriesKey,
  groupKey,
  xRange,
  onXRangeChange,
}: {
  panel: PanelSpec;
  phases: FlightPhase[];
  requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
  /** 存档里的曲线：命中就直接画，不打扰 Worker（打开历史时无 Worker 可问） */
  storedSeries: StoredPlotSeries | null;
  /** `${presetId}#${面板序号}`，与落盘时的键一致 */
  seriesKey: string;
  groupKey: string;
  xRange: [number, number] | null;
  onXRangeChange: (range: [number, number] | null) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const localRangeRef = useRef<[number, number] | null>(null);
  const ignoreNextRelayout = useRef(false);
  const [state, setState] = useState<"loading" | "error" | "done">("loading");
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef<{ traces: unknown[]; layout: Record<string, unknown> } | null>(null);

  // Resize chart after container becomes visible, and align modebar
  useEffect(() => {
    if (state !== "done" || !elRef.current) return;
    const modebar = elRef.current.querySelector(".modebar") as HTMLElement | null;
    if (modebar) modebar.style.top = "0px";
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
      displayModeBar: true,
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
      modeBarButtonsToAdd: [
        "resetScale2d",
        "toImage",
        "pan2d",
        "zoomIn2d",
        "zoomOut2d",
        "autoScale2d",
      ],
      displaylogo: false,
    };

    const fullscreenLayout = {
      ...cached.layout,
      height: window.innerHeight - 52,
      margin: { l: 52, r: 42, t: 22, b: 48 },
    };

    let cancelled = false;
    (async () => {
      const Plotly = await getPlotly();
      if (cancelled) return;
      await Plotly.newPlot(fullscreenRef.current!, cached.traces, fullscreenLayout, plotlyConfig);
    })();

    return () => {
      cancelled = true;
      const Plotly = getPlotly();
      if (fullscreenRef.current) {
        Plotly.then((P) => P.purge(fullscreenRef.current!)).catch(() => {});
      }
    };
  }, [fullscreen]);

  // Apply external xRange changes to the plot
  useEffect(() => {
    if (state !== "done" || !elRef.current) return;
    const el = elRef.current;
    const applyRange = async () => {
      try {
        const Plotly = await getPlotly();
        if (xRange) {
          if (
            localRangeRef.current?.[0] !== xRange[0] ||
            localRangeRef.current?.[1] !== xRange[1]
          ) {
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
  }, [xRange, state]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = storedSeries?.[seriesKey];
        const responses = await Promise.all(
          panel.requests.map((r, i) =>
            i === 0 && stored ? Promise.resolve(stored) : requestSeries(r),
          ),
        );
        if (cancelled || !elRef.current) return;
        const Plotly = await getPlotly();
        if (cancelled || !elRef.current) return;

        const colors = isDark() ? SERIES_COLORS_DARK : SERIES_COLORS_LIGHT;
        const traces: unknown[] = [];
        let colorIdx = 0;

        for (const resp of responses) {
          if (resp.error || !resp.series) continue;
          const t = resp.t;
          // 画什么完全看引擎返回的 series：无 op 时键=请求的字段名，
          // 有 op 时键=算子的 out_names（如 roll/pitch/yaw）——前端不做任何换算
          const opLabels = panel.requests[0]?.op?.labels ?? [];
          Object.entries(resp.series as Record<string, (number | null)[] | null>).forEach(
            ([key, vals], i) => {
              if (!vals) return;
              const label = opLabels[i] ?? panel.fieldLabels?.[key] ?? key;
              traces.push({
                x: t,
                y: vals,
                type: "scatter",
                mode: "lines",
                name: label,
                line: { color: colors[colorIdx++ % colors.length], width: 2 },
                connectgaps: false,
              });
            },
          );
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

        await Plotly.newPlot(elRef.current, traces, layout, {
          responsive: true,
          displayModeBar: true,
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
          modeBarButtonsToAdd: [
            "resetScale2d",
            "toImage",
            "pan2d",
            "zoomIn2d",
            "zoomOut2d",
            "autoScale2d",
          ],
          displaylogo: false,
        });

        cacheRef.current = { traces, layout };

        // Listen for relayout events (zoom/pan)
        const gd = elRef.current as unknown as {
          on?: (event: string, cb: (e: Record<string, unknown>) => void) => void;
        };
        gd.on?.("plotly_relayout", (eventData) => {
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
    };
  }, [panel, phases, requestSeries, groupKey]);

  return (
    <div className="w-full min-w-0">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{panel.title}</p>
        {state === "done" && (
          <div className="flex items-center gap-1">
            <button
              className="rounded p-0.5 text-muted opacity-60 transition hover:opacity-100"
              onClick={() => { void navigator.clipboard.writeText(window.location.href).catch(() => {}); }}
              title="复制链接"
            >
              <Share2 className="h-4 w-4" />
            </button>
            <button
              className="rounded p-0.5 text-muted opacity-60 transition hover:opacity-100"
              onClick={() => setFullscreen(true)}
              title="全屏"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <div className="relative">
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

      {fullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-surface-1">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
            <span className="text-sm font-semibold">{panel.title}</span>
            <button
              className="rounded p-1 text-muted transition hover:text-text"
              onClick={() => setFullscreen(false)}
              title="退出全屏"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div ref={fullscreenRef} className="w-full flex-1" />
        </div>
      )}
    </div>
  );
}

function buildLayout(
  panel: PanelSpec,
  phases: FlightPhase[],
  dark: boolean,
): Record<string, unknown> {
  const text = dark ? "#e6eee8" : "#172019";
  const muted = dark ? "#93a397" : "#5c665e";
  const grid = dark ? "rgba(230,238,232,0.08)" : "rgba(23,32,25,0.08)";
  const axisLine = dark ? "#2f3d34" : "#ced4c6";
  // 图表落在白色画布（surface）内，故绘图区取面板内的「凹陷块」surface-2
  // （浅 #eef1ee / 深 #232e27，与画布 1.14:1），再用 mirror 轴框住四边。
  // 这两个值是 globals.css 里 --app-surface-2 的拷贝，改配色时一并改。
  const plotBg = dark ? "#232e27" : "#eef1ee";
  const shapes: unknown[] = [];
  // 阶段背景带：用低透明度中性色，模式颜色由顶部 PhaseStrip 承载
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
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: plotBg,
    font: { color: text, size: 11, family: "PingFang SC, Microsoft YaHei, sans-serif" },
    margin: { l: 44, r: 34, t: 0, b: 40 },
    modebar: {
      orientation: "v",
      bgcolor: "rgba(0,0,0,0)",
      color: muted,
      activecolor: text,
    },
    xaxis: {
      title: { text: "秒（相对日志开始）", font: { color: muted, size: 10 } },
      gridcolor: grid,
      zeroline: false,
      tickfont: { color: muted },
      showline: true,
      mirror: true,
      linecolor: axisLine,
      linewidth: 1,
    },
    yaxis: {
      title: { text: panel.yLabel, font: { color: muted, size: 10 } },
      gridcolor: grid,
      zeroline: false,
      tickfont: { color: muted },
      showline: true,
      mirror: true,
      linecolor: axisLine,
      linewidth: 1,
    },
    showlegend: true,
    legend: { font: { color: muted, size: 10 }, orientation: "h", x: 0, y: 1.02 },
    hovermode: "x unified",
    shapes,
    height: 300,
  };
}