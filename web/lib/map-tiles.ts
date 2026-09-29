/**
 * 瓦片图层配置，报告页大地图（LogFlightMap）与历史列表缩略图（ReportHistoryList）
 * 共用一份，免得两处各写一遍。
 *
 * 支持多个底图提供商，默认 Esri（全球 WGS-84，无需 API key）。
 * 另两个都是国内底图（GCJ-02，仅中国大陆）：高德、天地图。境外飞行只能用 Esri。
 */

// ===================== 提供商类型 =====================

export type MapProviderId = "esri" | "amap" | "tianditu";

export interface MapProvider {
    id: MapProviderId;
    /** 下拉菜单里的显示名 */
    name: string;
    /** 坐标系 */
    crs: "wgs84" | "gcj02";
    /** 卫星影像图层 URL 模板 */
    satellite: string;
    /** 街道图图层 URL 模板 */
    street: string;
    /** 卫星图上的路名/地名叠加层（仅高德有这个独立图层） */
    satelliteLabels?: string;
    /** 版权标注 */
    attribution: string;
    /** 子域名（高德轮询用，多域名并行加载更快） */
    subdomains?: string[];
    /** 瓦片原生最高级别 */
    maxNativeZoom: number;
    /** 视野缩放上限 */
    fitMaxZoom: number;
    /** 在外部地图打开起点的入口（坐标系与当前底图一致）。
     *  天地图没有稳定的带坐标深链，整块留空时报告页就不显示这个入口。
     *  链接与文案合成一个对象，省得将来只填一半、点出去的图和写的名字不是一家 */
    external?: {
        label: string;
        url: (lat: number, lon: number) => string;
    };
    /** 是否需要 Key：天地图没配 Key 时瓦片直接 403，没配就不在下拉里出现
     *  （免得选了以后整片灰，界面说不清是网不通还是没钥匙） */
    enabled: boolean;
}

// ===================== 高德（GCJ-02，仅中国大陆） =====================

const AMAP_SUBDOMAINS = ["1", "2", "3", "4"];

export const AMAP_STREET =
    "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}";
export const AMAP_SATELLITE = "https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}";
export const AMAP_SATELLITE_LABELS = "https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}";
export const AMAP_ATTRIBUTION = '&copy; <a href="https://www.amap.com/">高德地图</a>';

// ===================== Esri（WGS-84，全球，免费） =====================

export const ESRI_SATELLITE =
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const ESRI_STREET =
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
export const ESRI_ATTRIBUTION =
    '&copy; <a href="https://www.esri.com/">Esri</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

// ===================== 天地图（仅中国大陆，需带 Key） =====================

/**
 * 天地图 WMTS 强制带 Key：官方《地图服务》页写明"使用本组服务之前，需要申请 Key"
 * （lbs.tianditu.gov.cn/server/MapService.html），没有 tk 时瓦片直接 403。
 * Key 走环境变量，不入库。
 */
const TIANDITU_TK = process.env.NEXT_PUBLIC_TIANDITU_TK ?? "";

/** 子域名 t0~t7，轮询着取能并行加载 */
const TIANDITU_SUBDOMAINS = ["0", "1", "2", "3", "4", "5", "6", "7"];
export const TIANDITU_ATTRIBUTION = '&copy; <a href="https://www.tianditu.gov.cn/">天地图</a>';

/** 天地图只有 WMTS（没有 {z}/{x}/{y} 直链），图层名与投影集都得写在 query 上。
 *  `_w` = 球面墨卡托，正对 Leaflet 默认的 EPSG:3857；换成 `_c`（经纬度直投）会整张图错位。 */
function tiandituLayer(layer: "img" | "vec" | "cia"): string {
    return (
        `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
        `&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles` +
        `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_TK}`
    );
}

// ===================== 提供商注册表 =====================

export const MAP_PROVIDERS: Record<MapProviderId, MapProvider> = {
    esri: {
        id: "esri",
        name: "Esri（全球卫星）",
        crs: "wgs84",
        satellite: ESRI_SATELLITE,
        street: ESRI_STREET,
        attribution: ESRI_ATTRIBUTION,
        maxNativeZoom: 19,
        fitMaxZoom: 19,
        enabled: true,
        external: {
            label: "在 Google Maps 打开起点",
            url: (lat, lon) => `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`,
        },
    },
    amap: {
        id: "amap",
        name: "高德（中国区域）",
        crs: "gcj02",
        satellite: AMAP_SATELLITE,
        street: AMAP_STREET,
        satelliteLabels: AMAP_SATELLITE_LABELS,
        attribution: AMAP_ATTRIBUTION,
        subdomains: AMAP_SUBDOMAINS,
        maxNativeZoom: 18,
        fitMaxZoom: 18,
        enabled: true,
        external: {
            label: "在高德地图打开起点",
            url: (lat, lon) =>
                `https://uri.amap.com/marker?position=${lon.toFixed(6)},${lat.toFixed(6)}&name=${encodeURIComponent("飞行起点")}`,
        },
    },
    tianditu: {
        id: "tianditu",
        name: "天地图（中国区域）",
        // 天地图瓦片是 GCJ-02（与高德同类，公开资料一致）：WGS-84 轨迹要换算才对得上底图
        crs: "gcj02",
        satellite: tiandituLayer("img"),
        street: tiandituLayer("vec"),
        satelliteLabels: tiandituLayer("cia"),
        attribution: TIANDITU_ATTRIBUTION,
        subdomains: TIANDITU_SUBDOMAINS,
        maxNativeZoom: 18,
        fitMaxZoom: 18,
        enabled: TIANDITU_TK.length > 0,
    },
};

export const DEFAULT_PROVIDER: MapProviderId = "esri";

/** 便捷别名：默认提供商 */
export function getProvider(id: MapProviderId): MapProvider {
    return MAP_PROVIDERS[id];
}

// ===================== 遗留导出（供缩略图等不需要切换的静态场景） =====================

/** 高德子域名（ReportHistoryList 缩略图的 tileUrl 依赖它） */
export const TILE_SUBDOMAINS = AMAP_SUBDOMAINS;

/** 当前缩略图使用的卫星瓦片（Esri，全球覆盖） */
export const THUMB_SATELLITE = ESRI_SATELLITE;

/** 单张瓦片边长（像素，标准 Web 墨卡托） */
export const TILE_SIZE = 256;

/** 把经度换成"世界像素"横坐标（z 层，全球 256*2^z 像素宽） */
export function lonToWorldX(lon: number, z: number): number {
    return ((lon + 180) / 360) * TILE_SIZE * 2 ** z;
}

/** 把纬度换成"世界像素"纵坐标（墨卡托，北在上） */
export function latToWorldY(lat: number, z: number): number {
    const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const rad = (clamped * Math.PI) / 180;
    const y = Math.log(Math.tan(rad) + 1 / Math.cos(rad));
    return ((1 - y / Math.PI) / 2) * TILE_SIZE * 2 ** z;
}

/** 拼一张瓦片地址（subdomain 从 TILE_SUBDOMAINS 里挑；如果模板里没有 {s} 也不影响） */
export function tileUrl(template: string, x: number, y: number, z: number, subdomainIndex = 0): string {
    const s = TILE_SUBDOMAINS[subdomainIndex % TILE_SUBDOMAINS.length];
    return template.replace("{s}", s).replace("{x}", String(x)).replace("{y}", String(y)).replace("{z}", String(z));
}
