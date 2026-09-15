import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LocalizedText } from "@/components/LocalizedText";
import { headingId, splitHeading } from "@/lib/heading";

/**
 * 标题子节点还原成原始文本。行内代码要补回反引号：
 * 右侧目录用 `lib/guide` 从**原始 markdown** 抽标题，两边的锚点必须算得一模一样，
 * 否则 `### 6.3 …（`foreach`）` 这类标题点不动。
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

const components = { h2: H2, h3: H3, table: Table };

/**
 * Markdown 正文渲染。与 `GuideMdx`（MDX）的区别在于解析器：
 * 知识文档是从 `knowledge/` 派生过来的机器产物，正文里有 `{invalid_frac:.0%}`、
 * `meta/<tag>.json` 这类写法——MDX 会把花括号当 JSX 表达式、尖括号当标签，
 * 普通 markdown 则原样输出，正是这些文档需要的。
 */
export function GuideMarkdown({ source }: { source: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{source}</ReactMarkdown>;
}
