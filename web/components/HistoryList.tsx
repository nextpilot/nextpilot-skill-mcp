"use client";

import { useState } from "react";
import {
  Eye,
  Trash2,
  History,
  ShieldAlert,
  AlertTriangle,
  Info,
  Cloud,
  HardDrive,
  LineChart,
} from "lucide-react";
import type { SavedReport } from "@/lib/report-history";

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  rotary_wing: "旋翼",
  fixed_wing: "固定翼",
  rover: "Rover",
  airship: "飞艇",
  unknown: "未知机型",
};

export type HistoryItem = SavedReport & {
  source: "local" | "cloud";
  /** 云端列表只有元数据，明细数量用这个字段 */
  findingCount?: number;
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDuration(sec?: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}

export function HistoryList({
  items,
  localCount,
  cachedHashes,
  cacheInfo,
  onView,
  onRestore,
  onDelete,
  onClearLocal,
}: {
  items: HistoryItem[];
  localCount: number;
  /** 本机缓存了原始日志的指纹：命中的历史条目可以一键恢复图表/参数 */
  cachedHashes: Set<string>;
  cacheInfo: { entries: number; bytes: number };
  onView: (r: HistoryItem) => void;
  onRestore: (r: HistoryItem) => void;
  onDelete: (r: HistoryItem) => void;
  onClearLocal: () => void;
}) {
  const [confirmingClear, setConfirmingClear] = useState(false);

  const fmtMB = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">历史分析</span>
        <span className="text-xs text-muted">（{items.length}）</span>
        <div className="ml-auto">
          {localCount > 0 &&
            (confirmingClear ? (
              <span className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    onClearLocal();
                    setConfirmingClear(false);
                  }}
                  className="rounded-md bg-critical/15 px-2 py-1 text-critical hover:bg-critical/25"
                >
                  确认清空本机
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClear(false)}
                  className="rounded-md px-2 py-1 text-muted hover:bg-surface-2"
                >
                  取消
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClear(true)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text"
              >
                <Trash2 className="h-3.5 w-3.5" /> 清空本机
              </button>
            ))}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs leading-5 text-muted">
          暂无历史分析。解析日志后报告会保存在本机浏览器；登录后生成的 AI 报告会同步到云端，保留 7 天。
        </p>
      ) : (
        <ul className="max-h-[560px] divide-y divide-border/30 overflow-y-auto">
          {items.map((r) => {
            const total =
              typeof r.findingCount === "number" ? r.findingCount : r.findings.length;
            const hasSeverityCounts = typeof r.findingCount !== "number";
            const c = hasSeverityCounts
              ? {
                  critical: r.findings.filter((f) => f.severity === "critical").length,
                  warning: r.findings.filter((f) => f.severity === "warning").length,
                  info: r.findings.filter((f) => f.severity === "info").length,
                }
              : null;
            return (
              <li key={`${r.source}-${r.id}`} className="py-2.5">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="font-mono">{fmtTime(r.analyzedAt)}</span>
                  {r.vehicleType && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-text">
                      {VEHICLE_TYPE_LABELS[r.vehicleType] ?? r.vehicleType}
                    </span>
                  )}
                  <span>{fmtDuration(r.durationSec)}</span>
                  <span
                    className="ml-auto flex items-center gap-0.5"
                    title={r.source === "cloud" ? "云端（跨设备可见）" : "仅本机"}
                  >
                    {r.source === "cloud" ? (
                      <Cloud className="h-3 w-3 text-primary" />
                    ) : (
                      <HardDrive className="h-3 w-3" />
                    )}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm font-medium text-text" title={r.fileName}>
                  {r.fileName}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  {c && (
                    <span className="flex items-center gap-1.5 text-xs">
                      <Count icon={<ShieldAlert className="h-3 w-3" />} n={c.critical} tone="critical" />
                      <Count icon={<AlertTriangle className="h-3 w-3" />} n={c.warning} tone="warning" />
                      <Count icon={<Info className="h-3 w-3" />} n={c.info} tone="info" />
                    </span>
                  )}
                  {!c && <span className="text-xs text-muted">{total} 条检查结果</span>}
                  <span className="ml-auto flex items-center">
                    <button
                      type="button"
                      onClick={() => onView(r)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-primary/10"
                    >
                      <Eye className="h-3.5 w-3.5" /> 查看
                    </button>
                    {r.logHash && cachedHashes.has(r.logHash) && (
                      <button
                        type="button"
                        onClick={() => onRestore(r)}
                        title="用本机缓存的原始日志重解析，恢复图表、事件与参数"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text hover:bg-surface-2"
                      >
                        <LineChart className="h-3.5 w-3.5" /> 完整数据
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(r)}
                      className="inline-flex items-center rounded-md px-1.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-critical"
                      aria-label="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 如实告知本机占用：缓存了才可能"完整数据"，用户有权知道自己存了什么 */}
      {cacheInfo.entries > 0 && (
        <p className="mt-3 border-t border-border pt-2.5 text-[11px] leading-5 text-faint">
          本机缓存了 {cacheInfo.entries} 份原始日志（{fmtMB(cacheInfo.bytes)}，上限 10 份 / 300MB，
          超出按最久未用淘汰）。这些文件只存在这台设备，从不上传。
        </p>
      )}
    </div>
  );
}

function Count({
  icon,
  n,
  tone,
}: {
  icon: React.ReactNode;
  n: number;
  tone: "critical" | "warning" | "info";
}) {
  const colors = {
    critical: "text-critical",
    warning: "text-warning",
    info: "text-muted",
  }[tone];
  return (
    <span className={`flex items-center gap-0.5 ${colors}`}>
      {icon}
      {n}
    </span>
  );
}
