import { GuideSidebar } from "@/components/GuideSidebar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getGuideNav } from "@/lib/guide";

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  // 手机端：面包屑 + 目录折叠条在正文上方（flex-col）；桌面端：左粘性侧栏 + 正文（flex-row）
  // 顶部只留一条窄边距：面包屑自带底色，压太多留白会让首屏下半全是空的
  return (
    <div className="page-shell pt-4 pb-10 sm:pt-5 sm:pb-12">
      <Breadcrumbs items={[{ label: "使用指南", href: "/guide" }]} />
      {/* lg:gap-8（32px）而不是 gap-10（40px）：page-shell 的内容宽只有 1120px，
          两道各 40px 的间距会把正文从上限 768px 压窄。右目录列宽跟标题文字走
          （见 GuideOutline），不再固定 224px。 */}
      <div className="flex flex-col lg:flex-row lg:gap-8">
        <GuideSidebar groups={getGuideNav()} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
