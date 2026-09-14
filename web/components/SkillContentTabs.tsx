"use client";

import { useState } from "react";
import { Eye, FileCode } from "lucide-react";

/**
 * 详情页内容区 Tab（对应 SkillHub 的 概述 / 文件 切换）：
 * 正文 = 阅读视图；Markdown 原文 = 可直接复制的源文件（复制/下载入口在右栏）。
 */
export function SkillContentTabs({
  contentHtml,
  markdown,
}: {
  contentHtml: React.ReactNode;
  markdown: string;
}) {
  const [tab, setTab] = useState<"rendered" | "raw">("rendered");

  return (
    <section>
      <div className="flex gap-1 border-b border-border">
        <TabButton active={tab === "rendered"} onClick={() => setTab("rendered")}>
          <Eye className="h-3.5 w-3.5" />
          概述
        </TabButton>
        <TabButton active={tab === "raw"} onClick={() => setTab("raw")}>
          <FileCode className="h-3.5 w-3.5" />
          文件（Markdown 原文）
        </TabButton>
      </div>

      <div className="pt-6">
        {tab === "rendered" ? (
          contentHtml
        ) : (
          <pre className="max-h-[720px] overflow-auto rounded-xl border border-border bg-surface-2 p-4 text-xs leading-6">
            <code>{markdown}</code>
          </pre>
        )}
      </div>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
        active
          ? "border-primary font-medium text-text"
          : "border-transparent text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}
