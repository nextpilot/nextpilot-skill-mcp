import type { Metadata } from "next";
import Link from "next/link";
import { Radar } from "lucide-react";
import "./globals.css";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.21.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export const metadata: Metadata = {
  title: "NextPilot UAV AI · 飞控 AI Skill 与 MCP 平台",
  description:
    "围绕感知 → 决策 → 控制 → 工具链的飞控 AI Skill 社区，内置 PX4 / ArduPilot 确定性日志分析服务。",
};

const NAV = [
  { href: "/skills", label: "Skill 库" },
  { href: "/analyze", label: "日志分析" },
  { href: "/skills?category=toolchain", label: "MCP 工具" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen font-sans">
        <header className="sticky top-0 z-40 border-b border-border/80 bg-[#0b0f17]/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Radar className="h-5 w-5 text-primary" />
              <span>
                NextPilot <span className="text-primary">UAV AI</span>
              </span>
            </Link>
            <nav className="flex items-center gap-5 text-sm text-muted">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="transition-colors hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="hover:text-white"
                aria-label="GitHub"
              >
                <GithubIcon className="h-5 w-5" />
              </a>
            </nav>
          </div>
        </header>

        <main className="pb-20">{children}</main>

        <footer className="border-t border-border/80 py-8 text-sm text-muted">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 sm:flex-row sm:items-center sm:justify-between">
            <p>NextPilot UAV AI · 让无人机更智能</p>
            <p className="text-xs">
              分析结果为辅助判读，不替代人工排查 · 平台永不直接致动真实载具
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
