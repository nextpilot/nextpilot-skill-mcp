"use client";

import { useState } from "react";
import {
    Check,
    ChevronLeft,
    ChevronRight,
    Copy,
    Eye,
    FileText,
    Folder,
    FolderOpen,
    History,
    MessageSquare,
    Pencil,
} from "lucide-react";
import { contentHostLabel } from "@/lib/constants";
import type { SkillFile } from "@/lib/types";

type TabKey = "overview" | "files" | "changelog" | "comments";

/**
 * 详情页内容区 Tab。Skill 与 MCP 两类条目共用（`/skills/[slug]` 与 `/mcp/[slug]`）。
 *
 * 为什么叫 `Entry*` 而不是 `Skill*`：`Skill` 是其中一类内容的名字，导航里
 * 「Skill 技能」与「MCP 服务」是并列的两类。这个组件两类都在用，叫 `SkillContentTabs`
 * 就等于宣称它只服务 Skill，于是给 MCP 页面用的时候要么说谎，要么复制一份
 * `McpContentTabs`（那样就长出一对只差前缀的孪生组件，改一边漏一边）。
 * 家族名取的是两类共有的上位词"收录条目"，见 CLAUDE.md 的命名约定。
 *
 * Skill 的内容 Tab 各对应 `web/content/skills/<slug>/` 下的文件，所以每个 Tab
 * 都能给出那一份文件的仓库编辑入口：改哪份就跳哪份，不让人在仓库里自己找。
 * 概述 / 版本给人看；「文件」Tab 是整个 Skill 目录的文件浏览器（树形列表 +
 * 点击打开原文），给 AI 用的 SKILL.md 打开后带一段「这是什么」的说明和一键复制
 * （复制的就是能直接放进 `.claude/skills/` 的那份文件内容）。
 *
 * MCP 条目走的是另一份规范（server.json，不是 SKILL.md），没有文件浏览这层，
 * 只给 readme / changelog 两个编辑入口，不传 `files` 就没有「文件」Tab。
 */

/* ---------- 「文件」Tab：目录树 + 点击打开（参考 skillhub.cn 的文件浏览器） ---------- */

function fmtSize(n: number): string {
    if (n < 1024) return `${n} B`;
    return `${(n / 1024).toFixed(1)} KB`;
}

interface TreeNode {
    name: string;
    /** 相对 skill 目录的路径；目录不含尾部斜杠 */
    path: string;
    isDir: boolean;
    file?: SkillFile;
    children: TreeNode[];
}

function buildTree(files: SkillFile[]): TreeNode[] {
    const root: TreeNode = { name: "", path: "", isDir: true, children: [] };
    for (const f of files) {
        const parts = f.path.split("/");
        let cur = root;
        for (let i = 0; i < parts.length - 1; i++) {
            const p = parts.slice(0, i + 1).join("/");
            let next = cur.children.find((c) => c.isDir && c.path === p);
            if (!next) {
                next = { name: parts[i], path: p, isDir: true, children: [] };
                cur.children.push(next);
            }
            cur = next;
        }
        cur.children.push({
            name: parts[parts.length - 1],
            path: f.path,
            isDir: false,
            file: f,
            children: [],
        });
    }
    const sort = (nodes: TreeNode[]) => {
        nodes.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
        for (const n of nodes) sort(n.children);
    };
    sort(root.children);
    return root.children;
}

