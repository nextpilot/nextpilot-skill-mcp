import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Code2,
  Download,
  FileCode2,
  GitPullRequest,
  Layers3,
  ShieldCheck,
  Terminal,
  Upload,
} from "lucide-react";
import { LocalizedText } from "@/components/LocalizedText";

export const metadata: Metadata = {
  title: "帮助文档 · NextPilot Skill MCP",
  description: "了解 Skill、MCP，学习编写、开发、提交、下载和使用方法。",
};

const chapters = [
  {
    number: "01",
    icon: BookOpen,
    title: "先认识两个概念",
    en: "Start with the basics",
    content: [
      ["Skill", "Skill 是一组可复用的任务说明、提示词、输入输出约定和领域经验。它告诉模型应该如何完成一类工作，但不会自动获得执行外部操作的权限。", "A Skill is a reusable set of task instructions, prompts, I/O conventions, and domain expertise. It guides the model without granting external access by itself."],
      ["MCP", "MCP（Model Context Protocol）是一种连接 AI 与外部工具、数据源的协议。MCP Server 暴露工具，客户端按协议发现并调用它们。", "MCP (Model Context Protocol) connects AI to external tools and data. An MCP Server exposes tools that clients can discover and call."],
    ],
  },
  {
    number: "02",
    icon: FileCode2,
    title: "编写一个 Skill",
    en: "Write a Skill",
    content: [
      ["明确任务", "先写清楚使用场景、输入、输出和限制条件。一个好的 Skill 应该能被另一个人复现，而不是只依赖作者的上下文。", "Define the use case, inputs, outputs, and constraints first. A good Skill should be reproducible without the author's private context."],
      ["给出示例", "至少提供一组真实输入和期望输出，说明异常输入应该如何处理。涉及飞控时，必须写明适用平台和安全边界。", "Provide at least one real input and expected output, including failure behavior. For flight control, document the target platform and safety boundaries."],
    ],
  },
  {
    number: "03",
    icon: Code2,
    title: "开发一个 MCP Server",
    en: "Build an MCP Server",
    content: [
      ["定义工具", "每个工具都应有清晰的名称、参数 Schema、返回值和错误行为。优先设计只读工具，再考虑写入或控制能力。", "Give every tool a clear name, parameter schema, return value, and error behavior. Design read-only tools before write or control actions."],
      ["接入客户端", "使用 TypeScript MCP SDK 或其他官方 SDK 实现协议层，先在本地客户端中测试工具发现、参数校验和超时行为。", "Use the TypeScript MCP SDK or another official SDK. Test discovery, validation, and timeout behavior in a local client first."],
    ],
  },
  {
    number: "04",
    icon: Upload,
    title: "提交到平台",
    en: "Submit to the hub",
    content: [
      ["准备材料", "补全名称、描述、分类、适用平台、依赖模型、输入输出示例、开源地址、许可证和实测效果。", "Complete the name, description, category, platforms, model dependencies, I/O examples, source URL, license, and measured results."],
      ["提交审核", "提交前检查原创性、许可证兼容性和敏感数据。涉及真实载具的能力必须默认只读，并明确仿真优先。", "Check originality, license compatibility, and sensitive data before submitting. Capabilities involving real aircraft must be read-only by default, with simulation preferred."],
    ],
  },
  {
    number: "05",
    icon: Download,
    title: "下载与使用",
    en: "Download and use",
    content: [
      ["选择 Skill", "从 Skill 库按分类或关键词找到合适内容，先阅读适用平台、依赖和安全说明。", "Find a suitable Skill by category or keyword, then read its platform, dependency, and safety notes first."],
      ["导入工作流", "复制 Skill 的核心提示词或按页面提供的格式导入到你的 AI 客户端，再用示例输入做一次小范围验证。", "Copy the core prompt or use the provided import format in your AI client, then run a small validation with the example input."],
    ],
  },
];

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
      <header className="max-w-3xl">
        <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <BookOpen className="h-4 w-4" />
          <LocalizedText zh="Getting started" en="Getting started" />
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-text sm:text-6xl">
          <LocalizedText zh="从一个 Skill 开始。" en="Start with one Skill." />
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-muted sm:text-lg">
          <LocalizedText
            zh="用最短路径了解 Skill 与 MCP，学会把一个想法写成可复用能力，再把它接入自己的 AI 工作流。"
            en="Learn Skill and MCP fundamentals, turn an idea into a reusable capability, and connect it to your own AI workflow."
          />
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/skills" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-strong">
            <LocalizedText zh="浏览 Skill 库" en="Browse skills" />
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="#submit" className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text hover:border-primary">
            <LocalizedText zh="查看提交清单" en="View submission checklist" />
          </Link>
        </div>
      </header>

      <div className="mt-14 grid gap-5 lg:grid-cols-[1fr_0.72fr]">
        <main className="space-y-4">
          {chapters.map((chapter) => {
            const Icon = chapter.icon;
            return (
              <section key={chapter.number} className="rounded-xl border border-border bg-surface p-5 sm:p-7">
                <div className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-mono text-xs text-primary">{chapter.number}</span>
                      <h2 className="text-lg font-semibold text-text">
                        <LocalizedText zh={chapter.title} en={chapter.en} />
                      </h2>
                    </div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      {chapter.content.map(([label, text, enText]) => (
                        <div key={label} className="border-l-2 border-primary/30 pl-4">
                          <h3 className="text-sm font-semibold text-text">{label}</h3>
                          <p className="mt-1.5 text-sm leading-6 text-muted"><LocalizedText zh={text} en={enText} /></p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </main>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <Layers3 className="h-4 w-4 text-primary" />
              <LocalizedText zh="它们如何协作" en="How they work together" />
            </div>
            <div className="mt-5 space-y-3 text-sm">
              {[
                ["Skill", "描述能力与工作方式", "Describes the capability"],
                ["MCP Server", "提供可调用的工具", "Provides callable tools"],
                ["AI 客户端", "理解任务并选择调用", "Chooses tools for a task"],
              ].map(([name, zh, en], index) => (
                <div key={name} className="flex items-start gap-3">
                  <span className="mt-0.5 font-mono text-xs text-primary">0{index + 1}</span>
                  <div><p className="font-medium text-text">{name}</p><p className="mt-0.5 text-xs text-muted"><LocalizedText zh={zh} en={en} /></p></div>
                </div>
              ))}
            </div>
          </section>

          <section id="submit" className="rounded-xl border border-primary/25 bg-primary/5 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <LocalizedText zh="提交前检查" en="Before you submit" />
            </div>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              {["名称和一句话描述清楚", "输入输出示例可复现", "平台、模型和许可证已填写", "不包含密钥、GPS 或个人数据", "涉及致动时默认只读"].map((item) => (
                <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-border bg-surface-2 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-text"><ShieldCheck className="h-4 w-4 text-primary" /><LocalizedText zh="飞控安全原则" en="Flight safety principle" /></div>
            <p className="mt-3 text-sm leading-6 text-muted"><LocalizedText zh="平台不直接致动真实载具。涉及 arm、模式切换或任务执行的能力，应优先在仿真环境验证，并设置显式安全门禁。" en="The platform never directly actuates real aircraft. Validate arm, mode changes, and missions in simulation first, with explicit safety gates." /></p>
          </section>
        </aside>
      </div>

      <section className="mt-14 border-t border-border pt-10">
        <div className="grid gap-4 sm:grid-cols-3">
          <GuideLink href="/skills" icon={<Download className="h-4 w-4" />} zh="下载一个 Skill" en="Download a skill" />
          <GuideLink href="/analyze" icon={<Terminal className="h-4 w-4" />} zh="分析一份 PX4 日志" en="Analyze a PX4 log" />
          <GuideLink href="/skills?category=toolchain" icon={<GitPullRequest className="h-4 w-4" />} zh="探索 MCP 工具" en="Explore MCP tools" />
        </div>
      </section>
    </div>
  );
}

function GuideLink({ href, icon, zh, en }: { href: string; icon: React.ReactNode; zh: string; en: string }) {
  return <Link href={href} className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-sm text-text hover:border-primary"><span className="text-primary">{icon}</span><LocalizedText zh={zh} en={en} /><ArrowRight className="ml-auto h-4 w-4 text-muted transition-transform group-hover:translate-x-1" /></Link>;
}
