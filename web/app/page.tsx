import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Check,
  ChevronRight,
  FileSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getSkillIndex } from "@/lib/skills";
import { CATEGORIES } from "@/lib/constants";
import { SkillCard } from "@/components/SkillCard";
import { LocalizedText } from "@/components/LocalizedText";

export default function HomePage() {
  const skills = getSkillIndex();
  const featured = skills.filter((s) => s.featured).slice(0, 6);

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border/80">
        <div className="absolute -top-32 right-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-20">
          <div>
            <div className="mb-7 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-4 w-4" />
              <LocalizedText zh="飞控 AI 技术交流 / Skill MCP 平台" en="Flight AI community / Skill MCP platform" />
            </div>
            <h1 className="max-w-3xl text-5xl leading-[1.04] font-semibold tracking-tight text-text sm:text-7xl">
              <LocalizedText zh="让飞行器" en="Help aircraft" />
              <br />
              <span className="text-primary"><LocalizedText zh="理解世界。" en="understand the world." /></span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-muted sm:text-lg">
              <LocalizedText zh="把感知、决策、控制和工具链连接起来。用社区 Skill 加速实验，用确定性规则读懂每一次飞行。" en="Connect perception, decisions, control and tools. Move faster with community skills and deterministic flight checks." />
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/analyze"
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 hover:bg-primary-strong"
            >
              <FileSearch className="h-4 w-4" />
              <LocalizedText zh="在线分析 PX4 日志" en="Analyze a PX4 log" />
            </Link>
            <Link
              href="/skills"
              className="flex items-center gap-2 rounded-lg border border-border bg-surface/70 px-5 py-3 text-sm text-text transition-colors hover:border-primary"
            >
              <LocalizedText zh="浏览 Skill 库" en="Browse skills" />
              <ArrowRight className="h-4 w-4" />
            </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /><LocalizedText zh="原始日志不上传" en="Raw logs stay local" /></span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /><LocalizedText zh="规则引擎负责判断" en="Rules make the judgment" /></span>
            </div>
          </div>

          <div className="relative rounded-2xl border border-border bg-surface p-5 shadow-xl shadow-primary/5 sm:p-7">
            <div className="absolute -right-2 -top-2 rounded-full border border-primary/30 bg-surface px-2.5 py-1 text-[10px] font-semibold tracking-widest text-primary">
              LOCAL FIRST
            </div>
            <div className="mb-8 flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-muted">Flight log check</p>
                <h2 className="mt-2 text-xl font-semibold text-text"><LocalizedText zh="飞行健康度" en="Flight health" /></h2>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
            <div className="mb-6 flex items-end justify-between border-b border-border pb-6">
              <div><span className="text-5xl font-semibold tracking-tight text-text">3</span><span className="ml-2 text-sm text-muted"><LocalizedText zh="项基础检查" en="baseline checks" /></span></div>
              <span className="rounded-full bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok"><LocalizedText zh="可开始" en="Ready" /></span>
            </div>
            <div className="space-y-4">
              {[["振动 / IMU 削波", "VIBRATION"], ["EKF 创新检验", "ESTIMATOR"], ["电源电压跌落", "POWER"]].map(([label, code]) => (
                <div key={code} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-3 text-text"><span className="h-2 w-2 rounded-full bg-primary" />{label}</span>
                  <span className="font-mono text-[10px] tracking-wider text-muted">{code}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 flex items-center justify-between rounded-lg bg-surface-2 px-3.5 py-3 text-xs text-muted">
              <span>Pyodide · Web Worker</span><ChevronRight className="h-4 w-4 text-primary" />
            </div>
          </div>
        </div>
      </section>

      {/* 分类 */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">Explore the stack</p><h2 className="text-2xl font-semibold text-text"><LocalizedText zh="从想法到起飞" en="From idea to flight" /></h2></div>
          <span className="hidden text-sm text-muted sm:block"><LocalizedText zh="四个维度，覆盖完整飞行链路" en="Four dimensions for the full flight stack" /></span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((c, i) => (
            <Link
              key={c.key}
              href={`/skills?category=${c.key}`}
              className="group rounded-xl border border-border bg-surface p-5 transition-all hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Boxes className="h-4.5 w-4.5 transition-transform group-hover:scale-110" />
              </div>
              <p className="text-xs text-muted">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-1 font-semibold text-text">{c.label}</h3>
              <p className="mt-1 text-sm text-muted">{c.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 精选 */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-text"><LocalizedText zh="精选 Skill" en="Featured skills" /></h2>
          <Link
            href="/skills"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <LocalizedText zh="查看全部" en="View all" /> <ArrowRight className="h-3.5 w-3.5" />
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
