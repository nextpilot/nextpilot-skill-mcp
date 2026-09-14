"use client";

import { useState } from "react";
import { Check, Copy, Download, Eye, FileCode } from "lucide-react";

/**
 * 详情页内容区（借鉴 SkillHub 的文件视图）：
 * 渲染视图 = 阅读用；原文视图 = 可直接复制的 Markdown 源文件；
 * 下载按钮产出 .md 文件，与“通过对话安装/复制粘贴”互为等价入口。
 */
export function SkillContentTabs({
  contentHtml,
  markdown,
  fileName,
  onDownload,
}: {
  /** 服务端预渲染好的正文节点 */
  contentHtml: React.ReactNode;
  markdown: string;
  fileName: string;
  onDownload?: () => void;
}) {
  const [tab, setTab] = useState<"rendered" | "raw">("rendered");
  const [copied, setCopied] = useState(false);

  async function copyRaw() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 静默
    }
  }

  function download() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    onDownload?.();
  }

  return (
    <section className="mt-8">
      <div className="flex items-center gap-1 border-b border-border">
        <TabButton active={tab === "rendered"} onClick={() => setTab("rendered")}>
          <Eye className="h-3.5 w-3.5" />
          正文
        </TabButton>
        <TabButton active={tab === "raw"} onClick={() => setTab("raw")}>
          <FileCode className="h-3.5 w-3.5" />
          Markdown 原文
        </TabButton>

        <span className="ml-auto flex items-center gap-2 pb-1.5">
          <button
            type="button"
            onClick={() => void copyRaw()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-primary/50 hover:text-text"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "已复制" : "复制原文"}
          </button>
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-primary/50 hover:text-text"
          >
            <Download className="h-3.5 w-3.5" />
            下载 {fileName}
          </button>
        </span>
      </div>

      <div className="pt-6">
        {tab === "rendered" ? (
          contentHtml
        ) : (
          <pre className="max-h-[640px] overflow-auto rounded-xl border border-border bg-surface-2 p-4 text-xs leading-6">
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
