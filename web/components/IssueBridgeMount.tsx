"use client";

import { useEffect } from "react";
import { useSession } from "@/components/SessionProvider";
import { installIssueBridge, setBridgeSession } from "@/lib/issue-bridge";

/**
 * 装上全局错误兜底（未捕获异常 + 未处理的 Promise 拒绝），并把登录态同步给上报器。
 *
 * 挂在 RootLayout 里，只渲染 null。已知限制：监听器在 hydration 之后才装上，
 * 更早发生的错误抓不到，那段窗口里能抓的只有 global-error.tsx。
 *
 * 为什么是 `IssueBridgeMount` 而不是 `IssueBridge`：链路里 `bridge` 这个角色词已经归
 * `lib/issue-bridge.ts`（逻辑都在那儿）。这一层只负责"在哪挂、什么时候挂"，
 * 那是个独立的角色，所以另取一个词 mount，而不是跟 lib 那个文件撞名字，
 * 两个都叫 IssueBridge 的话，grep 命中两个，还得分清哪个是模块、哪个是组件（§6.4 第①条）。
 */
export function IssueBridgeMount() {
    const { status } = useSession();

    useEffect(() => {
        setBridgeSession(status === "authenticated");
    }, [status]);

    useEffect(() => installIssueBridge(), []);

    return null;
}
