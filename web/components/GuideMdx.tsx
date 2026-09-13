import { MDXRemote } from "next-mdx-remote/rsc";
import { LocalizedText } from "@/components/LocalizedText";
import { En, Zh } from "@/components/Bilingual";
import { headingId, splitHeading } from "@/lib/heading";

/** 标题子节点取出纯文本，供拆分中英文与生成锚点 */
function textOf(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(textOf).join("");
  return "";
}

/**
 * h2/h3 覆写：把 `## 中文 | English` 拆成两种语言并补上 id。
 * 拆分与 id 规则来自 lib/heading，和右侧目录共用，改一处两边一起变。
 */
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

/**
 * 指南 MD 的渲染组件表。
 *
 * 写内容时的两条硬约束（踩过）：
 * 1. `<Zh>` / `<En>` 必须独占一行，前后留空行；写成单行 `<Zh>text</Zh>` 时
 *    内部只有行内 JSX 生效，`**加粗**` 会原样输出星号。
 * 2. 表格单元格里不要放 `<Zh>` / `<En>`——MDX 无法解析含 JSX 的 GFM 管道表格，
 *    整张表会退化成一行纯文本。双语对照改用列表（见 basics.mdx）。
 */
const components = { h2: H2, h3: H3, Zh, En, Callout };

export function GuideMdx({ source }: { source: string }) {
  return <MDXRemote source={source} components={components} />;
}
