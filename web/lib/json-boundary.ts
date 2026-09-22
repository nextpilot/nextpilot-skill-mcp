/**
 * 把"进程外拿回来的东西"收成可检查形状的通用判断（规则见 CLAUDE.md §6.5）。
 *
 * 这里只放**与具体形状无关**的那几条；每个外部形状自己的 `normalizeXxx` 仍写在它所属的模块里
 * （`lib/report-history.ts` / `lib/community-stats.ts` / `lib/internal-kv.ts`），
 * 因为"缺哪个字段、缺了当什么"是那个形状自己的知识，不该混在通用工具里。
 *
 * 文件名不叫 `normalize.ts`：`lib/error-policy.js` 已经导出一个 `normalize`（给错误消息脱敏的
 * 正则替换），同名不同义正是 §6.4 第⑤条禁的那种迷惑。
 */

/** 是"一个对象"才算可检查的记录：`null`、数组、字符串、数字一律不算 */
export function asRecord(raw: unknown): Record<string, unknown> | null {
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

/** 计数类字段：不是有限非负数一律当 0（后端给的多是 KV 列举条数，理论上不会为负） */
export function toCount(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}
