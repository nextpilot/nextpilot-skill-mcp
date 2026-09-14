"use client";

import { useEffect, useState } from "react";
import { Bookmark, Code2, Download, FileText, ShieldCheck, Sparkles, Star } from "lucide-react";
import { CATEGORY_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import {
  getFavorite,
  getRating,
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
 * 社区信息行：紧跟在标题/slug 下方展示（下载、评分、收藏、版本、更新时间）。
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

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span className="inline-flex items-center gap-1 font-medium text-text">
        <Star className="h-3.5 w-3.5 fill-warning text-warning" />
        {shownRating.toFixed(1)}
        {rating.count > 0 && <span className="font-normal text-muted">（{rating.count} 人评分）</span>}
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
  category,
  tags,
  platforms,
  clients,
  models,
  featured,
  sourceUrl,
  paperUrl,
  license,
}: {
  category: keyof typeof CATEGORY_LABEL;
  tags: string[];
  platforms: string[];
  clients?: string[];
  models: string[];
  featured?: boolean;
  sourceUrl?: string;
  paperUrl?: string;
  license?: string;
}) {
  const badges = [
    featured && { key: "featured", icon: <Sparkles className="h-3 w-3" />, label: "推荐", tone: "warning" as const },
    sourceUrl && { key: "oss", icon: <Code2 className="h-3 w-3" />, label: "开源", tone: "muted" as const },
    paperUrl && { key: "paper", icon: <FileText className="h-3 w-3" />, label: "有论文", tone: "muted" as const },
    license && { key: "license", icon: <ShieldCheck className="h-3 w-3" />, label: license, tone: "muted" as const },
  ].filter(Boolean) as { key: string; icon: React.ReactNode; label: string; tone: "warning" | "muted" }[];

  return (
    <dl className="mt-5 space-y-2.5 border-t border-border pt-4 text-xs">
      <Row label="分类">
        <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
          {CATEGORY_LABEL[category]}
        </span>
      </Row>

      {badges.length > 0 && (
        <Row label="徽章">
          <span className="flex flex-wrap items-center gap-1.5">
            {badges.map((b) => (
              <span
                key={b.key}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ${
                  b.tone === "warning"
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : "border-border text-muted"
                }`}
              >
                {b.icon}
                {b.label}
              </span>
            ))}
          </span>
        </Row>
      )}

      {tags.length > 0 && (
        <Row label="标签">
          <span className="flex flex-wrap items-center gap-1.5">
            {tags.map((t) => (
              <span key={t} className="rounded bg-surface-2 px-1.5 py-0.5 text-muted">
                #{t}
              </span>
            ))}
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

      <Row label="维护">
        <span className="text-muted">{sourceUrl ? "开源社区" : "平台收录"}</span>
      </Row>

      <Row label="来源">
        {sourceUrl || paperUrl ? (
          <span className="flex flex-wrap items-center gap-3">
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Code2 className="h-3 w-3" />
                开源仓库
              </a>
            )}
            {paperUrl && (
              <a
                href={paperUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <FileText className="h-3 w-3" />
                相关论文
              </a>
            )}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
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
