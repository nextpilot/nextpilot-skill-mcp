// 边缘函数侧的会话校验：解密 next-auth v5 的 JWE 会话 cookie。
// next-auth 默认把 JWT 用 dir / A256CBC-HS512 加密，密钥 = HKDF(AUTH_SESSION_SECRET, salt=cookie名)。
import { jwtDecrypt } from "jose";
import { hkdf } from "./hkdf.js";

// HTTPS 生产环境带 __Secure 前缀；本地 http 开发不带
const TOKEN_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];

/**
 * @param {Request} request
 * @param {Record<string,string|undefined>} env 边缘函数环境变量
 * @returns {Promise<{uid:string,email:string|null,name:string|null,plan:string}|null>}
 */
export async function getSessionUser(request, env) {
    const secret = env?.AUTH_SESSION_SECRET;
    if (!secret) return null;

    const cookieHeader = request.headers.get("cookie") ?? "";
    const cookies = Object.fromEntries(
        cookieHeader
            .split(";")
            .map((part) => {
                const i = part.indexOf("=");
                return i < 0 ? null : [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
            })
            .filter(Boolean),
    );

    for (const name of TOKEN_COOKIES) {
        const token = cookies[name];
        if (!token) continue;
        try {
            const encryptionKey = await hkdf(secret, name, `Auth.js Generated Encryption Key (${name})`, 64);
            const { payload } = await jwtDecrypt(token, encryptionKey, {
                clockTolerance: 15,
                keyManagementAlgorithms: ["dir"],
                contentEncryptionAlgorithms: ["A256CBC-HS512"],
            });
            if (!payload.uid) return null;
            return {
                uid: String(payload.uid),
                email: payload.email ? String(payload.email) : null,
                name: payload.name ? String(payload.name) : null,
                plan: typeof payload.plan === "string" ? payload.plan : "free",
            };
        } catch {
            // 该 cookie 解不开就尝试下一个候选名
        }
    }
    return null;
}

/**
 * 后台（/admin/settings）管理员判定 —— 与 `web/auth.ts` 的 jwt 回调同一套规则。
 *
 * 没配 AUTH_ADMIN_EMAILS 时任何人都不算管理员：宁可后台进不去，也不能让
 * "没配 = 全放行"这种默认成立。
 *
 * @param {{email?: string|null}|null} session getSessionUser 的结果
 * @param {Record<string,string|undefined>} env
 */
export function isAdminSession(session, env) {
    const email = String(session?.email ?? "")
        .toLowerCase()
        .trim();
    if (!email) return false;
    const list = String(env?.AUTH_ADMIN_EMAILS ?? "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    return list.includes(email);
}
