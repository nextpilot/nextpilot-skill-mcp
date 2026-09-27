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
//   ping / kv-probe / issue-probe / blob = 探针已统一迁移到 /api/ 前缀，根级路径不再可用
//   edge-dev   = 开发环境垫片自身，rewrite 进来后再被加一次前缀就永远命中不了
export const config = {
    matcher: ["/((?!api|internal|ping|kv-probe|issue-probe|blob|_next|_vercel|edge-dev).*)"],
};
