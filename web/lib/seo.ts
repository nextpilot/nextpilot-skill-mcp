import type { Metadata } from "next";
import {
    SITE_URL,
    SITE_NAME,
    SITE_SHORT,
    SITE_DESCRIPTION,
    OG_IMAGE,
    SOCIAL_GITHUB,
    SOCIAL_GITEE,
    SOCIAL_TWITTER,
} from "@/lib/site-config";

// 为兼容旧引用保留导出（其他文件 `import { SITE_URL } from "@/lib/seo"` 仍可用）
export { SITE_URL, SITE_NAME, SITE_SHORT, SITE_DESCRIPTION, OG_IMAGE };

/** @deprecated 请使用 `SITE_DESCRIPTION`（来自 @/lib/site-config） */
export const DEFAULT_DESCRIPTION = SITE_DESCRIPTION;

/** @deprecated 请使用 `OG_IMAGE`（来自 @/lib/site-config） */
export const DEFAULT_OG_IMAGE = OG_IMAGE;

/* ========== 元数据工厂 ========== */

export interface PageMeta {
    /** 浏览器标题栏文本（不含站点后缀，后缀由 template 统一加） */
    title: string;
    /** 页面描述（OG / Twitter / 搜索摘要共用） */
    description: string;
    /** 当前页面路径部分（不含 locale 前缀，不含域名） */
    path?: string;
    /** 当前 locale（用于构建 canonical URL），未传则 canonical 指向站点根 */
    locale?: string;
    /** 社交分享图（覆盖 DEFAULT_OG_IMAGE） */
    ogImage?: string;
    /** 是否禁止索引（临时页、用户生成内容页） */
    noIndex?: boolean;
    /** 页面类型（默认 "website"） */
    ogType?: "website" | "article";
    /** 发布时间（article 类型用） */
    publishedTime?: string;
    /** 修改时间（article 类型用） */
    modifiedTime?: string;
}

/**
 * 为任一页面生成标准化 Metadata。
 *
 * 用法：
 *   export const metadata = makeMetadata({ title: "分析日志", description: "..." });
 *   或
 *   export async function generateMetadata() { return makeMetadata({ ... }); }
 */
export function makePageMeta({
    title,
    description,
    path = "",
    locale,
    ogImage,
    noIndex = false,
    ogType = "website",
    publishedTime,
    modifiedTime,
}: PageMeta): Metadata {
    const canonicalPath = locale ? `/${locale}${path}` : path || "/";
    const canonicalUrl = `${SITE_URL}${canonicalPath}`;
    const ogUrl = path ? `${SITE_URL}${path}` : SITE_URL;
    const image = ogImage
        ? ogImage.startsWith("http")
            ? ogImage
            : `${SITE_URL}${ogImage}`
        : `${SITE_URL}${DEFAULT_OG_IMAGE}`;

    return {
        title,
        description,
        alternates: {
            canonical: canonicalUrl,
            ...(locale
                ? {
                      languages: {
                          "zh-CN": `${SITE_URL}/zh${path}`,
                          en: `${SITE_URL}/en${path}`,
                      },
                  }
                : {}),
        },
        openGraph: {
            title: `${title} · ${SITE_SHORT}`,
            description,
            url: ogUrl,
            siteName: SITE_NAME,
            images: [{ url: image, width: 1200, height: 630, alt: title }],
            type: ogType,
            ...(publishedTime ? { publishedTime } : {}),
            ...(modifiedTime ? { modifiedTime } : {}),
            locale: "zh_CN",
        },
        twitter: {
            card: "summary_large_image",
            title: `${title} · ${SITE_SHORT}`,
            description,
            images: [image],
        },
        robots: noIndex ? { index: false, follow: false } : undefined,
    };
}

/* ========== JSON-LD 结构化数据 ========== */

/** 站点级结构化数据（Organization + WebSite） */
export function siteJsonLd(): object {
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                name: SITE_NAME,
                url: SITE_URL,
                logo: `${SITE_URL}/icon.svg`,
                sameAs: [SOCIAL_GITHUB, SOCIAL_GITEE, SOCIAL_TWITTER].filter(Boolean),
            },
            {
                "@type": "WebSite",
                name: SITE_NAME,
                url: SITE_URL,
                description: DEFAULT_DESCRIPTION,
                inLanguage: ["zh-CN", "en"],
                potentialAction: {
                    "@type": "SearchAction",
                    target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/skills?q={search_term_string}` },
                    "query-input": "required name=search_term_string",
                },
            },
        ],
    };
}

/** 文章 / 指南页面结构化数据 */
export function articleJsonLd(params: {
    url: string;
    title: string;
    description: string;
    datePublished?: string;
    dateModified?: string;
}): object {
    return {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: params.title,
        description: params.description,
        url: params.url,
        ...(params.datePublished ? { datePublished: params.datePublished } : {}),
        ...(params.dateModified ? { dateModified: params.dateModified } : {}),
        author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
        publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    };
}

/** Skill / MCP 软件应用结构化数据 */
export function softwareAppJsonLd(params: {
    url: string;
    name: string;
    description: string;
    version?: string;
    dateModified?: string;
}): object {
    return {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: params.name,
        description: params.description,
        url: params.url,
        applicationCategory: "AIApplication",
        operatingSystem: "ALL",
        ...(params.version ? { softwareVersion: params.version } : {}),
        ...(params.dateModified ? { dateModified: params.dateModified } : {}),
        offers: { "@type": "Offer", price: "0", priceCurrency: "CNY" },
    };
}

/** BreadcrumbList 结构化数据 */
export function breadcrumbJsonLd(items: { name: string; url: string }[]): object {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: item.name,
            item: item.url,
        })),
    };
}

/** FAQ 条目 */
export interface FaqItem {
    question: string;
    answer: string;
}

/**
 * 从 MDX body 中提取 FAQ Q&A 对。
 * 匹配模式：### 标题（问题）→ 后续到下一个 ### 或 ## 之前为答案。
 */
export function extractFaqItems(body: string): FaqItem[] {
    const items: FaqItem[] = [];
    // 按 ### 切割，但保留分隔符
    const sections = body.split(/(?=^### )/m);
    for (const section of sections) {
        const match = section.match(/^###\s+(.+)/m);
        if (!match) continue;
        const question = match[1].trim();
        // 提取答案文本：去掉 ### 行，去掉 <Zh>/<En> 等标签作为纯文本
        const answer = section
            .replace(/^###\s+.+/m, "")
            .replace(/<\/?Zh>|<\/?En>/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        if (answer) {
            items.push({ question, answer: answer.slice(0, 500) });
        }
    }
    return items;
}

/** FAQPage 结构化数据 */
export function faqPageJsonLd(items: FaqItem[]): object {
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
                "@type": "Answer",
                text: item.answer,
            },
        })),
    };
}
