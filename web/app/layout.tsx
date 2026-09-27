import type { Metadata } from "next";
import {
    SITE_URL,
    SITE_KEYWORDS,
    SITE_AUTHOR,
    GOOGLE_VERIFICATION,
    BING_VERIFICATION,
    BAIDU_VERIFICATION,
    BAIDU_STAT_ID,
} from "@/lib/site-config";
import { THIRD_PARTY_DOMAINS } from "@/lib/seo";
import { getSiteSettings } from "@/lib/site-settings";
import "./globals.css";

/** title 里 `·` 后面那半句固定文案（品牌 slogan，不是后台可改项，改它要动代码） */
const TITLE_SUFFIX = "无人机 AI 技能、MCP服务与智能诊断平台";

/**
 * metadataBase 要的是绝对地址，而站点域名现在是后台可改的。
 * 后台那侧已经校验过 http(s) 且不带路径，但**兜底值也可能来自环境变量**（控制台手填，
 * 谁都会打错一个字符）——构造失败会让整站 500，所以这里必须兜住，坏值回落到 site-config。
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

export async function generateMetadata(): Promise<Metadata> {
    const settings = await getSiteSettings();
    const defaultTitle = `${settings.siteName} · ${TITLE_SUFFIX}`;

    return {
        metadataBase: safeUrl(settings.siteUrl),
        title: {
            template: `%s · ${settings.siteName}`,
            default: defaultTitle,
        },
        description: settings.siteDescription,
        keywords: SITE_KEYWORDS,
        authors: [{ name: SITE_AUTHOR }],
        alternates: {
            languages: {
                "zh-CN": "/zh",
                en: "/en",
            },
        },
        openGraph: {
            title: defaultTitle,
            description: settings.siteDescription,
            siteName: settings.siteName,
            locale: "zh_CN",
            type: "website",
            images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: defaultTitle, type: "image/png" }],
        },
        twitter: {
            card: "summary_large_image",
            title: defaultTitle,
            description: settings.siteDescription,
            images: [{ url: "/opengraph-image", alt: defaultTitle }],
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
            "DC.title": defaultTitle,
            "DC.description": settings.siteDescription,
            "DC.publisher": SITE_AUTHOR,
            "DC.language": "zh_CN",
            "DC.coverage": "China",
        },
    };
}

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
