/**
 * 边缘函数垫片（dev + prod 均生效）。
 *
 * pnpm dev 没有 EdgeOne Functions 运行时，通过 next.config 的 afterFiles rewrite
 * 把 /api/*、/internal/* 转到这里，用内存 KV（lib/dev/dev-kv）执行 functions/ 代码。
 *
 * 生产环境 EdgeOne 的 opennext 适配器生成的 SSR 路由会覆盖边缘函数路由，
 * /api/* 请求被 SSR 函数劫持后同样 rewrite 到这里，在 Node.js 侧执行同一份
 * functions/ 代码（KV 由 EdgeOne 平台注入 process.env）。
 */
import { NextRequest } from "next/server";
import { installDevKv } from "@/lib/dev/dev-kv";

// 边缘函数处理器签名（与 EdgeOne Pages Functions 的 onRequest* 对齐）
type EdgeHandler = (ctx: {
    request: NextRequest;
    env: Record<string, string | undefined>;
    params: Record<string, string>;
    waitUntil?: (p: Promise<unknown>) => void;
}) => Response | Promise<Response>;

// 显式映射（不用运行时文件系统查找，保证 Turbopack 可静态分析）。
//
// ⚠️ **这里是白名单，漏一个就是"该功能在本地整条静默失效"**：没列进来的路径由
// `next.config.ts` 的 rewrite 转进来、却在这儿查不到 loader，于是回 404。
// 而 404 恰恰是"本机还是边缘"最难看出区别的一种失败——本地联调时你以为功能没做，
// 实际只是没被路由。2026-09-18 就这样漏了 `api/issues`：`lib/issue-bridge.ts` 的
// `ENDPOINT = "/api/issues"` 是客户端错误上报的唯一出口，本地一直 404，
// 于是**所有 `reportError()`（包括"报告缺 findings"那条证据）在本机全部静默丢掉**，
// 排查时等于没有证据。根级探针（ping / kv-probe / issue-probe）同理。
//
// 新增 `functions/` 下的端点时必须同时加进这里（`scripts/test-issue-filer.mjs` §[13]
// 会拿 functions/ 的目录清单核对本表，漏了会红）。
const handlers: Record<string, () => Promise<Record<string, unknown>>> = {
    "api/me": () => import("@/functions/api/me.js"),
    "api/explain": () => import("@/functions/api/explain.js"),
    "api/reports": () => import("@/functions/api/reports/index.js"),
    // 详情/删除走 /api/reports/detail?id=<id>（静态名）。EdgeOne 边缘层不部署带动态段
    // [xxx] 的函数文件名，见 functions/api/reports/detail.js 头注。
    "api/reports/detail": () => import("@/functions/api/reports/detail.js"),
    "api/rating": () => import("@/functions/api/rating.js"),
    "api/comments": () => import("@/functions/api/comments.js"),
    "api/favorite": () => import("@/functions/api/favorite.js"),
    "api/download/track": () => import("@/functions/api/download/track.js"),
    "api/issues": () => import("@/functions/api/issues.js"),
    "internal/otp/set": () => import("@/functions/internal/otp/set.js"),
    "internal/otp/consume": () => import("@/functions/internal/otp/consume.js"),
    "internal/users/upsert": () => import("@/functions/internal/users/upsert.js"),
    "api/admin/settings": () => import("@/functions/api/admin/settings.js"),
    "internal/settings/get": () => import("@/functions/internal/settings/get.js"),
    "api/kv-probe": () => import("@/functions/api/kv-probe.js"),
    "api/issue-probe": () => import("@/functions/api/issue-probe.js"),
};

// blob 依赖 @edgeone/pages-blob（EdgeOne 边缘运行时内置模块），
// 仅开发环境注册，避免生产构建时 Turbopack 解析失败。
// 生产环境 /api/blob 需要在边缘函数层单独部署。
if (process.env.NODE_ENV === "development") {
    handlers["api/blob"] = () => import("@/functions/api/blob.js");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function invoke(req: NextRequest, path: string[]): Promise<Response> {
    let handlerKey = path.join("/");
    let params: Record<string, string> = {};
    const loader = handlers[handlerKey];
    if (!loader) return new Response("not found", { status: 404 });

    if (process.env.NODE_ENV === "development") {
        installDevKv();
    }

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

    return (fn as EdgeHandler)({
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
