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
