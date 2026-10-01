import type { TopicManifest } from "./types";

/**
 * 绘图预设的解析器：把「预设声明 + 日志 manifest」解析成可画的面板。唯一实现，两个消费方
 * （chart-presets.ts 构建期编译、tools/compile-yaml-preset.ts 工具页现编译）都从这里取。
 * 引用写法（与 knowledge/px4/CLAUDE.md 同一套，改那边也要改这里）：
 *   topic.field / topic[N].field（N 负数从末尾数）/ topic[a:b].field 闭区间、[:] 全部 /
 *   topic.field[K] 数组字段第 K 个元素、field[i,j] 第 i 行第 j 列
 */

/** 一条线的数据来源：字段引用（可带候选组）或预设 compute 节点的输出 */
export type FieldDesc = { kind: "field"; fields: string[]; unit?: string | null } | { kind: "var"; name: string };

/** 一次 np_series / np_spectrum 请求（一个容器可能发多次：多条 child 各有自己的横轴时）。
 *  `kind` 是判别位：缺省 / "field" 走时间序列（np_series）；"spectrum" 走频谱（np_spectrum）。 */
export type SeriesRequest = {
    /** 面板要第几个实例，声明里写区间的引用按它取（"每实例一张图"用） */
    instance: number;
    xdata: FieldDesc | null;
    ydata: FieldDesc[];
    /** 预设的换算节点（与规则 compute 同一套），引擎在取数前求值 */
    compute: string[];
    /** 与 ydata 同序等长：每条线的图例名与样式（style = solid / dashed / dotted） */
    series: { label: string; style: string | null; color: string | null }[];
    /** 取数通道。缺省（旧存档）= "field"（时间序列） */
    kind?: "field" | "spectrum";
    /** 仅频谱：频率轴那个变量名（spectrum(...) 的第一个输出），np_spectrum 据此从 env 取横轴 */
    freq?: string;
};

export type PanelSpec = {
    title: string;
    /** 这张图的 y 轴标签（一张图一个量纲，构建期已校验） */
    yLabel: string;
    xLabel: string;
    legend: boolean;
    grid: boolean;
    flipx: boolean;
    flipy: boolean;
    /** 固定坐标范围 [x0,x1] 或 [x0,x1,y0,y1]；null = 自动适配 */
    range: number[] | null;
    hlines?: { value: number; color: string; label?: string }[];
    /** 解析这张图时发现的问题（如"某条线在实例 2 上取不到"），交给界面上的告警栏 */
    warnings?: string[];
    requests: SeriesRequest[];
    /** 频谱图判别位：true = 走 np_spectrum、x 轴是频率、不参与时间轴联动、不画阶段底色 */
    spectrum?: boolean;
    /** 频谱图关注频段上限（Hz）；null = 按数据范围自动 */
    fmax?: number | null;
};

// ─────────────────────────── 字段引用 ───────────────────────────

/** 引用里写的实例下标。不写与写区间是两件事：前者是单条线，后者要展开成多条 */
export type InstSpec =
    { kind: "default" } | { kind: "index"; n: number } | { kind: "range"; a: number | null; b: number | null };

export type FieldRef = { topic: string; inst: InstSpec; field: string };

/** 与构建期同形：`topic[N].field[M]`；字段下标只许出现在最后一段 */
export const FIELD_REF_RE = /^([a-z][a-z0-9_]*)(?:\[([-]?\d*(?::-?\d*)?)\])?\.([a-z][a-z0-9_]*(?:\[\d+(?:,\d+)?\])?)$/;

export function parseInstSpec(txt: string | null | undefined): InstSpec {
    if (!txt) return { kind: "default" };
    if (txt.indexOf(":") >= 0) {
        const [a, b] = txt.split(":");
        return { kind: "range", a: a === "" ? null : Number(a), b: b === "" ? null : Number(b) };
    }
    return { kind: "index", n: Number(txt) };
}

export function parseFieldRef(s: string): FieldRef | null {
    const m = FIELD_REF_RE.exec(s.trim());
    if (!m) return null;
    return { topic: m[1], inst: parseInstSpec(m[2]), field: m[3] };
}

/** 回写成引用里的那一截（`[0]` / `[:]` / `[1:3]`） */
export function instToString(spec: InstSpec): string {
    if (spec.kind === "default") return "";
    if (spec.kind === "index") return String(spec.n);
    return `[${spec.a === null ? "" : spec.a}:${spec.b === null ? "" : spec.b}]`;
}

// ─────────────────────────── manifest 查询 ───────────────────────────

