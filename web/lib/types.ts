import type { CategoryKey, Platform } from "./constants";

/** Skill 卡片元数据，对应 CLAUDE.md 3.1 卡片规范 */
export interface SkillMeta {
  slug: string;
  name: string;
  description: string;
  category: CategoryKey;
  platforms: Platform[];
  models: string[];
  tags: string[];
  rating: number;
  downloads: number;
  featured?: boolean;
  sourceUrl?: string;
  paperUrl?: string;
  license?: string;
  updatedAt: string;
}

/** findings 检查结果（日志分析三层架构的层间契约，见 CLAUDE.md 4.2） */
export type Severity = "critical" | "warning" | "info";

export interface Finding {
  id: string;
  severity: Severity;
  ruleId: string;
  title: string;
  /** 触发依据：字段名、实际值、阈值，LLM 不得更改这些数值 */
  evidence: {
    field: string;
    value: number | string;
    threshold?: number | string;
    unit?: string;
  };
  docUrl?: string;
  suggestion?: string;
}

export interface AnalysisReport {
  fileName: string;
  fileSize: number;
  durationSec?: number;
  platform: "PX4" | "ArduPilot";
  /** 机型：rotary_wing / fixed_wing / rover / airship / unknown（见 vehicle_status.vehicle_type） */
  vehicleType?: string;
  parserVersion: string;
  findings: Finding[];
  stats: Record<string, number | string>;
  analyzedAt: string;
}

/* ---------- 报告页数据层（Flight Review 对标 A/B/C，见 ulog-data-script.ts）---------- */

export interface FieldMeta {
  name: string;
  dtype: string;
}

export interface TopicMeta {
  topic: string;
  instance: number;
  n: number;
  fields: FieldMeta[];
}

/** np_manifest() 的返回：日志中全部数据集 */
export interface TopicManifest {
  topics: TopicMeta[];
}

/** np_series() 的返回：LTTB 降采样后的时序，NaN 已转为 null */
export interface SeriesResponse {
  topic: string;
  instance: number;
  t0us: number;
  t: number[];
  series: Record<string, (number | null)[] | null>;
  fullCount: number;
  error?: string;
}

export interface LogMessage {
  tSec: number;
  level: number;
  levelStr: string;
  message: string;
}

export interface Dropout {
  tSec: number;
  durationMs: number;
}

export interface FlightPhase {
  startSec: number;
  endSec: number;
  navState: number;
  mode: string;
  armed: boolean;
}

export interface ChangedParam {
  tSec: number;
  name: string;
  value: number | string | null;
}

/** np_log_info() 的返回：系统信息 / 事件 / 丢包 / 参数 / 飞行阶段 */
export interface LogInfo {
  sysInfo: Record<string, string>;
  messages: LogMessage[];
  dropouts: Dropout[];
  params: Record<string, number | string>;
  changedParams: ChangedParam[];
  phases: FlightPhase[];
}
