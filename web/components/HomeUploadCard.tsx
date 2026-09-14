"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Loader2, Lock, UploadCloud } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { putPendingLog } from "@/lib/pending-log";

/**
 * 首页日志上传卡：拖拽或点击选择 .ulg → 暂存到 IndexedDB → 跳转分析页自动解析。
 * 首页不做解析，避免把 Pyodide 运行时压到首屏。
 */
export function HomeUploadCard() {
  const { t } = useLanguage();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept(file: File) {
    if (!file.name.toLowerCase().endsWith(".ulg")) {
      setError(t("当前仅支持 PX4 .ulg 日志", "Only PX4 .ulg logs are supported for now"));
      return;
    }
    setError(null);
    setBusy(true);
    await putPendingLog(file);
    router.push("/analyze");
  }

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
            {t("上传日志", "Upload log")}
          </p>
          <h2 className="mt-2.5 text-lg font-semibold">
            {t("分析一份飞控日志", "Analyze a flight log")}
          </h2>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted">
          <FileCheck2 className="h-4 w-4" />
        </span>
      </div>

      <div
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void accept(f);
        }}
        className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? "border-primary bg-primary-soft" : "border-border-strong hover:border-text"
        }`}
      >
        {busy ? (
          <Loader2 className="mb-3 h-7 w-7 animate-spin text-muted" />
        ) : (
          <UploadCloud className="mb-3 h-7 w-7 text-muted" />
        )}
        <p className="text-sm font-medium">
          {busy
            ? t("正在准备分析…", "Preparing analysis…")
            : t("选择或拖入 PX4 .ulg 日志", "Choose or drop a PX4 .ulg log")}
        </p>
        <p className="mt-1 text-xs text-muted">
          {t("选择后自动跳转到分析页", "You'll be taken to the analyzer automatically")}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".ulg,.ULG"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void accept(f);
          }}
        />
      </div>

      {error && <p className="mt-2 text-xs text-critical">{error}</p>}


      <p className="mt-5 flex items-start gap-2 border-t border-border pt-4 text-xs leading-5 text-muted">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t(
          "解析在浏览器本地完成（Pyodide + Web Worker），原始日志不会上传。",
          "Parsing runs locally in your browser (Pyodide + Web Worker); the raw log never leaves your device.",
        )}
      </p>
    </div>
  );
}
