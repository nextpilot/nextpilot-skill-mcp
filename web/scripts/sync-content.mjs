/**
 * 把仓库里的内容真源拷进 `web/.generated/`。
 *
 * 为什么需要这一步：指南 / Skill / MCP 的真源在 `web/` 之外（`docs/guide`、
 * `knowledge/skills`、`knowledge/mcp`），而 `web/` 是一个独立的 Next.js 项目，
 * 部署时只上传它自己这一个目录。以前运行期直接读 `../content/...`——那只在
 * "部署平台恰好把整个仓库一起传上去"的时候成立，是平台行为不是契约。
 * 现在构建期拷进来，运行期只读 `.generated/`（见 `web/lib/content-dir.ts`）：
 * 部署包里有没有仓库其余部分都不影响结果。
 *
 * 产物不入库（根 `.gitignore`：`web/.generated/`），每次 dev / build 现拷，
 * 所以不存在"改了真源忘了同步"这回事。
 *
 * 用法（在 web/ 下）：
 *   node scripts/sync-content.mjs            拷一次（dev / build 自动跑）
 *   node scripts/sync-content.mjs --watch    写内容时开着：改完存盘即重拷，不用重启 dev
 */
import { cpSync, mkdirSync, rmSync, existsSync, watch } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const repoRoot = resolve(webRoot, "..");
const OUT = resolve(webRoot, ".generated");

/** [仓库内的真源目录, 拷到 .generated/ 下的哪个子目录] —— 与 lib/content-dir.ts 一一对应 */
const SOURCES = [
  ["docs/guide", "guide"],
  ["knowledge/skills", "skills"],
  ["knowledge/mcp", "mcp"],
];

function syncOne([srcRel, destName]) {
  const src = resolve(repoRoot, srcRel);
  // 真源没了就**构建失败**，别静默产出一个空站点：报清楚缺哪个目录、真源应该在哪
  if (!existsSync(src)) {
    throw new Error(
      `内容源不存在：${srcRel}/（仓库根 ${repoRoot}）——真源被挪走了？改本脚本的 SOURCES`,
    );
  }
  const dest = resolve(OUT, destName);
  // 先清后拷：源里删掉的文件不该留在产物里。.generated 是一次性目录，不留历史。
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  return `${srcRel}/ → .generated/${destName}/`;
}

function syncAll() {
  console.log("content synced: " + SOURCES.map(syncOne).join("; "));
}

syncAll();

// 写内容时开着它：改 docs/guide 里的 mdx 不用重启 dev（recursive 在 Windows / Linux 都支持）
if (process.argv.includes("--watch")) {
  for (const [srcRel] of SOURCES) {
    watch(resolve(repoRoot, srcRel), { recursive: true }, (_event, filename) => {
      console.log(`[sync] ${srcRel}/${filename} 变了，重拷`);
      syncAll();
    });
  }
  console.log("watching " + SOURCES.map(([s]) => s).join(", ") + " …");
}
