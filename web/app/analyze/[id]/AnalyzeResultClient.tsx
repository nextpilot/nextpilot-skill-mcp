"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useLogAnalyzer } from "@/hooks/useLogAnalyzer";
import { AnalyzeReport } from "@/components/AnalyzeReport";
import { getReport } from "@/lib/report-history";
import { getCachedLog } from "@/lib/log-cache";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";

type TabKey = "summary" | "charts" | "messages" | "params" | "ai";

const STAGE_TEXT: Record<string, string> = {
  "loading-runtime": "加载 Pyodide 运行时",
  "installing-parser": "安装解析器",
  parsing: "解析日志数据",
  done: "完成",
};

export function AnalyzeResultClient() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const {
    stage,
    error,
    report,
    manifest,
    info,
    aiMarkdown,
    quota,
    loggedIn,
    cachedHashes,
    busy,
    explain,
    requestSeries,
    viewSaved,
    parseBytes,
  } = useLogAnalyzer();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("summary");
  const loadedRef = useRef(false);

  // 加载报告：优先本地，否则尝试云端
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const saved = getReport(id);
    if (saved) {
      viewSaved(saved);
      // 从缓存加载完整数据
      if (saved.logHash) {
        void getCachedLog(saved.logHash).then((cached) => {
          if (cached) {
            parseBytes(cached.bytes, {
              name: cached.name || saved.fileName,
              size: cached.bytes.byteLength,
              hash: saved.logHash!,
              reportId: id,
              priorAi: saved.aiMarkdown,
            });
          }
        });
      }
      setLoading(false);
      return;
    }

    // 本地没有，尝试云端
    fetch(`/api/reports/${id}`)
      .then((resp) => {
        if (!resp.ok) throw new Error("not found");
        return resp.json();
      })
      .then((data) => {
        if (data.report) viewSaved(data.report);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerateAi = () => {
    if (report) {
      setTab("ai");
      void explain(report, id);
    }
  };

  if (loading) {
    return (
      <div className="page-shell flex min-h-[50vh] items-center justify-center pt-4 pb-10 sm:pt-5">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="page-shell pt-4 pb-10 sm:pt-5">
        <Breadcrumbs items={[{ label: "日志分析", href: "/analyze" }, { label: "未找到" }]} />
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <p className="text-lg font-medium text-muted">未找到该分析报告</p>
          <p className="text-sm text-muted">该报告可能已被删除，或从未在本机生成。</p>
          <Link href="/analyze" className="btn-primary mt-2">
            <ArrowLeft className="h-4 w-4" /> 返回日志分析
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell pt-4 pb-10 sm:pt-5">
      <Breadcrumbs items={[{ label: "日志分析", href: "/analyze" }, { label: report.fileName }]} />

      {/* 顶部导航栏 */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link
          href="/analyze"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {!aiMarkdown && stage !== "explaining" && (
            <button type="button" onClick={handleGenerateAi} className="btn-primary px-3 py-1.5 text-sm">
              <Sparkles className="h-4 w-4" />
              AI 解读
            </button>
          )}
          {stage === "explaining" && (
            <span className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              AI 生成中…
            </span>
          )}
        </div>
      </div>

      {/* Worker 加载状态 */}
      {busy && !manifest && (
        <div className="mb-5 flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          {STAGE_TEXT[stage] ?? "加载中…"}
          {stage === "loading-runtime" && <span className="text-xs">（首次运行需下载运行时，约十余秒）</span>}
        </div>
      )}

      {/* 错误 */}
      {error && (
        <div className="mb-5 rounded-lg border border-critical/40 bg-critical/[0.06] p-4 text-sm text-critical">
          {error}
        </div>
      )}

      {/* 主分析报告 */}
      <div className="card p-5 sm:p-6">
        <AnalyzeReport
          report={report}
          aiMarkdown={aiMarkdown}
          manifest={manifest}
          info={info}
          requestSeries={requestSeries}
          explaining={stage === "explaining"}
          loggedIn={loggedIn}
          quota={quota}
          logCached={Boolean(report.logHash && cachedHashes.has(report.logHash))}
          onGenerateAi={handleGenerateAi}
          activeTab={tab}
          onTabChange={setTab}
        />
      </div>
    </div>
  );
}