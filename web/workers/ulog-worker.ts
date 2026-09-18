/// <reference lib="webworker" />
/**
 * ULog 端侧解析 Worker（CLAUDE.md 4.2 第一、二层）。
 * Pyodide（WASM CPython）在浏览器内运行 pyulog，原始日志不离开本机。
 *
 * 协议：
 * - 入站 analyze {file}：加载运行时（只一次）→ 解析 → 规则 → done
 * - 入站 series {reqId, request}：按预设的取数声明懒抽取降采样时序（换算在引擎侧）
 * - 出站 done {report, manifest, info} / series {reqId, data} / stage / error
 */
import { PY_ULG_CHECKS } from "./ulog-check-script";
import { PY_ULG_DATA_HELPERS } from "./ulog-data-script";
import type { LogInfo, TopicManifest } from "@/lib/types";
import type { SeriesRequest } from "@/lib/chart-presets";

// 默认走 jsdelivr CDN；生产建议改 NEXT_PUBLIC_PYODIDE_URL 指向自托管（EdgeOne Blob）——
// 国内访问 jsdelivr / PyPI 都不稳，自托管后运行时与 wheel 都是一次下载、长期缓存。
const PYODIDE_INDEX_URL =
  process.env.NEXT_PUBLIC_PYODIDE_URL ??
  "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";

// pyulog 的 wheel 地址（可选）。给了就直接装这个文件：**跳过 PyPI 索引查询**（那一步每次
// 都要联网、且不受缓存保护），配合自托管就是"下载一次"。用 tools/px4/fetch-pyodide-assets.py 抓。
const PYULOG_WHEEL = process.env.NEXT_PUBLIC_PYULOG_WHEEL ?? "";

export type WorkerStage =
  | "loading-runtime"
  | "installing-parser"
  | "parsing"
  | "done";

export type WorkerInMessage =
  | { type: "analyze"; file: Uint8Array; }
  | { type: "track"; reqId: string; }
  | {
    type: "series";
    reqId: string;
    /** 取数声明（前端从预设拼好，引擎解释）：字段引用 + 候选组 + 单位 + 换算节点 */
    request: SeriesRequest;
  };

export type WorkerOutMessage =
  | { type: "stage"; stage: WorkerStage; detail?: string; }
  | {
    type: "done";
    report: unknown;
    manifest: TopicManifest;
    info: LogInfo;
  }
  | { type: "series"; reqId: string; data: unknown; }
  | { type: "track"; reqId: string; data: unknown; }
  | { type: "error"; message: string; };

const post = (msg: WorkerOutMessage) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

// 项目未安装 pyodide npm 类型包；Worker 内只用到下列方法，保持宽松类型
type Pyodide = {
  loadPackage: (names: string[]) => Promise<void>;
  pyimport: (name: string) => { install: (spec: string) => Promise<unknown>; };
  globals: {
    set: (key: string, value: unknown) => void;
    get: (key: string) => unknown;
  };
  runPythonAsync: (code: string) => Promise<unknown>;
};

type LoadPyodide = (opts: { indexURL: string; }) => Promise<Pyodide>;

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
    const loadPyodide = (
      self as unknown as { loadPyodide?: LoadPyodide; }
    ).loadPyodide;
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
      const msg =
        lastErr instanceof Error ? lastErr.message : String(lastErr);
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

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  try {
    const pyodide = await getPyodide();

    if (msg.type === "track") {
      try {
        // Python 侧（规则 + 数据层）是每次 analyze 时 exec 出来的：没跑过分析时命名空间里
        // 连 ulog 都没有，直接调 np_track() 会是 NameError。这里先探一下，给人话错误。
        if (!pyodide.globals.get("ulog")) {
          post({
            type: "track",
            reqId: msg.reqId,
            // code 让界面能区分"重选文件就能救回来"与"这份日志本来就没有轨迹"：
            // 前者要给按钮，后者给按钮是误导（再选一次还是同样的结果）
            data: {
              error: "这份日志还没在本机解析过，重新选择该 .ulg 文件即可恢复轨迹。",
              code: "not-parsed",
            },
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

    post({ type: "done", report, manifest, info });
  } catch (err) {
    post({
      type: "error",
      message:
        err instanceof Error
          ? `${err.name}: ${err.message}`
          : "解析失败：" + String(err),
    });
  }
};