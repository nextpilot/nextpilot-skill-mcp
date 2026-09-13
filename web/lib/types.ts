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
  parserVersion: string;
  findings: Finding[];
  stats: Record<string, number | string>;
  analyzedAt: string;
}
