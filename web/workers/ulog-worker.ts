/// <reference lib="webworker" />
/**
 * ULog 端侧解析 Worker（CLAUDE.md 4.2 第一、二层）。
 * Pyodide（WASM CPython）在浏览器内运行 pyulog，原始日志不离开本机。
 *
 * 协议：
 * - 入站 analyze {file}：加载运行时（只一次）→ 解析 → 规则 → done
 * - 入站 series {reqId, topic, instance, fields}：懒抽取降采样时序
 * - 出站 done {report, manifest, info} / series {reqId, data} / stage / error
 */
import { PY_ULG_CHECKS } from "./ulog-check-script";
import { PY_ULG_DATA_HELPERS } from "./ulog-data-script";
import type { LogInfo, TopicManifest } from "@/lib/types";

// 默认走 jsdelivr CDN；生产可在 .env 中改 NEXT_PUBLIC_PYODIDE_URL 指向 EdgeOne Blob 自托管
const PYODIDE_INDEX_URL =
  process.env.NEXT_PUBLIC_PYODIDE_URL ??
  "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";

export type WorkerStage =
  | "loading-runtime"
  | "installing-parser"
  | "parsing"
  | "done";

export type WorkerInMessage =
  | { type: "analyze"; file: Uint8Array; }
  | {
    type: "series";
    reqId: string;
    topic: string;
    instance: number;
    fields: string[];
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
    const micropip = pyodide.pyimport("micropip");

    // micropip 从 PyPI 下载，浏览器网络可能不稳定，重试 3 次
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await micropip.install("pyulog");
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

    if (msg.type === "series") {
      try {
        // 入参经 json.dumps 字符串传入，避免 Python 侧注入问题
        const code = `np_series(${JSON.stringify(msg.topic)}, ${msg.instance}, ${JSON.stringify(
          JSON.stringify(msg.fields),
        )}, 3000)`;
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
    // 规则脚本 + 数据层 helpers 在同一 __main__ globals 中执行，共享 ulog 对象
    const report = await runJson(pyodide, PY_ULG_CHECKS + PY_ULG_DATA_HELPERS);
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