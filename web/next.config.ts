import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import createNextIntlPlugin from "next-intl/plugin";

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
    // HMR 跨域：通过 127.0.0.1 访问时允许 /_next/hmr 的 WebSocket
    allowedDevOrigins: ["127.0.0.1"],
    // Turbopack 应用根 = **仓库根**（web/ 的上一级）。
    //
    // 必须指向上一级，不能钉在 web/：本仓库是 pnpm workspace（根 pnpm-workspace.yaml 收 web），
    // 依赖装在**仓库根**的 node_modules/.pnpm 里，web/node_modules/* 只是指向那里的 junction。
    // 而 Turbopack 对 root 之外的文件有一条硬规则「files outside of the workspace root are not
    // compiled」，root 一旦钉成 web/，它就解析不到 next 包本身：
    //   ./app → Error: Could not find the Next.js package (next/package.json)
    //           Filesystem root used for resolution: <repo>/web
    // 结果是所有路由 500（PageNotFoundError），且**只在冷启动暴露** —— .next/dev 里还留着上次
    // 编译产物时它直接复用、不重新解析，看起来一切正常；清掉 .next 或换台机器就立刻炸。
    //
    // 反向的坑也要记：早先这里写的是 process.cwd()（= web/），理由是"根目录有空 lockfile 会让
    // Turbopack 误判"。那只是条警告，而现在这个是硬错误 —— 两害相权取其轻。
    turbopack: {
        root: process.cwd() + "/..",
    },
    // 站点内容真源就在 content/ 下（入库），运行期只读那里。
    // 它不在模块图里（是 fs.readdirSync 读的），打包器不会自动跟踪：默认输出是把整个
    // web/ 传上去所以没事，一旦将来切成 `output: "standalone"`，少了这一行部署包里就
    // 没有内容目录，线上会**静默**变成"0 篇指南 / 0 个 Skill"，而不是报错。
    outputFileTracingIncludes: {
        "/**": ["./content/**"],
    },
    // /api、/internal 未命中真实 Next route 时转给边缘函数垫片（app/edge-dev）。
    //
    // ⚠️ 必须用 **beforeFiles**，不能用 afterFiles：Next.js 原生语义里 afterFiles 在
    // 动态路由之前执行（本地 dev/prod 实测 /api/me 都能正常 rewrite 进垫片），但
    // EdgeOne 的 opennext 适配器在平台路由层会**先匹配动态页面路由再处理 afterFiles
    // rewrite**——线上 /api/me 被 app/[locale]/me（个人中心页）截胡，返回 HTML 而不是
    // JSON（2026-09-28 线上复现，本地 next start 无法复现）。beforeFiles 在一切文件
    // 系统（含动态）路由之前执行，两端行为一致。
    //
    // 负向排除清单 = 需要真实 Next route 的前缀：
    //   · auth/   —— NextAuth（app/api/auth/**）
    //   · skills/ —— Skill 安装包 zip 下载（app/api/skills/[slug]/download）：打包要
    //     node:fs + jszip，边缘/垫片运行时没有完整文件系统，只能在 Node 侧做
    //   · ping    —— 冒烟探针（app/api/ping），故意保留真实 route：它 200 说明"真实
    //     Next route 可达"，走垫片就失去对照意义
    // 注意 beforeFiles 优先级最高，漏排一个前缀 = 该真实 route 永远到不了（被转进垫片
    // 白名单外、静默 404），新增真实 API route 时必须同步加进这里。
    // API 响应禁止 CDN 缓存：EdgeOne CDN 会缓存 404 等 HTML 错误页（实测部署切换
    // 瞬间 /api/explain 的 404 被缓存、eo-cache-status: Cache Hit，且**缓存键忽略
    // query string**，加随机参数也绕不开），导致部署后最长几分钟内该路径所有请求
    // 都吃到旧错误响应。
    //
    // ⚠️ 实测 opennext（EdgeOne Next.js 适配器）**忽略本配置**——线上 /api/me 30aaec9
    // 构建下响应仍无 cache-control。线上现状：EdgeOne 默认缓存 TTL 约 5 分钟自然过期，
    // 部署后短暂窗口内可能命中旧错误页（仅 GET；POST 不缓存）。要根治需在 EdgeOne
    // 控制台给 /api/*、/internal/* 配节点缓存规则（不缓存），middleware matcher 目前
    // 刻意排除 api|internal（next-intl 边界），不宜为加固去动它。
    // 本配置保留的原因：本地 next start（原生 Next）下生效，对自托管/其他平台有效。
    // ⚠️ 线上 EdgeOne / opennext 可能忽略本 headers() 配置（实测 Eo-Cdn-Cache-Control
    // 头由平台注入，覆盖应用层 Cache-Control）。本配置对本地 next start 和自托管有效，
    // 同时作为预期缓存策略的声明。线上若未生效，需在 EdgeOne 控制台配节点缓存规则。
    async headers() {
        return [
            // API / 内部端点：禁止一切缓存
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
                // 可能导致 500 内部错误。显式 rewrite 到 /security.txt 兜底。
                { source: "/.well-known/security.txt", destination: "/security.txt" },
                // opennext（EdgeOne Next.js 适配器）生成的 SSR 路由会覆盖边缘函数路由，
                // 导致 /api/*、/internal/* 请求被 SSR 函数劫持，functions/ 边缘函数无法
                // 执行。dev + 生产统一 rewrite 到 edge-dev 垫片，在 Node 侧运行同一份
                // functions/ 代码（KV 的平台限制见 functions/_lib/kv.js 头注）。
                { source: "/api/:path((?!auth/|skills/|ping(?:/|$)).*)", destination: "/edge-dev/api/:path*" },
                { source: "/internal/:path*", destination: "/edge-dev/internal/:path*" },
            ],
            afterFiles: [] as { source: string; destination: string }[],
        };
    },
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
