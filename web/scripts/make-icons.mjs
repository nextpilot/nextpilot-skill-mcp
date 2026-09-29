// 由 app/icon.svg 生成位图图标：favicon.ico（16/32/48）与 apple-icon.png（180）。
//
// 自带光栅化：仓库没有图像依赖，而 Safari 16 以前不认 SVG 图标、只抓 /favicon.ico，
// iOS 加主屏要 apple-touch-icon，两条都不能靠 SVG。借已在跑的 headless Chrome 出 PNG，
// 再用纯拼装写 ICO（ICO 允许条目直接内嵌 PNG，不需要 BMP 编码）。
//
// 用法: 先以 --remote-debugging-port=9222 启动 Chrome，再 node web/scripts/make-icons.mjs
//
// 住在 web/scripts/ 根而非 browser/ 子目录：它是产物要提交的构建脚本（读 app/icon.svg、
// 写回 app/favicon.ico 与 apple-icon.png），与 build-knowledge.mjs 同类，只是借 Chrome 光栅化。
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "./lib/log.mjs";

// 本文件在 web/scripts/ 下，向上两级到仓库根（web/scripts/ -> web/ -> 仓库根）。
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ICON_SVG = join(root, "web", "app", "icon.svg");

const icoSizes = [16, 32, 48];
const appleSize = 180;

// ---------- 光栅化 ----------

const svgSource = readFileSync(ICON_SVG, "utf8").replace(/<\?xml[^>]*\?>/, "");

/**
 * iOS 的 apple-touch-icon 不要透明、不要自带圆角：系统会自己套圆角蒙版，
 * 我们留的透明圆角会被合成成黑边。
 */
const appleSource = svgSource.replace(/<rect width="64" height="64" rx="14"/, '<rect width="64" height="64"');

const htmlFor = (source, size) =>
    `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:transparent;width:${size}px;height:${size}px}
#m{line-height:0;width:${size}px;height:${size}px}
#m svg{display:block;width:${size}px;height:${size}px}
</style><div id="m">${source}</div>`;

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const target = targets.find((t) => t.type === "page");
if (!target) throw new Error("没有可用的 page target，请先启动 headless Chrome");

const ws = new WebSocket(target.webSocketDebuggerUrl);
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
// 强制透明底：否则 Chrome 见页面背景不透明就只输出 RGB（无 alpha）PNG，Next 的 ICO 解码器
// 会报 "The PNG is not in RGBA format"。显式给 alpha=0 底色覆盖，输出才会是 colorType 6（RGBA）。
await send("Emulation.setDefaultBackgroundColorOverride", {
    color: { r: 0, g: 0, b: 0, a: 0 },
});

/**
 * 每个尺寸单独写页面、单独导航、等加载完再截。
 * 不要改成「一个页面反复改 innerHTML 再按 clip 截」：合成器对同一目标尺寸变化处理不稳定，
 * 首帧之后的截图偶发拿到空白。
 */
async function raster(source, size) {
    const file = join(tmpdir(), `icon-${size}.html`);
    writeFileSync(file, htmlFor(source, size), "utf8");

    await send("Emulation.setDeviceMetricsOverride", {
        width: size,
        height: size,
        deviceScaleFactor: 1,
        mobile: false,
    });
    await send("Page.navigate", { url: pathToFileURL(file).href });
    await new Promise((r) => setTimeout(r, 700));

    const shot = await send("Page.captureScreenshot", {
        format: "png",
        omitBackground: true,
        clip: { x: 0, y: 0, width: size, height: size, scale: 1 },
    });
    return Buffer.from(shot.data, "base64");
}

// ---------- ICO 封装 ----------

/**
 * ICONDIR(6) + ICONDIRENTRY(16/条) + 各条目数据。
 * 宽高字段为 1 字节，256 用 0 表示；条目数据直接用 PNG，省掉 BMP 编码。
 */
function buildIco(images) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: 1 = icon
    header.writeUInt16LE(images.length, 4);

    let offset = 6 + images.length * 16;
    const entries = [];
    for (const { size, data } of images) {
        const entry = Buffer.alloc(16);
        entry.writeUInt8(size >= 256 ? 0 : size, 0);
        entry.writeUInt8(size >= 256 ? 0 : size, 1);
        entry.writeUInt8(0, 2); // 调色板数：真彩为 0
        entry.writeUInt8(0, 3); // reserved
        entry.writeUInt16LE(1, 4); // color planes
        entry.writeUInt16LE(32, 6); // bits per pixel
        entry.writeUInt32LE(data.length, 8);
        entry.writeUInt32LE(offset, 12);
        entries.push(entry);
        offset += data.length;
    }

    return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

// ---------- 产出 ----------

const icoImages = [];
for (const size of icoSizes) {
    icoImages.push({ size, data: await raster(svgSource, size) });
}

const ico = buildIco(icoImages);
const icoPath = join(root, "web", "app", "favicon.ico");
writeFileSync(icoPath, ico);
log.info(`favicon.ico  ${ico.length} B  (${icoSizes.join("/")})`);

const apple = await raster(appleSource, appleSize);
const applePath = join(root, "web", "app", "apple-icon.png");
writeFileSync(applePath, apple);
log.info(`apple-icon.png  ${apple.length} B  (${appleSize})`);

ws.close();
process.exit(0);
