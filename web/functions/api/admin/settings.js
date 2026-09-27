// 后台站点设置 `/api/admin/settings`：
//   GET  读当前设置 + 字段清单（表单按它渲染）
//   POST 保存（校验 + 落 KV + 审计）
//
// 两个方法都先过管理员判定：白名单外的会话一律 404——不返回 403，
// 因为 403 等于告诉对方"这个入口存在，只是你进不去"。
//
// 为什么保存用 POST 而不是 PUT：`app/edge-dev/[[...path]]/route.ts` 的本地垫片只把
// GET/POST/DELETE 映射到 onRequestGet/Post/Delete，PUT 会落到 onRequest 兜底，
// 本地联调会静默走不通。跟随项目现有边缘函数的风格，统一 POST。
import { getKv, sanitizeId } from "../../_lib/kv.js";
import { jsonResponse, readJson } from "../../_lib/http.js";
import { getSessionUser, isAdminSession } from "../../_lib/auth.js";
import { hkdf } from "../../_lib/hkdf.js";
import { jwtDecrypt } from "jose";
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

    // DEBUG: 诊断边缘函数侧鉴权失败原因，部署后确认，随后删除
    if (!isAdminSession(session, env)) {
        const cookieHeader = request.headers.get("cookie") ?? "";
        const hasCookie = cookieHeader.length > 0;
        const hasSession = session !== null;
        const email = session?.email ?? null;
        const isAdminFromJwt = session?.isAdmin;
        const envEmailList = String(env?.AUTH_ADMIN_EMAILS ?? "");
        const secret = env?.AUTH_SESSION_SECRET;

        // 直接尝试解密，捕获具体异常
        let decryptError = null;
        let decryptPayloadKeys = null;
        const cookies = Object.fromEntries(
            cookieHeader
                .split(";")
                .map((p) => {
                    const i = p.indexOf("=");
                    return i < 0 ? null : [p.slice(0, i).trim(), decodeURIComponent(p.slice(i + 1).trim())];
                })
                .filter(Boolean),
        );
        const TOKEN_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];
        for (const name of TOKEN_COOKIES) {
            const token = cookies[name];
            if (!token) continue;
            try {
                const encKey = await hkdf(
                    secret ?? "NO_SECRET",
                    name,
                    `Auth.js Generated Encryption Key (${name})`,
                    64,
                );
                const { payload } = await jwtDecrypt(token, encKey, {
                    clockTolerance: 15,
                    keyManagementAlgorithms: ["dir"],
                    contentEncryptionAlgorithms: ["A256CBC-HS512"],
                });
                decryptPayloadKeys = Object.keys(payload);
            } catch (e) {
                decryptError = String(e?.message ?? e);
            }
            break;
        }

        return jsonResponse(
            {
                error: "not found",
                debug: {
                    hasCookie,
                    hasSession,
                    sessionEmail: email,
                    isAdminFromJwt,
                    env_AUTH_ADMIN_EMAILS: envEmailList || "<未设置>",
                    secretSnapshot: secret
                        ? `length=${secret.length}, first4=${secret.slice(0, 4)}, last4=${secret.slice(-4)}`
                        : "<未设置>",
                    decryptError: decryptError || (decryptPayloadKeys ? "解密成功" : "未找到session cookie"),
                    decryptPayloadKeys,
                },
            },
            404,
        );
    }
    // END DEBUG

    const kv = getKv(env);
    const raw = kv ? await kv.get(SETTINGS_KEY, { type: "json" }).catch(() => null) : null;
    const settings = raw && typeof raw === "object" ? raw : {};

    // 密钥只出门牌号不出钥匙：完整值一次都不返回给浏览器。
    // 后台页面本身已经登录过，但"能截一张图就把密钥带走"是另一回事——尾 4 位够确认
    // "换的是不是这一个"，不够拿去用。
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
                // 审计记"哪个字段变了"，**不记密钥的新旧值**：能看 KV 的人不该顺手拿到密钥。
                // 站点信息类字段照记（那正是要倒查的内容）。
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
