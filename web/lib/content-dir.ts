import path from "node:path";

/**
 * 站点内容在运行期的**唯一**位置：`web/content/`，也是唯一真源（guide/skills/mcp 全部入库）。
 *
 * `web/` 是独立项目、部署时只上传它自己，运行期只读 `content/`：
 * 有没有仓库其余部分都不影响。不再有构建期拷贝——`sync-content` 已退役。
 */
const CONTENT_DIR = path.join(process.cwd(), "content");

export const GUIDE_DIR = path.join(CONTENT_DIR, "guide");
export const SKILLS_DIR = path.join(CONTENT_DIR, "skills");
export const MCP_DIR = path.join(CONTENT_DIR, "mcp");
