"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { CornerDownRight, Loader2, MessageSquare, Send, Trash2 } from "lucide-react";
import type { Kind } from "@/lib/community-stats";

interface Comment {
    id: string;
    uid: string;
    name: string;
    content: string;
    createdAt: string;
    parentId: string | null;
}

function fmtTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 评论区（对齐 SkillHub：列表 + 发布 + 回复 + 删除自己的评论）。
 * Skill 与 MCP 两类条目共用，`kind` 决定打向哪个接口（`Entry*` 家族名的由来见
 * `EntryContentTabs.tsx` 顶部）。
 */
export function EntryComments({ kind, slug }: { kind: Kind; slug: string }) {
    const { data: session } = useSession();
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [content, setContent] = useState("");
    const [replyTo, setReplyTo] = useState<Comment | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [posting, setPosting] = useState(false);

    const load = useCallback(async () => {
        try {
            const resp = await fetch(`/api/comments?kind=${kind}&slug=${encodeURIComponent(slug)}`);
            const data = resp.ok ? await resp.json() : null;
            setComments(data?.comments ?? []);
        } catch {
            setComments([]);
        } finally {
            setLoading(false);
        }
    }, [kind, slug]);

    useEffect(() => {
        setLoading(true);
        void load();
    }, [load]);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (!content.trim()) return;
        setPosting(true);
        try {
            const resp = await fetch("/api/comments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind, slug, content: content.trim(), parentId: replyTo?.id ?? null }),
            });
            const data = await resp.json().catch(() => null);
            if (!resp.ok) {
                setError(data?.error ?? "发表失败");
                return;
            }
            setContent("");
            setReplyTo(null);
            await load();
        } catch {
            setError("网络异常，请稍后再试");
        } finally {
            setPosting(false);
        }
    }

    async function remove(id: string) {
        await fetch("/api/comments", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, slug, id }),
        });
        await load();
    }

    const roots = comments.filter((c) => !c.parentId);
    const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

    return (
        <div>
            {/* 发布框：未登录时引导登录（保留回跳目标） */}
            {session?.user ? (
                <form onSubmit={submit} className="card p-4">
                    {replyTo && (
                        <p className="mb-2 flex items-center gap-1.5 text-xs text-muted">
                            <CornerDownRight className="h-3.5 w-3.5" />
                            回复 {replyTo.name}
                            <button
                                type="button"
                                onClick={() => setReplyTo(null)}
                                className="ml-1 text-primary hover:underline"
                            >
                                取消
                            </button>
                        </p>
                    )}
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        rows={3}
                        maxLength={1000}
                        placeholder="分享你的实测效果、踩坑经验或改进建议…"
                        className="input resize-y"
                    />
                    <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-muted">{content.length}/1000</span>
                        <button type="submit" disabled={posting || !content.trim()} className="btn-primary">
                            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            {replyTo ? "发表回复" : "发表评论"}
                        </button>
                    </div>
                    {error && <p className="mt-2 text-xs text-critical">{error}</p>}
                </form>
            ) : (
                <p className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted">
                    <a
                        href={`/login?callbackUrl=${encodeURIComponent(`/skills/${slug}`)}`}
                        className="text-primary hover:underline"
                    >
                        登录
                    </a>{" "}
                    后可以参与评论（评论用于记录真实实测经验，需实名账号以免刷屏）。
                </p>
            )}

            {/* 列表 */}
            <div className="mt-5">
                {loading ? (
                    <p className="flex items-center gap-2 text-sm text-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        加载评论…
                    </p>
                ) : roots.length === 0 ? (
                    <p className="flex items-center gap-2 text-sm text-muted">
                        <MessageSquare className="h-4 w-4" />
                        还没有评论，来说说你的实测结果。
                    </p>
                ) : (
                    <ul className="space-y-5">
                        {roots.map((c) => (
                            <li key={c.id}>
                                <CommentItem
                                    comment={c}
                                    canDelete={session?.user?.id === c.uid}
                                    onReply={() => setReplyTo(c)}
                                    onDelete={() => void remove(c.id)}
                                />
                                {repliesOf(c.id).length > 0 && (
                                    <ul className="mt-3 space-y-3 border-l border-border pl-4">
                                        {repliesOf(c.id).map((r) => (
                                            <li key={r.id}>
                                                <CommentItem
                                                    comment={r}
                                                    canDelete={session?.user?.id === r.uid}
                                                    onReply={() => setReplyTo(c)}
                                                    onDelete={() => void remove(r.id)}
                                                />
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function CommentItem({
    comment,
    canDelete,
    onReply,
    onDelete,
}: {
    comment: Comment;
    canDelete: boolean;
    onReply: () => void;
    onDelete: () => void;
}) {
    return (
        <div>
            <div className="flex items-center gap-2 text-xs text-muted">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-text">
                    {comment.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="font-medium text-text">{comment.name}</span>
                <span>{fmtTime(comment.createdAt)}</span>
                <button type="button" onClick={onReply} className="ml-auto hover:text-text">
                    回复
                </button>
                {canDelete && (
                    <button
                        type="button"
                        onClick={onDelete}
                        className="inline-flex items-center gap-1 hover:text-critical"
                        aria-label="删除评论"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">{comment.content}</p>
        </div>
    );
}
