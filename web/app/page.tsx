import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Check,
  FileSearch,
  Layers,
  MessageSquareText,
  Microscope,
  Radar,
  ShieldCheck,
  Upload,
  Zap,
} from "lucide-react";
import { getSkillIndex } from "@/lib/skills";
import { getMcpIndex } from "@/lib/mcp";
import { CATEGORIES } from "@/lib/constants";
import { SkillCard } from "@/components/SkillCard";
import { HomeLeaderboards } from "@/components/HomeLeaderboards";
import { LocalizedText } from "@/components/LocalizedText";

const CHECKS: { name: string; en: string; field: string }[] = [
  { name: "振动与 IMU 削波", en: "Vibration & clipping", field: "vehicle_imu_status.accel_vibration_metric" },
  { name: "EKF 创新检验", en: "EKF innovation", field: "estimator_status.innovation_check_flags" },
  { name: "电源与电压跌落", en: "Power & voltage sag", field: "battery_status.cell_voltage[]" },
  { name: "GPS 健康度与跳变", en: "GPS health", field: "vehicle_gps_position.eph / satellites_used" },
  { name: "电机输出平衡", en: "Motor balance", field: "actuator_motors.control[]" },
  { name: "陀螺零偏漂移", en: "Gyro bias drift", field: "estimator_sensor_bias.gyro_bias[]" },
  { name: "姿态跟踪与振荡", en: "Attitude tracking", field: "vehicle_attitude_setpoint.q_d[]" },
  { name: "失效保护与模式抖动", en: "Failsafe & mode thrash", field: "vehicle_status.failsafe / nav_state" },
  { name: "空速与 VTOL 转换", en: "Airspeed & VTOL transition", field: "airspeed_validated / vtol_vehicle_status" },
  { name: "机载记录消息", en: "Logged messages", field: "logged_messages" },
];

const COVERAGE: { label: string; value: string }[] = [
  { label: "确定性检查项", value: "15" },
  { label: "故障知识库条目（含根因与排查步骤）", value: "10" },
  { label: "识别飞行阶段", value: "7" },
  { label: "支持固件", value: "PX4 1.15+ / 旧版字段自适应" },
];

const CATEGORY_EMOJI: Record<string, string> = {
  perception: "👁️",
  decision: "🧭",
  control: "🎛️",
  toolchain: "🧰",
};

const CATEGORY_ACCENT: Record<string, string> = {
  perception: "border-t-primary shadow-[0_-3px_12px_-3px_rgba(24,121,78,0.12)]",
  decision: "border-t-primary/70 shadow-[0_-3px_12px_-3px_rgba(24,121,78,0.08)]",
  control: "border-t-primary/50 shadow-[0_-3px_12px_-3px_rgba(24,121,78,0.06)]",
  toolchain: "border-t-primary/30 shadow-[0_-3px_12px_-3px_rgba(24,121,78,0.04)]",
};

