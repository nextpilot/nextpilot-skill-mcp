"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck, Check, Copy, Download, Sparkles, Star } from "lucide-react";
import {
  getFavorite,
  getRating,
  submitRating,
  toggleFavorite,
  trackDownload,
  type FavoriteStats,
  type Kind,
  type RatingStats,
} from "@/lib/community-stats";

export interface SidebarMetaRow {
  label: string;
  value: React.ReactNode;
}

/**
 * 详情页右栏（390px 粘性），版式参照腾讯 SkillHub：
 * 安装卡 → 安装方式 → 统计 → 元信息 → 相关推荐。
 */
export function SkillSidebar({
  kind,
  slug,
  name,
  baseRating,
  baseDownloads,
  copyText,
  installHint,
  meta,
  related,
}: {
  kind: Kind;
  slug: string;
  name: string;
  baseRating: number;
  baseDownloads: number;
  copyText: string;
  installHint: string;
  meta: SidebarMetaRow[];
  related: { slug: string; name: string; description: string }[];
}) {
  const [stats, setStats] = useState<RatingStats>({ avg: 0, count: 0, mine: 0 });
  const [fav, setFav] = useState<FavoriteStats>({ count: 0, favorited: false });
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [delta, setDelta] = useState(0);

  useEffect(() => {
    void getRating(kind, slug).then((s) => s && setStats(s));
    void getFavorite(kind, slug).then((f) => f && setFav(f));
  }, [kind, slug]);

  async function onToggleFavorite() {
    const next = await toggleFavorite(kind, slug);
    if (next) setFav(next);
  }

  // 线上评分与种子值按权重融合，避免 1 条新评把种子分完全覆盖
  const shownRating =
    stats.count > 0
      ? Math.round(((baseRating * 8 + stats.avg * stats.count) / (8 + stats.count)) * 10) / 10
      : baseRating;

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      if (delta === 0) {
        await trackDownload(kind, slug);
        setDelta(1);
      }
    } catch {
      /* 剪贴板不可用 */
    }
  }

  function download() {
    const blob = new Blob([copyText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    if (delta === 0) {
      void trackDownload(kind, slug);
      setDelta(1);
    }
  }

  async function rate(stars: number) {
    setSending(true);
    const s = await submitRating(kind, slug, stars);
    if (s) setStats(s);
    setSending(false);
  }

  return (
    <div className="flex w-full flex-col lg:w-[390px]">
      {/* 安装卡：说明 + 主 CTA（对应 SkillHub 的“将提示词发送给你的 AI 安装该 skills”） */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-[15px] font-semibold">把提示词发给你的 AI，即可使用该 Skill</h3>
        <p className="mt-2 text-xs leading-5 text-muted">{installHint}</p>

        <button
          type="button"
          onClick={() => void copy()}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          {copied ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {copied ? "已复制，粘贴给 AI 即可" : "复制 Skill 内容"}
        </button>
        <button
          type="button"
          onClick={download}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-muted transition-colors hover:border-primary/50 hover:text-text"
        >
          {downloaded ? <Check className="h-4 w-4 text-ok" /> : <Download className="h-4 w-4" />}
          {downloaded ? "已下载" : `下载 ${slug}.md`}
        </button>

        <button
          type="button"
          onClick={() => void onToggleFavorite()}
          aria-pressed={fav.favorited}
          className={`mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
            fav.favorited
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border text-muted hover:border-primary/50 hover:text-text"
          }`}
        >
          {fav.favorited ? (
            <BookmarkCheck className="h-4 w-4" />
          ) : (
            <Bookmark className="h-4 w-4" />
          )}
          {fav.favorited ? "已收藏" : "收藏"}
          {fav.count > 0 && <span className="text-xs">· {fav.count}</span>}
        </button>
      </section>

      {/* 统计：评分（可点）/ 获取次数 / 名称 */}
      <section className="mt-4 rounded-xl border border-border bg-surface p-5 text-sm">
        <div className="flex items-center gap-1">
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
                className={`h-4 w-4 ${
                  n <= (stats.mine || Math.round(shownRating))
                    ? "fill-warning text-warning"
                    : "text-muted/40"
                }`}
              />
            </button>
          ))}
          <span className="ml-1 font-medium">{shownRating.toFixed(1)}</span>
          <span className="text-xs text-muted">
            / 5.0{stats.count > 0 ? `（${stats.count} 人评分）` : ""}
            {stats.mine > 0 ? " · 已评" : ""}
          </span>
        </div>
        <dl className="mt-3 space-y-1.5 text-xs text-muted">
          <div className="flex justify-between">
            <dt>获取次数</dt>
            <dd className="font-medium text-text">{baseDownloads + delta}</dd>
          </div>
          <div className="flex justify-between">
            <dt>收藏</dt>
            <dd className="font-medium text-text">{fav.count}</dd>
          </div>
          <div className="flex justify-between">
            <dt>评分人数</dt>
            <dd className="font-medium text-text">{stats.count}</dd>
          </div>
        </dl>
      </section>

      {/* 元信息列表 */}
      <section className="mt-4 rounded-xl border border-border bg-surface p-5">
        <h3 className="mb-3 text-sm font-semibold">元信息</h3>
        <dl className="space-y-2 text-xs">
          {meta.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-muted">{row.label}</dt>
              <dd className="text-right text-text">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 相关推荐 */}
      {related.length > 0 && (
        <section className="mt-4 rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold">相关推荐</h3>
          <ul className="space-y-3">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={`/skills/${r.slug}`} className="group block">
                  <p className="text-sm group-hover:text-primary">{r.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted">
                    {r.description}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-4 px-1 text-[11px] leading-5 text-muted/80">
        本页评分为社区用户打分；获取次数按设备去重统计。
      </p>
    </div>
  );
}
