import type { Finding } from "./types";

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
  parserVersion: string;
  findings: Finding[];
  stats: Record<string, number | string>;
  aiMarkdown: string | null;
  analyzedAt: string;
}

function readAll(): SavedReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedReport[]) : [];
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
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return c?.randomUUID?.() ?? `r${Date.now()}`;
}
