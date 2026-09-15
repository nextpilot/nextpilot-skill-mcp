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

/**
 * Markdown 正文渲染。与 `GuideMdx`（MDX）的区别在于解析器：
 * 知识文档里有 `{invalid_frac:.0%}`、`meta/<tag>.json` 这类写法——MDX 会把花括号当
 * JSX 表达式、尖括号当标签，普通 markdown 则原样输出，正是这些文档需要的。
 */
export function GuideMarkdown({ source }: { source: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkDropComments]} components={components}>
      {source}
    </ReactMarkdown>
  );
}
