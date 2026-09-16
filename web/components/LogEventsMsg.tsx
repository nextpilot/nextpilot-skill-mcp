"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { LogInfo, LogMessage } from "@/lib/types";
import { formatLogTime } from "@/lib/format";

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

const inputCls =
  "w-56 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none";

/**
 * 事件消息 tab：ULog 的 **Logged String Message**（'L'，带时间戳与级别）与
 * **Tagged Logged String Message**（'C'，同形，多一个来源 tag）并成一条时间轴，
 * 下面是 **Multi Information**（'M'，键 → 多组值、无时间戳）—— 都是"发生了什么"。
 * 消息可按级别档过滤、按内容搜索；多值信息按组折叠、单独搜索。
 * 键值字典（Information Message）与消息记录统计在「系统消息」tab。
 */
export function LogEventsMsg({ info }: { info: LogInfo }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<LevelGroup>("all");
  const [multiQuery, setMultiQuery] = useState("");

  // 引擎已把「事件解码结果 + 文本消息 + 带 tag 的消息」并成一条时间轴（kind 区分来源）；
  // 老存档里 'C' 消息还是单独一段，这里并进来即可
  const messages = useMemo<(LogMessage & { tag?: number })[]>(() => {
    const all: (LogMessage & { tag?: number })[] = [
      ...(info.messages ?? []),
      ...(info.messagesTagged ?? []),
    ];
    return all.sort((a, b) => a.tSec - b.tSec);
  }, [info.messages, info.messagesTagged]);

  /** Multi Information（'M'）：键 → 多组值、无时间戳。内容是固件 boot 日志、性能计数、
   *  被排除的话题这类"发生了什么"，所以和日志消息同 tab，只是它没有时间戳、按组折叠。 */
  const multi = info.messagesMulti ?? [];

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

  const counts = useMemo(() => {
    const c = { all: messages.length, error: 0, warning: 0, info: 0 };
    for (const m of messages) c[GROUP_OF[m.levelStr] ?? "info"] += 1;
    return c;
  }, [messages]);

  /** 有 'C' 消息才占一列来源 tag（没有时整列不出现，免得空一列） */
  const hasTagged = useMemo(() => messages.some((m) => m.tag !== undefined), [messages]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((m) => {
      if (group !== "all" && (GROUP_OF[m.levelStr] ?? "info") !== group) return false;
      if (q && !m.message.toLowerCase().includes(q) && !m.levelStr.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [messages, query, group]);

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
        <div className="max-h-[520px] overflow-auto rounded-xl bg-surface-2 p-3">
          {/* table-fixed + 给时间/级别列定宽：长消息不会把这两列挤到显示不全 */}
          <table className="w-full min-w-[560px] table-fixed text-sm">
            <tbody>
              {shown.map((m, i) => {
                const st = LEVEL_STYLE[m.levelStr] ?? LEVEL_STYLE.INFO;
                return (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="w-[76px] py-1.5 pr-3 align-top font-mono text-xs whitespace-nowrap text-muted tabular-nums">
                      {formatLogTime(m.tSec)}
                    </td>
                    <td className="w-[104px] py-1.5 pr-2 align-top whitespace-nowrap" title={st.label}>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${st.cls}`}>
                        {m.levelStr}
                      </span>
                    </td>
                    {hasTagged && (
                      <td className="w-[56px] py-1.5 pr-2 align-top whitespace-nowrap">
                        {m.tag !== undefined && (
                          <span
                            className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted"
                            title="消息来源标识（tag）：代表产生这条消息的进程 / 线程 / 类，含义由机载系统自定义"
                          >
                            #{m.tag}
                          </span>
                        )}
                      </td>
                    )}
                    {/* 长消息（无空格的路径 / 十六进制）靠 break-words 换行，别撑破定宽列 */}
                    <td className="py-1.5 whitespace-pre-wrap break-words text-text">{m.message}</td>
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
              多值信息 <span className="font-normal text-muted">（共 {multi.length} 项）</span>
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
                      <p
                        key={i}
                        className="border-b border-border/40 py-1 font-mono text-xs leading-5 whitespace-pre-wrap break-all text-muted last:border-0"
                      >
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
