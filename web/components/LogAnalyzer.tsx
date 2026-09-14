"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  UploadCloud,
  Loader2,
  ShieldAlert,
  AlertTriangle,
  Info,
  Lock,
  FileCheck2,
  ExternalLink,
  History,
  LineChart,
  ScrollText,
  ClipboardCheck,
  ListFilter,
  Sparkles,
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
import { getDeviceId } from "@/lib/device-id";
import { takePendingLog } from "@/lib/pending-log";
import { fallbackLogKey, hashLogBytes } from "@/lib/log-hash";
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

const PHASE_LABELS: Record<string, string> = {
  takeoff: "起飞",
  hover: "悬停/定点",
  maneuver: "机动",
  fw_cruise: "固定翼巡航",
  vtol_transition: "VTOL 转换",
  landing: "降落",
  cruise: "巡航",
};

const GUARD_LABELS: Record<string, string> = {
  insufficient_data: "样本不足(<60s)，不出深度结论",
  restart_detected: "日志中途重启",
  log_dropouts_high: "日志丢包>1s",
  temperature_change_large: "温度变化过大",
  wind_strong: "强风扰动",
};

/** 异常标签（第二层 add_tag 输出）→ 中文；未收录的原样显示 */
const TAG_LABELS: Record<string, string> = {
  high_vibration: "振动超标",
  imu_bias_drift: "陀螺零偏漂移",
  ekf_innovation_failure: "EKF 创新检验失败",
  gps_eph_high: "GPS 水平精度差",
  gps_jump: "GPS 位置跳变",
  battery_voltage_drop: "电压跌落",
  attitude_overshoot: "姿态超调",
  attitude_tracking: "姿态跟踪误差",
  motor_output_unbalance: "电机输出不平衡",
  low_airspeed: "空速偏低",
  vtol_convert_attitude_over: "VTOL 转换姿态超限",
  wind_disturb: "风扰动",
  failsafe: "触发失效保护",
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
  // 当前待解析文件（worker 回调闭包会捕获首次 file，改用它取名字与大小）
  const pendingFileRef = useRef<{ name: string; size: number }>({ name: "", size: 0 });
  const [stage, setStage] = useState<WorkerStage | "idle" | "explaining">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [manifest, setManifest] = useState<TopicManifest | null>(null);
  const [info, setInfo] = useState<LogInfo | null>(null);
  const [aiMarkdown, setAiMarkdown] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedReport[]>([]);
  const [quota, setQuota] = useState<{
    used: number;
    limit: number;
    anonymous?: boolean;
    loginLimit?: number;
  } | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [cloudItems, setCloudItems] = useState<HistoryItem[]>([]);
  /** 命中历史结果（同一份日志重复上传）时的提示，不重复解析也不重复计费 */
  const [dedupeNotice, setDedupeNotice] = useState<string | null>(null);
  const pendingHashRef = useRef<string>("");

  /** 云端报告列表（元数据）；返回而不写 state，便于上传时即时查重 */
  const fetchCloudList = useCallback(async (): Promise<HistoryItem[]> => {
    try {
      const resp = await fetch("/api/reports", { cache: "no-store" });
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.reports ?? []).map(
        (r: Record<string, unknown>): HistoryItem => ({
          id: String(r.id),
          fileName: String(r.fileName ?? ""),
          fileSize: Number(r.fileSize ?? 0),
          durationSec: Number(r.durationSec ?? 0) || undefined,
          platform: String(r.platform ?? "px4"),
          vehicleType: (r.vehicleType as string) ?? undefined,
          parserVersion: String(r.parserVersion ?? ""),
          logHash: r.logHash ? String(r.logHash) : undefined,
          findings: [],
          findingCount: Number(r.findingCount ?? 0),
          stats: {},
          aiMarkdown: null,
          analyzedAt: String(r.analyzedAt),
          source: "cloud",
        }),
      );
    } catch {
      return [];
    }
  }, []);

  const refreshCloud = useCallback(async () => {
    setCloudItems(await fetchCloudList());
  }, [fetchCloudList]);

  const refreshMe = useCallback(async () => {
    try {
      const resp = await fetch("/api/me", {
        cache: "no-store",
        headers: { "x-device-id": getDeviceId() },
      });
      if (resp.ok) {
        const data = await resp.json();
        setLoggedIn(Boolean(data.user));
        setQuota(data.quota ?? null);
        if (data.user) await refreshCloud();
        else setCloudItems([]);
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
    (r: AnalysisReport, id: string, ai: string | null, hash?: string) => {
      saveReport({
        id,
        fileName: r.fileName,
        fileSize: r.fileSize,
        durationSec: r.durationSec,
        platform: r.platform,
        vehicleType: r.vehicleType,
        parserVersion: r.parserVersion,
        logHash: hash ?? r.logHash,
        findings: r.findings,
        stats: r.stats,
        tags: r.tags,
        guardTags: r.guardTags,
        phases: r.phases,
        matchedFaults: r.matchedFaults,
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
          headers: {
            "Content-Type": "application/json",
            "x-device-id": getDeviceId(),
          },
          body: JSON.stringify({
            reportId: id,
            deviceId: getDeviceId(),
            fileName: r.fileName,
            fileSize: r.fileSize,
            durationSec: r.durationSec,
            platform: r.platform,
            parserVersion: r.parserVersion,
            logHash: r.logHash ?? pendingHashRef.current,
            findings: r.findings,
            stats: r.stats,
            tags: r.tags ?? [],
            guardTags: r.guardTags ?? [],
            phases: r.phases ?? [],
            checksRun: r.checksRun ?? [],
            checksSkipped: r.checksSkipped ?? [],
            matchedFaults: r.matchedFaults ?? [],
          }),
        });
        const data = await resp.json();
        if (resp.status === 429) {
          markdown = `> ${data.error ?? "今日免费额度已用完"}。额度每日 0 点（UTC）重置。`;
        } else if (!resp.ok) {
          markdown = `> AI 解释暂不可用：${data.error ?? resp.statusText}`;
        } else {
          markdown = data.markdown;
          ok = true;
          if (data.quota) {
            setQuota({
              used: data.quota.used,
              limit: data.quota.limit,
              anonymous: data.quota.anonymous,
            });
          }
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

  const viewSaved = useCallback((saved: SavedReport) => {
    setError(null);
    setManifest(null);
    setInfo(null);
    setAiMarkdown(saved.aiMarkdown);
    reportIdRef.current = saved.id;
    pendingHashRef.current = saved.logHash ?? "";
    setReport({
      fileName: saved.fileName,
      fileSize: saved.fileSize,
      durationSec: saved.durationSec,
      platform: saved.platform as AnalysisReport["platform"],
      vehicleType: saved.vehicleType,
      parserVersion: saved.parserVersion,
      logHash: saved.logHash,
      findings: saved.findings,
      stats: saved.stats,
      tags: saved.tags,
      guardTags: saved.guardTags,
      phases: saved.phases,
      matchedFaults: saved.matchedFaults,
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

  /** 同一份日志的查重：先本机历史（含完整结论），再云端列表（跨设备） */
  const findExistingByHash = useCallback(
    async (hash: string): Promise<HistoryItem | null> => {
      if (!hash) return null;
      const local = listReports().find((r) => r.logHash === hash);
      if (local) return { ...local, source: "local" };
      const cloud = await fetchCloudList();
      return cloud.find((c) => c.logHash === hash) ?? null;
    },
    [fetchCloudList],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setReport(null);
      setManifest(null);
      setInfo(null);
      setAiMarkdown(null);
      setDedupeNotice(null);

      if (!file.name.toLowerCase().endsWith(".ulg")) {
        setError("冲刺 1 仅支持 PX4 .ulg 日志，ArduPilot .bin 将在冲刺 3 支持");
        return;
      }

      const bytes = new Uint8Array(await file.arrayBuffer());

      // 同一份日志（内容哈希一致）不重复解析：直接载入历史结论
      const hash =
        (await hashLogBytes(bytes)) ||
        fallbackLogKey(file.name, file.size, file.lastModified);
      const existing = await findExistingByHash(hash);
      if (existing) {
        // 本机历史自带完整结论；云端列表只有元数据，需再取一次详情
        if (existing.source === "cloud") await viewHistoryItem(existing);
        else viewSaved(existing);
        setDedupeNotice(
          `这份日志此前已分析过（内容一致），已直接载入历史结论，未重复解析。` +
            (existing.aiMarkdown ? "" : "如需 AI 中文解读，可在下方手动生成（消耗额度）。"),
        );
        return;
      }

      reportIdRef.current = newReportId();
      // worker 只创建一次、回调闭包会捕获首次的 file，这里用 ref 记录本次文件信息
      pendingFileRef.current = { name: file.name, size: file.size };
      pendingHashRef.current = hash;

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
            r.fileName = pendingFileRef.current.name;
            r.fileSize = pendingFileRef.current.size;
            r.analyzedAt = new Date().toISOString();
            r.logHash = pendingHashRef.current;
            setReport(r);
            setManifest(msg.manifest as TopicManifest);
            setInfo(msg.info as LogInfo);
            setStage("done");
            persist(r, reportIdRef.current, null, pendingHashRef.current);
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

      workerRef.current.postMessage({ type: "analyze", file: bytes });
    },
    [findExistingByHash, persist, viewHistoryItem, viewSaved],
  );

  // 首页上传卡把文件暂存在 IndexedDB，这里取出后立即分析（读完即删）
  const consumedPendingRef = useRef(false);
  useEffect(() => {
    if (consumedPendingRef.current) return;
    consumedPendingRef.current = true;
    void (async () => {
      const file = await takePendingLog();
      if (file) void handleFile(file);
    })();
    // 消费者只在挂载时跑一次；handleFile 通过 ref 语义取最新闭包即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        {/* 左栏画布：上传 + 历史。两栏等高（不设 self-start，随 grid 行高拉伸） */}
        <aside className="card min-w-0 space-y-5 p-5">
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
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border-strong px-4 py-9 text-center transition-colors hover:border-text"
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

          {quota && (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
              {quota.anonymous ? "匿名免费试用（每日）" : "今日 AI 报告额度"}：
              <span
                className={
                  quota.used >= quota.limit
                    ? "font-semibold text-critical"
                    : "font-semibold text-text"
                }
              >
                {" "}
                {Math.max(quota.limit - quota.used, 0)} / {quota.limit} 次剩余
              </span>
              {quota.anonymous ? "，登录后 10 次/天并同步云端历史" : "（每日 0 点重置）"}
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
        <section className="card flex min-w-0 flex-col p-5 sm:p-6">
          {error && (
            <div className="rounded-lg border border-critical/40 bg-critical/[0.06] p-4 text-sm text-critical">
              {error}
            </div>
          )}

          {dedupeNotice && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3.5 text-sm text-muted">
              <History className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{dedupeNotice}</span>
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
              <div className="flex min-h-[360px] flex-1 flex-col items-center justify-center gap-3 text-center">
                <FileCheck2 className="h-10 w-10 text-muted/70" />
                <p className="font-medium">上传日志后，这里显示分析结果</p>
                <p className="max-w-sm text-xs leading-5 text-muted">
                  左侧选择或拖入一份 PX4 .ulg 日志，将生成 15 项确定性检查结论、
                  故障知识库匹配、数据图表与 AI 中文解读。
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
  quota: { used: number; limit: number; anonymous?: boolean; loginLimit?: number } | null;
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

      {/* 飞行上下文：阶段 / 异常标签 / 数据质量 guard（第二层输出）
          三组语义不同，各占一行并带行首标签，挤在一排会读不出区别 */}
      {(report.phases?.length || report.guardTags?.length || report.tags?.length) && (
        <div className="mt-5 mb-5 space-y-2.5">
          {report.phases && report.phases.length > 0 && (
            <TagRow label="飞行阶段">
              {report.phases.map((p) => (
                <span key={p} className="chip chip-brand">
                  {PHASE_LABELS[p] ?? p}
                </span>
              ))}
            </TagRow>
          )}
          {report.tags && report.tags.length > 0 && (
            <TagRow label="异常标签">
              {report.tags.map((t) => (
                <span key={t} className="chip border-warning/40 text-warning">
                  {TAG_LABELS[t] ?? t}
                </span>
              ))}
            </TagRow>
          )}
          {report.guardTags && report.guardTags.length > 0 && (
            <TagRow label="数据质量" hint="影响结论可信度">
              {report.guardTags.map((g) => (
                <span key={g} className="chip border-critical/40 text-critical">
                  {GUARD_LABELS[g] ?? g}
                </span>
              ))}
            </TagRow>
          )}
        </div>
      )}

      {/* 系统信息常驻在 tab 上方，切换 tab 不消失 */}
      {info ? (
        <section className="mb-5 rounded-lg bg-surface-2 p-4">
          <h3 className="mb-2 text-sm font-semibold">系统信息</h3>
          <SystemInfoPanel info={info} />
        </section>
      ) : (
        <p className="mb-5 rounded-lg bg-surface-2 p-4 text-xs leading-5 text-muted">
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
  quota: { used: number; limit: number; anonymous?: boolean; loginLimit?: number } | null;
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

      {/* 第三层：确定性匹配到的故障知识库条目（LLM 根因只允许出自这里） */}
      {report.matchedFaults && report.matchedFaults.length > 0 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-base font-semibold">匹配故障模式（{report.matchedFaults.length}）</h2>
          {report.matchedFaults.map((mf) => (
            <div key={mf.faultId} className="rounded-lg border border-border bg-surface-2 p-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                  {mf.faultId}
                </span>
                <span className="text-xs text-muted">风险等级：{mf.riskLevel}</span>
                {mf.note && <span className="text-xs text-warning">禁忌：{mf.note}</span>}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-muted">可能根因（按排查优先级）</p>
                  <ol className="list-decimal space-y-0.5 pl-4 text-xs leading-5">
                    {mf.possibleRootCause.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ol>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted">排查步骤（由简到繁）</p>
                  <ol className="list-decimal space-y-0.5 pl-4 text-xs leading-5">
                    {mf.troubleshootingSteps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI 解释层：手动生成，消耗每日免费配额 */}
      <h2 className="mt-8 mb-2 text-base font-semibold">AI 中文解读（GJB-841 归零报告）</h2>
      {aiMarkdown ? (
        <article className="prose-guide">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
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
        <div className="rounded-lg border border-dashed border-border-strong p-5">
          <button
            type="button"
            onClick={onGenerateAi}
            className="btn-primary"
          >
            <Sparkles className="h-4 w-4" />
            生成 AI 中文报告
          </button>
          <p className="mt-2 text-xs text-muted">
            {loggedIn
              ? `由 DeepSeek 基于上述结构化检查结果生成，今日免费 ${quota?.limit ?? 10} 次${
                  quota ? `，剩余 ${Math.max(quota.limit - quota.used, 0)} 次` : ""
                }`
              : `匿名可免费试用 ${quota?.limit ?? 3} 次/天，登录后 ${quota?.loginLimit ?? 10} 次/天并同步云端历史`}
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

/** 一行标签：行首固定宽度说明 + 标签流，避免多组标签挤成一片读不出区别 */
function TagRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="w-16 shrink-0 text-xs text-faint" title={hint}>
        {label}
      </span>
      {children}
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
