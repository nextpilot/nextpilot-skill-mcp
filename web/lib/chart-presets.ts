import type { TopicManifest } from "./types";

/**
 * 图表预设（Flight Review 对标 A/C）。每个 preset 只声明"读哪些字段、怎么画"，
 * 可用性由 manifest 校验，数据由 LogCharts 挂载时按需向 Worker 请求。
 * 分类色用 dataviz 参考调色板（已对站点浅/深表面通过校验），按固定槽位顺序取。
 */

export type SeriesRequest = {
  topic: string;
  instance: number;
  fields: string[];
  /** 该面板在预设内的索引，用于日志/去重 */
  panel: number;
};

export type PanelSpec = {
  title: string;
  /** 面板级共享 y 轴标签（单 Y 轴约束，见 dataviz skill） */
  yLabel: string;
  requests: SeriesRequest[];
  /** fields=每列一条线；quaternion=q[0..3] 转欧拉角 */
  kind: "fields" | "quaternion";
  /** field -> 图例标签（缺省用字段名） */
  fieldLabels?: Record<string, string>;
  /** 水平参考线 */
  hlines?: { value: number; color: string; label?: string }[];
};

export type ChartPreset = {
  id: string;
  title: string;
  description: string;
  resolve: (manifest: TopicManifest) => PanelSpec[] | null;
};

function topicInstances(m: TopicManifest, topic: string): number[] {  return m.topics
    .filter((t) => t.topic === topic && t.n > 1)
    .map((t) => t.instance)
    .sort((a, b) => a - b);
}
function hasField(
  m: TopicManifest,
  topic: string,
  instance: number,
  field: string,
): boolean {
  return m.topics.some(
    (t) => t.topic === topic && t.instance === instance && t.fields.some((f) => f.name === field),
  );
}

