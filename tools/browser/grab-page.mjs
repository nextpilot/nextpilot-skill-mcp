// 用 CDP 打开目标页，等渲染完，抓整页截图 + 正文 outerHTML（用于对照版式）
// 用法: node grab-page.mjs <url> <outPrefix> [waitMs]
import { writeFileSync } from "node:fs";

const [url, prefix = "/tmp/page", waitMs = "6000"] = process.argv.slice(2);

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("没有可用的 page target");

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = [];
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
    } else if (msg.method) {
        events.push(msg);
    }
});

await new Promise((r) => ws.addEventListener("open", r, { once: true }));
await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, Number(waitMs)));

// 正文 HTML（去掉 script/style，便于人读结构）
const { result: htmlRes } = await send("Runtime.evaluate", {
    expression: `(() => {
    const el = document.querySelector('main') || document.body;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('script,style,svg,link,noscript').forEach(n => n.remove());
    return clone.innerHTML;
  })()`,
    returnByValue: true,
});
writeFileSync(`${prefix}.html`, htmlRes.value ?? "", "utf8");

// 可见文本（含层级），方便看信息组织顺序
const { result: textRes } = await send("Runtime.evaluate", {
    expression: `(() => {
    const out = [];
    const walk = (n, depth) => {
      if (n.nodeType === 1) {
        const cls = (n.className && typeof n.className === 'string') ? n.className.split(' ').slice(0,2).join('.') : '';
        const own = [...n.childNodes].filter(c => c.nodeType === 3).map(c => c.textContent.trim()).filter(Boolean).join(' ');
        if (own) out.push('  '.repeat(depth) + (n.tagName.toLowerCase()) + (cls ? '.' + cls : '') + ' :: ' + own.slice(0, 90));
        [...n.children].forEach(c => walk(c, depth + 1));
      }
    };
    walk(document.querySelector('main') || document.body, 0);
    return out.join('\\n');
  })()`,
    returnByValue: true,
});
writeFileSync(`${prefix}.txt`, textRes.value ?? "", "utf8");

const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
writeFileSync(`${prefix}.png`, Buffer.from(shot.data, "base64"));

console.log("saved", prefix + ".png/.html/.txt");
ws.close();
