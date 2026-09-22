import path from "node:path";

/**
 * 站点内容在运行期的**唯一**位置：`web/content/`。
 *
 * 指南真源（手动编写）在 `web/content/guide/`——直接入库，同仓库编辑即可。
 * Skill / MCP 真源在 `web/` 之外（`knowledge/skills`、`knowledge/mcp`），由
 * `scripts/sync-content.mjs` 构建期拷进 `web/content/skills/` 和 `web/content/mcp/`。
 * 部署包只有 `web/` 一个目录，所以运行期只读 `content/`：有没有仓库其余部分都不影响。
 */
const CONTENT_DIR = path.join(process.cwd(), "content");

export const GUIDE_DIR = path.join(CONTENT_DIR, "guide");
export const SKILLS_DIR = path.join(CONTENT_DIR, "skills");
export const MCP_DIR = path.join(CONTENT_DIR, "mcp");
