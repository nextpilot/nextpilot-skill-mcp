// 报错上报的共用政策：脱敏规则、截断方式、归一化规则、字段词表。
//
// 为什么要有这个文件：浏览器侧（lib/issue-bridge.ts）与边缘侧
// （functions/_lib/issue-filer.js）跑在两个运行时里，模块不可能合成一个；
// 但下面这几件事两边要逐字一致，只要各写一份，就会悄悄分叉：
//
//   · clip()      客户端先截、边缘再截。客户端要是只留头部，Pyodide 那个 Python
//                 traceback 末尾的异常行（`NameError: ...`）在边缘侧就已经不存在，
//                 兜底再截也救不回来。截断方式两边一旦不同，丢掉的证据不可恢复。
//   · scrub()     客户端先粗脱敏、边缘再按白名单脱。规则不一致时，客户端会先一步
//                 把边缘想匹配的东西吃掉（JWT 被宽泛的长 hex 规则咬掉一半，就再也
//                 匹配不上 jwt 规则了）。脱敏是安全政策，不该有"弱一点的客户端版本"。
//   · normalize() 指纹（去重）靠它抹平数字与长标识符。只要有一侧不归一化，
//                 `file 17.ulg` 与 `file 18.ulg` 就会各算一个指纹，去重形同虚设。
//
// 所以：规则只在这里改。两侧都从这里 import，谁都不许再抄一份实现。
//
// 为什么是 .js 而不是 .ts：边缘函数全是 .js（21 个），而且"从 lib/ 引 .js"是本仓库
// 既有做法（functions/api/explain.js 就引了 lib/knowledge/prompts.generated.js）。
// 浏览器侧靠 tsconfig 的 allowJs 直接引，类型由下面的 JSDoc 提供。
//
// 守卫生效点：web/scripts/test-issue-filer.mjs 会检查这两个源文件里不再出现
// 脱敏/截断的实现字面量，谁再抄一份进去，统一校验入口就会红。

/** 消息 / 栈 / 类型 的长度上限（字符）。两侧共用，改一处两边同时生效。 */
export const MAX_MESSAGE = 1000;
export const MAX_STACK = 4000;
export const MAX_TYPE = 120;

/**
 * 级别与来源的合法取值。边缘侧按白名单兜底。
 * 浏览器侧的类型定义（lib/issue-bridge.ts 的 ReportLevel / kind）要与之一致，
 * 那是编译期约束，写错了编译器会拦，所以不留运行时副本。
 */
export const ALLOWED_LEVELS = new Set(["fatal", "recoverable"]);
export const ALLOWED_KINDS = new Set(["client-error", "server-error", "manual-report"]);

/**
 * 脱敏规则。顺序有讲究：先干掉带结构的凭证，再干掉宽泛的长 hex，
 * 反过来的话 JWT 会被长 hex 规则咬掉一半，再也匹配不上。
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
 * 因此"客户端先脱 + 边缘再脱"恒等于"只脱一次"（自测里有这条不变量）。
 * @param {unknown} text
 * @returns {string}
 */
export function scrub(text) {
    let out = String(text ?? "");
    for (const [re, rep] of SCRUB_RULES) out = out.replace(re, rep);
    return out;
}

/**
 * 头尾都保留的截断。Pyodide 抛的 Python traceback 里，最关键的那一行
 * （异常类型与消息）在末尾，只从头部截会把最有用的证据丢掉。
 *
 * 幂等：对已截断的文本再截（同样的 max 或更大的 max）不会二次加工。
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
 * 归一化：把数字、时间戳、长标识符抹平成占位符，供指纹（去重）使用。
 * 不做这一步，`file 17.ulg` 与 `file 18.ulg` 会各算一个指纹，去重形同虚设。
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