function firstField(
  m: TopicManifest,
  topic: string,
  instance: number,
  candidates: string[],
): string | null {
  for (const c of candidates) if (hasField(m, topic, instance, c)) return c;
  return null;
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

export const CHART_PRESETS: ChartPreset[] = [
  {
    id: "vibration",
    title: "振动",
    description: "每个 IMU 的高频振动指标（accel_vibration_metric，m/s²），参考线 4.905 / 9.81。",
    resolve: (m) => {
      const insts = topicInstances(m, "vehicle_imu_status");
      if (insts.length === 0) return null;
      return insts.map((inst, i) => ({
        title: `IMU #${inst}`,
        yLabel: "m/s²",
        kind: "fields" as const,
        requests: [
          { topic: "vehicle_imu_status", instance: inst, fields: ["accel_vibration_metric"], panel: i },
        ],
        hlines: [
          { value: 4.905, color: STATUS_COLORS.warning, label: "4.905 (警告)" },
          { value: 9.81, color: STATUS_COLORS.critical, label: "9.81 (严重)" },
        ],
      }));
    },
  },
  {
    id: "imu-accel",
    title: "IMU 原始加速度",
    description: "三轴加速度（m/s²）。旧固件可能未记录该话题。",
    resolve: (m) => {
      const insts = topicInstances(m, "sensor_combined");
      const fallback = topicInstances(m, "sensor_accel");
      const inst = insts[0] ?? fallback[0];
      if (inst === undefined) return null;
      const topic = insts.length ? "sensor_combined" : "sensor_accel";
      return [
        {
          title: `IMU 加速度（${topic}#${inst}）`,
          yLabel: "m/s²",
          kind: "fields",
          requests: [
            {
              topic,
              instance: inst,
              fields: ["accelerometer_m_s2[0]", "accelerometer_m_s2[1]", "accelerometer_m_s2[2]"],
              panel: 0,
            },
          ],
        },
      ];
    },
  },
  {
    id: "attitude",
    title: "姿态",
    description: "四元数转欧拉角（Roll / Pitch / Yaw，度）。",
    resolve: (m) => {
      const inst = topicInstances(m, "vehicle_attitude")[0];
      if (inst === undefined) return null;
      return [
        {
          title: "欧拉角",
          yLabel: "deg",
          kind: "fields",
          requests: [
            {
              topic: "vehicle_attitude",
              instance: inst,
              fields: ["q[0]", "q[1]", "q[2]", "q[3]"],
              panel: 0,
            },
          ],
        },
      ];
    },
  },
  {
    id: "ekf",
    title: "EKF 创新检验",
    description: "创新值与检验门限之比（≥1 表示该路观测被 EKF 拒绝），参考线 1.0。",
    resolve: (m) => {
      const inst = topicInstances(m, "estimator_status")[0];
      if (inst === undefined) return null;
      const channels: { label: string; field: string }[] = [];
      const add = (label: string, field: string) => {
        if (hasField(m, "estimator_status", inst, field)) channels.push({ label, field });
      };
      add("速度", "vel_test_ratio");
      add("水平位置", "pos_test_ratio");
      add("垂直高度", "hgt_test_ratio");
      add("航向", "hdg_test_ratio");
      if (!hasField(m, "estimator_status", inst, "hdg_test_ratio")) add("磁罗盘", "mag_test_ratio");
      add("空速", "tas_test_ratio");
      add("离地高度", "hagl_test_ratio");
      add("侧滑", "beta_test_ratio");
      if (channels.length === 0) return null;
      const fieldLabels: Record<string, string> = {};
      for (const c of channels) fieldLabels[c.field] = c.label;
      return [
        {
          title: `estimator_status #${inst}`,
          yLabel: "ratio",
          kind: "fields",
          fieldLabels,
          requests: [
            {
              topic: "estimator_status",
              instance: inst,
              fields: channels.map((c) => c.field),
              panel: 0,
            },
          ],
          hlines: [{ value: 1.0, color: STATUS_COLORS.critical, label: "1.0 (拒绝)" }],
        },
      ];
    },
  },
  {
    id: "power",
    title: "电源",
    description: "电压 / 电流 / 剩余电量，多面板共享时间轴。",
    resolve: (m) => {
      const inst = topicInstances(m, "battery_status")[0];
      if (inst === undefined) return null;
      const panels: PanelSpec[] = [];
      const addPanel = (title: string, yLabel: string, fields: string[]) => {
        const ok = fields.filter((f) => hasField(m, "battery_status", inst, f));
        if (ok.length) panels.push({ title, yLabel, kind: "fields", requests: [{ topic: "battery_status", instance: inst, fields: ok, panel: panels.length }] });
      };
      addPanel("电压", "V", ["voltage_v", "voltage_filtered_v"]);
      addPanel("电流", "A", ["current_a"]);
      addPanel("剩余电量", "%", ["remaining"]);
      return panels.length ? panels : null;
    },
  },
  {
    id: "gps",
    title: "GPS",
    description: "卫星数与定位精度（HDOP/EPH/EPV）。",
    resolve: (m) => {
      const inst = topicInstances(m, "vehicle_gps_position")[0];
      if (inst === undefined) return null;
      const sat = firstField(m, "vehicle_gps_position", inst, ["satellites_used", "satellites_visible"]);
      const panels: PanelSpec[] = [];
      if (sat) {
        panels.push({
          title: "卫星数",
          yLabel: "count",
          kind: "fields",
          requests: [{ topic: "vehicle_gps_position", instance: inst, fields: [sat], panel: 0 }],
        });
      }
      const accFields = ["eph", "epv", "hdop"].filter((f) => hasField(m, "vehicle_gps_position", inst, f));
      if (accFields.length) {
        panels.push({
          title: "定位精度",
          yLabel: "m",
          kind: "fields",
          requests: [{ topic: "vehicle_gps_position", instance: inst, fields: accFields, panel: panels.length }],
        });
      }
      return panels.length ? panels : null;
    },
  },
];
