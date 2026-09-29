// GET /api/admin/settings 读当前设置 + 字段清单；POST 保存（校验 + 落 KV + 审计）。
//
// 两个方法都先过管理员判定：白名单外的会话一律 404 不返回 403，因为 403 等于告诉对方"这个入口存在，只是你进不去"。
//
// 为什么保存用 POST 而非 PUT：`app/edge-dev/[[...path]]/route.ts` 本地垫片只把 GET/POST/DELETE 映射到
// onRequestGet/Post/Delete，PUT 会落到 onRequest 兜底、本地联调静默走不通。统一 POST 跟随项目现有风格。
import { getKv, sanitizeId } from "../../_lib/kv.js";
import { jsonResponse, readJson } from "../../_lib/http.js";
import { getSessionUser, isAdminSession } from "../../_lib/auth.js";
import {
    SETTINGS_KEY,
    SETTINGS_LOG_PREFIX,
    SETTINGS_FIELDS,
    SECRET_KEYS,
    maskSecret,
    validateSettings,
} from "../../_lib/settings-schema.js";

export async function onRequestGet({ request, env }) {
    const session = await getSessionUser(request, env);
    if (!isAdminSession(session, env)) return jsonResponse({ error: "not found" }, 404);

    const kv = getKv(env);
    const raw = kv ? await kv.get(SETTINGS_KEY, { type: "json" }).catch(() => null) : null;
    const settings = raw && typeof raw === "object" ? raw : {};

    // 密钥只出门牌号不出钥匙：完整值一次都不返回给浏览器。后台页面虽已登录，但"截一张图就把密钥带走"
    // 是另一回事，尾 4 位够确认"换的是不是这一个"，不够拿去用。
    const safe = {};
    for (const [key, value] of Object.entries(settings)) {
        safe[key] = SECRET_KEYS.has(key) ? maskSecret(value) : value;
    }

    return jsonResponse({
        settings: safe,
        fields: SETTINGS_FIELDS,
    });
}

export async function onRequestPost({ request, env }) {
    const session = await getSessionUser(request, env);
    if (!isAdminSession(session, env)) return jsonResponse({ error: "not found" }, 404);

    const body = await readJson(request);
    if (!body || typeof body.settings !== "object" || body.settings === null) {
        return jsonResponse({ ok: false, errors: [{ field: "settings", message: "请求体缺少 settings 对象" }] }, 400);
    }

    const { values, errors } = validateSettings(body.settings);
    if (errors.length > 0) return jsonResponse({ ok: false, errors }, 400);

    const kv = getKv(env);
    if (!kv) return jsonResponse({ ok: false, errors: [{ field: "kv", message: "KV 绑定缺失" }] }, 500);

    const before = (await kv.get(SETTINGS_KEY, { type: "json" }).catch(() => null)) ?? {};
    const after = { ...before, ...values };
    // 空串的字段从覆盖里删掉：留一个空串等于"网站标题是空的"，而管理员想的是"用回默认值"
    for (const [key, value] of Object.entries(values)) {
        if (value === "") delete after[key];
    }
    await kv.put(SETTINGS_KEY, JSON.stringify(after));

    const changed = Object.keys(values).filter((key) => before[key] !== after[key]);
    if (changed.length > 0) {
        // key 只允许字母数字下划线，uid 已经清过一次，这里再兜一层
        const uid = sanitizeId(session?.uid ?? "unknown") || "unknown";
        await kv.put(
            `${SETTINGS_LOG_PREFIX}${Date.now()}_${uid}`,
            JSON.stringify({
                at: new Date().toISOString(),
                by: session?.email ?? null,
                // 审计记"哪个字段变了"不记密钥新旧值：能看 KV 的人不该顺手拿到密钥；站点信息类字段照记
                changed: changed.map((key) => ({
                    key,
                    from: SECRET_KEYS.has(key) ? "***" : (before[key] ?? null),
                    to: SECRET_KEYS.has(key) ? "***" : (after[key] ?? null),
                })),
            }),
        );
    }

    return jsonResponse({ ok: true, changed });
}
