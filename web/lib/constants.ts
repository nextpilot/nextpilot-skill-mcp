/** 平台 / 分类等领域常量，与 CLAUDE.md 3.3 内容框架保持一致 */

export const CATEGORIES = [
  { key: "perception", label: "感知", desc: "让飞控看得懂" },
  { key: "decision", label: "决策与规划", desc: "让飞控想得清" },
  { key: "control", label: "控制", desc: "让飞控飞得稳" },
  { key: "toolchain", label: "系统与工具链", desc: "让飞控用得上" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export const CATEGORY_LABEL: Record<CategoryKey, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label]),
) as Record<CategoryKey, string>;

export const PLATFORMS = ["PX4", "ArduPilot", "Betaflight", "仿真", "通用"] as const;
export type Platform = (typeof PLATFORMS)[number];
