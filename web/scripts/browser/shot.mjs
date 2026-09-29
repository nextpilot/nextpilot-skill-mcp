// 用 CDP 驱动 headless Chrome 截图，用于核对配色/布局。
// 用法: node shot.mjs <url> <out.png> <light|dark> [width] [height] [full]
// 依赖: 已用 --remote-debugging-port=9222 启动的 Chrome，Node >= 22（自带 WebSocket）
import { writeFileSync } from "node:fs";
import { log } from "../lib/log.mjs";

const [url, out, theme = "light", w = "1440", h = "900", full = "0"] = process.argv.slice(2);

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("没有可用的 page target");

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
    new Promise((res, rej) => {
        const n = ++id;
        pending.set(n, { res, rej });
        ws.send(JSON.stringify({ id: n, method, params }));
    });

ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    }
});

await new Promise((r) => ws.addEventListener("open", r, { once: true }));

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
    width: +w,
    height: +h,
    deviceScaleFactor: 2,
    mobile: false,
});

// 主题由 html[data-theme] 决定，直接写 DOM 属性
await send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, 2500));
await send("Runtime.evaluate", {
    expression: `document.documentElement.dataset.theme = ${JSON.stringify(theme)};
    (document.getElementById('__shot') ?? Object.assign(document.createElement('style'),{id:'__shot',textContent:'*{transition:none!important;animation:none!important}'})).remove?.();
    document.head.appendChild(Object.assign(document.createElement('style'),{textContent:'*{transition:none!important;animation:none!important}'}));`,
});
await new Promise((r) => setTimeout(r, 400));

const shot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: full === "1",
});
writeFileSync(out, Buffer.from(shot.data, "base64"));
log.info("saved", out);
ws.close();
process.exit(0);
