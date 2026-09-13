"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  UploadCloud,
  Loader2,
  ShieldAlert,
  AlertTriangle,
  Info,
  Lock,
  FileCheck2,
  ExternalLink,
  LineChart,
  ScrollText,
  ClipboardCheck,
  ListFilter,
  Sparkles,
  LogIn,
} from "lucide-react";
import type {
  AnalysisReport,
  Finding,
  LogInfo,
  Severity,
  SeriesResponse,
  TopicManifest,
} from "@/lib/types";
import type { WorkerStage } from "@/workers/ulog-worker";
import type { SeriesRequest } from "@/lib/chart-presets";
import {
  clearReports,
  deleteReport,
  listReports,
  newReportId,
  saveReport,
  type SavedReport,
} from "@/lib/report-history";
import { LogCharts } from "./LogCharts";
import { LogMessages, LogParams, SystemInfoPanel } from "./LogEventsParams";
import { HistoryList, type HistoryItem } from "./HistoryList";

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  rotary_wing: "旋翼",
  fixed_wing: "固定翼",
  rover: "Rover",
  airship: "飞艇",
  unknown: "未知机型",
};

const STAGE_TEXT: Record<WorkerStage, string> = {
  "loading-runtime": "加载浏览器端 Pyodide 运行时",
  "installing-parser": "安装 pyulog 解析器",
  parsing: "解析日志并执行检查规则",
  done: "完成",
};

type TabKey = "summary" | "charts" | "messages" | "params";

