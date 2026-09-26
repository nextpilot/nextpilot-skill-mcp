import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { LanguageProvider } from "@/components/LanguageProvider";
import { SessionProvider } from "@/components/SessionProvider";
import { RuntimeCacheRegistrar } from "@/components/RuntimeCacheRegistrar";
import { IssueBridgeMount } from "@/components/IssueBridgeMount";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { routing } from "@/i18n/routing";

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

    const messages = await getMessages();

    return (
        <NextIntlClientProvider messages={messages} locale={locale}>
            <LanguageProvider initialLanguage={locale as "zh" | "en"}>
                <RuntimeCacheRegistrar />
                <SessionProvider>
                    <IssueBridgeMount />
                    <SiteHeader />
                    <main className="pb-20">{children}</main>
                    <SiteFooter />
                </SessionProvider>
            </LanguageProvider>
        </NextIntlClientProvider>
    );
}
