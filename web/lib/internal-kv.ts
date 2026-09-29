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

/**
 * 推导 Node 侧同源调用 /internal/* 的公网源站。不能直接信 SITE_URL：
 * 本地 next start 的 NODE_ENV 也是 production，SITE_URL 的生产兜底会让本地测登录打到线上域名；
 * NEXT_PUBLIC_SITE_URL 配错时自请求跟错，登录整条链路静默失效。
 * 口径：请求头（x-forwarded-host/proto，EdgeOne 必注入）推导的现实值优先，SITE_URL 只作最后兜底。
 */
async function publicOrigin(): Promise<string> {
    const h = await headers();
    const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host");
    if (host) return `${proto}://${host}`;
    // 请求头缺失的极端情况：回落到构建期常量（线上有生产兜底，不会是 localhost）
    return SITE_URL;
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

/* ── 外部 JSON → 内部类型的唯一闸门（CLAUDE.md §6.5）──
 * 响应来自边缘函数且与 Node 侧分开部署，中间版本可能缺字段；直接 as 强转只是关掉检查，
 * 缺失的 uid 会以 id:undefined 一路写进 JWT。 */

export interface InternalUser {
    uid: string;
    email: string | null;
    name: string;
    plan: string;
    isNew?: boolean;
}

/** `/internal/users/upsert` → `{ok, user:{uid,email,name,plan,isNew?}}`。
 *  `uid` 是身份的唯一凭据，没有它等于没有这个人，返回 null，由调用方当"登录失败"处理。 */
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

/** 归一失败即抛：返回一个"半个用户"比直接失败更糟，那个 uid 会被写进 JWT */
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
 * 边缘对领域内失败用 4xx + {ok:false, reason}（重发太频繁/限额/验证码错），基础设施故障用 5xx + {error}。
 * 前者要变回结果交调用方（route 靠 reason 区分"N 秒后再试"与"今日上限"，否则 429 被 .catch 吃成 null）；
 * 后者继续抛：把配置问题降级成"验证码发送失败"是用错误口吻掩盖运维问题。
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

/** 后台保存的站点设置覆盖项。null = 没有覆盖而非出错（KV 没绑定/密钥没配/从没存过），
 *  调用方一律回落 site-config 静态默认值：配置丢了网站要照常起来。 */
export async function fetchSiteSettings(): Promise<Record<string, unknown> | null> {
    try {
        const data = await callInternal(INTERNAL_PATHS.settingsGet, {});
        return asRecord(data.settings);
    } catch {
        return null;
    }
}
