"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Languages, Menu, Radar, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { useLanguage } from "@/components/LanguageProvider";

// GitHub 官方标志路径（simple-icons，CC0）。不要手改：八爪鱼剪影的负空间在 18–20px
// 下只剩不到 1px，圆弧参数稍偏就会糊成一团。
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

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
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
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
          {/* 文字导航与工具控件分组，避免七个等权控件挤成一行 */}
          <span className="mx-2 h-5 w-px bg-border" aria-hidden />
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
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <UserMenu />
          <a
            href="https://gitee.com/nextpilot/nextpilot-skill-mcp"
            target="_blank"
            rel="noreferrer"
            className="icon-link ml-0.5"
            aria-label="源代码仓库"
            title="Gitee 仓库"
          >
            <GithubIcon className="h-5 w-5" />
          </a>
        </nav>

        {/* 移动端：仅保留主题、登录与菜单入口 */}
        <div className="flex shrink-0 items-center gap-1 md:hidden">
          <ThemeToggle />
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
          <ul className="mx-auto max-w-6xl px-4 py-2">
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
                aria-label="源代码仓库"
              >
                <GithubIcon className="h-5 w-5" />
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
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 sm:flex-row sm:items-center sm:justify-between">
        <p>NextPilot Skill MCP · {t("让无人机更智能", "Making aircraft smarter")}</p>
        <p className="text-xs">
          {t("分析结果为辅助判读，不替代人工排查 · 平台永不直接致动真实载具", "Analysis supports, but does not replace, human review · No direct actuation")}
        </p>
      </div>
    </footer>
  );
}
