// 构建与检查脚本的唯一输出出口，与 Python 侧 tools/_logging.py 对应。
//
// 分流：info / ok / warn 走 stdout，err 走 stderr，供调用方 2> 单独收集。
// 颜色只在 stdout/stderr 是 TTY 时加，重定向到文件时输出纯文本（比对与 grep 依赖这点）。
// 不用 node:util 的 styleText：它在被重定向时仍会写转义序列，会把 CI 日志弄脏。
//
// 契约：err() 里带的 FAIL / OK 首词会被 check_hygiene 按正则识别，
// 用来判断"这个脚本会不会打出失败"。改出口或改首词会让那条守卫静默失效，
// 同步改 tools/common/check_hygiene.py 的 JS_FAIL_PRINT_RE。

const RED = "\u001b[91m";
const YELLOW = "\u001b[93m";
const GREEN = "\u001b[92m";
const RESET = "\u001b[0m";

const hasColor = (stream) => Boolean(stream.isTTY);
const paint = (stream, color, text) => (hasColor(stream) ? `${color}${text}${RESET}` : text);

const emit = (stream, text) => {
    stream.write(String(text) + "\n");
};

/** 正常进度与结论。 */
export function info(text) {
    emit(process.stdout, text);
}

/** 明确的成功标记，TTY 下绿色。 */
export function ok(text) {
    emit(process.stdout, paint(process.stdout, GREEN, text));
}

/** 跳过或降级，不致命，TTY 下黄色。 */
export function warn(text) {
    emit(process.stdout, paint(process.stdout, YELLOW, text));
}

/** 失败消息，落 stderr，TTY 下红色。 */
export function err(text) {
    emit(process.stderr, paint(process.stderr, RED, text));
}

/** 不换行直写 stdout，供伪进度条刷新。 */
export function write(text) {
    process.stdout.write(String(text));
}

export const log = { info, ok, warn, err, write };
