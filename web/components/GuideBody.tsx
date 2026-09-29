import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MDXRemote } from "next-mdx-remote/rsc";
import { LocalizedText } from "@/components/LocalizedText";
import { En, Zh } from "@/components/Bilingual";
import { headingId, splitHeading } from "@/lib/heading";
import type { GuideDoc } from "@/lib/guide";

/*
 * 指南正文。一个入口、两个解析器，选哪个由文件扩展名决定（`lib/guide.ts` 的 `renderer`）：
 *
 * - `.md`（`knowledge/px4/` 派生的那些）→ react-markdown：里面有 `{invalid_frac:.0%}`、
 *   `meta/<tag>.json` 这类内容，MDX 会把花括号当 JSX 表达式、尖括号当标签。
 * - `.mdx`（手写页面）→ MDX，可用 `<Callout>` / `<Zh>` / `<En>`。
 *
 * 这两条路曾经各占一个文件（`GuideMarkdown.tsx` / `GuideMdx.tsx`），名字只差一个字母，
 * 看着像"基础版 / 升级版"，容易被当成超集删掉普通 markdown 那份 —— 恰好相反，那份不能删。
 * 两条路共用 `sharedRemarkPlugins`，各写一份清单就是下次分叉的起点。
 */

/**
 * 两个解析器共用的 remark 插件（各写一份就是下次分叉的起点）。
 *
 * 缺 `remark-gfm` 的后果是静默降级：GFM 管道表格在 CommonMark 里不是表格，
 * 整块退化成"一段带竖线的普通段落"，不报错，页面上只是"排版有点怪"。
 * `.md` 那条路一直传它，`.mdx` 漏了，于是 `.mdx` 里的表格全部失效（构建期有守卫盯着 MDX 侧）。
 */
const sharedRemarkPlugins = [remarkGfm];

export function GuideBody({ renderer, source }: { renderer: GuideDoc["renderer"]; source: string }) {
    if (renderer === "md") {
        return (
            <ReactMarkdown remarkPlugins={[...sharedRemarkPlugins, remarkDropComments]} components={markdownComponents}>
                {source}
            </ReactMarkdown>
        );
    }
    return (
        <MDXRemote
            source={source}
            components={mdxComponents}
            options={{ mdxOptions: { remarkPlugins: sharedRemarkPlugins } }}
        />
    );
}

/**
 * 标题子节点还原成原始 markdown 文本。`H2`/`H3` 渲染的就是这串文本本身（不是 `children`），
 * 所以它错了两样一起错。两条约束：
 *
 * 1. 要递归进元素把文本捞出来，否则 `### 6.3 …（`foreach`）` 里的 `foreach` 整个消失，
 *    锚点 id 和显示文字一起错（原来的 3 行 stub 只认 string / 数组，对任何元素返回 `""`）。
 * 2. 行内代码补回反引号，让显示文字与原始 markdown 一致。反引号不影响锚点 id：
 *    `headingId` 把所有非字母数字折叠成 `-`。1 是正确性问题，2 只是显示保真。
 *
 * 判据 `node.type === "code"` 对两个解析器都成立：MDX 编译产物把未覆写的标签映射成字符串，
 * react-markdown 也输出内建标签名。
 */
function textOf(node: React.ReactNode): string {
    if (typeof node === "string") return node;
    if (typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (React.isValidElement(node)) {
        const inner = textOf((node.props as { children?: React.ReactNode }).children);
        return node.type === "code" ? `\`${inner}\`` : inner;
    }
    return "";
}

interface MdNode {
    type?: string;
    value?: string;
    children?: MdNode[];
}

/**
 * 去掉 HTML 注释节点。markdown 规范里注释不显示，但 react-markdown 不解析原生 HTML，
 * 会把 `<!-- ... -->` 当普通文本转义出来。只删 html 节点，行内代码与围栏代码块里的同名文本
 * 是 code 节点，不受影响。remark 插件是工厂：外层是 attacher，transformer 由它返回。
 * 只有普通 markdown 这条路需要它（`knowledge-*.md` 带 HTML 注释，`.mdx` 不带）。
 */
function remarkDropComments() {
    return function drop(tree: MdNode) {
        if (!Array.isArray(tree.children)) return;
        tree.children = tree.children.filter(
            (child) => !(child?.type === "html" && /^\s*<!--[\s\S]*?-->\s*$/.test(child.value ?? "")),
        );
        for (const child of tree.children) drop(child);
    };
}

/** h2/h3 覆写：把 `## 中文 | English` 拆成两种语言并补上 id。两个解析器共用。 */
function H2({ children }: { children?: React.ReactNode }) {
    const { zh, en } = splitHeading(textOf(children));
    return (
        <h2 id={headingId(zh)}>
            <LocalizedText zh={zh} en={en} />
        </h2>
    );
}

function H3({ children }: { children?: React.ReactNode }) {
    const { zh, en } = splitHeading(textOf(children));
    return (
        <h3 id={headingId(zh)}>
            <LocalizedText zh={zh} en={en} />
        </h3>
    );
}

function Table({ children }: { children?: React.ReactNode }) {
    // 字段表动不动十几列，窄屏得能横滚，否则整页被撑破
    return (
        <div className="overflow-x-auto">
            <table>{children}</table>
        </div>
    );
}

function Callout({
    tone = "neutral",
    title,
    titleEn,
    children,
}: {
    tone?: "neutral" | "primary" | "warning";
    title: string;
    titleEn?: string;
    children?: React.ReactNode;
}) {
    // 正文卡片是 surface，插入块用 surface-2 才像「凹陷块」，层级才分得开
    const tones = {
        neutral: "border-border bg-surface-2",
        primary: "border-primary/25 bg-primary/5",
        warning: "border-warning/30 bg-warning/5",
    }[tone];

    return (
        <div className={`my-6 rounded-xl border p-4 sm:p-5 ${tones}`}>
            {/* 用 div 而非 p：.prose-guide p 会给段落加 my-4，标题行不需要 */}
            <div className="mb-2 text-sm font-semibold text-text">
                <LocalizedText zh={title} en={titleEn ?? title} />
            </div>
            <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{children}</div>
        </div>
    );
}

const markdownComponents = { h2: H2, h3: H3, table: Table };

/**
 * MDX 专用组件表。`table` 得有：`.md` 侧有 `Table` 覆写，`.mdx` 侧漏了就没有横向滚动的
 * 外框，字段表十几列会把窄屏整页撑破（两侧组件表要对着看）。
 *
 * 约束只剩两条，都能被构建期拦下：组件名要在这个表里（否则运行期 `_missingMdxReference`
 * 直接抛），以及 GFM 表格的一行要是完整的一行（单元格里塞不下跨行的 JSX，
 * 双语对照要写两列或改用列表）。
 *
 * 曾经写着的两条"硬约束"已实测证伪，别再捡回来：一是"表格单元格里不能放 `<Zh>`/`<En>`，
 * 否则整张表退化成纯文本" —— 退化与 JSX 无关，真凶是这条路漏传 `remark-gfm`；
 * 二是"单行 `<Zh>text</Zh>` 里的 `**加粗**` 会原样输出星号" —— 未复现。
 */
const mdxComponents = { h2: H2, h3: H3, table: Table, Zh, En, Callout };
