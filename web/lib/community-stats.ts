"use client";

/**
 * 社区指标（下载/获取次数、评分、排行榜）的客户端访问层。
 * 真实计数在 EdgeOne KV（边缘函数聚合），MDX frontmatter 的 downloads/rating 是种子基值。
 * 展示值 = 基值 + KV 增量；KV 未绑定时优雅降级为基值。
 */
import { useCallback, useEffect, useState } from "react";
import { getDeviceId } from "./device-id";

export type Kind = "skill" | "mcp";

export interface LeaderboardEntry {
  slug: string;
  delta: number;
}

export interface RatingStats {
  avg: number;
  count: number;
  mine: number;
}

export interface FavoriteStats {
  count: number;
  favorited: boolean;
}

export async function getFavorite(kind: Kind, slug: string): Promise<FavoriteStats | null> {
  try {
    const resp = await fetch(`/api/favorite?kind=${kind}&slug=${encodeURIComponent(slug)}`, {
      headers: { "x-device-id": getDeviceId() },
    });
    if (!resp.ok) return null;
    return (await resp.json()) as FavoriteStats;
  } catch {
    return null;
  }
}

export async function toggleFavorite(kind: Kind, slug: string): Promise<FavoriteStats | null> {
  try {
    const resp = await fetch("/api/favorite", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
      body: JSON.stringify({ kind, slug, deviceId: getDeviceId() }),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as FavoriteStats;
  } catch {
    return null;
  }
}

const cache: Record<string, { ts: number; data: LeaderboardEntry[] }> = {};
const CACHE_MS = 60_000;

export async function trackDownload(kind: Kind, slug: string): Promise<void> {
  try {
    await fetch("/api/download/track", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
      body: JSON.stringify({ kind, slug, deviceId: getDeviceId() }),
      keepalive: true,
    });
  } catch {
    // 计数失败不阻断用户操作
  }
}

export async function submitRating(
  kind: Kind,
  slug: string,
  stars: number,
): Promise<RatingStats | null> {
  try {
    const resp = await fetch("/api/rating", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
      body: JSON.stringify({ kind, slug, stars, deviceId: getDeviceId() }),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as RatingStats;
  } catch {
    return null;
  }
}

export async function getRating(kind: Kind, slug: string): Promise<RatingStats | null> {
  try {
    const resp = await fetch(`/api/rating?kind=${kind}&slug=${encodeURIComponent(slug)}`, {
      headers: { "x-device-id": getDeviceId() },
    });
    if (!resp.ok) return null;
    return (await resp.json()) as RatingStats;
  } catch {
    return null;
  }
}

export function useLeaderboard(kind: Kind) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  useEffect(() => {
    const key = kind;
    const hit = cache[key];
    if (hit && Date.now() - hit.ts < CACHE_MS) {
      setEntries(hit.data);
      return;
    }
    let cancelled = false;
    fetch(`/api/download/track?kind=${kind}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.leaderboard) {
          cache[key] = { ts: Date.now(), data: d.leaderboard };
          setEntries(d.leaderboard);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [kind]);
  return entries;
}

/** 批量把排行榜增量合并进静态基值 */
export function applyDeltas<T extends { slug: string; downloads: number }>(
  items: T[],
  board: LeaderboardEntry[],
): T[] {
  const deltaMap = new Map(board.map((b) => [b.slug, b.delta]));
  return items.map((it) => ({
    ...it,
    downloads: it.downloads + (deltaMap.get(it.slug) ?? 0),
  }));
}

export function useTrackClick() {
  return useCallback((kind: Kind, slug: string) => {
    void trackDownload(kind, slug);
  }, []);
}
