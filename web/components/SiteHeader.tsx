"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Code2, Languages, Menu, Radar, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { useLanguage } from "@/components/LanguageProvider";

export function SiteHeader() {
  const { language, setLanguage, t } = useLanguage();
  const nextLanguage = language === "zh" ? "en" : "zh";
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // 路由变化后自动收起移动端菜单
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // MCP Server 是与 Skill 并列的一类内容，不再作为 Skill 库的子分类跳转
  const links = [
    { href: "/analyze", label: t("日志分析", "Log analysis") },
    { href: "/skills", label: t("Skill 库", "Skill library") },
    { href: "/mcp", label: t("MCP Server", "MCP servers") },
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
            NextPilot <span className="text-primary">Skill MCP</span>
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
              onClick={() => setLanguage(nextLanguage)}
              className="language-toggle"
              aria-label={t("切换到英文", "Switch to Chinese")}
              title={t("English", "中文")}
            >
              <Languages className="h-[18px] w-[18px]" />
              <span>{nextLanguage === "en" ? "EN" : "中"}</span>
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
        <nav
          id="mobile-nav"
          className="border-t border-border bg-surface md:hidden"
          aria-label="主导航"
        >
          <ul className="page-shell py-2">
            {links.map((l) => {
              const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
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
                onClick={() => setLanguage(nextLanguage)}
                className="language-toggle"
                aria-label={t("切换到英文", "Switch to Chinese")}
              >
                <Languages className="h-[18px] w-[18px]" />
                <span>{nextLanguage === "en" ? "EN" : "中"}</span>
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

export function SiteFooter() {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-border/80 py-8 text-sm text-muted">
      <div className="page-shell flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>NextPilot Skill MCP · {t("让无人机更智能", "Making aircraft smarter")}</p>
        <p className="text-xs">
          {t("分析结果为辅助判读，不替代人工排查 · 平台永不直接致动真实载具", "Analysis supports, but does not replace, human review · No direct actuation")}
        </p>
      </div>
    </footer>
  );
}
