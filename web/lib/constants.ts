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

/**
 * 内容真源所在的仓库——站点「在 Gitee 上编辑」入口指向它。
 *
 * 地址写在这里一处，不散在组件里：git remote 目前是 Gitee（`gitee.com/nextpilot/nextpilot-skill-mcp`），
 * 哪天换成 GitHub 或改分支，只改这个对象。
 * `contentRoot` 是内容在仓库里的根（`knowledge/` 是唯一真源，`web/.generated/` 只是构建期拷贝的产物）。
 */
export const CONTENT_REPO = {
  host: "gitee.com",
  owner: "nextpilot",
  repo: "nextpilot-skill-mcp",
  branch: "master",
  contentRoot: "knowledge",
} as const;

/** 拼出某个内容文件的「在仓库中编辑」地址 */
export function contentEditUrl(...segments: string[]): string {
  const file = [CONTENT_REPO.contentRoot, ...segments].join("/");
  const { host, owner, repo, branch } = CONTENT_REPO;
  return `https://${host}/${owner}/${repo}/edit/${branch}/${file}`;
}

/** 所在站的展示名，用于「在 X 上编辑」这类文案——随 `CONTENT_REPO.host` 走，不在组件里写死 */
export function contentHostLabel(): string {
  const h = CONTENT_REPO.host;
  if (h.includes("github")) return "GitHub";
  if (h.includes("gitee")) return "Gitee";
  return h;
}

/** 某个 Skill 三份文件的编辑地址（详情页每个 Tab 各给一个入口） */
export function skillEditUrls(slug: string) {
  return {
    readme: contentEditUrl("skills", slug, "README.md"),
    skillMd: contentEditUrl("skills", slug, "SKILL.md"),
    changelog: contentEditUrl("skills", slug, "CHANGELOG.md"),
  } as const;
}