export function LogAnalyzer() {
  const workerRef = useRef<Worker | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<Map<string, (data: unknown) => void>>(new Map());
  const reqIdRef = useRef(0);
  const reportIdRef = useRef<string>("");
  const [stage, setStage] = useState<WorkerStage | "idle" | "explaining">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [manifest, setManifest] = useState<TopicManifest | null>(null);
  const [info, setInfo] = useState<LogInfo | null>(null);
  const [aiMarkdown, setAiMarkdown] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedReport[]>([]);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [cloudItems, setCloudItems] = useState<HistoryItem[]>([]);

  const refreshCloud = useCallback(async () => {
    try {
      const resp = await fetch("/api/reports", { cache: "no-store" });
      if (!resp.ok) {
        setCloudItems([]);
        return;
      }
      const data = await resp.json();
      setCloudItems(
        (data.reports ?? []).map(
          (r: Record<string, unknown>): HistoryItem => ({
            id: String(r.id),
            fileName: String(r.fileName ?? ""),
            fileSize: Number(r.fileSize ?? 0),
            durationSec: Number(r.durationSec ?? 0) || undefined,
            platform: String(r.platform ?? "px4"),
            vehicleType: (r.vehicleType as string) ?? undefined,
            parserVersion: String(r.parserVersion ?? ""),
            findings: [],
            findingCount: Number(r.findingCount ?? 0),
            stats: {},
            aiMarkdown: null,
            analyzedAt: String(r.analyzedAt),
            source: "cloud",
          }),
        ),
      );
    } catch {
      setCloudItems([]);
    }
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const resp = await fetch("/api/me", { cache: "no-store" });
      if (resp.ok) {
        const data = await resp.json();
        setLoggedIn(true);
        setQuota(data.quota ?? null);
        await refreshCloud();
      } else {
        setLoggedIn(false);
        setQuota(null);
        setCloudItems([]);
      }
    } catch {
      // 边缘函数未部署 / 网络异常时不阻断本地分析
    }
  }, [refreshCloud]);

  useEffect(() => {
    setHistory(listReports());
    void refreshMe();
    return () => {
      workerRef.current?.terminate();
    };
  }, [refreshMe]);

  const persist = useCallback(
    (r: AnalysisReport, id: string, ai: string | null) => {
      saveReport({
        id,
        fileName: r.fileName,
        fileSize: r.fileSize,
        durationSec: r.durationSec,
        platform: r.platform,
        vehicleType: r.vehicleType,
        parserVersion: r.parserVersion,
        findings: r.findings,
        stats: r.stats,
        aiMarkdown: ai,
        analyzedAt: r.analyzedAt,
      });
      setHistory(listReports());
    },
    [],
  );

  const explain = useCallback(
    async (r: AnalysisReport, id: string) => {
      setStage("explaining");
      let markdown: string | null = null;
      let ok = false;
      try {
        const resp = await fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportId: id,
            fileName: r.fileName,
            fileSize: r.fileSize,
            durationSec: r.durationSec,
            platform: r.platform,
            parserVersion: r.parserVersion,
            findings: r.findings,
            stats: r.stats,
          }),
        });
        const data = await resp.json();
        if (resp.status === 401) {
          markdown = `> 请先[登录](/login?callbackUrl=${encodeURIComponent("/analyze")})后生成 AI 中文报告（每月免费 5 次）。端侧检查结论不受影响。`;
        } else if (resp.status === 429) {
          markdown = `> ${data.error ?? "本月免费额度已用完"}。额度每月 1 日重置。`;
        } else if (!resp.ok) {
          markdown = `> AI 解释暂不可用：${data.error ?? resp.statusText}`;
        } else {
          markdown = data.markdown;
          ok = true;
          if (data.quota) setQuota({ used: data.quota.used, limit: data.quota.limit });
        }
      } catch (err) {
        markdown = `> AI 解释请求失败：${(err as Error).message}`;
      } finally {
        setAiMarkdown(markdown);
        setStage("done");
        // 只在真正拿到报告时更新本地存档（错误提示不入库）
        if (markdown !== null && ok) {
          persist(r, id, markdown);
          void refreshCloud();
        }
      }
    },
    [persist, refreshCloud],
  );

  const requestSeries = useCallback((req: SeriesRequest): Promise<SeriesResponse> => {
    const worker = workerRef.current;
    if (!worker) return Promise.resolve({ error: "worker 未就绪" } as SeriesResponse);
    const reqId = `s${reqIdRef.current++}`;
    return new Promise((resolve) => {
      pendingRef.current.set(reqId, (data) => resolve(data as SeriesResponse));
      worker.postMessage({
        type: "series",
        reqId,
        topic: req.topic,
        instance: req.instance,
        fields: req.fields,
      });
    });
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setReport(null);
      setManifest(null);
      setInfo(null);
      setAiMarkdown(null);

      if (!file.name.toLowerCase().endsWith(".ulg")) {
        setError("冲刺 1 仅支持 PX4 .ulg 日志，ArduPilot .bin 将在冲刺 3 支持");
        return;
      }

      reportIdRef.current = newReportId();

      // 复用既有 worker（Pyodide 已加载），避免重复下载运行时
      if (!workerRef.current) {
        const worker = new Worker(
          new URL("../workers/ulog-worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.onmessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === "stage") {
            setStage(msg.stage);
          } else if (msg.type === "error") {
            setError(msg.message);
            setStage("idle");
          } else if (msg.type === "done") {
            const r = msg.report as AnalysisReport;
            r.fileName = file.name;
            r.fileSize = file.size;
            r.analyzedAt = new Date().toISOString();
            setReport(r);
            setManifest(msg.manifest as TopicManifest);
            setInfo(msg.info as LogInfo);
            setStage("done");
            persist(r, reportIdRef.current, null);
            // 冲刺 2：AI 报告需登录且消耗配额，改为用户手动点击生成，不再解析完自动调用
          } else if (msg.type === "series") {
            const resolve = pendingRef.current.get(msg.reqId);
            if (resolve) {
              pendingRef.current.delete(msg.reqId);
              resolve(msg.data);
            }
          }
        };
        workerRef.current = worker;
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      workerRef.current.postMessage({ type: "analyze", file: bytes });
    },
    [explain, persist],
  );

  const viewSaved = useCallback((saved: SavedReport) => {
    setError(null);
    setManifest(null);
    setInfo(null);
    setAiMarkdown(saved.aiMarkdown);
    reportIdRef.current = saved.id;
    setReport({
      fileName: saved.fileName,
      fileSize: saved.fileSize,
      durationSec: saved.durationSec,
      platform: saved.platform as AnalysisReport["platform"],
      vehicleType: saved.vehicleType,
      parserVersion: saved.parserVersion,
      findings: saved.findings,
      stats: saved.stats,
      analyzedAt: saved.analyzedAt,
    });
    setStage("done");
  }, []);

  // 本地 localStorage 与云端 KV 历史合并（同一份报告以本地为准；云端 id 已去连字符）
  const mergedHistory = useMemo<HistoryItem[]>(() => {
    const local: HistoryItem[] = history.map((r) => ({ ...r, source: "local" }));
    const localIds = new Set(history.map((r) => r.id.replace(/[^a-zA-Z0-9_]/g, "")));
    const cloud = cloudItems.filter((c) => !localIds.has(c.id));
    return [...local, ...cloud].sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
  }, [history, cloudItems]);

  const viewHistoryItem = useCallback(
    async (item: HistoryItem) => {
      if (item.source === "cloud") {
        try {
          const resp = await fetch(`/api/reports/${item.id}`);
          if (!resp.ok) return;
          const data = await resp.json();
          if (data.report) viewSaved(data.report as SavedReport);
        } catch {
          // 网络异常时静默
        }
        return;
      }
      viewSaved(item);
    },
    [viewSaved],
  );

  const deleteHistoryItem = useCallback(
    (item: HistoryItem) => {
      if (item.source === "cloud") {
        void fetch(`/api/reports/${item.id}`, { method: "DELETE" }).then(() => void refreshCloud());
      } else {
        deleteReport(item.id);
        setHistory(listReports());
      }
    },
    [refreshCloud],
  );

  const clearLocal = useCallback(() => {
    clearReports();
    setHistory([]);
  }, []);

  const busy = stage !== "idle" && stage !== "done";

  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* 左栏画布：上传 + 历史 */}
        <aside className="min-w-0 space-y-5 self-start rounded-2xl bg-surface p-5">
          <p className="flex items-start gap-2 text-xs leading-5 text-muted">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              日志在<strong className="font-medium text-text">你的浏览器本地</strong>由 Pyodide +
              pyulog 解析，<strong className="font-medium text-text">原始 .ulg 不会上传</strong>；
              仅将结构化检查结果发送到服务器生成中文解读。
            </span>
          </p>

          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-2 px-4 py-9 text-center transition-colors hover:border-primary/60"
          >
            {busy ? (
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
            ) : (
              <UploadCloud className="mb-3 h-8 w-8 text-primary" />
            )}
            <p className="font-medium">
              {busy ? STAGE_TEXT[stage as WorkerStage] : "选择或拖入 PX4 .ulg 日志"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {busy ? "首次运行需下载约十余 MB 的 Pyodide 运行时，请稍候" : "检查在本地完成，文件不上传"}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".ulg,.ULG"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </div>

          {loggedIn && quota && (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
              本月 AI 报告额度：
              <span className={quota.used >= quota.limit ? "font-semibold text-critical" : "font-semibold text-text"}>
                {" "}
                {Math.max(quota.limit - quota.used, 0)} / {quota.limit} 次剩余
              </span>
              （每月 1 日重置）
            </p>
          )}

          <HistoryList
            items={mergedHistory}
            localCount={history.length}
            onView={(item) => void viewHistoryItem(item)}
            onDelete={deleteHistoryItem}
            onClearLocal={clearLocal}
          />
        </aside>

        {/* 右栏画布：分析结果 */}
        <section className="min-w-0 self-start rounded-2xl bg-surface p-5 sm:p-6">
          {error && (
            <div className="rounded-xl border border-critical/40 bg-critical/10 p-4 text-sm text-critical">
              {error}
            </div>
          )}

          {report ? (
            <ReportView
              report={report}
              aiMarkdown={aiMarkdown}
              manifest={manifest}
              info={info}
              requestSeries={requestSeries}
              explaining={stage === "explaining"}
              loggedIn={loggedIn}
              quota={quota}
              onGenerateAi={() => void explain(report, reportIdRef.current)}
            />
          ) : (
            !error && (
              <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
                <FileCheck2 className="h-10 w-10 text-muted/70" />
                <p className="font-medium">上传日志后，这里显示分析结果</p>
                <p className="max-w-sm text-xs leading-5 text-muted">
                  左侧选择或拖入一份 PX4 .ulg 日志，将生成检查结论（振动 / EKF / 电源）、
                  数据图表与 AI 中文解读。
                </p>
              </div>
            )
          )}
        </section>
      </div>
    </div>
  );
}

