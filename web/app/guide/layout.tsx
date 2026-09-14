import { GuideSidebar } from "@/components/GuideSidebar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getGuideNav } from "@/lib/guide";

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  // 手机端：面包屑 + 目录折叠条在正文上方（flex-col）；桌面端：左粘性侧栏 + 正文（flex-row）
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:py-12">
      <Breadcrumbs items={[{ label: "使用指南", href: "/guide" }]} />
      <div className="flex flex-col lg:flex-row lg:gap-10">
        <GuideSidebar groups={getGuideNav()} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
