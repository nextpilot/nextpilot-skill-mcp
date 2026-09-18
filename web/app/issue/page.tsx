import type { Metadata } from "next";
import { IssueForm } from "@/components/IssueForm";

export const metadata: Metadata = {
  title: "提交反馈 · NextPilot Skill",
};

export default function IssuePage() {
  return (
    <div className="page-shell flex justify-center py-16">
      <IssueForm />
    </div>
  );
}
