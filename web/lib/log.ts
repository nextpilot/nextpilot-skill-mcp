// 浏览器侧的唯一输出出口，与 scripts/lib/log.mjs（构建脚本）、tools/_logging.py 对应。
//
// 分流：info / warn 走 console.log，err 走 console.error（DevTools 里带红色图标与调用栈）。
// 这里不接管 console，只提供统一入口——直接 `console.*` 会绕过本文件，
// 而 `console.log` 与 `console.error` 在浏览器里长得几乎一样，失败会被埋进日志流。
//
// 前端不引 node:process，也不做 TTY 着色：浏览器控制台自己渲染级别色。

/** 正常进度与结论。 */
export function info(...args: unknown[]): void {
    console.log(...args);
}

/** 跳过或降级，不致命。 */
export function warn(...args: unknown[]): void {
    console.warn(...args);
}

/** 失败与异常。 */
export function err(...args: unknown[]): void {
    console.error(...args);
}

export const log = { info, warn, err };
