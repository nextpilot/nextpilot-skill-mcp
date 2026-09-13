import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Pyodide 运行时与 .ulg 文件较大，放开静态资源体积告警
  experimental: {},
  // 仓库根目录已有 CLAUDE.md，关闭 Next 16 自动生成 AGENTS.md/CLAUDE.md
  agentRules: false,
  // 仅开发环境：Next 路由未命中的 /api、/internal 转给边缘函数垫片（app/edge-dev）。
  // afterFiles 保证 /api/auth/*（NextAuth）等真实路由优先，生产构建不注册这些 rewrite。
  async rewrites() {
    if (!isDev) return [];
    return {
      afterFiles: [
        // 负向匹配必须放行 /api/auth/*（NextAuth 是真实 Next 路由；afterFiles 在 dev 下也会优先 rewrite）
        { source: "/api/:path((?!auth/).*)", destination: "/edge-dev/api/:path*" },
        { source: "/internal/:path*", destination: "/edge-dev/internal/:path*" },
      ],
    };
  },
};

export default nextConfig;
