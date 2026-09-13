"use client";

import { useCallback, useRef, useState } from "react";
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
} from "lucide-react";
import type { AnalysisReport, Finding, Severity } from "@/lib/types";
import type { WorkerStage } from "@/workers/ulog.worker";

const STAGE_TEXT: Record<WorkerStage, string> = {
  "loading-runtime": "加载浏览器端 Pyodide 运行时",
  "installing-parser": "安装 pyulog 解析器",
  parsing: "解析日志并执行检查规则",
  done: "完成",
};

export function LogAnalyzer() {
  const workerRef = useRef<Worker | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<WorkerStage | "idle" | "explaining">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [aiMarkdown, setAiMarkdown] = useState<string | null>(null);

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

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setReport(null);
      setAiMarkdown(null);

      if (!file.name.toLowerCase().endsWith(".ulg")) {
        setError("冲刺 1 仅支持 PX4 .ulg 日志，ArduPilot .bin 将在冲刺 3 支持");
        return;
      }

      const worker = new Worker(
        new URL("../workers/ulog.worker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;

      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.type === "stage") {
          setStage(msg.stage);
        } else if (msg.type === "error") {
          setError(msg.message);
          setStage("idle");
          worker.terminate();
        } else if (msg.type === "done") {
          const r = msg.report as AnalysisReport;
          r.fileName = file.name;
          r.fileSize = file.size;
          r.analyzedAt = new Date().toISOString();
          setReport(r);
          worker.terminate();
          void explain(file.name, r.findings, r.stats);
        }
      };

      const bytes = new Uint8Array(await file.arrayBuffer());
      worker.postMessage({ type: "analyze", file: bytes });
    },
    [explain],
  );

  const busy = stage !== "idle" && stage !== "done";

  return (
    <div>
      {/* 隐私提示 */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="leading-6 text-[#b9c9db]">
          日志在<strong className="text-white">你的浏览器本地</strong>由
          Pyodide + pyulog 解析，<strong className="text-white">原始 .ulg 文件不会上传</strong>
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
        <div className="mt-4 rounded-xl border border-critical/40 bg-critical/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {report && <ReportView report={report} aiMarkdown={aiMarkdown} />}
    </div>
  );
}

function ReportView({
  report,
  aiMarkdown,
}: {
  report: AnalysisReport;
  aiMarkdown: string | null;
}) {
  const counts = {
    critical: report.findings.filter((f) => f.severity === "critical").length,
    warning: report.findings.filter((f) => f.severity === "warning").length,
    info: report.findings.filter((f) => f.severity === "info").length,
  };

  return (
    <div className="mt-8">
      {/* 概要 */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-5">
        <FileCheck2 className="h-5 w-5 text-ok" />
        <div className="text-sm">
          <p className="font-medium">{report.fileName}</p>
          <p className="text-xs text-muted">
            {(report.fileSize / 1024 / 1024).toFixed(2)} MB
            {report.durationSec ? ` · 时长 ${Math.round(report.durationSec)}s` : ""} ·{" "}
            {report.parserVersion}
          </p>
        </div>
        <div className="ml-auto flex gap-2 text-xs">
          <CountPill icon={<ShieldAlert className="h-3.5 w-3.5" />} n={counts.critical} label="严重" tone="critical" />
          <CountPill icon={<AlertTriangle className="h-3.5 w-3.5" />} n={counts.warning} label="警告" tone="warning" />
          <CountPill icon={<Info className="h-3.5 w-3.5" />} n={counts.info} label="提示" tone="info" />
        </div>
      </div>

      {/* findings 明细：确定性引擎结果 */}
      <h2 className="mt-8 mb-3 text-lg font-semibold">检查明细（确定性引擎）</h2>
      {report.findings.length === 0 ? (
        <p className="rounded-xl border border-ok/30 bg-ok/5 p-4 text-sm text-emerald-200">
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
        <div className="rounded-lg bg-[#0a0e15] px-3 py-2">
          <p className="text-[11px] text-muted">字段</p>
          <p className="mt-0.5 break-all font-mono text-xs text-sky-300">
            {finding.evidence.field}
          </p>
        </div>
        <div className="rounded-lg bg-[#0a0e15] px-3 py-2">
          <p className="text-[11px] text-muted">实测值</p>
          <p className="mt-0.5 text-sm font-semibold">
            {String(finding.evidence.value)}
            {finding.evidence.unit ? ` ${finding.evidence.unit}` : ""}
          </p>
        </div>
        <div className="rounded-lg bg-[#0a0e15] px-3 py-2">
          <p className="text-[11px] text-muted">阈值</p>
          <p className="mt-0.5 text-sm">
            {finding.evidence.threshold !== undefined
              ? `${String(finding.evidence.threshold)}${finding.evidence.unit ? ` ${finding.evidence.unit}` : ""}`
              : "—"}
          </p>
        </div>
      </div>
      {finding.suggestion && (
        <p className="mt-3 text-sm text-[#c3d0e0]">{finding.suggestion}</p>
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
