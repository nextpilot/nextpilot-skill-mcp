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
