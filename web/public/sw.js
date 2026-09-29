/**
 * 解析运行时的持久缓存（Service Worker + Cache API）：Pyodide 运行时（约 13MB）+ numpy /
 * micropip（约 3MB）+ pyulog（51KB）只下载一次，之后走本地缓存。
 *
 * 不能只靠浏览器 HTTP 缓存：micropip.install() 每次先查 PyPI 索引（no-cache）；用户清缓存 /
 * 隐私模式 / 磁盘压力会静默丢弃；jsdelivr 与 PyPI 跨境链路抖动大。
 *
 * 只拦 `/pyodide/`（自托管运行时资产）与 PyPI 兜底地址；站点自身资源（`/_next/` 等）、`/api`、
 * `/internal` 不拦不缓存，故站点更新、鉴权、配额不受影响（这也是不做完整 PWA 的原因）。
 *
 * `importScripts` 本 SW 管不到（见 web/workers/analysis-worker.ts 的 preloadForImportScripts，
 * 两处配套，改一个要想到另一个）。
 *
 * 配置由注册时的查询参数传入（见 components/RuntimeCacheRegistrar.tsx）：
 * /sw.js?pyodide=<索引目录>&wheel=<wheel 直链>；参数变化 → 脚本 URL 变化 → 装新版本 → 旧缓存自动清掉。
 */

const params = new URL(self.location).searchParams;
// 注册方一定会传这些参数，这里不兜底：缺参数说明调用方出 bug，静默填一个错的前缀比直接报错更难排查
const PYODIDE_INDEX = params.get("pyodide");
const PYULOG_WHEEL = params.get("wheel");

if (!PYODIDE_INDEX || !PYULOG_WHEEL) {
    throw new Error("[sw] 缺少配置参数，请通过 RuntimeCacheRegistrar 注册，不要直接注册 /sw.js");
}

/** 运行时资源的地址前缀（命中即缓存） */
const RUNTIME_PREFIXES = [
    PYODIDE_INDEX,
    PYULOG_WHEEL,
    // 兜底源：Pyodide 自托管不可用时回退 jsdelivr CDN
    "https://cdn.jsdelivr.net/pyodide/",
    // PyPI 兜底：micropip 查索引 + 下载 wheel（索引页 no-cache，正是最该缓存的那一步）
    "https://pypi.org/simple/",
    "https://files.pythonhosted.org/",
];

// 缓存名带上配置指纹：换源/升级后自动启用新缓存，旧的在 activate 里删掉
const CONFIG_KEY = `${PYODIDE_INDEX}|${PYULOG_WHEEL}`;
let configHash = 0;
for (let i = 0; i < CONFIG_KEY.length; i++) {
    configHash = (configHash * 31 + CONFIG_KEY.charCodeAt(i)) | 0;
}
const CACHE_NAME = `nextpilot-runtime-${(configHash >>> 0).toString(36)}`;

/** 只有 `/pyodide/` 目录会被本 SW 接管；站点自身的 `/_next/` 等一律不拦不缓存。 */
const PYODIDE_SAME_ORIGIN_PREFIX = new URL("/pyodide/", self.location.origin).href;

const isRuntimeRequest = (url) => {
    // 同源时进一步收窄到 /pyodide/ 前缀，避免误伤站点资源；自托管后 PYODIDE_INDEX 就在同源下，
    // 不收窄的话前缀一放宽就会连 `/_next/` 一起管。
    if (url.startsWith(self.location.origin)) return url.startsWith(PYODIDE_SAME_ORIGIN_PREFIX);
    return RUNTIME_PREFIXES.some((p) => url.startsWith(p));
};

self.addEventListener("install", () => {
    // 新版本立即接管，不阻塞在 waiting 状态（运行时不涉及数据迁移，安全）
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            // 只留当前配置的缓存
            for (const key of await caches.keys()) {
                if (key.startsWith("nextpilot-runtime-") && key !== CACHE_NAME) await caches.delete(key);
            }
            await self.clients.claim();
        })(),
    );
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;

    let url;
    try {
        url = new URL(req.url);
    } catch {
        return;
    }
    if (url.protocol !== "https:") return;
    if (!isRuntimeRequest(req.url)) return; // 其余一律直连（不缓存站点资源与 API）
    // 带 Range 的请求（部分取）不缓存：缓存整体响应会破坏后续按段请求的语义
    if (req.headers.get("range")) return;

    event.respondWith(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            const hit = await cache.match(req);
            if (hit) return hit;

            const resp = await fetch(req);
            // 只存成功的响应；写缓存失败（配额等）不影响本次返回
            if (resp && resp.ok) {
                cache.put(req, resp.clone()).catch(() => {});
            }
            return resp;
        })(),
    );
});
