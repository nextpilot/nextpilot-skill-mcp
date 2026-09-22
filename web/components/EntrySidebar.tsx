"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck, Check, Download, Pencil, Sparkles } from "lucide-react";
import { getFavorite, toggleFavorite, trackDownload, type FavoriteStats, type Kind } from "@/lib/community-stats";
import { contentHostLabel } from "@/lib/constants";

/**
 * 详情页右栏（390px 粘性），版式参照腾讯 SkillHub：
 * 安装卡（复制/下载/收藏）→ 统计与评分 → 相关推荐；元信息在左栏分组表内。
 *
 * **Skill 与 MCP 两类条目共用**，所以家族名是 `Entry*` 而不是 `Skill*`：叫 `SkillSidebar`
 * 会宣称它只服务 Skill 一类，而 `/mcp/[slug]` 也在用（详见 `EntryContentTabs.tsx` 顶部）。
 * 两类差异全部走参数（`kind` 决定统计接口，`installTitle` / `installHint` 决定文案）。
 */
export function EntrySidebar({
    kind,
    slug,
    name,
    baseDownloads,
    copyText,
    installHint,
    /** 下面这个默认值是 Skill 的文案；MCP 由详情页另传一份（"该 MCP 服务"） */
    installTitle = "把这个 Skill 交给你的 AI，即可使用",
    /**
     * 内容在仓库里的编辑入口。只有 Skill 传（指向 `SKILL.md`）；
     * MCP 的编辑入口放在 `EntryContentTabs` 的每个 Tab 上（它有三份文件，侧栏一个入口
     * 指不清是哪份），所以这里不传就不渲染。
     */
    editUrl,
    related,
}: {
    kind: Kind;
    slug: string;
    name: string;
    baseDownloads: number;
    copyText: string;
    installHint: string;
    /** 安装卡标题（MCP 用「该 MCP 服务」） */
    installTitle?: string;
    editUrl?: string;
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
        // 文件名必须是 SKILL.md：这是 Agent Skills 规范定的名字，落到 .claude/skills/<slug>/
        // 才能被加载。写成 <slug>.md 就只是"一份格式像 Skill 的文档"，加载不了。
        const blob = new Blob([copyText], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "SKILL.md";
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
            <section className="card p-5">
                <h3 className="text-[15px] font-semibold">{installTitle}</h3>
                <p className="mt-2 text-xs leading-5 text-muted">{installHint}</p>

                <button type="button" onClick={() => void copy()} className="btn-primary mt-4 w-full py-2.5">
                    {copied ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    {copied ? "已复制，粘贴给 AI 即可" : "复制 Skill 内容"}
                </button>
                <button type="button" onClick={download} className="btn-ghost mt-2 w-full py-2.5 text-muted">
                    {downloaded ? <Check className="h-4 w-4 text-ok" /> : <Download className="h-4 w-4" />}
                    {downloaded ? "已下载" : "下载 SKILL.md"}
                </button>

                <button
                    type="button"
                    onClick={() => void onToggleFavorite()}
                    aria-pressed={fav.favorited}
                    className={`btn-ghost mt-2 w-full py-2.5 ${
                        fav.favorited ? "border-primary/50 text-primary" : "text-muted"
                    }`}
                >
                    {fav.favorited ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                    {fav.favorited ? "已收藏" : "收藏"}
                    {fav.count > 0 && <span className="text-xs">· {fav.count}</span>}
                </button>

                {editUrl && (
                    <a
                        href={editUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost mt-2 w-full py-2.5 text-muted"
                    >
                        <Pencil className="h-4 w-4" />
                        {`在 ${contentHostLabel()} 上编辑`}
                    </a>
                )}
            </section>

            {/* 相关推荐 */}
            {related.length > 0 && (
                <section className="card mt-4 p-5">
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
