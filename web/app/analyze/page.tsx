import type { Metadata } from "next";
import { LogAnalyzer } from "@/components/LogAnalyzer";
import { LocalizedText } from "@/components/LocalizedText";

export const metadata: Metadata = {
  title: "PX4 日志分析 · NextPilot Skill MCP",
  description:
    "在浏览器本地解析 PX4 .ulg 日志：振动、EKF 创新检验、电源三项基础检查，AI 仅负责解释。",
};

export default function AnalyzePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold"><LocalizedText zh="PX4 飞行日志分析" en="PX4 flight log analysis" /></h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        确定性引擎负责数值判断（解析 → 规则检查），DeepSeek
        只把检查结果翻译成中文，不参与任何数值判断。当前为冲刺 1 版本，包含
        <strong className="text-muted"> 振动 / IMU 削波、EKF 创新检验、电源</strong>
        三项基础检查，阈值仍在真实日志校准中。
      </p>

      <div className="mt-8">
        <LogAnalyzer />
      </div>
    </div>
  );
}
