import type { Finding, MatchedFault } from "./types";

/**
 * 报告历史（冲刺 1：浏览器 localStorage，零服务器）。
 * 只存结构化 findings + LLM 报告文本 + 元信息；原始 .ulg 不存、不上传。
 * 字段对齐 CLAUDE.md 6.3 的 report:{id}（findings JSON + LLM 解释），冲刺 2 迁移 KV/Blob。
 */

const STORAGE_KEY = "nextpilot:reports";
const MAX_REPORTS = 20;

export interface SavedReport {
  id: string;
  fileName: string;
  fileSize: number;
  durationSec?: number;
  platform: string;
  vehicleType?: string;
  /** 飞控软件版本（ver_sw 截断） */
  verSw?: string;
  /** 飞控硬件版本（ver_hw） */
  verHw?: string;
  parserVersion: string;
  /** 日志内容指纹（SHA-256 hex）；同一份日志重复上传时据此命中已有结果 */
  logHash?: string;
  findings: Finding[];
  stats: Record<string, number | string>;
  tags?: string[];
  guardTags?: string[];
  phases?: string[];
  matchedFaults?: MatchedFault[];
  aiMarkdown: string | null;
  analyzedAt: string;
}

/** 老版本写入的记录可能缺字段（如早期没有 findings）；在读取边界补默认值，
 *  避免 UI 里 r.findings.length 之类直接抛错（真机上出现过 crash）。 */
function normalize(raw: Partial<SavedReport> | null | undefined): SavedReport {
  const r = raw ?? {};
  return {
    id: String(r.id ?? ""),
    fileName: String(r.fileName ?? ""),
    fileSize: Number(r.fileSize ?? 0),
    durationSec: typeof r.durationSec === "number" ? r.durationSec : undefined,
    platform: String(r.platform ?? "px4"),
    vehicleType: r.vehicleType ? String(r.vehicleType) : undefined,
    verSw: r.verSw ? String(r.verSw) : undefined,
    verHw: r.verHw ? String(r.verHw) : undefined,
    parserVersion: String(r.parserVersion ?? ""),
    logHash: r.logHash ? String(r.logHash) : undefined,
    findings: Array.isArray(r.findings) ? r.findings : [],
    stats: r.stats && typeof r.stats === "object" ? r.stats : {},
    tags: Array.isArray(r.tags) ? r.tags : undefined,
    guardTags: Array.isArray(r.guardTags) ? r.guardTags : undefined,
    phases: Array.isArray(r.phases) ? r.phases : undefined,
    matchedFaults: Array.isArray(r.matchedFaults) ? r.matchedFaults : undefined,
    aiMarkdown: typeof r.aiMarkdown === "string" ? r.aiMarkdown : null,
    analyzedAt: String(r.analyzedAt ?? ""),
  };
}

function readAll(): SavedReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => normalize(x as Partial<SavedReport>)) : [];
  } catch {
    return [];
  }
}

function writeAll(list: SavedReport[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // localStorage 满 / 隐私模式被禁用时静默失败，不影响本次分析
  }
}

export function saveReport(report: SavedReport): void {
  const list = readAll();
  const idx = list.findIndex((r) => r.id === report.id);
  if (idx >= 0) list[idx] = report;
  else list.unshift(report);
  if (list.length > MAX_REPORTS) list.length = MAX_REPORTS;
  writeAll(list);
}

export function listReports(): SavedReport[] {
  return readAll().sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
}

export function getReport(id: string): SavedReport | null {
  return readAll().find((r) => r.id === id) ?? null;
}

export function deleteReport(id: string): void {
  writeAll(readAll().filter((r) => r.id !== id));
}

export function clearReports(): void {
  writeAll([]);
}

export function newReportId(): string {
  const c = globalThis.crypto as { randomUUID?: () => string; } | undefined;
  return c?.randomUUID?.() ?? `r${Date.now()}`;
}