import type { Metadata } from "next";
import { makePageMeta } from "@/lib/seo";
import { getSkillIndex } from "@/lib/skills";
import { SkillExplorer } from "@/components/SkillExplorer";
import { LocalizedText } from "@/components/LocalizedText";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    return makePageMeta({
        title: "Skill 技能库",
        description:
            "飞控 AI Skill 浏览与搜索：感知、决策、控制与工具链，覆盖目标检测、自主导航、视觉伺服、PX4 集成等场景。",
        path: "/skills",
        locale,
    });
}

/**
 * 这一页要保持静态（不要接 `searchParams` / `headers` 这类动态 API）。
 *
 * Skill 清单的真源在 `web/content/skills/<slug>/SKILL.md`（入库），`lib/skills.ts` 读的是那里。
 * 以前读的是 `process.cwd()/../content/skills`，那个目录不在部署包里，页面一旦变成
 * 按需渲染，读盘就发生在线上运行时，`getAllSkills()` 返回空数组、页面成了"0 个 Skill"
 * （2026-09-16 线上实测到的就是这个：RSC 里 skills: []）。挪进 `content/skills/` 之后
 * 这个坑填上了，但静态页仍然更快：清单每次构建就那么几个文件，没必要每次请求读盘。
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
                <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
                    <LocalizedText zh="Skill 技能库" en="AI skill library" />
                </h1>
                <p className="mt-2 text-sm text-muted">
                    {getSkillIndex().length}{" "}
                    <LocalizedText
                        zh="个 Skill，覆盖感知、决策、控制与工具链。MCP 服务单独收录，见导航栏。"
                        en="skills across perception, decisions, control and toolchains. MCP servers are listed separately."
                    />
                </p>
            </div>
            <SkillExplorer skills={getSkillIndex()} />
        </div>
    );
}
