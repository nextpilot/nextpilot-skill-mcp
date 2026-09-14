"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** 小号复制控件（借鉴 SkillHub 的“点击复制 slug”） */
export function CopyChip({
  value,
  label,
  title,
  className = "",
  iconOnly = false,
}: {
  value: string;
  label?: string;
  title?: string;
  className?: string;
  /** 只显示图标（用于紧邻已展示该文本的场景，避免重复两遍） */
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时静默
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={title ?? "点击复制"}
      aria-label={title ?? "复制"}
      className={`inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 font-mono text-[11px] text-muted transition-colors hover:border-primary/50 hover:text-text ${className}`}
    >
      {copied ? <Check className="h-3 w-3 text-ok" /> : <Copy className="h-3 w-3" />}
      {!iconOnly && (label ?? value)}
    </button>
  );
}
