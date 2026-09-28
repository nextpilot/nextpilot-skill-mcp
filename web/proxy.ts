import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Next.js 约定路由：只在根路径有效，不应走 locale 前缀
const ROOT_ONLY = ["sitemap.xml", "robots.txt", "manifest.webmanifest"];

// EdgeOne Pages 对 /.well-known/ 路径有独立路由层，Next.js 的 beforeFiles rewrite
// 在 serverless 环境不生效。必须在中件间层直接把请求 rewrite 到 /security.txt。
const REWRITE_MAP: Record<string, string> = {
    "/.well-known/security.txt": "/security.txt",
};

// 根级探针是**历史路径**：探针已统一迁到 /api/ 前缀（`/api/kv-probe` 等）。
//
// 不能只把根级路径留给 Next.js 兜底 —— 实测（2026-09-28 线上）会得到 **200 首页
// HTML**：这些路径既没进 middleware（曾被 matcher 负向排除），又没有对应的真实
// route，最终被 `app/[locale]/` 段接住、按默认 locale 渲染了首页。表现极具误导性：
// 浏览器看到的是"正常的站点"，而不是一个明确的 404，运维会以为探针"返回值不对"，
// 而不是"路径根本没通"。
//
// 处理成 307 跳转到等价的 /api/ 路径：既保住运维手册里"GET /kv-probe 验 KV 绑定"
// 的既有用法（docs/develop/operations/README.md），又不会返回一片没有信息量的首页。
// 307 保留原方法（探针有 GET，少数自检有 POST，如 /issue-probe?write=1）。
const ROOT_PROBE_REDIRECTS: Record<string, string> = {
    "/ping": "/api/ping",
    "/kv-probe": "/api/kv-probe",
    "/issue-probe": "/api/issue-probe",
    "/blob": "/api/blob",
};

function isRootNextRoute(pathname: string) {
    return ROOT_ONLY.some((r) => pathname === `/${r}`) || pathname === "/opengraph-image";
}

export default function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // /.well-known/* 等路径在 EdgeOne Pages 上被平台路由层拦截，
    // Next.js 的 beforeFiles rewrite 不生效。在中件间层直接 rewrite。
    const rewriteTarget = REWRITE_MAP[pathname];
    if (rewriteTarget) {
        return NextResponse.rewrite(new URL(rewriteTarget, req.url));
    }

    // 根级探针 → 等价 /api/ 端点（见 ROOT_PROBE_REDIRECTS 说明）。
    // 只认精确路径，query 原样带过去（?write=1 / ?prefix= 这类探针参数要保留）。
    const probeTarget = ROOT_PROBE_REDIRECTS[pathname];
    if (probeTarget) {
        const url = new URL(probeTarget, req.url);
        url.search = req.nextUrl.search;
        return NextResponse.redirect(url, 307);
    }

    // /en/sitemap.xml → 301 到 /sitemap.xml
    // （搜索引擎偶尔会尝试带 locale 前缀抓取这些文件）
    for (const r of ROOT_ONLY) {
        if (pathname.endsWith(`/${r}`) && pathname !== `/${r}`) {
            return NextResponse.redirect(new URL(`/${r}`, req.url));
        }
    }

    // 根级静态路由，放行让 Next.js 处理
    if (isRootNextRoute(pathname)) {
        return NextResponse.next();
    }

    // 包含 . 的随机路径（如 /2222roghbots.txtggwwe），放行让 [locale] layout
    // 的 notFound() 校验返回 404，避免被 [locale] 段误吞
    if (pathname.includes(".")) {
        return NextResponse.next();
    }

    return intlMiddleware(req);
}

// 排除项各有来历，少排除任何一个的表现都是"本地静默 404"——被 next-intl 加上 locale
// 前缀后请求再也命中不到目标：
//   api        = NextAuth 与 Node 侧 route，不带 locale
//   internal   = 边缘函数中转（Node 侧 SSR 读 KV 的唯一通道）。漏它时拿到的是 **HTML 404**
//                （Next 的 404 页面），和"垫片白名单没登记"那种纯文本 404 长得不一样，
//                足以把排查方向带偏到"函数没写对"上去
//   edge-dev   = 开发环境垫片自身，rewrite 进来后再被加一次前缀就永远命中不了
//
// ⚠️ ping / kv-probe / issue-probe / blob **不能**再排除：它们曾是根级探针，现在虽
// 已迁到 /api/ 前缀，但根级路径仍需在这里被显式 307 到 /api/ 端点（见 ROOT_PROBE_REDIRECTS）。
// 一旦把它们排除在 matcher 之外，middleware 根本不执行，请求就会穿透到 [locale] 段
// 渲染出**首页 HTML**（2026-09-28 线上实测），比 404 还难发现。
export const config = {
    matcher: ["/((?!api|internal|_next|_vercel|edge-dev).*)"],
};
