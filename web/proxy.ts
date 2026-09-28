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

// 注意：这里**没有**针对具体路径（如 /ping、/kv-probe）的特例分支，也不该有。
//
// 路由只有两类，各归各的层，不维护任何"白名单"：
//   · `/api/*`、`/internal/*` —— 由 matcher 负向排除，直接进各自的函数/垫片层。
//     「有就有，没有就没有」：端点存在则执行，不存在返回 404，与 middleware 无关。
//   · 其余一切 —— 页码路径（`/[locale]/*`）或未定义路径，统一交给 next-intl：
//     命中页面则渲染，未定义则走站点 404。
//
// 曾经的坑（2026-09-28）：matcher 负向排除里写了 `ping|kv-probe|issue-probe|blob`，
// 导致这些根级路径**不进 middleware**。它们既不是 `/api/*`、也不是页面，穿透后被
// 根路由接住，渲染出了 **200 首页 HTML**——浏览器看到"一个正常的站点"，排查时只会
// 以为探针"返回值不对"，绝不会想到"这个路径根本不该存在"。
//
// 修法就是**不加特例**：只要不被 matcher 排除，next-intl 会把这类路径统一判为 404
// （`/abc`、`/foobar`、`/kv-probe`、`/ping` 本地实测结果完全一致）。**新增任何根级
// 路径都不需要再改这里** —— 要做的只是别把它加进 matcher 的负向排除里。
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
// ⚠️ **除上述前缀外，什么都不要往这里加。** 任何被排除的路径都会绕过 middleware：
// 它若既非 `/api/*`、又不是真实页面，就会被根路由接住、渲染成 **200 首页 HTML**
// （2026-09-28 线上实测：曾把 ping|kv-probe|issue-probe|blob 排除在此，四条路径全
// 返回首页）。让所有非 API 路径都进 middleware、由 next-intl 统一判 404，才是正解。
export const config = {
    matcher: ["/((?!api|internal|_next|_vercel|edge-dev).*)"],
};
