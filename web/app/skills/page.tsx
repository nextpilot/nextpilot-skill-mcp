import type { Metadata } from "next";
import { getSkillIndex } from "@/lib/skills";
import type { CategoryKey } from "@/lib/constants";
import { SkillExplorer } from "@/components/SkillExplorer";
import { LocalizedText } from "@/components/LocalizedText";

export const metadata: Metadata = {
  title: "Skill 库 · NextPilot Skill MCP",
  description: "飞控 AI Skill 与 MCP 工具浏览与搜索",
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
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold"><LocalizedText zh="飞控 AI Skill 库" en="Flight AI skill library" /></h1>
        <p className="mt-1.5 text-sm text-muted">
          {getSkillIndex().length} <LocalizedText zh="个 Skill / MCP，覆盖感知、决策、控制与工具链" en="skills / MCP tools across perception, decisions, control and toolchains" />
        </p>
      </div>
      <SkillExplorer
        skills={getSkillIndex()}
        initialCategory={initialCategory}
      />
    </div>
  );
}
