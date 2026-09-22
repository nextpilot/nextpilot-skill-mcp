"use client";

import { useLanguage } from "./LanguageProvider";

/**
 * MDX 正文里的双语块。两个都渲染在服务端，客户端按当前语言决定显示哪个，
 * 因此切换语言不需要重新请求页面。标签必须独占一行、前后留空行，
 * 否则 MDX 不会把块内的 markdown 当正文解析。
 */
export function Zh({ children }: { children: React.ReactNode }) {
    const { language } = useLanguage();
    return language === "zh" ? <>{children}</> : null;
}

export function En({ children }: { children: React.ReactNode }) {
    const { language } = useLanguage();
    return language === "en" ? <>{children}</> : null;
}
