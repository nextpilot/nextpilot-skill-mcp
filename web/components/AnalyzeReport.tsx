"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ShieldAlert,
  AlertTriangle,
  Fingerprint,
  CalendarClock,
  Clock,
  Timer,
  Activity,
  Info,
  FileCheck2,
  LineChart,
  ScrollText,
  ClipboardCheck,
  ListFilter,
  Database,
  Sparkles,
  ExternalLink,
  Loader2,
} from "lucide-react";
import type {
  AnalysisReport,
  Finding,
  LogInfo,
  Severity,
  SeriesResponse,
  TopicManifest,
} from "@/lib/types";
import type { SeriesRequest } from "@/lib/chart-presets";
import type { TrackData } from "@/lib/types";
import { LogCharts } from "./LogCharts";
import type { StoredPlotPanel, StoredPlotSeries } from "@/lib/chart-presets";
import { LogEventsMsg } from "./LogEventsMsg";
import { LogParamsMsg } from "./LogParamsMsg";
import { LogSystemMsg } from "./LogSystemMsg";
import { PhaseStrip } from "./PhaseStrip";
import { formatDateTime } from "@/lib/format";
import { LogFlightMap } from "./LogFlightMap";

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

type TabKey = "sysmsg" | "metrics" | "messages" | "params" | "charts" | "summary" | "ai";

