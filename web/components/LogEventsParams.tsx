"use client";

import { useMemo, useState } from "react";
import type { LogInfo } from "@/lib/types";

const LEVEL_STYLE: Record<string, { cls: string; label: string }> = {
  ERROR: { cls: "bg-critical/15 text-critical border-critical/40", label: "错误" },
  CRITICAL: { cls: "bg-critical/15 text-critical border-critical/40", label: "严重" },
  WARNING: { cls: "bg-warning/15 text-warning border-warning/40", label: "警告" },
  ALERT: { cls: "bg-warning/15 text-warning border-warning/40", label: "告警" },
  EMERGENCY: { cls: "bg-critical/15 text-critical border-critical/40", label: "紧急" },
  INFO: { cls: "bg-surface-2 text-muted border-border", label: "信息" },
  NOTICE: { cls: "bg-surface-2 text-muted border-border", label: "提示" },
  DEBUG: { cls: "bg-surface-2 text-muted border-border", label: "调试" },
};

function fmtTime(tSec: number): string {
  const m = Math.floor(tSec / 60);
  const s = tSec - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

export function LogEventsParams({ info }: { info: LogInfo }) {
  const [warnOnly, setWarnOnly] = useState(false);
  const [paramQuery, setParamQuery] = useState("");

  const messages = useMemo(
    () => (warnOnly ? info.messages.filter((m) => m.level <= 4) : info.messages),
    [info.messages, warnOnly],
  );

  const params = useMemo(() => {
    const entries = Object.entries(info.params).sort(([a], [b]) => a.localeCompare(b));
    if (!paramQuery) return entries;
    const q = paramQuery.toLowerCase();
    return entries.filter(
      ([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q),
    );
  }, [info.params, paramQuery]);

  const changedNames = new Set(info.changedParams.map((p) => p.name));

  return (
    <div className="space-y-6">
      {/* 系统信息 */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold">系统信息</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {Object.entries(info.sysInfo).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-border/40 py-1">
              <dt className="shrink-0 text-muted">{k}</dt>
              <dd className="truncate text-text">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 py-1">
            <dt className="shrink-0 text-muted">丢包</dt>
            <dd className="text-text">
              {info.dropouts.length} 次
              {info.dropouts.length > 0
                ? `（合计 ${info.dropouts.reduce((s, d) => s + d.durationMs, 0)} ms）`
                : ""}
            </dd>
          </div>
        </dl>
      </section>

      {/* 事件消息 */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-3">
          <h3 className="text-sm font-semibold">事件消息</h3>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={warnOnly}
              onChange={(e) => setWarnOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-primary)]"
            />
            仅看警告以上
          </label>
        </div>
        {messages.length === 0 ? (
          <p className="text-sm text-muted">该日志未记录事件消息。</p>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <tbody>
                {messages.map((m, i) => {
                  const st = LEVEL_STYLE[m.levelStr] ?? LEVEL_STYLE.INFO;
                  return (
                    <tr key={i} className="border-b border-border/40 last:border-0">
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-muted">
                        {fmtTime(m.tSec)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${st.cls}`}>
                          {m.levelStr}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-text">{m.message}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 参数 */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-3">
          <h3 className="text-sm font-semibold">参数</h3>
          <input
            value={paramQuery}
            onChange={(e) => setParamQuery(e.target.value)}
            placeholder="按名称 / 值过滤…"
            className="ml-auto w-56 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>
        <p className="mb-2 text-xs text-muted">
          共 {Object.keys(info.params).length} 项
          {info.changedParams.length > 0 ? `，其中飞行中变更 ${info.changedParams.length} 项` : ""}
        </p>
        <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <tbody>
              {params.map(([k, v]) => (
                <tr key={k} className="border-b border-border/40 last:border-0">
                  <td className="w-1/2 px-3 py-1.5 font-mono text-xs text-primary">{k}</td>
                  <td className="px-3 py-1.5 text-text">
                    {String(v)}
                    {changedNames.has(k) && (
                      <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[11px] text-warning">
                        已变更
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
