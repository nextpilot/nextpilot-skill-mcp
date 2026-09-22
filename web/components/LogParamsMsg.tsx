"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ChangedParam, LogInfo, ParamDefault } from "@/lib/types";
import { formatLogTime } from "@/lib/format";

const inputCls =
    "w-56 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none";

/** 参数范围与说明的静态字典（构建期从 knowledge/px4/meta/main.json 生成）：
 *  参数名 → [min, max, desc]。**版本注意**：目前只有 PX4 main 分支产出过 parameters.json，
 *  release tag 没有，所以这份是最新分支的快照，与老固件可能有出入——界面如实标注来源。 */
const PARAM_META_URL = "/params/px4-main.json";
type ParamMeta = Record<string, [number | null, number | null, string]>;
interface ParamMetaFile {
    source: string;
    count: number;
    params: ParamMeta;
}

/** 模块级缓存：切 tab 回来不重新拉（浏览器 HTTP 缓存之外再省一次解析） */
let paramMetaCache: ParamMetaFile | null = null;
let paramMetaPromise: Promise<ParamMetaFile | null> | null = null;
function loadParamMeta(): Promise<ParamMetaFile | null> {
    if (paramMetaCache) return Promise.resolve(paramMetaCache);
    paramMetaPromise ??= fetch(PARAM_META_URL)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: ParamMetaFile | null) => {
            paramMetaCache = d;
            return d;
        })
        .catch(() => null);
    return paramMetaPromise;
}

/** 参数值多是 float32 放大成 double 的十进制展开（36.367515563964844），
 *  按 float32 的有效位数（7 位）收敛，读起来才是 PX4 里那个数。 */
function fmtVal(v: number | string | null | undefined): string {
    if (v === null || v === undefined) return "—";
    if (typeof v !== "number") return String(v);
    return String(Number.isInteger(v) ? v : Number(v.toPrecision(7)));
}

/** 两个参数值是否相同（日志里 int 与 float 会混着来，按数值比） */
function sameValue(a: unknown, b: unknown): boolean {
    const na = typeof a === "number" ? a : Number(a);
    const nb = typeof b === "number" ? b : Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
    return String(a) === String(b);
}

/** 参数 tab 的三种视图：全部 / 与默认不同（被改过） / 飞行中变更 */
type ParamScope = "all" | "modified" | "changed";

interface ParamRow {
    name: string;
    /** 日志开头的当前值（'P' 消息） */
    value: number | string | undefined;
    /** 这一行的"默认值"：见 defaultValue() */
    def: number | string | null;
    /** 默认值的出处（给 tooltip 用，不上表格） */
    defNote: string;
    /** 飞行中变更（'P' 消息出现在飞行段） */
    changes: ChangedParam[];
}

/**
 * 一行的默认值怎么来（PX4 的 'Q' 消息只记录**与当前值不同**的默认值，这条语义是全部依据）：
 *   · 记了机架默认（current_setup）→ 用它（机架配置算出来的值，通常就是"本该是多少"）
 *   · 只记了固件默认（system）→ 用它
 *   · 一条没记 → 当前值**就是**默认值（日志里没分歧，不编）
 * 所以这一列永远是一个具体数字，不需要"一致 / 已改"这种标记文字。
 */
function defaultValue(
    value: number | string | undefined,
    d: ParamDefault | undefined,
    known: boolean,
): { def: number | string | null; note: string } {
    if (!known) return { def: null, note: "该日志没有 Parameter Default 记录，无法判断默认值" };
    const hasSetup = d?.setup !== null && d?.setup !== undefined;
    const hasSystem = d?.system !== null && d?.system !== undefined;
    if (hasSetup) {
        const extra = hasSystem && !sameValue(d!.setup, d!.system) ? `；固件默认 ${fmtVal(d!.system)}` : "";
        return { def: d!.setup!, note: `机架默认${extra}` };
    }
    if (hasSystem) return { def: d!.system!, note: "固件默认" };
    return { def: value ?? null, note: "与默认一致（日志未记录分歧）" };
}

