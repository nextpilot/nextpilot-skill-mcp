import path from "node:path";

/**
 * 站点内容在运行期的**唯一**位置：`web/.generated/`。
 *
 * 真源在 `web/` 之外（`docs/guide`、`knowledge/skills`、`knowledge/mcp`），但 `web/`
 * 是一个独立的 Next.js 项目，部署时只上传它自己这一个目录。以前这里写的是
 * `../content/...`——那只在"部署平台恰好把整个仓库一起传上去"的时候能跑，是平台
 * 行为，不是契约。现在构建期由 `scripts/sync-content.mjs` 把真源拷进来，运行期
 * 只读 `.generated/`：部署包里有没有仓库其余部分都不影响结果。
 *
 * `.generated/` 不入库（见根 `.gitignore`），每次 dev / build 现拷，
 * 所以不存在"改了真源忘了同步"这回事。改内容后页面没变，先查 sync 有没有跑。
 */
const GENERATED_DIR = path.join(process.cwd(), ".generated");

export const GUIDE_DIR = path.join(GENERATED_DIR, "guide");
export const SKILLS_DIR = path.join(GENERATED_DIR, "skills");
export const MCP_DIR = path.join(GENERATED_DIR, "mcp");
