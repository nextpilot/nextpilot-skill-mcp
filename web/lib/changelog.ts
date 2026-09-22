import type { ChangelogEntry } from "./types";

/**
 * 版本历史解析：Skill 与 MCP 条目都把历史写在各自目录的 `CHANGELOG.md` 里，
 * 它是那个条目**版本号的唯一真源** —— `version` / `updatedAt` 都从最新一条推导，
 * frontmatter 里不再另存一份（存了就是两份会分叉的真源）。
 *
 * 以前 MCP 走的是另一条路：`parseChangelogFromFrontmatter` 读 `.mdx` frontmatter 的
 * `changelog:` 数组，**没写时兜底造一条「首次收录」**——于是页面上出现一条看起来
 * 像真事、实际是代码编出来的版本历史，作者自己都不知道。MCP 改成目录结构后这个函数
 * 没有调用者了，连同那条兜底一起删掉：缺历史就明说缺，不要替它编一条。
 */

/** `## 1.3.0 — 2026-09-10` 起一条，`- xxx` 是它的变更项；破折号三种写法都收 */
const VERSION_HEADING = /^##\s+(\S+)(?:\s*[—–-]\s*(\S+))?\s*$/;
const BULLET = /^\s*[-*]\s+(.*\S)\s*$/;

/**
 * 解析 `CHANGELOG.md`。解析不出来时返回空数组而不是 `undefined`——调用方据此
 * 推出"这个条目没有版本"，而"文件存在但格式错了"是另一种情况，由
 * `check-skill-spec.mjs` / `check-mcp-spec.mjs` 在构建期拦，不在这里混淆。
 */
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
