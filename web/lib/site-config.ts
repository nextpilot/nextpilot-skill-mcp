/**
 * 站点配置 — 所有值通过环境变量覆盖，不写死在代码中。
 *
 * 线上部署时在 EdgeOne 控制台 → 项目 → 环境变量中配置；
 * 本地开发时在 .env 中配置（未配置时使用下方默认值）。
 */

/** 站点完整域名（不含末尾斜杠） */
export const SITE_URL = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** 站点名称（全局品牌名） */
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "NextPilot Skill";

/** 站点简称（title 中 `·` 分隔用） */
export const SITE_SHORT = process.env.NEXT_PUBLIC_SITE_SHORT || "NextPilot";

/** 站点默认描述（SEO / 社交分享摘要兜底） */
export const SITE_DESCRIPTION =
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION ||
    "围绕感知 → 决策 → 控制 → 工具链的飞控 AI Skill 和 MCP 社区，内置 PX4 / ArduPilot 确定性日志分析服务。";

/** 默认社交分享图（由 app/opengraph-image.tsx 的 ImageResponse 动态生成） */
export const OG_IMAGE = process.env.NEXT_PUBLIC_OG_IMAGE || "/opengraph-image";

export const GOOGLE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || "";
export const BING_VERIFICATION = process.env.NEXT_PUBLIC_BING_VERIFICATION || "";
export const BAIDU_VERIFICATION = process.env.NEXT_PUBLIC_BAIDU_VERIFICATION || "";

/** 站点关键词（逗号分隔） */
export const SITE_KEYWORDS =
    process.env.NEXT_PUBLIC_SITE_KEYWORDS ||
    "飞控,flight control,AI skill,MCP,PX4,ArduPilot,日志分析,log analysis,无人机,UAV,NextPilot";

/** 站点作者 / 发布者 */
export const SITE_AUTHOR = process.env.NEXT_PUBLIC_SITE_AUTHOR || "NextPilot";

/** Twitter/X 账号（不含 @，用于 twitter:site / twitter:creator） */
export const TWITTER_HANDLE = process.env.NEXT_PUBLIC_TWITTER_HANDLE || "";

/** 百度统计 ID */
export const BAIDU_STAT_ID = process.env.NEXT_PUBLIC_BAIDU_STAT_ID || "";

export const SOCIAL_GITHUB =
    process.env.NEXT_PUBLIC_SOCIAL_GITHUB || "https://github.com/nextpilot/nextpilot-skill-mcp";
export const SOCIAL_GITEE = process.env.NEXT_PUBLIC_SOCIAL_GITEE || "https://gitee.com/nextpilot/nextpilot-skill-mcp";
export const SOCIAL_TWITTER = process.env.NEXT_PUBLIC_SOCIAL_TWITTER || "";
