/**
 * 高德瓦片的地址与取瓦片要用的墨卡托换算 —— 报告页的大地图（LogFlightMap）与
 * 历史列表的缩略图（HistoryList 的 TrackThumb）共用一份，免得两处各写一遍。
 *
 * ⚠️ 子域名是 ["1".."4"]，拼出来是 webrd01 / webst01 这类主机名——写成 "01" 会得到
 * webrd001.is.autonavi.com（**该域名不存在**，地图一片灰，实测 curl 直接 DNS 失败）。
 */
export const TILE_SUBDOMAINS = ["1", "2", "3", "4"];

/** 街道图（矢量底 + 中文标注） */
export const AMAP_STREET =
  "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}";
/** 卫星影像 */
export const AMAP_SATELLITE = "https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}";
/** 卫星图上的路名 / 地名 / 边界（叠加用） */
export const AMAP_SATELLITE_LABELS =
  "https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}";
export const AMAP_ATTRIBUTION = '&copy; <a href="https://www.amap.com/">高德地图</a>';

/** 高德瓦片的原生最高级别：再往上要求它没有的图，返回空白 → 地图看着"没有图层" */
export const TILE_MAX_NATIVE_ZOOM = 18;
/** 默认视野的缩放上限（别一进来就顶到没数据的地方） */
export const FIT_MAX_ZOOM = 18;

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

/** 拼一张瓦片地址（subdomain 从 TILE_SUBDOMAINS 里挑，Leaflet 与缩略图都用同一套） */
export function tileUrl(template: string, x: number, y: number, z: number, subdomainIndex = 0): string {
  const s = TILE_SUBDOMAINS[subdomainIndex % TILE_SUBDOMAINS.length];
  return template
    .replace("{s}", s)
    .replace("{x}", String(x))
    .replace("{y}", String(y))
    .replace("{z}", String(z));
}
