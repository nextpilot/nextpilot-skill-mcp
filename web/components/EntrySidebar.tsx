"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/routing";
import { ArrowRight, Bookmark, BookmarkCheck, Check, Download, Pencil, Sparkles } from "lucide-react";
import { getFavorite, toggleFavorite, trackDownload, type FavoriteStats, type Kind } from "@/lib/community-stats";
import { contentHostLabel } from "@/lib/constants";

/**
 * 详情页右栏（版式参照腾讯 SkillHub 的侧栏收窄到 320px；宽度由页面的 grid 轨道给，
 * 这里不写死——skill / mcp 两个详情页共用本组件，轨道各改各的就会像当年那样
 * 一边 320px 一边 390px，卡比轨道宽的 70px 会向右溢出、贴出内容区）：
 * 安装卡（复制/下载/收藏）→ 相关推荐；元信息在左栏分组表内。
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
     * MCP 的编辑入口放在 `EntryContentTabs` 的每个 Tab 上（三份文件各指各的，
     * 侧栏一个入口指不清是哪份），所以这里不传就不渲染。
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
    // 相关推荐的路径段跟 kind 走：mcp 页的相关推荐是其他 MCP 条目，写死 /skills/
    // 会把它们链到不存在的 skill 页
    const relatedBase = kind === "mcp" ? "mcp" : "skills";
    // 复制按钮文案跟 kind 走：Skill 复制的是给 AI 的提示词原文（SKILL.md），
    // MCP 复制的是接入配置（JSON 配置块）——后者叫「Skill 内容」是撒谎
    const copyLabel = kind === "mcp" ? "复制接入配置" : "复制 SKILL 提示词";

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
        // 安装包走 /api/skills/<slug>/download：整个 Skill 目录打成 zip（含 assets
        // 里的示例 .ulg、evals、scripts），解压出来就是一个能直接拷进 .claude/skills/
        // 的目录。只下载 SKILL.md 单文件的话，这些伴生文件就丢了。
        const a = document.createElement("a");
        a.href = `/api/skills/${slug}/download`;
        a.download = `${slug}.zip`;
        a.click();
        setDownloaded(true);
        if (delta === 0) {
            void trackDownload(kind, slug);
            setDelta(1);
        }
    }

    return (
        <div className="flex w-full flex-col">
            {/* 安装卡：说明 + 主 CTA（对应 SkillHub 的“将提示词发送给你的 AI 安装该 skills”） */}
            <section className="card p-5">
                <h3 className="text-[15px] font-semibold">{installTitle}</h3>
                <p className="mt-2 text-xs leading-5 text-muted">{installHint}</p>

                <button type="button" onClick={() => void copy()} className="btn-primary mt-4 w-full py-2.5">
                    {copied ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    {copied ? "已复制，粘贴给 AI 即可" : copyLabel}
                </button>
                {/* 安装包下载只有 Skill 有：MCP 的「安装」就是复制配置接进客户端，
                    没有可下载的包；旧版给 MCP 也挂「下载 SKILL.md」，实际下载的是
                    接入配置文本存成 SKILL.md，是个坏按钮，撤掉。 */}
                {kind === "skill" && (
                    <button type="button" onClick={download} className="btn-ghost mt-2 w-full py-2.5 text-muted">
                        {downloaded ? <Check className="h-4 w-4 text-ok" /> : <Download className="h-4 w-4" />}
                        {downloaded ? "已下载, 请解压到 AI 目录" : "下载 SKILL 安装包"}
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => void onToggleFavorite()}
                    aria-pressed={fav.favorited}
                    className={`btn-ghost mt-2 w-full py-2.5 ${
                        fav.favorited ? "border-primary/50 text-primary" : "text-muted"
                    }`}
                >
                    {fav.favorited ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                    {fav.favorited ? "已收藏, 请通过 /me 查看" : "收藏 SKILL 到清单"}
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
                            <li key={r.slug} className="py-1 first:pt-0 last:pb-0">
                                {/* 悬停反馈三件套（习语取自 SkillHub 的卡片）：整条浮起（负 margin
                                    让高亮块比文字宽、文字仍与标题对齐）→ 标题变主色 → 箭头从左滑入；
                                    箭头常驻占位（只动透明度/位移），悬停时文字不回流。 */}
                                <Link
                                    href={`/${relatedBase}/${r.slug}`}
                                    className="group -mx-2 flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-200 hover:bg-surface-2"
                                >
                                    {r.icon && (
                                        <span
                                            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-sm transition-all duration-200 group-hover:scale-110 group-hover:bg-surface"
                                            aria-hidden
                                        >
                                            {r.icon}
                                        </span>
                                    )}
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium text-text transition-colors duration-200 group-hover:text-primary">
                                            {r.name}
                                        </span>
                                        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted">
                                            {r.description}
                                        </span>
                                    </span>
                                    <ArrowRight
                                        className="mt-1.5 h-3.5 w-3.5 shrink-0 -translate-x-1 text-primary opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                                        aria-hidden
                                    />
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
