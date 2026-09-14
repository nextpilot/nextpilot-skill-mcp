/** 平台 / 分类等领域常量，与 CLAUDE.md 3.3 内容框架保持一致 */

export const CATEGORIES = [
  {
    key: "perception",
    label: "感知",
    desc: "让飞控看得懂",
    topics: ["目标检测", "语义分割", "VLM 场景理解"],
  },
  {
    key: "decision",
    label: "决策与规划",
    desc: "让飞控想得清",
    topics: ["任务规划", "自主导航", "路径规划"],
  },
  {
    key: "control",
    label: "控制",
    desc: "让飞控飞得稳",
    topics: ["语言引导飞行", "视觉伺服", "PID 调参"],
  },
  {
    key: "toolchain",
    label: "系统与工具链",
    desc: "让飞控用得上",
    topics: ["PX4 集成", "MAVLink", "机载部署"],
  },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export const CATEGORY_LABEL: Record<CategoryKey, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label]),
) as Record<CategoryKey, string>;

/** 分类默认图标（Skill 未在 frontmatter 指定 icon 时回退） */
export const CATEGORY_GLYPH: Record<CategoryKey, string> = {
  perception: "👁️",
  decision: "🧭",
  control: "🎛️",
  toolchain: "🧰",
};

export const PLATFORMS = ["PX4", "ArduPilot", "Betaflight", "仿真", "通用"] as const;
export type Platform = (typeof PLATFORMS)[number];
