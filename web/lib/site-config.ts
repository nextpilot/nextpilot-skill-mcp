/**
 * 站点配置 — 所有值通过环境变量覆盖，不写死在代码。
 * 线上在 EdgeOne 控制台配，本地在 .env 配，未配置时用下方默认值。
 */

/**
 * 站点完整域名（不含末尾斜杠）。生产兜底值是必须的：NEXT_PUBLIC_SITE_URL 只在 EdgeOne 控制台配了才有，
 * 漏配会静默落到 localhost——页面照常打开，但 sitemap/robots/canonical/og:url 里的域名全是 localhost，
 * 等于把一批死链提交给搜索引擎。兜底口径与 REPO_URL / SOCIAL_* 一致：域名换了要改代码，忘配变量不坏站。
 */
export const SITE_URL = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NODE_ENV === "production" ? "https://skill.nextpilot.org" : "http://localhost:3000")
).replace(/\/$/, "");

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

/* ── 页脚文案（后台 /admin/settings 可覆盖，这里是没配过的地板）──
 * 空串 = 不覆盖：页脚内置中英双语文案，后台存单值，填了 = 中英都用这一个值。 */
export const FOOTER_COPYRIGHT =
    process.env.NEXT_PUBLIC_FOOTER_COPYRIGHT || "NextPilot Skill · 让无人机更智能，让数据开口说话";

/** 页脚品牌介绍：留空表示沿用页脚内置的双语介绍 */
export const FOOTER_TAGLINE = process.env.NEXT_PUBLIC_FOOTER_TAGLINE || "";

/** 页脚"源代码"链接。名字用 REPO_URL 不用 GITEE_URL：字段填的实际可能是 GitHub，中性名避免名不副实与连带改名 */
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL || "https://gitee.com/nextpilot/nextpilot-skill-mcp";

/** 备案号：留空则页脚不显示这一行 */
export const ICP_NUMBER = process.env.NEXT_PUBLIC_ICP_NUMBER || "";

export const SOCIAL_GITHUB =
    process.env.NEXT_PUBLIC_SOCIAL_GITHUB || "https://github.com/nextpilot/nextpilot-skill-mcp";
export const SOCIAL_GITEE = process.env.NEXT_PUBLIC_SOCIAL_GITEE || "https://gitee.com/nextpilot/nextpilot-skill-mcp";
export const SOCIAL_TWITTER = process.env.NEXT_PUBLIC_SOCIAL_TWITTER || "";

/* ── Pyodide 运行时 & pyulog wheel 自托管路径（tools/dev/fetch_pyodide_assets.py 同步）── */

/** Pyodide 运行时索引目录（相对路径）。换版本或指向外部 Blob 时用环境变量覆盖。 */
export const PYODIDE_INDEX_PATH = process.env.NEXT_PUBLIC_PYODIDE_URL || "/pyodide/v0.27.7/full/";

/** pyulog 的 wheel 地址。给了自托管 wheel 直接装：跳过 PyPI 索引查询（每次联网且不受缓存保护）；
 *  换版本重跑 fetch_pyodide_assets.py 改文件名，路径变了 SW 缓存自动失效重下。 */
export const PYULOG_WHEEL_PATH =
    process.env.NEXT_PUBLIC_PYULOG_WHEEL || "/pyodide/wheels/pyulog-1.2.4-py3-none-any.whl";
