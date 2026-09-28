"use client";

import { useEffect } from "react";

/**
 * 注册解析运行时的持久缓存 Service Worker（见 public/sw.js）。
 *
 * 只做一件事：让 Pyodide 运行时与 numpy / pyulog 的 wheel "只下载一次"，之后离线可用。
 * 不缓存站点自身的 JS/CSS 与接口响应，所以不影响发版与鉴权。
 *
 * 自托管地址通过查询参数带给 SW（它读不到构建期环境变量）。
 * 注册失败（非安全上下文、浏览器禁用、隐私模式）不影响使用：退回浏览器 HTTP 缓存。
 */
export function RuntimeCacheRegistrar() {
    useEffect(() => {
        if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

        const params = new URLSearchParams();
        // 默认走自托管（随站点部署，见 web/public/pyodide/）。与 workers/analysis-worker.ts 的
        // 默认值保持一致；两者任一被环境变量覆盖时都要让 SW 跟着换前缀，否则缓存会错位。
        const pyodide = process.env.NEXT_PUBLIC_PYODIDE_URL || "/pyodide/v0.27.7/full/";
        const wheel = process.env.NEXT_PUBLIC_PYULOG_WHEEL || "/pyodide/wheels/pyulog-1.2.4-py3-none-any.whl";
        // SW 里比对的是**请求 URL 前缀**，必须是绝对地址才能匹配上；相对路径在 SW 上下文里
        // 无法确定基准（它的 location 是 /sw.js，不是页面）。这里统一在这里转成绝对 URL。
        params.set("pyodide", new URL(pyodide, location.href).href);
        params.set("wheel", new URL(wheel, location.href).href);
        const qs = params.toString();

        void navigator.serviceWorker.register(`/sw.js${qs ? `?${qs}` : ""}`).catch(() => {
            // 静默失败：没有 SW 时行为与现在一致（靠浏览器 HTTP 缓存）
        });
    }, []);

    return null;
}
