// 上传一份 .ulg 到 /analyze 并等结果渲染后截图，用于核对报告页 UI（含芯片行/tab/图表）。
// 用法: node shot-report.mjs <ulog 绝对路径> <out.png> [light|dark] [width] [height]
// 依赖: 已用 --remote-debugging-port=9222 启动的 Chrome，dev server 跑在 3000 端口。
import { writeFileSync } from "node:fs";

const [logPath, out, theme = "light", w = "1440", h = "1000"] = process.argv.slice(2);
if (!logPath || !out) {
  console.error("用法: node shot-report.mjs <ulog 绝对路径> <out.png> [light|dark] [w] [h]");
  process.exit(1);
}

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Page.enable");
await send("DOM.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: +w,
  height: +h,
  deviceScaleFactor: 2,
  mobile: false,
});

await send("Page.navigate", { url: "http://localhost:3000/analyze" });
await sleep(2500);

// 把文件塞进隐藏的 file input，再派发 change 事件
const doc = await send("DOM.getDocument");
const { nodeId } = await send("DOM.querySelector", {
  nodeId: doc.root.nodeId,
  selector: 'input[type="file"]',
});
if (!nodeId) throw new Error("页面上没找到 file input");
// setFileInputFiles 自身会触发 change，不要再手动派发一次（会重复解析）
await send("DOM.setFileInputFiles", { nodeId, files: [logPath] });

// 等报告渲染：出现检查明细标题 / 生成报告按钮即为完成（首次要下 Pyodide 运行时）
// 注意别用「AI 中文解读」这类词做判据——右栏空态文案里也有，会立刻假命中
let ready = false;
for (let i = 0; i < 90; i++) {
  await sleep(2000);
  const { result } = await send("Runtime.evaluate", {
    expression: `(() => {
      const t = document.body.innerText;
      if (t.includes("检查明细（确定性引擎）") || t.includes("生成 AI 中文报告")) return "ready";
      const m = t.match(/加载浏览器端 Pyodide 运行时|安装 pyulog 解析器|解析日志并执行检查规则/);
      return m ? m[0] : "waiting";
    })()`,
  });
  if (result.value === "ready") {
    ready = true;
    break;
  }
  if (i % 5 === 0) console.log(`  …${result.value}`);
}
if (!ready) console.warn("  警告：等待超时，截到的可能仍是中间状态");
await sleep(1200);

await send("Runtime.evaluate", {
  expression: `document.documentElement.dataset.theme = ${JSON.stringify(theme)};
    document.head.appendChild(Object.assign(document.createElement('style'),{textContent:'*{transition:none!important;animation:none!important}'}));`,
});
await sleep(400);

const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log("saved", out);
ws.close();
process.exit(0);
