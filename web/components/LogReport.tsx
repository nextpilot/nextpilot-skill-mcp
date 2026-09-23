"use client";

import { useState } from "react";
import { Link } from "@/i18n/routing";
import { reportManual } from "@/lib/issue-bridge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    ShieldAlert,
    AlertTriangle,
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
    CalendarClock,
    HardDrive,
    FileUp,
} from "lucide-react";
import type { AnalysisReport, Finding, LogInfo, Severity, SeriesResponse, TopicManifest } from "@/lib/types";
import type { SeriesRequest } from "@/lib/chart-presets";
import type { TrackData } from "@/lib/types";
import { LogCharts } from "./LogCharts";
import type { StoredPlotPanel, StoredPlotSeries } from "@/lib/chart-presets";
import { LogEventsMsg } from "./LogEventsMsg";
import { LogParamsMsg } from "./LogParamsMsg";
import { LogSystemMsg } from "./LogSystemMsg";
import { LogPhaseStrip } from "./LogPhaseStrip";
import { formatDateTime, formatFirmware } from "@/lib/format";
import { vehicleTypeLabel } from "@/lib/vehicle-type";
import { isDarkTheme, modeStyle } from "@/lib/phase-colors";
import { LogFlightMap } from "./LogFlightMap";

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

/**
 * 一份日志的**分析报告**正文（tab 壳）。六个子组件——`LogCharts` / `LogEventsMsg` /
 * `LogParamsMsg` / `LogSystemMsg` / `LogPhaseStrip` / `LogFlightMap`——全在 `Log*` 家族里，
 * 所以本组件也带 `Log` 词根：它渲染的确实是**某一份**日志。
 *
 * `Log*` 家族的定义是"渲染**某一份**日志的分析结果"，**不是**"手里有日志字节"：
 * 从历史打开时字节可能已被淘汰（`REPORT_DATA_KEEP`），本组件与子组件都各自处理了那条路
 * （`isHistory` / `manifest?` / `storedPanels`）。**集合类**（一次列很多份）不在此列，
 * 见 `ReportHistoryList.tsx` 那份说明。
 *
 * 名字曾叫 `AnalyzeReport`：`Analyze` 是**路由**的词（`app/analyze/`、`Analyze*Client`、
 * `useLogAnalyzer`），让 `components/` 里的一个共享组件再挂一次同一个词，读的人看不出它在
 * `Log*` 家族里占哪一格——正是 §6.4「词根认亲」要避免的（同 §6.4 第②条的事故形态：
 * 名字读出的关系与真实关系不一致）。
 */
