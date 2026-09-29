"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { LogInfo } from "@/lib/types";

const inputCls =
    "w-56 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none";

/**
 * 系统消息 tab：ULog 的键值字典与记录统计。Multi Information（'M'）虽然也是字典，
 * 但内容多是固件 boot 日志、性能计数这类"发生了什么"，所以放在「事件消息」tab。
 */
export function LogSystemMsg({ info }: { info: LogInfo }) {
    const [query, setQuery] = useState("");

    /** 老存档（这份字段还没进 LogInfo 时存的）会整个缺 infoDict：那是"没采集"，不是"日志里没有" */
    const hasDict = info.infoDict !== undefined;
    const dict = info.infoDict ?? [];
    const stats = info.msgTypeStats ?? [];
    const statTotal = stats.reduce((s, r) => s + r.count, 0);

    const dictShown = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return dict;
        return dict.filter((e) => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q));
    }, [dict, query]);

    // 类型统计是从文件字节流现算的，任何正常日志都不为空，两者都空只可能是老存档（没采集）
    if (!hasDict && stats.length === 0) {
        return (
            <p className="rounded-lg bg-surface-2 p-3 text-xs leading-5 text-muted">
                这份报告是<strong className="font-medium text-text">旧版本存档</strong>
                的，当时没有采集消息记录统计与系统信息——重新选择该日志文件解析一次即可补齐。
            </p>
        );
    }

    return (
        <div>
            {/* Information Message：键 → 值 */}
            <section>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">
                        系统信息 <span className="font-normal text-muted">（共 {dict.length} 项）</span>
                    </h3>
                    <label className="relative ml-auto">
                        <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-muted" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="搜索键或值…"
                            className={`${inputCls} pl-8`}
                        />
                    </label>
                </div>

                {!hasDict ? (
                    <p className="rounded-lg bg-surface-2 p-3 text-xs leading-5 text-muted">
                        这份报告是<strong className="font-medium text-text">旧版本存档</strong>
                        的，当时没有采集 Information Message 字典——重新选择该日志文件解析一次即可补齐。
                    </p>
                ) : dictShown.length === 0 ? (
                    <p className="text-sm text-muted">
                        {dict.length === 0 ? "该日志未记录系统信息。" : "没有匹配的系统信息。"}
                    </p>
                ) : (
                    // 不设内部滚动：这份字典由固件决定，通常就十几二十项，让它自然撑开、跟着页面滚，
                    // 免得在一个小框里来回找；窄屏由 overflow-x-auto 兜横向
                    <div className="overflow-x-auto rounded-xl bg-surface-2 p-3">
                        <table className="w-full min-w-[480px] text-sm">
                            <thead>
                                <tr className="text-left text-[11px] text-muted">
                                    <th className="pb-2 pr-3 font-normal">变量名</th>
                                    <th className="pb-2 pr-3 font-normal">取值</th>
                                    <th className="pb-2 font-normal">说明</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dictShown.map((e) => (
                                    <tr key={e.key} className="border-b border-border/50 last:border-0">
                                        <td className="py-1.5 pr-3 align-top whitespace-nowrap">
                                            <span className="flex flex-col">
                                                <span className="text-text">{e.name || e.key}</span>
                                                {e.name ? (
                                                    <span className="font-mono text-xs text-faint">{e.key}</span>
                                                ) : null}
                                            </span>
                                        </td>
                                        <td className="py-1.5 pr-3 align-top break-all text-text">{e.value}</td>
                                        <td className="py-1.5 align-top text-xs leading-5 text-muted">{e.desc}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* 消息记录统计：逐字节数出来的条数 */}
            {stats.length > 0 && (
                <section className="mt-6">
                    <h3 className="mb-2 text-sm font-semibold">
                        消息记录统计{" "}
                        <span className="font-normal text-muted">（共 {statTotal.toLocaleString()} 条）</span>
                    </h3>
                    {!info.msgTypeWalkOk && (
                        <p className="mb-2 rounded-lg bg-surface-2 p-3 text-xs leading-5 text-muted">
                            这份日志的字节流<strong className="font-medium text-text">没有走到文件末尾</strong>
                            （尾部被截断，或是追加写入的日志）——下面的条数是"读到多少算多少"，可能不完整。
                        </p>
                    )}
                    <div className="rounded-xl bg-surface-2 p-3">
                        <table className="w-full min-w-[620px] text-sm">
                            <thead>
                                <tr className="text-left text-[11px] text-muted">
                                    <th className="pb-2 pr-3 font-normal">变量名</th>
                                    <th className="pb-2 pr-3 font-normal">类型</th>
                                    <th className="pb-2 pr-3 font-normal">条数</th>
                                    <th className="pb-2 font-normal">说明</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.map((r) => (
                                    <tr key={r.code} className="border-b border-border/50 last:border-0">
                                        <td className="py-1.5 pr-3 align-top whitespace-nowrap text-text">
                                            {r.en || r.name}
                                            {r.en && r.name !== r.en ? (
                                                <span className="ml-1.5 text-[11px] text-faint">{r.name}</span>
                                            ) : null}
                                        </td>
                                        <td className="py-1.5 pr-3 align-top">
                                            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted">
                                                {r.code}
                                            </span>
                                        </td>
                                        <td className="py-1.5 pr-3 align-top text-text tabular-nums">
                                            {r.count.toLocaleString()}
                                        </td>
                                        <td className="py-1.5 align-top text-xs leading-5 text-muted">{r.desc}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
}
