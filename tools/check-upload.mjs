// 浏览器端日志分析链路自检：导航 → 塞入 .ulg → 等报告 → 截图。
// 用法: node check-upload.mjs <ulog 路径> <out.png> [baseUrl] [light|dark]
// 依赖: 已用 --remote-debugging-port=9222 启动的 Chrome。
import { writeFileSync } from "node:fs";

const [logPath, out, base = "http://localhost:3000", theme = "light"] = process.argv.slice(2);
if (!logPath || !out) {
  console.error("用法: node check-upload.mjs <ulog 路径> <out.png> [baseUrl] [light|dark]");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
    return;
  }
  // 只记录，绝不抛：事件监听里抛错会让整个脚本崩掉，掩盖真正的失败原因
  try {
    if (msg.method === "Runtime.exceptionThrown") {
      events.push(
        "EXC " +
          String(
            msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text,
          ).slice(0, 300),
      );
    } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type !== "log") {
      events.push(
        msg.params.type +
          ": " +
          msg.params.args.map((a) => String(a.value ?? a.description ?? "")).join(" ").slice(0, 250),
      );
    }
  } catch {
    /* 忽略 */
  }
});
ws.addEventListener("error", () => {});

await new Promise((r) => ws.addEventListener("open", r, { once: true }));
await send("Page.enable");
await send("DOM.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1300,
  deviceScaleFactor: 2,
  mobile: false,
});

await send("Page.navigate", { url: `${base}/analyze` });

const evalIn = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  return r?.result?.value;
};

/**
 * 等 React 完成 hydration 再动手。
 * 之前偶发"文件塞进去了、页面却毫无反应"，根因就是 dev server 刚重编译完，
 * 4 秒后 DOM 在、事件处理器还没挂上，派发的 change 落到未 hydrate 的节点上。
 * React 会在 DOM 节点上留下 __reactProps$xxx，用它判断处理器是否已就绪。
 */
let hydrated = false;
for (let i = 0; i < 40; i++) {
  const ready = await evalIn(`(() => {
    const el = document.querySelector('input[type="file"]');
    if (!el) return false;
    return Object.keys(el).some((k) => k.startsWith('__reactProps'));
  })()`);
  if (ready) {
    hydrated = true;
    console.log(`页面已 hydrate（等待 ${i * 0.5}s）`);
    break;
  }
  await sleep(500);
}
if (!hydrated) console.log("⚠ 未检测到 hydration，仍继续尝试（可能是生产构建或被缓存）");

console.log("页面:", await evalIn("location.pathname"));

/** 把文件塞进 input 并派发 change；返回页面是否开始响应 */
async function tryUpload() {
  const doc = await send("DOM.getDocument", { depth: 1 });
  const found = await send("DOM.querySelector", {
    nodeId: doc.root.nodeId,
    selector: 'input[type="file"]',
  });
  if (!found.nodeId) throw new Error("页面上没找到 file input");
  await send("DOM.setFileInputFiles", { nodeId: found.nodeId, files: [logPath] });
  const n = await evalIn("document.querySelector('input[type=file]').files.length");
  // setFileInputFiles 只把文件塞进 input，不保证触发事件（Chrome 版本间行为不一致），
  // 必须显式派发；若 React 仍未接住则重试（见下方的响应判定）
  await evalIn(
    "document.querySelector('input[type=file]').dispatchEvent(new Event('change',{bubbles:true}))",
  );
  await sleep(2500);
  const reacted = await evalIn(`(() => {
    const t = document.body.innerText;
    return /加载浏览器端 Pyodide|安装 pyulog|解析日志并执行检查规则|检查明细（确定性引擎）|生成 AI 中文报告|此前已分析过|上传失败|引擎加载失败/.test(t);
  })()`);
  return { files: n, reacted };
}

for (let attempt = 1; attempt <= 4; attempt++) {
  const r = await tryUpload();
  if (r.reacted) break;
  console.log(`  第 ${attempt} 次上传未触发解析（input.files=${r.files}），重试…`);
}

let state = "(none)";
for (let i = 0; i < 75; i++) {
  await sleep(4000);
  state = await evalIn(`(() => {
    const t = document.body.innerText;
    if (t.includes("检查明细（确定性引擎）") || t.includes("生成 AI 中文报告")) return "READY";
    const m = t.match(/加载浏览器端 Pyodide 运行时|安装 pyulog 解析器|解析日志并执行检查规则/);
    if (m) return "stage:" + m[0];
    const e = t.match(/本地解析引擎加载失败[^\\n]*|日志上传失败[^\\n]*|PythonError[^\\n]*/);
    if (e) return "ERR:" + e[0].slice(0, 120);
    return "idle";
  })()`);
  if (i % 4 === 0 || state === "READY" || String(state).startsWith("ERR")) {
    console.log(`t=${i * 4}s ${state}`);
  }
  if (state === "READY" || String(state).startsWith("ERR")) break;
}

await evalIn(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
await sleep(500);
const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log("最终状态:", state);
console.log("saved", out);
console.log("--- 控制台/异常 ---\n" + (events.slice(0, 15).join("\n") || "(none)"));
ws.close();
process.exit(0);
