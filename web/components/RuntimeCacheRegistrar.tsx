"use client";

import { useEffect } from "react";
import { PYODIDE_INDEX_PATH, PYULOG_WHEEL_PATH } from "@/lib/site-config";

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
        // SW 里比对的是请求 URL 前缀，要是绝对地址才能匹配上；相对路径在 SW 上下文里
        // 无法确定基准（它的 location 是 /sw.js，不是页面）。这里统一转成绝对 URL。
        params.set("pyodide", new URL(PYODIDE_INDEX_PATH, location.href).href);
        params.set("wheel", new URL(PYULOG_WHEEL_PATH, location.href).href);
        const qs = params.toString();

        void navigator.serviceWorker.register(`/sw.js${qs ? `?${qs}` : ""}`).catch(() => {
            // 静默失败：没有 SW 时行为与现在一致（靠浏览器 HTTP 缓存）
        });
    }, []);

    return null;
}
