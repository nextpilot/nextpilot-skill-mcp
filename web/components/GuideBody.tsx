import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MDXRemote } from "next-mdx-remote/rsc";
import { LocalizedText } from "@/components/LocalizedText";
import { En, Zh } from "@/components/Bilingual";
import { headingId, splitHeading } from "@/lib/heading";
import type { GuideDoc } from "@/lib/guide";

/*
 * 指南正文。一个入口、两个解析器，选哪个由文件扩展名决定（`lib/guide.ts` 的
 * `renderer`），不在这里判断：
 *
 * - `.md`（由 `knowledge/px4/` 派生的那些文档）→ react-markdown。
 *   那些文档里有 `{invalid_frac:.0%}`、`meta/<tag>.json` 这类内容，MDX 会把花括号当
 *   JSX 表达式、尖括号当标签，所以要按普通 markdown 原样输出。
 * - `.mdx`（手写页面）→ MDX，可用 `<Callout>` / `<Zh>` / `<En>`。
 *
 * 这两条路曾经各占一个文件（`GuideMarkdown.tsx` / `GuideMdx.tsx`），两个名字只差一个
 * 字母、读起来像「基础版 / 升级版」，于是看起来 MDX 那份是超集，可以把另一份删掉。
 * 恰好相反：普通 markdown 那份是不能删的那份（见上面第一条）。合并成一个文件、
 * 把这条注释贴在分发点上，就是为了不再有人做那个方向反了的"简化"。
 *
 * 两条路还要共用同一份 remark 插件，各写一份清单就是下一次分叉的起点，
 * 而少一个扩展的后果是静默降级（见 `sharedRemarkPlugins`）。
 */

/**
 * 两个解析器共用的 remark 插件。写成一份而不是各写一份，是因为"各写一份"就是
 * 这两条路的通用缺陷形状：两份清单一分叉，就只有一边是新的（见文件头）。
 *
 * 缺 `remark-gfm` 的后果值得单独记住：GFM 管道表格在 CommonMark 里不是表格，
 * 整块会退化成"一段带竖线的普通段落"，不报错、不抛异常，页面上只是"排版有点怪"。
 * 2026-09-19 线上就是这个症状：`/guide/rule-schema` 的 5 张表全渲染成了原文。
 *
 * `.md` 那条路一直在传它，所以从没露馅；`.mdx` 那条路漏了，而 MDX 的默认管线只有
 * CommonMark（`@mdx-js/mdx@3` 的依赖里根本没有 `remark-gfm`），于是 `.mdx` 里的表格
 * 全部失效。所以插件要共用，而且构建期有一道守卫盯着 MDX 侧的调用点（§[14]）。
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
 * 标题子节点还原成原始 markdown 文本。注意 `H2`/`H3` 渲染的就是这串文本本身
 * （不是 `children`），所以它错了两样一起错。两条约束：
 *
 * 1. 要递归进元素把文本捞出来。少了这步，`### 6.3 …（`foreach`）` 里的 `foreach`
 *    会整个消失，锚点 id 和显示文字一起错。原来的 `GuideMdx` 那份 3 行 stub 就是只认
 *    string / 数组、对任何元素返回 `""`，于是 `.mdx` 标题里的行内代码会静默丢掉。
 * 2. 行内代码补回反引号，让显示文字与原始 markdown 一致。反引号不影响锚点 id：
 *    `headingId` 把所有非字母数字折叠成 `-`，`` `foreach` `` 与 `foreach` 归一成同一个 id。
 *    别把这两件事混在一起，1 是正确性问题，2 只是显示保真。
 *
 * 判据 `node.type === "code"` 对两个解析器都成立：MDX 编译产物把未覆写的标签映射成
 * 字符串（实测 `_components = { code: "code" }`），react-markdown 也输出内建标签名。
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
 * 去掉 HTML 注释节点。markdown 规范里注释是不显示的，但 react-markdown 不解析原生 HTML，
 * 会把 `<!-- ... -->` 当普通文本转义出来（页面上就多出一行 `<!-- BEGIN:operators -->`）。
 * 只删 html 节点，行内代码与围栏代码块里的同名文本是 code 节点，不受影响。
 * 注意 remark 插件是工厂：外层是 attacher，transformer 由它返回。
 *
 * 只有普通 markdown 这条路需要它：`knowledge-*.md` 带 HTML 注释，`.mdx` 不带。
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
 * MDX 专用组件表。`table` 得有：`.md` 侧有 `Table` 覆写，`.mdx` 侧漏了就没有
 * 横向滚动的外框，字段表十几列会把窄屏整页撑破（两侧组件表要对着看）。
 *
 * 关于 `<Zh>` / `<En>`，这里原先写着两条"硬约束"，2026-09-19 逐条实测后都不成立，
 * 留着会继续误导写内容的人（原文与实测结论都记在下面，免得被当成"曾经的真理"再捡回来）：
 *
 * · 原文说「表格单元格里不要放 `<Zh>`/`<En>`，MDX 无法解析含 JSX 的 GFM 表格，整张表
 *   会退化成一行纯文本」。误诊。用真实入口（`compileMDX` + `renderToStaticMarkup`）
 *   跑单元格内联 `<Zh>`：表格正常成表、`<Zh>` 挂得上组件、内部 `**加粗**` 也照样加粗。
 *   当时确实"退化"了，但跟 JSX 无关，真凶是 `.mdx` 这条路漏传 `remark-gfm`
 *   （见 `sharedRemarkPlugins`），不含 JSX 的表格一样退化。锅记错了对象，
 *   代价是写内容的人从此绕开表格。
 * · 原文说「写成单行 `<Zh>text</Zh>` 时内部 `**加粗**` 会原样输出星号，必须独占一行」。
 *   同样没复现：单行内联一样渲染出 `<strong>`。`basics.mdx` 里那几处用 HTML
 *   `<strong>` 是照这条规则写的，不是必需，但也不必为它专门返工。
 *
 * 所以现在约束只剩两条，都是能被构建期拦下的：组件名要在这个表里（否则
 * 运行期 `_missingMdxReference` 直接抛），以及 GFM 表格的一行要是完整的一行，
 * 单元格里塞不下跨行的 JSX，双语对照要写两列或改用列表。
 */
const mdxComponents = { h2: H2, h3: H3, table: Table, Zh, En, Callout };
