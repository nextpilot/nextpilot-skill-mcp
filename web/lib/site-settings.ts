import "server-only";

import {
    FOOTER_COPYRIGHT,
    FOOTER_TAGLINE,
    ICP_NUMBER,
    SITE_DESCRIPTION,
    SITE_NAME,
    SITE_SHORT,
    SITE_URL,
    REPO_URL,
} from "./site-config";
import { fetchSiteSettings } from "./internal-kv";

/**
 * 运行期站点设置：后台 /admin/settings 存进 KV 的值覆盖 site-config 静态默认值。
 * 优先级 KV 覆盖 > 环境变量 > 代码字面量，本模块把三层压平成一个值；加配置 = 表加一行（表单/校验/审计/类型跟着走）。
 * key/kind 在 web/functions/_lib/settings-schema.js 有一份边缘侧副本（落库前校验用），两侧要一致，由守卫检查保证。
 */
export const SETTINGS_FIELDS = [
    { key: "siteName", label: "网站标题（全称）", kind: "text", fallback: SITE_NAME },
    { key: "siteShort", label: "网站短名", kind: "text", fallback: SITE_SHORT },
    { key: "siteDescription", label: "网站描述", kind: "textarea", fallback: SITE_DESCRIPTION },
    {
        key: "siteUrl",
        label: "网站域名",
        kind: "domain",
        fallback: SITE_URL,
        // 改域名会影响搜索收录和分享链接，后台保存时要二次确认
        confirm: true,
    },
    {
        key: "footerCopyright",
        label: "页脚版权行（© 年份之后那半句）",
        kind: "text",
        fallback: FOOTER_COPYRIGHT,
        optional: true,
    },
    { key: "footerTagline", label: "页脚品牌介绍", kind: "textarea", fallback: FOOTER_TAGLINE, optional: true },
    { key: "sourceUrl", label: "源代码链接", kind: "url", fallback: REPO_URL, optional: true },
    { key: "icp", label: "备案号", kind: "text", fallback: ICP_NUMBER, optional: true },
    // 密钥字段 fallback 是空串，地板在环境变量：消费方写 `设置值 || process.env.X`，不能直接用这里的值
    { key: "deepseekApiKey", label: "DeepSeek API Key", kind: "secret", fallback: "", optional: true },
    { key: "smtpPass", label: "SMTP 密码（发信用）", kind: "secret", fallback: "", optional: true },
    { key: "issueToken", label: "Gitee 令牌（自动提 issue 用）", kind: "secret", fallback: "", optional: true },
] as const;

export type SiteSettingField = (typeof SETTINGS_FIELDS)[number];
export type SiteSettingKey = SiteSettingField["key"];
export type SiteSettings = Record<SiteSettingKey, string>;

/** 密钥字段：读取只回显尾 4 位、审计不落明文（与边缘侧 `SECRET_KEYS` 同源同义） */
export const SECRET_FIELD_KEYS: ReadonlySet<SiteSettingKey> = new Set(
    SETTINGS_FIELDS.filter((f) => f.kind === "secret").map((f) => f.key),
);

/** 尾 4 位：够确认"换的是不是这一个"，不够拿去用 */
function maskSecret(value: string): string {
    if (!value) return "";
    return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

/** 保存后最迟这么久全站生效：不给每个页面请求加一次 KV 查询，代价是新值有延迟 */
const CACHE_TTL_MS = 60_000;

let cached: { at: number; value: SiteSettings } | null = null;

/** 当前生效的站点设置。拿不到覆盖项（KV 没绑/密钥没配/没存过）逐项回落 site-config 地板值，永不抛错不白屏 */
export async function getSiteSettings(): Promise<SiteSettings> {
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
    const value = flattenSettings(await fetchSiteSettings());
    cached = { at: Date.now(), value };
    return value;
}

/** 把 KV 覆盖项压到字段表上：空串视同"没配"，回落地板值 */
export function flattenSettings(overrides: Record<string, unknown> | null): SiteSettings {
    const out = {} as SiteSettings;
    for (const field of SETTINGS_FIELDS) {
        const stored = overrides?.[field.key];
        out[field.key] = typeof stored === "string" && stored.trim().length > 0 ? stored.trim() : field.fallback;
    }
    return out;
}

/** 给页面用的版本：密钥只回尾 4 位。getSiteSettings() 是明文（mailer 发信要用），但后台页把值传给
 *  客户端表单组件会序列化进 SSR HTML，明文等于把密钥写进页面源码；凡渲染给浏览器的一律用这个版本。 */
export async function getSiteSettingsForDisplay(): Promise<SiteSettings> {
    const settings = await getSiteSettings();
    const out = { ...settings };
    for (const key of SECRET_FIELD_KEYS) {
        out[key] = maskSecret(settings[key]);
    }
    return out;
}
