// 历史回看/完整数据恢复的自检：上传 → 观察去重与缓存 → 点「解析完整数据」→ 验证 tab 可用。
// 用法: node check-restore.mjs <ulog 路径> [baseUrl]
import { writeFileSync } from "node:fs";

const [logPath, base = "http://localhost:3000"] = process.argv.slice(2);
if (!logPath) {
    console.error("用法: node check-restore.mjs <ulog 路径> [baseUrl]");
    process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (m, p = {}) =>
    new Promise((res, rej) => {
        const n = ++id;
        pending.set(n, { res, rej });
        ws.send(JSON.stringify({ id: n, method: m, params: p }));
    });
ws.addEventListener("message", (e) => {
    let msg;
    try {
        msg = JSON.parse(e.data);
    } catch {
        return;
    }
    if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
    }
});
ws.addEventListener("error", () => {});
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
await send("Page.enable");
await send("DOM.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1400,
    deviceScaleFactor: 2,
    mobile: false,
});

const ev = async (expr) => {
    const r = await send("Runtime.evaluate", {
        expression: expr,
        returnByValue: true,
    });
    return r?.result?.value;
};

/** 报告页状态：tab 是否可用 + 缓存提示是否存在 */
const state = `(() => {
  const t = document.body.innerText;
  const span = (label) => {
    const el = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label);
    return el ? (el.disabled ? "disabled" : "enabled") : "missing";
  };
  return JSON.stringify({
    charts: span("数据图表"),
    params: span("飞控参数"),
    hasDedupe: t.includes("此前已分析过"),
    hasRestoreBtn: t.includes("解析完整数据"),
    hasCacheLine: t.includes("本机缓存了"),
    hasHistoryNote: t.includes("历史回看只存档了"),
  });
})()`;

await send("Page.navigate", { url: `${base}/analyze` });
await sleep(4500);

const doc = await send("DOM.getDocument", { depth: 1 });
const found = await send("DOM.querySelector", {
    nodeId: doc.root.nodeId,
    selector: 'input[type="file"]',
});
await send("DOM.setFileInputFiles", { nodeId: found.nodeId, files: [logPath] });
await ev("document.querySelector('input[type=file]').dispatchEvent(new Event('change',{bubbles:true}))");

for (let i = 0; i < 30; i++) {
    await sleep(3000);
    const s = JSON.parse(await ev(state));
    if (s.hasDedupe || s.charts !== "missing") {
        console.log(`上传后 ${i * 3}s:`, s);
        break;
    }
}

// 若命中去重，点「解析完整数据」补全（正是原先被困死的路径）
if (await ev(`document.body.innerText.includes("解析完整数据")`)) {
    console.log("命中去重 → 点击「解析完整数据」");
    await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('解析完整数据')).click()`);
    for (let i = 0; i < 40; i++) {
        await sleep(3000);
        const s = JSON.parse(await ev(state));
        if (s.charts === "enabled") {
            console.log(`补全完成 ${i * 3}s:`, s);
            break;
        }
    }
}

// 再回看一次历史条目，确认图表仍可用（历史条目应带「完整数据」入口）
await sleep(1000);
const final = JSON.parse(await ev(state));
console.log("最终:", final);
console.log("缓存足迹:", await ev(`document.body.innerText.match(/本机缓存了[^。]*。/)?.[0] ?? "(无)"`));
const shot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
});
writeFileSync(process.env.OUT ?? "/tmp/restore.png", Buffer.from(shot.data, "base64"));
console.log("saved", process.env.OUT ?? "/tmp/restore.png");
ws.close();
process.exit(0);
