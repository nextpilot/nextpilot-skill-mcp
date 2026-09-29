import type { ChangelogEntry } from "./types";

/** 版本历史解析：历史写在各条目目录的 CHANGELOG.md，是版本号的唯一真源，version/updatedAt
 *  从最新一条推导，frontmatter 不另存。缺历史就明说缺，不编「首次收录」兜底（编出来像真事）。 */

/** `## 1.3.0 — 2026-09-10` 起一条，`- xxx` 是它的变更项；破折号三种写法都收 */
const VERSION_HEADING = /^##\s+(\S+)(?:\s*[—–-]\s*(\S+))?\s*$/;
const BULLET = /^\s*[-*]\s+(.*\S)\s*$/;

/** 解析 CHANGELOG.md。解析不出来返回空数组（= "没有版本"）；"文件存在但格式错"由
 *  check-skill-spec.mjs / check-mcp-spec.mjs 在构建期拦，不在这里混淆。 */
export function parseChangelogFromMarkdown(md: string): ChangelogEntry[] {
    const entries: ChangelogEntry[] = [];
    let cur: ChangelogEntry | null = null;

    for (const line of md.split("\n")) {
        const head = VERSION_HEADING.exec(line);
        if (head) {
            cur = { version: head[1], date: head[2] ?? "", notes: [] };
            entries.push(cur);
            continue;
        }
        const bullet = BULLET.exec(line);
        if (bullet && cur) cur.notes.push(bullet[1]);
    }
    return entries;
}
