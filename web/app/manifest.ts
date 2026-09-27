import type { MetadataRoute } from "next";
import { getSiteSettings } from "@/lib/site-settings";

// PWA 应用名取自运行期设置：后台改了站名，"添加到桌面"的图标名跟着变。
// （manifest 是构建期产物还是请求期生成取决于框架；这里按请求期取值，改完即生效。）
export default async function manifest(): Promise<MetadataRoute.Manifest> {
    const { siteName, siteShort, siteDescription } = await getSiteSettings();
    return {
        name: siteName,
        short_name: siteShort,
        description: siteDescription,
        start_url: "/zh",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#18794e",
        icons: [
            { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
            { src: "/apple-icon.png", type: "image/png", sizes: "180x180" },
        ],
        lang: "zh-CN",
        categories: ["developer", "aviation", "artificial intelligence"],
        shortcuts: [
            {
                name: "分析日志",
                short_name: "分析",
                description: "上传 PX4 / ArduPilot 日志进行分析",
                url: "/zh/analyze",
            },
            {
                name: "Skill 市场",
                short_name: "Skill",
                description: "浏览飞控 AI Skill 列表",
                url: "/zh/skills",
            },
            {
                name: "MCP 中心",
                short_name: "MCP",
                description: "浏览 MCP 服务列表",
                url: "/zh/mcp",
            },
        ],
    };
}
