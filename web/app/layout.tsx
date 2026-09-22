import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "NextPilot Skill · 专为飞行控制优化的 AI Skill 与 MCP 平台",
    description:
        "围绕感知 → 决策 → 控制 → 工具链的飞控 AI Skill 和 MCP 社区，内置 PX4 / ArduPilot 确定性日志分析服务。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="zh-CN" data-theme="light" data-scroll-behavior="smooth">
            <body className="min-h-screen font-sans">{children}</body>
        </html>
    );
}
