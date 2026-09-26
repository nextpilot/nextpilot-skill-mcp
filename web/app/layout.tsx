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

const defaultTitle = `${SITE_NAME} · 专为飞行控制优化的 AI Skill 与 MCP 平台`;

function buildVerification(): Metadata["verification"] {
    const v: Metadata["verification"] = {};
    const other: Record<string, string> = {};
    if (GOOGLE_VERIFICATION) v.google = GOOGLE_VERIFICATION;
    if (BING_VERIFICATION) other["msvalidate.01"] = BING_VERIFICATION;
    if (BAIDU_VERIFICATION) other["baidu-site-verification"] = BAIDU_VERIFICATION;
    if (Object.keys(other).length > 0) v.other = other;
    return Object.keys(v).length > 0 ? v : undefined;
}

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        template: `%s · ${SITE_NAME}`,
        default: defaultTitle,
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
        title: defaultTitle,
        description: SITE_DESCRIPTION,
        siteName: SITE_NAME,
        locale: "zh_CN",
        type: "website",
        images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: defaultTitle, type: "image/png" }],
    },
    twitter: {
        card: "summary_large_image",
        title: defaultTitle,
        description: SITE_DESCRIPTION,
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
