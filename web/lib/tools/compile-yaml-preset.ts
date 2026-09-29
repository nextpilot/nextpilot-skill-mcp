"use client";

import { parse as parseYaml } from "yaml";
import type { TopicManifest } from "@/lib/types";
import type { FieldDesc, PanelSpec } from "@/lib/chart-presets";
import {
    FIELD_REF_RE,
    instToString,
    parseFieldRef,
    presetApplies,
    resolveAxes,
    type UnifiedAxes,
} from "@/lib/panel-resolver";

/**
 * 工具页里现贴现编译的绘图预设：YAML 文本 → PanelSpec[]。
 * 与 `lib/chart-presets.ts` 是同一个解析器的两个入口，那边喂构建期编译好的产物，这边喂
 * 用户贴进来的原始 YAML。实例怎么数、区间引用怎么展开成多条线不在这里，在
 * `lib/panel-resolver.ts` 那一份里（改那边，两边一起变）。
 */

// ── ref() 解析 ──
const REF_RE = /^ref\("([^"]+)"(?:,\s*unit="([^"]+)")?\)$/;

export function parseRef(
    s: string,
): { topic: string; inst: string | null; field: string; unit?: string; candidates: string[] } | null {
    const m = REF_RE.exec(s.trim());
    if (!m) return null;
    // 候选组整组留着：哪个在日志里存在由引擎按顺序挑（与规则里的 ref("新名","旧名") 同一条规矩）
    const candidates = m[1]
        .split(",")
        .map((f) => f.trim())
        .filter((f) => FIELD_REF_RE.test(f));
    if (candidates.length === 0) return null;
    const p = parseFieldRef(candidates[0]);
    if (!p) return null;
    return {
        topic: p.topic,
        inst: instToString(p.inst) || null,
        field: p.field,
        unit: m[2] || undefined,
        candidates,
    };
}

export function toFieldDesc(raw: string): FieldDesc {
    const r = parseRef(raw);
    if (r) {
        // 引用串保持作者写的样子：不把"不写下标"改写成 `[0]`，`[:]` 也要原样留着，
        // 展开成多条线是解析期的事，在这里改写成 [0] 就把区间信息弄丢了
        return { kind: "field", fields: r.candidates, unit: r.unit || null };
    }
    return { kind: "field", fields: [raw], unit: null };
}

// ── YAML 结构 ──

type YamlPreset = {
    id: string;
    title: string;
    description?: string;
    order?: number;
    conditions?: { topics: string[][] };
    outputs: {
        container: "axes";
        title?: string;
        ylabel: string;
        xlabel?: string;
        legend?: boolean;
        grid?: boolean;
        flipx?: boolean;
        flipy?: boolean;
        range?: number[] | null;
        split_by_instance?: boolean;
        hlines?: { value: number; level: "ok" | "warning" | "critical"; label: string }[];
        children: {
            mode?: "TimeSeries" | "xyplot";
            ydata: string[];
            xdata?: string;
            label: string[];
            style?: string[];
            color?: string[];
        }[];
    }[];
};

const HLINE_COLORS: Record<string, string> = {
    ok: "#22c55e",
    warning: "#f59e0b",
    critical: "#ef4444",
};

// ── 主函数：YAML 文本 → PanelSpec[] ──

export function yamlToPanels(yamlText: string, manifest: TopicManifest): PanelSpec[] {
    const raw = parseYaml(yamlText) as YamlPreset;
    if (!raw || !raw.id || !raw.outputs) return [];

    // 条件：每组候选里至少要有一个在日志里（与规则 conditions.topics 同一语义）
    if (!presetApplies(manifest, raw.conditions)) return [];

    const panels: PanelSpec[] = [];
    for (const o of raw.outputs) {
        if (o.container !== "axes" || !o.children?.length) continue;
        const axes: UnifiedAxes = {
            title: o.title ?? null,
            ylabel: o.ylabel ?? "",
            xlabel: o.xlabel ?? "秒（相对日志开始）",
            legend: o.legend ?? true,
            grid: o.grid ?? true,
            flipx: o.flipx ?? false,
            flipy: o.flipy ?? false,
            range: o.range ?? null,
            hlines: o.hlines ?? null,
            split_by_instance: o.split_by_instance ?? false,
            children: o.children.map((c) => ({
                mode: c.mode ?? "TimeSeries",
                xdata: c.xdata ? toFieldDesc(c.xdata) : null,
                ydata: c.ydata.map(toFieldDesc),
                labels: c.label ?? [],
                styles: c.style ?? [],
                colors: c.color ?? [],
            })),
        };
        panels.push(...resolveAxes(axes, manifest, { hlineColor: (lv) => HLINE_COLORS[lv] ?? "#ef4444" }).panels);
    }
    return panels;
}
