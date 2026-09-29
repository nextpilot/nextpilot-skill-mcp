import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { McpServerMeta } from "./types";
import { parseChangelogFromMarkdown } from "./changelog";
import { MCP_DIR } from "./content-dir";

/** MCP Registry 规范（server.json）里站点真正用到的字段。只声明要读的（搬整份 schema 就得跟着版本走），
 *  完整合规由 check-mcp-spec.mjs 校验。 */
export interface McpManifest {
    /** 反向 DNS，如 io.github.furkanisikay/ardupilot-mcp */
    name: string;
    description: string;
    version: string;
    repository?: { url?: string; source?: string };
    packages?: {
        registryType: string;
        identifier: string;
        version: string;
        transport?: { type?: string };
    }[];
}

export interface McpServer extends McpServerMeta {
    /** MDX 正文：工具说明、输入输出示例、使用建议 */
    body: string;
    /** 上游未确认的条目没有 server.json，站点据此标"待补"而不是显示一个编造的值 */
    manifest?: McpManifest;
}

/** 传输方式的唯一真源是 server.json 的 packages[0].transport.type；上游未确认的条目没有 server.json，
 *  退回 README frontmatter 过渡值。两份并存即双真源，由 check-mcp-spec.mjs 判红，这里只管读。 */
function resolveTransport(manifest: McpManifest | undefined, fallback: unknown): string {
    const fromManifest = manifest?.packages?.[0]?.transport?.type;
    if (fromManifest) return String(fromManifest);
    const raw = fallback == null ? "" : String(fallback);
    return raw || "待补";
}

function parseMcpDir(slug: string): McpServer {
    const dir = path.join(MCP_DIR, slug);
    const { data, content } = matter(fs.readFileSync(path.join(dir, "README.md"), "utf8"));

    const changelog = parseChangelogFromMarkdown(fs.readFileSync(path.join(dir, "CHANGELOG.md"), "utf8"));
    // 版本与日期从版本历史的最新一条推导，frontmatter 里不再另存一份
    const latest = changelog[0];

    const manifestPath = path.join(dir, "server.json");
    const manifest: McpManifest | undefined = fs.existsSync(manifestPath)
        ? (JSON.parse(fs.readFileSync(manifestPath, "utf8")) as McpManifest)
        : undefined;

    return {
        slug,
        name: String(data.name ?? slug),
        description: String(data.description ?? ""),
        platforms: (data.platforms ?? []) as string[],
        models: (data.models ?? []) as string[],
        tools: (data.tools ?? []) as string[],
        transport: resolveTransport(manifest, data.transport),
        icon: data.icon ? String(data.icon) : undefined,
        clients: (data.clients ?? []) as string[],
        version: latest?.version,
        changelog,
        // 缺省视为只读：安全属性上，字段写漏了应当往保守一侧倒
        readOnly: data.readOnly === undefined ? true : Boolean(data.readOnly),
        tags: (data.tags ?? []) as string[],
        rating: Number(data.rating ?? 0),
        downloads: Number(data.downloads ?? 0),
        featured: Boolean(data.featured),
        sourceUrl: manifest?.repository?.url,
        license: data.license ? String(data.license) : undefined,
        updatedAt: latest?.date ?? "",
        body: content.trim(),
        manifest,
    };
}

export function getAllMcpServers(): McpServer[] {
    if (!fs.existsSync(MCP_DIR)) return [];
    return fs
        .readdirSync(MCP_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => parseMcpDir(d.name))
        .sort((a, b) => Number(b.featured ?? false) - Number(a.featured ?? false) || b.rating - a.rating);
}

export function getMcpServerBySlug(slug: string): McpServer | undefined {
    if (!fs.existsSync(path.join(MCP_DIR, slug))) return undefined;
    return parseMcpDir(slug);
}

/** 列表页用的轻量索引（不含正文） */
export function getMcpIndex(): McpServerMeta[] {
    return getAllMcpServers().map(({ body: _body, manifest: _manifest, ...meta }) => meta);
}
