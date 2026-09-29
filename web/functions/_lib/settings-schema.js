// 站点设置的字段定义与校验，边缘侧（写 KV）与 Node 侧（读取兜底）共用同一份形状。
//
// 字段清单在 `web/lib/site-settings.ts` 里还有一份（那边多带 `fallback`，指向 site-config.ts 的
// 静态默认值）。两边要同 key、同 kind：边缘按这里校验并落库，Node 按那边回落并渲染，key 对不上
// 就是"存了读不到"。一致性由 `check-settings-schema` 守卫检查（本期还没接）。

/** KV 主键：一个 JSON 装全部站点信息 */
export const SETTINGS_KEY = "settings_site";

/** 审计记录前缀（追加 `settings_log_<时间戳>_<uid>`） */
export const SETTINGS_LOG_PREFIX = "settings_log_";

/**
 * kind 决定校验规则与表单输入框形态：text 单行必填 / textarea 多行必填 / domain 站点域名(要
 * http(s):// 且不带路径) / url 外链 / secret 密钥（只回显尾 4 位，不返回完整值）。
 */
export const SETTINGS_FIELDS = [
    { key: "siteName", label: "网站标题（全称）", kind: "text" },
    { key: "siteShort", label: "网站短名", kind: "text" },
    { key: "siteDescription", label: "网站描述", kind: "textarea" },
    { key: "siteUrl", label: "网站域名", kind: "domain", confirm: true },
    { key: "footerCopyright", label: "页脚版权行", kind: "text", optional: true },
    { key: "footerTagline", label: "页脚品牌介绍", kind: "textarea", optional: true },
    { key: "sourceUrl", label: "源代码链接", kind: "url", optional: true },
    { key: "icp", label: "备案号", kind: "text", optional: true },
    // 服务密钥：只有"存了 / 没存"和尾 4 位会被读出，完整值一次都不离开 KV（第 4 步）
    { key: "deepseekApiKey", label: "DeepSeek API Key", kind: "secret", optional: true },
    { key: "smtpPass", label: "SMTP 密码（发信用）", kind: "secret", optional: true },
    { key: "issueToken", label: "Gitee 令牌（自动提 issue 用）", kind: "secret", optional: true },
];

const FIELD_KEYS = new Set(SETTINGS_FIELDS.map((f) => f.key));

/**
 * 密钥类字段：读取只回显尾 4 位、审计不落明文。两者缺一不可：只回显不脱敏审计，
 * 密钥会以明文写进 `settings_log_*`，而那条日志意义就是"谁改过什么"，写明文等于泄露密钥。
 */
export const SECRET_KEYS = new Set(SETTINGS_FIELDS.filter((f) => f.kind === "secret").map((f) => f.key));

/** 尾 4 位：够管理员确认"这一项是不是刚换的那个"，又不足以拿去用 */
export function maskSecret(value) {
    if (typeof value !== "string" || !value) return "";
    return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

/**
 * 校验一份待保存的设置。
 *
 * @returns {{values: Record<string,string>, errors: {field:string, message:string}[]}}
 *   errors 逐条指明"哪个字段缺什么"，不返回笼统的"参数错误"。
 */
export function validateSettings(input) {
    const values = {};
    const errors = [];
    const src = input && typeof input === "object" ? input : {};

    for (const field of SETTINGS_FIELDS) {
        // 「没提交」和「提交为空」是两回事：没提交（表单只发改动过的字段）原样保留；提交为空
        // 是管理员清空了它，要删掉覆盖、回落默认值。混为一谈的话，改一个备案号会把标题、域名一起清掉。
        if (!(field.key in src)) continue;

        const raw = src[field.key];
        const value = typeof raw === "string" ? raw.trim() : "";

        if (!value) {
            // 空串 = 删掉该项覆盖、回落 site-config.ts 默认值，不报错：代码常量是三层优先级的
            // 地板，任何一项空了都有值顶上，"非空"在这层没意义，报错还会和输入框提示打架。
            // 校验守的是格式（域名是否 http(s)、有无误带路径），不是"有没有填"。
            //
            // 空串也要进 values：落库靠它把键从覆盖里删掉。这里 continue 的话"清空"会静默无效，
            // API 回 ok、changed 空数组、页面显示"已保存"，而 KV 里那个值一动没动。
            values[field.key] = "";
            continue;
        }
        if (field.kind === "domain" || field.kind === "url") {
            const problem = checkHttpUrl(value, field);
            if (problem) {
                errors.push({ field: field.key, message: problem });
                continue;
            }
        }
        values[field.key] = value;
    }

    // 未知字段不落库：可能是旧版本留下的、或前端 bug 塞进来的，静默丢掉比存进去好
    for (const key of Object.keys(src)) {
        if (!FIELD_KEYS.has(key)) errors.push({ field: key, message: `未知字段 ${key}` });
    }

    return { values, errors };
}

/**
 * 域名/链接校验：要 http(s) 开头且能被 URL 解析；域名额外要求没有路径
 * （站点根地址才有意义，带 /xxx 多半是复制错了）。
 */
function checkHttpUrl(value, field) {
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        return `${field.label}必须是完整网址（以 http:// 或 https:// 开头）`;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return `${field.label}只支持 http/https 开头`;
    }
    if (field.kind === "domain" && parsed.pathname !== "/") {
        return `${field.label}只要域名部分，不要带路径（现在是 ${parsed.pathname}）`;
    }
    return null;
}
