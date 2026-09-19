"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Layer } from "leaflet";
import type { TrackData, TrackSeries } from "@/lib/types";
import { FileUp, Loader2, MapPin } from "lucide-react";
import { wgs84ToGcj02 } from "@/lib/coord";
import { SERIES_COLORS_DARK, SERIES_COLORS_LIGHT } from "@/lib/chart-presets";
import {
  AMAP_ATTRIBUTION,
  AMAP_SATELLITE,
  AMAP_SATELLITE_LABELS,
  AMAP_STREET,
  FIT_MAX_ZOOM,
  TILE_MAX_NATIVE_ZOOM,
  TILE_SUBDOMAINS,
} from "@/lib/amap-tiles";
import "leaflet/dist/leaflet.css";

interface GpsPoint {
  lat: number;
  lon: number;
  alt: number;
}

/** 画在地图上的一条轨道（坐标已换算成 GCJ-02） */
interface DrawnTrack {
  label: string;
  color: string;
  points: GpsPoint[];
}

/**
 * 底图：**国内可达**的高德瓦片（OpenStreetMap / Esri 在国内实测连不上，地图会是一片灰）。
 * 代价是坐标系——高德是 GCJ-02，日志是 WGS-84，所以画之前统一换算（见 lib/coord.ts）。
 * 上线正式域名时建议换成带 key 的正式瓦片服务（高德 JS API 或天地图）。
 */
function altitudeColor(alt: number, minAlt: number, maxAlt: number): string {
  if (maxAlt <= minAlt) return "#4a8cf7";
  const t = Math.max(0, Math.min(1, (alt - minAlt) / (maxAlt - minAlt)));
  const hue = Math.round(220 * (1 - t));
  return `hsl(${hue}, 70%, 48%)`;
}

