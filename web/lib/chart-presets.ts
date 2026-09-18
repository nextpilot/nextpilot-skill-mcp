import type { SeriesResponse, TopicManifest } from "./types";
import { PLOT_PRESETS } from "./knowledge/plots.generated";

/**
 * 绘图预设的**解释器**：声明在 `knowledge/px4/plot/*.yml`（构建期编译成 plots.generated.ts，
 * 字段引用已经过校验、单位已经查过表），这里只负责"按 manifest 解析出可画的面板"。
 * 加/改图请改 YAML，不要改这个文件。
 *
 * 与改造前（panels/topic/instance/fields 那套）的区别：
 * - 取数声明是**与规则同一套**的 `ref(...)` 候选组 + `unit=`（字段换代、量纲换算都在引擎侧）
 * - 容器（container）决定这是"一张图"还是"地图"；children 是图上的线 / 地图上的轨道
 * - 一条线画什么由预设写死，引擎按 ydata 顺序回一组序列**同序等长**（取不到的项是 null）
 *
 * 解析规则：
 * - 字段引用在日志里一条候选都不存在 → 这条线不画；一个容器一条线都不剩 → 整张图不显示
 * - `per_instance: true` → 该容器按实例拆成多张图（标题里的 `{instance}` 换成实例号）
 */
export type FieldDesc =
  | { kind: "field"; fields: string[]; unit?: string | null; }
  | { kind: "var"; name: string; };

/** 一次 np_series 请求（一个容器可能发多次：多条 child 各有自己的横轴时） */
export type SeriesRequest = {
  /** 面板要第几个实例（声明里写 `[:]` 的引用按它取） */
  instance: number;
  xdata: FieldDesc | null;
  ydata: FieldDesc[];
  /** 预设的换算节点（与规则 compute 同一套），引擎在取数前求值 */
  compute: string[];
  /** 与 ydata **同序等长**：每条线的图例名与样式（style = solid / dashed / dotted，渲染时映射到绘图库） */
  series: { label: string; style: string | null; color: string | null; }[];
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
  hlines?: { value: number; color: string; label?: string; }[];
  requests: SeriesRequest[];
};

export type ChartPreset = {
  id: string;
  title: string;
  description: string;
  resolve: (manifest: TopicManifest) => PanelSpec[] | null;
};

// ─────────────────────────── 构建期编译出来的形状（只读） ───────────────────────────

type CompiledChild = {
  mode: "TimeSeries" | "xyplot";
  xdata: FieldDesc | null;
  ydata: FieldDesc[];
  labels: string[];
  styles: string[];
  colors: string[];
};
type CompiledAxes = {
  container: "axes";
  title: string | null;
  ylabel: string;
  xlabel: string;
  legend: boolean;
  grid: boolean;
  flipx: boolean;
  flipy: boolean;
  range: number[] | null;
  hlines: { value: number; level: "ok" | "warning" | "critical"; label: string; }[] | null;
  per_instance: boolean;
  children: CompiledChild[];
};
type CompiledPreset = {
  id: string;
  title: string;
  description: string;
  conditions?: { topics?: string[][]; };
  compute: string[];
  outputs: (CompiledAxes | { container: "map"; }) [];
};

// ─────────────────────────── manifest 查询 ───────────────────────────

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

/** 拆 `topic[N].field[M]`（与构建期同一套正则；实例号可省，省 = 所有实例） */
function parseRef(s: string): { topic: string; inst: number | null; field: string; } | null {
  const m = /^([a-z][a-z0-9_]*)(?:\[([-]?\d*(?::-?\d*)?)\])?\.([a-z][a-z0-9_]*(\[\d+\])?)$/.exec(s);
  if (!m) return null;
  const inst = m[2] && /^-?\d+$/.test(m[2]) ? Number(m[2]) : null;
  return { topic: m[1], inst, field: m[3] };
}

/** 这条线在这个面板实例上画得出来吗：候选里有一个字段在日志里就画。
 *  换算节点的输出（`compute` 算出来的变量）在这里判不了 —— 一律留着，引擎取不到会给 null。 */
function seriesVisible(m: TopicManifest, desc: FieldDesc, instance: number): boolean {
  if (desc.kind === "var") return true;
  for (const f of desc.fields) {
    const p = parseRef(f);
    if (!p) continue;
    if (hasField(m, p.topic, p.inst ?? instance, p.field)) return true;
  }
  return false;
}

/** 预设整份是否适用：声明的 topic 至少有一个在日志里（与规则 conditions.topics 同一语义）。
 *  firmware / airframe 这两个轴留给引擎侧（图上用不着按机型换图），这里只按 topic 判。 */
function presetApplies(m: TopicManifest, p: CompiledPreset): boolean {
  const names = new Set(m.topics.map((t) => t.topic));
  for (const cands of p.conditions?.topics ?? []) {
    if (!cands.some((c) => names.has(c))) return false;
  }
  return true;
}

// ─────────────────────────── 解析 ───────────────────────────

function resolveAxes(out: CompiledAxes, m: TopicManifest): PanelSpec[] {
  if (out.children.length === 0) return [];
  // 实例：per_instance 时按第一条"所有实例"引用的 topic 的实例列表展开
  let instances = [0];
  if (out.per_instance) {
    let topic = null;
    for (const c of out.children) {
      for (const d of c.ydata) {
        if (d.kind !== "field") continue;
        topic = d.fields.map(parseRef).find((p) => p && p.inst === null)?.topic ?? null;
        if (topic) break;
      }
      if (topic) break;
    }
    instances = topic ? topicInstances(m, topic) : [];
    if (instances.length === 0) return [];
  }

  const panels: PanelSpec[] = [];
  for (const inst of instances) {
    const requests: SeriesRequest[] = [];
    for (const child of out.children) {
      const keep: number[] = [];
      child.ydata.forEach((d, i) => {
        if (seriesVisible(m, d, inst)) keep.push(i);
      });
      if (keep.length === 0) continue;
      requests.push({
        instance: inst,
        xdata: child.xdata,
        ydata: keep.map((i) => child.ydata[i]),
        compute: [],
        series: keep.map((i) => ({
          label: child.labels[i],
          style: child.styles[i] ?? null,
          color: child.colors[i] ?? null,
        })),
      });
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
    if (out.hlines?.length) {
      spec.hlines = out.hlines.map((h) => ({
        value: h.value,
        color: STATUS_COLORS[h.level],
        label: h.label,
      }));
    }
    panels.push(spec);
  }
  return panels;
}

function resolvePreset(p: CompiledPreset, manifest: TopicManifest): PanelSpec[] | null {
  if (!presetApplies(manifest, p)) return null;
  const panels: PanelSpec[] = [];
  for (const out of p.outputs) {
    if (out.container !== "axes") continue; // 地图不进曲线 tab（挂在常驻地图区）
    // 换算节点随请求带上：图上的换算在引擎侧做（前端不写数学）
    for (const spec of resolveAxes(out, manifest)) {
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
    return panels
      ? { presetId: preset.id, title: preset.title, description: preset.description, panels }
      : null;
  }).filter((x): x is StoredPlotPanel => x !== null);
}

export const CHART_PRESETS: ChartPreset[] = (PLOT_PRESETS as unknown as CompiledPreset[]).map((data) => ({
  id: data.id,
  title: data.title,
  description: data.description,
  resolve: (m: TopicManifest) => resolvePreset(data, m),
}));

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
