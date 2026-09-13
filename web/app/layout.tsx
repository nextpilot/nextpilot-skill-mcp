import type { Metadata } from "next";
import { LanguageProvider } from "@/components/LanguageProvider";
import { SessionProvider } from "@/components/SessionProvider";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "NextPilot Skill MCP · 飞控 AI Skill 与 MCP 平台",
  description:
    "围绕感知 → 决策 → 控制 → 工具链的飞控 AI Skill 社区，内置 PX4 / ArduPilot 确定性日志分析服务。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-theme="light">
      <body className="min-h-screen font-sans">
        <LanguageProvider>
          <SessionProvider>
            <SiteHeader />
            <main className="pb-20">{children}</main>
            <SiteFooter />
          </SessionProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
