// 报错上报的共用政策：脱敏规则、截断方式、归一化规则、字段词表。
// 契约红线：浏览器侧（issue-bridge.ts）与边缘侧（functions/_lib/issue-filer.js）是两个运行时，
// 以下三件事两侧必须逐字一致——只在这里改、只从这里 import，谁都不许再抄一份：
//   · clip()      客户端先截、边缘再截；方式不同则丢掉的证据（Python traceback 末尾的异常行）不可恢复
//   · scrub()     客户端先粗脱敏、边缘再按白名单脱；不一致时客户端会把边缘要匹配的东西先吃掉，脱敏是安全政策
//   · normalize() 指纹（去重）靠它抹平数字与长标识符；缺一侧则去重形同虚设
// .js 而非 .ts：边缘函数全是 .js，"从 lib/ 引 .js"是仓库既有做法；类型由 JSDoc 提供，浏览器侧靠 allowJs。
// 守卫：web/scripts/test-issue-filer.mjs 检查两个源文件不再出现脱敏/截断实现字面量，抄进去统一校验就会红。

/** 消息 / 栈 / 类型 的长度上限（字符）。两侧共用，改一处两边同时生效。 */
export const MAX_MESSAGE = 1000;
export const MAX_STACK = 4000;
export const MAX_TYPE = 120;

/** 级别与来源的合法取值，边缘侧按白名单兜底。浏览器侧类型（issue-bridge.ts）与之对齐，属编译期约束，不留运行时副本 */
export const ALLOWED_LEVELS = new Set(["fatal", "recoverable"]);
export const ALLOWED_KINDS = new Set(["client-error", "server-error", "manual-report"]);

/**
 * 脱敏规则，顺序有讲究：先干掉带结构的凭证再干掉宽泛长 hex，反过来 JWT 会被长 hex 咬掉一半再也匹配不上。
 * @type {Array<[RegExp, string]>}
 */
export const SCRUB_RULES = [
    [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>"],
    [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "<jwt>"],
    [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer <token>"],
    [/\b[A-Fa-f0-9]{24,}\b/g, "<hex>"],
    [/[A-Za-z]:\\Users\\[^\\\s"'`]+/gi, "<home>"],
    [/\/(?:home|Users)\/[^/\s"'`]+/g, "<home>"],
    [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "<ip>"],
];

/**
 * 脱敏。规则顺序见 SCRUB_RULES；替换产物不会再被任何规则匹配，
 * 故"客户端先脱 + 边缘再脱"恒等于"只脱一次"。
 * @param {unknown} text
 * @returns {string}
 */
export function scrub(text) {
    let out = String(text ?? "");
    for (const [re, rep] of SCRUB_RULES) out = out.replace(re, rep);
    return out;
}

/**
 * 头尾都保留的截断：Pyodide 的 Python traceback 关键行（异常类型与消息）在末尾，只从头部截会丢最有用的证据。
 * 幂等：对已截断文本再截（同 max 或更大 max）不二次加工。
 * @param {unknown} text
 * @param {number} max
 * @returns {string}
 */
export function clip(text, max) {
    const s = String(text ?? "");
    if (s.length <= max) return s;
    const head = Math.floor(max * 0.6);
    const tail = Math.max(0, max - head - 24);
    return `${s.slice(0, head)}\n…（已截断 ${s.length - max} 字符）…\n${s.slice(-tail)}`;
}

/**
 * 归一化：数字/时间戳/长标识符抹平成占位符，供指纹（去重）用；否则 `file 17.ulg` 与 `file 18.ulg` 各算一个指纹。
 * @param {unknown} text
 * @returns {string}
 */
export function normalize(text) {
    return String(text ?? "")
        .replace(/0x[0-9a-f]+/gi, "0xH")
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "U")
        .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "L")
        .replace(/\d+(?:\.\d+)?/g, "N")
        .slice(0, MAX_MESSAGE);
}
