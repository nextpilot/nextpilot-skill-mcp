import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * 站点版本：footer 要显示「版本号 + 日期」，都不该由人手写在组件里（写死会忘改）。
 *   · 版本号 ← web/package.json 的 `version`（发版时 `pnpm version` 改它，一处生效）
 *   · 日期 / 短哈希 ← 构建时的 git HEAD
 * 取不到 git（有的托管构建环境没有）时日期退回构建当天、哈希留空；
 * 读取口只有 `lib/site-version.ts` 一处。
 */
function siteEnv(): Record<string, string> {
    const git = (args: string[]): string => {
        try {
            return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
        } catch {
            return "";
        }
    };
    let version: string;
    try {
        version = String(JSON.parse(readFileSync("package.json", "utf8")).version ?? "");
    } catch {
        version = "";
    }
    // 本地时区的「年-月-日 时:分:秒」：日期只到天会让人分不清两次构建谁新谁旧。
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
    // HMR 跨域：通过 127.0.0.1 访问时允许 /_next/hmr 的 WebSocket
    allowedDevOrigins: ["127.0.0.1"],
    // Turbopack 应用根 = 仓库根（web/ 的上一级）。
    // 不能钉在 web/：本仓库是 pnpm workspace，依赖装在仓库根的 node_modules/.pnpm 里，
    // 而 Turbopack 硬规则是"root 之外的文件不编译"，root 钉在 web/ 会解析不到 next 包
    // （冷启动才暴露，全路由 500；.next/dev 有旧产物时会掩盖）。
    turbopack: {
        root: process.cwd() + "/..",
    },
    // 站点内容真源就在 content/ 下（入库），运行期只读那里。它不在模块图里（是 fs 读的），
    // 打包器不会自动跟踪：`output: "standalone"` 时少了这行部署包里就没有内容目录，
    // 线上会静默变成"0 篇指南 / 0 个 Skill"，而不是报错。
    outputFileTracingIncludes: {
        "/**": ["./content/**"],
    },
    // /api、/internal 未命中真实 Next route 时转给边缘函数垫片（app/edge-dev）。
    //
    // 用 beforeFiles 不用 afterFiles：EdgeOne 平台路由层会先匹配动态页面路由再处理 afterFiles
    // rewrite，线上 /api/me 会被 app/[locale]/me 截胡返回 HTML；beforeFiles 在一切文件系统
    // （含动态）路由之前执行，两端行为一致。
    //
    // 排除清单 = 需要真实 Next route 的前缀：auth/（NextAuth）、skills/（zip 打包要 node:fs +
    // jszip，边缘运行时没有完整文件系统）、ping（冒烟探针）。漏排一个前缀 = 该真实 route 永远
    // 被转进垫片、静默 404，新增真实 API route 时要同步加进这里。
    async headers() {
        return [
            // 全站安全响应头。放在最前，所有路径都吃到。
            //
            // CSP 先走 Report-Only：站点有百度统计的内联脚本、Plotly 的内联样式，直接上强制
            // CSP 会把它们全挡掉。Report-Only 只上报不拦截，观察一段时间确认无误报后再改成
            // Content-Security-Policy 强制生效。
            //
            // X-Frame-Options 防点击劫持（页面被别的站 iframe 套住，诱导用户点广告）；
            // nosniff 防 MIME 嗅探（上传的 .json 被当脚本执行）；HSTS 防首次访问被降级到 http。
            {
                source: "/:path*",
                headers: [
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "X-Frame-Options", value: "SAMEORIGIN" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    {
                        key: "Strict-Transport-Security",
                        value: "max-age=63072000; includeSubDomains",
                    },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=(self)",
                    },
                    {
                        key: "Content-Security-Policy-Report-Only",
                        value: [
                            "default-src 'self'",
                            // Next.js 的水合脚本与百度统计都是内联，'unsafe-inline' 暂时离不开
                            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://hm.baidu.com",
                            "style-src 'self' 'unsafe-inline'",
                            // Plotly 图表把数据渲染成 data: URL 的图片，Leaflet 瓦片走 https
                            "img-src 'self' data: blob: https:",
                            "font-src 'self' data:",
                            "connect-src 'self' https://hm.baidu.com https://api.nextpilot.org",
                            "frame-ancestors 'self'",
                            "base-uri 'self'",
                            "form-action 'self'",
                        ].join("; "),
                    },
                ],
            },
            // API / 内部端点禁止一切缓存：EdgeOne CDN 会缓存 404 等 HTML 错误页（缓存键忽略
            // query string），部署后最长几分钟内该路径都吃到旧错误响应。opennext 适配器实测忽略
            // 本配置，线上靠默认 TTL 约 5 分钟自然过期；要根治需在 EdgeOne 控制台配不缓存规则。
            // 本配置对本地 next start 与自托管生效，并作为预期缓存策略的声明。
            { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
            { source: "/internal/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
            // 首页（含 /、/en、/zh）：CDN 缓存 60 秒，过期后用旧内容撑 5 分钟
            {
                source: "/:locale(zh|en)?",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "public, s-maxage=60, stale-while-revalidate=300",
                    },
                ],
            },
            // 公开内容页（指南、Skill、MCP）：内容变更频率低，CDN 缓存 5 分钟，过期后兜底 10 分钟
            {
                source: "/:locale(zh|en)?/(guide|skills|mcp)/:path*",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "public, s-maxage=300, stale-while-revalidate=600",
                    },
                ],
            },
        ];
    },
    async rewrites() {
        return {
            beforeFiles: [
                // /.well-known/security.txt 在部分部署平台中路由层的处理与 Next.js 不一致，
                // 可能导致 500。显式 rewrite 到 /security.txt 兜底。
                { source: "/.well-known/security.txt", destination: "/security.txt" },
                // opennext（EdgeOne 适配器）生成的 SSR 路由会覆盖边缘函数路由，functions/ 无法执行。
                // dev + 生产统一 rewrite 到 edge-dev 垫片，在 Node 侧运行同一份代码。
                { source: "/api/:path((?!auth/|skills/|ping(?:/|$)).*)", destination: "/edge-dev/api/:path*" },
                { source: "/internal/:path*", destination: "/edge-dev/internal/:path*" },
            ],
            afterFiles: [] as { source: string; destination: string }[],
        };
    },
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
