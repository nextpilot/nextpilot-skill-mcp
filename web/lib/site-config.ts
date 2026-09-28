/**
 * 站点配置 — 所有值通过环境变量覆盖，不写死在代码中。
 *
 * 线上部署时在 EdgeOne 控制台 → 项目 → 环境变量中配置；
 * 本地开发时在 .env 中配置（未配置时使用下方默认值）。
 */

/**
 * 站点完整域名（不含末尾斜杠）。
 *
 * ⚠️ 这里的**生产兜底值**不是可选的：`NEXT_PUBLIC_SITE_URL` 只在 EdgeOne 控制台配了才有值，
 * 一旦漏配，`SITE_URL` 就会落到 `localhost:3000`——而它是**唯一一个默认值 ≠ 线上值**的
 * 字段（站名/描述/页脚的默认值恰好就是想要的线上值，漏配也看不出来）。漏配的后果是
 * **静默的**：页面照常打开，只有 sitemap.xml、robots.txt、canonical、og:url、JSON-LD
 * 里的域名全变成 localhost —— 等于主动把一批死链提交给搜索引擎。
 *
 * 2026-09-28 真实发生：首页静态化（改读构建期常量）之前，sitemap 走 KV 取值恰好掩盖了
 * 这个漏配；改成读常量后隐患立刻暴露。所以这里加一层生产兜底，把「记得去控制台配」
 * 从**必要条件**降级为**可选优化**。
 *
 * 兜底口径与 `REPO_URL` / `SOCIAL_*` 一致：域名换了要改代码，但**不会因为忘配变量而坏站**。
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

/* ── 页脚文案（后台 /admin/settings 可覆盖；这里是"没配过"时的地板）────────────
 * 空串在这里的语义是"不覆盖"：页脚现在内置的是中英双语文案，后台存的是单值，
 * 留空 = 双语照旧，填了 = 中英都用这一个值（本期不做 i18n，方案第 9 节已声明）。 */
export const FOOTER_COPYRIGHT =
    process.env.NEXT_PUBLIC_FOOTER_COPYRIGHT || "NextPilot Skill · 让无人机更智能，让数据开口说话";

/** 页脚品牌介绍：留空表示沿用页脚内置的双语介绍 */
export const FOOTER_TAGLINE = process.env.NEXT_PUBLIC_FOOTER_TAGLINE || "";

/**
 * 页脚"源代码"链接。
 *
 * 名字用 REPO_URL 而不是 GITEE_URL：这个字段填的是**仓库地址**，而实际填进来的
 * 完全可能是 GitHub（SKILL.md 里就有 `https://github.com/robotto-xyz` 这种）。
 * 叫 gitee 会把一个中性字段变成"名不副实"，改托管平台时还得连带改名。
 */
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

/**
 * pyulog 的 wheel 地址（相对路径）。
 *
 * 给了自托管 wheel 就直接装这个文件：**跳过 PyPI 索引查询**（那一步每次都要联网、
 * 且不受缓存保护）。换版本时重跑 fetch_pyodide_assets.py，改这里的文件名即可。
 * 路径变了 SW 缓存会自动失效重下。
 */
export const PYULOG_WHEEL_PATH =
    process.env.NEXT_PUBLIC_PYULOG_WHEEL || "/pyodide/wheels/pyulog-1.2.4-py3-none-any.whl";
