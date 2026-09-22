/** 日期显示：年内显示月日，跨年显示年份 */
export function formatDate(iso: string): string {
    const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
    if (Number.isNaN(d.getTime())) return iso;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const thisYear = new Date().getUTCFullYear();
    return y === thisYear ? `${m}-${day}` : `${y}-${m}-${day}`;
}

/** 日志内的时间戳（相对日志起点的秒数）→ `hh:MM:ss`，给事件消息与参数变更用。
 *  按整秒向下取整（秒以下不显示）；日志起点前的负值（阶段起点可能早零点几秒）按 0 处理。 */
export function formatLogTime(tSec: number): string {
    const total = Math.max(0, Math.floor(tSec));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** 本地时间 → `yyyy-MM-dd HH:mm:ss`（报告页「Logging Start」与历史卡片统一用这个写法） */
export function formatDateTime(value: Date | number | string): string {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const p = (n: number) => String(n).padStart(2, "0");
    return (
        `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
        ` ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    );
}

/**
 * 飞控软件版本的展示串（口径 = Flight Review 的 `_format_sw_version`）。
 *
 * 引擎已经把结论算进 `facts.firmwareDisplay`（`v1.16.0` / `v1.17.0-alpha` / `v1.14.3 (08310a)` /
 * 无版本号时给 git 短哈希），这里优先直接用它；缺了才按同一规则用 `fwReleaseType` +
 * `firmware` + `verSw` 重算一遍（云端记录、或引擎之后又调了口径的老存档，都能在界面上纠正过来，
 * 不必重新解析日志）。
 */
export function formatFirmware(
    facts?: { firmwareDisplay?: string; firmware?: string; fwReleaseType?: number | null; verSwBranch?: string },
    verSw?: string,
): string {
    const hash = (verSw ?? "").trim();
    const short = hash.length > 10 ? hash.slice(0, 6) : hash;
    const type = facts?.fwReleaseType;
    // 有类型码就能完整重算：0 = 未打标签的开发版（附短哈希），255 = 正式版（无后缀），
    // 64/128/192 = alpha/beta/RC（带后缀、不带哈希）
    if (typeof type === "number" && facts?.firmware) {
        const suffix = { 64: "-alpha", 128: "-beta", 192: "-rc", 255: "" }[type] ?? "";
        const label = `${facts.firmware}${suffix}`.replace(/^v?/, "v");
        return type === 0 && short ? `${label} (${short})` : label;
    }
    const disp = (facts?.firmwareDisplay ?? "").trim();
    if (disp) return disp;
    return short || "—";
}
