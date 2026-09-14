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
  /** 适用范围：可用的 AI 客户端 / 运行环境（如 Claude、ChatGPT、Cursor、Claude Code） */
  clients?: string[];
  rating: number;
  downloads: number;
  featured?: boolean;
  sourceUrl?: string;
  paperUrl?: string;
  license?: string;
  /** 图标（emoji，如 "🛰️"；缺省时按分类回退到内置图标瓦片） */
  icon?: string;
  /** 版本号（可选，随内容更新递增；借鉴 SkillHub 的版本展示） */
  version?: string;
  /** 版本历史（可选，作者在 frontmatter 维护；缺省时按 version+updatedAt 兜底生成一条） */
  changelog?: ChangelogEntry[];
  updatedAt: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  notes: string[];
}

/**
 * MCP Server 元数据。
 * 与 Skill 并列而非其子类：Skill 是模型读到的提示词与约定，MCP Server 是客户端
 * 能真正调用的工具集，两者的字段、评估方式和安全要求都不同。
 */
export interface McpServerMeta {
  slug: string;
  name: string;
  description: string;
  /** 允许自由取值：MCP 面向的不只是飞控固件，还有仿真器与工具 */
  platforms: string[];
  models: string[];
  /** 暴露给客户端的工具名 */
  tools: string[];
  transport: string;
  /** 图标（emoji） */
  icon?: string;
  /** 适用范围：可用的 AI 客户端（Claude / Cursor 等） */
  clients?: string[];
  version?: string;
  changelog?: ChangelogEntry[];
  /** 默认是否只读。false 表示具备致动能力，详情页须显著标注（见 CLAUDE.md 第 5 节） */
  readOnly: boolean;
  tags: string[];
  rating: number;
  downloads: number;
  featured?: boolean;
  sourceUrl?: string;
  license?: string;
  updatedAt: string;
}

/** findings 检查结果（日志分析三层架构的层间契约，见 CLAUDE.md 4.2） */export type Severity = "critical" | "warning" | "info";

export interface Finding {
  id: string;
  severity: Severity;
  ruleId: string;
  /** 确定性引擎异常标签（喂给故障知识库匹配）；info 级可能为 null */
  tag?: string | null;
  title: string;
  /** 触发依据：字段名、实际值、阈值，LLM 不得更改这些数值 */
  evidence: {
    field: string;
    value: number | string;
    threshold?: number | string;
    unit?: string;
    samples?: { tSec?: number; message?: string }[];
  };
  docUrl?: string;
  suggestion?: string;
}

/** 第三层确定性匹配到的故障知识库条目（见 knowledge/px4/px4-fault-kb.yaml） */
export interface MatchedFault {
  faultId: string;
  faultTag: string;
  riskLevel: string;
  possibleRootCause: string[];
  troubleshootingSteps: string[];
  note?: string;
  matchedPhases: string[];
}

export interface AnalysisReport {
  fileName: string;
  fileSize: number;
  durationSec?: number;
  platform: "PX4" | "ArduPilot";
  /** 机型：rotary_wing / fixed_wing / rover / airship / unknown（见 vehicle_status.vehicle_type） */
  vehicleType?: string;
  parserVersion: string;
  /** 日志内容指纹（SHA-256 hex）：同一份日志重复上传时直接载入历史结果 */
  logHash?: string;
  findings: Finding[];
  stats: Record<string, number | string>;
  /** 第二层异常标签 */
  tags?: string[];
  /** 数据质量 / 边界 guard 标签（insufficient_data 等） */
  guardTags?: string[];
  /** armed 段飞行阶段 */
  phases?: string[];
  checksRun?: string[];
  checksSkipped?: { check: string; reason: string }[];
  /** 第三层故障知识库命中条目 */
  matchedFaults?: MatchedFault[];
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
