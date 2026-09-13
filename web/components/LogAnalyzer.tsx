"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { LogCharts } from "./LogCharts";
import { LogEventsParams } from "./LogEventsParams";

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

type TabKey = "summary" | "charts" | "events";

export function LogAnalyzer() {
  const workerRef = useRef<Worker | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<Map<string, (data: unknown) => void>>(new Map());
  const reqIdRef = useRef(0);
  const [stage, setStage] = useState<WorkerStage | "idle" | "explaining">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [manifest, setManifest] = useState<TopicManifest | null>(null);
  const [info, setInfo] = useState<LogInfo | null>(null);
  const [aiMarkdown, setAiMarkdown] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const explain = useCallback(
    async (fileName: string, findings: Finding[], stats: AnalysisReport["stats"]) => {
      setStage("explaining");
      try {
        const resp = await fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName, findings, stats }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          setAiMarkdown(`> AI 解释暂不可用：${data.error ?? resp.statusText}`);
        } else {
          setAiMarkdown(data.markdown);
        }
      } catch (err) {
        setAiMarkdown(`> AI 解释请求失败：${(err as Error).message}`);
      } finally {
        setStage("done");
      }
    },
    [],
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
            void explain(file.name, r.findings, r.stats);
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
    [explain],
  );

  const busy = stage !== "idle" && stage !== "done";

  return (
    <div>
      {/* 隐私提示 */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="leading-6 text-muted">
          日志在<strong className="text-text">你的浏览器本地</strong>由
          Pyodide + pyulog 解析，<strong className="text-text">原始 .ulg 文件不会上传</strong>
          ；仅将结构化检查结果（findings）发送到服务器生成中文解释。
        </p>
      </div>

      {/* 上传区 */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface px-6 py-14 text-center transition-colors hover:border-primary/60"
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

      {error && (
        <div className="mt-4 rounded-xl border border-critical/40 bg-critical/10 p-4 text-sm text-critical">
          {error}
        </div>
      )}

      {report && manifest && info && (
        <ReportView
          report={report}
          aiMarkdown={aiMarkdown}
          manifest={manifest}
          info={info}
          requestSeries={requestSeries}
        />
      )}
    </div>
  );
}

function ReportView({
  report,
  aiMarkdown,
  manifest,
  info,
  requestSeries,
}: {
  report: AnalysisReport;
  aiMarkdown: string | null;
  manifest: TopicManifest;
  info: LogInfo;
  requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
}) {
  const [tab, setTab] = useState<TabKey>("summary");
  const counts = {
    critical: report.findings.filter((f) => f.severity === "critical").length,
    warning: report.findings.filter((f) => f.severity === "warning").length,
    info: report.findings.filter((f) => f.severity === "info").length,
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "summary", label: "检查结论", icon: <ClipboardCheck className="h-4 w-4" /> },
    { key: "charts", label: "数据图表", icon: <LineChart className="h-4 w-4" /> },
    { key: "events", label: "事件与参数", icon: <ScrollText className="h-4 w-4" /> },
  ];

  return (
    <div className="mt-8">
      {/* 概要 */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-5">
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

      {/* tabs */}
      <div className="mt-6 flex gap-1 rounded-xl border border-border bg-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              tab === t.key
                ? "bg-surface-2 font-medium text-text"
                : "text-muted hover:text-text"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "summary" && <SummaryTab report={report} aiMarkdown={aiMarkdown} />}
        {tab === "charts" && (
          <LogCharts manifest={manifest} phases={info.phases} requestSeries={requestSeries} />
        )}
        {tab === "events" && <LogEventsParams info={info} />}
      </div>
    </div>
  );
}

function SummaryTab({
  report,
  aiMarkdown,
}: {
  report: AnalysisReport;
  aiMarkdown: string | null;
}) {
  return (
    <div>
      {/* findings 明细：确定性引擎结果 */}
      <h2 className="mb-3 text-lg font-semibold">检查明细（确定性引擎）</h2>
      {report.findings.length === 0 ? (
        <p className="rounded-xl border border-ok/30 bg-ok/5 p-4 text-sm text-ok">
          振动 / IMU 削波、EKF 创新检验、电源三项基础检查均未触发阈值。
        </p>
      ) : (
        <div className="space-y-3">
          {report.findings.map((f) => (
            <FindingCard key={f.id} finding={f} />
          ))}
        </div>
      )}

      {/* AI 解释层 */}
      <h2 className="mt-8 mb-3 text-lg font-semibold">AI 中文解读</h2>
      <div className="rounded-2xl border border-border bg-surface p-5">
        {aiMarkdown ? (
          <article className="prose-skill">
            <ReactMarkdown>{aiMarkdown}</ReactMarkdown>
          </article>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            DeepSeek 正在生成中文报告…
          </p>
        )}
      </div>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const TONES: Record<
    Severity,
    { cls: string; icon: React.ReactNode; label: string }
  > = {
    critical: {
      cls: "border-critical/40 bg-critical/5",
      icon: <ShieldAlert className="h-4 w-4 text-critical" />,
      label: "严重",
    },
    warning: {
      cls: "border-warning/40 bg-warning/5",
      icon: <AlertTriangle className="h-4 w-4 text-warning" />,
      label: "警告",
    },
    info: {
      cls: "border-border bg-surface",
      icon: <Info className="h-4 w-4 text-muted" />,
      label: "提示",
    },
  };
  const tone = TONES[finding.severity];

  return (
    <div className={`rounded-xl border p-4 ${tone.cls}`}>
      <div className="flex items-center gap-2">
        {tone.icon}
        <span className="text-xs text-muted">{finding.id}</span>
        <span className="text-xs text-muted">· {finding.ruleId}</span>
        <h3 className="font-medium">{finding.title}</h3>
      </div>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <p className="text-[11px] text-muted">字段</p>
          <p className="mt-0.5 break-all font-mono text-xs text-primary">
            {finding.evidence.field}
          </p>
        </div>
        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <p className="text-[11px] text-muted">实测值</p>
          <p className="mt-0.5 text-sm font-semibold">
            {String(finding.evidence.value)}
            {finding.evidence.unit ? ` ${finding.evidence.unit}` : ""}
          </p>
        </div>
        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <p className="text-[11px] text-muted">阈值</p>
          <p className="mt-0.5 text-sm">
            {finding.evidence.threshold !== undefined
              ? `${String(finding.evidence.threshold)}${finding.evidence.unit ? ` ${finding.evidence.unit}` : ""}`
              : "—"}
          </p>
        </div>
      </div>
      {finding.suggestion && (
        <p className="mt-3 text-sm text-muted">{finding.suggestion}</p>
      )}
      {finding.docUrl && (
        <a
          href={finding.docUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
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
