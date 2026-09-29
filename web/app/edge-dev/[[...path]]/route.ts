/**
 * 边缘函数垫片（仅本地生效）：pnpm dev / next start 没有 EdgeOne Functions 运行时，
 * 通过 next.config 的 beforeFiles rewrite 把 /api/*、/internal/* 转到这里，
 * 用内存 KV（lib/dev/dev-kv）执行 functions/ 代码，保证本地与线上跑的是同一份逻辑。
 *
 * 生产环境不经过这里：functions/ 下的文件由 EdgeOne 平台按「纯字符串精确路径」部署为
 * 边缘函数直接执行（KV 在该层注入）；没有边缘函数文件的 /api/* 穿透到 SSR。
 * opennext 运行时不应用 next.config 的 rewrites（实测：同一个不存在的端点，
 * 本地吃到本垫片的纯文本 404，线上吃到兜底 route 的 JSON 404，证明线上没有 rewrite）。
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
// 这里是白名单，漏一个就是"该功能在本地整条静默失效"：路径被 rewrite 转进来、
// 却在这儿查不到 loader，于是回 404，而 404 是"本机还是边缘"最难看出区别的一种失败。
// 新增 `functions/` 下的端点时要同时加进这里（`scripts/test-issue-filer.mjs` §[13]
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

async function invoke(req: NextRequest, path: string[]): Promise<Response> {
    const handlerKey = path.join("/");
    const params: Record<string, string> = {};
    const loader = handlers[handlerKey];
    if (!loader) return new Response("not found", { status: 404 });

    if (process.env.NODE_ENV === "development") {
        installDevKv();
    }

    const env = process.env as unknown as Record<string, string | undefined>;
    const mod = await loader();
    const method = req.method.toUpperCase();
    const fnName =
        method === "GET"
            ? "onRequestGet"
            : method === "POST"
              ? "onRequestPost"
              : method === "DELETE"
                ? "onRequestDelete"
                : "onRequest";
    const fn = mod[fnName] ?? mod.onRequest;
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
