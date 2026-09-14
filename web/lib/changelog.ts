import type { ChangelogEntry } from "./types";

/**
 * 版本历史解析：优先用 frontmatter 的 changelog（作者维护，可写多条）；
 * 未维护时按 version + updatedAt 兜底生成一条首版记录，保证 Tab 不空。
 * Skill 与 MCP 共用。
 */
export function parseChangelog(
  raw: unknown,
  version: unknown,
  updatedAt: unknown,
): ChangelogEntry[] | undefined {
  if (Array.isArray(raw)) {
    const entries = raw
      .map((e) => {
        if (!e || typeof e !== "object") return null;
        const o = e as Record<string, unknown>;
        return {
          version: String(o.version ?? ""),
          date: String(o.date ?? ""),
          notes: Array.isArray(o.notes) ? o.notes.map((n) => String(n)) : [],
        };
      })
      .filter((e): e is ChangelogEntry => Boolean(e && e.version));
    if (entries.length > 0) return entries;
  }
  if (version) {
    return [{ version: String(version), date: String(updatedAt ?? ""), notes: ["首次收录"] }];
  }
  return undefined;
}
