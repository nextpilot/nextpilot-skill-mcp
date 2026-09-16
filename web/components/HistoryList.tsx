"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Trash2,
  History,
  MapPin,
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
import { formatDateTime, formatFirmware } from "@/lib/format";
import { modeStyle } from "@/lib/phase-colors";
import { wgs84ToGcj02 } from "@/lib/coord";
import { AMAP_SATELLITE, TILE_SIZE, latToWorldY, lonToWorldX, tileUrl } from "@/lib/amap-tiles";

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
 * 轨迹缩略图：**高德瓦片当底 + 轨迹折线**（对齐 Flight Review browse 页的 Overview 那张地图）。
 *
 * 与报告页那张大地图的区别：这里不起 Leaflet 实例（列表里几十行，每行一个地图实例又慢又费内存），
 * 而是自己算墨卡托像素：挑一个能把轨迹装进一张瓦片的层级 → 铺 1~4 张 <img> 瓦片 → 上面叠 SVG 折线。
 * 瓦片与折线用同一套像素换算，所以对齐；SVG 是矢量的，悬停放大不糊。
 * 坐标同样要先 WGS-84 → GCJ-02（高德是偏移坐标系），否则轨迹整体偏几百米。
 */
function TrackThumb({ points }: { points?: [number, number][]; }) {
  // 宽度跟着列走（w-full + 4:3 比例）：写成固定 64×48 的话，列比它宽一截时两侧就留白，
  // 比例仍按 4:3 保持——viewBox 是 100×75，且 preserveAspectRatio="none"，比例一歪轨迹就拉伸变形。
  const box =
    "block w-full aspect-[4/3] shrink-0 overflow-hidden rounded-md border border-border bg-surface-2 " +
    "transition-transform duration-150 origin-left hover:z-20 hover:scale-[2.6] hover:border-primary hover:shadow-lg";

  const view = useMemo(() => buildThumbView(points), [points]);

  if (!view) {
    return (
      <span
        className={`${box} flex items-center justify-center`}
        title="这份记录还没有轨迹缩略图——打开一次报告就会补上"
      >
        <MapPin className="h-4 w-4 text-faint" />
      </span>
    );
  }

  const { tiles, line, start: st, end: en } = view;
  return (
    <span className={box} title={`轨迹缩略图（${points?.length ?? 0} 点）`}>
      <span className="relative block h-full w-full">
        {tiles.map((t) => (
          // 瓦片是纯展示，用原生 img 最省事（next/image 会给每种尺寸生成一张，得不偿失）
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${t.z}/${t.x}/${t.y}`}
            src={t.url}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute max-w-none select-none"
            style={{ left: t.left, top: t.top, width: t.w, height: t.h }}
          />
        ))}
        <svg viewBox="0 0 100 75" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <polyline
            points={line}
            fill="none"
            stroke="#111827"
            strokeOpacity={0.85}
            strokeWidth={1.8}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx={st[0]} cy={st[1]} r={2.6} fill="#22c55e" stroke="#fff" strokeWidth={0.8} />
          <circle cx={en[0]} cy={en[1]} r={2.6} fill="#ef4444" stroke="#fff" strokeWidth={0.8} />
        </svg>
      </span>
    </span>
  );
}

/** 缩略图盒子与 viewBox 比例（100×75 → 64×48 像素） */
const THUMB_VB_W = 100;
const THUMB_VB_H = 75;

type ThumbView = {
  tiles: { url: string; x: number; y: number; z: number; left: string; top: string; w: string; h: string; }[];
  line: string;
  start: [number, number];
  end: [number, number];
};

/** 算缩略图要铺哪些瓦片、折线画在哪（像素坐标直接给 CSS 用） */
function buildThumbView(points?: [number, number][]): ThumbView | null {
  if (!points || points.length < 2) return null;

  // 先转到 GCJ-02（底图坐标系），否则轨迹与地图整体错位
  const gcj = points.map(([lat, lon]) => wgs84ToGcj02(lat, lon));
  const lats = gcj.map((p) => p[0]);
  const lons = gcj.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // 挑层级：让轨迹在瓦片像素里占 ~150px（一张 256 的瓦片装得下，四周还留边）
  const spanLon = Math.max(maxLon - minLon, 1e-6);
  const spanLat = Math.max(maxLat - minLat, 1e-6);
  const targetPx = 150;
  const zLon = Math.log2((targetPx * 360) / (spanLon * TILE_SIZE));
  // 纬度方向按墨卡托近似（cos 修正后与经度同尺度）
  const zLat = Math.log2((targetPx * 360) / (spanLat * (1 / Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)) * TILE_SIZE));
  const z = Math.max(3, Math.min(17, Math.floor(Math.min(zLon, zLat))));

  const xs = gcj.map((p) => lonToWorldX(p[1], z));
  const ys = gcj.map((p) => latToWorldY(p[0], z));
  const px0 = Math.min(...xs);
  const px1 = Math.max(...xs);
  const py0 = Math.min(...ys);
  const py1 = Math.max(...ys);

  // 轨迹在世界像素里的范围 + 留白 → 映射到 viewBox
  const padPx = 12;
  const worldW = Math.max(px1 - px0 + padPx * 2, 1);
  const worldH = Math.max(py1 - py0 + padPx * 2, 1);
  const scale = Math.min(THUMB_VB_W / worldW, THUMB_VB_H / worldH);
  // 居中
  const offX = (THUMB_VB_W - worldW * scale) / 2 - (px0 - padPx) * scale;
  const offY = (THUMB_VB_H - worldH * scale) / 2 - (py0 - padPx) * scale;

  const toVB = (wx: number, wy: number): [number, number] => [wx * scale + offX, wy * scale + offY];

  // 瓦片网格：覆盖 viewBox 对应的世界像素范围（通常 1 张，轨迹跨越时 2~4 张）
  const wx0 = (0 - offX) / scale;
  const wy0 = (0 - offY) / scale;
  const wx1 = (THUMB_VB_W - offX) / scale;
  const wy1 = (THUMB_VB_H - offY) / scale;
  const tx0 = Math.floor(wx0 / TILE_SIZE);
  const tx1 = Math.floor(wx1 / TILE_SIZE);
  const ty0 = Math.floor(wy0 / TILE_SIZE);
  const ty1 = Math.floor(wy1 / TILE_SIZE);
  const maxIndex = 2 ** z - 1;
  const tiles: ThumbView["tiles"] = [];
  let i = 0;
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      if (tx < 0 || ty < 0 || tx > maxIndex || ty > maxIndex) continue;
      const [lx, ly] = toVB(tx * TILE_SIZE, ty * TILE_SIZE);
      // left/width 的百分比相对盒宽（100 个 viewBox 单位），top/height 相对盒高（75 个）
      const side = TILE_SIZE * scale;
      tiles.push({
        url: tileUrl(AMAP_SATELLITE, tx, ty, z, i++),
        x: tx,
        y: ty,
        z,
        left: `${((lx / THUMB_VB_W) * 100).toFixed(2)}%`,
        top: `${((ly / THUMB_VB_H) * 100).toFixed(2)}%`,
        w: `${((side / THUMB_VB_W) * 100).toFixed(2)}%`,
        h: `${((side / THUMB_VB_H) * 100).toFixed(2)}%`,
      });
    }
  }

  const line = gcj
    .map((_, idx) => toVB(xs[idx], ys[idx]))
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const start = toVB(xs[0], ys[0]);
  const end = toVB(xs[xs.length - 1], ys[ys.length - 1]);

  return { tiles, line, start, end };
}

/** 文件名只显示第一段（按 '-' 切）：UUID 命名的日志用后一段区分，列表里够用了 */
function shortName(fileName: string): string {
  const i = fileName.indexOf("-");
  return i > 0 ? fileName.slice(0, i) : fileName;
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
  const router = useRouter();
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
    if (verSwFilter) result = result.filter((r) => formatFirmware(r.facts, r.verSw) === verSwFilter);
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
    // 筛选项用**与表格同一口径**的展示串（formatFirmware），否则下拉里是一串裸哈希、
    // 列里却是 `v1.16.0`，对不上号
    const set = new Set(items.map((r) => formatFirmware(r.facts, r.verSw)).filter((v) => v !== "—"));
    return [...set].sort();
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
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="text-center text-[11px] text-muted">
                {/* 全部用百分比（不用 px 列）且合计正好 100%：table-fixed 下只要合计不是 100%，
                    多出来的宽度会被**按比例摊回各列**——轨迹那列本来只有缩略图宽，一摊就宽出一大截，
                    于是缩略图两侧留白。顺带让缩略图随列宽伸缩（见 TrackThumb），一点空白都不留。
                    宽度按内容定：两个时间戳列最长（`2026-09-16 13:29:41`），给它俩 13%；
                    软件只剩 `v1.16.0` / `c2fb48` 这种 6~7 字符，6% 够；时长 `10m33s` 给 5%。 */}
                <th className="w-[6%] pb-2 pr-2 font-normal">轨迹</th>
                <th className="w-[13%] pb-2 pr-2 font-normal">上传时间</th>
                <th className="w-[10%] pb-2 pr-2 font-normal">日志文件</th>
                <th className="w-[10%] pb-2 pr-2 font-normal">机型</th>
                <th className="w-[10%] pb-2 pr-2 font-normal">硬件</th>
                <th className="w-[6%] pb-2 pr-2 font-normal">软件</th>
                <th className="w-[13%] pb-2 pr-2 font-normal">启动时间</th>
                <th className="w-[5%] pb-2 pr-2 font-normal">时长</th>
                <th className="w-[12%] pb-2 pr-2 font-normal">飞行模式</th>
                <th className="w-[10%] pb-2 pr-2 font-normal">结论</th>
                <th className="w-[5%] pb-2 font-normal">来源</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                // 双保险：cloud item 用 findingCount，local item 用 findings 数组；
                // 两者都缺失时（极旧的本地记录）按 0 处理，不渲染崩页面
                const findings = Array.isArray(r.findings) ? r.findings : [];
                const total = typeof r.findingCount === "number" ? r.findingCount : findings.length;
                const hasSeverityCounts = typeof r.findingCount !== "number";
                const c = hasSeverityCounts
                  ? {
                      critical: findings.filter((f) => f.severity === "critical").length,
                      warning: findings.filter((f) => f.severity === "warning").length,
                      info: findings.filter((f) => f.severity === "info").length,
                    }
                  : null;
                const href = `/analyze/${encodeURIComponent(r.id)}`;
                return (
                  // 整行可点（表格里没法把 <a> 套在 <tr> 上）：文件名那格仍是真链接，
                  // 于是新标签页打开 / 复制链接这些浏览器行为都还在
                  <tr
                    key={`${r.source}-${r.id}`}
                    onClick={(e) => {
                      // 点在链接自己身上时交给 <a>，别双重跳转
                      if ((e.target as HTMLElement).closest("a")) return;
                      router.push(href);
                    }}
                    className="cursor-pointer border-t border-border/30 hover:bg-surface-2"
                  >
                    <td className="py-2 pr-2 align-middle">
                      <div className="flex justify-center">
                        <TrackThumb points={r.trackThumb} />
                      </div>
                    </td>
                    <td className="py-2 pr-2 text-center font-mono break-words text-text">
                      {formatDateTime(r.analyzedAt)}
                    </td>
                    {/* 日志文件 + 大小挤在一格（分上下两行）：文件名只显示第一段（按 '-' 切，如 ce302d3b），
                        全名在悬停提示里；大小跟着走，省出一整列的宽度给别的字段。
                        大小那行字号小一号、颜色不变（表内不搞灰字），靠字号与字重区分主次。 */}
                    <td className="py-2 pr-2 text-center">
                      <Link
                        href={href}
                        className="block truncate font-medium text-text hover:text-primary"
                        title={r.fileName}
                      >
                        {shortName(r.fileName)}
                      </Link>
                      <span className="block truncate text-[11px] leading-4 text-text">
                        {fmtSize(r.fileSize)}
                      </span>
                    </td>
                    {/* 机型与机架（SYS_AUTOSTART）分两行，机架那行小一号——跟「日志文件 / 大小」同一种排法 */}
                    <td className="py-2 pr-2 text-center text-text">
                      <span className="block truncate">
                        {r.vehicleType ? (VEHICLE_TYPE_LABELS[r.vehicleType] ?? r.vehicleType) : "—"}
                      </span>
                      {r.facts?.airframeId ? (
                        <span className="block truncate text-[11px] leading-4">
                          机架 {r.facts.airframeId}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 text-center font-mono break-words text-text">{r.verHw ?? "—"}</td>
                    {/* 软件版本口径对齐 Flight Review browse：正式版 `v1.16.0`，其余给 git 短哈希 */}
                    <td className="py-2 pr-2 text-center font-mono break-words text-text">
                      <span
                        title={[
                          r.facts?.verSwBranch ? `分支 ${r.facts.verSwBranch}` : "",
                          r.verSw ? `git ${r.verSw}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ") || undefined}
                      >
                        {formatFirmware(r.facts, r.verSw)}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-center font-mono break-words text-text">
                      {r.facts?.startUtc ? formatDateTime(r.facts.startUtc * 1000) : "—"}
                    </td>
                    <td className="py-2 pr-2 text-center whitespace-nowrap text-text">
                      {fmtDuration(r.durationSec ?? r.facts?.durationSec)}
                    </td>
                    <td
                      className="py-2 pr-2 text-center text-text"
                      title={r.facts?.modes?.length ? r.facts.modes.join(", ") : undefined}
                    >
                      {r.facts?.modes?.length
                        ? r.facts.modes.map((m) => modeStyle(m).label).join("、")
                        : r.facts?.mainMode
                          ? modeStyle(r.facts.mainMode).label
                          : "—"}
                    </td>
                    <td className="py-2 text-center whitespace-nowrap">
                      {c ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <Count icon={<ShieldAlert className="h-3 w-3" />} n={c.critical} tone="critical" />
                          <Count icon={<AlertTriangle className="h-3 w-3" />} n={c.warning} tone="warning" />
                          <Count icon={<Info className="h-3 w-3" />} n={c.info} tone="info" />
                        </span>
                      ) : (
                        <span className="text-muted">{total}</span>
                      )}
                    </td>
                    <td className="py-2 text-center">
                      <span
                        className="inline-flex justify-center"
                        title={r.source === "cloud" ? "云端（跨设备可见，保留 7 天）" : "仅本机浏览器"}
                      >
                        {r.source === "cloud" ? (
                          <Cloud className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <HardDrive className="h-3.5 w-3.5 text-muted" />
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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