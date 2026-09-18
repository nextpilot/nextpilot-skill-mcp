import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MDXRemote } from "next-mdx-remote/rsc";
import { LocalizedText } from "@/components/LocalizedText";
import { En, Zh } from "@/components/Bilingual";
import { headingId, splitHeading } from "@/lib/heading";
import type { GuideDoc } from "@/lib/guide";

/**
 * 指南正文。**一个入口、两个解析器**——选哪个由**文件扩展名**决定（`lib/guide.ts` 的
 * `renderer`），不在这里判断：
 *
 * - `.md`（`content/guide/knowledge-*.md`，由 `knowledge/px4/` 派生）→ react-markdown。
 *   那些文档里有 `{invalid_frac:.0%}`、`meta/<tag>.json` 这类内容，MDX 会把花括号当
 *   JSX 表达式、尖括号当标签，**必须**按普通 markdown 原样输出。
 * - `.mdx`（手写页面）→ MDX，可用 `<Callout>` / `<Zh>` / `<En>`。
 *
 * 这两条路曾经各占一个文件（`GuideMarkdown.tsx` / `GuideMdx.tsx`），两个名字只差一个
 * 字母、读起来像「基础版 / 升级版」——于是看起来 MDX 那份是超集，可以把另一份删掉。
 * **恰好相反**：普通 markdown 那份才是不能删的那份（见上面第一条）。合并成一个文件、
 * 把这条注释贴在分发点上，就是为了不再有人做那个方向反了的"简化"。
 */
export function GuideBody({
  renderer,
  source,
}: {
  renderer: GuideDoc["renderer"];
  source: string;
}) {
  if (renderer === "md") {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkDropComments]}
        components={markdownComponents}
      >
        {source}
      </ReactMarkdown>
    );
  }
  return <MDXRemote source={source} components={mdxComponents} />;
}

/**
 * 标题子节点还原成**原始 markdown 文本**。注意 `H2`/`H3` 渲染的就是这串文本本身
 * （不是 `children`），所以它错了两样一起错。两条约束：
 *
 * 1. **必须递归进元素把文本捞出来**。少了这步，`### 6.3 …（`foreach`）` 里的 `foreach`
 *    会整个消失——锚点 id 和显示文字一起错。原来的 `GuideMdx` 那份 3 行 stub 就是只认
 *    string / 数组、对任何元素返回 `""`，于是 `.mdx` 标题里的行内代码会静默丢掉。
 * 2. 行内代码补回反引号，让显示文字与原始 markdown 一致。**反引号不影响锚点 id**：
 *    `headingId` 把所有非字母数字折叠成 `-`，`` `foreach` `` 与 `foreach` 归一成同一个 id。
 *    别把这两件事混在一起——1 是正确性问题，2 只是显示保真。
 *
 * 判据 `node.type === "code"` 对**两个**解析器都成立：MDX 编译产物把未覆写的标签映射成
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
 * 注意 remark 插件是工厂：外层是 attacher，真正的 transformer 由它返回。
 *
 * 只有普通 markdown 这条路需要它——`knowledge-*.md` 带 HTML 注释，`.mdx` 不带。
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
  // 字段表动不动十几列，窄屏必须能横滚，否则整页被撑破
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
  // 正文卡片是 surface，插入块用 surface-2 才是「凹陷块」，层级才分得开
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
 * MDX 专用组件表。写内容时的两条硬约束（踩过）：
 * 1. `<Zh>` / `<En>` 必须独占一行，前后留空行；写成单行 `<Zh>text</Zh>` 时
 *    内部只有行内 JSX 生效，`**加粗**` 会原样输出星号。
 * 2. 表格单元格里不要放 `<Zh>` / `<En>`——MDX 无法解析含 JSX 的 GFM 管道表格，
 *    整张表会退化成一行纯文本。双语对照改用列表（见 basics.mdx）。
 */
const mdxComponents = { h2: H2, h3: H3, Zh, En, Callout };
