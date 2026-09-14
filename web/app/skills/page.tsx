import type { Metadata } from "next";
import { getSkillIndex } from "@/lib/skills";
import type { CategoryKey } from "@/lib/constants";
import { SkillExplorer } from "@/components/SkillExplorer";
import { LocalizedText } from "@/components/LocalizedText";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const metadata: Metadata = {
  title: "Skill 库 · NextPilot Skill MCP",
  description: "飞控 AI Skill 浏览与搜索：感知、决策、控制与工具链",
};

const VALID_CATEGORIES = new Set([
  "perception",
  "decision",
  "control",
  "toolchain",
]);

export default async function SkillsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const initialCategory =
    category && VALID_CATEGORIES.has(category)
      ? (category as CategoryKey)
      : undefined;

  return (
    <div className="page-shell pt-4 pb-10 sm:pt-5">
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Skill 库" }]} />
      </div>
      <div className="mb-7">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]"><LocalizedText zh="飞控 AI Skill 库" en="Flight AI skill library" /></h1>
        <p className="mt-2 text-sm text-muted">
          {getSkillIndex().length} <LocalizedText zh="个 Skill，覆盖感知、决策、控制与工具链。MCP Server 单独收录，见导航栏。" en="skills across perception, decisions, control and toolchains. MCP servers are listed separately." />
        </p>
      </div>
      <SkillExplorer
        skills={getSkillIndex()}
        initialCategory={initialCategory}
      />
    </div>
  );
}