/**
 * 飞控参数 tab：六列「参数 / 当前值 / 默认值 / 最小值 / 最大值 / 说明」。
 *
 * - 默认值：PX4 只记录与当前值不同的默认值（PX4 logger.cpp: write_parameter_defaults），
 *   「没记录」= 当前值与两个默认都相同，所以这一列对每一行都能给出具体数字；
 * - 当前值与默认值不一致时**当前值标红**（这就是"被改过"的全部表达，不再另加标记文字）；
 * - 最小值 / 最大值 / 说明：来自 PX4 参数元数据快照（见 PARAM_META_URL），可能与你这份固件的
 *   版本有出入，缺失的留空。
 */
export function LogParamsMsg({ info }: { info: LogInfo }) {
    const [paramQuery, setParamQuery] = useState("");
    const [meta, setMeta] = useState<ParamMetaFile | null>(paramMetaCache);
    const [metaFailed, setMetaFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void loadParamMeta().then((d) => {
            if (cancelled) return;
            if (d) setMeta(d);
            else setMetaFailed(true);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const defaults = useMemo(() => info.defaultParams ?? {}, [info.defaultParams]);
    const defaultsKnown = info.defaultParamsKnown ?? Object.keys(defaults).length > 0;

    const rows = useMemo<ParamRow[]>(() => {
        const changedByName = new Map<string, ChangedParam[]>();
        for (const p of info.changedParams ?? []) {
            const arr = changedByName.get(p.name);
            if (arr) arr.push(p);
            else changedByName.set(p.name, [p]);
        }
        // 三个来源取并集：正常日志里三者一致，缺一段时也不会漏行
        const names = new Set([...Object.keys(info.params), ...Object.keys(defaults), ...changedByName.keys()]);
        return [...names]
            .sort((a, b) => a.localeCompare(b))
            .map((name) => {
                const value = info.params[name];
                const { def, note } = defaultValue(value, defaults[name], defaultsKnown);
                return { name, value, def, defNote: note, changes: changedByName.get(name) ?? [] };
            });
    }, [info.params, info.changedParams, defaults, defaultsKnown]);

    /** 当前值不等于默认值 = 被改过（红底红字标记的就是这批） */
    const isModified = (r: ParamRow) => r.def !== null && !sameValue(r.value, r.def);

    // 默认就停在"与默认不同"：打开这个 tab 的人多半就是想知道"哪些参数被改过"。
    // 老固件判不了默认值、或这份日志一条都没改，才退回"全部"（否则一进来是空表）。
    const [scope, setScope] = useState<ParamScope>(() => (defaultsKnown && rows.some(isModified) ? "modified" : "all"));
    const modifiedCount = useMemo(() => rows.filter(isModified).length, [rows]);
    const changedCount = useMemo(() => rows.filter((r) => r.changes.length > 0).length, [rows]);

    const shown = useMemo(() => {
        const q = paramQuery.trim().toLowerCase();
        const metaParams = meta?.params;
        return rows.filter((r) => {
            if (scope === "modified" && !isModified(r)) return false;
            if (scope === "changed" && r.changes.length === 0) return false;
            if (!q) return true;
            if (r.name.toLowerCase().includes(q)) return true;
            if (
                String(r.value ?? "")
                    .toLowerCase()
                    .includes(q)
            )
                return true;
            if (
                String(r.def ?? "")
                    .toLowerCase()
                    .includes(q)
            )
                return true;
            return (metaParams?.[r.name]?.[2] ?? "").toLowerCase().includes(q);
        });
    }, [rows, paramQuery, scope, meta]);

    const tabs: { key: ParamScope; label: string; n: number }[] = [
        { key: "all", label: "全部", n: rows.length },
        ...(defaultsKnown ? [{ key: "modified" as ParamScope, label: "与默认不同", n: modifiedCount }] : []),
        ...(changedCount > 0 ? [{ key: "changed" as ParamScope, label: "飞行中变更", n: changedCount }] : []),
    ];

    const emptyText = paramQuery
        ? "没有匹配的参数。"
        : scope === "modified"
          ? "没有与默认值不同的参数。"
          : scope === "changed"
            ? "没有飞行中变更的参数。"
            : "该日志未记录参数。";

    return (
        <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="flex overflow-hidden rounded-lg border border-border">
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setScope(t.key)}
                            className={`px-2.5 py-1.5 text-xs transition-colors ${
                                scope === t.key
                                    ? "bg-primary text-white"
                                    : "text-muted hover:bg-surface-2 hover:text-text"
                            }`}
                        >
                            {t.label} {t.n}
                        </button>
                    ))}
                </div>
                <label className="relative ml-auto">
                    <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-muted" />
                    <input
                        value={paramQuery}
                        onChange={(e) => setParamQuery(e.target.value)}
                        placeholder="按名称 / 值 / 说明搜索…"
                        className={`${inputCls} pl-8`}
                    />
                </label>
            </div>

            <p className="mb-3 text-[11px] leading-5 text-faint">
                {defaultsKnown
                    ? "默认值取自日志的 Parameter Default 记录：PX4 只记录与当前值不同的默认值，没记录的说明当前值就等于默认值，所以这一列每行都有具体数字。当前值与默认值不同时标红。"
                    : "该日志没有 Parameter Default 记录（固件较旧），无法判断参数是否被改动。"}
                {metaFailed
                    ? " 参数范围与说明字典未能加载。"
                    : meta
                      ? ` 最小值 / 最大值 / 说明来自 PX4 参数元数据快照（${meta.source}），与你这份固件的版本可能有出入，缺失的留空。`
                      : " 正在加载参数范围与说明…"}
            </p>

            <div className="max-h-[600px] overflow-auto rounded-xl bg-surface-2 p-3">
                <table className="w-full min-w-[720px] text-sm">
                    <thead>
                        <tr className="text-left text-[11px] text-muted">
                            {/* 列宽按"哪列更常看"分：参数与两个值给足，说明只留够读一行注释的宽度 */}
                            <th className="w-[22%] pb-2 pr-3 font-normal">参数</th>
                            <th className="w-[15%] pb-2 pr-3 text-right font-normal">当前值</th>
                            <th className="w-[15%] pb-2 pr-3 text-right font-normal">默认值</th>
                            <th className="w-[9%] pb-2 pr-3 text-right font-normal">最小值</th>
                            <th className="w-[9%] pb-2 pr-3 text-right font-normal">最大值</th>
                            <th className="pb-2 font-normal">说明</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((r) => {
                            const modified = isModified(r);
                            const metaRow = meta?.params?.[r.name];
                            const last = r.changes[r.changes.length - 1];
                            const changeTitle = r.changes
                                .map((c) => `飞行中 ${formatLogTime(c.tSec)} 改为 ${fmtVal(c.value)}`)
                                .join("；");
                            return (
                                <tr
                                    key={r.name}
                                    className={`border-b border-border/50 last:border-0 ${modified ? "bg-critical/6" : ""}`}
                                >
                                    <td className="py-1.5 pr-3 align-top font-mono text-xs whitespace-nowrap text-primary">
                                        {r.name}
                                    </td>
                                    <td className="py-1.5 pr-3 align-top text-right tabular-nums">
                                        <span className={modified ? "text-critical" : "text-text"}>
                                            {fmtVal(r.value)}
                                        </span>
                                        {last && (
                                            <span
                                                className="ml-2 whitespace-nowrap text-xs text-warning"
                                                title={changeTitle}
                                            >
                                                → {fmtVal(last.value)}
                                                <span className="ml-1 text-[11px] text-faint">
                                                    {formatLogTime(last.tSec)}
                                                </span>
                                            </span>
                                        )}
                                    </td>
                                    <td
                                        className="py-1.5 pr-3 align-top text-right text-text tabular-nums"
                                        title={r.defNote}
                                    >
                                        {fmtVal(r.def)}
                                    </td>
                                    <td className="py-1.5 pr-3 align-top text-right text-muted tabular-nums">
                                        {fmtVal(metaRow?.[0] ?? null)}
                                    </td>
                                    <td className="py-1.5 pr-3 align-top text-right text-muted tabular-nums">
                                        {fmtVal(metaRow?.[1] ?? null)}
                                    </td>
                                    <td className="py-1.5 align-top text-xs leading-5 text-muted">
                                        {metaRow?.[2] ?? ""}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {shown.length === 0 && <p className="py-4 text-center text-sm text-muted">{emptyText}</p>}
            </div>
        </div>
    );
}
