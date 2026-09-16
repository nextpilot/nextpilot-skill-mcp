import type { Metadata } from "next";
import { getSkillIndex } from "@/lib/skills";
import { SkillExplorer } from "@/components/SkillExplorer";
import { LocalizedText } from "@/components/LocalizedText";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const metadata: Metadata = {
  title: "Skill 技能库 · NextPilot Skill",
  description: "飞控 AI Skill 浏览与搜索：感知、决策、控制与工具链",
};

/**
 * ⚠️ 这一页**必须保持静态**（不要接 `searchParams` / `headers` 这类动态 API）。
 *
 * Skill 清单来自 `content/skills/*.mdx`，由 `lib/skills.ts` 直接读文件系统
 * （`process.cwd()/../content/skills`）。构建期读没问题；一旦页面变成按需渲染，
 * 这段读盘就发生在线上运行时——那里没有这个目录，`getAllSkills()` 返回空数组，
 * 页面就成了"0 个 Skill"（2026-09-16 线上实测到的就是这个：RSC 里 skills: []）。
 *
 * 所以 `?category=` 的预选改由 SkillExplorer 在浏览器端读 location.search 完成，
 * 首页那几个分类入口照样能跳进对应筛选。
 */
export default function SkillsPage() {
  return (
    <div className="page-shell pt-4 pb-10 sm:pt-5">
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Skill 技能库" }]} />
      </div>
      <div className="mb-7">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]"><LocalizedText zh="飞控 AI Skill 技能库" en="Flight AI skill library" /></h1>
        <p className="mt-2 text-sm text-muted">
          {getSkillIndex().length} <LocalizedText zh="个 Skill，覆盖感知、决策、控制与工具链。MCP 服务单独收录，见导航栏。" en="skills across perception, decisions, control and toolchains. MCP servers are listed separately." />
        </p>
      </div>
      <SkillExplorer skills={getSkillIndex()} />
    </div>
  );
}
