import type { Metadata } from "next";
import {
    SITE_URL,
    SITE_NAME,
    SITE_DESCRIPTION,
    SITE_KEYWORDS,
    SITE_AUTHOR,
    GOOGLE_VERIFICATION,
    BING_VERIFICATION,
    BAIDU_VERIFICATION,
    BAIDU_STAT_ID,
} from "@/lib/site-config";
import { THIRD_PARTY_DOMAINS } from "@/lib/seo";
import "./globals.css";

/** title 里 `·` 后面那半句固定文案（品牌 slogan，不是后台可改项，改它要动代码） */
const TITLE_SUFFIX = "无人机 AI 技能、MCP服务与智能诊断平台";

/**
 * metadataBase 要的是绝对地址。域名来自环境变量（控制台手填，谁都会打错一个字符），
 * **构造失败会让整站 500**，所以这里必须兜住，坏值回落到 site-config。
 */
function safeUrl(value: string): URL {
    try {
        return new URL(value);
    } catch {
        return new URL(SITE_URL);
    }
}

function buildVerification(): Metadata["verification"] {
    const v: Metadata["verification"] = {};
    const other: Record<string, string> = {};
    if (GOOGLE_VERIFICATION) v.google = GOOGLE_VERIFICATION;
    if (BING_VERIFICATION) other["msvalidate.01"] = BING_VERIFICATION;
    if (BAIDU_VERIFICATION) other["baidu-site-verification"] = BAIDU_VERIFICATION;
    if (Object.keys(other).length > 0) v.other = other;
    return Object.keys(v).length > 0 ? v : undefined;
}

/**
 * 根 metadata —— **必须是静态常量，不能是 `generateMetadata()`**。
 *
 * ⚠️ 这是一条 Next.js 的硬规则，也是首页速度的关键：只要根 layout 导出了
 * `generateMetadata`（异步），**整棵路由树都会被判为动态渲染**，首页无法静态化，
 * 每次请求都要实时 SSR（线上实测 TTFB ~1.5s，且 CDN 无从缓存）。
 *
 * 历史：2026-09-27 的「后台站点设置」把它改成了 `generateMetadata()` 读 KV，
 * 首页随之从静态退化为动态（`cache-control: no-store`、`eo-cache-status: Cache Miss`）。
 * 2026-09-28 改回静态常量，首页恢复 `○ (Static)`。
 *
 * 代价（有意取舍）：站点名/描述/域名改完需**重新部署**才生效——它们来自环境变量
 * （`next.config.ts` 的 siteEnv + `NEXT_PUBLIC_*`），不再由后台即时改。
 * 换回来的是首页从「每次 SSR ~1.5s」变成「CDN 直出几十毫秒」。
 */
export const metadata: Metadata = {
    metadataBase: safeUrl(SITE_URL),
    title: {
        template: `%s · ${SITE_NAME}`,
        default: `${SITE_NAME} · ${TITLE_SUFFIX}`,
    },
    description: SITE_DESCRIPTION,
    keywords: SITE_KEYWORDS,
    authors: [{ name: SITE_AUTHOR }],
    alternates: {
        languages: {
            "zh-CN": "/zh",
            en: "/en",
        },
    },
    openGraph: {
        title: `${SITE_NAME} · ${TITLE_SUFFIX}`,
        description: SITE_DESCRIPTION,
        siteName: SITE_NAME,
        locale: "zh_CN",
        type: "website",
        images: [
            {
                url: "/opengraph-image",
                width: 1200,
                height: 630,
                alt: `${SITE_NAME} · ${TITLE_SUFFIX}`,
                type: "image/png",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: `${SITE_NAME} · ${TITLE_SUFFIX}`,
        description: SITE_DESCRIPTION,
        images: [{ url: "/opengraph-image", alt: `${SITE_NAME} · ${TITLE_SUFFIX}` }],
    },
    robots: {
        index: true,
        follow: true,
    },
    referrer: "origin-when-cross-origin",
    creator: SITE_AUTHOR,
    publisher: SITE_AUTHOR,
    verification: buildVerification(),
    other: {
        "DC.title": `${SITE_NAME} · ${TITLE_SUFFIX}`,
        "DC.description": SITE_DESCRIPTION,
        "DC.publisher": SITE_AUTHOR,
        "DC.language": "zh_CN",
        "DC.coverage": "China",
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="zh-CN" data-theme="light" data-scroll-behavior="smooth">
            <head>
                {THIRD_PARTY_DOMAINS.map((domain) => {
                    const origin = new URL(domain).origin;
                    return <link key={origin} rel="dns-prefetch" href={origin} crossOrigin="anonymous" />;
                })}
                {THIRD_PARTY_DOMAINS.map((domain) => {
                    const origin = new URL(domain).origin;
                    return <link key={`preconnect-${origin}`} rel="preconnect" href={origin} crossOrigin="anonymous" />;
                })}
                {BAIDU_STAT_ID && (
                    <script
                        dangerouslySetInnerHTML={{
                            __html: `var _hmt=_hmt||[];(function(){var hm=document.createElement("script");hm.src="https://hm.baidu.com/hm.js?${BAIDU_STAT_ID}";var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(hm,s);})();`,
                        }}
                    />
                )}
            </head>
            <body className="min-h-screen font-sans">{children}</body>
        </html>
    );
}
