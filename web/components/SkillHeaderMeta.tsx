"use client";

import { useEffect, useState } from "react";
import { Bookmark, Code2, Download, FileText, ShieldCheck, Sparkles, Star } from "lucide-react";
import { formatDate } from "@/lib/format";
import {
  getFavorite,
  getRating,
  submitRating,
  type FavoriteStats,
  type Kind,
  type RatingStats,
} from "@/lib/community-stats";

/** 详情页共用的社区实时数据（下载/评分/收藏），两处展示（标题下方、右栏）共用同一数据源 */
export function useCommunityStats(kind: Kind, slug: string, baseRating: number) {
  const [rating, setRating] = useState<RatingStats>({ avg: 0, count: 0, mine: 0 });
  const [fav, setFav] = useState<FavoriteStats>({ count: 0, favorited: false });

  useEffect(() => {
    void getRating(kind, slug).then((r) => r && setRating(r));
    void getFavorite(kind, slug).then((f) => f && setFav(f));
  }, [kind, slug]);

  // 线上评分与种子值按权重融合，避免 1 条新评把种子分完全覆盖
  const shownRating =
    rating.count > 0
      ? Math.round(((baseRating * 8 + rating.avg * rating.count) / (8 + rating.count)) * 10) / 10
      : baseRating;

  return { rating, fav, shownRating };
}

/**
 * 社区信息行：紧跟在标题/slug 下方展示，并承担评分交互（点星即评）。
 * 下载 / 评分 / 收藏 / 版本 / 更新时间为同一行，避免与右栏重复。
 */
export function CommunityStatLine({
  kind,
  slug,
  baseRating,
  baseDownloads,
  version,
  updatedAt,
}: {
  kind: Kind;
  slug: string;
  baseRating: number;
  baseDownloads: number;
  version?: string;
  updatedAt: string;
}) {
  const { rating, fav, shownRating } = useCommunityStats(kind, slug, baseRating);
  const [localRating, setLocalRating] = useState<RatingStats | null>(null);
  const [sending, setSending] = useState(false);

  const active = localRating ?? rating;
  const shown =
    localRating && active.count > 0
      ? Math.round(((baseRating * 8 + active.avg * active.count) / (8 + active.count)) * 10) / 10
      : shownRating;

  async function rate(stars: number) {
    setSending(true);
    const next = await submitRating(kind, slug, stars);
    if (next) setLocalRating(next);
    setSending(false);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
      <span className="inline-flex items-center gap-0.5" title="点击评分">
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
              className={`h-3.5 w-3.5 ${
                n <= (active.mine || Math.round(shown))
                  ? "fill-warning text-warning"
                  : "text-muted/40"
              }`}
            />
          </button>
        ))}
        <span className="ml-1 font-medium text-text">{shown.toFixed(1)}</span>
        <span>
          / 5.0{active.count > 0 ? `（${active.count} 人）` : ""}
          {active.mine > 0 ? " · 已评" : ""}
        </span>
      </span>
      <span className="inline-flex items-center gap-1">
        <Download className="h-3.5 w-3.5" />
        {baseDownloads} 次获取
      </span>
      <span className="inline-flex items-center gap-1">
        <Bookmark className="h-3.5 w-3.5" />
        {fav.count} 收藏
      </span>
      {version && <span>v{version}</span>}
      <span>更新于 {formatDate(updatedAt)}</span>
    </div>
  );
}

/**
 * 头部分组信息：分类 / 徽章 / 标签 / 适用平台 / 适用范围，逐行带标签摆放。
 */
export function SkillMetaGroups({
  platforms,
  clients,
  models,
  featured,
  sourceUrl,
  paperUrl,
  license,
}: {
  platforms: string[];
  clients?: string[];
  models: string[];
  featured?: boolean;
  sourceUrl?: string;
  paperUrl?: string;
  license?: string;
}) {
  // 徽章即入口：开源/论文徽章直接链接到对应出处（不再单列“来源”行）
  const badges = [
    featured && { key: "featured", icon: <Sparkles className="h-3 w-3" />, label: "推荐", tone: "warning" as const },
    sourceUrl && {
      key: "oss",
      icon: <Code2 className="h-3 w-3" />,
      label: "开源仓库",
      tone: "muted" as const,
      href: sourceUrl,
    },
    paperUrl && {
      key: "paper",
      icon: <FileText className="h-3 w-3" />,
      label: "相关论文",
      tone: "muted" as const,
      href: paperUrl,
    },
    license && { key: "license", icon: <ShieldCheck className="h-3 w-3" />, label: license, tone: "muted" as const },
  ].filter(Boolean) as {
    key: string;
    icon: React.ReactNode;
    label: string;
    tone: "warning" | "muted";
    href?: string;
  }[];

  return (
    <dl className="mt-5 space-y-2.5 border-t border-border pt-4 text-xs">

      {badges.length > 0 && (
        <Row label="徽章">
          <span className="flex flex-wrap items-center gap-1.5">
            {badges.map((b) => {
              const cls = `inline-flex items-center gap-1 rounded-md border px-2 py-0.5 transition-colors ${
                b.tone === "warning"
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-border text-muted hover:border-primary/50 hover:text-text"
              }`;
              return b.href ? (
                <a key={b.key} href={b.href} target="_blank" rel="noreferrer" className={cls}>
                  {b.icon}
                  {b.label}
                </a>
              ) : (
                <span key={b.key} className={cls}>
                  {b.icon}
                  {b.label}
                </span>
              );
            })}
          </span>
        </Row>
      )}


      {platforms.length > 0 && (
        <Row label="适用平台">
          <span className="flex flex-wrap items-center gap-1.5">
            {platforms.map((p) => (
              <span key={p} className="rounded-md border border-border px-2 py-0.5">
                {p}
              </span>
            ))}
          </span>
        </Row>
      )}

      {clients && clients.length > 0 && (
        <Row label="适用范围">
          <span className="flex flex-wrap items-center gap-1.5">
            {clients.map((c) => (
              <span key={c} className="rounded-md bg-surface-2 px-2 py-0.5 text-muted">
                {c}
              </span>
            ))}
          </span>
        </Row>
      )}

      {models.length > 0 && (
        <Row label="依赖模型">
          <span className="flex flex-wrap items-center gap-1.5">
            {models.map((m) => (
              <span key={m} className="rounded bg-surface-2 px-1.5 py-0.5 text-muted">
                {m}
              </span>
            ))}
          </span>
        </Row>
      )}

      <Row label="维护作者">
        <span className="text-muted">{sourceUrl ? "开源社区" : "平台收录"}</span>
      </Row>

    </dl>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <dt className="w-16 shrink-0 pt-0.5 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
