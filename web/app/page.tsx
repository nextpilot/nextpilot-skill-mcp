import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Check,
  FileSearch,
  ShieldCheck,
} from "lucide-react";
import { getSkillIndex } from "@/lib/skills";
import { CATEGORIES } from "@/lib/constants";
import { SkillCard } from "@/components/SkillCard";
import { HomeUploadCard } from "@/components/HomeUploadCard";
import { LocalizedText } from "@/components/LocalizedText";

/**
 * 检查项与覆盖范围写在这里而不是从引擎动态取：
 * 文案要可读，字段名要给准；引擎侧以 workers/ulog-check-script.ts 的 ran() 为准，
 * 改动检查项时同步这一处。
 */
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

export default function HomePage() {
  const skills = getSkillIndex();
  const featured = skills.filter((s) => s.featured).slice(0, 6);

  return (
    <div>
      {/* Hero：白底、紧排标题、无装饰光斑；强调色只出现在链接与小标记上 */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:py-20">
          <div>
            <p className="mb-5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
              <LocalizedText zh="飞控 AI 技术交流 · Skill / MCP 平台" en="Flight AI community · Skill / MCP platform" />
            </p>
            <h1 className="max-w-2xl text-[32px] leading-[1.15] font-semibold tracking-[-0.02em] text-text sm:text-[44px]">
              <LocalizedText zh="让飞行器理解世界。" en="Help aircraft understand the world." />
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted">
              <LocalizedText
                zh="把感知、决策、控制和工具链连接起来。用社区 Skill 加速实验，用确定性规则读懂每一次飞行。"
                en="Connect perception, decisions, control and tooling. Move faster with community skills and deterministic flight checks."
              />
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/analyze" className="btn-primary">
                <FileSearch className="h-4 w-4" />
                <LocalizedText zh="在线分析 PX4 日志" en="Analyze a PX4 log" />
              </Link>
              <Link href="/skills" className="btn-ghost">
                <LocalizedText zh="浏览 Skill 库" en="Browse skills" />
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
              <li className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-ok" />
                <LocalizedText zh="原始日志不上传" en="Raw logs stay local" />
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-ok" />
                <LocalizedText zh="规则引擎负责判断" en="Rules make the judgment" />
              </li>
            </ul>
          </div>

          <HomeUploadCard />
        </div>
      </section>

      {/* 分类 */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Explore the stack
              </p>
              <h2 className="text-xl font-semibold tracking-[-0.01em]">
                <LocalizedText zh="从想法到起飞" en="From idea to flight" />
              </h2>
            </div>
            <span className="hidden text-sm text-muted sm:block">
              <LocalizedText zh="四个维度，覆盖完整飞行链路" en="Four dimensions for the full flight stack" />
            </span>
          </div>

          <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((c, i) => {
              const inCategory = skills.filter((s) => s.category === c.key);
              return (
                <Link
                  key={c.key}
                  href={`/skills?category=${c.key}`}
                  className="group flex flex-col bg-surface p-4 transition-colors hover:bg-surface-2 sm:p-5"
                >
                  <span className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-faint">0{i + 1}</span>
                    <ArrowRight className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-text" />
                  </span>
                  <span className="mt-3 font-medium">
                    <LocalizedText zh={c.label} en={c.key} />
                  </span>
                  <span className="mt-1 text-sm leading-6 text-muted">
                    <LocalizedText zh={c.desc} en={c.key} />
                  </span>

                  {/* 覆盖范围：写明这一类里都有什么，同时避免卡片下半留白 */}
                  <span className="mt-4 block border-t border-border pt-3">
                    <span className="block text-xs font-medium text-text">
                      <LocalizedText
                        zh={
                          inCategory.length > 0
                            ? `收录 ${inCategory.length} 个 Skill`
                            : "选题规划中"
                        }
                        en={
                          inCategory.length > 0
                            ? `${inCategory.length} skills`
                            : "Planned"
                        }
                      />
                    </span>
                    <span className="mt-1.5 block text-xs leading-5 text-faint">
                      {c.topics.slice(0, 3).join(" · ")}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* 精选 Skill */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Selected skills
              </p>
              <h2 className="text-xl font-semibold tracking-[-0.01em]">
                <LocalizedText zh="精选 Skill" en="Selected skills" />
              </h2>
            </div>
            <Link
              href="/skills"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
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

      {/* 日志分析覆盖：平台自营的确定性检查（数值判断的唯一来源） */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Deterministic checks
              </p>
              <h2 className="text-xl font-semibold tracking-[-0.01em]">
                <LocalizedText zh="日志里真正被检查的东西" en="What actually gets checked" />
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
                  <li key={c.name} className="bg-surface p-4">
                    <p className="text-sm font-medium">
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
              <h3 className="text-sm font-semibold">
                <LocalizedText zh="覆盖范围" en="Coverage" />
              </h3>
              <dl className="mt-4 space-y-3.5">
                {COVERAGE.map((s) => (
                  <div key={s.label}>
                    <dt className="text-xs text-muted">{s.label}</dt>
                    {/* 纯数字才用大字号；「PX4 1.15+ / 旧版字段自适应」这类说明放正文号 */}
                    <dd
                      className={
                        /^\d+$/.test(s.value)
                          ? "mt-0.5 text-2xl font-semibold tracking-[-0.02em]"
                          : "mt-1 text-sm font-medium"
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

      {/* 平台原则 */}
      <section>
        <div className="mx-auto max-w-6xl px-4 py-14">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            Principles
          </p>
          <h2 className="mb-6 text-xl font-semibold tracking-[-0.01em]">
            <LocalizedText zh="平台原则" en="Principles" />
          </h2>
          <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
            <Principle
              icon={<ShieldCheck className="h-4 w-4" />}
              title="确定性引擎是唯一真相来源"
              desc="数值判断全部由规则引擎完成，每条结论可溯源到字段、阈值和官方文档，LLM 只做翻译。"
            />
            <Principle
              icon={<FileSearch className="h-4 w-4" />}
              title="日志在你的浏览器里解析"
              desc=".ulg 文件经 Pyodide 在本地解析，原始日志不上传服务器，仅提交结构化检查结果。"
            />
            <Principle
              icon={<Boxes className="h-4 w-4" />}
              title="永不直接致动真实载具"
              desc="平台不提供 arm/disarm 等致动托管能力；相关内容仅以开源 Skill + 三重门禁形式存在。"
            />
          </div>
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
    <div className="bg-surface p-5">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted">
        {icon}
      </span>
      <h3 className="mt-4 font-medium">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted">{desc}</p>
    </div>
  );
}