export function LogReport({
    report,
    aiMarkdown,
    manifest,
    storedPlots,
    info,
    requestSeries,
    loadTrack,
    onRestore,
    explaining,
    loggedIn,
    logCached,
    onGenerateAi,
    activeTab,
    onTabChange,
}: {
    report: AnalysisReport;
    aiMarkdown: string | null;
    manifest: TopicManifest | null;
    /** 存档里的曲线（打开历史时用：面板 + 序列都在里面，不必再解析日志） */
    storedPlots: { panels: StoredPlotPanel[]; series: StoredPlotSeries } | null;
    info: LogInfo | null;
    requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
    /** 取 GPS 轨迹（存档优先，否则问 Worker） */
    loadTrack: () => Promise<TrackData>;
    /** 「重新选择该 .ulg 文件」：打开文件选择框，选完**就地**重解析，把缺的图表/轨迹补齐
     *  （不跳走、不清空当前报告；AI 报告沿用存档里那份，不重复花额度） */
    onRestore: () => void;
    explaining: boolean;
    loggedIn: boolean;
    logCached: boolean;
    onGenerateAi: () => void;
    activeTab: TabKey;
    onTabChange: (tab: TabKey) => void;
}) {
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
        { key: "ai", label: "AI 解读", icon: <Sparkles className="h-4 w-4" /> },
    ];
    const effectiveTab = isHistory ? "summary" : activeTab;

    return (
        <div>
            {/* 概要 */}
            <div className="flex flex-wrap items-center gap-3 pb-5">
                <FileCheck2 className="h-5 w-5 text-ok" />
                <div>
                    {/* 文件名调大一号；下面只留「上传日期 + 文件大小」，各带一个小图标 */}
                    <p className="text-base font-medium break-all">{report.fileName}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span className="flex items-center gap-1" title="上传（分析）时间">
                            <CalendarClock className="h-3.5 w-3.5" />
                            {formatDateTime(report.analyzedAt)}
                        </span>
                        <span className="flex items-center gap-1" title="日志文件大小">
                            <HardDrive className="h-3.5 w-3.5" />
                            {(report.fileSize / 1024 / 1024).toFixed(2)} MB
                        </span>
                    </p>
                </div>
            </div>

            {/* 飞行概况：载具身份 + 时长 + 记录起始时刻（对齐 Flight Review 的 General 表） */}
            <GeneralInfo report={report} />

            {/* 飞行轨迹（原来挂在"系统信息"框里，那个框已按要求去掉） */}
            {info && (
                <section className="mb-5 rounded-lg bg-surface-2 p-4">
                    <h3 className="mb-1 text-sm font-semibold">飞行轨迹</h3>
                    <LogFlightMap loadTrack={loadTrack} onRestore={onRestore} />
                </section>
            )}

            {/* 飞行阶段时间轴 */}
            {info?.phases?.length ? (
                <LogPhaseStrip phases={info.phases} />
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
                    这份报告只存档了检查结论与 AI 解读（原始日志从不上传）。图表、消息、参数与轨迹需要重新解析原始日志——
                    {logCached
                        ? "这份日志本机有缓存，点下面的按钮即可恢复（之后就秒开）。"
                        : "本机没有它的缓存（已被容量淘汰或来自其他设备），重新选择该 .ulg 文件即可恢复。"}
                    <RestoreButton onRestore={onRestore} />
                </p>
            )}

            {/* 参数/消息有、但曲线缺（旧报告）：说明为什么图表 tab 是灰的，以及怎么补 */}
            {info && !manifest && !storedPlots?.panels?.length && (
                <p className="mb-4 rounded-lg bg-surface-2 p-3 text-xs leading-5 text-muted">
                    这份报告的<strong className="font-medium text-text">曲线数据没有缓存</strong>
                    （旧版本生成的报告，或上次的分析被中断）——
                    {logCached
                        ? "本机有缓存，点下面的按钮解析一次即可补齐，之后就一直有了。"
                        : "本机也没有它的原始日志缓存，重新选择该 .ulg 文件即可恢复图表与轨迹。"}
                    <RestoreButton onRestore={onRestore} />
                </p>
            )}

            {/* tabs */}
            <div role="tablist" className="flex gap-1 border-b border-border">
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        role="tab"
                        data-testid={`tab-${t.key}`}
                        aria-selected={effectiveTab === t.key}
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
                {effectiveTab === "summary" && <SummaryTab report={report} />}
                {effectiveTab === "ai" && (
                    <AiTab
                        aiMarkdown={aiMarkdown}
                        explaining={explaining}
                        loggedIn={loggedIn}
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
                        notes={report.instanceNotes ?? null}
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
                    <table className="w-full text-sm" data-testid="metrics-table">
                        <tbody>
                            {metrics.map((m) => (
                                <tr key={m.key} className="border-b border-border/60 last:border-0">
                                    <td className="w-1/2 px-3 py-2 text-muted">{m.label ?? m.key}</td>
                                    <td className="px-3 py-2 font-medium tabular-nums text-text">
                                        {typeof m.value === "number" ? m.value.toLocaleString("zh-CN") : m.value}
                                        {m.unit ? (
                                            <span className="ml-1 text-xs font-normal text-muted">{m.unit}</span>
                                        ) : null}
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
                    <h2 className="text-sm font-semibold">匹配故障模式（{report.matchedFaults.length}）</h2>
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

            <ReportIssueButton report={report} />
        </div>
    );
}

/**
 * 用户主动反馈"结论不对 / 漏判 / 看不懂"。
 *
 * 自动上报只能看见崩溃，看不见"结论算错了"——而后者恰恰是日志分析最容易出的问题，
 * 所以这个入口的价值不低于自动上报。
 *
 * 代价是要让用户提交内容，与"原始日志不上传"的卖点需要划清界限：只提交**结构性信息**
 * （命中的规则 id、结论条数、固件版本、平台、路由）与用户自己写的一段话，
 * **不含**日志内容、字段数值、文件名与账号信息。界面上把这一点明说。
 */
function ReportIssueButton({ report }: { report: AnalysisReport }) {
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState("");
    const [sent, setSent] = useState(false);

    const ruleIds = report.findings.map((f) => f.ruleId).filter(Boolean);
    const severityCounts = {
        critical: report.findings.filter((f) => f.severity === "critical").length,
        warning: report.findings.filter((f) => f.severity === "warning").length,
        info: report.findings.filter((f) => f.severity === "info").length,
    };

    const submit = () => {
        reportManual({
            ruleIds,
            findingCount: report.findings.length,
            severityCounts,
            note: note.trim() || undefined,
            platform: report.platform,
            firmware: report.verSw,
            parserVersion: report.parserVersion,
        });
        setSent(true);
    };

    if (sent) {
        return (
            <p className="mt-6 flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-4 text-xs leading-5 text-muted">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>已提交，谢谢。提交内容只含命中的规则与结论条数，不含日志内容与数值。</span>
            </p>
        );
    }

    return (
        <div className="mt-6 rounded-lg border border-dashed border-border-strong p-4">
            {open ? (
                <>
                    <p className="text-sm font-medium">这份报告哪里不对？</p>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        maxLength={500}
                        placeholder="例如：振动结论与实飞现象不符 / 漏判了 EKF 问题 / 提示看不懂（选填）"
                        className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm"
                    />
                    <p className="mt-2 text-xs leading-5 text-muted">
                        将提交：命中的规则 {ruleIds.length} 条、结论 {report.findings.length} 条（critical{" "}
                        {severityCounts.critical} / warning {severityCounts.warning}）、固件版本、平台与你写的这段话。
                        <strong className="font-medium text-text">不会提交</strong>
                        日志内容、字段数值、文件名与账号信息。
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                        <button type="button" onClick={submit} className="btn-primary">
                            提交反馈
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="rounded-lg border border-border px-3 py-1.5 text-sm"
                        >
                            取消
                        </button>
                    </div>
                </>
            ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted">结论看起来不对、漏判了，或者提示看不懂？反馈给我们。</p>
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-2"
                    >
                        反馈问题
                    </button>
                </div>
            )}
        </div>
    );
}

function AiTab({
    aiMarkdown,
    explaining,
    loggedIn,
    onGenerateAi,
}: {
    aiMarkdown: string | null;
    explaining: boolean;
    loggedIn: boolean;
    onGenerateAi: () => void;
}) {
    return (
        <div>
            <h2 className="mb-3 text-sm font-semibold">AI 解读（GJB-841 归零报告）</h2>
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
                    {/* 这里原先报「今日免费 N 次，剩余 N 次」/「匿名可免费试用 3 次/天」，
              2026-09-21 撤掉：次数上限以后由后台配置，前端不先替它报一个写死的数字。
              只留"这报告是什么、登录有什么用"，这两句不依赖次数。 */}
                    <p className="mt-2 text-xs text-muted">
                        {loggedIn
                            ? "由 DeepSeek 基于上述结构化检查结果生成，只把结论讲成人话，不参与数值判断。"
                            : "登录后可把报告存到云端，换设备也能接着看。"}
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
        <div className={`rounded-r-lg border-l-2 p-3.5 ${tone.cls}`} data-finding>
            <div className="flex items-center gap-2">
                {tone.icon}
                <span className="text-xs text-muted">{finding.id}</span>
                <span className="text-xs text-muted">· {finding.ruleId}</span>
                <h3 className="text-sm font-medium">{finding.title}</h3>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                <span className="text-muted">
                    字段 <span className="ml-1 break-all font-mono text-xs text-primary">{finding.evidence.field}</span>
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
            {finding.suggestion && <p className="mt-2 text-sm text-muted">{finding.suggestion}</p>}
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

/** 秒数 → `hh 时 mm 分 ss 秒`（小时不封顶：累计飞行常是几百小时，不折成"天"） */
function formatHms(sec: number): string {
    const s = Math.max(0, Math.round(sec));
    const p = (n: number) => String(n).padStart(2, "0");
    // 数字与单位之间留空格（与「1 分 24 秒」那种写法一致，挤在一起太密）
    return `${p(Math.floor(s / 3600))} 时 ${p(Math.floor((s % 3600) / 60))} 分 ${p(s % 60)} 秒`;
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
 * 飞行概况（字段口径对齐 Flight Review 的 General 表，标签用中文）：
 *   Vehicle UUID / 机型（机架）（vehicle_status.vehicle_type + SYS_AUTOSTART）/
 *   Vehicle Life（载具累计飞行时长）/ Flight Time（本次飞行时长）/ Logging Start /
 *   软件版本（ver_sw_branch（ver_sw））/ 硬件版本（ver_hw（ver_hw_subtype））
 * 数据由引擎算好并随 report 存档（`report.facts`），历史卡片与这里同源；缺哪项就不显示哪行。
 * 标签列**不带图标**：一列小图标只会让人多扫一遍，字段名本身已经说清了。
 */
function GeneralInfo({ report }: { report: AnalysisReport }) {
    const g = report.facts;
    const dark = isDarkTheme();
    const counts = {
        critical: report.findings.filter((f) => f.severity === "critical").length,
        warning: report.findings.filter((f) => f.severity === "warning").length,
        info: report.findings.filter((f) => f.severity === "info").length,
    };
    // 标签与取值同字号、同字体（不再给 UUID / 提交号之类套 font-mono：一处 12px 一处 14px 看着就是不齐）
    type Row = { label: string; value: string; title?: string };
    const rows: Row[] = [];
    if (g?.startUtc) {
        const d = new Date(g.startUtc * 1000);
        rows.push({
            label: "启动时间",
            value: formatDateTime(d),
            title: `记录起始时刻（本机时区）。UTC：${d.toISOString().replace("T", " ").slice(0, 19)}`,
        });
    }
    if (report.facts?.armedDurationSec) {
        rows.push({
            label: "飞行时长",
            value: formatDuration(report.facts.armedDurationSec),
            title: "本次日志里解锁（armed）的累计时长",
        });
    }
    // 飞行模式：整段日志出现过的 nav_state（按占样本数从多到少），配色与「飞行阶段」条、
    // 数据图表底色同一套（lib/phase-colors.ts）
    const modeList = g?.modes?.length ? g.modes : g?.mainMode ? [g.mainMode] : [];
    // 机型（机架）：机型是 PX4 的四类之一（vehicle_status.vehicle_type），机架是参数
    // SYS_AUTOSTART 的编号——编号对应的名字要查 PX4 的 airframes 表，本机没有那份表，
    // 就如实只给编号（别编名字）。两者合成一行：`旋翼（4040）`，只有一半时只显示那一半。
    // （云端记录取回的也是完整 report，facts 齐全，不必另找退路）
    const vt = g?.vehicleType;
    const af = g?.airframeId;
    if (vt || af) {
        rows.push({
            label: "机型机架",
            value: vt && af ? `${vehicleTypeLabel(vt)}（${af}）` : vehicleTypeLabel(vt) || String(af),
            title:
                `PX4 机型分类 vehicle_status.vehicle_type = ${vt || "（无）"}` +
                ` · 机架编号 SYS_AUTOSTART = ${af || "（无）"}（名称查 PX4 airframes 表）`,
        });
    }
    if (g?.uuid) {
        rows.push({
            label: "飞控 UUID",
            value: g.uuid,
            title: "飞控唯一 ID（sys_uuid / PX4GUID）",
        });
    }
    if (typeof g?.vehicleLifeS === "number") {
        rows.push({
            label: "累计飞行",
            value: formatHms(g.vehicleLifeS),
            title: "载具累计飞行时长（参数 LND_FLIGHT_T_HI/LO）",
        });
    }
    // 软件版本：展示串与历史卡片同一口径（`formatFirmware`，对齐 Flight Review 的
    // `_format_sw_version`：正式版 `v1.16.0`、alpha/beta/RC 带后缀、未打标签的开发版附短哈希）。
    // 分支 / 标签（ver_sw_branch）与 git 提交（ver_sw）放 title——它们是展示串的原料，
    // 摆在行里会跟展示串重复。老固件没有 branch；云端记录或极旧的存档可能没有 facts.verSw，
    // 退回报告记录上的 verSw（同源、截断过）
    const branch = g?.verSwBranch ?? "";
    const hash = g?.verSw || report.verSw || "";
    const fwText = formatFirmware(g, hash);
    if (fwText !== "—" || branch) {
        rows.push({
            label: "软件版本",
            value: fwText !== "—" ? fwText : branch,
            title: [
                branch ? `构建分支 / 标签 ver_sw_branch：${branch}` : "构建分支 / 标签：本份日志未写",
                hash ? `git 提交 ver_sw：${hash}` : "git 提交：无 ver_sw",
            ].join(" · "),
        });
    }

    // 硬件版本：板型（ver_hw）+ 同型号的批次 / 变体（ver_hw_subtype）。
    // 子型号显式写出来（哪怕是「日志未写」）——PX4 只给部分板子写这个键，
    // 空着会被当成"没做"，写明了才知道是日志里确实没有（可在「系统信息」tab 的字典里核对）
    const hw = g?.hardware ?? "";
    const hwSub = g?.hardwareSubtype ?? "";
    if (hw || hwSub) {
        rows.push({
            label: "硬件版本",
            value: hw ? `${hw}（${hwSub || "日志未写子型号"}）` : hwSub,
            title: `飞控板型号 ver_hw：${hw || "（无）"} · 硬件子型号 ver_hw_subtype：${hwSub || "（这份日志里没有这个键）"}`,
        });
    }

    const tags = report.tags ?? [];
    const guards = report.guardTags ?? [];
    return (
        <div className="mb-5 rounded-lg border border-border bg-surface-2 p-3">
            <h3 className="mb-2 text-sm font-semibold">飞行概况</h3>
            <table className="text-sm">
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.label}>
                            <td className="w-36 py-0.5 pr-3 align-top whitespace-nowrap text-muted" title={r.title}>
                                {r.label}
                            </td>
                            <td className="py-0.5 align-top break-all text-text">{r.value}</td>
                        </tr>
                    ))}

                    {modeList.length > 0 && (
                        <tr>
                            <td
                                className="w-36 py-1 pr-3 align-top whitespace-nowrap text-muted"
                                title="这次日志里出现过的飞行模式（vehicle_status.nav_state，按占样本数从多到少）"
                            >
                                飞行模式
                            </td>
                            <td className="flex flex-wrap gap-1.5 py-1 align-top">
                                {modeList.map((m) => {
                                    const st = modeStyle(m, dark);
                                    return (
                                        <span
                                            key={m}
                                            className="chip"
                                            style={{ borderColor: st.color, color: st.color }}
                                        >
                                            <span
                                                className="inline-block h-2 w-2 rounded-sm"
                                                style={{ backgroundColor: st.color }}
                                            />
                                            {st.label}
                                        </span>
                                    );
                                })}
                            </td>
                        </tr>
                    )}

                    {/* 异常标签 / 数据质量也归在这里：都是"这份日志是什么样"的客观描述 */}
                    {tags.length > 0 && (
                        <tr>
                            <td
                                className="w-36 py-1 pr-3 align-top whitespace-nowrap text-muted"
                                title="确定性引擎命中的异常标签（喂给故障知识库匹配）"
                            >
                                异常标签
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
                            <td
                                className="w-36 py-1 pr-3 align-top whitespace-nowrap text-muted"
                                title="数据质量标签：影响结论可信度"
                            >
                                数据质量
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

                    {/* 检查结论的三档计数：原在页面顶部那三个胶囊里，挪进来与"这份日志是什么样"放在一起 */}
                    <tr>
                        <td
                            className="w-36 py-1 pr-3 align-top whitespace-nowrap text-muted"
                            title="确定性引擎的检查结论条数（明细见「检查结论」tab）"
                        >
                            检查结论
                        </td>
                        {/* 与上面 异常标签 / 数据质量 / 飞行模式 用同一种 chip：同样的圆角、字号与描边。
                原来是 rounded-full 的大胶囊（px-2 py-1 font-semibold），跟整块表不是一个调子 */}
                        <td className="flex flex-wrap gap-1.5 py-1 align-top">
                            <span className="chip border-critical/40 text-critical">
                                <ShieldAlert className="h-3 w-3" />
                                {counts.critical} 严重
                            </span>
                            <span className="chip border-warning/40 text-warning">
                                <AlertTriangle className="h-3 w-3" />
                                {counts.warning} 警告
                            </span>
                            <span className="chip border-border text-muted">
                                <Info className="h-3 w-3" />
                                {counts.info} 提示
                            </span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

/**
 * 「重新选择该 .ulg 文件」：三处"数据没缓存"的提示（轨迹 / 曲线 / 纯历史）共用它。
 * 以前这些提示只写了这句话，但页面上根本没有选文件的入口——用户得自己猜出"回列表页再选一次"，
 * 而那条路以前也不会重新解析（存档不缺"版本"就跳过解析，见 useLogAnalyzer.handleFile）。
 */
function RestoreButton({ onRestore, label = "重新选择该 .ulg 文件" }: { onRestore: () => void; label?: string }) {
    return (
        <button type="button" onClick={onRestore} className="btn-ghost ml-1.5 inline-flex gap-1.5 px-2.5 py-1 text-xs">
            <FileUp className="h-3.5 w-3.5" />
            {label}
        </button>
    );
}

function TagRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="w-16 shrink-0 text-xs text-faint" title={hint}>
                {label}
            </span>
            {children}
        </div>
    );
}
