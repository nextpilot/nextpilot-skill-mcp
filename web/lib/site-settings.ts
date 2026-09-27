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
 * 运行期站点设置：后台 `/admin/settings` 存进 KV 的值覆盖 `site-config.ts` 的静态默认值。
 *
 * 优先级（方案第 3 节）：KV 覆盖 > 环境变量 > 代码字面量。
 * 本模块只负责最后那一跳"把三层压平成一个值"，消费方不该再写 if-else。
 *
 * 加一项配置 = 这张表加一行：表单、校验、审计、类型全跟着走。
 * ⚠️ 同一份 key/kind 在 `web/functions/_lib/settings-schema.js` 还有一份（边缘侧落库前
 * 校验用）。两边必须一致，否则"存进去读不出来"，一致性由步骤 5 的守卫检查。
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
    // 服务密钥（第 4 步）：fallback 是空串——**没有代码地板值**，地板是环境变量。
    // 所以消费方一律写 `设置值 || process.env.X`，不能直接用这里的值了事。
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

/**
 * 当前生效的站点设置。
 *
 * 拿不到覆盖项（KV 没绑 / 内部密钥没配 / 后台没存过）时，每一项都回落到
 * `site-config.ts` 的地板值——所以这个函数永不抛错，网站不会因为没有配置而白屏。
 */
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

/**
 * 给**页面**用的版本：密钥字段只给尾 4 位。
 *
 * ⚠️ 为什么必须有这个函数：`getSiteSettings()` 返回的是**明文**（`mailer.ts` 要拿
 * SMTP 授权码去发信，脱敏了就发不出去）。而后台页要把值当 `initial` 传给表单组件——
 * 那是客户端组件，props 会被序列化进 SSR 的 HTML。直接传明文等于把密钥写进页面源码，
 * 查看源代码就能拿走。凡是要渲染给浏览器的地方，一律用这个版本。
 */
export async function getSiteSettingsForDisplay(): Promise<SiteSettings> {
    const settings = await getSiteSettings();
    const out = { ...settings };
    for (const key of SECRET_FIELD_KEYS) {
        out[key] = maskSecret(settings[key]);
    }
    return out;
}
