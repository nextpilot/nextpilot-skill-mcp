import type { Metadata } from "next";
import { LogAnalyzer } from "@/components/LogAnalyzer";
import { LocalizedText } from "@/components/LocalizedText";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const metadata: Metadata = {
  title: "PX4 日志分析 · NextPilot Skill MCP",
  description:
    "在浏览器本地解析 PX4 .ulg 日志：15 项确定性检查（振动 / IMU 削波、EKF 创新检验、电源、GPS、电机平衡等）与故障知识库匹配，AI 仅负责解释。",
};

export default function AnalyzePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Breadcrumbs items={[{ label: "日志分析" }]} />
      <h1 className="text-[24px] font-semibold tracking-[-0.02em]">
        <LocalizedText zh="PX4 飞行日志分析" en="PX4 flight log analysis" />
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
        <LocalizedText
          zh="确定性引擎负责数值判断（解析 → 规则检查 → 故障知识库匹配），DeepSeek 只把结构化结果翻译成中文，不参与任何数值判断。当前覆盖 15 项检查（振动 / IMU 削波、EKF 创新检验、电源、GPS 健康度、电机平衡、陀螺零偏、姿态跟踪、失效保护等）与 10 条故障知识库条目，阈值仍在真实日志校准中。"
          en="The deterministic engine makes every numeric call (parse → rule checks → fault knowledge base); DeepSeek only translates the structured result into Chinese. 15 checks and 10 knowledge-base entries today, thresholds still being calibrated on real logs."
        />
      </p>

      <div className="mt-6">
        <LogAnalyzer />
      </div>
    </div>
  );
}