export default function HomePage() {
  const skills = getSkillIndex();
  const mcps = getMcpIndex();
  const featured = skills.filter((s) => s.featured).slice(0, 6);
  const totalSkills = skills.length;
  const totalMcps = mcps.length;

  return (
    <div>
      {/* ============ Hero ============ */}
      <section className="relative overflow-hidden border-b border-border">
        {/* 点阵 + 渐变背景 */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(24,121,78,0.07) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
            backgroundPosition: "-2px -2px",
          }}
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent"
          aria-hidden
        />

        <div className="page-shell relative py-20 lg:py-28">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_360px] lg:gap-16">
            {/* 左：文案 */}
            <div>
              {/* 标签 pill */}
              <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.05] px-4 py-1.5">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-[12px] font-medium text-primary">
                  <LocalizedText
                    zh="NextPilot AI 技术社区 · 专为飞控系统优化的 Skill / MCP 平台"
                    en="Flight AI community · Skill / MCP platform"
                  />
                </span>
              </div>

              <h1 className="max-w-xl text-[38px] leading-[1.08] font-bold tracking-[-0.03em] text-text sm:text-[50px] lg:text-[58px]">
                <LocalizedText
                  zh="让飞行器理解世界"
                  en="Help aircraft understand the world"
                />
              </h1>

              <p className="mt-6 max-w-lg text-[16px] leading-7 text-muted">
                <LocalizedText
                  zh="连接感知、决策、控制与工具链。用社区 Skill 加速实验，用确定性规则读懂每一次飞行。"
                  en="Connect perception, decisions, control and tooling. Move faster with community skills and deterministic flight checks."
                />
              </p>

              {/* CTA 按钮 */}
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/analyze"
                  className="btn-primary px-5 py-2.5 text-[15px]"
                >
                  <FileSearch className="h-[18px] w-[18px]" />
                  <LocalizedText zh="在线分析 PX4 日志" en="Analyze a PX4 log" />
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/skills"
                  className="btn-ghost px-5 py-2.5 text-[15px]"
                >
                  <LocalizedText zh="浏览 Skill 技能库" en="Browse skills" />
                </Link>
              </div>

              {/* 信任标记 */}
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
                <li className="flex items-center gap-1.5 text-xs text-muted">
                  <Check className="h-3.5 w-3.5 text-ok" />
                  <LocalizedText zh="原始日志不上传" en="Raw logs stay local" />
                </li>
                <li className="flex items-center gap-1.5 text-xs text-muted">
                  <Check className="h-3.5 w-3.5 text-ok" />
                  <LocalizedText zh="规则引擎负责判断" en="Rules make the judgment" />
                </li>
                <li className="flex items-center gap-1.5 text-xs text-muted">
                  <Check className="h-3.5 w-3.5 text-ok" />
                  <LocalizedText zh="开源社区驱动" en="Open source community" />
                </li>
              </ul>
            </div>

            {/* 右：雷达装饰图 */}
            <div className="hidden items-center justify-center lg:flex">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/[0.06] blur-3xl" />
                <svg
                  viewBox="0 0 300 300"
                  className="relative h-64 w-64 text-primary/25 lg:h-72 lg:w-72"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden
                >
                  {[130, 100, 70, 40].map((r, i) => (
                    <circle
                      key={r}
                      cx="150"
                      cy="150"
                      r={r}
                      strokeWidth={0.5 + i * 0.25}
                      opacity={0.25 + i * 0.12}
                    />
                  ))}
                  <line x1="20" y1="150" x2="280" y2="150" strokeWidth="0.5" opacity="0.18" />
                  <line x1="150" y1="20" x2="150" y2="280" strokeWidth="0.5" opacity="0.18" />
                  <line x1="58" y1="58" x2="242" y2="242" strokeWidth="0.3" opacity="0.12" />
                  <line x1="242" y1="58" x2="58" y2="242" strokeWidth="0.3" opacity="0.12" />
                  <path
                    d="M150,150 L150,20 A130,130 0 0,1 280,150 Z"
                    fill="currentColor"
                    opacity="0.06"
                  />
                  {[
                    { cx: 195, cy: 105, r: 3.5 },
                    { cx: 115, cy: 185, r: 3 },
                    { cx: 230, cy: 175, r: 2.5 },
                    { cx: 135, cy: 110, r: 2 },
                  ].map((d, i) => (
                    <circle
                      key={i}
                      cx={d.cx}
                      cy={d.cy}
                      r={d.r}
                      fill="currentColor"
                      opacity={0.45 - i * 0.06}
                      stroke="none"
                    />
                  ))}
                  <circle cx="150" cy="150" r="5" fill="currentColor" opacity="0.65" stroke="none" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 数据面板 ============ */}
      <section className="border-b border-border bg-surface-2/60">
        <div className="page-shell py-10">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <StatItem
              value={totalSkills}
              labelZh="社区 Skill"
              labelEn="Skills"
              icon={<Layers className="h-4 w-4" />}
            />
            <StatItem
              value={totalMcps}
              labelZh="MCP 服务"
              labelEn="MCP servers"
              icon={<Radar className="h-4 w-4" />}
            />
            <StatItem
              labelZh="支持平台"
              labelEn="Platforms"
              icon={<Boxes className="h-4 w-4" />}
            >
              <span className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
                PX4<span className="mx-0.5 text-muted">+</span>AP
              </span>
            </StatItem>
            <StatItem
              value={totalSkills + totalMcps}
              labelZh="内容条目"
              labelEn="Items"
              icon={<Zap className="h-4 w-4" />}
              suffix="+"
            />
          </div>
        </div>
      </section>

      {/* ============ 分类卡片 ============ */}
      <section className="border-b border-border">
        <div className="page-shell py-16 lg:py-20">
          <div className="mb-10 text-center">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Explore the stack
            </p>
            <h2 className="text-2xl font-semibold tracking-[-0.01em] sm:text-3xl">
              <LocalizedText zh="从想法到起飞" en="From idea to flight" />
            </h2>
            <p className="mt-3 text-[15px] text-muted">
              <LocalizedText
                zh="四个维度，覆盖完整飞行链路"
                en="Four dimensions for the full flight stack"
              />
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((c) => {
              const inCategory = skills.filter((s) => s.category === c.key);
              return (
                <Link
                  key={c.key}
                  href={`/skills?category=${c.key}`}
                  className={`card group flex flex-col border-t-2 p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong ${CATEGORY_ACCENT[c.key] ?? ""}`}
                >
                  <span className="text-[28px] leading-none">
                    {CATEGORY_EMOJI[c.key] ?? "📦"}
                  </span>
                  <h3 className="mt-4 font-semibold text-text">
                    <LocalizedText zh={c.label} en={c.key} />
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-muted">
                    <LocalizedText zh={c.desc} en={c.desc} />
                  </p>
                  <div className="mt-5 border-t border-border pt-4">
                    <span className="text-xs font-semibold text-primary">
                      <LocalizedText
                        zh={
                          inCategory.length > 0
                            ? `${inCategory.length} 个 Skill`
                            : "选题规划中"
                        }
                        en={
                          inCategory.length > 0
                            ? `${inCategory.length} skills`
                            : "Planned"
                        }
                      />
                    </span>
                    <span className="mt-1.5 block text-[11px] leading-5 text-faint">
                      {c.topics.slice(0, 3).join(" · ")}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ How It Works ============ */}
      <section className="border-b border-border">
        <div className="page-shell py-16 lg:py-20">
          <div className="mb-10 text-center">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              How it works
            </p>
            <h2 className="text-2xl font-semibold tracking-[-0.01em] sm:text-3xl">
              <LocalizedText zh="三步读懂你的飞行" en="Understand your flight in 3 steps" />
            </h2>
            <p className="mt-3 text-[15px] text-muted">
              <LocalizedText
                zh="原始日志全程留在浏览器，只提交结构化结果"
                en="Raw logs never leave your browser — only structured results are submitted"
              />
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <StepCard
              step="01"
              icon={<Upload className="h-5 w-5" />}
              title="上传飞控日志"
              titleEn="Upload flight log"
              desc="选择 PX4 .ulg 文件（ArduPilot .bin 后续支持），文件全程留在你的浏览器中，不上传服务器。"
              descEn="Select your PX4 .ulg file (ArduPilot .bin coming soon). Files stay in your browser — never uploaded."
            />
            <StepCard
              step="02"
              icon={<Microscope className="h-5 w-5" />}
              title="确定性引擎分析"
              titleEn="Deterministic analysis"
              desc="Pyodide (WASM Python) 在 Web Worker 中运行 pyulog 解析引擎，执行 15 项确定性检查，输出结构化 JSON。"
              descEn="Pyodide runs pyulog in a Web Worker. 15 deterministic checks produce structured JSON findings."
            />
            <StepCard
              step="03"
              icon={<MessageSquareText className="h-5 w-5" />}
              title="中文诊断报告"
              titleEn="Diagnostic report"
              desc="LLM 将结构化结果翻译为通俗中文，每条结论可回指到具体字段和官方文档，不编造数值。"
              descEn="LLM translates findings into plain language. Every conclusion traces back to a specific field and official docs."
            />
          </div>
        </div>
      </section>

      {/* ============ 精选 Skill ============ */}
      {featured.length > 0 && (
        <section className="border-b border-border bg-surface-2/40">
          <div className="page-shell py-16">
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                  Selected skills
                </p>
                <h2 className="text-2xl font-semibold tracking-[-0.01em]">
                  <LocalizedText zh="精选 Skill" en="Selected skills" />
                </h2>
              </div>
              <Link
                href="/skills"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                <LocalizedText zh="查看全部" en="View all" />
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((s) => (
                <SkillCard key={s.slug} skill={s} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============ 热门内容 ============ */}
      <HomeLeaderboards
        skills={skills.map((s) => ({ slug: s.slug, name: s.name, downloads: s.downloads }))}
        mcps={mcps.map((m) => ({ slug: m.slug, name: m.name, downloads: m.downloads }))}
      />

      {/* ============ 日志分析覆盖 ============ */}
      <section className="border-b border-border">
        <div className="page-shell py-16">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Deterministic checks
              </p>
              <h2 className="text-2xl font-semibold tracking-[-0.01em]">
                <LocalizedText
                  zh="日志里真正被检查的东西"
                  en="What actually gets checked"
                />
              </h2>
            </div>
            <span className="hidden text-sm text-muted sm:block">
              <LocalizedText
                zh="每条结论都能回指到字段、阈值和官方文档"
                en="Every finding points back to a field, a threshold and a doc"
              />
            </span>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <ul className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
                {CHECKS.map((c) => (
                  <li key={c.name} className="bg-surface p-4 transition-colors hover:bg-surface-2/70">
                    <p className="text-sm font-medium text-text">
                      <LocalizedText zh={c.name} en={c.en} />
                    </p>
                    <p className="mt-1.5 font-mono text-[11px] leading-5 break-all text-faint">
                      {c.field}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-5 text-muted">
                <LocalizedText
                  zh="解析与检查全部在你的浏览器里完成，服务端只收到结构化的检查结果。PX4 1.15 前后字段体系不同，引擎按固件版本自动切换字段。"
                  en="Parsing and checking happen in your browser; the server only receives structured findings. Field names differ before/after PX4 1.15 and the engine switches by firmware version."
                />
              </p>
            </div>

            <div className="card flex flex-col p-5">
              <h3 className="text-sm font-semibold text-text">
                <LocalizedText zh="覆盖范围" en="Coverage" />
              </h3>
              <dl className="mt-4 space-y-3.5">
                {COVERAGE.map((s) => (
                  <div key={s.label}>
                    <dt className="text-xs text-muted">{s.label}</dt>
                    <dd
                      className={
                        /^\d+$/.test(s.value)
                          ? "mt-0.5 text-2xl font-semibold tracking-[-0.02em] text-text"
                          : "mt-1 text-sm font-medium text-text"
                      }
                    >
                      {s.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <Link
                href="/analyze"
                className="btn-primary mt-6 w-full"
              >
                <FileSearch className="h-4 w-4" />
                <LocalizedText zh="上传日志试试" en="Try it with a log" />
              </Link>
              <p className="mt-3 text-[11px] leading-5 text-faint">
                <LocalizedText
                  zh="匿名每日 3 次、登录后每日 10 次，全部免费。"
                  en="3 free runs a day anonymously, 10 when signed in."
                />
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 应用场景 ============ */}
      <section className="border-b border-border bg-surface-2/40">
        <div className="page-shell py-16">
          <div className="mb-10 text-center">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Use cases
            </p>
            <h2 className="text-2xl font-semibold tracking-[-0.01em] sm:text-3xl">
              <LocalizedText zh="应用场景" en="Use cases" />
            </h2>
            <p className="mt-3 text-[15px] text-muted">
              <LocalizedText
                zh="从科研到工业，覆盖多种飞控场景"
                en="From research to industry, covering diverse flight control scenarios"
              />
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ScenarioCard
              emoji="🌾"
              title="精准农业"
              titleEn="Precision agriculture"
              desc="作物健康巡检、变量喷洒、地块测绘。用 AI Skill 分析航拍图像，自动识别病虫害和长势异常。"
              descEn="Crop health inspection, variable-rate spraying, field mapping. AI Skills analyze aerial imagery for pest and growth anomalies."
            />
            <ScenarioCard
              emoji="🔍"
              title="电力巡检"
              titleEn="Power line inspection"
              desc="输电线路自动巡检、绝缘子破损检测。日志分析确保每次飞行后飞控状态健康，避免坠机风险。"
              descEn="Automated power line patrol, insulator defect detection. Post-flight log analysis ensures FC health and prevents crash risks."
            />
            <ScenarioCard
              emoji="🚁"
              title="科研实验"
              titleEn="Research & development"
              desc="高校飞控实验室快速验证新算法。Skill Hub 提供可复现的 prompt 和模型，加速论文实验。"
              descEn="University flight labs rapidly validate new algorithms. Skill Hub provides reproducible prompts and models to accelerate research."
            />
            <ScenarioCard
              emoji="🛟"
              title="应急救援"
              titleEn="Search & rescue"
              desc="灾区快速建图、被困人员搜索。LLM 自主导航 Skill 让无人机在无 GPS 环境下自主飞行。"
              descEn="Rapid disaster mapping, survivor search. LLM autonomous navigation Skills enable GPS-denied flight."
            />
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="border-b border-border">
        <div className="page-shell py-16 text-center">
          <h2 className="text-2xl font-semibold tracking-[-0.01em] sm:text-3xl">
            <LocalizedText zh="准备好分析你的飞行日志了吗？" en="Ready to analyze your flight log?" />
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-7 text-muted">
            <LocalizedText
              zh="匿名每天免费 3 次，登录后每天 10 次。上传 .ulg 文件，30 秒出中文诊断报告。"
              en="3 free runs daily anonymously, 10 when signed in. Upload a .ulg file and get a diagnostic report in 30 seconds."
            />
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/analyze" className="btn-primary px-6 py-3 text-[15px]">
              <FileSearch className="h-[18px] w-[18px]" />
              <LocalizedText zh="免费分析日志" en="Analyze for free" />
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/skills" className="btn-ghost px-6 py-3 text-[15px]">
              <LocalizedText zh="浏览社区 Skill" en="Browse skills" />
            </Link>
          </div>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2">
            <li className="flex items-center gap-1.5 text-xs text-muted">
              <Check className="h-3.5 w-3.5 text-ok" />
              <LocalizedText zh="无需安装" en="No installation" />
            </li>
            <li className="flex items-center gap-1.5 text-xs text-muted">
              <Check className="h-3.5 w-3.5 text-ok" />
              <LocalizedText zh="数据不上传" en="Data stays local" />
            </li>
            <li className="flex items-center gap-1.5 text-xs text-muted">
              <Check className="h-3.5 w-3.5 text-ok" />
              <LocalizedText zh="30 秒出报告" en="Report in 30s" />
            </li>
          </ul>
        </div>
      </section>

      {/* ============ 平台原则 ============ */}
      <section className="bg-surface-2/40">
        <div className="page-shell py-16">
          <div className="mb-8 text-center">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Principles
            </p>
            <h2 className="text-2xl font-semibold tracking-[-0.01em]">
              <LocalizedText zh="平台原则" en="Principles" />
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Principle
              icon={<ShieldCheck className="h-4 w-4" />}
              title="确定性引擎是唯一真相来源"
              titleEn="Deterministic engine as single source of truth"
              desc="数值判断全部由规则引擎完成，每条结论可溯源到字段、阈值和官方文档，LLM 只做翻译。"
              descEn="All numerical judgments are made by the rule engine. Every conclusion traces back to a field, threshold and official documentation. LLM only translates."
            />
            <Principle
              icon={<FileSearch className="h-4 w-4" />}
              title="日志在你的浏览器里解析"
              titleEn="Logs parsed in your browser"
              desc=".ulg 文件经 Pyodide 在本地解析，原始日志不上传服务器，仅提交结构化检查结果。"
              descEn=".ulg files are parsed locally via Pyodide. Raw logs never leave your machine—only structured findings are submitted."
            />
            <Principle
              icon={<Boxes className="h-4 w-4" />}
              title="永不直接致动真实载具"
              titleEn="Never actuate real vehicles"
              desc="平台不提供 arm/disarm 等致动托管能力；相关内容仅以开源 Skill + 三重门禁形式存在。"
              descEn="No arm/disarm or actuation hosting. Related content exists only as open-source Skills behind triple safety gates."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

/* ============ 辅助组件 ============ */

function StatItem({
  value,
  labelZh,
  labelEn,
  icon,
  suffix,
  children,
}: {
  value?: string | number;
  labelZh: string;
  labelEn: string;
  icon: React.ReactNode;
  suffix?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted">
        {icon}
      </span>
      <div>
        <div className="text-2xl font-bold tracking-[-0.02em] text-text sm:text-3xl">
          {children ?? (
            <>
              {value}
              {suffix ? (
                <span className="text-base font-medium text-muted">{suffix}</span>
              ) : null}
            </>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted">
          <LocalizedText zh={labelZh} en={labelEn} />
        </div>
      </div>
    </div>
  );
}

function StepCard({
  step,
  icon,
  title,
  titleEn,
  desc,
  descEn,
}: {
  step: string;
  icon: React.ReactNode;
  title: string;
  titleEn: string;
  desc: string;
  descEn: string;
}) {
  return (
    <div className="card group relative overflow-hidden p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <span className="absolute right-4 top-4 font-mono text-[40px] font-bold leading-none text-surface-2 select-none">
        {step}
      </span>
      <span className="relative z-10 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-2 text-primary">
        {icon}
      </span>
      <h3 className="relative z-10 mt-5 font-semibold text-text">
        <LocalizedText zh={title} en={titleEn} />
      </h3>
      <p className="relative z-10 mt-2 text-sm leading-6 text-muted">
        <LocalizedText zh={desc} en={descEn} />
      </p>
    </div>
  );
}

function ScenarioCard({
  emoji,
  title,
  titleEn,
  desc,
  descEn,
}: {
  emoji: string;
  title: string;
  titleEn: string;
  desc: string;
  descEn: string;
}) {
  return (
    <div className="card group p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <span className="text-[28px] leading-none">{emoji}</span>
      <h3 className="mt-4 font-semibold text-text">
        <LocalizedText zh={title} en={titleEn} />
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted">
        <LocalizedText zh={desc} en={descEn} />
      </p>
    </div>
  );
}

function Principle({
  icon,
  title,
  titleEn,
  desc,
  descEn,
}: {
  icon: React.ReactNode;
  title: string;
  titleEn: string;
  desc: string;
  descEn: string;
}) {
  return (
    <div className="card group p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted">
        {icon}
      </span>
      <h3 className="mt-4 font-semibold text-text">
        <LocalizedText zh={title} en={titleEn} />
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted">
        <LocalizedText zh={desc} en={descEn} />
      </p>
    </div>
  );
}