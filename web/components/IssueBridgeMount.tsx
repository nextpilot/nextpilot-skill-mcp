"use client";

import { useEffect } from "react";
import { useSession } from "@/components/SessionProvider";
import { installIssueBridge, setBridgeSession } from "@/lib/issue-bridge";

/**
 * 装全局错误兜底（未捕获异常 + 未处理的 Promise 拒绝），并把登录态同步给上报器。
 *
 * 挂在 RootLayout 里，只渲染 null。监听器在 hydration 之后才装上，更早的错误抓不到，
 * 那段窗口里能抓的只有 global-error.tsx。
 *
 * 叫 `IssueBridgeMount` 而不是 `IssueBridge`：`bridge` 角色词归 `lib/issue-bridge.ts`（逻辑在那），
 * 这层只管"在哪挂、什么时候挂"，另取 `mount`。两个都叫 IssueBridge 会让 grep 命中两个
 * 且分不清哪个是模块、哪个是组件。
 */
export function IssueBridgeMount() {
    const { status } = useSession();

    useEffect(() => {
        setBridgeSession(status === "authenticated");
    }, [status]);

    useEffect(() => installIssueBridge(), []);

    return null;
}
