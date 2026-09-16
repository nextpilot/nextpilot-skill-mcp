"use client";

import type { FlightPhase } from "@/lib/types";
import { modeStyle } from "@/lib/phase-colors";

function isDark(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-theme") === "dark";
}

/** 秒数显示：掐掉 -0。阶段起点比日志起点早零点几秒是常事（定时器对齐），
 *  (-0.4).toFixed(0) 会给出 "-0"，看着像 bug。 */
function secLabel(v: number, digits = 0): string {
  const r = Number(v.toFixed(digits));
  return (r === 0 ? 0 : r).toFixed(digits);
}

export function PhaseStrip({ phases }: { phases: FlightPhase[] }) {
  if (!phases || phases.length === 0) return null;

  const dark = isDark();
  const t0 = phases[0].startSec;
  const total = phases[phases.length - 1].endSec - t0;
  if (total <= 0) return null;

  const uniqueModes = Array.from(new Map(phases.map((p) => [p.mode, p] as const)).keys());
  const styleOf = (mode: string) => modeStyle(mode, dark);

  return (
    <div className="mb-5 rounded-lg border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center gap-3">
        <span
          className="text-xs font-medium text-muted"
          title="整段日志的飞行模式时间轴：颜色 = PX4 飞行模式（定点/任务/返航…），悬停任一段看起止时间。数据图表里的底色用的也是同一套配色。时间是**开机以来的秒数**（与 Flight Review 一致）"
        >
          飞行阶段
        </span>
        <span className="text-[10px] text-faint" title="开机以来的秒数（不是日志起点）">
          {secLabel(t0)}s – {secLabel(phases[phases.length - 1].endSec)}s
        </span>
        <div className="ml-auto flex flex-wrap gap-x-3 gap-y-1">
          {uniqueModes.map((mode) => {
            const st = styleOf(mode);
            return (
              <span key={mode} className="flex items-center gap-1 text-[10px] text-muted">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: st.color }} />
                {st.label}
              </span>
            );
          })}
        </div>
      </div>

      <div className="relative h-7 overflow-hidden rounded-md border border-border/50 bg-bg">
        {phases.map((p) => {
          const left = ((p.startSec - t0) / total) * 100;
          const width = Math.max(((p.endSec - p.startSec) / total) * 100, 0.4);
          const st = styleOf(p.mode);
          const label = st.label;
          return (
            <div
              key={`${p.startSec}-${p.mode}`}
              className="absolute top-0 flex h-full items-center justify-center overflow-hidden text-[9px] font-semibold whitespace-nowrap select-none"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: st.color,
                color: "#fff",
              }}
              title={`${label}（${p.mode}） ${secLabel(p.startSec, 1)}s – ${secLabel(p.endSec, 1)}s${p.armed ? " · 已解锁" : " · 未解锁"}`}
            >
              {width > 6 ? label : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}