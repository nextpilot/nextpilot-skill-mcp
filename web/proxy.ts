import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Next.js 约定路由：只在根路径有效，不应走 locale 前缀
const ROOT_ONLY = ["sitemap.xml", "robots.txt", "manifest.webmanifest"];

function isRootNextRoute(pathname: string) {
    return ROOT_ONLY.some((r) => pathname === `/${r}`) || pathname === "/opengraph-image";
}

export default function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

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

export const config = {
    matcher: ["/((?!api|_next|_vercel|edge-dev).*)"],
};
