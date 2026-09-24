/// <reference lib="webworker" />
/**
 * ULog 端侧解析 Worker（CLAUDE.md 4.2 第一、二层）。
 * Pyodide（WASM CPython）在浏览器内运行 pyulog，原始日志不离开本机。
 *
 * 协议：
 * - 入站 analyze {file, logId}：加载运行时（只一次）→ 解析 → 规则 → done
 * - 入站 series {reqId, request, logId}：按预设的取数声明懒抽取降采样时序（换算在引擎侧）
 * - 入站 track {reqId, logId}：GPS 轨迹（多条）
 * - 出站 done {report, manifest, info, logId} / series {reqId, data} / track {reqId, data} / stage / error
 *
 * 请求都带 `logId`（日志内容指纹）：这个 Worker 是**共享**的、跨报告存活，
 * 一旦里面装的是另一份日志，取数据会静默拿错——见 logNotLoadedReason 的说明。
 */
import { PY_ULG_CHECKS } from "./pyodide-px4log-engine";
import { PY_ULG_DATA_HELPERS } from "./pyodide-px4log-data";
import type { LogInfo, TopicManifest } from "@/lib/types";
import type { SeriesRequest } from "@/lib/chart-presets";

// 默认走 jsdelivr CDN；生产建议改 NEXT_PUBLIC_PYODIDE_URL 指向自托管（EdgeOne Blob）——
// 国内访问 jsdelivr / PyPI 都不稳，自托管后运行时与 wheel 都是一次下载、长期缓存。
const PYODIDE_INDEX_URL = process.env.NEXT_PUBLIC_PYODIDE_URL ?? "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";

// pyulog 的 wheel 地址（可选）。给了就直接装这个文件：**跳过 PyPI 索引查询**（那一步每次
// 都要联网、且不受缓存保护），配合自托管就是"下载一次"。用 tools/dev/fetch_pyodide_assets.py 抓。
const PYULOG_WHEEL = process.env.NEXT_PUBLIC_PYULOG_WHEEL ?? "";

export type WorkerStage = "loading-runtime" | "installing-parser" | "parsing" | "done";

export type WorkerInMessage =
    | { type: "analyze"; file: Uint8Array; logId: string }
    | { type: "track"; reqId: string; logId: string }
    | {
          type: "series";
          reqId: string;
          /** 取数声明（前端从预设拼好，引擎解释）：字段引用 + 候选组 + 单位 + 换算节点 */
          request: SeriesRequest;
          logId: string;
      };

export type WorkerOutMessage =
    | { type: "stage"; stage: WorkerStage; detail?: string }
    | {
          type: "done";
          report: unknown;
          manifest: TopicManifest;
          info: LogInfo;
          /** 这次真正装进命名空间的是**哪一份**日志（analyze 带上来的指纹，原样回给前端）。
           *
           *  前端要拿它记住"Worker 现在装着谁"：这个 Worker 是共享且常驻的，
           *  跨报告存活，取数据前必须先知道要不要为当前这份日志补一次解析
           *  （见 hooks/useLogAnalyzer.ts 的 ensureLogLoaded）。不回传的话前端只能
           *  假设"我发过 analyze 就装上了"——而 analyze 是可能失败的。 */
          logId: string;
      }
    | { type: "series"; reqId: string; data: unknown }
    | { type: "track"; reqId: string; data: unknown }
    | { type: "error"; message: string };

