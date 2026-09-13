/**
 * 开发环境边缘函数垫片（仅 NODE_ENV=development 生效）。
 *
 * pnpm dev 只有 Next 自身，不跑 web/functions 的 Edge 函数；通过 next.config 的
 * afterFiles rewrite，把"Next 路由未命中"的 /api/*、/internal/* 转到这里，
 * 用内存 KV（lib/dev/dev-kv）执行同一份 functions/ 处理器代码。
 * 生产构建 NODE_ENV=production，rewrite 不注册且本路由直接 404。
 */
import { NextRequest } from "next/server";
import { installDevKv } from "@/lib/dev/dev-kv";

// 显式映射（不用运行时文件系统查找，保证 Turbopack 可静态分析）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers: Record<string, () => Promise<any>> = {
  "api/me": () => import("@/functions/api/me.js"),
  "api/explain": () => import("@/functions/api/explain.js"),
  "api/reports": () => import("@/functions/api/reports.js"),
  "api/reports/[id]": () => import("@/functions/api/reports/[id].js"),
  "internal/otp/set": () => import("@/functions/internal/otp/set.js"),
  "internal/otp/consume": () => import("@/functions/internal/otp/consume.js"),
  "internal/users/upsert": () => import("@/functions/internal/users/upsert.js"),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function invoke(req: NextRequest, path: string[]): Promise<Response> {
  if (process.env.NODE_ENV !== "development") {
    return new Response("not found", { status: 404 });
  }

  let handlerKey = path.join("/");
  let params: Record<string, string> = {};
  if (!(handlerKey in handlers) && path[0] === "api" && path[1] === "reports" && path.length === 3) {
    handlerKey = "api/reports/[id]";
    params = { id: path[2] };
  }
  const loader = handlers[handlerKey];
  if (!loader) return new Response("not found", { status: 404 });

  installDevKv();

  const env = process.env as unknown as Record<string, string | undefined>;
  const module = await loader();
  const method = req.method.toUpperCase();
  const fnName =
    method === "GET"
      ? "onRequestGet"
      : method === "POST"
        ? "onRequestPost"
        : method === "DELETE"
          ? "onRequestDelete"
          : "onRequest";
  const fn = module[fnName] ?? module.onRequest;
  if (typeof fn !== "function") return new Response("method not allowed", { status: 405 });

  return fn({
    request: req,
    env,
    params,
    waitUntil: (p: Promise<unknown>) => {
      void p;
    },
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  return invoke(req, path);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  return invoke(req, path);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  return invoke(req, path);
}
