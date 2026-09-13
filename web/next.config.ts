import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pyodide 运行时与 .ulg 文件较大，放开静态资源体积告警
  experimental: {},
};

export default nextConfig;
