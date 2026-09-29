"use client";

import { useEffect, useState, useCallback } from "react";
import { Link, usePathname } from "@/i18n/routing";
import { Code2, Languages, Menu, Radar, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { useLanguage } from "@/components/LanguageProvider";

export function SiteHeader() {
    const { language, setLanguage, t } = useLanguage();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    const switchLanguage = useCallback(() => {
        const nextLang = language === "zh" ? "en" : "zh";
        setLanguage(nextLang);
        document.cookie = `NEXT_LOCALE=${nextLang};path=/;max-age=31536000;SameSite=Lax`;
        window.location.href = `/${nextLang}${pathname}`;
    }, [language, pathname, setLanguage]);

    // 路由变化后自动收起移动端菜单
    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    // MCP 服务是与 Skill 并列的一类内容，不再作为 Skill 技能库的子分类跳转
    const links = [
        // 图标本身是回首页的链接，但它不够显眼，菜单里再给一条明路
        { href: "/", label: t("首页", "Home") },
        { href: "/log", label: t("日志分析", "Log analysis") },
        { href: "/skills", label: t("Skill 技能", "Skill library") },
        { href: "/mcp", label: t("MCP 服务", "MCP servers") },
        { href: "/guide", label: t("使用指南", "Guide") },
    ];

    return (
        <header className="site-header sticky top-0 z-40 border-b border-border">
            <div className="page-shell flex h-16 items-center justify-between gap-3">
                <Link
                    href="/"
                    className="flex min-w-0 shrink items-center gap-2 text-[15px] font-semibold sm:text-[17px]"
                >
                    <Radar className="h-5 w-5 shrink-0 text-primary" />
                    <span className="truncate">
                        NextPilot <span className="text-primary">Skill</span>
                    </span>
                </Link>

                {/* 桌面端导航 */}
                <nav className="hidden items-center gap-0.5 text-base text-muted md:flex">
                    {links.map((l) => (
                        <Link
                            key={l.href}
                            href={l.href}
                            className="inline-flex items-center rounded-lg px-3 py-1.5 transition-colors hover:bg-surface-2 hover:text-text"
                        >
                            {l.label}
                        </Link>
                    ))}
                    {/* 分隔：浏览入口 | 显示设置 | 账号，三组互不混淆 */}
                    <span className="mx-3 h-5 w-px bg-border" aria-hidden />
                    {/* 语言与主题是两个独立控件，留 gap 而不是贴成连体胶囊 */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={switchLanguage}
                            className="language-toggle"
                            aria-label={t("切换到英文", "Switch to Chinese")}
                            title={t("English", "中文")}
                        >
                            <Languages className="h-[18px] w-[18px]" />
                            <span>{language === "zh" ? "EN" : "中"}</span>
                        </button>
                        <ThemeToggle />
                    </div>
                    <span className="mx-3 h-5 w-px bg-border" aria-hidden />
                    <UserMenu />
                </nav>

                {/* 移动端：只留登录与菜单入口（主题/语言/源码都收进展开面板） */}
                <div className="flex shrink-0 items-center gap-1 md:hidden">
                    <UserMenu />
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={open}
                        aria-controls="mobile-nav"
                        aria-label={open ? "关闭菜单" : "打开菜单"}
                        className="icon-link"
                    >
                        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                </div>
            </div>

            {/* 移动端展开面板 */}
            {open && (
                <nav id="mobile-nav" className="border-t border-border bg-surface md:hidden" aria-label="主导航">
                    <ul className="page-shell py-2">
                        {links.map((l) => {
                            // "/" 要精确匹配：否则 startsWith("/") 恒真，首页会一直高亮
                            const active =
                                l.href === "/"
                                    ? pathname === "/"
                                    : pathname === l.href || pathname.startsWith(`${l.href}/`);
                            return (
                                <li key={l.href} className="border-b border-border/60 last:border-0">
                                    <Link
                                        href={l.href}
                                        className={`block py-3 text-[15px] ${
                                            active ? "font-medium text-primary" : "text-text"
                                        }`}
                                    >
                                        {l.label}
                                    </Link>
                                </li>
                            );
                        })}
                        <li className="flex items-center justify-between py-3 text-sm text-muted">
                            <span>{t("外观", "Appearance")}</span>
                            <ThemeToggle />
                        </li>
                        <li className="flex items-center justify-between py-3 text-sm text-muted">
                            <span>{t("语言", "Language")}</span>
                            <button
                                type="button"
                                onClick={switchLanguage}
                                className="language-toggle"
                                aria-label={t("切换到英文", "Switch to Chinese")}
                            >
                                <Languages className="h-[18px] w-[18px]" />
                                <span>{language === "zh" ? "EN" : "中"}</span>
                            </button>
                        </li>
                        <li className="flex items-center justify-between py-3 text-sm text-muted">
                            <span>{t("源代码", "Source")}</span>
                            <a
                                href="https://gitee.com/nextpilot/nextpilot-skill-mcp"
                                target="_blank"
                                rel="noreferrer"
                                className="icon-link"
                                aria-label="源代码仓库（Gitee）"
                            >
                                <Code2 className="h-5 w-5" />
                            </a>
                        </li>
                    </ul>
                </nav>
            )}
        </header>
    );
}

// 页脚原先也写在这个文件里（`SiteHeader.tsx` 导出 `SiteFooter`），文件名说的是 Header，
// 读的人在 components/ 里找不到页脚在哪。2026-09-21 拆到 `components/SiteFooter.tsx`。
