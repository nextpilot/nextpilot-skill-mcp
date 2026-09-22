// 浏览器侧「错误 → issue」的桥：挂全局兜底钩子 → 组装 → 去抖 → 脱敏 → POST 到自家 /api/issues。
//
// 这条链三个文件共用 `issue` 词根、各占一个不重复的角色词（改名前先读这段，见 CLAUDE.md §6.4）：
//   lib/issue-bridge.ts（**bridge**：浏览器采集 + 投递，就是本文件）
//   → functions/api/issues.js（**入口**：只接收与限流，不做判定）
//   → functions/_lib/issue-filer.js（**filer**：判定 + 去重 + 提交）
// 词根认亲（一眼看出是一条链），角色词分工（一眼看出各站哪一段）。
//
// 为什么不叫 telemetry（曾经用过）：它不撞任何词根，但**语义比实际宽**——这条链只装
// "错误自动建单"这一件事，叫"遥测"会让人以为里面还有性能/使用统计。
// **泛词当避让词用，终究要还债。**
// 也不叫 report（更早用过 report-error）：`report` 在本仓库已指"飞行分析报告"
// （/api/reports、lib/report-history.ts），名词与动词混用会造出同前缀反义的孪生名。
//
// 这里**没有**也**不该有** issue token——token 只在边缘函数。本模块只负责"把错误交出去"。
//
// 三条约束（改动前先读）：
//   1. 绝不影响用户：全量 try/catch，发送不 await，失败静默。上报坏掉不能连累分析。
//   2. 同一错误不重复发：内存按指纹去抖（默认 5 分钟一次）。
//   3. 脱敏、截断、归一化都走 lib/error-policy.js——与边缘侧**同一份实现**。
//      客户端先脱一层只是"少传一点东西出浏览器"，权威判定在边缘侧。

import { MAX_MESSAGE, MAX_STACK, MAX_TYPE, clip, normalize, scrub } from "./error-policy.js";
import { SITE_VERSION } from "./site-version";

export type ReportLevel = "fatal" | "recoverable";

export interface ManualReportInput {
    /** 本次命中的规则 id 列表。**只传 id**，不要传标题里的数值或 evidence。 */
    ruleIds: string[];
    findingCount: number;
    severityCounts: { critical: number; warning: number; info: number };
    /** 用户填的一句话描述 */
    note?: string;
    platform?: string;
    /** 飞控软件版本（如 e82c4e1a1f8e）：定位"规则判定不对"的关键上下文，属公开版本号，非隐私 */
    firmware?: string;
    /** 端侧确定性引擎版本 */
    parserVersion?: string;
    /** 报告引用（云端 reportId 或本机存档 id，均为无用户标识的随机串） */
    reportRef?: string;
}

interface ReportInput extends Partial<ManualReportInput> {
    kind?: "client-error" | "manual-report";
    level?: ReportLevel;
    type?: string;
    message?: string;
    stack?: string;
}

const ENDPOINT = "/api/issues";
/** 同一指纹在这个窗口内只发一次（边缘侧还有按天/按小时的去重，这里只是省流量） */
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;
/** 人工上报的连点保护 */
const MANUAL_COOLDOWN_MS = 5 * 1000;

const seen = new Map<string, number>();
let lastManualAt = 0;
/** 由 IssueBridgeMount 组件按会话写入，仅用于让 issue 能区分"登录用户报的"与"游客报的" */
let loggedIn = false;

export function setBridgeSession(isLoggedIn: boolean) {
    loggedIn = isLoggedIn === true;
}

// 脱敏与截断已挪到 lib/error-policy.js：这两件事边缘侧也在做，必须逐字一致。
// （客户端只留头部的话，Pyodide traceback 末尾的异常行在边缘侧已经没了，
//   兜底再截也救不回来——所以两边必须是同一个函数，而不是两份相同的代码。）

function softFingerprint(input: ReportInput): string {
    const frame = String(input.stack ?? "").split("\n")[1] ?? "";
    // 与边缘侧同一套归一化：不抹平数字的话，`file 17.ulg` 与 `file 18.ulg` 在本地
    // 就被当成两个错误各发一次——边缘最终会去重，但那一趟网络是白花的。
    return [input.level, input.type, normalize(input.message ?? ""), normalize(frame)].join("|").slice(0, 400);
}

function pruneDedupe(now: number) {
    if (seen.size <= 64) return;
    for (const [key, at] of seen) if (now - at > DEDUPE_WINDOW_MS) seen.delete(key);
}

function post(payload: Record<string, unknown>) {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        // sendBeacon 不阻塞、页面卸载时也能发出去，优先用它
        try {
            if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }))) return;
        } catch {
            // 落下去走 fetch
        }
    }
    void fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
    }).catch(() => {
        // 上报失败就失败，绝不打扰用户
    });
}

function basePayload() {
    return {
        route: typeof location !== "undefined" ? location.pathname : "",
        ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : "",
        loggedIn,
        // 站点版本的唯一读取口（构建期由 next.config.ts 注入）。以前这里直接读环境变量，
        // 而全仓库没人给它赋值 → version 恒为空串、上报里那栏直接不打印。
        version: SITE_VERSION.version,
    };
}

/** 上报一个错误。不会抛异常，也不会等待网络。 */
export function reportError(input: ReportInput): void {
    try {
        if (typeof window === "undefined") return;
        const payload: ReportInput = {
            kind: input.kind ?? "client-error",
            level: input.level ?? "recoverable",
            type: String(input.type ?? "Error").slice(0, MAX_TYPE),
            message: clip(scrub(String(input.message ?? "")), MAX_MESSAGE),
            stack: clip(scrub(String(input.stack ?? "")), MAX_STACK),
        };

        const manual = payload.kind === "manual-report";
        const fp = softFingerprint(payload);
        const now = Date.now();
        if (manual) {
            if (now - lastManualAt < MANUAL_COOLDOWN_MS) return;
            lastManualAt = now;
        } else if (!shouldSend(fp, now)) {
            return;
        }

        post({ ...basePayload(), ...payload });
    } catch {
        // 连组装 payload 都出错，那就什么都不做
    }
}

function shouldSend(fp: string, now: number): boolean {
    const last = seen.get(fp);
    if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false;
    seen.set(fp, now);
    pruneDedupe(now);
    return true;
}

/** 用户主动反馈某份报告有问题。走同一出口，但不过滤（用户点一次就该发一次，只做连点保护）。 */
export function reportManual(input: ManualReportInput): void {
    reportError({
        ...input,
        kind: "manual-report",
        level: "recoverable",
        type: "ManualReport",
        message: input.note?.slice(0, 500) ?? "",
    });
}

/**
 * 装上全局兜底：未捕获异常 + 未处理的 Promise 拒绝。
 * 在 RootLayout 里通过 <IssueBridgeMount /> 调用一次即可，重复调用无害。
 */
export function installIssueBridge(): () => void {
    if (typeof window === "undefined") return () => {};

    const onError = (event: ErrorEvent) => {
        // 资源加载失败（img/script）没有 error 对象，价值低，跳过
        if (!event.error && !event.message) return;
        reportError({
            level: "fatal",
            type: event.error?.name ?? "ErrorEvent",
            message: event.message || String(event.error?.message ?? ""),
            stack: event.error?.stack ?? "",
        });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason;
        reportError({
            level: "fatal",
            type: reason?.name ?? "UnhandledRejection",
            message: typeof reason === "string" ? reason : String(reason?.message ?? reason ?? ""),
            stack: reason?.stack ?? "",
        });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
    };
}
