import type { SeriesResponse, TopicManifest } from "./types";
import { PLOT_PRESETS } from "./knowledge/plots.generated";
import {
    presetApplies,
    resolveAxes,
    type FieldDesc,
    type PanelSpec,
    type SeriesRequest,
    type UnifiedAxes,
} from "./panel-resolver";

/** 编译产物里的一个输出。`container` 是判别位：axes 走曲线，map 挂常驻地图区 */
type CompiledOutput = (UnifiedAxes & { container: "axes" }) | { container: "map" };

/**
 * 绘图预设的入口：声明在 `knowledge/px4/plot/*.yml`（构建期编译成 plots.generated.ts，
 * 字段引用已经过校验、单位已经查过表），这里只负责把编译产物接上 manifest。加/改图请改
 * YAML，不要改这个文件。
 *
 * 怎么解析不在这里，实例怎么数、区间引用怎么展开成多条线，全在 `panel-resolver.ts`
 * 那一份里（工具页现贴 YAML 的 `tools/compile-yaml-preset.ts` 用的也是同一份）。
 *
 * 与改造前（panels/topic/instance/fields 那套）的区别：
 * - 取数声明是与规则同一套的 `ref(...)` 候选组 + `unit=`（字段换代、量纲换算都在引擎侧）
 * - 容器（container）决定这是"一张图"还是"地图"；children 是图上的线 / 地图上的轨道
 * - 一条线画什么由预设写死，引擎按 ydata 顺序回一组序列同序等长（取不到的项是 null）
 */
export type { FieldDesc, PanelSpec, SeriesRequest };

export type ChartPreset = {
    id: string;
    title: string;
    description: string;
    resolve: (manifest: TopicManifest) => PanelSpec[] | null;
};

// ─────────────────────────── 构建期编译出来的形状（只读） ───────────────────────────

type CompiledPreset = {
    id: string;
    title: string;
    description: string;
    conditions?: { topics?: string[][] };
    compute: string[];
    outputs: CompiledOutput[];
};

// ─────────────────────────── 解析 ───────────────────────────

function resolvePreset(p: CompiledPreset, manifest: TopicManifest): PanelSpec[] | null {
    if (!presetApplies(manifest, p.conditions)) return null;
    const panels: PanelSpec[] = [];
    for (const out of p.outputs) {
        if (out.container !== "axes") continue; // 地图不进曲线 tab（挂在常驻地图区）
        // 换算节点随请求带上：图上的换算在引擎侧做（前端不写数学）
        for (const spec of resolveAxes(out, manifest, { hlineColor: (lv) => STATUS_COLORS[lv] }).panels) {
            for (const r of spec.requests) r.compute = p.compute;
            panels.push(spec);
        }
    }
    return panels.length > 0 ? panels : null;
}

/** 存档里的一组图（面板已解析好，打开历史时不必再要 manifest） */
export type StoredPlotPanel = {
    presetId: string;
    title: string;
    description: string;
    panels: PanelSpec[];
};

/** 存档里的曲线数据：键 `${presetId}#${面板序号}` → 该面板各次请求的返回（与 requests 同序） */
export type StoredPlotSeries = Record<string, SeriesResponse[]>;

/** 把 manifest 一次性解析成所有预设的面板（分析完成时用来落盘存图） */
export function resolvePlotPanels(manifest: TopicManifest): StoredPlotPanel[] {
    return CHART_PRESETS.map((preset) => {
        const panels = preset.resolve(manifest);
        return panels ? { presetId: preset.id, title: preset.title, description: preset.description, panels } : null;
    }).filter((x): x is StoredPlotPanel => x !== null);
}

export const CHART_PRESETS: ChartPreset[] = (Object.values(PLOT_PRESETS).flat() as unknown as CompiledPreset[]).map(
    (data) => ({
        id: data.id,
        title: data.title,
        description: data.description,
        resolve: (m: TopicManifest) => resolvePreset(data, m),
    }),
);

// 分类槽位（dataviz 参考调色板，浅/深两套）
export const SERIES_COLORS_LIGHT = [
    "#2a78d6",
    "#eb6834",
    "#1baf7a",
    "#eda100",
    "#e87ba4",
    "#008300",
    "#4a3aa7",
    "#e34948",
];
export const SERIES_COLORS_DARK = [
    "#3987e5",
    "#d95926",
    "#199e70",
    "#c98500",
    "#d55181",
    "#008300",
    "#9085e9",
    "#e66767",
];

// 状态色（站点 token，只用于状态/阈值，不用于系列）
export const STATUS_COLORS = {
    ok: "#34d399",
    warning: "#fbbf24",
    critical: "#f87171",
};
