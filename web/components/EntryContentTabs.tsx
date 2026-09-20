"use client";

import { useState } from "react";
import { Eye, History, MessageSquare } from "lucide-react";

type TabKey = "overview" | "comments" | "changelog";

/**
 * 详情页内容区 Tab（对齐 SkillHub 的 概述 / 评论 / 版本历史）。
 * 复制与下载入口在右栏安装卡，本区只做内容切换。
 */
export function SkillContentTabs({
  overview,
  comments,
  changelog,
  changelogCount,
}: {
  overview: React.ReactNode;
  comments: React.ReactNode;
  changelog: React.ReactNode;
  changelogCount: number;
}) {
  const [tab, setTab] = useState<TabKey>("overview");

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "overview", label: "概述", icon: <Eye className="h-3.5 w-3.5" /> },
    { key: "comments", label: "评论", icon: <MessageSquare className="h-3.5 w-3.5" /> },
    {
      key: "changelog",
      label: "版本历史",
      icon: <History className="h-3.5 w-3.5" />,
      count: changelogCount,
    },
  ];

  return (
    <section>
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key
                ? "border-primary font-medium text-text"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            {t.icon}
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <span className="text-xs text-muted">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="pt-6">
        {tab === "overview" && overview}
        {tab === "comments" && comments}
        {tab === "changelog" && changelog}
      </div>
    </section>
  );
}
