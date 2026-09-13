"use client";

import Link from "next/link";
import { Languages, Radar } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLanguage } from "@/components/LanguageProvider";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.72-1.54-.2-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.21.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export function SiteHeader() {
  const { language, setLanguage, t } = useLanguage();
  const nextLanguage = language === "zh" ? "en" : "zh";

  return (
    <header className="site-header sticky top-0 z-40 border-b border-border/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Radar className="h-5 w-5 text-primary" />
          <span>NextPilot <span className="text-primary">Skill MCP</span></span>
        </Link>
        <nav className="flex items-center gap-3 text-sm text-muted sm:gap-5">
          <Link href="/analyze" className="transition-colors hover:text-text">{t("日志分析", "Log analysis")}</Link>
          <Link href="/skills" className="transition-colors hover:text-text">{t("Skill 库", "Skill library")}</Link>
          <Link href="/skills?category=toolchain" className="hidden transition-colors hover:text-text sm:inline">{t("MCP 工具", "MCP tools")}</Link>
          <Link href="/guide" className="transition-colors hover:text-text">{t("帮助文档", "Help")}</Link>
          <button
            type="button"
            onClick={() => setLanguage(nextLanguage)}
            className="language-toggle"
            aria-label={t("切换到英文", "Switch to Chinese")}
            title={t("English", "中文")}
          >
            <Languages className="h-4 w-4" />
            <span>{nextLanguage === "en" ? "EN" : "中"}</span>
          </button>
          <ThemeToggle />
          <a href="https://github.com" target="_blank" rel="noreferrer" className="icon-link" aria-label="GitHub">
            <GithubIcon className="h-5 w-5" />
          </a>
        </nav>
      </div>
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
