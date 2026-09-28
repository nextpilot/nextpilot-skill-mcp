/**
 * 解析运行时的持久缓存（Service Worker + Cache API）。
 *
 * 目标：Pyodide 运行时（约 13MB）+ numpy / micropip（约 3MB）+ pyulog（51KB）**只下载一次**，
 * 之后全部走本地缓存——离线也能在本机解析日志。
 *
 * 为什么不能只靠浏览器 HTTP 缓存：
 *   1) `micropip.install()` 每次都先查 PyPI 索引（响应 no-cache，压根不受缓存保护）；
 *   2) 用户清缓存 / 隐私模式 / 磁盘压力会静默丢弃，用户无感；
 *   3) jsdelivr 与 PyPI 的跨境链路抖动大，慢到像没缓存。
 *
 * 拦截范围**只有** `/pyodide/` 目录（自托管运行时资产）与 PyPI 兜底地址；
 * 站点自身资源（`/_next/` 等）、`/api`、`/internal` 一律**不拦不缓存**，
 * 所以站点更新、鉴权、配额完全不受影响（这也是不把它做成完整 PWA 的原因）。
 *
 * ⚠️ 注意 `importScripts` 是本 SW 管不到的：`pyodide.js` 用它**同步**加载 `pyodide.asm.js`，
 * 而 `importScripts` 由 WorkerGlobalScope 直接发起、不走 fetch 事件，这里拦不住。
 * 所以 worker 侧另有 `preloadForImportScripts()` 先用 fetch 把它拉进缓存——
 * 两处是配套的，改一个要想到另一个（见 web/workers/analysis-worker.ts）。
 *
 * 配置由注册时的查询参数传入（见 components/RuntimeCacheRegistrar.tsx）：
 *   /sw.js?pyodide=<Pyodide 索引目录>&wheel=<pyulog wheel 直链>
 * 参数变化 → 脚本 URL 变化 → 浏览器装新版本 → 旧缓存自动清掉（天然处理换源与升级）。
 */

const params = new URL(self.location).searchParams;
// 正常情况下注册方（RuntimeCacheRegistrar）一定会带上绝对 URL 的 pyodide/wheel 参数；
// 这里的默认值只在"参数缺失"时兜底，用自托管路径（相对 self.origin 拼绝对地址）。
const PYODIDE_INDEX = params.get("pyodide") || new URL("/pyodide/v0.27.7/full/", self.location.origin).href;
const PYULOG_WHEEL =
    params.get("wheel") || new URL("/pyodide/wheels/pyulog-1.2.4-py3-none-any.whl", self.location.origin).href;

/** 运行时资源的地址前缀（命中即缓存） */
const RUNTIME_PREFIXES = [
    PYODIDE_INDEX,
    PYULOG_WHEEL,
    // 没配自托管 wheel 时，micropip 会走 PyPI：索引页 no-cache，正是最该缓存的那一步
    "https://pypi.org/simple/",
    "https://files.pythonhosted.org/",
].filter(Boolean);

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
    // 同源时进一步收窄：只认 /pyodide/ 前缀，避免误伤站点资源（见文件头说明）。
    // 自托管后 PYODIDE_INDEX 就在同源下，不这样收窄的话前缀一放宽就会连 `/_next/` 一起管。
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
