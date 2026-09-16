"use client";

import { useEffect, useRef, useState } from "react";
import type { TrackData } from "@/lib/types";
import { Loader2, MapPin } from "lucide-react";
import { wgs84ToGcj02 } from "@/lib/coord";
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
}: {
  /** 取轨迹：存档里有就直接给（打开历史时不必解析），否则问 Worker 要 */
  loadTrack: () => Promise<TrackData>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const boundsRef = useRef<import("leaflet").LatLngBounds | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [altRange, setAltRange] = useState<[number, number] | null>(null);
  const [pointCount, setPointCount] = useState(0);
  /** 被剔除的未定位采样数（GPS 没定位时 PX4 会记 lat=lon=0，画进来就是一条飞出非洲的直线） */
  const [droppedCount, setDroppedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** "在高德地图打开起点"的链接（用换算后的 GCJ-02 坐标，点开就落在正确位置） */
  const [amapUrl, setAmapUrl] = useState<string | null>(null);
  /** 底图瓦片加载失败（域名不通 / 被拦）：要说出来，不然只剩一片灰说不清 */
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let LModule: LeafletModule | null = null;

    async function load() {
      try {
        LModule = await getLeaflet();

        // 轨迹由引擎按 facts.yaml 的声明取好并换算（旧固件 degE7/mm、新固件 deg/m 都在这儿消化）
        const track = await loadTrack();
        if (cancelled) return;

        if (track.error || !track.lat?.length || !track.lon?.length) {
          setErrorMsg(track.error ?? "日志里没有可用的 GPS 轨迹");
          setState("error");
          return;
        }

        const points: GpsPoint[] = [];
        for (let i = 0; i < track.lat.length; i++) {
          const lat = track.lat[i];
          const lon = track.lon[i];
          if (lat !== null && lon !== null) {
            points.push({ lat, lon, alt: track.alt?.[i] ?? 0 });
          }
        }

        if (points.length < 2) {
          setState("error");
          return;
        }

        const alts = points.map((p) => p.alt);
        setAltRange([Math.min(...alts), Math.max(...alts)]);
        setPointCount(points.length);
        setDroppedCount(track.dropped ?? 0);
        // 底图是高德的 GCJ-02，日志是 WGS-84：画之前统一换算，否则轨迹整体偏几百米。
        // 只换算画图用的那份，"这份轨迹是 WGS-84" 的事实不被改写。
        const drawPoints = points.map((p) => {
          const [lat, lon] = wgs84ToGcj02(p.lat, p.lon);
          return { ...p, lat, lon };
        });
        const [startLat, startLon] = wgs84ToGcj02(points[0].lat, points[0].lon);
        setAmapUrl(
          `https://uri.amap.com/marker?position=${startLon.toFixed(6)},${startLat.toFixed(6)}&name=${encodeURIComponent("飞行起点")}`,
        );
        buildMap(LModule, drawPoints);
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

  function buildMap(L: LeafletModule, points: GpsPoint[]) {
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

    const alts = points.map((p) => p.alt);
    const minAlt = Math.min(...alts);
    const maxAlt = Math.max(...alts);

    const segCount = Math.min(150, points.length);
    const segSize = Math.max(1, Math.floor((points.length - 1) / segCount));

    for (let i = 0; i < points.length - 1; i += segSize) {
      const end = Math.min(i + segSize + 1, points.length);
      const seg = points.slice(i, end);
      const segAlt = seg.reduce((s, p) => s + p.alt, 0) / seg.length;
      const color = altitudeColor(segAlt, minAlt, maxAlt);

      L.polyline(
        seg.map((p) => [p.lat, p.lon] as [number, number]),
        { color, weight: 3, opacity: 0.85 },
      ).addTo(map);
    }

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

    L.marker([points[0].lat, points[0].lon], { icon: startIcon })
      .bindTooltip(`起点 · ${points[0].alt.toFixed(1)} m`)
      .addTo(map);
    L.marker([points[points.length - 1].lat, points[points.length - 1].lon], { icon: endIcon })
      .bindTooltip(`终点 · ${points[points.length - 1].alt.toFixed(1)} m`)
      .addTo(map);

    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
    boundsRef.current = bounds;
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: FIT_MAX_ZOOM });
  }

  return (
    <div className="mt-3">
      <h4 className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted">
        <MapPin className="h-3.5 w-3.5" />
        GPS 轨迹 · {pointCount > 0 ? `${pointCount} 点` : ""}
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
        {/* 高度色带：竖着贴在地图左侧（颜色 = 轨迹那段的平均高度）。
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

        {state !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-surface-2 p-4 text-center text-xs text-muted">
            {state === "loading" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载 GPS 轨迹…
              </span>
            ) : (
              (errorMsg ?? "无法加载 GPS 轨迹数据")
            )}
          </div>
        )}
      </div>

      {state === "ready" && tileError && (
        <p className="mt-2 text-[11px] text-muted">
          底图瓦片加载失败（网络不可达或被拦）——轨迹与起终点仍然有效，可切到右上角的「街道图」重试。
        </p>
      )}

    </div>
  );
}