function isDark(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

type LeafletModule = typeof import("leaflet");

async function getLeaflet(): Promise<LeafletModule> {
  const mod = await import("leaflet");
  // 只动态引 JS（leaflet 本体约 150KB，不进首屏）；CSS 必须**静态 import**——
  // 动态 import 样式在 Next 里不保证注入，样式没进来时图层面板失去定位锚点，
  // 轨迹会画到页面别处、瓦片位置全乱
  return (mod as unknown as { default: LeafletModule }).default ?? mod;
}

export function LogFlightMap({
  loadTrack,
  onRestore,
}: {
  /** 取轨迹：存档里有就直接给（打开历史时不必解析），否则问 Worker 要 */
  loadTrack: () => Promise<TrackData>;
  /** 「重新选择该 .ulg 文件」：由报告页打开文件选择框，选完就地重解析补齐轨迹。
   *  只在"这份日志本次会话还没解析过"时给按钮——那种情况重选确实能救回来。 */
  onRestore?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const boundsRef = useRef<import("leaflet").LatLngBounds | null>(null);
  /** 每条约定的图层（图例点选隐藏时按 label 增删） */
  const layersRef = useRef<Map<string, Layer[]>>(new Map());
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [altRange, setAltRange] = useState<[number, number] | null>(null);
  const [pointCount, setPointCount] = useState(0);
  /** 被剔除的未定位采样数（GPS 没定位时 PX4 会记 lat=lon=0，画进来就是一条飞出非洲的直线） */
  const [droppedCount, setDroppedCount] = useState(0);
  /** 图例（多条轨道时显示；单条沿用海拔渐变，不出图例） */
  const [legend, setLegend] = useState<{ label: string; color: string }[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** 取不到轨迹的逐条原因（见 TrackData.errorReasons）：与 errorMsg 一起显示，
   *  因为"画不出轨迹"有六种原因，一句话说不清、而且容易说错 */
  const [errorReasons, setErrorReasons] = useState<string[]>([]);
  /** 错误种类（见 TrackData.code）：`log-not-loaded` 才给「重新选择文件」按钮
   *  （= Worker 里没装着这份日志；重选文件解析一次就能恢复。别的错误重选也没用） */
  const [errorCode, setErrorCode] = useState<TrackData["code"]>(undefined);
  /** "在高德地图打开起点"的链接（用换算后的 GCJ-02 坐标，点开就落在正确位置） */
  const [amapUrl, setAmapUrl] = useState<string | null>(null);
  /** 底图瓦片加载失败（域名不通 / 被拦）：要说出来，不然只剩一片灰说不清 */
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let LModule: LeafletModule | null = null;

    async function load() {
      // 重新取一次就回到"加载中"：补解析完成后 loadTrack 会换新引用、这里会重跑，
      // 不重置的话上一轮的错误文案会一直挂着，看起来像按钮没生效
      setState("loading");
      setErrorMsg(null);
      setErrorReasons([]);
      setErrorCode(undefined);
      try {
        LModule = await getLeaflet();

        // 轨迹由引擎按预设的声明取好并换算（旧固件 degE7/mm、新固件 deg/m 都在这儿消化）
        const track = await loadTrack();
        if (cancelled) return;

        const list: TrackSeries[] = track.tracks ?? [];
        if (track.error || list.length === 0) {
          // `track.error` 一定带着逐条原因（引擎侧保证）。走到 ?? 那一支说明引擎违约，
          // 别把它伪装成"日志里没有轨迹"——那是另一回事
          setErrorMsg(track.error ?? "引擎没有返回任何轨道，也没给出原因（解析器缺陷，请反馈）");
          setErrorReasons(track.errorReasons ?? []);
          setErrorCode(track.code);
          setState("error");
          return;
        }

        // 底图是高德的 GCJ-02，日志是 WGS-84：画之前统一换算，否则轨迹整体偏几百米。
        // 只换算画图用的那份，"这份轨迹是 WGS-84" 的事实不被改写。
        const colors = isDark() ? SERIES_COLORS_DARK : SERIES_COLORS_LIGHT;
        const drawn: DrawnTrack[] = [];
        /** 点数不足 2 个、画不出来的轨道：连着它的采样数一起说清（不然界面没话可说） */
        const thin: string[] = [];
        let total = 0;
        let dropped = 0;
        const alts: number[] = [];
        list.forEach((tk, ti) => {
          const label = tk.label || `轨道 ${ti + 1}`;
          const points: GpsPoint[] = [];
          for (let i = 0; i < tk.lat.length; i++) {
            const lat = tk.lat[i];
            const lon = tk.lon[i];
            if (typeof lat !== "number" || typeof lon !== "number") continue;
            const [gLat, gLon] = wgs84ToGcj02(lat, lon);
            const alt = typeof tk.alt?.[i] === "number" ? (tk.alt[i] as number) : 0;
            points.push({ lat: gLat, lon: gLon, alt });
            alts.push(alt);
          }
          if (points.length < 2) {
            thin.push(`${label}：${tk.lat.length} 个采样里只有 ${points.length} 个能画`);
            return;
          }
          total += points.length;
          dropped += tk.dropped ?? 0;
          drawn.push({ label, color: colors[ti % colors.length], points });
        });

        if (drawn.length === 0) {
          // 引擎说"有轨道"，可换算后一条都画不出来（坐标数组里混了 null 等）。以前这里只把
          // state 置成 error，界面就只剩兜底那句文案——等于什么都没说
          setErrorMsg(`解析出 ${list.length} 条轨道，但换算后顶点都不足 2 个（${thin.join("；")}）`);
          setState("error");
          return;
        }

        setPointCount(total);
        setDroppedCount(dropped);
        // 单条轨道：保留海拔渐变着色（左侧色带用它）；多条：各自纯色 + 图例
        setAltRange(drawn.length === 1 ? [Math.min(...alts), Math.max(...alts)] : null);
        setLegend(drawn.map((t) => ({ label: t.label, color: t.color })));
        setHidden([]);
        const start = drawn[0].points[0];
        setAmapUrl(
          `https://uri.amap.com/marker?position=${start.lon.toFixed(6)},${start.lat.toFixed(6)}&name=${encodeURIComponent("飞行起点")}`,
        );
        buildMap(LModule, drawn);
        setState("ready");
      } catch (err) {
        console.error("LogFlightMap 加载失败:", err);
        if (!cancelled) setState("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [loadTrack]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        boundsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (state !== "ready" || !mapRef.current) return;
    // 容器尺寸可能到下一帧才稳定：先让 Leaflet 重新量一次，再按同一组 bounds 重新 fit——
    // 只 invalidateSize 不重 fit 的话，首帧量到 0×0 时会永远停在全球视野（比例尺显示 10000 km）
    const timer = setTimeout(() => {
      const map = mapRef.current;
      if (!map) return;
      map.invalidateSize();
      if (boundsRef.current) map.fitBounds(boundsRef.current, { padding: [20, 20], maxZoom: FIT_MAX_ZOOM });
    }, 100);
    return () => clearTimeout(timer);
  }, [state]);

  /** 图例点选：把那条轨道的图层从地图上摘掉/加回来（**不重 fit**，免得视野乱跳） */
  const toggleTrack = useCallback((label: string) => {
    const map = mapRef.current;
    if (!map) return;
    const layers = layersRef.current.get(label) ?? [];
    setHidden((prev) => {
      const off = prev.includes(label);
      for (const l of layers) {
        if (off) l.addTo(map);
        else map.removeLayer(l);
      }
      return off ? prev.filter((x) => x !== label) : [...prev, label];
    });
  }, []);

  function buildMap(L: LeafletModule, tracks: DrawnTrack[]) {
    if (!containerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
      attributionControl: true,
    });
    mapRef.current = map;

    const street = L.tileLayer(AMAP_STREET, {
      subdomains: TILE_SUBDOMAINS,
      attribution: AMAP_ATTRIBUTION,
      maxNativeZoom: TILE_MAX_NATIVE_ZOOM,
      maxZoom: 19,
    });
    const satellite = L.tileLayer(AMAP_SATELLITE, {
      subdomains: TILE_SUBDOMAINS,
      attribution: AMAP_ATTRIBUTION,
      maxNativeZoom: TILE_MAX_NATIVE_ZOOM,
      maxZoom: 19,
    });
    // 卫星图上的路名/地名/边界，另有一层（style=8 与街道图同源，但只作叠加用）
    const satelliteLabels = L.tileLayer(AMAP_SATELLITE_LABELS, {
      subdomains: TILE_SUBDOMAINS,
      maxNativeZoom: TILE_MAX_NATIVE_ZOOM,
      maxZoom: 19,
    });

    // 默认卫星影像 + 标注：一眼能看出飞在哪片地/哪个园区；街道图在同一控件里切换
    satellite.addTo(map);
    satelliteLabels.addTo(map);
    // 瓦片挂了（域名不通 / 被拦）要说话：否则用户只看到一片灰，分不清"没轨迹"还是"没底图"
    satellite.on("tileerror", () => setTileError(true));
    map.on("tileload", () => setTileError(false));
    L.control
      .layers(
        { 卫星影像: satellite, 街道图: street },
        { 路名标注: satelliteLabels },
        { position: "topright", collapsed: true },
      )
      .addTo(map);
    // 比例尺：判断"飞了多远"比看经纬度直观
    L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);

    layersRef.current = new Map();
    const all: [number, number][] = [];
    const single = tracks.length === 1;
    const alts = single ? tracks[0].points.map((p) => p.alt) : [];
    const minAlt = single ? Math.min(...alts) : 0;
    const maxAlt = single ? Math.max(...alts) : 0;

    for (const tk of tracks) {
      const layers: Layer[] = [];
      if (single) {
        // 单条：按海拔分段着色（每段一色，读得出高度变化）
        const points = tk.points;
        const segCount = Math.min(150, points.length);
        const segSize = Math.max(1, Math.floor((points.length - 1) / segCount));
        for (let i = 0; i < points.length - 1; i += segSize) {
          const end = Math.min(i + segSize + 1, points.length);
          const seg = points.slice(i, end);
          const segAlt = seg.reduce((s, p) => s + p.alt, 0) / seg.length;
          const color = altitudeColor(segAlt, minAlt, maxAlt);
          layers.push(
            L.polyline(
              seg.map((p) => [p.lat, p.lon] as [number, number]),
              { color, weight: 3, opacity: 0.85 },
            ).addTo(map),
          );
        }
      } else {
        // 多条：一条一个纯色（图例按同一个颜色列出），叠着看分叉
        layers.push(
          L.polyline(
            tk.points.map((p) => [p.lat, p.lon] as [number, number]),
            { color: tk.color, weight: 3, opacity: 0.85 },
          ).addTo(map),
        );
      }
      layersRef.current.set(tk.label, layers);
      all.push(...tk.points.map((p) => [p.lat, p.lon] as [number, number]));
    }

    // 起终点只画**第一条**轨道：多条轨道时 2N 个 marker 太乱，图例里已经分得清
    const startIcon = L.divIcon({
      className: "",
      html: '<div style="background:#22c55e;width:10px;height:10px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    const endIcon = L.divIcon({
      className: "",
      html: '<div style="background:#ef4444;width:10px;height:10px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    const first = tracks[0].points;
    L.marker([first[0].lat, first[0].lon], { icon: startIcon })
      .bindTooltip(`起点 · ${first[0].alt.toFixed(1)} m`)
      .addTo(map);
    const last = first[first.length - 1];
    L.marker([last.lat, last.lon], { icon: endIcon })
      .bindTooltip(`终点 · ${last.alt.toFixed(1)} m`)
      .addTo(map);

    const bounds = L.latLngBounds(all);
    boundsRef.current = bounds;
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: FIT_MAX_ZOOM });
  }

  return (
    <div className="mt-3">
      <h4 className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted">
        <MapPin className="h-3.5 w-3.5" />
        GPS 轨迹 · {pointCount > 0 ? `${pointCount} 点` : ""}
        {legend.length > 1 ? ` · ${legend.length} 条轨道` : ""}
        {droppedCount > 0 ? `（已剔除 ${droppedCount} 个未定位采样）` : ""}
        <span className="text-faint">
          （底图高德，坐标已从 WGS-84 换算到 GCJ-02；右上角可切街道图）
        </span>
        {state === "ready" && amapUrl && (
          <a
            href={amapUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-primary hover:underline"
          >
            在高德地图打开起点
          </a>
        )}
      </h4>

      {/* 容器**始终可见**：Leaflet 建图时要拿到真实尺寸，曾经是 display:none 时建图 →
          尺寸算成 0×0 → fitBounds 只能给到全球视野（比例尺 10000 km），事后 invalidateSize
          也救不回缩放级别。加载/错误状态改用浮层盖住。 */}
      {/* isolate：给地图单独开一个层叠上下文。Leaflet 自己的面板 / 控件用的是 z-index 400~1000
          （.leaflet-pane / .leaflet-top），不隔离的话它们会盖过站点的 sticky 顶栏（z-40）——
          滚动时地图糊在导航栏上面。隔离后这些 z-index 只在这个容器内比较。 */}
      <div className="relative isolate">
        <div ref={containerRef} className="h-[380px] w-full overflow-hidden rounded-lg sm:h-[520px]" />
        {/* 高度色带：竖着贴在地图左侧（颜色 = 轨迹那段的平均高度）。只在**单条轨道**时给——
            多条时每条是纯色（图例里分色），色带就没有对应关系了。
            从 top-20 起是为了让开 Leaflet 左上角的缩放按钮；pointer-events-none 不挡地图操作；
            z-[700] 必须给——Leaflet 自己的 pane 是 z-index 200~800 的绝对定位层，
            不给 z 就会被瓦片层（200）盖住 */}
        {state === "ready" && altRange && (
          <div
            className="pointer-events-none absolute top-20 bottom-6 left-3 z-[700] flex flex-col items-center"
            title="轨迹颜色对应的高度（米，海拔）—— 蓝低红高"
          >
            <span className="rounded bg-surface-2/85 px-1 text-[10px] text-muted">
              {altRange[1].toFixed(0)} m
            </span>
            <span
              className="my-1 w-3 flex-1 rounded-sm border border-border/60"
              style={{
                background:
                  "linear-gradient(to top, hsl(220,70%,48%), hsl(180,70%,48%), hsl(120,70%,48%), hsl(60,70%,48%), hsl(0,70%,48%))",
              }}
            />
            <span className="rounded bg-surface-2/85 px-1 text-[10px] text-muted">
              {altRange[0].toFixed(0)} m
            </span>
          </div>
        )}

        {/* 图例：多条轨道时给出"哪条是什么颜色"，点一下可以隐藏/显示那条。
            放在右上角图层控件**下面**（top-20），避免两个控件叠在一起 */}
        {state === "ready" && legend.length > 1 && (
          <div className="absolute top-20 right-3 z-[700] flex flex-col gap-1 rounded-md bg-surface-2/90 px-2 py-1.5 text-[11px] backdrop-blur-sm">
            {legend.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => toggleTrack(r.label)}
                title={hidden.includes(r.label) ? "点击显示这条轨道" : "点击隐藏这条轨道"}
                className={`flex items-center gap-1.5 text-left transition-colors hover:text-text ${
                  hidden.includes(r.label) ? "text-faint line-through" : "text-muted"
                }`}
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
                {r.label}
              </button>
            ))}
          </div>
        )}

        {state !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-surface-2 p-4 text-center text-xs text-critical">
            {state === "loading" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载 GPS 轨迹…
              </span>
            ) : (
              // 说清是什么问题 + （能救回来时）给个**就地**重选文件的按钮。
              // 只写一句"重新选择该 .ulg 文件"的话，用户得自己猜到要回列表页再选一次
              <div className="flex max-w-2xl flex-col items-center gap-2">
                <span>{errorMsg ?? "无法加载 GPS 轨迹数据"}</span>
                {errorReasons.length > 1 && (
                  // 逐条原因（引擎给的）："缺哪个 topic / 哪个字段 / 有没有定位"一句话概括不了，
                  // 概括出来那句往往是错的（见 CLAUDE.md §6.8）
                  <ul className="w-full list-disc space-y-0.5 pl-5 text-left">
                    {errorReasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                {errorCode === "log-not-loaded" && onRestore && (
                  <button
                    type="button"
                    onClick={onRestore}
                    className="btn-ghost gap-1.5 px-2.5 py-1 text-xs"
                  >
                    <FileUp className="h-3.5 w-3.5" />
                    重新选择该 .ulg 文件
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {state === "ready" && tileError && (
        <p className="mt-2 text-[11px] text-warning">
          底图瓦片加载失败（网络不可达或被拦）——轨迹与起终点仍然有效，可切到右上角的「街道图」重试。
        </p>
      )}

    </div>
  );
}