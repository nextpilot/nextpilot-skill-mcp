// 浏览器端日志分析链路自检：开全新标签页 → 清历史去重 → 塞入 .ulg → 等报告 → 截图。
// 用法: node check-upload.mjs <ulog 路径> <out.png> [baseUrl] [light|dark] [keep-history]
// 依赖: 已用 --remote-debugging-port=9222 启动的 Chrome。
// 默认清掉该源 localStorage（报告去重存这里）——否则同一日志会走“此前已分析过”捷径，
// 根本不启动 Pyodide，e2e 就测不到引擎。第 5 个参数传 keep-history 可保留。
import { writeFileSync } from "node:fs";

const [logPath, out, base = "http://localhost:3000", theme = "light", keepHistory = ""] = process.argv.slice(2);
if (!logPath || !out) {
    console.error("用法: node check-upload.mjs <ulog 路径> <out.png> [baseUrl] [light|dark] [keep-history]");
    process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 每次开“全新标签页”：复用用户当前标签会被其上残留的调试状态/未关闭的 CDP 会话
// 拖死（实测标签会永久不响应 Runtime.evaluate），新开的标签页无此问题。
// 从 about:blank 起步，再用 Page.navigate 单次加载 /log。
// 不能让新标签直接开 /log 再 navigate 一次：双次加载下实测页面在派发 change
// 之后数秒主线程失去响应（Runtime.evaluate 永不回包），原因在 DevTools/加载竞态，
// 单次导航稳定复现不了该问题。
const page = await (
    await fetch("http://127.0.0.1:9222/json/new?about:blank", {
        method: "PUT",
    })
).json();
if (!page.webSocketDebuggerUrl) throw new Error("无法创建新标签页：" + JSON.stringify(page));
console.log("新标签页:", page.id);

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
                    msg.params.args
                        .map((a) => String(a.value ?? a.description ?? ""))
                        .join(" ")
                        .slice(0, 250),
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

await send("Page.navigate", { url: `${base}/log` });

const evalIn = async (expr) => {
    const r = await send("Runtime.evaluate", {
        expression: expr,
        returnByValue: true,
    });
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

// 清掉去重历史（localStorage 报告存档 + IndexedDB 原始日志缓存），强制走一次完整解析，
// 否则同一日志只载入历史结论，Pyodide/规则引擎完全不启动，e2e 失去意义。
if (keepHistory !== "keep-history") {
    await evalIn("localStorage.clear(); sessionStorage.clear(); 'cleared'");
    // awaitPromise：等 IndexedDB 删除真正结束再上传，避免删库与页面打开数据库竞态
    await send("Runtime.evaluate", {
        awaitPromise: true,
        returnByValue: true,
        expression: `(async () => {
    const dbs = await (indexedDB.databases?.() ?? Promise.resolve([]));
    await Promise.all(dbs.map((d) => new Promise((r) => {
      const req = indexedDB.deleteDatabase(d.name);
      req.onsuccess = req.onerror = req.onblocked = () => r();
    })));
  })()`,
    });
    console.log("已清空本机历史（强制重新解析）；加 keep-history 参数可保留");
}

/** 把文件塞进 input 并派发 change；返回页面是否开始响应 */
async function tryUpload() {
    const doc = await send("DOM.getDocument", { depth: 1 });
    const found = await send("DOM.querySelector", {
        nodeId: doc.root.nodeId,
        selector: 'input[type="file"]',
    });
    if (!found.nodeId) throw new Error("页面上没找到 file input");
    await send("DOM.setFileInputFiles", {
        nodeId: found.nodeId,
        files: [logPath],
    });
    const n = await evalIn("document.querySelector('input[type=file]').files.length");
    // setFileInputFiles 只把文件塞进 input，不保证触发事件（Chrome 版本间行为不一致），
    // 必须显式派发；若 React 仍未接住则重试（见下方的响应判定）
    await evalIn("document.querySelector('input[type=file]').dispatchEvent(new Event('change',{bubbles:true}))");
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
// 冷启 Pyodide（下载运行时 + micropip 装 pyulog）在慢网下可能要 5 分钟以上，给到 8 分钟
for (let i = 0; i < 120; i++) {
    await sleep(4000);
    // 心跳：eval 8 秒不回说明标签页主线程卡死，别无限等
    let stateRaw;
    try {
        stateRaw = await Promise.race([
            (async () =>
                (
                    await send("Runtime.evaluate", {
                        expression: `(() => {
    const t = document.body.innerText;
    if (t.includes("检查明细（确定性引擎）") || t.includes("生成 AI 中文报告")) return "READY";
    const m = t.match(/加载浏览器端 Pyodide 运行时|安装 pyulog 解析器|解析日志并执行检查规则/);
    if (m) return "stage:" + m[0];
    const e = t.match(/本地解析引擎加载失败[^\\n]*|日志上传失败[^\\n]*|PythonError[^\\n]*/);
    if (e) return "ERR:" + e[0].slice(0, 120);
    return "idle";
  })()`,
                        returnByValue: true,
                    })
                ).result?.value)(),
            new Promise((r) => setTimeout(() => r("__HANG__"), 8000)),
        ]);
    } catch (err) {
        stateRaw = "__HANG__:" + String(err).slice(0, 120);
    }
    state = stateRaw;
    if (state === "__HANG__" || String(state).startsWith("__HANG__")) {
        console.log(`t=${i * 4}s 标签页无响应（${state}），终止`);
        state = "ERR:renderer-hang";
        break;
    }
    if (i % 3 === 0 || state === "READY" || String(state).startsWith("ERR")) {
        console.log(`t=${i * 4}s ${state}`);
    }
    if (state === "READY" || String(state).startsWith("ERR")) break;
}

await evalIn(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
await sleep(500);
// 只截视口：captureBeyondViewport 要做整页布局，长报告 + plotly 图表下会让截图
// 请求永不返回，并把该 target 的 CDP 命令队列一起堵死（后续 Runtime.evaluate 全部超时，
// 表现像“页面卡死”）。视口截图与已 emulate 的 1440x1300 一致即可。
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log("最终状态:", state);
console.log("saved", out);
console.log("--- 控制台/异常 ---\n" + (events.slice(0, 15).join("\n") || "(none)"));
ws.close();
await fetch(`http://127.0.0.1:9222/json/close/${encodeURIComponent(page.id)}`).catch(() => {});
process.exit(state === "READY" ? 0 : 2);
