"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck, Check, Download, Sparkles } from "lucide-react";
import {
  getFavorite,
  toggleFavorite,
  trackDownload,
  type FavoriteStats,
  type Kind,
} from "@/lib/community-stats";

/**
 * 详情页右栏（390px 粘性），版式参照腾讯 SkillHub：
 * 安装卡（复制/下载/收藏）→ 统计与评分 → 相关推荐；元信息在左栏分组表内。
 */
export function SkillSidebar({
  kind,
  slug,
  name,
  baseDownloads,
  copyText,
  installHint,
  related,
}: {
  kind: Kind;
  slug: string;
  name: string;
  baseDownloads: number;
  copyText: string;
  installHint: string;
  related: { slug: string; name: string; description: string; icon?: string }[];
}) {
  const [fav, setFav] = useState<FavoriteStats>({ count: 0, favorited: false });
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [delta, setDelta] = useState(0);

  useEffect(() => {
    void getFavorite(kind, slug).then((f) => f && setFav(f));
  }, [kind, slug]);

  async function onToggleFavorite() {
    const next = await toggleFavorite(kind, slug);
    if (next) setFav(next);
  }

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



      {/* 相关推荐 */}
      {related.length > 0 && (
        <section className="mt-4 rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold">相关推荐</h3>
          <ul className="divide-y divide-border/60">
            {related.map((r) => (
              <li key={r.slug} className="py-2.5 first:pt-0 last:pb-0">
                <Link href={`/skills/${r.slug}`} className="group flex items-start gap-2.5">
                  {r.icon && (
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-sm"
                      aria-hidden
                    >
                      {r.icon}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text group-hover:text-primary">
                      {r.name}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted">
                      {r.description}
                    </span>
                  </span>
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
