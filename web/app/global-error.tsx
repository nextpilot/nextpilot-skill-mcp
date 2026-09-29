"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/issue-bridge";

/**
 * App Router 的渲染错误兜底。放在 app/ 根下，替换整个根 layout，
 * 因此不能依赖任何 Provider（SessionProvider 在这里不可用），
 * 样式也只能内联，globals.css 未必已加载。
 *
 * 这个文件是 React 渲染崩溃时的最后一道防线，也是最值得自动上报的一类错误：
 * 用户看到的是一片白屏，如果不报，我们就无从知道。
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        reportError({
            level: "fatal",
            type: error.name || "GlobalError",
            message: error.message,
            // digest 是 Next 给服务端错误的摘要，带上便于和边缘侧日志对齐
            stack: `${error.stack ?? ""}${error.digest ? `\ndigest: ${error.digest}` : ""}`,
        });
    }, [error]);

    return (
        <html lang="zh-CN" data-theme="light">
            <body
                style={{
                    margin: 0,
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#f7f7f5",
                    color: "#2c2c2a",
                    fontFamily: "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
                }}
            >
                <div style={{ maxWidth: 520, padding: "0 24px" }}>
                    <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 12 }}>页面出错了</h1>
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: "#5f5e5a", margin: "0 0 8px" }}>
                        错误已自动上报（只含错误类型与调用栈，不含你的日志内容）。可以先重试一次；
                        若反复出现，回首页换个入口再试。
                    </p>
                    <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                        <button
                            onClick={reset}
                            style={{
                                padding: "8px 16px",
                                fontSize: 14,
                                borderRadius: 8,
                                border: "1px solid #185fa5",
                                background: "#185fa5",
                                color: "#fff",
                                cursor: "pointer",
                            }}
                        >
                            重试
                        </button>
                        <a
                            href="/"
                            style={{
                                padding: "8px 16px",
                                fontSize: 14,
                                borderRadius: 8,
                                border: "1px solid #d3d1c7",
                                color: "#2c2c2a",
                                textDecoration: "none",
                            }}
                        >
                            回到首页
                        </a>
                    </div>
                    <details style={{ marginTop: 24 }}>
                        <summary style={{ fontSize: 13, color: "#888780", cursor: "pointer" }}>错误详情</summary>
                        <pre
                            style={{
                                marginTop: 8,
                                padding: 12,
                                fontSize: 12,
                                lineHeight: 1.6,
                                background: "#f1efe8",
                                borderRadius: 8,
                                overflow: "auto",
                                maxHeight: 200,
                                whiteSpace: "pre-wrap",
                            }}
                        >
                            {error.message}
                            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
                        </pre>
                    </details>
                </div>
            </body>
        </html>
    );
}
