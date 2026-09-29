"use client";

/**
 * 社区指标（下载/获取次数、评分、排行榜）的客户端访问层。
 * 真实计数在 EdgeOne KV（边缘函数聚合），MDX frontmatter 的 downloads/rating 是种子基值。
 * 展示值 = 基值 + KV 增量；KV 未绑定时优雅降级为基值。
 */
import { useCallback, useEffect, useState } from "react";
import { getDeviceId } from "./device-id";
import { asRecord, toCount } from "./json-boundary";

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

/* ── 外部 JSON → 内部类型的唯一闸门（见 CLAUDE.md §6.5）─────────────────────────────
 * 这几个响应由边缘函数（`functions/api/*.js`）产生，而静态站与边缘函数是分开部署的：
 * 页面更新到新版本时，请求可能还落在旧版本函数上（反之亦然）。直接 `as FavoriteStats`
 * 只是把类型检查关掉，缺字段的响应会一路走到 UI 才现形（"undefined 收藏"、NaN 评分）。
 * 所以边界处一律过归一，函数内部信任类型。 */

/** `/api/favorite` → `{count, favorited}`；形状不对返回 null（调用方按"取不到"处理） */
function normalizeFavoriteStats(raw: unknown): FavoriteStats | null {
    const r = asRecord(raw);
    if (!r) return null;
    return { count: toCount(r.count), favorited: r.favorited === true };
}

/** `/api/rating` → `{avg, count, mine}`；`mine` 在"KV 未绑定"分支里确实会缺，要兜 */
function normalizeRatingStats(raw: unknown): RatingStats | null {
    const r = asRecord(raw);
    if (!r) return null;
    const avg = typeof r.avg === "number" && Number.isFinite(r.avg) ? r.avg : 0;
    return { avg, count: toCount(r.count), mine: toCount(r.mine) };
}

/** `/api/download/track?kind=…` 的 `leaderboard` → 条目数组；坏条目丢掉，不整条失败 */
function normalizeLeaderboard(raw: unknown): LeaderboardEntry[] {
    if (!Array.isArray(raw)) return [];
    const out: LeaderboardEntry[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const { slug, delta } = entry as Record<string, unknown>;
        if (typeof slug !== "string" || typeof delta !== "number" || !Number.isFinite(delta)) continue;
        out.push({ slug, delta });
    }
    return out;
}

export async function getFavorite(kind: Kind, slug: string): Promise<FavoriteStats | null> {
    try {
        const resp = await fetch(`/api/favorite?kind=${kind}&slug=${encodeURIComponent(slug)}`, {
            headers: { "x-device-id": getDeviceId() },
        });
        if (!resp.ok) return null;
        return normalizeFavoriteStats(await resp.json());
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
        return normalizeFavoriteStats(await resp.json());
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

export async function submitRating(kind: Kind, slug: string, stars: number): Promise<RatingStats | null> {
    try {
        const resp = await fetch("/api/rating", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
            body: JSON.stringify({ kind, slug, stars, deviceId: getDeviceId() }),
        });
        if (!resp.ok) return null;
        return normalizeRatingStats(await resp.json());
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
        return normalizeRatingStats(await resp.json());
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
                // 形状不对（拿不到 leaderboard 数组）就不写缓存，留到下次挂载重试
                const raw: unknown = d?.leaderboard;
                if (cancelled || !Array.isArray(raw)) return;
                const board = normalizeLeaderboard(raw);
                cache[key] = { ts: Date.now(), data: board };
                setEntries(board);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [kind]);
    return entries;
}

/** 批量把排行榜增量合并进静态基值 */
export function applyDeltas<T extends { slug: string; downloads: number }>(items: T[], board: LeaderboardEntry[]): T[] {
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
