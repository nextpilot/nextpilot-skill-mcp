"use client";

import { useState } from "react";
import { Check, Copy, Eye, FileText, History, MessageSquare, Pencil } from "lucide-react";
import { contentHostLabel } from "@/lib/constants";

type TabKey = "overview" | "skill" | "changelog" | "comments";

/**
 * 详情页内容区 Tab。**Skill 与 MCP 两类条目共用**（`/skills/[slug]` 与 `/mcp/[slug]`）。
 *
 * 为什么叫 `Entry*` 而不是 `Skill*`：`Skill` 是其中**一类**内容的名字，导航里
 * 「Skill 技能」与「MCP 服务」是并列的两类。这个组件两类都在用，叫 `SkillContentTabs`
 * 就等于宣称它只服务 Skill——于是给 MCP 页面用的时候要么说谎，要么复制一份
 * `McpContentTabs`（那样就长出一对只差前缀的孪生组件，改一边漏一边）。
 * 家族名取的是两类共有的上位词"收录条目"，见 CLAUDE.md 的命名约定。
 *
 * Skill 的三个内容 Tab 各对应 `web/content/skills/<slug>/` 下的一份文件，所以每个 Tab
 * 都能给出**那一份文件**的仓库编辑入口——改哪份就跳哪份，不让人在仓库里自己找
 * （三份文件用途不同，一律指向"编辑本 Skill"是没法下手的）。
 * 概述 / 版本历史给人看，SKILL.md 给 AI 看（原文展示 + 一键复制，复制的就是
 * 能直接放进 `.claude/skills/` 的那份文件内容）。
 *
 * MCP 条目虽已拆成目录，但走的是另一份规范（server.json，不是 SKILL.md），
 * 所以它只给 readme / changelog 两个编辑入口，SKILL.md 那个 Tab 不会出现。
 */
export function EntryContentTabs({
    overview,
    skillMdRaw,
    changelog,
    comments,
    changelogCount,
    editUrls,
}: {
    overview: React.ReactNode;
    /** SKILL.md 全文；不给则不显示该 Tab */
    skillMdRaw?: string;
    changelog: React.ReactNode;
    comments: React.ReactNode;
    changelogCount: number;
    /** 各 Tab 对应的仓库编辑地址；哪份给了才显示编辑入口 */
    editUrls?: { readme?: string; skillMd?: string; changelog?: string };
}) {
    const [tab, setTab] = useState<TabKey>("overview");
    const [copied, setCopied] = useState(false);

    async function copySkill() {
        if (!skillMdRaw) return;
        try {
            await navigator.clipboard.writeText(skillMdRaw);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            /* 剪贴板不可用 */
        }
    }

    const tabs: {
        key: TabKey;
        label: string;
        icon: React.ReactNode;
        count?: number;
        editUrl?: string;
    }[] = [
        {
            key: "overview",
            label: "概述",
            icon: <Eye className="h-3.5 w-3.5" />,
            editUrl: editUrls?.readme,
        },
        {
            key: "changelog",
            label: "版本历史",
            icon: <History className="h-3.5 w-3.5" />,
            count: changelogCount,
            editUrl: editUrls?.changelog,
        },
        { key: "comments", label: "评论", icon: <MessageSquare className="h-3.5 w-3.5" /> },
    ];
    // SKILL.md 这一层只有 Skill 有，插在「概述」后面，与左栏的阅读顺序一致
    if (skillMdRaw) {
        tabs.splice(1, 0, {
            key: "skill",
            label: "SKILL.md",
            icon: <FileText className="h-3.5 w-3.5" />,
            editUrl: editUrls?.skillMd,
        });
    }

    const active = tabs.find((t) => t.key === tab);

    // 编辑入口渲染成两份：桌面端与 tab 同行（-mb-px 对齐底线），移动端挪到 tab 行下方
    // 单独一行右对齐 —— 390px 下 4 个 tab 加一条编辑链接塞一行，每个按钮都会被压到
    // 文字竖排断行（概/述、版/本/历/史），底线随之参差不齐。
    const editLink = active?.editUrl ? (
        <a
            href={active.editUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 pb-2 text-xs text-muted transition-colors hover:text-primary"
        >
            <Pencil className="h-3 w-3" />
            {`在 ${contentHostLabel()} 上编辑本页`}
        </a>
    ) : null;

    return (
        <section>
            <div className="border-b border-border">
                <div className="flex items-center justify-between gap-3">
                    {/* tab 行：窄屏放不下时横向滑动，按钮 nowrap + shrink-0 禁止被压缩断行。
              min-w-0 让滑动区在 flex 里可收缩；-mb-px 会溢出 1px 竖向空间，
              滚动条直接隐藏（滑动本身不受影响），避免 Windows 桌面窄窗口出一条丑滚动条 */}
                    <div className="-mb-px flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {tabs.map((t) => (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => setTab(t.key)}
                                className={`-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                                    tab === t.key
                                        ? "border-primary font-medium text-text"
                                        : "border-transparent text-muted hover:text-text"
                                }`}
                            >
                                {t.icon}
                                {t.label}
                                {typeof t.count === "number" && t.count > 0 && (
                                    <span className="text-xs text-muted">{t.count}</span>
                                )}
                            </button>
                        ))}
                    </div>
                    {editLink && <div className="-mb-px hidden shrink-0 sm:block">{editLink}</div>}
                </div>
                {/* 移动端编辑入口：tab 行下方右对齐，不与 tab 抢宽度 */}
                {editLink && <div className="flex justify-end pt-1.5 sm:hidden">{editLink}</div>}
            </div>

            <div className="pt-6">
                {tab === "overview" && overview}
                {tab === "skill" && (
                    <div>
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-xs text-muted">
                                这是 AI 实际读到的指令原文。整个目录拷进{" "}
                                <code className="font-mono">.claude/skills/</code> 即可作为 Skill 加载。
                            </p>
                            <button
                                type="button"
                                onClick={() => void copySkill()}
                                className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
                            >
                                {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
                                {copied ? "已复制" : "复制 SKILL.md"}
                            </button>
                        </div>
                        <pre className="max-h-[32rem] overflow-auto rounded-xl border border-border bg-surface-2 p-4 font-mono text-xs leading-6">
                            {skillMdRaw}
                        </pre>
                    </div>
                )}
                {tab === "changelog" && changelog}
                {tab === "comments" && comments}
            </div>
        </section>
    );
}