const post = (msg: WorkerOutMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

// 项目未安装 pyodide npm 类型包；Worker 内只用到下列方法，保持宽松类型
type Pyodide = {
    loadPackage: (names: string[]) => Promise<void>;
    pyimport: (name: string) => { install: (spec: string) => Promise<unknown> };
    globals: {
        set: (key: string, value: unknown) => void;
        get: (key: string) => unknown;
    };
    runPythonAsync: (code: string) => Promise<unknown>;
};

type LoadPyodide = (opts: { indexURL: string }) => Promise<Pyodide>;

let pyodidePromise: Promise<Pyodide> | null = null;

async function getPyodide(): Promise<Pyodide> {
    if (pyodidePromise) return pyodidePromise;
    pyodidePromise = (async () => {
        post({ type: "stage", stage: "loading-runtime", detail: "加载 Pyodide 运行时…" });
        // CDN 的 pyodide.js 是 UMD 经典脚本：import 只触发副作用，函数挂在全局，
        // 没有 ESM 命名导出（直接取 mod.loadPyodide 会是 undefined）。
        await import(
            /* webpackIgnore: true */
            /* turboIgnore: true */
            PYODIDE_INDEX_URL + "pyodide.js"
        );
        const loadPyodide = (self as unknown as { loadPyodide?: LoadPyodide }).loadPyodide;
        if (typeof loadPyodide !== "function") {
            throw new Error(
                "Pyodide 脚本已加载但未找到 loadPyodide，请检查 NEXT_PUBLIC_PYODIDE_URL 是否指向完整的 pyodide.js 分发目录",
            );
        }
        const pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });

        post({ type: "stage", stage: "installing-parser", detail: "安装 pyulog…" });
        await pyodide.loadPackage(["micropip", "numpy"]);
        // lzma（可加载包，约 100KB）：日志自带的事件定义 metadata_events 是 xz 压缩的，解 PX4 事件要用。
        // 单独装且**允许失败**——拿不到就退化成"不解码事件"（日志里的旧格式事件文本仍在），
        // 不能因为它把整个解析挡在门外。
        try {
            await pyodide.loadPackage(["lzma"]);
        } catch (err) {
            console.warn("lzma 加载失败，PX4 事件将不解码：", err);
        }
        const micropip = pyodide.pyimport("micropip");

        // 装了自托管 wheel 就直接装它（不走 PyPI 索引）；否则回退到按包名装，重试 3 次
        const pyulogTarget = PYULOG_WHEEL || "pyulog";
        let lastErr: unknown;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await micropip.install(pyulogTarget);
                lastErr = null;
                break;
            } catch (e) {
                lastErr = e;
                if (attempt < 3) {
                    post({
                        type: "stage",
                        stage: "installing-parser",
                        detail: `安装 pyulog 失败，重试 ${attempt}/3…`,
                    });
                    await new Promise((r) => setTimeout(r, attempt * 2000));
                }
            }
        }
        if (lastErr) {
            const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
            throw new Error(
                `pyulog 安装失败（已重试 3 次）：${msg}\n\n` +
                    "可能原因：\n" +
                    "1. 网络不稳定或防火墙拦截了 PyPI 请求\n" +
                    "2. PyPI 服务暂时不可用\n" +
                    "3. 浏览器扩展（如广告拦截器）阻止了请求\n\n" +
                    "建议：刷新页面重试，或检查网络/防火墙设置。",
            );
        }
        return pyodide;
    })();
    return pyodidePromise;
}

/** 执行一段以 `__result = json.dumps(...)` 结尾的 Python，解析其 JSON 结果。 */
async function runJson(pyodide: Pyodide, code: string): Promise<unknown> {
    await pyodide.runPythonAsync(code);
    const raw = pyodide.globals.get("__result");
    if (typeof raw !== "string" || raw.length === 0) {
        throw new Error("Python 脚本未产出结果（__result 为空）");
    }
    return JSON.parse(raw);
}

/** 当前装在工作区里的是**哪一份**日志（内容指纹，analyze 成功后记下）。
 *  null = 这个 Worker 从建立起还没成功解析过任何日志。 */
let loadedLogId: string | null = null;

/**
 * 这次请求要的日志，现在答得了吗？答不了就返回给人看的理由。
 *
 * 两件事必须**同时**成立，所以放在一个函数里答——少了哪一条都会出问题：
 *
 * 1. **引擎命名空间装载了没有。** 规则脚本与数据层是每次 analyze 时 exec 进同一个
 *    `__main__` 命名空间的，没跑过分析就调 `np_track()` / `np_series()` 会是 NameError。
 *    这里探的名字必须和 bootstrap 真建的名字一致：产物里那行是 `provider = open_log(...)`，
 *    所以查 `provider`。**2026-09-18 的事故就是这里查了个不存在的名字**——写的是 `ulog`，
 *    而全仓库从来没有名为 `ulog` 的全局（pyulog 的 ULog 对象挂在 provider 上，`from pyulog
 *    import ULog` 只带来 `ULog`）。守卫于是恒真：轨迹请求**永远**被判成"没解析过"，
 *    轨迹画不出来、也从没进过存档，界面还一直说"重选文件即可恢复"——
 *    用户照做一遍，回到报告页看到同一句（复解析是成功的，只是 track 请求又被这道守卫挡了）。
 *    `tools/engine/check-pyodide-px4log-engine.py` 现在会真执行产物、拿命名空间核对这里查的名字。
 *
 * 2. **装的就是这一份。** 探到 provider 就直接发数据的话，工作区里装着日志 A、
 *    用户打开没有轨迹存档的报告 B 时，会把 A 的轨迹画成 B 的飞行记录——
 *    错得静悄悄，比报错难查得多。系列曲线同理。
 *
 * 指纹对不上**不算异常**，而且正常情况下走不到这里：前端在取数据之前会先补一次解析
 * （见 hooks/useLogAnalyzer.ts 的 ensureLogLoaded），让这个 Worker 装上它要的那一份。
 * 剩下能走到这里的只有一种情况——**字节已经不在用户手里了**（历史记录 + 本机缓存被淘汰／
 * 那份记录来自别的设备）：这时 Worker 只能说实话，界面给"重新选择该 .ulg 文件"的按钮，
 * 用户选一次即可恢复。**不要在这里给"能自己解决"的出路**：Worker 手里没有字节，救不了。
 */
