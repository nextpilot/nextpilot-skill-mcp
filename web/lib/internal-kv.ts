import "server-only";
import { headers } from "next/headers";

/**
 * Node 侧 SSR 调用同源 /internal/* 边缘函数的薄客户端。
 * KV 只能在边缘运行时访问，Node 侧（NextAuth、发信路由）通过 INTERNAL_SECRET 中转。
 */

const INTERNAL_PATHS = {
  otpSet: "/internal/otp/set",
  otpConsume: "/internal/otp/consume",
  usersUpsert: "/internal/users/upsert",
} as const;

/** 从当前请求的转发头推导公网源站（EdgeOne 注入 x-forwarded-*） */
async function publicOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host =
    h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host");
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
  const secret = process.env.INTERNAL_SECRET;
  if (!secret) throw new InternalApiError("INTERNAL_SECRET 未配置", 500);

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
    throw new InternalApiError(
      `内部接口 ${path} 返回 ${resp.status}`,
      resp.status,
      data,
    );
  }
  return data;
}

export interface InternalUser {
  uid: string;
  email: string | null;
  name: string;
  plan: string;
  isNew?: boolean;
}

export async function requestEmailOtp(email: string, ip?: string) {
  return callInternal(INTERNAL_PATHS.otpSet, { email }, { ip }) as Promise<
    | { ok: true; code: string }
    | { ok: false; reason: string; retryAfter?: number }
  >;
}

export async function consumeEmailOtp(email: string, code: string) {
  return callInternal(INTERNAL_PATHS.otpConsume, { email, code }) as Promise<
    { ok: true } | { ok: false; reason: string }
  >;
}

export async function upsertEmailUser(
  email: string,
  name?: string | null,
): Promise<InternalUser> {
  const r = await callInternal(INTERNAL_PATHS.usersUpsert, {
    mode: "email",
    email,
    name: name ?? null,
  });
  return r.user as InternalUser;
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
  return r.user as InternalUser;
}
