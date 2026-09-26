import type { Metadata } from "next";
import {
    SITE_URL,
    SITE_NAME,
    SITE_DESCRIPTION,
    GOOGLE_VERIFICATION,
    BING_VERIFICATION,
    BAIDU_VERIFICATION,
} from "@/lib/site-config";
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
    },
    twitter: {
        card: "summary_large_image",
        title: defaultTitle,
        description: SITE_DESCRIPTION,
    },
    robots: {
        index: true,
        follow: true,
    },
    referrer: "origin-when-cross-origin",
    creator: "NextPilot",
    publisher: "NextPilot",
    verification: buildVerification(),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="zh-CN" data-theme="light" data-scroll-behavior="smooth">
            <body className="min-h-screen font-sans">{children}</body>
        </html>
    );
}
