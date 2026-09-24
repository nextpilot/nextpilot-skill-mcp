import { Link } from "@/i18n/routing";
import {
    ArrowRight,
    BookOpen,
    Check,
    Database,
    FileSearch,
    ListChecks,
    MessageSquareText,
    Microscope,
    Upload,
    Wrench,
    Zap,
} from "lucide-react";
import { getSkillIndex } from "@/lib/skills";
import { getMcpIndex } from "@/lib/mcp";
import { CATEGORIES } from "@/lib/constants";
import { SkillCard } from "@/components/SkillCard";
import { McpCard } from "@/components/McpCard";
import { LocalizedText } from "@/components/LocalizedText";
import { HeroIllustration } from "@/components/HeroIllustration";

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
    { label: "支持固件", value: "PX4 1.15+ / ArduPilot 4.x" },
];

/** 「知识库」小节的四张卡：引擎背后的经验都在仓库 knowledge/ 下，一条经验一个文件 */
const KNOWLEDGE: { icon: React.ReactNode; title: string; titleEn: string; desc: string; descEn: string }[] = [
    {
        icon: <ListChecks className="h-4 w-4" />,
        title: "检查规则",
        titleEn: "Check rules",
        desc: "一条经验一个 YAML：阈值、适用固件与机架、判定表达式、官方文档出处都写在里面，可评审、可回归。",
        descEn: "One YAML per piece of experience: thresholds, applicable firmware and vehicle, the decision expression and the doc reference.",
    },
    {
        icon: <BookOpen className="h-4 w-4" />,
        title: "故障知识库",
        titleEn: "Fault knowledge base",
        desc: "命中的异常标签匹配到故障模式，直接给出可能根因与排查步骤，而不是只报一个越限的数字。",
        descEn: "Matched tags map to fault patterns with likely root causes and troubleshooting steps — not just a number over a threshold.",
    },
    {
        icon: <Wrench className="h-4 w-4" />,
        title: "固件自适应",
        titleEn: "Firmware-aware",
        desc: "PX4 1.15 前后字段体系不同（如零偏拆成独立 topic），引擎按日志里的固件版本自动切换字段绑定。",
        descEn: "Field layouts differ before and after PX4 1.15; the engine switches field bindings by the firmware version in the log.",
    },
    {
        icon: <Database className="h-4 w-4" />,
        title: "参数元数据",
        titleEn: "Parameter metadata",
        desc: "参数的范围、单位与说明按需拉取，与固件分支对应；界面如实标注来源，未知项不猜。",
        descEn: "Parameter ranges, units and descriptions are fetched on demand for the matching firmware branch; unknown entries are left blank.",
    },
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
    // 这一节叫「精选 Skill 和 MCP」，两类都要有：MCP 侧按 featured 取，没有标记就退化为评分最高的两个
    const featuredMcp = (() => {
        const marked = mcps.filter((m) => m.featured);
        return (marked.length > 0 ? marked : mcps).slice(0, 3);
    })();

    return (
        <div>
            {/* ============ Hero ============ */}
            <section className="relative overflow-hidden border-b border-border">
                {/* 点阵 + 渐变背景 */}
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: "radial-gradient(circle, rgba(24,121,78,0.07) 1px, transparent 1px)",
                        backgroundSize: "26px 26px",
                        backgroundPosition: "-2px -2px",
                    }}
                    aria-hidden
                />
                <div
                    className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent"
                    aria-hidden
                />

                <div className="page-shell relative pt-20 pb-12 lg:pt-28 lg:pb-14">
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
                                <LocalizedText zh="让飞行器理解世界" en="Help aircraft understand the world" />
                            </h1>

                            <p className="mt-6 max-w-lg text-[16px] leading-7 text-muted">
                                <LocalizedText
                                    zh="连接感知、决策、控制与工具链。用社区 Skill 加速实验，用确定性规则读懂每一次飞行。"
                                    en="Connect perception, decisions, control and tooling. Move faster with community skills and deterministic flight checks."
                                />
                            </p>

                            {/* CTA 按钮 */}
                            <div className="mt-8 flex flex-wrap items-center gap-3">
                                <Link href="/analyze" className="btn-primary px-5 py-2.5 text-[15px]">
                                    <FileSearch className="h-[18px] w-[18px]" />
                                    <LocalizedText zh="在线分析飞控日志" en="Analyze a flight log" />
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                                <Link href="/skills" className="btn-ghost px-5 py-2.5 text-[15px]">
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

                        {/* 右：站内主题插画（航迹 + 波形 + 检查结论卡，见 HeroIllustration） */}
                        <div className="hidden items-center justify-center lg:flex">
                            <div className="relative">
                                <div className="absolute inset-0 rounded-full bg-primary/[0.07] blur-3xl" />
                                <HeroIllustration className="relative h-auto w-[300px] text-primary lg:w-[340px]" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ============ 从想法到起飞 + 精选 Skill（原两个栏目合并） ============ */}
            <section className="border-b border-border">
                <div className="page-shell py-12 lg:py-14">
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
                                    <span className="text-[28px] leading-none">{CATEGORY_EMOJI[c.key] ?? "📦"}</span>
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
                                                en={inCategory.length > 0 ? `${inCategory.length} skills` : "Planned"}
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
                    {featured.length > 0 && (
                        <div className="mt-14 border-t border-border pt-10">
                            <div className="mb-8 flex items-end justify-between gap-4">
                                <div>
                                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                                        Selected skills
                                    </p>
                                    <h3 className="text-xl font-semibold tracking-[-0.01em]">
                                        <LocalizedText zh="精选 Skill" en="Selected skills" />
                                    </h3>
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

                            {/* MCP 那组的抬头与「精选 Skill」同款（英文小标 + 中文标题 + 右侧入口），
                  两个分组视觉上才是一对 */}
                            {featuredMcp.length > 0 && (
                                <div className="mt-10">
                                    <div className="mb-6 flex items-end justify-between gap-4">
                                        <div>
                                            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                                                Selected MCP servers
                                            </p>
                                            <h3 className="text-xl font-semibold tracking-[-0.01em]">
                                                <LocalizedText zh="精选 MCP" en="Selected MCP servers" />
                                            </h3>
                                        </div>
                                        <Link
                                            href="/mcp"
                                            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                                        >
                                            <LocalizedText zh="查看全部" en="View all" />
                                            <ArrowRight className="h-3.5 w-3.5" />
                                        </Link>
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                        {featuredMcp.map((m) => (
                                            <McpCard key={m.slug} server={m} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </section>

            {/* ============ 日志分析（原「三步读懂你的飞行」「日志里真正被检查的东西」「平台原则」合并；原则与收尾 CTA 已按要求去掉） ============ */}
            <section className="border-b border-border">
                <div className="page-shell py-12 lg:py-14">
                    <div className="mb-8 text-center">
                        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                            Log analysis
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
                            desc="选择 PX4 .ulg 或 ArduPilot .bin 文件，文件经 Pyodide 在本地浏览器中解析，原始日志不上传服务器，仅提交结构化检查结果。"
                            descEn="Select your PX4 .ulg or ArduPilot .bin file. Files stay in your browser — never uploaded."
                        />
                        <StepCard
                            step="02"
                            icon={<Microscope className="h-5 w-5" />}
                            title="确定性引擎分析"
                            titleEn="Deterministic analysis"
                            desc="执行 15 项确定性检查，输出结构化 JSON。数值判断全部由规则引擎完成，每条结论可溯源到字段、阈值和官方文档，LLM 只做翻译。"
                            descEn="Pyodide parses the log in a Web Worker. 15 deterministic checks produce structured JSON findings."
                        />
                        <StepCard
                            step="03"
                            icon={<MessageSquareText className="h-5 w-5" />}
                            title="AI 诊断报告"
                            titleEn="AI diagnostic report"
                            desc="AI（DeepSeek）把结构化结果翻译成通俗中文，每条结论可回指到具体字段和官方文档，不编造数值。"
                            descEn="LLM translates findings into plain language. Every conclusion traces back to a specific field and official docs."
                        />
                    </div>

                    <SubSection
                        en="Expert knowledge base"
                        zh="专家经验知识库"
                        note="规则、故障库、字段绑定与参数字典都在仓库里，可评审、可回归"
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            {KNOWLEDGE.map((k) => (
                                <div key={k.title} className="card flex gap-3 p-4">
                                    <span className="mt-0.5 shrink-0 text-primary">{k.icon}</span>
                                    <div>
                                        <p className="text-sm font-semibold text-text">
                                            <LocalizedText zh={k.title} en={k.titleEn} />
                                        </p>
                                        <p className="mt-1 text-xs leading-5 text-muted">
                                            <LocalizedText zh={k.desc} en={k.descEn} />
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </SubSection>

                    <SubSection
                        en="What gets checked"
                        zh="日志里真正被检查的东西"
                        note="每条结论都能回指到字段、阈值和官方文档"
                    >
                        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                            <div>
                                <ul className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
                                    {CHECKS.map((c) => (
                                        <li
                                            key={c.name}
                                            className="bg-surface p-4 transition-colors hover:bg-surface-2/70"
                                        >
                                            <p className="text-sm font-medium text-text">
                                                <LocalizedText zh={c.name} en={c.en} />
                                            </p>
                                            <p className="mt-1.5 font-mono text-[11px] leading-5 break-all text-faint">
                                                {c.field}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
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
                            </div>
                        </div>
                    </SubSection>
                </div>
            </section>

            {/* ============ 应用场景 ============ */}
            <section className="border-b border-border bg-surface-2/40">
                <div className="page-shell py-12">
                    <div className="mb-10 text-center">
                        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Use cases</p>
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
        </div>
    );
}

/* ============ 辅助组件 ============ */

/** 合并后的大段里的小节标题：一行英文小标 + 一行中文标题 +（可选）右侧说明，下面跟内容 */
function SubSection({ en, zh, note, children }: { en: string; zh: string; note?: string; children: React.ReactNode }) {
    return (
        <div className="mt-10 border-t border-border pt-8">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{en}</p>
                    <h3 className="text-xl font-semibold tracking-[-0.01em]">{zh}</h3>
                </div>
                {note ? <span className="text-sm text-muted">{note}</span> : null}
            </div>
            {children}
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
