"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
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

/** PX4 的 8 个日志级别归成三档，方便过滤（EMERGENCY/ALERT/CRITICAL/ERROR → 严重） */
type LevelGroup = "all" | "error" | "warning" | "info";
const GROUP_OF: Record<string, LevelGroup> = {
  EMERGENCY: "error",
  ALERT: "error",
  CRITICAL: "error",
  ERROR: "error",
  WARNING: "warning",
  NOTICE: "warning",
  INFO: "info",
  DEBUG: "info",
};

function fmtTime(tSec: number): string {
  const m = Math.floor(tSec / 60);
  const s = tSec - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

const inputCls =
  "w-56 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none";

/**
 * 事件消息 tab：ULog 的 **Information Message**（带时间戳与级别）与
 * **Multi Information**（键 → 多组值，无时间戳）都在这里。
 * 两者各自可搜索；消息另可按级别档过滤。
 */
export function LogMessages({ info }: { info: LogInfo }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<LevelGroup>("all");
  const [multiQuery, setMultiQuery] = useState("");

  const messages = info.messages ?? [];
  const multi = info.messagesMulti ?? [];

  const counts = useMemo(() => {
    const c = { all: messages.length, error: 0, warning: 0, info: 0 };
    for (const m of messages) c[GROUP_OF[m.levelStr] ?? "info"] += 1;
    return c;
  }, [messages]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((m) => {
      if (group !== "all" && (GROUP_OF[m.levelStr] ?? "info") !== group) return false;
      if (q && !m.message.toLowerCase().includes(q) && !m.levelStr.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [messages, query, group]);

  const multiShown = useMemo(() => {
    const q = multiQuery.trim().toLowerCase();
    if (!q) return multi;
    return multi
      .map((g) => ({
        ...g,
        values: g.key.toLowerCase().includes(q) ? g.values : g.values.filter((v) => v.toLowerCase().includes(q)),
      }))
      .filter((g) => g.values.length > 0);
  }, [multi, multiQuery]);

  const tabs: { key: LevelGroup; label: string; n: number; }[] = [
    { key: "all", label: "全部", n: counts.all },
    { key: "error", label: "严重", n: counts.error },
    { key: "warning", label: "警告", n: counts.warning },
    { key: "info", label: "信息", n: counts.info },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setGroup(t.key)}
              className={`px-2.5 py-1.5 text-xs transition-colors ${
                group === t.key ? "bg-primary text-white" : "text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              {t.label} {t.n}
            </button>
          ))}
        </div>
        <label className="relative ml-auto">
          <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索消息…"
            className={`${inputCls} pl-8`}
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted">
          {messages.length === 0
            ? "该日志未记录事件消息。"
            : query || group !== "all"
              ? "没有匹配的消息。"
              : "没有消息。"}
        </p>
      ) : (
        <div className="max-h-[520px] overflow-y-auto rounded-xl bg-surface-2 p-3">
          <table className="w-full text-sm">
            <tbody>
              {shown.map((m, i) => {
                const st = LEVEL_STYLE[m.levelStr] ?? LEVEL_STYLE.INFO;
                return (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="whitespace-nowrap py-1.5 pr-3 align-top font-mono text-xs text-muted">
                      {fmtTime(m.tSec)}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-2 align-top" title={st.label}>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${st.cls}`}>
                        {m.levelStr}
                      </span>
                    </td>
                    <td className="py-1.5 text-text">{m.message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Multi Information：键 → 多组值（无时间戳）。固件的 boot 日志、性能计数、被排除的话题等都在这里 */}
      {multi.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              多值信息 <span className="font-normal text-muted">（Multi Information · {multi.length} 项）</span>
            </h3>
            <label className="relative ml-auto">
              <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-muted" />
              <input
                value={multiQuery}
                onChange={(e) => setMultiQuery(e.target.value)}
                placeholder="搜索键或值…"
                className={`${inputCls} pl-8`}
              />
            </label>
          </div>
          {multiShown.length === 0 ? (
            <p className="text-sm text-muted">没有匹配的多值信息。</p>
          ) : (
            <div className="space-y-2">
              {multiShown.map((g) => (
                <details key={g.key} className="rounded-lg bg-surface-2 px-3 py-2" open={g.values.length <= 3}>
                  <summary className="cursor-pointer text-sm">
                    <span className="font-mono text-xs text-primary">{g.key}</span>
                    {g.type ? <span className="ml-2 text-[11px] text-faint">{g.type}</span> : null}
                    <span className="ml-2 text-[11px] text-muted">{g.values.length} 条</span>
                  </summary>
                  <div className="mt-2 max-h-64 overflow-y-auto">
                    {g.values.map((v, i) => (
                      <p key={i} className="border-b border-border/40 py-1 text-xs leading-5 text-muted last:border-0">
                        {v}
                      </p>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * 参数 tab：ULog 的 **Parameter Message**（当前值）与 **Default Parameter Message**（默认值，
 * 用来判断哪些参数被改过）都在这里。可按名称/值搜索，也可只看"飞行中变更过"的。
 */
export function LogParams({ info }: { info: LogInfo }) {
  const [paramQuery, setParamQuery] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);

  const changedNames = useMemo(
    () => new Set(info.changedParams.map((p) => p.name)),
    [info.changedParams],
  );

  const params = useMemo(() => {
    const q = paramQuery.trim().toLowerCase();
    return Object.entries(info.params)
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([k, v]) => {
        if (changedOnly && !changedNames.has(k)) return false;
        if (!q) return true;
        return k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q);
      });
  }, [info.params, paramQuery, changedOnly, changedNames]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted">
          共 {Object.keys(info.params).length} 项
          {info.changedParams.length > 0 ? `，飞行中变更 ${info.changedParams.length} 项` : ""}
          {paramQuery || changedOnly ? `，筛出 ${params.length} 项` : ""}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={changedOnly}
            onChange={(e) => setChangedOnly(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-primary)]"
          />
          只看变更过的
        </label>
        <label className="relative">
          <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-muted" />
          <input
            value={paramQuery}
            onChange={(e) => setParamQuery(e.target.value)}
            placeholder="按名称 / 值搜索…"
            className={`${inputCls} pl-8`}
          />
        </label>
      </div>
      <div className="max-h-[600px] overflow-y-auto rounded-xl bg-surface-2 p-3">
        <table className="w-full text-sm">
          <tbody>
            {params.map(([k, v]) => (
              <tr key={k} className="border-b border-border/50 last:border-0">
                <td className="w-1/2 py-1.5 pr-3 font-mono text-xs text-primary">{k}</td>
                <td className="py-1.5 text-text">
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
        {params.length === 0 && (
          <p className="py-4 text-center text-sm text-muted">
            {changedOnly ? "没有飞行中变更的参数。" : "没有匹配的参数。"}
          </p>
        )}
      </div>
    </div>
  );
}