/** 这个 topic 在日志里有哪几个实例，只看 manifest 有没有这一行。
 *  不能再判 t.n>1：n 是采样点数不是实例数，单点实例会被静默丢掉（全单点时整张预设消失）。 */
export function topicInstances(m: TopicManifest, topic: string): number[] {
    return m.topics
        .filter((t) => t.topic === topic)
        .map((t) => t.instance)
        .sort((a, b) => a - b);
}

export function hasField(m: TopicManifest, topic: string, instance: number, field: string): boolean {
    return m.topics.some((t) => t.topic === topic && t.instance === instance && t.fields.some((f) => f.name === field));
}

/** 区间引用没法说"第几个实例上有没有"，只要有任一实例带这个字段，这条线就有得展 */
export function hasFieldAnyInstance(m: TopicManifest, topic: string, field: string): boolean {
    return m.topics.some((t) => t.topic === topic && t.fields.some((f) => f.name === field));
}

/** 闭区间 → 实例号列表。负数从末尾数，越界截断；越界的完整说法由引擎走 SeriesResponse.warnings，
 *  这里不重复喊。`all` 已按实例号升序，返回同升序。 */
export function instancesInRange(all: number[], spec: InstSpec): number[] {
    if (spec.kind !== "range" || all.length === 0) return all;
    const n = all.length;
    const lo = Math.max(spec.a === null ? 0 : spec.a < 0 ? spec.a + n : spec.a, 0);
    const hi = Math.min(spec.b === null ? n - 1 : spec.b < 0 ? spec.b + n : spec.b, n - 1);
    return lo > hi ? [] : all.slice(lo, hi + 1);
}

/** 这条线在日志里有得画吗：候选里有一个字段存在就画。
 *  换算节点的输出（`compute` 算出来的变量）在这里判不了，一律留着，引擎取不到会给 null。 */
export function seriesVisible(m: TopicManifest, desc: FieldDesc, instance: number): boolean {
    if (desc.kind === "var") return true;
    for (const f of desc.fields) {
        const p = parseFieldRef(f);
        if (!p) continue;
        if (p.inst.kind === "range") {
            if (hasFieldAnyInstance(m, p.topic, p.field)) return true;
            continue;
        }
        if (hasField(m, p.topic, p.inst.kind === "index" ? p.inst.n : instance, p.field)) return true;
    }
    return false;
}

// ─────────────────────────── 统一的输入形状 ───────────────────────────

export type UnifiedChild = {
    mode: "TimeSeries" | "xyplot" | "spectrum";
    xdata: FieldDesc | null;
    ydata: FieldDesc[];
    labels: (string | null)[];
    styles: (string | null)[];
    colors: (string | null)[];
    /** 仅 spectrogram：与 ydata 同序的频率轴变量名（spectrum(...) 的第一个输出），运行期从 env 取 */
    freqs?: string[];
};

export type UnifiedAxes = {
    title: string | null;
    ylabel: string;
    xlabel: string;
    legend: boolean;
    grid: boolean;
    flipx: boolean;
    flipy: boolean;
    range: number[] | null;
    hlines: { value: number; level: "ok" | "warning" | "critical"; label: string }[] | null;
    /** true = 按实例拆成多张图；false = 区间引用在同一张图里展开成多条线 */
    split_by_instance: boolean;
    children: UnifiedChild[];
};

/** 频谱图的容器形状：与 `UnifiedAxes` 不同轴语义——x 轴是频率（Hz，由算子给），
 *  没有时间轴、没有 flip / hlines / range，频段上限由 `fmax` 表达。children 的 mode 恒为 "spectrum"。 */
export type UnifiedSpectrum = {
    title: string | null;
    /** 幅度轴标签（必填，构建期校验） */
    ylabel: string;
    /** 频率轴标签，缺省 "Hz" */
    xlabel: string;
    /** 关注频段上限（Hz）；null = 按数据范围自动 */
    fmax: number | null;
    legend: boolean;
    grid: boolean;
    children: UnifiedChild[];
};

export type ResolveOptions = {
    /** 门限线颜色。两个消费方各有一套站点配色，所以由调用方给，不在这里定死 */
    hlineColor: (level: "ok" | "warning" | "critical") => string;
};

export type ResolveResult = {
    panels: PanelSpec[];
    /** 解析期发现的问题（实例不齐等）。引擎取数期的提示在 SeriesResponse.warnings 里 */
    warnings: string[];
};

// ─────────────────────────── 展开 ───────────────────────────

type PendingLine = {
    label: string;
    style: string | null;
    color: string | null;
    /** 单条线：直接给引擎的取数声明 */
    desc: FieldDesc;
    /** 区间展开：这条线能落到哪几个实例上（null = 单条线，不参与并集） */
    spread: { topic: string; field: string; unit: string | null; instances: number[] } | null;
};

