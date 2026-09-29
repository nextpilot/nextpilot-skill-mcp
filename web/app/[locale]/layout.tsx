import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { LanguageProvider } from "@/components/LanguageProvider";
import { SessionProvider } from "@/components/SessionProvider";
import { RuntimeCacheRegistrar } from "@/components/RuntimeCacheRegistrar";
import { IssueBridgeMount } from "@/components/IssueBridgeMount";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { routing } from "@/i18n/routing";
import { FOOTER_COPYRIGHT, FOOTER_TAGLINE, REPO_URL, ICP_NUMBER } from "@/lib/site-config";

export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
}

export const dynamicParams = false;

export default async function LocaleLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;

    // 这一行是首页静态化的开关，不是可选的样板。
    //
    // next-intl 默认从请求头（Accept-Language / x-middleware-* 等）取当前 locale；
    // 只要读了请求头，这一整棵子树就被 Next.js 判为动态渲染，`getMessages()` 也一样。
    // `setRequestLocale(locale)` 告诉 next-intl「locale 已知，别再读请求头」，页面即可
    // 在构建期预渲染。删掉它 → `/[locale]` 立刻退回 `ƒ (Dynamic)`（2026-09-28 实测）。
    //
    // 要与 `generateStaticParams` 成对出现：前者提供构建期的 locale 列表，
    // 这里把它登记为"本次渲染的 locale"。少任何一个静态化都不成立。
    setRequestLocale(locale);

    // 页脚四项直接取构建期常量（见 site-config.ts）。
    //
    // 这里不能再 await 运行期设置：那会经 `/internal/settings/get` 发起一次
    // "自己请求自己"的网络往返（DNS + TLS + 边缘函数 + KV），全额计入每个页面的 TTFB，
    // 且让整棵路由树无法静态化（2026-09-28 移除）。代价是页脚文案改完要重新部署。
    const messages = await getMessages();

    return (
        <NextIntlClientProvider messages={messages} locale={locale}>
            <LanguageProvider initialLanguage={locale as "zh" | "en"}>
                <RuntimeCacheRegistrar />
                <SessionProvider>
                    <IssueBridgeMount />
                    <SiteHeader />
                    <main className="pb-20">{children}</main>
                    <SiteFooter
                        footerCopyright={FOOTER_COPYRIGHT}
                        footerTagline={FOOTER_TAGLINE}
                        sourceUrl={REPO_URL}
                        icp={ICP_NUMBER}
                    />
                </SessionProvider>
            </LanguageProvider>
        </NextIntlClientProvider>
    );
}
