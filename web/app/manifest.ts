import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_SHORT } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: SITE_NAME,
        short_name: SITE_SHORT,
        description: "围绕感知 → 决策 → 控制 → 工具链的飞控 AI Skill 和 MCP 社区",
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
    };
}
