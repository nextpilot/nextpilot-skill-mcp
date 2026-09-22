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
        const pyodide = process.env.NEXT_PUBLIC_PYODIDE_URL;
        const wheel = process.env.NEXT_PUBLIC_PYULOG_WHEEL;
        if (pyodide) params.set("pyodide", pyodide);
        if (wheel) params.set("wheel", wheel);
        const qs = params.toString();

        void navigator.serviceWorker.register(`/sw.js${qs ? `?${qs}` : ""}`).catch(() => {
            // 静默失败：没有 SW 时行为与现在一致（靠浏览器 HTTP 缓存）
        });
    }, []);

    return null;
}
