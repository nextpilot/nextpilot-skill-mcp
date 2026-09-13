import Link from "next/link";
import { ArrowRight, FileSearch, Boxes, ShieldCheck } from "lucide-react";
import { getSkillIndex } from "@/lib/skills";
import { CATEGORIES } from "@/lib/constants";
import { SkillCard } from "@/components/SkillCard";

export default function HomePage() {
  const skills = getSkillIndex();
  const featured = skills.filter((s) => s.featured).slice(0, 6);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/80">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.12),transparent_55%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 text-center">
          <p className="mb-4 inline-block rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
            飞控 × AI · Skill / MCP 交流分享平台
          </p>
          <h1 className="mx-auto max-w-2xl text-4xl leading-tight font-bold tracking-tight text-white sm:text-5xl">
            让无人机 / 飞行器
            <span className="text-primary">更智能</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-muted">
            按「感知 → 决策 → 控制 → 工具链」组织飞控 AI Skill；内置确定性日志分析服务，
            规则引擎负责判断，AI 只负责解释。
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/analyze"
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-[#06121d] transition-colors hover:bg-sky-300"
            >
              <FileSearch className="h-4 w-4" />
              在线分析 PX4 日志
            </Link>
            <Link
              href="/skills"
              className="flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm text-white transition-colors hover:border-primary/50"
            >
              浏览 Skill 库
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* 分类 */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="mb-6 text-xl font-semibold">四个维度组织内容</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((c, i) => (
            <Link
              key={c.key}
              href={`/skills?category=${c.key}`}
              className="rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary/50"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Boxes className="h-4.5 w-4.5" />
              </div>
              <p className="text-xs text-muted">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-1 font-semibold">{c.label}</h3>
              <p className="mt-1 text-sm text-muted">{c.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 精选 */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">精选 Skill</h2>
          <Link
            href="/skills"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            查看全部 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((s) => (
            <SkillCard key={s.slug} skill={s} />
          ))}
        </div>
      </section>

      {/* 平台原则 */}
      <section className="border-t border-border/80 bg-surface/40">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:grid-cols-3">
          <Principle
            icon={<ShieldCheck className="h-5 w-5" />}
            title="确定性引擎是唯一真相来源"
            desc="数值判断全部由规则引擎完成，每条结论可溯源到字段、阈值和官方文档，LLM 只做翻译。"
          />
          <Principle
            icon={<FileSearch className="h-5 w-5" />}
            title="日志在你的浏览器里解析"
            desc=".ulg 文件经 Pyodide 在本地解析，原始日志不上传服务器，仅提交结构化检查结果。"
          />
          <Principle
            icon={<Boxes className="h-5 w-5" />}
            title="永不直接致动真实载具"
            desc="平台不提供 arm/disarm 等致动托管能力；相关内容仅以开源 Skill + 三重门禁形式存在。"
          />
        </div>
      </section>
    </div>
  );
}

function Principle({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mb-1.5 font-semibold">{title}</h3>
      <p className="text-sm leading-6 text-muted">{desc}</p>
    </div>
  );
}
