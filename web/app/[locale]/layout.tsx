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
    // next-intl 默认从请求头取当前 locale，只要读了请求头，这一整棵子树就被 Next.js 判为
    // 动态渲染。`setRequestLocale(locale)` 告诉它「locale 已知，别再读请求头」，页面即可在
    // 构建期预渲染；删掉它 `/[locale]` 立刻退回 `ƒ (Dynamic)`。
    // 要与 `generateStaticParams` 成对出现：少任何一个静态化都不成立。
    setRequestLocale(locale);

    // 页脚四项直接取构建期常量（见 site-config.ts），不再 await 运行期设置：那会经
    // `/internal/settings/get` 发起一次"自己请求自己"的网络往返，全额计入每个页面的 TTFB，
    // 且让整棵路由树无法静态化。代价是页脚文案改完要重新部署。
    const messages = await getMessages();

    // lang 纠正脚本：根 layout 的 `<html lang="zh-CN">` 是框架强制的默认值——根 layout 拿不到
    // locale（拿它就得读请求头，整棵树退回动态渲染），而 Next 不允许子 layout 另起一个 <html>。
    // 所以只能在这里补：脚本随 HTML 解析即执行，早于 hydration，Googlebot / Bingbot 能读到。
    const langScript = `document.documentElement.lang=${JSON.stringify(locale === "en" ? "en" : "zh-CN")}`;

    return (
        <NextIntlClientProvider messages={messages} locale={locale}>
            <script dangerouslySetInnerHTML={{ __html: langScript }} />
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
