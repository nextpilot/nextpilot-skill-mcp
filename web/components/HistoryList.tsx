"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Trash2,
  History,
  Clock,
  FileText,
  Timer,
  Plane,
  Cpu,
  GitBranch,
  MapPin,
  Upload,
  Search,
  ShieldAlert,
  AlertTriangle,
  Info,
  Cloud,
  HardDrive,
  X,
  Filter,
  RotateCcw,
} from "lucide-react";
import type { SavedReport } from "@/lib/report-history";
import { formatDateTime } from "@/lib/format";

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  rotary_wing: "旋翼",
  fixed_wing: "固定翼",
  rover: "Rover",
  airship: "飞艇",
  unknown: "未知机型",
};

const DURATION_OPTIONS = [
  { key: "", label: "全部时长" },
  { key: "<60", label: "＜1 分钟" },
  { key: "60-300", label: "1~5 分钟" },
  { key: "300-900", label: "5~15 分钟" },
  { key: ">900", label: "＞15 分钟" },
];

const DATE_OPTIONS = [
  { key: "", label: "全部日期" },
  { key: "today", label: "今天" },
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
];

function parseDurationFilter(key: string): { min?: number; max?: number } | null {
  if (!key) return null;
  if (key === "<60") return { max: 60 };
  if (key === "60-300") return { min: 60, max: 300 };
  if (key === "300-900") return { min: 300, max: 900 };
  if (key === ">900") return { min: 900 };
  return null;
}