function ReportView({
  report,
  aiMarkdown,
  manifest,
  info,
  requestSeries,
  explaining,
  loggedIn,
  quota,
  onGenerateAi,
}: {
  report: AnalysisReport;
  aiMarkdown: string | null;
  manifest: TopicManifest | null;
  info: LogInfo | null;
  requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
  explaining: boolean;
  loggedIn: boolean;
  quota: { used: number; limit: number } | null;
  onGenerateAi: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("summary");
  const counts = {
    critical: report.findings.filter((f) => f.severity === "critical").length,
    warning: report.findings.filter((f) => f.severity === "warning").length,
    info: report.findings.filter((f) => f.severity === "info").length,
  };

  const isHistory = !manifest || !info;
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { key: "summary", label: "检查结论", icon: <ClipboardCheck className="h-4 w-4" /> },
    { key: "charts", label: "数据图表", icon: <LineChart className="h-4 w-4" />, disabled: !manifest },
    { key: "messages", label: "事件消息", icon: <ScrollText className="h-4 w-4" />, disabled: !info },
    { key: "params", label: "飞控参数", icon: <ListFilter className="h-4 w-4" />, disabled: !info },
  ];
  const activeTab = isHistory ? "summary" : tab;

  return (
    <div>
      {/* 概要 */}
      <div className="flex flex-wrap items-center gap-3 pb-5">
        <FileCheck2 className="h-5 w-5 text-ok" />
        <div className="text-sm">
          <p className="font-medium">{report.fileName}</p>
          <p className="text-xs text-muted">
            {(report.fileSize / 1024 / 1024).toFixed(2)} MB
            {report.durationSec ? ` · 时长 ${Math.round(report.durationSec)}s` : ""}
            {report.vehicleType
              ? ` · ${VEHICLE_TYPE_LABELS[report.vehicleType] ?? report.vehicleType}`
              : ""} · {report.parserVersion}
          </p>
        </div>
        <div className="ml-auto flex gap-2 text-xs">
          <CountPill icon={<ShieldAlert className="h-3.5 w-3.5" />} n={counts.critical} label="严重" tone="critical" />
          <CountPill icon={<AlertTriangle className="h-3.5 w-3.5" />} n={counts.warning} label="警告" tone="warning" />
          <CountPill icon={<Info className="h-3.5 w-3.5" />} n={counts.info} label="提示" tone="info" />
        </div>
      </div>

      {/* 系统信息常驻在 tab 上方，切换 tab 不消失 */}
      {info ? (
        <section className="mb-5 rounded-xl bg-surface-2 p-4">
          <h3 className="mb-2 text-sm font-semibold">系统信息</h3>
          <SystemInfoPanel info={info} />
        </section>
      ) : (
        <p className="mb-5 rounded-xl bg-surface-2 p-4 text-xs leading-5 text-muted">
          历史回看仅保留检查结论与 AI 解读；系统信息、图表、事件与参数需重新解析原始日志（选择同一份 .ulg）。
        </p>
      )}

      {/* tabs：下划线式 */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={t.disabled}
            onClick={() => setTab(t.key)}
            className={`-mb-px flex items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
              activeTab === t.key
                ? "border-primary font-medium text-text"
                : t.disabled
                  ? "cursor-not-allowed border-transparent text-muted/50"
                  : "border-transparent text-muted hover:text-text"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {activeTab === "summary" && (
          <SummaryTab
            report={report}
            aiMarkdown={aiMarkdown}
            explaining={explaining}
            loggedIn={loggedIn}
            quota={quota}
            onGenerateAi={onGenerateAi}
          />
        )}
        {activeTab === "charts" && manifest && info && (
          <LogCharts manifest={manifest} phases={info.phases} requestSeries={requestSeries} />
        )}
        {activeTab === "messages" && info && <LogMessages info={info} />}
        {activeTab === "params" && info && <LogParams info={info} />}
      </div>
    </div>
  );
}

function SummaryTab({
  report,
  aiMarkdown,
  explaining,
  loggedIn,
  quota,
  onGenerateAi,
}: {
  report: AnalysisReport;
  aiMarkdown: string | null;
  explaining: boolean;
  loggedIn: boolean;
  quota: { used: number; limit: number } | null;
  onGenerateAi: () => void;
}) {
  return (
    <div>
      {/* findings 明细：确定性引擎结果 */}
      <h2 className="mb-3 text-base font-semibold">检查明细（确定性引擎）</h2>
      {report.findings.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-ok">
          <Info className="h-4 w-4" />
          振动 / IMU 削波、EKF 创新检验、电源三项基础检查均未触发阈值。
        </p>
      ) : (
        <div className="space-y-2.5">
          {report.findings.map((f) => (
            <FindingCard key={f.id} finding={f} />
          ))}
        </div>
      )}

      {/* AI 解释层：登录后手动生成，消耗月度免费配额 */}
      <h2 className="mt-8 mb-2 text-base font-semibold">AI 中文解读</h2>
      {aiMarkdown ? (
        <article className="prose-skill">
          <ReactMarkdown
            components={{
              a: ({ children, href }) => (
                <Link href={href ?? "#"}>{children}</Link>
              ),
            }}
          >
            {aiMarkdown}
          </ReactMarkdown>
        </article>
      ) : explaining ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          DeepSeek 正在生成中文报告…
        </p>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-surface-2 p-5">
          <button
            type="button"
            onClick={onGenerateAi}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {loggedIn ? <Sparkles className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            {loggedIn ? "生成 AI 中文报告" : "登录后生成 AI 中文报告"}
          </button>
          <p className="mt-2 text-xs text-muted">
            {loggedIn
              ? `由 DeepSeek 基于上述结构化检查结果生成，每月免费 ${quota?.limit ?? 5} 次${
                  quota ? `，本月已用 ${quota.used} 次` : ""
                }`
              : "每月免费 5 次，端侧检查结论无需登录即可查看"}
          </p>
        </div>
      )}
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const TONES: Record<
    Severity,
    { cls: string; icon: React.ReactNode; label: string }
  > = {
    critical: {
      cls: "border-l-critical bg-critical/[0.06]",
      icon: <ShieldAlert className="h-4 w-4 text-critical" />,
      label: "严重",
    },
    warning: {
      cls: "border-l-warning bg-warning/[0.06]",
      icon: <AlertTriangle className="h-4 w-4 text-warning" />,
      label: "警告",
    },
    info: {
      cls: "border-l-border bg-text/[0.035]",
      icon: <Info className="h-4 w-4 text-muted" />,
      label: "提示",
    },
  };
  const tone = TONES[finding.severity];

  return (
    <div className={`rounded-r-lg border-l-2 p-3.5 ${tone.cls}`}>
      <div className="flex items-center gap-2">
        {tone.icon}
        <span className="text-xs text-muted">{finding.id}</span>
        <span className="text-xs text-muted">· {finding.ruleId}</span>
        <h3 className="font-medium">{finding.title}</h3>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <span className="text-muted">
          字段 <span className="ml-1 break-all font-mono text-xs text-primary">{finding.evidence.field}</span>
        </span>
        <span className="text-muted">
          实测值 <span className="ml-1 font-semibold text-text">
            {String(finding.evidence.value)}
            {finding.evidence.unit ? ` ${finding.evidence.unit}` : ""}
          </span>
        </span>
        <span className="text-muted">
          阈值 <span className="ml-1 text-text">
            {finding.evidence.threshold !== undefined
              ? `${String(finding.evidence.threshold)}${finding.evidence.unit ? ` ${finding.evidence.unit}` : ""}`
              : "—"}
          </span>
        </span>
      </div>
      {finding.suggestion && (
        <p className="mt-2 text-sm text-muted">{finding.suggestion}</p>
      )}
      {finding.docUrl && (
        <a
          href={finding.docUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          官方文档 <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function CountPill({
  icon,
  n,
  label,
  tone,
}: {
  icon: React.ReactNode;
  n: number;
  label: string;
  tone: "critical" | "warning" | "info";
}) {
  const colors = {
    critical: "text-critical border-critical/40",
    warning: "text-warning border-warning/40",
    info: "text-muted border-border",
  }[tone];
  return (
    <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 ${colors}`}>
      {icon}
      {n} {label}
    </span>
  );
}
