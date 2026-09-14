"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, Star } from "lucide-react";
import {
  getRating,
  submitRating,
  trackDownload,
  type Kind,
  type RatingStats,
} from "@/lib/community-stats";

/**
 * Skill / MCP 详情页操作条：星级评分 + 复制内容 + 获取计数。
 * baseRating/baseDownloads 是 frontmatter 种子值，线上值在此之上叠加 KV 增量。
 */
export function SkillActionsBar({
  kind,
  slug,
  baseRating,
  baseDownloads,
  copyText,
  copyLabel = "复制 Skill 内容",
}: {
  kind: Kind;
  slug: string;
  baseRating: number;
  baseDownloads: number;
  copyText: string;
  copyLabel?: string;
}) {
  const [stats, setStats] = useState<RatingStats>({ avg: 0, count: 0, mine: 0 });
  const [downloadDelta, setDownloadDelta] = useState(0);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void getRating(kind, slug).then((s) => s && setStats(s));
  }, [kind, slug]);

  // 真实评分 = KV 社区评分（有人评过时）与种子值的加权融合，避免种子值被 1 条新评完全覆盖
  const shownRating =
    stats.count > 0
      ? Math.round(((baseRating * 8 + stats.avg * stats.count) / (8 + stats.count)) * 10) / 10
      : baseRating;

  async function rate(stars: number) {
    setSending(true);
    const s = await submitRating(kind, slug, stars);
    if (s) setStats(s);
    setSending(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      if (downloadDelta === 0) {
        await trackDownload(kind, slug);
        setDownloadDelta(1);
      }
    } catch {
      // 剪贴板权限被拒时静默
    }
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-1" title="点击评分">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={sending}
            onClick={() => void rate(n)}
            aria-label={`${n} 星`}
            className="transition-transform hover:scale-110 disabled:opacity-50"
          >
            <Star
              className={`h-5 w-5 ${
                n <= (stats.mine || Math.round(shownRating))
                  ? "fill-warning text-warning"
                  : "text-muted/40"
              }`}
            />
          </button>
        ))}
        <span className="ml-1.5 text-sm text-muted">
          {shownRating.toFixed(1)}
          {stats.count > 0 && `（${stats.count} 人评分）`}
          {stats.mine > 0 && " · 已评"}
        </span>
      </div>

      <span className="flex items-center gap-1 text-sm text-muted">
        <Download className="h-4 w-4" />
        {baseDownloads + downloadDelta} 次获取
      </span>

      <button
        type="button"
        onClick={() => void copy()}
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "已复制" : copyLabel}
      </button>
    </div>
  );
}
