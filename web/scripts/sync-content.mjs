/**
 * 把仓库里的内容真源拷进 `web/content/`。
 *
 * 指南真源已直接放在 `web/content/guide/`（入库），不需要拷贝。
 * Skill / MCP 的真源在 `web/` 之外（`knowledge/skills`、`knowledge/mcp`），
 * 而 `web/` 是一个独立的 Next.js 项目，部署时只上传它自己这一个目录。
 * 构建期拷进来，运行期只读 `content/`（见 `web/lib/content-dir.ts`）：
 * 部署包里有没有仓库其余部分都不影响结果。
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
const OUT = resolve(webRoot, "content");

/** [仓库内的真源目录, 拷到 content/ 下的哪个子目录] —— 与 lib/content-dir.ts 一一对应 */
const SOURCES = [
    ["knowledge/skills", "skills"],
    ["knowledge/mcp", "mcp"],
];

function syncOne([srcRel, destName]) {
    const src = resolve(repoRoot, srcRel);
    // 真源没了就**构建失败**，别静默产出一个空站点：报清楚缺哪个目录、真源应该在哪
    if (!existsSync(src)) {
        throw new Error(`内容源不存在：${srcRel}/（仓库根 ${repoRoot}）——真源被挪走了？改本脚本的 SOURCES`);
    }
    const dest = resolve(OUT, destName);
    // 先清后拷：源里删掉的文件不该留在产物里。content/skills/、content/mcp/ 是构建期产物。
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
    return `${srcRel}/ → content/${destName}/`;
}

function syncAll() {
    console.log("content synced: " + SOURCES.map(syncOne).join("; "));
}

syncAll();

// 写内容时开着它：改 knowledge/skills 或 knowledge/mcp 里的文件不用重启 dev（recursive 在 Windows / Linux 都支持）
if (process.argv.includes("--watch")) {
    for (const [srcRel] of SOURCES) {
        watch(resolve(repoRoot, srcRel), { recursive: true }, (_event, filename) => {
            console.log(`[sync] ${srcRel}/${filename} 变了，重拷`);
            syncAll();
        });
    }
    console.log("watching " + SOURCES.map(([s]) => s).join(", ") + " …");
}