/** 一个 child 里所有区间线能落到的实例，取并集。多条线来自不同 topic、实例数不一样时，
 *  少的那边在缺的实例上画不出来：按并集留位置并给告警，而不是砍掉多的那边。 */
function unionOfSpread(pendings: PendingLine[]): number[] | null {
    const all = new Set<number>();
    for (const p of pendings) {
        for (const i of p.spread?.instances ?? []) all.add(i);
    }
    return all.size === 0 ? null : [...all].sort((a, b) => a - b);
}

/** `spread` = 区间引用是否展开成多条线。拆图模式（split_by_instance）下不展开：
 *  那时要的是每张图一个实例，引擎 `_pick_ref` 收到 instance= 会盖掉引用里的区间。 */
function planChild(child: UnifiedChild, m: TopicManifest, instance: number, spread: boolean): PendingLine[] {
    const out: PendingLine[] = [];
    child.ydata.forEach((desc, i) => {
        const style = child.styles[i] ?? null;
        const color = child.colors[i] ?? null;
        const label = child.labels[i] ?? `series-${i}`;
        if (desc.kind === "var") {
            out.push({ label, style, color, desc: { kind: "var", name: desc.name }, spread: null });
            return;
        }
        // 候选组：取第一个在日志里存在的（与引擎 `_pick_ref` 同一条规矩）
        let hit: FieldRef | null = null;
        let hitRaw = "";
        for (const f of desc.fields) {
            const p = parseFieldRef(f);
            if (!p) continue;
            const ok =
                p.inst.kind === "range"
                    ? spread
                        ? hasFieldAnyInstance(m, p.topic, p.field)
                        : hasField(m, p.topic, instance, p.field)
                    : hasField(m, p.topic, p.inst.kind === "index" ? p.inst.n : instance, p.field);
            if (ok) {
                hit = p;
                hitRaw = f;
                break;
            }
        }
        if (!hit) return; // 一条候选都不存在 → 这条线不画
        const unit = desc.unit ?? null;
        if (hit.inst.kind === "range" && spread) {
            out.push({
                label,
                style,
                color,
                desc: { kind: "field", fields: [], unit },
                spread: {
                    topic: hit.topic,
                    field: hit.field,
                    unit,
                    instances: instancesInRange(topicInstances(m, hit.topic), hit.inst),
                },
            });
            return;
        }
        // 单条线按作者写的原文发出，不重写成 `topic[0].field`：报错文案里要打他认得的那串
        out.push({ label, style, color, desc: { kind: "field", fields: [hitRaw], unit }, spread: null });
    });
    return out;
}

// ─────────────────────────── 解析 ───────────────────────────

/** 一个容器 → 若干面板。`split_by_instance` 时按实例拆成多张，否则一张（区间引用在里面展开成多条线） */
export function resolveAxes(out: UnifiedAxes, m: TopicManifest, opts: ResolveOptions): ResolveResult {
    if (out.children.length === 0) return { panels: [], warnings: [] };

    const warnings: string[] = [];
    let instances = [0];
    if (out.split_by_instance) {
        const topic = firstRangeTopic(out);
        if (!topic) {
            // 声明了拆图却没有区间引用可依据：不拆而不是让整组图消失，画出来并提示声明没生效
            warnings.push(
                `${out.title ?? "这张图"} 写了 split_by_instance，但引用里没有区间（[:] / [a:b]）——按一张图渲染`,
            );
        } else {
            instances = topicInstances(m, topic);
            if (instances.length === 0) return { panels: [], warnings };
        }
    }

    const panels: PanelSpec[] = [];
    for (const inst of instances) {
        const requests: SeriesRequest[] = [];
        const panelWarnings: string[] = [];
        for (const child of out.children) {
            const pendings = planChild(child, m, inst, !out.split_by_instance);
            if (pendings.length === 0) continue;
            const union = unionOfSpread(pendings);
            const ydata: FieldDesc[] = [];
            const series: SeriesRequest["series"] = [];
            for (const p of pendings) {
                if (!p.spread) {
                    ydata.push(p.desc);
                    series.push({ label: p.label, style: p.style, color: p.color });
                    continue;
                }
                for (const k of union ?? []) {
                    if (p.spread.instances.indexOf(k) < 0) {
                        panelWarnings.push(
                            `${p.spread.topic}.${p.spread.field} 在这份日志里没有实例 ${k}（只有 ${p.spread.instances.join("、")}）——图上少一条线`,
                        );
                        continue;
                    }
                    // 展开线把实例写死（`a[:].b` → `a[0].b`…），名字用这个串：多实例同图光看 X 分不清哪一路
                    const ref = `${p.spread.topic}[${k}].${p.spread.field}`;
                    ydata.push({ kind: "field", fields: [ref], unit: p.spread.unit });
                    series.push({ label: ref, style: p.style, color: p.color });
                }
            }
            if (ydata.length === 0) continue;
            requests.push({ instance: inst, xdata: child.xdata, ydata, compute: [], series });
        }
        if (requests.length === 0) continue;
        const spec: PanelSpec = {
            title: (out.title ?? "").replace("{instance}", String(inst)) || String(inst),
            yLabel: out.ylabel,
            xLabel: out.xlabel,
            legend: out.legend,
            grid: out.grid,
            flipx: out.flipx,
            flipy: out.flipy,
            range: out.range,
            requests,
        };
        if (panelWarnings.length) spec.warnings = panelWarnings;
        if (out.hlines?.length) {
            spec.hlines = out.hlines.map((h) => ({
                value: h.value,
                color: opts.hlineColor(h.level),
                label: h.label,
            }));
        }
        panels.push(spec);
        warnings.push(...panelWarnings);
    }
    return { panels, warnings };
}

