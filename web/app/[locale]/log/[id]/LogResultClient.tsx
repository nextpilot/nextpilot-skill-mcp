"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/routing";
import { useLogAnalyzer } from "@/hooks/useLogAnalyzer";
import { LogReport } from "@/components/LogReport";
import { getReport, initReportStore } from "@/lib/report-history";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { STAGE_TEXT, STAGE_PROGRESS } from "@/lib/stage-labels";

type TabKey = "sysmsg" | "metrics" | "messages" | "params" | "charts" | "summary" | "ai";

export function LogResultClient() {
    const params = useParams();
    const id = String(params.id);

    const {
        stage,
        stageDetail,
        error,
        report,
        manifest,
        info,
        aiMarkdown,
        storedPlots,
        // 不取 `quota`：AI 解读页不再显示次数（次数以后由后台配置）。
        loggedIn,
        cachedHashes,
        busy,
        explain,
        requestSeries,
        requestSpectrum,
        loadTrack,
        openSaved,
        recoverWithFile,
        inputRef,
    } = useLogAnalyzer();

    const [loading, setLoading] = useState(true);
    // 打开报告默认停在「基本情况」
    const [tab, setTab] = useState<TabKey>("metrics");
    const loadedRef = useRef(false);

    // 加载报告：优先本机存档，其次云端。
    // 存档里若带着派生数据（参数/消息/曲线），openSaved 会直接渲染，不启动 Worker、不解析日志；
    // 只有老记录（没有派生数据）才会退回"用本机缓存的原始字节重新解析"。
    useEffect(() => {
        if (loadedRef.current) return;
        loadedRef.current = true;

        void (async () => {
            await initReportStore(); // 幂等；保证内存镜像已载入，getReport 才查得到
            const saved = getReport(id);
            if (saved) {
                void openSaved(saved);
                setLoading(false);
                return;
            }
            try {
                const resp = await fetch(`/api/reports/detail?id=${encodeURIComponent(id)}`);
                if (!resp.ok) throw new Error("not found");
                const data = await resp.json();
                if (data.report) await openSaved(data.report);
            } catch {
                // 本机与云端都没有：下面按"未找到"渲染
            }
            setLoading(false);
        })();
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleGenerateAi = () => {
        if (report) {
            setTab("ai");
            void explain(report, id);
        }
    };

    /** 「重新选择该 .ulg 文件」：报告页上的提示与轨迹地图共用这一个入口 */
    const handleRestoreClick = () => inputRef.current?.click();

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
                <Breadcrumbs items={[{ label: "日志分析", href: "/log" }, { label: "未找到" }]} />
                <div className="mt-12 flex flex-col items-center gap-4 text-center">
                    <p className="text-lg font-medium text-muted">未找到该分析报告</p>
                    <p className="text-sm text-muted">该报告可能已被删除，或从未在本机生成。</p>
                    <Link href="/log" className="btn-primary mt-2">
                        <ArrowLeft className="h-4 w-4" /> 返回日志分析
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="page-shell pt-4 pb-10 sm:pt-5">
            <Breadcrumbs items={[{ label: "日志分析", href: "/log" }, { label: report.fileName }]} />

            {/* 顶部导航栏 */}
            <div className="mb-5 flex flex-wrap items-center gap-3">
                <Link
                    href="/log"
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

            {/* 处理中提示：跳转是立即的，这里明确告诉用户在做什么，别让人以为卡死 */}
            {busy && !manifest && (
                <div className="mb-5 flex items-start gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
                    <div>
                        <p className="font-medium text-text">正在处理数据…{report ? "（补齐图表数据）" : ""}</p>
                        <p className="mt-0.5 text-xs text-muted">
                            {STAGE_TEXT[stage] ?? "加载中…"}
                            {(stage === "loading-runtime" || stage === "installing-parser") &&
                                "（首次运行需下载解析运行时，约十余秒）"}
                        </p>
                        {stageDetail && <p className="text-xs text-muted mt-1">{stageDetail}</p>}
                        <div className="mt-2 h-1 w-full rounded-full bg-border">
                            <div
                                className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                                style={{ width: `${STAGE_PROGRESS[stage] ?? 5}%` }}
                            />
                        </div>
                        {report && (
                            <p className="mt-0.5 text-xs text-faint">
                                这份报告生成时没有缓存图表数据，会重新解析一遍原始日志；之后打开即秒开。
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* 错误 */}
            {error && (
                <div className="mb-5 rounded-lg border border-critical/40 bg-critical/[0.06] p-4 text-sm text-critical">
                    {error}
                </div>
            )}

            {/* 「重新选择该 .ulg 文件」用的选择框：报告页唯一的上传入口，选完就地重解析补齐
          图表/轨迹（不跳回列表页）。选完清空 value，同一份文件要能连选两次（上次没成功能再试），
          不清的话第二次选同一个文件不会触发 onChange。 */}
            <input
                ref={inputRef}
                type="file"
                accept=".ulg,.ULG,.bin,.BIN"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void recoverWithFile(f);
                }}
            />

            {/* 主分析报告 */}
            <div className="card p-5 sm:p-6">
                <LogReport
                    report={report}
                    aiMarkdown={aiMarkdown}
                    manifest={manifest}
                    storedPlots={storedPlots}
                    info={info}
                    requestSeries={requestSeries}
                    requestSpectrum={requestSpectrum}
                    loadTrack={loadTrack}
                    onRestore={handleRestoreClick}
                    explaining={stage === "explaining"}
                    loggedIn={loggedIn}
                    logCached={Boolean(report.logHash && cachedHashes.has(report.logHash))}
                    onGenerateAi={handleGenerateAi}
                    activeTab={tab}
                    onTabChange={setTab}
                />
            </div>
        </div>
    );
}
