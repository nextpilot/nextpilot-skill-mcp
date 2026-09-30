import type { Metadata } from "next";
import {
    SITE_URL,
    SITE_NAME,
    SITE_SHORT,
    SITE_DESCRIPTION,
    OG_IMAGE,
    SITE_KEYWORDS,
    SITE_AUTHOR,
    TWITTER_HANDLE,
    SOCIAL_GITHUB,
    SOCIAL_GITEE,
    SOCIAL_TWITTER,
} from "@/lib/site-config";

// 为兼容旧引用保留导出（其他文件 `import { SITE_URL } from "@/lib/seo"` 仍可用）。
export { SITE_URL, SITE_NAME, SITE_SHORT, SITE_DESCRIPTION, OG_IMAGE, SITE_KEYWORDS, SITE_AUTHOR, TWITTER_HANDLE };

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
    /** 页面关键词（逗号分隔；undefined 时使用站点默认） */
    keywords?: string;
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
    /** 文章分类 / 标签（article 类型用） */
    articleSection?: string;
    /** 文章标签（article 类型用） */
    articleTags?: string[];
    /** 页面作者（覆盖站点默认 SITE_AUTHOR） */
    author?: string;
}

/**
 * 为任一页面生成标准化 Metadata。用法：generateMetadata() { return makePageMeta({...}) }。
 * 刻意纯同步：域名/站名来自 site-config 的构建期常量。做成 async 读 KV 会让每个调用页变动态
 * 渲染、CDN 缓存失效，首页 TTFB +~1s；站点信息走改环境变量+重新部署，调用方可静态导出
 * `export const metadata = makePageMeta(...)`。详见 CLAUDE.md「首页静态化」。
 */
export function makePageMeta({
    title,
    description,
    keywords,
    path = "",
    locale,
    ogImage,
    noIndex = false,
    ogType = "website",
    publishedTime,
    modifiedTime,
    articleSection,
    articleTags,
    author,
}: PageMeta): Metadata {
    const canonicalPath = locale ? `/${locale}${path}` : path || "/";
    const canonicalUrl = `${SITE_URL}${canonicalPath}`;
    // og:url 必须与 canonical 同址。带 locale 的页面分享到社交平台时，抓取器按 og:url 回访；
    // 少一层 /en 就会让英文页被当成中文页收录，卡片也跟着串语言。
    const ogUrl = canonicalUrl;
    const image = ogImage
        ? ogImage.startsWith("http")
            ? ogImage
            : `${SITE_URL}${ogImage}`
        : `${SITE_URL}${DEFAULT_OG_IMAGE}`;
    const pageAuthor = author || SITE_AUTHOR;

    const meta: Metadata = {
        title,
        description,
        keywords: keywords || SITE_KEYWORDS,
        authors: [{ name: pageAuthor }],
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
            images: [
                {
                    url: image,
                    width: 1200,
                    height: 630,
                    alt: title,
                    type: "image/png",
                },
            ],
            type: ogType,
            locale: locale === "en" ? "en_US" : "zh_CN",
            ...(publishedTime ? { publishedTime } : {}),
            ...(modifiedTime ? { modifiedTime } : {}),
            ...(articleSection ? { section: articleSection } : {}),
            ...(articleTags?.length ? { tag: articleTags } : {}),
        },
        twitter: {
            card: "summary_large_image",
            title: `${title} · ${SITE_SHORT}`,
            description,
            images: [{ url: image, alt: title }],
            ...(TWITTER_HANDLE ? { site: `@${TWITTER_HANDLE}`, creator: `@${TWITTER_HANDLE}` } : {}),
        },
        robots: noIndex ? { index: false, follow: false } : undefined,
    };

    return meta;
}

/* ========== JSON-LD 结构化数据 ========== */

/** 站点级结构化数据（Organization + WebSite）。同步理由同 makePageMeta：域名来自构建期常量，首页可整页静态化 */
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
                description: SITE_DESCRIPTION,
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

/** 从 MDX body 提取 FAQ Q&A 对：### 标题为问题，到下一个 ### 或 ## 之前为答案 */
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

/** Product 结构化数据（一个统一的 JSON-LD，不需每页单独发） */
export function productJsonLd(): object {
    return {
        "@context": "https://schema.org",
        "@type": "Product",
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        url: SITE_URL,
        category: "AIApplication",
        manufacturer: { "@type": "Organization", name: SITE_AUTHOR },
    };
}

/* ========== Speakable 语音搜索标记 ========== */

/** Speakable 结构化数据（Google Assistant / Siri 语音搜索用），指定适合朗读的文本段，每页限 2-3 段 */
export function speakableJsonLd(xpathSections: string[]): object {
    return {
        "@context": "https://schema.org",
        "@type": "WebPage",
        speakable: {
            "@type": "SpeakableSpecification",
            xpath: xpathSections.map(() => `/html/head/title`).slice(0, 3),
        },
    };
}

/* ========== 资源提示（DNS prefetch / preconnect） ========== */

/** 需要 dns-prefetch / preconnect 的第三方域名 */
export const THIRD_PARTY_DOMAINS = ["https://hm.baidu.com", "https://api.nextpilot.org"].filter(Boolean);