export function AnalyzeReport({
  report,
  aiMarkdown,
  manifest,
  storedPlots,
  info,
  requestSeries,
  loadTrack,
  explaining,
  loggedIn,
  quota,
  logCached,
  onGenerateAi,
  activeTab,
  onTabChange,
}: {
  report: AnalysisReport;
  aiMarkdown: string | null;
  manifest: TopicManifest | null;
  /** 存档里的曲线（打开历史时用：面板 + 序列都在里面，不必再解析日志） */
  storedPlots: { panels: StoredPlotPanel[]; series: StoredPlotSeries; } | null;
  info: LogInfo | null;
  requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
  /** 取 GPS 轨迹（存档优先，否则问 Worker） */
  loadTrack: () => Promise<TrackData>;
  explaining: boolean;
  loggedIn: boolean;
  logCached: boolean;
  quota: { used: number; limit: number; anonymous?: boolean; loginLimit?: number } | null;
  onGenerateAi: () => void;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}) {
  const counts = {
    critical: report.findings.filter((f) => f.severity === "critical").length,
    warning: report.findings.filter((f) => f.severity === "warning").length,
    info: report.findings.filter((f) => f.severity === "info").length,
  };

  // "纯历史"指只能看结论（没有参数/消息/曲线）：此时强制停在结论页并给出恢复提示
  const isHistory = !info && !manifest && !storedPlots?.panels?.length;
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    // 顺序：先看"这份日志是什么"（基本情况 → 系统消息 → 事件 → 参数 → 曲线），再看"判定结论"，最后 AI
    { key: "metrics", label: "基本情况", icon: <Activity className="h-4 w-4" /> },
    { key: "sysmsg", label: "系统消息", icon: <Database className="h-4 w-4" />, disabled: !info },
    { key: "messages", label: "事件消息", icon: <ScrollText className="h-4 w-4" />, disabled: !info },
    { key: "params", label: "飞控参数", icon: <ListFilter className="h-4 w-4" />, disabled: !info },
    {
      key: "charts",
      label: "数据图表",
      icon: <LineChart className="h-4 w-4" />,
      disabled: !manifest && !storedPlots?.panels?.length,
    },
    { key: "summary", label: "检查结论", icon: <ClipboardCheck className="h-4 w-4" /> },
    { key: "ai", label: "AI 中文解读", icon: <Sparkles className="h-4 w-4" /> },
  ];
  const effectiveTab = isHistory ? "summary" : activeTab;

  return (
    <div>
      {/* 概要 */}
      <div className="flex flex-wrap items-center gap-3 pb-5">
        <FileCheck2 className="h-5 w-5 text-ok" />
        <div className="text-sm">
          <p className="font-medium">{report.fileName}</p>
          <p className="text-xs text-muted">
            {(report.fileSize / 1024 / 1024).toFixed(2)} MB
            {report.facts?.durationSec ? ` · 时长 ${Math.round(report.facts.durationSec)}s` : ""}
            {report.facts?.vehicleType
              ? ` · ${VEHICLE_TYPE_LABELS[report.facts.vehicleType] ?? report.facts.vehicleType}`
              : ""}
          </p>
        </div>
        <div className="ml-auto flex gap-2 text-xs">
          <CountPill
            icon={<ShieldAlert className="h-3.5 w-3.5" />}
            n={counts.critical}
            label="严重"
            tone="critical"
          />
          <CountPill
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            n={counts.warning}
            label="警告"
            tone="warning"
          />
          <CountPill
            icon={<Info className="h-3.5 w-3.5" />}
            n={counts.info}
            label="提示"
            tone="info"
          />
        </div>
      </div>

      {/* 飞行概况：载具身份 + 时长 + 记录起始时刻（对齐 Flight Review 的 General 表） */}
      <GeneralInfo report={report} />

      {/* 飞行轨迹（原来挂在"系统信息"框里，那个框已按要求去掉） */}
      {info && (
        <section className="mb-5 rounded-lg bg-surface-2 p-4">
          <h3 className="mb-1 text-sm font-semibold">飞行轨迹</h3>
          <LogFlightMap loadTrack={loadTrack} />
        </section>
      )}

      {/* 飞行阶段时间轴 */}
      {info?.phases?.length ? (
        <PhaseStrip phases={info.phases} />
      ) : report.facts?.phases?.length ? (
        <div className="mb-5">
          <TagRow label="飞行阶段">
            {report.facts.phases.map((p) => (
              <span key={p} className="chip chip-brand">
                {PHASE_LABELS[p] ?? p}
              </span>
            ))}
          </TagRow>
        </div>
      ) : null}

      {/* 纯历史（只有结论与 AI 文本，没有任何派生数据）：说明怎么把图表/参数/消息捞回来 */}
      {!info && (
        <p className="mb-5 rounded-lg bg-surface-2 p-4 text-xs leading-5 text-muted">
          这份报告只存档了检查结论与 AI 解读（原始日志从不上传）。图表、消息与参数需要重新解析原始日志——
          {logCached
            ? "这份日志本机有缓存，重新选择该 .ulg 文件即可恢复（之后就秒开）。"
            : "本机没有它的缓存（已被容量淘汰或来自其他设备），重新选择该 .ulg 文件即可恢复。"}
        </p>
      )}

      {/* 参数/消息有、但曲线缺（旧报告）：说明为什么图表 tab 是灰的，以及怎么补 */}
      {info && !manifest && !storedPlots?.panels?.length && (
        <p className="mb-4 rounded-lg bg-surface-2 p-3 text-xs leading-5 text-muted">
          这份报告的<strong className="font-medium text-text">曲线数据没有缓存</strong>
          （旧版本生成的报告，或上次的分析被中断）——
          {logCached
            ? "重新选择该 .ulg 文件（或在左侧历史条目上点「完整数据」）解析一次即可补齐，之后就一直有了。"
            : "本机也没有它的原始日志缓存，重新选择该 .ulg 文件即可恢复图表与轨迹。"}
        </p>
      )}

      {/* tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={t.disabled}
            aria-label={t.label}
            title={t.label}
            onClick={() => onTabChange(t.key)}
            className={`-mb-px flex items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors sm:px-3 ${
              effectiveTab === t.key
                ? "border-primary font-medium text-text"
                : t.disabled
                  ? "cursor-not-allowed border-transparent text-muted/50"
                  : "border-transparent text-muted hover:text-text"
            }`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        {effectiveTab === "metrics" && <MetricsTab report={report} />}
        {effectiveTab === "summary" && (
          <SummaryTab report={report} />
        )}
        {effectiveTab === "ai" && (
          <AiTab
            aiMarkdown={aiMarkdown}
            explaining={explaining}
            loggedIn={loggedIn}
            quota={quota}
            onGenerateAi={onGenerateAi}
          />
        )}
        {effectiveTab === "charts" && (manifest || storedPlots?.panels?.length) && info && (
          <LogCharts
            manifest={manifest}
            storedPanels={storedPlots?.panels ?? null}
            storedSeries={storedPlots?.series ?? null}
            phases={info.phases}
            requestSeries={requestSeries}
          />
        )}
        {effectiveTab === "messages" && info && <LogEventsMsg info={info} />}
        {effectiveTab === "sysmsg" && info && <LogSystemMsg info={info} />}
        {effectiveTab === "params" && info && <LogParamsMsg info={info} />}
      </div>
    </div>
  );
}

/** 关键数据：本份日志的实测值一览。顺序与中文名来自 facts.yaml 的 metrics；
 *  规则没跑到的那几项由声明里的兜底算式现算，所以不会因为某条规则 skip 就少几行。 */
function MetricsTab({ report }: { report: AnalysisReport }) {
  const metrics = report.metrics ?? [];
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">关键数据（确定性引擎实测）</h2>
      {metrics.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Info className="h-4 w-4" />
          这份报告没有记录关键数据（老版本生成的报告重新分析一次即可）。
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <tbody>
              {metrics.map((m) => (
                <tr key={m.key} className="border-b border-border/60 last:border-0">
                  <td className="w-1/2 px-3 py-2 text-muted">{m.label ?? m.key}</td>
                  <td className="px-3 py-2 font-medium tabular-nums text-text">
                    {typeof m.value === "number" ? m.value.toLocaleString("zh-CN") : m.value}
                    {m.unit ? <span className="ml-1 text-xs font-normal text-muted">{m.unit}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryTab({ report }: { report: AnalysisReport }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">检查明细（确定性引擎）</h2>
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

      {/* 故障知识库 */}
      {report.matchedFaults && report.matchedFaults.length > 0 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold">
            匹配故障模式（{report.matchedFaults.length}）
          </h2>
          {report.matchedFaults.map((mf) => (
            <div
              key={mf.faultId}
              className="rounded-lg border border-border bg-surface-2 p-4 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                  {mf.faultId}
                </span>
                <span className="text-xs text-muted">风险等级：{mf.riskLevel}</span>
                {mf.note && <span className="text-xs text-warning">禁忌：{mf.note}</span>}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-muted">
                    可能根因（按排查优先级）
                  </p>
                  <ol className="list-decimal space-y-0.5 pl-4 text-xs leading-5">
                    {mf.possibleRootCause.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ol>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted">
                    排查步骤（由简到繁）
                  </p>
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
    </div>
  );
}

function AiTab({
  aiMarkdown,
  explaining,
  loggedIn,
  quota,
  onGenerateAi,
}: {
  aiMarkdown: string | null;
  explaining: boolean;
  loggedIn: boolean;
  quota: { used: number; limit: number; anonymous?: boolean; loginLimit?: number } | null;
  onGenerateAi: () => void;
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">
        AI 中文解读（GJB-841 归零报告）
      </h2>
      {aiMarkdown ? (
        <article className="prose-guide">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ children, href }) => <Link href={href ?? "#"}>{children}</Link>,
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
          <button type="button" onClick={onGenerateAi} className="btn-primary">
            <Sparkles className="h-4 w-4" />
            生成 AI 中文报告
          </button>
          <p className="mt-2 text-xs text-muted">
            {loggedIn
              ? `由 DeepSeek 基于上述结构化检查结果生成，今日免费 ${quota?.limit ?? 10} 次${
                  quota
                    ? `，剩余 ${Math.max(quota.limit - quota.used, 0)} 次`
                    : ""
                }`
              : `匿名可免费试用 ${quota?.limit ?? 3} 次/天，登录后 ${quota?.loginLimit ?? 10} 次/天并同步云端历史`}
          </p>
        </div>
      )}
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const TONES: Record<Severity, { cls: string; icon: React.ReactNode; label: string }> = {
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
        <h3 className="text-sm font-medium">{finding.title}</h3>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <span className="text-muted">
          字段{" "}
          <span className="ml-1 break-all font-mono text-xs text-primary">
            {finding.evidence.field}
          </span>
        </span>
        <span className="text-muted">
          实测值{" "}
          <span className="ml-1 font-semibold text-text">
            {String(finding.evidence.value)}
            {finding.evidence.unit ? ` ${finding.evidence.unit}` : ""}
          </span>
        </span>
        <span className="text-muted">
          阈值{" "}
          <span className="ml-1 text-text">
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

/** 秒数 → "3 天 4 小时 21 分 8 秒"（不足一天的省略"天"） */
function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const parts: string[] = [];
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (days > 0) parts.push(`${days} 天`);
  if (days > 0 || hours > 0) parts.push(`${hours} 小时`);
  if (days > 0 || hours > 0 || minutes > 0) parts.push(`${minutes} 分`);
  parts.push(`${seconds} 秒`);
  return parts.join(" ");
}

/**
 * 飞行概况（Flight Review 的 General 表口径）：
 *   Vehicle UUID / Vehicle Life（载具累计飞行时长）/ Flight Time（本次飞行时长）/ Logging Start
 * 数据由引擎算好并随 report 存档（`report.facts`），历史卡片与这里同源；缺哪项就不显示哪行。
 */
function GeneralInfo({ report }: { report: AnalysisReport }) {
  const g = report.facts;
  type Row = { label: string; value: string; title?: string; mono?: boolean; icon: React.ReactNode };
  const rows: Row[] = [];
  const icon = "h-3.5 w-3.5 shrink-0 text-faint";

  if (g?.uuid) {
    rows.push({
      label: "Vehicle UUID",
      value: g.uuid,
      mono: true,
      icon: <Fingerprint className={icon} />,
      title: "飞控唯一 ID（sys_uuid / PX4GUID）",
    });
  }
  if (typeof g?.vehicleLifeS === "number") {
    rows.push({
      label: "Vehicle Life",
      value: formatDuration(g.vehicleLifeS),
      icon: <Timer className={icon} />,
      title: "载具累计飞行时长（参数 LND_FLIGHT_T_HI/LO）",
    });
  }
  if (report.facts?.armedDurationSec) {
    rows.push({
      label: "Flight Time",
      value: formatDuration(report.facts.armedDurationSec),
      icon: <Clock className={icon} />,
      title: "本次日志里解锁（armed）的累计时长",
    });
  }
  if (g?.startUtc) {
    const d = new Date(g.startUtc * 1000);
    rows.push({
      label: "Logging Start",
      value: formatDateTime(d),
      icon: <CalendarClock className={icon} />,
      title: `记录起始时刻（本机时区）。UTC：${d.toISOString().replace("T", " ").slice(0, 19)}`,
    });
  }

  const tags = report.tags ?? [];
  const guards = report.guardTags ?? [];
  if (rows.length === 0 && tags.length === 0 && guards.length === 0) return null;

  return (
    <div className="mb-5 rounded-lg border border-border bg-surface-2 p-3">
      <h3 className="mb-2 text-sm font-semibold">飞行概况</h3>
      <table className="text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="w-36 py-0.5 pr-3 align-top text-xs whitespace-nowrap text-muted" title={r.title}>
                <span className="flex items-center gap-1.5">
                  {r.icon}
                  {r.label}
                </span>
              </td>
              <td className={`py-0.5 align-top break-all ${r.mono ? "font-mono text-xs" : ""} text-text`}>
                {r.value}
              </td>
            </tr>
          ))}

          {/* 异常标签 / 数据质量也归在这里：都是"这份日志是什么样"的客观描述 */}
          {tags.length > 0 && (
            <tr>
              <td className="w-36 py-1 pr-3 align-top text-xs whitespace-nowrap text-muted" title="确定性引擎命中的异常标签（喂给故障知识库匹配）">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className={icon} />
                  异常标签
                </span>
              </td>
              <td className="flex flex-wrap gap-1 py-1 align-top">
                {tags.map((t) => (
                  <span key={t} className="chip border-warning/40 text-warning">
                    {TAG_LABELS[t] ?? t}
                  </span>
                ))}
              </td>
            </tr>
          )}
          {guards.length > 0 && (
            <tr>
              <td className="w-36 py-1 pr-3 align-top text-xs whitespace-nowrap text-muted" title="数据质量标签：影响结论可信度">
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className={icon} />
                  数据质量
                </span>
              </td>
              <td className="flex flex-wrap gap-1 py-1 align-top">
                {guards.map((g) => (
                  <span key={g} className="chip border-critical/40 text-critical">
                    {GUARD_LABELS[g] ?? g}
                  </span>
                ))}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

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
    <span
      className={`flex items-center gap-1 rounded-full border px-2 py-1 font-semibold ${colors}`}
    >
      {icon}
      {n > 0 ? (
        <>
          <span>{n}</span>
          <span className="font-normal">{label}</span>
        </>
      ) : (
        <span className="font-normal">0 {label}</span>
      )}
    </span>
  );
}