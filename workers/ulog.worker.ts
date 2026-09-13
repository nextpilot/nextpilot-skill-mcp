/// <reference lib="webworker" />
/**
 * ULog 端侧解析 Worker（CLAUDE.md 4.2 第一、二层）。
 * Pyodide（WASM CPython）在浏览器内运行 pyulog，原始日志不离开本机。
 */
import { PY_ULG_CHECKS } from "./ulog-check-script";

// 默认走 jsdelivr CDN；生产可在 .env 中改 NEXT_PUBLIC_PYODIDE_URL 指向 EdgeOne Blob 自托管
const PYODIDE_INDEX_URL =
  process.env.NEXT_PUBLIC_PYODIDE_URL ??
  "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";

export type WorkerStage =
  | "loading-runtime"
  | "installing-parser"
  | "parsing"
  | "done";

export type WorkerOutMessage =
  | { type: "stage"; stage: WorkerStage; detail?: string }
  | { type: "done"; report: unknown }
  | { type: "error"; message: string };

const post = (msg: WorkerOutMessage) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

self.onmessage = async (event: MessageEvent<{ type: string; file: Uint8Array }>) => {
  const { type, file } = event.data;
  if (type !== "analyze") return;

  try {
    post({ type: "stage", stage: "loading-runtime", detail: "加载 Pyodide 运行时…" });
    const mod = await import(
      /* webpackIgnore: true */
      /* turboIgnore: true */
      PYODIDE_INDEX_URL + "pyodide.js"
    );
    const loadPyodide = mod.loadPyodide;
    const pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });

    post({ type: "stage", stage: "installing-parser", detail: "安装 pyulog…" });
    await pyodide.loadPackage(["micropip", "numpy"]);
    const micropip = pyodide.pyimport("micropip");
    await micropip.install("pyulog");

    post({ type: "stage", stage: "parsing", detail: "解析日志并执行检查规则…" });
    pyodide.globals.set("ulog_bytes", file);
    const raw = await pyodide.runPythonAsync(PY_ULG_CHECKS);
    const report = JSON.parse(raw as string);

    post({ type: "done", report });
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
