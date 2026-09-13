import { NextRequest, NextResponse } from "next/server";
import type { Finding } from "@/lib/types";

export const runtime = "edge";
// 长报告允许较长生成时间；若边缘平台超时更短，以平台限制为准（CLAUDE.md 9 风险项）
export const maxDuration = 60;

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
const API_KEY = process.env.DEEPSEEK_API_KEY;

// 冲刺 1 的极简 IP 限流；冲刺 2 改为 EdgeOne KV 按登录用户配额计数
const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const LIMIT = 8;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= LIMIT) return false;
  b.count += 1;
  return true;
}

const SYSTEM_PROMPT = `你是资深 PX4 飞控日志分析专家。你的唯一职责是把结构化检查结果（findings）"翻译"成给飞手看的中文报告。

铁律：
1. 只能引用 findings 中给出的字段、数值、阈值，禁止编造任何数字、字段名或结论；
2. 没有检查到的项目明确说"本次未检查/未发现异常"，不要推测；
3. 按严重度（critical > warning > info）组织内容，先给 2-3 句总体结论，再逐条解释：现象、可能原因、建议动作；
4. 每条解释末尾附上 findings 中的官方文档链接（如有）；
5. 结尾固定加一行："本报告为辅助判读，不替代人工排查。"
6. 使用 Markdown 输出，语言简洁专业，不要输出与本次日志无关的内容。`;

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429 },
    );
  }

  if (!API_KEY) {
    return NextResponse.json(
      { error: "LLM 解释层未配置 DEEPSEEK_API_KEY" },
      { status: 503 },
    );
  }

  let body: {
    fileName?: string;
    stats?: Record<string, number | string>;
    findings?: Finding[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const findings = Array.isArray(body.findings) ? body.findings : [];
  if (findings.length === 0) {
    return NextResponse.json(
      {
        markdown:
          "## 分析结论\n\n本次检查的三项基础规则（振动 / IMU 削波、EKF 创新检验、电源）**均未发现异常**。\n\n本报告为辅助判读，不替代人工排查。",
      },
      { status: 200 },
    );
  }

  // 只把必要字段交给 LLM，避免用户侧夹带内容
  const safe = findings.map((f) => ({
    severity: f.severity,
    ruleId: f.ruleId,
    title: f.title,
    evidence: f.evidence,
    docUrl: f.docUrl ?? null,
    suggestion: f.suggestion ?? null,
  }));

  const userContent = `日志文件：${body.fileName ?? "unknown"}
飞行统计：${JSON.stringify(body.stats ?? {})}
检查结果 findings：
${JSON.stringify(safe, null, 2)}

请按系统提示生成中文 Markdown 报告。`;

  try {
    const resp = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return NextResponse.json(
        { error: `LLM 服务异常（${resp.status}）`, detail },
        { status: 502 },
      );
    }

    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const markdown = data.choices?.[0]?.message?.content?.trim();
    if (!markdown) {
      return NextResponse.json({ error: "LLM 返回为空" }, { status: 502 });
    }
    return NextResponse.json({ markdown });
  } catch (err) {
    return NextResponse.json(
      { error: "调用 LLM 失败", detail: (err as Error).message },
      { status: 502 },
    );
  }
}
