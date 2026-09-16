import type { SeriesResponse, TopicManifest } from "./types";
import { PLOT_PRESETS } from "./knowledge/plots.generated";

/**
 * 曲线预设的**解释器**：数据在 `knowledge/px4/plot/*.yml`（构建期生成 plots.generated.ts），
 * 这里只负责"按声明在 manifest 上解析出可画的面板"——加/改图请改 YAML，不要改这个文件。
 *
 * 解析规则（与 plot/README.md 对应）：
 * - 字段不存在就跳过该条线；一个面板一条线都不剩则不显示；一组图一个面板都不剩则整体隐藏
 * - `topics: [a, b]` 取第一个存在的话题（新老固件话题改名时用）；`instance: all` 每实例一个面板
 */

export type SeriesRequest = {
  topic: string;
  instance: number;
  fields: string[];
  /** 该面板在预设内的索引，用于日志/去重 */
  panel: number;
  /** 预处理算子（如 quat_to_euler）：换算在引擎侧做，返回的 series 键是算子的 out_names */
  op?: { name: string; labels?: string[]; };
};

export type PanelSpec = {
  title: string;
  /** 面板级共享 y 轴标签（单 Y 轴约束，见 dataviz skill） */
  yLabel: string;
  requests: SeriesRequest[];
  /** field -> 图例标签（缺省用字段名） */
  fieldLabels?: Record<string, string>;
  /** 水平参考线 */
  hlines?: { value: number; color: string; label?: string; }[];
};

export type ChartPreset = {
  id: string;
  title: string;
  description: string;
  resolve: (manifest: TopicManifest) => PanelSpec[] | null;
};

/** plot/*.yml 的一条线的两种写法：字段名，或"候选字段取第一个存在 + 中文图例" */
type FieldSpec =
  | string
  | { label?: string; fields: string[]; only_when_missing?: string; };

type PlotPanel = {
  title: string;
  yLabel: string;
  topic?: string;
  topics?: string[];
  instance?: "first" | "all";
  op?: { name: string; labels?: string[]; };
  fields: FieldSpec[];
  hlines?: { value: number; level: "ok" | "warning" | "critical"; label: string; }[];
};

type PlotPreset = {
  id: string;
  title: string;
  description: string;
  panels: PlotPanel[];
};

function topicInstances(m: TopicManifest, topic: string): number[] {
  return m.topics
    .filter((t) => t.topic === topic && t.n > 1)
    .map((t) => t.instance)
    .sort((a, b) => a - b);
}

function hasField(m: TopicManifest, topic: string, instance: number, field: string): boolean {
  return m.topics.some(
    (t) => t.topic === topic && t.instance === instance && t.fields.some((f) => f.name === field),
  );
}

/** 候选话题里第一个在日志中存在且有多于一个采样的（新老固件话题改名时用） */
function pickTopic(m: TopicManifest, panel: PlotPanel): string | null {
  const candidates = panel.topic ? [panel.topic] : (panel.topics ?? []);
  return candidates.find((t) => topicInstances(m, t).length > 0) ?? null;
}

/** 解析一个面板在某实例上的线：字段不存在就跳过；返回 null 表示这个面板不用画 */
function resolvePanel(
  panel: PlotPanel,
  topic: string,
  instance: number,
  panelIndex: number,
  manifest: TopicManifest,
): PanelSpec | null {
  const fields: string[] = [];
  const fieldLabels: Record<string, string> = {};

  for (const spec of panel.fields) {
    // only_when_missing：老固件回退用的线——那个字段在，就说明这次不用画我
    if (typeof spec !== "string" && spec.only_when_missing
        && hasField(manifest, topic, instance, spec.only_when_missing)) continue;
    const candidates = typeof spec === "string" ? [spec] : spec.fields;
    const hit = candidates.find((f) => hasField(manifest, topic, instance, f));
    if (!hit) continue;
    fields.push(hit);
    if (typeof spec !== "string" && spec.label) fieldLabels[hit] = spec.label;
  }
  if (fields.length === 0) return null;

  const request: SeriesRequest = { topic, instance, fields, panel: panelIndex };
  if (panel.op) request.op = panel.op;
  const spec: PanelSpec = {
    title: panel.title.replace("{instance}", String(instance)).replace("{topic}", topic),
    yLabel: panel.yLabel,
    requests: [request],
  };
  if (Object.keys(fieldLabels).length > 0) spec.fieldLabels = fieldLabels;
  if (panel.hlines?.length) {
    spec.hlines = panel.hlines.map((h) => ({
      value: h.value,
      color: STATUS_COLORS[h.level],
      label: h.label,
    }));
  }
  return spec;
}

function resolvePreset(data: PlotPreset, manifest: TopicManifest): PanelSpec[] | null {
  const panels: PanelSpec[] = [];
  for (const panel of data.panels) {
    const topic = pickTopic(manifest, panel);
    if (!topic) continue;
    const instances =
      panel.instance === "all" ? topicInstances(manifest, topic) : topicInstances(manifest, topic).slice(0, 1);
    for (const inst of instances) {
      const spec = resolvePanel(panel, topic, inst, panels.length, manifest);
      if (spec) panels.push(spec);
    }
  }
  return panels.length > 0 ? panels : null;
}

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

/** 存档里的一组图（面板已解析好，打开历史时不必再要 manifest） */
export type StoredPlotPanel = {
  presetId: string;
  title: string;
  description: string;
  panels: PanelSpec[];
};

/** 存档里的曲线数据：键 `${presetId}#${面板序号}` → 引擎返回的序列 */
export type StoredPlotSeries = Record<string, SeriesResponse>;

/** 把 manifest 一次性解析成所有预设的面板（分析完成时用来落盘存图） */
export function resolvePlotPanels(manifest: TopicManifest): StoredPlotPanel[] {
  return CHART_PRESETS.map((preset) => {
    const panels = preset.resolve(manifest);
    return panels
      ? { presetId: preset.id, title: preset.title, description: preset.description, panels }
      : null;
  }).filter((x): x is StoredPlotPanel => x !== null);
}

export const CHART_PRESETS: ChartPreset[] = (PLOT_PRESETS as unknown as PlotPreset[]).map((data) => ({
  id: data.id,
  title: data.title,
  description: data.description,
  resolve: (m: TopicManifest) => resolvePreset(data, m),
}));
