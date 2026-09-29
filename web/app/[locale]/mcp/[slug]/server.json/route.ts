import fs from "node:fs";
import path from "node:path";
import { MCP_DIR } from "@/lib/content-dir";

/**
 * 把 MCP 条目的 `server.json` 原样吐出来：`/mcp/<slug>/server.json`。
 *
 * 有这个路由，`web/content/mcp/<slug>/server.json` 才不只是"仓库里躺着给守卫看的文件"，
 * MCP 客户端能直接照它装包。返回的是文件原文，而不是 `lib/mcp.ts` 解析后的
 * `McpManifest`：那份 struct 只声明了站点要用的几个字段（见 `lib/mcp.ts` 顶部），
 * 拿它再序列化一次会静默丢掉站点不关心的字段，manifest 就不完整了。
 *
 * 上游未确认的条目没有 `server.json`（README frontmatter 标了 `upstream_status: "pending"`）。
 * 这时返回 404，并在 body 里说清缺什么：不给一个空对象或占位 manifest。客户端照着
 * 占位内容去装包，会装到一个不存在的包，而它无从判断那是"还没核实"还是"就是这样"。
 * 判红与放行由 `check-mcp-spec.mjs` 负责，这里只管如实回答。
 */

/** slug 只可能是目录名；先卡字符集再拼路径，杜绝 `../` 类穿越 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const JSON_HEADERS = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=300",
} as const;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;

    if (!SLUG_RE.test(slug)) {
        return Response.json(
            { error: `slug 不是合法目录名（只接受小写字母数字与连字符）：${slug}` },
            { status: 400, headers: JSON_HEADERS },
        );
    }

    const file = path.join(MCP_DIR, slug, "server.json");
    if (!fs.existsSync(file)) {
        const dirExists = fs.existsSync(path.join(MCP_DIR, slug));
        return Response.json(
            {
                error: dirExists
                    ? `${slug} 还没有 server.json：上游未核实（README frontmatter 的 upstream_status 为 pending），核实后才能填 manifest`
                    : `没有这个 MCP 条目：${slug}`,
            },
            { status: 404, headers: JSON_HEADERS },
        );
    }

    // 原样返回，不 JSON.parse 再 stringify：那会改掉缩进，也会把站点不认识的字段留成原样却
    // 让人以为是"被处理过"的产物。文件本身已由 check-mcp-spec.mjs 保证是合法 JSON。
    return new Response(fs.readFileSync(file, "utf8"), { status: 200, headers: JSON_HEADERS });
}
