import { GuideSidebar } from "@/components/GuideSidebar";
import { getGuideNav } from "@/lib/guide";

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-7xl gap-10 px-4 py-10 sm:py-12">
      <GuideSidebar groups={getGuideNav()} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
