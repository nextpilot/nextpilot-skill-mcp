"use client";

import type { FlightPhase } from "@/lib/types";

const PHASE_COLORS_LIGHT: Record<string, { bg: string; text: string; border: string }> = {
  takeoff:         { bg: "#e0f2fe", text: "#0369a1", border: "#7dd3fc" },
  vtol_transition: { bg: "#f3e8ff", text: "#7c3aed", border: "#c4b5fd" },
  hover:           { bg: "#dcfce7", text: "#15803d", border: "#86efac" },
  maneuver:        { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" },
  landing:         { bg: "#fce7f3", text: "#be185d", border: "#f9a8d4" },
  fw_cruise:       { bg: "#e0e7ff", text: "#3730a3", border: "#a5b4fc" },
  cruise:          { bg: "#e0e7ff", text: "#3730a3", border: "#a5b4fc" },
};

const PHASE_COLORS_DARK: Record<string, { bg: string; text: string; border: string }> = {
  takeoff:         { bg: "rgba(14,165,233,0.2)",  text: "#7dd3fc", border: "rgba(56,189,248,0.5)" },
  vtol_transition: { bg: "rgba(124,58,237,0.2)",   text: "#c4b5fd", border: "rgba(167,139,250,0.5)" },
  hover:           { bg: "rgba(34,197,94,0.2)",    text: "#86efac", border: "rgba(134,239,172,0.5)" },
  maneuver:        { bg: "rgba(251,191,36,0.2)",   text: "#fde68a", border: "rgba(252,211,77,0.5)" },
  landing:         { bg: "rgba(236,72,153,0.2)",   text: "#f9a8d4", border: "rgba(244,114,182,0.5)" },
  fw_cruise:       { bg: "rgba(99,102,241,0.2)",   text: "#a5b4fc", border: "rgba(129,140,248,0.5)" },
  cruise:          { bg: "rgba(99,102,241,0.2)",   text: "#a5b4fc", border: "rgba(129,140,248,0.5)" },
};

const PHASE_LABELS: Record<string, string> = {
  takeoff: "起飞",
  vtol_transition: "VTOL",
  hover: "悬停",
  maneuver: "机动",
  landing: "降落",
  fw_cruise: "固巡",
  cruise: "巡航",
};

const FALLBACK_LIGHT = { bg: "#f3f4f6", text: "#6b7280", border: "#d1d5db" };
const FALLBACK_DARK  = { bg: "rgba(128,128,128,0.15)", text: "#9ca3af", border: "rgba(156,163,175,0.4)" };

function isDark(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-theme") === "dark";
}

export function PhaseStrip({ phases }: { phases: FlightPhase[] }) {
  if (!phases || phases.length === 0) return null;

  const dark = isDark();
  const colors = dark ? PHASE_COLORS_DARK : PHASE_COLORS_LIGHT;
  const fallback = dark ? FALLBACK_DARK : FALLBACK_LIGHT;
  const t0 = phases[0].startSec;
  const total = phases[phases.length - 1].endSec - t0;
  if (total <= 0) return null;

  const uniqueModes = Array.from(
    new Map(phases.map((p) => [p.mode, p] as const)).values(),
  );

  return (
    <div className="mb-5 rounded-lg border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center gap-3">
        <span className="text-xs font-medium text-muted">飞行阶段</span>
        <span className="text-[10px] text-faint">
          {t0.toFixed(0)}s – {phases[phases.length - 1].endSec.toFixed(0)}s
        </span>
        <div className="ml-auto flex flex-wrap gap-x-3 gap-y-1">
          {uniqueModes.map((p) => {
            const c = colors[p.mode] ?? fallback;
            return (
              <span key={p.mode} className="flex items-center gap-1 text-[10px] text-muted">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: c.bg, border: `1px solid ${c.border}` }}
                />
                {PHASE_LABELS[p.mode] ?? p.mode}
              </span>
            );
          })}
        </div>
      </div>

      <div className="relative h-7 overflow-hidden rounded-md border border-border/50 bg-bg">
        {phases.map((p) => {
          const left = ((p.startSec - t0) / total) * 100;
          const width = Math.max(((p.endSec - p.startSec) / total) * 100, 0.4);
          const c = colors[p.mode] ?? fallback;
          const label = PHASE_LABELS[p.mode] ?? p.mode;
          return (
            <div
              key={`${p.startSec}-${p.mode}`}
              className="absolute top-0 flex h-full items-center justify-center overflow-hidden text-[9px] font-semibold whitespace-nowrap select-none"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: c.bg,
                color: c.text,
                borderRight: `1px solid ${c.border}`,
              }}
              title={`${label} ${p.startSec.toFixed(1)}s – ${p.endSec.toFixed(1)}s`}
            >
              {width > 6 ? label : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}