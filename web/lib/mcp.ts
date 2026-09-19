import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { McpServerMeta } from "./types";
import { parseChangelog } from "./changelog";
import { MCP_DIR } from "./content-dir";

export interface McpServer extends McpServerMeta {
  /** MDX 正文：工具说明、输入输出示例、使用建议 */
  body: string;
}

function parseMcpFile(fileName: string): McpServer {
  const fullPath = path.join(MCP_DIR, fileName);
  const raw = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(raw);
  const slug = fileName.replace(/\.mdx$/, "");

  return {
    slug,
    name: String(data.name ?? slug),
    description: String(data.description ?? ""),
    platforms: (data.platforms ?? []) as string[],
    models: (data.models ?? []) as string[],
    tools: (data.tools ?? []) as string[],
    transport: String(data.transport ?? "stdio"),
    icon: data.icon ? String(data.icon) : undefined,
    clients: (data.clients ?? []) as string[],
    version: data.version ? String(data.version) : undefined,
    changelog: parseChangelog(data.changelog, data.version, data.updatedAt),
    // 缺省视为只读：安全属性上，字段写漏了应当往保守一侧倒
    readOnly: data.readOnly === undefined ? true : Boolean(data.readOnly),
    tags: (data.tags ?? []) as string[],
    rating: Number(data.rating ?? 0),
    downloads: Number(data.downloads ?? 0),
    featured: Boolean(data.featured),
    sourceUrl: data.sourceUrl ? String(data.sourceUrl) : undefined,
    license: data.license ? String(data.license) : undefined,
    updatedAt: String(data.updatedAt ?? ""),
    body: content.trim(),
  };
}

export function getAllMcpServers(): McpServer[] {
  if (!fs.existsSync(MCP_DIR)) return [];
  return fs
    .readdirSync(MCP_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map(parseMcpFile)
    .sort((a, b) => Number(b.featured ?? false) - Number(a.featured ?? false) || b.rating - a.rating);
}

export function getMcpServerBySlug(slug: string): McpServer | undefined {
  const fullPath = path.join(MCP_DIR, `${slug}.mdx`);
  if (!fs.existsSync(fullPath)) return undefined;
  return parseMcpFile(`${slug}.mdx`);
}

/** 列表页用的轻量索引（不含正文） */
export function getMcpIndex(): McpServerMeta[] {
  return getAllMcpServers().map(({ body: _body, ...meta }) => meta);
}
