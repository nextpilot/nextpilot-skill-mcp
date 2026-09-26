import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_SHORT, SITE_URL, SITE_DESCRIPTION } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: SITE_NAME,
        short_name: SITE_SHORT,
        description: SITE_DESCRIPTION,
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
