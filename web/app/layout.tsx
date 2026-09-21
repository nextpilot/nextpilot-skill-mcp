import type { Metadata } from "next";
import { LanguageProvider } from "@/components/LanguageProvider";
import { SessionProvider } from "@/components/SessionProvider";
import { RuntimeCacheRegistrar } from "@/components/RuntimeCacheRegistrar";
import { IssueBridgeMount } from "@/components/IssueBridgeMount";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: "NextPilot Skill · 专为飞行控制优化的 AI Skill 与 MCP 平台",
  description:
    "围绕感知 → 决策 → 控制 → 工具链的飞控 AI Skill 和 MCP 社区，内置 PX4 / ArduPilot 确定性日志分析服务。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-theme="light" data-scroll-behavior="smooth">
      <body className="min-h-screen font-sans">
        {/* 让解析运行时只下载一次（见 public/sw.js） */}
        <RuntimeCacheRegistrar />
        <LanguageProvider>
          <SessionProvider>
            {/* 客户端错误兜底（未捕获异常 / 未处理的 Promise 拒绝）→ /api/issues */}
            <IssueBridgeMount />
            <SiteHeader />
            <main className="pb-20">{children}</main>
            <SiteFooter />
          </SessionProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
