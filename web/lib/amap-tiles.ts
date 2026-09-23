/**
 * 瓦片图层配置 —— 报告页大地图（LogFlightMap）与历史列表缩略图（ReportHistoryList）
 * 共用一份，免得两处各写一遍。
 *
 * 支持多个底图提供商，默认 Esri（全球 WGS-84，无需 API key）。
 * 高德（GCJ-02，仅中国大陆）保留供切换。
 */

// ===================== 提供商类型 =====================

export type MapProviderId = "esri" | "amap";

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
    /** 在外部地图打开起点的链接 */
    externalUrl: (lat: number, lon: number) => string;
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
        externalUrl: (lat, lon) => `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`,
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
        externalUrl: (lat, lon) =>
            `https://uri.amap.com/marker?position=${lon.toFixed(6)},${lat.toFixed(6)}&name=${encodeURIComponent("飞行起点")}`,
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