function logNotLoadedReason(pyodide: Pyodide, logId: string): string | null {
    if (!pyodide.globals.get("provider")) {
        return "这份日志本次还没解析过，重新选择该 .ulg 文件即可恢复。";
    }
    if (!logId) {
        // 极老的记录没有日志指纹（内容哈希是后加的）：无从比对。这里说的是"确认不了"，
        // 而不是"装的是另一份"——后者是替用户下一个我们并不知道的结论
        return "这份报告没有记录日志指纹，无法确认当前解析的就是它，重新选择该 .ulg 文件即可恢复。";
    }
    if (logId !== loadedLogId) {
        return "当前解析的是另一份日志，重新选择该 .ulg 文件即可恢复。";
    }
    return null;
}

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
    const msg = event.data;
    try {
        const pyodide = await getPyodide();

        if (msg.type === "track") {
            try {
                const why = logNotLoadedReason(pyodide, msg.logId);
                if (why) {
                    post({
                        type: "track",
                        reqId: msg.reqId,
                        // code 让界面能区分"重选文件就能救回来"与"这份日志本来就没有轨迹"：
                        // 前者要给按钮，后者给按钮是误导（再选一次还是同样的结果）
                        data: { error: why, code: "log-not-loaded" },
                    });
                    return;
                }
                // 轨迹字段名与量纲随固件改过，候选与换算写在 facts.yaml 的 track 里（引擎侧解析）
                const data = await runJson(pyodide, "np_track()");
                post({ type: "track", reqId: msg.reqId, data });
            } catch (err) {
                post({
                    type: "track",
                    reqId: msg.reqId,
                    data: { error: err instanceof Error ? err.message : String(err) },
                });
            }
            return;
        }

        if (msg.type === "series") {
            try {
                // 与 track 同一道闸门：没有 provider 时直接跑 np_series 只会抛 NameError 给用户看，
                // 而装的是另一份日志时会**静默**取到别的日志的曲线（见 logNotLoadedReason）
                const why = logNotLoadedReason(pyodide, msg.logId);
                if (why) {
                    post({ type: "series", reqId: msg.reqId, data: { error: why } });
                    return;
                }
                // 取数声明整份由前端从预设拼好（字段引用/候选组/单位/换算节点），这里只转发给引擎：
                // np_series 自己解释它（见 engine/report_data.py）。入参经 json.dumps 字符串传入，
                // 避免 Python 侧注入问题。
                const code = `np_series(${JSON.stringify(JSON.stringify(msg.request))}, 3000)`;
                const data = await runJson(pyodide, code);
                post({ type: "series", reqId: msg.reqId, data });
            } catch (err) {
                post({
                    type: "series",
                    reqId: msg.reqId,
                    data: { error: err instanceof Error ? err.message : String(err) },
                });
            }
            return;
        }

        if (msg.type !== "analyze") return;

        post({ type: "stage", stage: "parsing", detail: "解析日志并执行检查规则…" });
        pyodide.globals.set("ulog_bytes", msg.file);
        // 装载：规则脚本 + 数据层 helpers 在同一 __main__ globals 中执行，共享 ulog 与 provider
        await pyodide.runPythonAsync(PY_ULG_CHECKS + PY_ULG_DATA_HELPERS);
        // 执行：三样都走具名入口。以前 report 是"执行脚本的副作用"留下的 `__result`，
        // 而 `__result` 是同一个全局、每次调用都被覆盖，所以读 report 必须先于读 manifest——
        // 那个顺序约束只写在注释里。现在没有这回事了。
        const report = await runJson(pyodide, "np_report()");
        const manifest = (await runJson(pyodide, "np_manifest()")) as TopicManifest;
        const info = (await runJson(pyodide, "np_log_info()")) as LogInfo;

        // **成功之后**才记"现在装的是这一份"：解析中途失败时命名空间里可能还留着上一份的
        // provider，先记就会让 track / series 把旧日志的数据当成新日志的交出去
        loadedLogId = msg.logId;
        post({ type: "done", report, manifest, info, logId: msg.logId });
    } catch (err) {
        post({
            type: "error",
            message: err instanceof Error ? `${err.name}: ${err.message}` : "解析失败：" + String(err),
        });
    }
};
