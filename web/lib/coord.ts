/**
 * WGS-84 → GCJ-02 坐标偏移。
 *
 * 为什么需要：飞控日志里的 GPS 是 **WGS-84**（国际标准），而国内底图（高德 / 腾讯 / 百度）
 * 用的都是 **GCJ-02**（"火星坐标"）。坐标不换算就直接画，轨迹会整体偏移几百米
 * ——在"飞在哪块田"这种问题上是错的，不是"差不多"。
 *
 * 算法是公开的 GCJ-02 加偏公式（克拉索夫斯基椭球 + 三次谐波拟合），实现与
 * eviltransform / coordtransform 等公开实现一致，国内精度约 1~2 m。境外不偏移
 * （公式只在中国范围内成立，出了国界直接返回原值）。
 */

const PI = Math.PI;
/** 克拉索夫斯基椭球长半轴（GCJ-02 公式固定用这个椭球，与 WGS-84 椭球不同是公式的一部分） */
const A = 6378245.0;
/** 第一偏心率平方（0.00669342162296594323 的 double 截断形式——字面量多出的尾数
 * 本来就存不进 64 位浮点，写全只会让静态检查报精度丢失，数值完全一致） */
const EE = 0.006693421622965943;

/** 中国大致范围（含港澳台不适用：港澳台用的是本地坐标系，这里按公式的适用范围处理） */
function outOfChina(lat: number, lon: number): boolean {
    return !(lon > 73.66 && lon < 135.05 && lat > 3.86 && lat < 53.55);
}

function transformLat(lon: number, lat: number): number {
    let ret = -100.0 + 2.0 * lon + 3.0 * lat + 0.2 * lat * lat + 0.1 * lon * lat + 0.2 * Math.sqrt(Math.abs(lon));
    ret += ((20.0 * Math.sin(6.0 * lon * PI) + 20.0 * Math.sin(2.0 * lon * PI)) * 2.0) / 3.0;
    ret += ((20.0 * Math.sin(lat * PI) + 40.0 * Math.sin((lat / 3.0) * PI)) * 2.0) / 3.0;
    ret += ((160.0 * Math.sin((lat / 12.0) * PI) + 320 * Math.sin((lat * PI) / 30.0)) * 2.0) / 3.0;
    return ret;
}

function transformLon(lon: number, lat: number): number {
    let ret = 300.0 + lon + 2.0 * lat + 0.1 * lon * lon + 0.1 * lon * lat + 0.1 * Math.sqrt(Math.abs(lon));
    ret += ((20.0 * Math.sin(6.0 * lon * PI) + 20.0 * Math.sin(2.0 * lon * PI)) * 2.0) / 3.0;
    ret += ((20.0 * Math.sin(lon * PI) + 40.0 * Math.sin((lon / 3.0) * PI)) * 2.0) / 3.0;
    ret += ((150.0 * Math.sin((lon / 12.0) * PI) + 300.0 * Math.sin((lon / 30.0) * PI)) * 2.0) / 3.0;
    return ret;
}

/** WGS-84（日志里的经纬度）→ GCJ-02（国内底图要的经纬度）。返回 [lat, lon]。 */
export function wgs84ToGcj02(lat: number, lon: number): [number, number] {
    if (outOfChina(lat, lon)) return [lat, lon];

    let dLat = transformLat(lon - 105.0, lat - 35.0);
    let dLon = transformLon(lon - 105.0, lat - 35.0);
    const radLat = (lat / 180.0) * PI;
    let magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
    dLon = (dLon * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
    return [lat + dLat, lon + dLon];
}
