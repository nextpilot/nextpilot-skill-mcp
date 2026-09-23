"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Layer } from "leaflet";
import type { TrackData, TrackSeries } from "@/lib/types";
import { FileUp, Loader2, MapPin } from "lucide-react";
import { wgs84ToGcj02 } from "@/lib/coord";
import { SERIES_COLORS_DARK, SERIES_COLORS_LIGHT } from "@/lib/chart-presets";
import { DEFAULT_PROVIDER, getProvider, MAP_PROVIDERS, type MapProvider, type MapProviderId } from "@/lib/map-tiles";
import "leaflet/dist/leaflet.css";

interface GpsPoint {
    lat: number;
    lon: number;
    alt: number;
}

/** 画在地图上的一条轨道（坐标已按底图坐标系换算） */
interface DrawnTrack {
    label: string;
    color: string;
    points: GpsPoint[];
}

/**
 * 底图：支持 Esri（WGS-84，全球）与高德（GCJ-02，中国）切换。
 * 日志 GPS 是 WGS-84，用 Esri 时无需坐标转换，高德则通过 lib/coord.ts 换算。
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
    /** 当前底图提供商 */
    const [providerId, setProviderId] = useState<MapProviderId>(DEFAULT_PROVIDER);
    /** 在外部地图打开起点的链接（坐标系与当前底图一致） */
    const [mapsUrl, setMapsUrl] = useState<string | null>(null);
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

                // 坐标系转换取决于当前底图提供商：高德用 GCJ-02，Esri 用 WGS-84。
                const provider = getProvider(providerId);
                const needsGcj = provider.crs === "gcj02";
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
                        const [gLat, gLon] = needsGcj ? wgs84ToGcj02(lat, lon) : [lat, lon];
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
                // 没给 external 的底图（天地图没有带坐标的稳定深链）就不显示"外部打开"入口
                setMapsUrl(provider.external ? provider.external.url(start.lat, start.lon) : null);
                buildMap(LModule, drawn, provider);
                setState("ready");
            } catch (err) {
                console.error("LogFlightMap 加载失败:", err);
                if (!cancelled) setState("error");
            }
        }

        load();
        return () => {
            cancelled = true;
            // providerId 或 loadTrack 变化时立即销毁旧地图，否则新 buildMap 会报
            // "Map container is being reused by another instance"
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
                boundsRef.current = null;
            }
        };
    }, [loadTrack, providerId]);

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
            if (boundsRef.current)
                map.fitBounds(boundsRef.current, { padding: [20, 20], maxZoom: getProvider(providerId).fitMaxZoom });
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

    function buildMap(L: LeafletModule, tracks: DrawnTrack[], provider: MapProvider) {
        if (!containerRef.current) return;

        if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
        }
        // 安全网：强制清除容器上可能残留的 Leaflet 内部标记
        // （provider 切换时 cleanup 已经 remove 过，这里防御极端时序）
        if (containerRef.current) {
            delete (containerRef.current as unknown as Record<string, unknown>)._leaflet_id;
        }

        const map = L.map(containerRef.current, {
            zoomControl: true,
            scrollWheelZoom: true,
            attributionControl: true,
        });
        mapRef.current = map;

        const tileOpts = (overrides?: Record<string, unknown>) => {
            const opts: Record<string, unknown> = {
                subdomains: provider.subdomains,
                attribution: provider.attribution,
                maxNativeZoom: provider.maxNativeZoom,
                maxZoom: 19,
                ...overrides,
            };
            // 显式写 undefined 会盖掉 Leaflet 自己的默认值（L.setOptions 是 `for (var i in options)`
            // 逐键拷贝，不跳过 undefined）。subdomains 被盖成 undefined 后，_getSubdomain 会对它读
            // .length 抛错；而 _getTileUrl 不管 URL 模板里有没有 {s} 都会调 _getSubdomain，
            // 所以不用 {s} 的底图照样会中招。
            for (const k of Object.keys(opts)) {
                if (opts[k] === undefined) delete opts[k];
            }
            return opts;
        };

        const satellite = L.tileLayer(provider.satellite, tileOpts());
        const street = L.tileLayer(provider.street, tileOpts());

        // 默认卫星影像；街道图在同一控件里切换
        satellite.addTo(map);
        satellite.on("tileerror", () => setTileError(true));
        map.on("tileload", () => setTileError(false));

        // 路名标注覆盖层（仅高德有独立图层）
        const overlays: Record<string, L.TileLayer> = {};
        if (provider.satelliteLabels) {
            const labels = L.tileLayer(provider.satelliteLabels, tileOpts({ attribution: "" }));
            labels.addTo(map);
            overlays["路名标注"] = labels;
        }

        const layersControl = L.control
            .layers({ 卫星影像: satellite, 街道图: street }, overlays, { position: "topright", collapsed: true })
            .addTo(map);
        // 图层图标与左上角缩放按钮**同尺寸**：Leaflet 给 .leaflet-control-layers-toggle
        // 的是 44×44（触屏下），而左侧 .leaflet-bar a 只有 30px —— 两个角一大一小，
        // 看着不像同一套控件。缩到 30 之后两边顶边都是 10px，同一条水平线。
        //
        // background-size 必须跟着缩：那个图标是 80×80 的 sprite（layers.png 里两张图平铺），
        // 只改容器不改它，图会被裁掉一角。
        // 同样用 inline style：.leaflet-touch 下的选择器权重比自定义类高，谁后加载谁赢不可控。
        const layersToggle = layersControl.getContainer()?.querySelector("a");
        if (layersToggle) {
            layersToggle.style.width = "30px";
            layersToggle.style.height = "30px";
            layersToggle.style.backgroundSize = "20px 20px";
        }
        L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);

        // 一键回到轨迹视野：直接**插进 Leaflet 自带的缩放条**，排成 + / − / ◎ 一条。
        //
        // 为什么不另起一个 L.Control（position topleft + controlOrder 1000 排到缩放下面）：
        // Leaflet 的 CSS 给**每个** .leaflet-control 都加了 margin-top 10px，两组之间必定
        // 留一道 10px 的空档；而且两个 .leaflet-bar 各有 1px 边框，就算把 margin 抹掉，
        // 贴在一起也是 2px 的双线。只有塞进**同一个** .leaflet-bar 才会共享一条边框、
        // 由 .leaflet-bar a 的 border-bottom 自动分隔，看着才像"一条按钮"。
        //
        // 代价：按钮列底边上移了 10px 多，高度色带的 top 要跟着改（见 JSX 里的注释）。
        //
        // zoomControl 是 L.map({ zoomControl: true }) 建的（见上方建图参数），
        // 但它不在 Map 的公开类型上 → 只能自己声明形状再取。
        const zoomBar = (
            map as unknown as { zoomControl?: { getContainer(): HTMLElement } }
        ).zoomControl?.getContainer();
        if (zoomBar) {
            const btn = L.DomUtil.create("a", "");
            btn.href = "#";
            btn.title = "回到轨迹视野";
            btn.setAttribute("role", "button");
            btn.setAttribute("aria-label", "回到轨迹视野");
            btn.innerHTML =
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';
            // 尺寸交给 Leaflet 的 .leaflet-bar a（26px，触屏下 30px），这里只管让 svg 居中：
            // svg 是 inline 元素，按基线对齐全往上偏，必须 flex 才正。
            btn.style.cssText = "display:flex;align-items:center;justify-content:center;cursor:pointer;";
            // 手动塞进 .leaflet-bar 的元素不会被 Leaflet 的控件容器接管，click 会冒泡到地图
            // （变成"点一下地图"），必须自己掐掉。
            L.DomEvent.disableClickPropagation(btn);
            L.DomEvent.on(btn, "click", (e) => {
                L.DomEvent.preventDefault(e);
                if (boundsRef.current && boundsRef.current.isValid()) {
                    map.fitBounds(boundsRef.current, {
                        padding: [20, 20],
                        maxZoom: provider.fitMaxZoom,
                    });
                }
            });
            zoomBar.appendChild(btn);

            // 三个按钮**横排**：竖着堆要占掉 ~94px 高，横过来只剩 ~32px，省下的 60 多 px
            // 全给高度色带（色带的 top 就是从这条的底边往下数的，见下方 JSX）。
            //
            // 用 inline style 而不是 CSS 类：分隔线得从 border-bottom 改成 border-right，
            // 而 Leaflet 的 `.leaflet-touch .leaflet-bar a` 是 (0,2,1) 权重，自定义类写出来
            // 跟它同权重、谁赢取决于两份 CSS 谁后加载 —— 不可控。inline 恒定最高。
            zoomBar.style.display = "flex";
            for (const a of Array.from(zoomBar.querySelectorAll<HTMLAnchorElement>("a"))) {
                a.style.borderBottom = "none";
                a.style.borderRight = "1px solid rgba(0, 0, 0, 0.2)";
            }
            const last = zoomBar.querySelector<HTMLAnchorElement>("a:last-child");
            if (last) last.style.borderRight = "none";
        }

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

        if (all.length === 0) return;

        const bounds = L.latLngBounds(all);
        // 防御：如果所有点被 Leaflet 判为无效（例如 NaN），bounds 会是空的，
        // fitBounds 会内部崩掉 "Cannot read properties of undefined (reading 'length')"
        if (!bounds.isValid()) return;

        boundsRef.current = bounds;
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: provider.fitMaxZoom });
    }

    return (
        <div className="mt-3">
            <h4 className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted">
                <MapPin className="h-3.5 w-3.5" />
                GPS 轨迹 · {pointCount > 0 ? `${pointCount} 点` : ""}
                {legend.length > 1 ? ` · ${legend.length} 条轨道` : ""}
                {droppedCount > 0 ? `（已剔除 ${droppedCount} 个未定位采样）` : ""}
                <span className="text-faint">
                    （{getProvider(providerId).name} · {getProvider(providerId).crs.toUpperCase()} · 右上角可切街道图）
                </span>
                {state === "ready" && mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noreferrer" className="ml-auto text-primary hover:underline">
                        {getProvider(providerId).external?.label}
                    </a>
                )}
                {/* 底图切换下拉：国内飞看高德/天地图更细，国外飞切 Esri 才看得到卫星。
                    需要 Key 的底图（天地图）没配 Key 时不在下拉里出现 */}
                <select
                    value={providerId}
                    onChange={(e) => setProviderId(e.target.value as MapProviderId)}
                    className="ml-2 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted focus:outline-none"
                >
                    {Object.values(MAP_PROVIDERS)
                        .filter((p) => p.enabled)
                        .map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                </select>
            </h4>

            {/* 容器**始终可见**：Leaflet 建图时要拿到真实尺寸，曾经是 display:none 时建图 →
          尺寸算成 0×0 → fitBounds 只能给到全球视野（比例尺 10000 km），事后 invalidateSize
          也救不回缩放级别。加载/错误状态改用浮层盖住。 */}
            {/* isolate：给地图单独开一个层叠上下文。Leaflet 自己的面板 / 控件用的是 z-index 400~1000
          （.leaflet-pane / .leaflet-top），不隔离的话它们会盖过站点的 sticky 顶栏（z-40）——
          滚动时地图糊在导航栏上面。隔离后这些 z-index 只在这个容器内比较。 */}
            <div className="relative isolate">
                <div ref={containerRef} className="h-[380px] w-full overflow-hidden rounded-lg sm:h-[520px]" />
                {/* 高度色带：竖着贴在地图左侧，从按钮行**底下**一路铺到地图底边
            （颜色 = 轨迹那段的平均高度）。只在**单条轨道**时给 —— 多条时每条是纯色
            （图例里分色），色带就没有对应关系了。

            **横向**：左边缘与按钮行左边缘对齐（都是 Leaflet 定死的 10px）。
            两个数字标签挂在**色带右侧**（left-full + ml-1）：压在条上的话数字会盖住渐变本身，
            而条只有 12px 宽，任何标签都宽过它。

            **纵向**：上接按钮行（横排后底边实测 44px，留 4px 取 48），下接地图底边（bottom-0）。
            按钮之所以要横排，就是为了把这一段尽量留长：竖排时三个按钮吃掉 ~94px，横排只剩 ~32px。
            这个数是量出来的、不是算出来的：按钮尺寸由 Leaflet 的 .leaflet-bar a 决定
            （26px，触屏下 30px），改按钮个数或排布就得重新量。
            此前是"与轨迹包围盒等高对齐"，那个做法在轨迹短时会把色带缩成一小截、悬在半空，
            看着像"压住了什么"；现在整列铺满，色带首先是「颜色 ↔ 高度」的图例，位置稳定。

            **只写 bottom-0 不写 top 就没有上边界** —— 容器会被内容高度挤成 2px，整条色带
            看不见（2026-09-23 实测过一次）。

            标签用 absolute 叠在条的两端，不跟着流排：跟着排的话 min 标签会把条的底端从
            地图底边顶上去约 19px，"底端与下边缘对齐"就不成立了。

            pointer-events-none 不挡地图操作。z-[700] 落在 Leaflet 面板层（400）与控件层
            （.leaflet-top 是 1000）之间：色带不需要盖住任何控件，留个"即使算错了也是控件在上"
            的兜底，免得将来再出现"色带糊住按钮"这种看不出所以然的故障。 */}
                {state === "ready" && altRange && (
                    <div
                        className="pointer-events-none absolute bottom-0 left-2.5 top-[48px] z-[700] flex w-3 flex-col"
                        title="轨迹颜色对应的高度（米，海拔）—— 蓝低红高"
                    >
                        <span
                            className="relative w-3 flex-1 rounded-sm border border-border/60"
                            style={{
                                background:
                                    "linear-gradient(to top, hsl(220,70%,48%), hsl(180,70%,48%), hsl(120,70%,48%), hsl(60,70%,48%), hsl(0,70%,48%))",
                            }}
                        >
                            <span className="absolute left-full top-0 ml-1 whitespace-nowrap rounded bg-surface-2/85 px-1 text-[10px] text-muted">
                                {altRange[1].toFixed(0)} m
                            </span>
                            <span className="absolute bottom-0 left-full ml-1 whitespace-nowrap rounded bg-surface-2/85 px-1 text-[10px] text-muted">
                                {altRange[0].toFixed(0)} m
                            </span>
                        </span>
                    </div>
                )}

                {/* 图例：多条轨道时给出"哪条是什么颜色"，点一下可以隐藏/显示那条。
            放在右上角图层控件**下面**（top-20），避免两个控件叠在一起 */}
                {state === "ready" && legend.length > 1 && (
                    <div className="absolute top-20 right-3 z-[1100] flex flex-col gap-1 rounded-md bg-surface-2/90 px-2 py-1.5 text-[11px] backdrop-blur-sm">
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
