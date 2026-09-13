"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, LineChart } from "lucide-react";
import type { FlightPhase, SeriesResponse, TopicManifest } from "@/lib/types";
import {
  CHART_PRESETS,
  SERIES_COLORS_DARK,
  SERIES_COLORS_LIGHT,
  type PanelSpec,
  type SeriesRequest,
} from "@/lib/chart-presets";

/** 四元数 -> 欧拉角（deg）。PX4 q = [w, x, y, z] */
function quatToEuler(q: (number | null)[]): {
  roll: (number | null)[];
  pitch: (number | null)[];
  yaw: (number | null)[];
} {
  const roll: (number | null)[] = [];
  const pitch: (number | null)[] = [];
  const yaw: (number | null)[] = [];
  for (let i = 0; i < q.length; i += 4) {
    const w = q[i], x = q[i + 1], y = q[i + 2], z = q[i + 3];
    if (w == null || x == null || y == null || z == null) {
      roll.push(null); pitch.push(null); yaw.push(null);
      continue;
    }
    const sr = 2 * (w * x + y * z);
    const cr = 1 - 2 * (x * x + y * y);
    const sp = 2 * (w * y - z * x);
    const sy = 2 * (w * z + x * y);
    const cy = 1 - 2 * (y * y + z * z);
    roll.push((Math.atan2(sr, cr) * 180) / Math.PI);
    pitch.push((Math.asin(Math.max(-1, Math.min(1, sp))) * 180) / Math.PI);
    yaw.push((Math.atan2(sy, cy) * 180) / Math.PI);
  }
  return { roll, pitch, yaw };
}

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
  phases,
  requestSeries,
}: {
  manifest: TopicManifest;
  phases: FlightPhase[];
  requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
}) {
  const presets = useMemo(
    () =>
      CHART_PRESETS.map((p) => ({ preset: p, panels: p.resolve(manifest) })).filter(
        (x) => x.panels && x.panels.length > 0,
      ),
    [manifest],
  );

  if (phases.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        该日志未记录飞行模式（vehicle_status.nav_state），无法绘制阶段背景。
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <PhaseStrip phases={phases} />
      {presets.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          该日志未记录可绘制的图表话题（振动 / IMU / 姿态 / EKF / 电源 / GPS）。
        </p>
      ) : (
        presets.map(({ preset, panels }) => (
          <PresetCard
            key={preset.id}
            id={preset.id}
            title={preset.title}
            description={preset.description}
            panels={panels!}
            phases={phases}
            requestSeries={requestSeries}
          />
        ))
      )}
    </div>
  );
}

function PhaseStrip({ phases }: { phases: FlightPhase[] }) {
  const total = phases[phases.length - 1].endSec - phases[0].startSec || 1;
  const legend = new Map<string, string>();
  for (const p of phases) legend.set(p.mode, modeColor(p.mode));
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-2 text-xs text-muted">飞行阶段（相对日志开始）</p>
      <div className="flex h-5 w-full overflow-hidden rounded-md">
        {phases.map((p, i) => (
          <div
            key={i}
            title={`${p.mode} · ${p.startSec.toFixed(1)}–${p.endSec.toFixed(1)}s${p.armed ? " · 已解锁" : ""}`}
            style={{
              width: `${((p.endSec - p.startSec) / total) * 100}%`,
              background: modeColor(p.mode),
              opacity: p.armed ? 0.95 : 0.45,
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
}: {
  id: string;
  title: string;
  description: string;
  panels: PanelSpec[];
  phases: FlightPhase[];
  requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <LineChart className="h-4 w-4 shrink-0 text-primary" />
        <span className="font-medium">{title}</span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-4">
          <p className="text-xs text-muted">{description}</p>
          {panels.map((panel) => (
            <PanelChart
              key={panel.title}
              panel={panel}
              phases={phases}
              requestSeries={requestSeries}
              groupKey={id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PanelChart({
  panel,
  phases,
  requestSeries,
  groupKey,
}: {
  panel: PanelSpec;
  phases: FlightPhase[];
  requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
  groupKey: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "error" | "done">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const responses = await Promise.all(
          panel.requests.map((r) => requestSeries(r)),
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
          if (panel.kind === "quaternion") {
            const q = resp.series["q[0]"] ?? [];
            const e = quatToEuler(q);
            const rows: [string, (number | null)[]][] = [
              ["Roll", e.roll],
              ["Pitch", e.pitch],
              ["Yaw", e.yaw],
            ];
            for (const [label, vals] of rows) {
              traces.push({
                x: t,
                y: vals,
                type: "scatter",
                mode: "lines",
                name: label,
                line: { color: colors[colorIdx++ % colors.length], width: 2 },
                connectgaps: false,
              });
            }
          } else {
            for (const field of panel.requests[0]?.fields ?? []) {
              const vals = resp.series[field];
              if (!vals) continue;
              const label = panel.fieldLabels?.[field] ?? field;
              traces.push({
                x: t,
                y: vals,
                type: "scatter",
                mode: "lines",
                name: label,
                line: { color: colors[colorIdx++ % colors.length], width: 2 },
                connectgaps: false,
              });
            }
          }
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
          displayModeBar: false,
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
    <div className="rounded-xl border border-border bg-surface-2/60 p-3">
      <p className="mb-2 text-sm font-medium">{panel.title}</p>
      {state === "loading" && (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> 正在抽取数据…
        </div>
      )}
      {state === "error" && (
        <div className="flex h-40 items-center justify-center text-sm text-critical">
          绘图失败：{error}
        </div>
      )}
      <div ref={elRef} className={state === "done" ? "" : "hidden"} />
    </div>
  );
}

function buildLayout(
  panel: PanelSpec,
  phases: FlightPhase[],
  dark: boolean,
): Record<string, unknown> {
  const text = dark ? "#e6eee8" : "#172019";
  const muted = dark ? "#93a397" : "#68736a";
  const grid = dark ? "rgba(230,238,232,0.08)" : "rgba(23,32,25,0.08)";
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
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: text, size: 11, family: "PingFang SC, Microsoft YaHei, sans-serif" },
    margin: { l: 48, r: 12, t: 8, b: 40 },
    xaxis: {
      title: { text: "秒（相对日志开始）", font: { color: muted, size: 10 } },
      gridcolor: grid,
      zeroline: false,
      tickfont: { color: muted },
    },
    yaxis: {
      title: { text: panel.yLabel, font: { color: muted, size: 10 } },
      gridcolor: grid,
      zeroline: false,
      tickfont: { color: muted },
    },
    showlegend: true,
    legend: { font: { color: muted, size: 10 }, orientation: "h", x: 0, y: 1.02 },
    hovermode: "x unified",
    shapes,
    height: 280,
  };
}
