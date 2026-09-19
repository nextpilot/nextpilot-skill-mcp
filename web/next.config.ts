import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Pyodide 运行时与 .ulg 文件较大，放开静态资源体积告警
  experimental: {},
  // 仓库根目录已有 CLAUDE.md，关闭 Next 16 自动生成 AGENTS.md/CLAUDE.md
  agentRules: false,
  // Turbopack 应用根钉在 web/ 自身：仓库根有一个空的 pnpm-lock.yaml（根 package.json
  // 零依赖、纯转发壳），与 web/ 里真正有依赖的 lockfile 撞车，Turbopack 向上推断会误选
  // 仓库根并警告 "inferred workspace root may not be correct"。显式给定 root 后不再自动
  // 推断；本仓库所有 next 命令都经根 package.json 的 `pnpm -C web` 转发，运行 cwd 就是 web/。
  turbopack: {
    root: process.cwd(),
  },
  // 站点内容在构建期由 scripts/sync-content.mjs 拷进 .generated/，运行期只读那里。
  // 它不在模块图里（是 fs.readdirSync 读的），打包器不会自动跟踪：默认输出是把整个
  // web/ 传上去所以没事，一旦将来切成 `output: "standalone"`，少了这一行部署包里就
  // 没有内容目录，线上会**静默**变成"0 篇指南 / 0 个 Skill"，而不是报错。
  outputFileTracingIncludes: {
    "/**": ["./.generated/**"],
  },
  // 仅开发环境：Next 路由未命中的 /api、/internal 转给边缘函数垫片（app/edge-dev）。
  // afterFiles 保证 /api/auth/*（NextAuth）等真实路由优先，生产构建不注册这些 rewrite。
  async rewrites() {
    if (!isDev) return [];
    return {
      afterFiles: [
        // 负向匹配必须放行 /api/auth/*（NextAuth 是真实 Next 路由；afterFiles 在 dev 下也会优先 rewrite）
        { source: "/api/:path((?!auth/).*)", destination: "/edge-dev/api/:path*" },
        { source: "/internal/:path*", destination: "/edge-dev/internal/:path*" },
        // 根级自检探针：`functions/foo.js` 的 URL 就是 `/foo`（不挂 /api 前缀）。
        // 不加这三条它们在本地永远 404 —— 而这三个恰恰是"部署前手工验一遍"的工具，
        // 本地用不了就只能等发布后再发现问题（见 app/edge-dev/[[...path]]/route.ts 的说明）
        { source: "/ping", destination: "/edge-dev/ping" },
        { source: "/kv-probe", destination: "/edge-dev/kv-probe" },
        { source: "/issue-probe", destination: "/edge-dev/issue-probe" },
      ],
    };
  },
};

export default nextConfig;