function FileBrowser({ files }: { files: SkillFile[] }) {
    // 默认停在列表态；点了哪个文件就整个面板换成那份原文，返回按钮回去
    const [openPath, setOpenPath] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [copied, setCopied] = useState(false);

    const open = openPath ? files.find((f) => f.path === openPath) : undefined;

    async function copyOpen() {
        if (!open) return;
        try {
            await navigator.clipboard.writeText(open.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            /* 剪贴板不可用 */
        }
    }

    function toggleDir(p: string) {
        setCollapsed((s) => {
            const next = new Set(s);
            if (next.has(p)) next.delete(p);
            else next.add(p);
            return next;
        });
    }

    const tree = buildTree(files);

    function renderNodes(nodes: TreeNode[], depth: number): React.ReactNode {
        return nodes.map((n) => {
            const indent = { paddingLeft: `${8 + depth * 14}px` };
            if (n.isDir) {
                const isCollapsed = collapsed.has(n.path);
                return (
                    <div key={n.path}>
                        <button
                            type="button"
                            onClick={() => toggleDir(n.path)}
                            aria-expanded={!isCollapsed}
                            className="flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-sm text-text transition-colors hover:bg-surface-2"
                            style={indent}
                        >
                            <ChevronRight
                                className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                            />
                            {isCollapsed ? (
                                <Folder className="h-4 w-4 shrink-0 text-muted" />
                            ) : (
                                <FolderOpen className="h-4 w-4 shrink-0 text-muted" />
                            )}
                            <span className="truncate font-medium">{n.name}/</span>
                        </button>
                        {!isCollapsed && renderNodes(n.children, depth + 1)}
                    </div>
                );
            }
            const active = openPath === n.path;
            return (
                <button
                    key={n.path}
                    type="button"
                    onClick={() => setOpenPath(n.path)}
                    className={`flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-sm transition-colors ${
                        active ? "bg-primary/10 font-medium text-primary" : "text-text hover:bg-surface-2"
                    }`}
                    style={indent}
                >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{n.name}</span>
                    <span className="ml-auto shrink-0 pl-2 text-xs text-muted">{fmtSize(n.file!.size)}</span>
                </button>
            );
        });
    }

    if (open) {
        return (
            <div>
                <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <button
                        type="button"
                        onClick={() => setOpenPath(null)}
                        className="btn-ghost shrink-0 px-2.5 py-1.5 text-xs"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        文件列表
                    </button>
                    <span className="min-w-0 truncate font-mono text-[13px] text-muted">{open.path}</span>
                    <span className="shrink-0 text-xs text-muted">{fmtSize(open.size)}</span>
                    <button
                        type="button"
                        onClick={() => void copyOpen()}
                        className="btn-ghost ml-auto shrink-0 px-3 py-1.5 text-xs"
                    >
                        {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? "已复制" : "复制"}
                    </button>
                </div>
                {open.path === "SKILL.md" && (
                    <p className="mb-3 text-xs text-muted">
                        这是 AI 实际读到的指令原文。整个目录拷进 <code className="font-mono">.claude/skills/</code>{" "}
                        即可作为 Skill 加载。
                    </p>
                )}
                <pre className="max-h-[32rem] overflow-auto rounded-xl border border-border bg-surface-2 p-4 font-mono text-xs leading-6">
                    {open.content}
                </pre>
            </div>
        );
    }

    return (
        <div>
            <p className="mb-2 text-xs text-muted">共 {files.length} 个文件，点击文件名查看原文</p>
            <div className="rounded-xl border border-border p-1.5">{renderNodes(tree, 0)}</div>
        </div>
    );
}

/* ---------- Tab 骨架 ---------- */

export function EntryContentTabs({
    overview,
    files,
    changelog,
    comments,
    changelogCount,
    editUrls,
}: {
    overview: React.ReactNode;
    /** Skill 目录下的文本文件（SKILL.md / README / evals / scripts…）；不给则不显示「文件」Tab */
    files?: SkillFile[];
    changelog: React.ReactNode;
    comments: React.ReactNode;
    changelogCount: number;
    /** 各 Tab 对应的仓库编辑地址；哪份给了才显示编辑入口 */
    editUrls?: { readme?: string; skillMd?: string; changelog?: string };
}) {
    const [tab, setTab] = useState<TabKey>("overview");

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
            label: "版本",
            icon: <History className="h-3.5 w-3.5" />,
            count: changelogCount,
            editUrl: editUrls?.changelog,
        },
        { key: "comments", label: "评论", icon: <MessageSquare className="h-3.5 w-3.5" /> },
    ];
    // 「文件」这层只有 Skill 有（整个目录的文件浏览器），插在「概述」后面，与阅读顺序一致；
    // 编辑入口指向 SKILL.md，目录里最常改的主文件
    if (files?.length) {
        tabs.splice(1, 0, {
            key: "files",
            label: "文件",
            icon: <FileText className="h-3.5 w-3.5" />,
            editUrl: editUrls?.skillMd,
        });
    }

    const active = tabs.find((t) => t.key === tab);

    // 编辑入口：桌面端与 tab 同行（-mb-px 对齐底线）。移动端不渲染：tab 行下方
    // 再挂一行链接在手机上显得杂，且手机上也没有"顺手去仓库改文件"的场景。
    const desktopEditLink = active?.editUrl ? (
        <a
            href={active.editUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1 pb-2 text-xs text-muted transition-colors hover:text-primary sm:inline-flex"
        >
            <Pencil className="h-3 w-3" />
            {`在 ${contentHostLabel()} 上编辑本页`}
        </a>
    ) : null;

    return (
        <section>
            <div className="border-b border-border">
                {/* 移动端：tab 等宽铺满一行、藏图标、active 用居中短下划线（参考 skillhub.cn
          的详情页），390px 下四个 tab 一屏全见，不用滑动，点按面积也大。
          桌面端（sm+）：回到「图标 + 自然宽度 + 放不下横向滑」，编辑入口同行右端。 */}
                <div
                    className="grid border-b border-border sm:flex sm:gap-1 sm:overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    // 列数跟 tab 数走：Skill 4 个、MCP 3 个（无「文件」），写死 grid-cols-4
                    // 会让 MCP 的 tab 挤在左边、空一列。桌面端 sm:flex 后该属性自然失效。
                    style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
                >
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            className={`relative flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap px-1 py-2.5 text-sm transition-colors sm:mb-[-1px] sm:inline-flex sm:shrink-0 sm:justify-start sm:border-b-2 sm:px-3 ${
                                tab === t.key
                                    ? "font-medium text-text sm:border-primary"
                                    : "text-muted hover:text-text sm:border-transparent"
                            }`}
                        >
                            <span className="hidden sm:inline">{t.icon}</span>
                            <span className="truncate">{t.label}</span>
                            {typeof t.count === "number" && t.count > 0 && (
                                <span className="text-xs text-muted">{t.count}</span>
                            )}
                            {/* 移动端 active 短条：略窄于格子、居中，压在容器 border 上 */}
                            {tab === t.key && (
                                <span className="absolute inset-x-5 bottom-0 hidden h-0.5 rounded-full bg-primary max-sm:block" />
                            )}
                        </button>
                    ))}
                    {/* 桌面端编辑入口与 tab 同行右端；移动端不出编辑入口 */}
                    {desktopEditLink && (
                        <div className="hidden -mb-px sm:ml-auto sm:block sm:shrink-0 sm:pl-3">{desktopEditLink}</div>
                    )}
                </div>
            </div>

            <div className="pt-6">
                {tab === "overview" && overview}
                {tab === "files" && files && <FileBrowser files={files} />}
                {tab === "changelog" && changelog}
                {tab === "comments" && comments}
            </div>
        </section>
    );
}
