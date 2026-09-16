"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLogAnalyzer } from "@/hooks/useLogAnalyzer";
import { HistoryList } from "@/components/HistoryList";
import { takePendingLog } from "@/lib/pending-log";
import {
  UploadCloud,
  Loader2,
  History,
  ShieldAlert,
  Cloud,
  HardDrive,
} from "lucide-react";
import { LocalizedText } from "@/components/LocalizedText";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import type { HistoryItem } from "@/components/HistoryList";

const STAGE_TEXT: Record<string, string> = {
  "loading-runtime": "加载浏览器端 Pyodide 运行时",
  "installing-parser": "安装 pyulog 解析器",
  parsing: "解析日志并执行检查规则",
  done: "完成",
};

export function AnalyzeEntryClient() {
  const router = useRouter();
  const {
    inputRef,
    stage,
    error,
    report,
    history,
    quota,
    cloudItems,
    cachedHashes,
    cacheInfo,
    busy,
    handleFile,
    clearLocal,
    reportIdRef,
  } = useLogAnalyzer();

  // 首页上传卡拿来的文件
  const consumedPendingRef = useRef(false);
  useEffect(() => {
    if (consumedPendingRef.current) return;
    consumedPendingRef.current = true;
    void (async () => {
      const file = await takePendingLog();
      if (file) {
        const reportId = await handleFile(file);
        if (reportId) {
          setTimeout(() => router.push(`/analyze/${reportId}`), 100);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 上传完成后跳转到结果页
  useEffect(() => {
    const rid = reportIdRef.current;
    if (report && rid && stage === "done") {
      router.push(`/analyze/${rid}`);
    }
  }, [report, stage, reportIdRef, router]);

  const mergedHistory = useMemo<HistoryItem[]>(() => {
    const local: HistoryItem[] = history.map((r) => ({ ...r, source: "local" }));
    const localIds = new Set(history.map((r) => r.id.replace(/[^a-zA-Z0-9_]/g, "")));
    const cloud = cloudItems.filter((c) => !localIds.has(c.id));
    return [...local, ...cloud].sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
  }, [history, cloudItems]);

  const handleUploadAndGo = async (file: File) => {
    await handleFile(file);
  };

  const localCount = history.length;
  const cloudCount = mergedHistory.filter((r) => r.source === "cloud").length;
  const totalCount = mergedHistory.length;
  const criticalCount = mergedHistory.reduce((sum, r) => {
    const findings = Array.isArray(r.findings) ? r.findings : [];
    return sum + findings.filter((f: { severity: string }) => f.severity === "critical").length;
  }, 0);

  return (
    <div className="page-shell pt-4 pb-10 sm:pt-5">
      <Breadcrumbs items={[{ label: "日志分析" }]} />
      <h1 className="text-[24px] font-semibold tracking-[-0.02em]">
        <LocalizedText zh="PX4 飞行日志分析" en="PX4 flight log analysis" />
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
        <LocalizedText
          zh="确定性引擎负责数值判断（解析 → 规则检查 → 故障知识库匹配），DeepSeek 只把结构化结果翻译成中文，不参与任何数值判断。"
          en="The deterministic engine makes every numeric call (parse → rule checks → fault knowledge base); DeepSeek only translates the structured result into Chinese."
        />
      </p>

      <div className="mt-6">
        {/* 上传区域 */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void handleUploadAndGo(f);
          }}
          className="mb-8 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-strong bg-surface-2 px-4 py-14 text-center transition-colors hover:border-primary hover:bg-surface-1"
        >
          {busy ? (
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
          ) : (
            <UploadCloud className="mb-4 h-10 w-10 text-primary" />
          )}
          <p className="text-lg font-semibold">
            {busy ? STAGE_TEXT[stage] ?? "处理中…" : "选择或拖入 PX4 .ulg 日志"}
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
            {busy
              ? "首次运行需下载约十余 MB 的 Pyodide 运行时，请稍候"
              : "检查在本地浏览器完成，原始文件不上传。支持最大 300MB"}
          </p>
          {quota && (
            <p className="mt-3 text-xs text-faint">
              {quota.anonymous ? "匿名试用" : "AI"}：
              <span
                className={
                  quota.used >= quota.limit
                    ? "font-semibold text-critical"
                    : "font-semibold text-text"
                }
              >
                {Math.max(quota.limit - quota.used, 0)}/{quota.limit} 次
              </span>
            </p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".ulg,.ULG"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUploadAndGo(f);
            }}
          />
        </div>

        {/* 错误 */}
        {error && (
          <div className="mb-6 rounded-lg border border-critical/40 bg-critical/[0.06] p-4 text-sm text-critical">
            {error}
          </div>
        )}

        {/* 统计卡片 */}
        {totalCount > 0 && (
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={<History className="h-4 w-4" />} label="总日志" value={totalCount} />
            <StatCard icon={<HardDrive className="h-4 w-4" />} label="本机" value={localCount} />
            <StatCard icon={<Cloud className="h-4 w-4" />} label="云端" value={cloudCount} />
            <StatCard
              icon={<ShieldAlert className="h-4 w-4" />}
              label="严重告警"
              value={criticalCount}
            />
          </div>
        )}

        {/* 历史列表 */}
        <div className="card p-4 sm:p-5">
          <HistoryList
            items={mergedHistory}
            localCount={localCount}
            cachedHashes={cachedHashes}
            cacheInfo={cacheInfo}
            onClearLocal={clearLocal}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </span>
      <div>
        <p className="text-lg font-bold leading-tight text-text">{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}