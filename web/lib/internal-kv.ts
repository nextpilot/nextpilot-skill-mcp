import "server-only";
import { headers } from "next/headers";
import { SITE_URL } from "@/lib/site-config";
import { asRecord } from "./json-boundary";

/**
 * Node 侧 SSR 调用同源 /internal/* 边缘函数的薄客户端。
 * KV 只能在边缘运行时访问，Node 侧（NextAuth、发信路由）通过 AUTH_EDGE_SECRET 中转。
 */

const INTERNAL_PATHS = {
    otpSet: "/internal/otp/set",
    otpConsume: "/internal/otp/consume",
    usersUpsert: "/internal/users/upsert",
    settingsGet: "/internal/settings/get",
} as const;

/** 从当前请求的转发头推导公网源站（EdgeOne 注入 x-forwarded-*）。
 *  优先使用环境变量 NEXT_PUBLIC_SITE_URL，未配置时从请求头推导。 */
async function publicOrigin(): Promise<string> {
    if (SITE_URL && SITE_URL !== "http://localhost:3000") return SITE_URL;
    const h = await headers();
    const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host");
    return `${proto}://${host}`;
}

export class InternalApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly payload?: unknown,
    ) {
        super(message);
    }
}

async function callInternal(
    path: string,
    body: Record<string, unknown>,
    init?: { ip?: string },
): Promise<Record<string, unknown>> {
    const origin = await publicOrigin();
    const secret = process.env.AUTH_EDGE_SECRET;
    if (!secret) throw new InternalApiError("AUTH_EDGE_SECRET 未配置", 500);

    const resp = await fetch(`${origin}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-internal-secret": secret,
            ...(init?.ip ? { "x-real-ip": init.ip } : {}),
        },
        body: JSON.stringify(body),
        // 内部中转调用不缓存
        cache: "no-store",
    });

    const data = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
    if (!resp.ok || !data) {
        throw new InternalApiError(`内部接口 ${path} 返回 ${resp.status}`, resp.status, data);
    }
    return data;
}

/* ── 外部 JSON → 内部类型的唯一闸门（见 CLAUDE.md §6.5）────────────────────────────
 * 这些响应由 `functions/internal/*` 边缘函数产生，而 **Next 的 Node 侧与边缘函数是分开部署的**
 * （这正是要经它中转的原因：KV 只能在边缘访问）。`{ok, user}` 在工作日里的中间版本完全可能缺字段——
 * 直接 `as InternalUser` 只是把类型检查关掉，缺失的 `uid` 会一路走到 `auth.ts` 的 `{ id: user.uid }`，
 * 于是一个 `id: undefined` 的用户被写进 JWT（`session.user.id` 的取值条件跟着失效）。 */

export interface InternalUser {
    uid: string;
    email: string | null;
    name: string;
    plan: string;
    isNew?: boolean;
}

/** `/internal/users/upsert` → `{ok, user:{uid,email,name,plan,isNew?}}`。
 *  `uid` 是身份的唯一凭据，没有它等于没有这个人 —— 返回 null，由调用方当"登录失败"处理。 */
function normalizeInternalUser(raw: unknown): InternalUser | null {
    const r = asRecord(raw);
    if (!r) return null;
    const uid = r.uid;
    if (typeof uid !== "string" || !uid) return null;
    const email = typeof r.email === "string" && r.email ? r.email : null;
    const name = typeof r.name === "string" && r.name ? r.name : (email?.split("@")[0] ?? uid);
    return {
        uid,
        email,
        name,
        // 新记录一律 free；老记录缺 plan 按 free 兜（auth.ts 的 session 也是这个默认值）
        plan: typeof r.plan === "string" && r.plan ? r.plan : "free",
        isNew: r.isNew === true,
    };
}

/** 归一失败即抛：返回一个"半个用户"比直接失败更糟 —— 那个 uid 会被写进 JWT */
function requireUser(raw: unknown, path: string): InternalUser {
    const user = normalizeInternalUser(raw);
    if (!user) {
        throw new InternalApiError(`内部接口 ${path} 返回的形状里没有 uid`, 502, raw);
    }
    return user;
}

export type OtpRequestResult = { ok: true; code: string } | { ok: false; reason: string; retryAfter?: number };

export type OtpConsumeResult = { ok: true } | { ok: false; reason: string };

/** `/internal/otp/set` → `{ok:true, code}` 或 `{ok:false, reason, retryAfter?}`。
 *  `ok:true` 却没有 `code` 当坏记录丢掉：否则会把 `undefined` 当验证码发出去。 */
function normalizeOtpRequest(raw: unknown): OtpRequestResult | null {
    const r = asRecord(raw);
    if (!r) return null;
    if (r.ok === true) {
        return typeof r.code === "string" && r.code ? { ok: true, code: r.code } : null;
    }
    if (typeof r.reason !== "string") return null;
    return {
        ok: false,
        reason: r.reason,
        ...(typeof r.retryAfter === "number" ? { retryAfter: r.retryAfter } : {}),
    };
}

/** `/internal/otp/consume` → 成功只有 `{ok:true}` 一种形状；其余一律当"这次校验没通过" */
function normalizeOtpConsume(raw: unknown): OtpConsumeResult {
    const r = asRecord(raw);
    if (r && r.ok === true) return { ok: true };
    const reason = r && typeof r.reason === "string" ? r.reason : "bad-response";
    return { ok: false, reason };
}

/**
 * 边缘函数对**领域内的失败**用 4xx + `{ok:false, reason}` 作答（重发太频繁、每日限额、验证码错误），
 * 对**基础设施故障**用 5xx + `{error}`（KV 未绑定、内部密钥不对）。
 *
 * 前者要变回结果交给调用方：`app/api/auth/otp/request/route.ts` 靠 `reason` 区分"请 N 秒后再试"
 * 与"今日次数已达上限"。少了这一步那两个分支就是死代码 —— `callInternal` 在 `!resp.ok` 时抛，
 * 于是 429 一律被 `.catch` 吃成 null，用户看到的是"验证码服务暂时不可用"，而不是还剩多少秒。
 * 后者继续抛：把配置问题降级成"验证码发送失败"，等于用用户错误的口吻掩盖运维问题。
 */
function domainFailure(err: unknown): Record<string, unknown> | null {
    if (!(err instanceof InternalApiError)) return null;
    const r = asRecord(err.payload);
    if (!r) return null;
    return r.ok === false && typeof r.reason === "string" ? r : null;
}

export async function requestEmailOtp(email: string, ip?: string): Promise<OtpRequestResult> {
    let raw: unknown;
    try {
        raw = await callInternal(INTERNAL_PATHS.otpSet, { email }, { ip });
    } catch (err) {
        const failure = domainFailure(err);
        if (!failure) throw err;
        raw = failure;
    }
    const result = normalizeOtpRequest(raw);
    if (!result) {
        throw new InternalApiError("内部接口 /internal/otp/set 返回的形状无法识别", 502, raw);
    }
    return result;
}

export async function consumeEmailOtp(email: string, code: string): Promise<OtpConsumeResult> {
    let raw: unknown;
    try {
        raw = await callInternal(INTERNAL_PATHS.otpConsume, { email, code });
    } catch (err) {
        const failure = domainFailure(err);
        if (!failure) throw err;
        raw = failure;
    }
    return normalizeOtpConsume(raw);
}

export async function upsertEmailUser(email: string, name?: string | null): Promise<InternalUser> {
    const r = await callInternal(INTERNAL_PATHS.usersUpsert, {
        mode: "email",
        email,
        name: name ?? null,
    });
    return requireUser(r.user, "/internal/users/upsert");
}

export async function upsertGithubUser(input: {
    githubId: string | number;
    email?: string | null;
    name?: string | null;
}): Promise<InternalUser> {
    const r = await callInternal(INTERNAL_PATHS.usersUpsert, {
        mode: "github",
        githubId: String(input.githubId),
        email: input.email ?? null,
        name: input.name ?? null,
    });
    return requireUser(r.user, "/internal/users/upsert");
}

/**
 * 后台保存的站点设置覆盖项（/internal/settings/get）。
 *
 * 返回 null 表示"没有覆盖"，**不是出错**——KV 没绑定、内部密钥没配、后台从来没存过
 * 都是这个结果。调用方一律回落到 site-config.ts 的静态默认值：
 * 配置丢了网站必须照常起来，不能白屏。
 */
export async function fetchSiteSettings(): Promise<Record<string, unknown> | null> {
    try {
        const data = await callInternal(INTERNAL_PATHS.settingsGet, {});
        return asRecord(data.settings);
    } catch {
        return null;
    }
}