/** 一个频谱容器 → 一张频谱图。与 resolveAxes 的关键差别：
 *  - 不按时间轴拆实例（频率轴不是时间，频谱天然按实例单画；W5 只支持单实例）
 *  - 产出面板带 `spectrum: true`，界面据此走 np_spectrum 通道、不参与时间轴联动
 *  - child 的 ydata 全是 compute 输出变量（构建期已校验），这里按 kind:"var" 逐条发出 */
export function resolveSpectrum(out: UnifiedSpectrum, _m: TopicManifest, _opts: ResolveOptions): ResolveResult {
    if (out.children.length === 0) return { panels: [], warnings: [] };

    const warnings: string[] = [];
    const requests: SeriesRequest[] = [];
    const panelWarnings: string[] = [];
    for (const child of out.children) {
        const ydata: FieldDesc[] = [];
        const series: SeriesRequest["series"] = [];
        let freqName: string | null = null;
        child.ydata.forEach((desc, i) => {
            // 频谱纵轴只能是 compute 输出（构建期已卡），这里再兜一道，别把裸字段发去 np_spectrum
            if (desc.kind !== "var") {
                panelWarnings.push(`频谱的 ydata 第 ${i + 1} 项不是 compute 输出，已跳过`);
                return;
            }
            ydata.push(desc);
            series.push({
                label: child.labels[i] ?? desc.name,
                style: child.styles[i] ?? null,
                color: child.colors[i] ?? null,
            });
            freqName = freqName ?? child.freqs?.[i] ?? null;
        });
        if (ydata.length === 0) continue;
        const req: SeriesRequest = { instance: 0, xdata: null, ydata, compute: [], series, kind: "spectrum" };
        if (freqName) req.freq = freqName;
        requests.push(req);
    }
    if (requests.length === 0) return { panels: [], warnings };

    const spec: PanelSpec = {
        title: out.title ?? "",
        yLabel: out.ylabel,
        xLabel: out.xlabel,
        legend: out.legend,
        grid: out.grid,
        flipx: false,
        flipy: false,
        range: null,
        spectrum: true,
        fmax: out.fmax,
        requests,
    };
    if (panelWarnings.length) spec.warnings = panelWarnings;
    warnings.push(...panelWarnings);
    return { panels: [spec], warnings };
}

/** 拆图时按哪条引用的实例列表走：取第一条区间引用的 topic。
 *  不写下标（= 实例 0）不是"要拆"的信号，那是单条线的写法。 */
function firstRangeTopic(out: UnifiedAxes): string | null {
    for (const c of out.children) {
        for (const d of c.ydata) {
            if (d.kind !== "field") continue;
            for (const f of d.fields) {
                const p = parseFieldRef(f);
                if (p && p.inst.kind === "range") return p.topic;
            }
        }
    }
    return null;
}

/** 预设整份是否适用：声明的 topic 至少有一个在日志里（与规则 conditions.topics 同一语义）。
 *  firmware / vehicle 这两个轴留给引擎侧（图上用不着按机型换图），这里只按 topic 判。 */
export function presetApplies(m: TopicManifest, conditions?: { topics?: string[][] }): boolean {
    const names = new Set(m.topics.map((t) => t.topic));
    for (const cands of conditions?.topics ?? []) {
        if (!cands.some((c) => names.has(c))) return false;
    }
    return true;
}
