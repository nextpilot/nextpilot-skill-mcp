import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { LanguageProvider } from "@/components/LanguageProvider";
import { SessionProvider } from "@/components/SessionProvider";
import { RuntimeCacheRegistrar } from "@/components/RuntimeCacheRegistrar";
import { IssueBridgeMount } from "@/components/IssueBridgeMount";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { routing } from "@/i18n/routing";
import { getSiteSettings } from "@/lib/site-settings";

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

    // 页脚文案是运行期可变的（后台 /admin/settings）。SiteFooter 是客户端组件，读不到
    // KV，只能在这里取值后传下去。getSiteSettings 有 60 秒模块缓存，不会每个页面一次请求。
    const [messages, settings] = await Promise.all([getMessages(), getSiteSettings()]);

    return (
        <NextIntlClientProvider messages={messages} locale={locale}>
            <LanguageProvider initialLanguage={locale as "zh" | "en"}>
                <RuntimeCacheRegistrar />
                <SessionProvider>
                    <IssueBridgeMount />
                    <SiteHeader />
                    <main className="pb-20">{children}</main>
                    <SiteFooter
                        footerCopyright={settings.footerCopyright}
                        footerTagline={settings.footerTagline}
                        sourceUrl={settings.sourceUrl}
                        icp={settings.icp}
                    />
                </SessionProvider>
            </LanguageProvider>
        </NextIntlClientProvider>
    );
}
