// POST /api/explain —— 登录用户把端侧确定性引擎产出的 findings 上送，
// 边缘函数做配额校验后转发 DeepSeek 生成中文报告，并写 usage 计数与报告记录。
// 架构铁律（CLAUDE.md 4.1/9）：LLM 只翻译 findings，不做任何数值判断。
// 冲刺 2：本逻辑由 Next.js Node 路由迁移到 Edge Function（KV 只能在边缘运行时访问）。
import {
  getKv,
  listAll,
  usagePrefix,
  reportPrefix,
  sanitizeId,
  monthStamp,
  FREE_MONTHLY_QUOTA,
  REPORT_TTL_MS,
} from "../_lib/kv.js";
import { getSessionUser } from "../_lib/auth.js";
import { jsonResponse, readJson } from "../_lib/http.js";

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

const SYSTEM_PROMPT = `你是资深 PX4 飞控日志分析专家。你的唯一职责是把结构化检查结果（findings）"翻译"成给飞手看的中文报告。

铁律：
1. 只能引用 findings 中给出的字段、数值、阈值，禁止编造任何数字、字段名或结论；
2. 没有检查到的项目明确说"本次未检查/未发现异常"，不要推测；
3. 按严重度（critical > warning > info）组织内容，先给 2-3 句总体结论，再逐条解释：现象、可能原因、建议动作；
   飞行统计中的 vehicleType 标明机型（rotary_wing 旋翼类 / fixed_wing 固定翼 / rover 地面车等），原因分析与建议必须贴合该机型（如 rover 不存在桨叶/飞行动力学问题）；
4. 每条解释末尾附上 findings 中的官方文档链接（如有）；
5. 结尾固定加一行："本报告为辅助判读，不替代人工排查。"
6. 使用 Markdown 输出，语言简洁专业，不要输出与本次日志无关的内容。`;

const EMPTY_FINDINGS_MARKDOWN =
  "## 分析结论\n\n本次检查的三项基础规则（振动 / IMU 削波、EKF 创新检验、电源）**均未发现异常**。\n\n本报告为辅助判读，不替代人工排查。";

export async function onRequestPost({ request, env, waitUntil }) {
  const session = await getSessionUser(request, env);
  if (!session) {
    return jsonResponse({ error: "请先登录后再生成 AI 报告" }, 401);
  }

  const body = await readJson(request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "请求体不是合法 JSON" }, 400);
  }
  const findings = Array.isArray(body.findings) ? body.findings : [];

  // 无 findings 时不调用 LLM、不消耗配额，也不依赖 DEEPSEEK_API_KEY
  if (findings.length === 0) {
    return jsonResponse({ markdown: EMPTY_FINDINGS_MARKDOWN, quotaFree: true });
  }

  const apiKey = env?.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: "LLM 解释层未配置 DEEPSEEK_API_KEY" }, 503);
  }

  const kv = getKv(env);
  const month = monthStamp();
  let usedBefore = 0;
  if (kv) {
    usedBefore = (await listAll(kv, usagePrefix(session.uid, month))).length;
  }
  if (usedBefore >= FREE_MONTHLY_QUOTA) {
    return jsonResponse(
      { error: "本月免费分析额度（5 次）已用完", quota: { month, used: usedBefore, limit: FREE_MONTHLY_QUOTA } },
      429,
    );
  }

  // 只把必要字段交给 LLM 与落盘，避免用户侧夹带内容（与本地 Finding 结构保持一致）
  const safe = findings.map((f) => ({
    id: f.id,
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

  let markdown;
  try {
    const resp = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: env?.DEEPSEEK_MODEL ?? "deepseek-chat",
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
      return jsonResponse({ error: `LLM 服务异常（${resp.status}）`, detail }, 502);
    }
    const data = await resp.json();
    markdown = data?.choices?.[0]?.message?.content?.trim();
    if (!markdown) return jsonResponse({ error: "LLM 返回为空" }, 502);
  } catch (err) {
    return jsonResponse({ error: "调用 LLM 失败", detail: String(err?.message ?? err) }, 502);
  }

  // 调用成功后才计数 + 存报告；reportId 由客户端生成（与 localStorage 同一份）
  const quota = { month, used: usedBefore + 1, limit: FREE_MONTHLY_QUOTA };
  if (kv) {
    const reportId = sanitizeId(body.reportId || crypto.randomUUID());
    const now = Date.now();
    const usageKey = `${usagePrefix(session.uid, month)}${reportId}`;
    const reportKey = `${reportPrefix(session.uid)}${reportId}`;
    const report = {
      id: reportId,
      fileName: String(body.fileName ?? "unknown").slice(0, 300),
      fileSize: Number(body.fileSize ?? 0) || 0,
      durationSec: Number(body.durationSec ?? 0) || undefined,
      platform: String(body.platform ?? "px4"),
      vehicleType: body.stats?.vehicleType ? String(body.stats.vehicleType) : undefined,
      parserVersion: String(body.parserVersion ?? ""),
      findings: safe,
      stats: body.stats && typeof body.stats === "object" ? body.stats : {},
      aiMarkdown: markdown,
      analyzedAt: new Date(now).toISOString(),
      expiresAt: now + REPORT_TTL_MS,
    };
    waitUntil?.(
      Promise.allSettled([
        kv.put(usageKey, String(now)),
        kv.put(reportKey, JSON.stringify(report)),
      ]),
    );
  }

  return jsonResponse({ markdown, reportId: body.reportId, quota });
}
