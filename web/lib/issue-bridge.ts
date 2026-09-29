// 浏览器侧「错误 → issue」的桥：挂全局兜底钩子 → 组装 → 去抖 → 脱敏 → POST 到 /api/issues。
// 链路三文件共用 `issue` 词根、各占一个角色词（改名前先读）：
//   issue-bridge.ts（bridge：浏览器采集+投递）→ functions/api/issues.js（入口：接收+限流）
//   → functions/_lib/issue-filer.js（filer：判定+去重+提交）。
// 不叫 telemetry/report：前者语义过宽，后者与本仓库"飞行分析报告"（/api/reports）撞名。
// 没有 issue token，token 只在边缘函数。三条约束：不影响用户（全 try/catch、发送不 await、失败静默）；
// 同一指纹默认 5 分钟只发一次；脱敏/截断/归一化走 lib/error-policy.js，与边缘侧同一份实现。

import { MAX_MESSAGE, MAX_STACK, MAX_TYPE, clip, normalize, scrub } from "./error-policy.js";
import { SITE_VERSION } from "./site-version";

export type ReportLevel = "fatal" | "recoverable";

export interface ManualReportInput {
    /** 本次命中的规则 id 列表。只传 id，不要传标题里的数值或 evidence。 */
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

// 脱敏与截断已挪到 lib/error-policy.js：边缘侧也在做，两侧必须逐字一致（同一个函数而非两份相同代码）。

function softFingerprint(input: ReportInput): string {
    const frame = String(input.stack ?? "").split("\n")[1] ?? "";
    // 与边缘侧同一套归一化：不抹平数字则 `file 17.ulg`/`file 18.ulg` 本地就当两个错误各发一次，白花一趟网络
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
        // 上报失败就失败，不打扰用户
    });
}

function basePayload() {
    return {
        route: typeof location !== "undefined" ? location.pathname : "",
        ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : "",
        loggedIn,
        // 站点版本的唯一读取口（构建期由 next.config.ts 注入）；直接读环境变量则没人赋值，version 恒空串
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
