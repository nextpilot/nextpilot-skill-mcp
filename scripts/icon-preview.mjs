// 把 icon.svg 从 16px 到 180px 排成一行，浅底/深底各一遍，用来判断小尺寸下还认不认得出。
// 用法: node icon-preview.mjs <svg路径> <输出png>
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [svgPath, out] = process.argv.slice(2);
// 去掉 XML 声明，内联进 HTML
const svg = readFileSync(svgPath, "utf8").replace(/<\?xml[^>]*\?>/, "");

const sizes = [16, 20, 24, 32, 48, 64, 180];
const row = (bg, label) => `
  <div class="row" style="background:${bg}">
    <span class="label" style="color:${bg === "#ffffff" ? "#555" : "#bbb"}">${label}</span>
    ${sizes.map((s) => `<div class="cell"><div class="mark" style="width:${s}px;height:${s}px">${svg}</div><span style="color:${bg === "#ffffff" ? "#777" : "#999"}">${s}</span></div>`).join("")}
  </div>`;

const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin:0; font:12px/1.4 system-ui, sans-serif; }
  .row { display:flex; align-items:flex-end; gap:26px; padding:22px 26px; }
  .cell { display:flex; flex-direction:column; align-items:center; gap:7px; }
  .mark svg { display:block; width:100%; height:100%; }
  .label { width:64px; font-weight:600; }
</style>
${row("#ffffff", "light tab")}
${row("#f1f3f4", "grey tab")}
${row("#202124", "dark tab")}
${row("#000000", "black")}
`;

const file = join(tmpdir(), "icon-preview.html");
writeFileSync(file, html, "utf8");

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((t) => t.type === "page");
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
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
});
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 900, height: 620, deviceScaleFactor: 3, mobile: false,
});
await send("Page.navigate", { url: pathToFileURL(file).href });
await new Promise((r) => setTimeout(r, 900));
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log("saved", out);
ws.close();
process.exit(0);
