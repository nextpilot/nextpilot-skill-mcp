"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLogAnalyzer } from "@/hooks/useLogAnalyzer";
import { ReportHistoryList } from "@/components/ReportHistoryList";
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
import { ANALYSIS_DISCLAIMER, LOG_PRIVACY_NOTE } from "@/lib/log-analysis-notes";
import type { HistoryItem } from "@/components/ReportHistoryList";

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
    // 这里不取 `quota`：上传卡上不再显示「匿名试用 3/3 次」——次数限制改由后台配置，
    // 前端不先替后台报一个写死的数。要用时从 useLogAnalyzer() 取回来即可。
    cloudItems,
    cachedHashes,
    cacheInfo,
    busy,
    handleFile,
    clearLocal,
    deleteLocal,
    deleteCloud,
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
      {/* 占满容器宽度（原来 max-w-3xl 会在宽屏上提前折行，看着像半截的说明）。
          注意 LocalizedText 只输出纯文本，不解析 markdown——别在里面写 ** 强调，会原样显示出来 */}
      <p className="mt-2 text-sm leading-6 text-muted">
        <LocalizedText
          zh="把 .ulg 拖进来，几分钟读完一份中文诊断报告：解析、32 条规则检查和故障知识库匹配全部在你的浏览器里完成，原始日志与 GPS 轨迹一步不出本机。结论里的每个数字都能对回具体字段、阈值和官方文档；DeepSeek 只把结果讲成人话——是什么问题、为什么、先查哪里，不参与任何数值判断。"
          en="Drop in a .ulg and get a Chinese diagnostic report in minutes: parsing, 32 rule checks and fault-knowledge-base matching all run inside your browser — the raw log and its GPS track never leave your device. Every number traces back to a field, a threshold and an official doc; DeepSeek only puts the result into plain language — what it is, why, and what to check first — it makes no numeric judgement of its own."
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
          {/* 三行：标题带容量上限 → 隐私承诺 → 免责声明。容量上限并进标题，是为了让用户
              先看"能不能传"，再看"传上去安不安全"——这两句要在用户交出日志之前就看到。
              文案本体在 lib/log-analysis-notes.ts，这里只管排版，别在组件里手写措辞。 */}
          <p className="text-lg font-semibold">
            {busy ? (
              STAGE_TEXT[stage] ?? "处理中…"
            ) : (
              <LocalizedText
                zh="选择或拖入 PX4 .ulg 日志，最大支持300MB"
                en="Drop or choose a PX4 .ulg log — up to 300 MB"
              />
            )}
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
            {busy ? (
              "首次运行需下载约十余 MB 的 Pyodide 运行时，请稍候"
            ) : (
              <LocalizedText zh={`${LOG_PRIVACY_NOTE.zh}。`} en={`${LOG_PRIVACY_NOTE.en}.`} />
            )}
          </p>
          {!busy && (
            // 与上面那句同等字号（两句是并列的说明，不是"一句正文 + 一行脚注"）
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">
              <LocalizedText zh={`${ANALYSIS_DISCLAIMER.zh}。`} en={`${ANALYSIS_DISCLAIMER.en}.`} />
            </p>
          )}
          {/* 这里原先还有一行「匿名试用：3/3 次」，2026-09-21 撤掉了：
              次数上限以后由后台配置，前端不先报一个写死的数字。上传卡现在只保留
              容量上限 + 隐私承诺 + 免责三行。 */}
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
          <ReportHistoryList
            items={mergedHistory}
            localCount={localCount}
            cachedHashes={cachedHashes}
            cacheInfo={cacheInfo}
            onClearLocal={clearLocal}
            onDeleteLocal={deleteLocal}
            onDeleteCloud={deleteCloud}
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