function parseDateFilter(key: string): Date | null {
  if (!key) return null;
  const now = new Date();
  if (key === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (key === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return null;
}

export type HistoryItem = SavedReport & {
  source: "local" | "cloud";
  /** 云端列表只有元数据，明细数量用这个字段 */
  findingCount?: number;
};



function fmtDuration(sec?: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}

/** 文件尺寸：与报告页概要同一写法（MB，两位小数） */
function fmtSize(bytes?: number): string {
  if (!bytes) return "—";
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * 轨迹缩略图：把降采样后的经纬点画成 SVG 折线（不加载地图瓦片——列表里几十张图，
 * 每张都起一个 Leaflet 实例既慢又费内存）。等距圆柱投影 + 保持纵横比，北向上。
 * 老记录没有缩略图（trackThumb 是后加的字段），打开一次报告就会补上。
 */
function TrackThumb({ points }: { points?: [number, number][]; }) {
  const box =
    "h-16 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-surface-2";
  if (!points || points.length < 2) {
    return (
      <span
        className={`${box} flex items-center justify-center`}
        title="这份记录还没有轨迹缩略图——打开一次报告就会补上"
      >
        <MapPin className="h-4 w-4 text-faint" />
      </span>
    );
  }

  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  // 经度按中心纬度收缩，形状才不会被横向拉长
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLon - minLon) * kx, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const W = 100;
  const H = 80;
  const pad = 7;
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const ox = (W - spanX * scale) / 2;
  const oy = (H - spanY * scale) / 2;
  const xy = points.map(([lat, lon]) => {
    const x = ox + (lon - minLon) * kx * scale;
    const y = H - (oy + (lat - minLat) * scale); // 北向上
    return [x, y] as const;
  });
  const [sx, sy] = xy[0];
  const [ex, ey] = xy[xy.length - 1];

  return (
    <span className={box} title={`轨迹缩略图（${points.length} 点）`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        <polyline
          points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
          fill="none"
          stroke="currentColor"
          className="text-primary"
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={sx} cy={sy} r={2.4} fill="#22c55e" />
        <circle cx={ex} cy={ey} r={2.4} fill="#ef4444" />
      </svg>
    </span>
  );
}

export function HistoryList({
  items,
  localCount,
  cachedHashes,
  cacheInfo,
  onClearLocal,
  headerRight,
}: {
  items: HistoryItem[];
  localCount: number;
  /** 本机缓存了日志的指纹：有缓存的条目重解析更快，这里只用于提示 */
  cachedHashes: Set<string>;
  cacheInfo: { entries: number; bytes: number };
  onClearLocal: () => void;
  /** 可选：标题栏右侧插槽（如折叠按钮） */
  headerRight?: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [durationFilter, setDurationFilter] = useState("");
  const [verSwFilter, setVerSwFilter] = useState("");
  const [verHwFilter, setVerHwFilter] = useState("");

  const hasFilters =
    vehicleFilter || dateFilter || durationFilter || verSwFilter || verHwFilter || search.trim();

  const filtered = useMemo(() => {
    let result = items;
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((r) => r.fileName.toLowerCase().includes(q));
    if (vehicleFilter) result = result.filter((r) => r.vehicleType === vehicleFilter);
    if (durationFilter) {
      const range = parseDurationFilter(durationFilter);
      if (range) {
        result = result.filter((r) => {
          const ds = r.durationSec;
          if (ds === undefined) return false;
          if (range.min !== undefined && ds < range.min) return false;
          if (range.max !== undefined && ds >= range.max) return false;
          return true;
        });
      }
    }
    if (dateFilter) {
      const since = parseDateFilter(dateFilter);
      if (since) result = result.filter((r) => new Date(r.analyzedAt) >= since);
    }
    if (verSwFilter) result = result.filter((r) => r.verSw === verSwFilter);
    if (verHwFilter) result = result.filter((r) => r.verHw === verHwFilter);
    return result;
  }, [items, search, vehicleFilter, dateFilter, durationFilter, verSwFilter, verHwFilter]);

  const clearFilters = () => {
    setSearch("");
    setVehicleFilter("");
    setDateFilter("");
    setDurationFilter("");
    setVerSwFilter("");
    setVerHwFilter("");
  };

  const fmtMB = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  const uniqueVehicleTypes = useMemo(() => {
    const set = new Set(items.map((r) => r.vehicleType).filter(Boolean)) as Set<string>;
    return [...set];
  }, [items]);

  const uniqueVerSw = useMemo(() => {
    const set = new Set(items.map((r) => r.verSw).filter(Boolean)) as Set<string>;
    return [...set];
  }, [items]);

  const uniqueVerHw = useMemo(() => {
    const set = new Set(items.map((r) => r.verHw).filter(Boolean)) as Set<string>;
    return [...set];
  }, [items]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <History className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">历史分析</span>
        <span className="text-xs text-muted">（{filtered.length}{hasFilters ? `/${items.length}` : ""}）</span>
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
        {headerRight}
      </div>

      {items.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索文件名..."
              className="w-full rounded-md border border-border bg-bg py-1.5 pl-8 pr-7 text-xs text-text placeholder:text-faint outline-none focus:border-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-text"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="h-3 w-3 text-faint" />
            <SelectFilter value={vehicleFilter} onChange={setVehicleFilter} placeholder="全部机型">
              {uniqueVehicleTypes.map((vt) => (
                <option key={vt} value={vt}>
                  {VEHICLE_TYPE_LABELS[vt] ?? vt}
                </option>
              ))}
            </SelectFilter>
            <SelectFilter value={dateFilter} onChange={setDateFilter} placeholder="全部日期">
              {DATE_OPTIONS.filter((o) => o.key).map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </SelectFilter>
            <SelectFilter value={durationFilter} onChange={setDurationFilter} placeholder="全部时长">
              {DURATION_OPTIONS.filter((o) => o.key).map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </SelectFilter>
            {uniqueVerSw.length > 0 && (
              <SelectFilter value={verSwFilter} onChange={setVerSwFilter} placeholder="软件版本">
                {uniqueVerSw.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </SelectFilter>
            )}
            {uniqueVerHw.length > 0 && (
              <SelectFilter value={verHwFilter} onChange={setVerHwFilter} placeholder="硬件版本">
                {uniqueVerHw.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </SelectFilter>
            )}
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text"
              >
                <RotateCcw className="h-3 w-3" />
                清除筛选
              </button>
            )}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs leading-5 text-muted">
          暂无历史分析。解析日志后报告会保存在本机浏览器；登录后生成的 AI 报告会同步到云端，保留 7 天。
        </p>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted">
          {hasFilters ? "没有匹配当前筛选条件的记录" : "没有匹配的记录"}
        </p>
      ) : (
        <ul className="max-h-[560px] divide-y divide-border/30 overflow-y-auto">
          {filtered.map((r) => {
            // 双保险：cloud item 用 findingCount，local item 用 findings 数组；
            // 两者都缺失时（极旧的本地记录）按 0 处理，不渲染崩页面
            const findings = Array.isArray(r.findings) ? r.findings : [];
            const total =
              typeof r.findingCount === "number"
                ? r.findingCount
                : findings.length;
            const hasSeverityCounts = typeof r.findingCount !== "number";
            const c = hasSeverityCounts
              ? {
                  critical: findings.filter((f) => f.severity === "critical").length,
                  warning: findings.filter((f) => f.severity === "warning").length,
                  info: findings.filter((f) => f.severity === "info").length,
                }
              : null;
            return (
              // 整行即链接：**立即跳转**到结果页（结论与曲线都在存档里，不需要在这里先解析）
              <li key={`${r.source}-${r.id}`}>
                <Link
                  href={`/analyze/${encodeURIComponent(r.id)}`}
                  className="flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2"
                >
                <TrackThumb points={r.trackThumb} />
                <div className="min-w-0 flex-1">
                {/* 第一行：这次飞行是什么——飞行时间 · 飞行时长 · 机型（机架）· 硬件版本 · 软件版本
                    飞行时间取日志记录的起始时刻（facts.startUtc，GPS 首次有效 UTC）；老存档没有就显示 — */}
                <div
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted"
                  title={`分析时间：${formatDateTime(r.analyzedAt)}`}
                >
                  <span className="flex items-center gap-1" title="飞行时间（日志记录的起始时刻，取 GPS 首次有效 UTC）">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span className="font-mono">
                      {r.facts?.startUtc ? formatDateTime(r.facts.startUtc * 1000) : "—"}
                    </span>
                  </span>
                  <span className="flex items-center gap-1" title="日志时长">
                    <Timer className="h-3.5 w-3.5 shrink-0 text-muted" />
                    {fmtDuration(r.durationSec ?? r.facts?.durationSec)}
                  </span>
                  {r.vehicleType && (
                    <span
                      className="flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-text"
                      title="机型与机架编号（SYS_AUTOSTART）"
                    >
                      <Plane className="h-3.5 w-3.5 shrink-0 text-text" />
                      {VEHICLE_TYPE_LABELS[r.vehicleType] ?? r.vehicleType}
                      {r.facts?.airframeId ? `（机架 ${r.facts.airframeId}）` : ""}
                    </span>
                  )}
                  {r.verHw && (
                    <span
                      className="flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-faint"
                      title="硬件版本（ver_hw）"
                    >
                      <Cpu className="h-3.5 w-3.5 shrink-0 text-muted" />
                      {r.verHw}
                    </span>
                  )}
                  {(r.facts?.verSwBranch || r.verSw) && (
                    <span
                      className="flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-mono text-faint"
                      title={r.facts?.verSwBranch ? `固件分支（ver_sw_branch）；commit ${r.verSw ?? "?"}` : "固件 commit（ver_sw）"}
                    >
                      <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted" />
                      {r.facts?.verSwBranch || r.verSw}
                    </span>
                  )}
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

                {/* 文件名那一行：文件名 + 上传（分析）时间 + 文件大小 */}
                <div className="mt-1 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-base font-medium text-text" title={r.fileName}>
                    {r.fileName}
                  </p>
                  <span
                    className="flex shrink-0 items-center gap-1 text-xs text-muted"
                    title="上传并分析这份日志的时间"
                  >
                    <Upload className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span className="font-mono">{formatDateTime(r.analyzedAt)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted" title="日志文件大小">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted" />
                    {fmtSize(r.fileSize)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  {c && (
                    <span className="flex items-center gap-1.5 text-xs">
                      <Count icon={<ShieldAlert className="h-3 w-3" />} n={c.critical} tone="critical" />
                      <Count icon={<AlertTriangle className="h-3 w-3" />} n={c.warning} tone="warning" />
                      <Count icon={<Info className="h-3 w-3" />} n={c.info} tone="info" />
                    </span>
                  )}
                  {!c && <span className="text-xs text-muted">{total} 条检查结果</span>}
                </div>
                </div>
                </Link>
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

function SelectFilter({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="cursor-pointer rounded-md border border-border bg-bg py-1 pl-2 pr-6 text-xs text-text outline-none appearance-none focus:border-primary"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 6px center",
        backgroundSize: "10px",
      }}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}