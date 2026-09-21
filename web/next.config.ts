import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const isDev = process.env.NODE_ENV === "development";

/**
 * 站点版本：footer 要显示「版本号 + 日期」，这两样都不该由人手写在组件里（写在那里的
 * 版本号一定会忘记改，而它偏偏是"看起来一直正常"的那种错）。
 *
 *   · 版本号 ← web/package.json 的 `version`（发版时 `pnpm version` 改它，一处生效）
 *   · 日期 / 短哈希 ← 构建时的 git HEAD
 *
 * 取不到 git（有的托管构建环境没有）时日期退回构建当天、哈希留空：**宁可少一个提交号，
 * 也不要显示"未知"**——日期那格空掉会让 footer 一整块看着像没做完。
 * 读取口只有 `lib/site-version.ts` 一处（全站不许再直接读 NEXT_PUBLIC_APP_*，见
 * `scripts/test-issue-filer.mjs` §[18]）。
 */
function siteEnv(): Record<string, string> {
  const git = (args: string[]): string => {
    try {
      return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return "";
    }
  };
  let version = "";
  try {
    version = String(JSON.parse(readFileSync("package.json", "utf8")).version ?? "");
  } catch {
    version = "";
  }
  // 本地时区的「年-月-日 时:分:秒」：日期只到天会让人分不清两次构建谁新谁旧（一天内
  // 可能构建很多次），精确到秒才能对上"刚发的那版"。format-local 按构建机时区换算，
  // git 取不到（托管环境没有 .git）时退回构建当下的本地时间，口径一致。
  const nowStamp = (): string => {
    const p = (n: number): string => String(n).padStart(2, "0");
    const d = new Date();
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  return {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_APP_COMMIT: git(["rev-parse", "--short", "HEAD"]),
    NEXT_PUBLIC_APP_COMMIT_DATE:
      git(["log", "-1", "--format=%ad", "--date=format-local:%Y-%m-%d %H:%M:%S"]) || nowStamp(),
  };
}

const nextConfig: NextConfig = {
  // 站点版本的构建期注入（见 siteEnv 的说明）；NEXT_PUBLIC_* 会被内联进客户端产物
  env: siteEnv(),
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
