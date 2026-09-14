// POST /api/explain —— 登录用户把端侧确定性引擎产出的 findings 上送，
// 边缘函数做配额校验后转发 DeepSeek 生成中文报告，并写 usage 计数与报告记录。
// 架构铁律（CLAUDE.md 4.1/9）：LLM 只翻译 findings，不做任何数值判断。
// 冲刺 2：本逻辑由 Next.js Node 路由迁移到 Edge Function（KV 只能在边缘运行时访问）。
import {
  getKv,
  listAll,
  usagePrefix,
  anonUsagePrefix,
  reportPrefix,
  sanitizeId,
  sanitizeDeviceId,
  sha256Hex,
  dateStamp,
  FREE_DAILY_QUOTA,
  ANONYMOUS_DAILY_QUOTA,
  ANONYMOUS_IP_DAILY_CAP,
  REPORT_TTL_MS,
  clientIp,
} from "../_lib/kv.js";
import { getSessionUser } from "../_lib/auth.js";
import { jsonResponse, readJson } from "../_lib/http.js";

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

// 工程师思考范式（docs/rules/knowledge-authoring.md 第 3 节）：LLM 只做 GJB-841 组装
const SYSTEM_PROMPT = `你是资深飞控测试工程师，依据结构化检查结果输出 GJB-841 故障归零报告。严格遵守思考范式：
1. 先区分现象：哪些是硬件问题，哪些是参数配置问题，哪些是环境扰动（风、GPS 干扰）。
2. 排查顺序由简到繁：硬件机械检查 → 安装装配 → 传感器状态 → 飞控参数 → 算法逻辑。
3. 同时出现多个异常时，识别主故障与次生故障，不要把次生现象当成根因。
4. VTOL 机型必须区分故障发生在：多旋翼模式 / 转换过渡阶段 / 固定翼巡航阶段。
5. 证据不足时禁止编造根因；证据不足输出：【现有数据不足以确定根因，建议复现试验，同步增加机载记录】。
6. 输出格式遵循 GJB-841 故障归零规范，每条问题按四段：故障现象描述 → 数据依据 → 初步原因分析 → 排查与验证建议。
7. 禁止输出会带来炸机风险的参数修改建议；给出参数建议时必须标注安全边界。
8. 所有结论只能基于【日志统计摘要】和【匹配的故障知识库】，禁止使用未提供的故障模式；根因顺序必须沿用知识库给出的排查顺序。

其他铁律：
- 只能引用 findings 中的字段、数值、阈值，禁止编造数字或字段名。
- 未检查的项目明确说"本次未检查/未发现异常"，不要推测。
- 每个排查建议末尾附上知识库 note 中的禁忌与 findings 中的官方文档链接。
- guardTags 含 insufficient_data 时，先声明数据不足、只描述现象、不做 PID/根因深度诊断。
- 使用简洁专业的中文 Markdown，结尾固定加一行："本报告为辅助判读，不替代人工排查。"`;

const EMPTY_FINDINGS_MARKDOWN =
  "## 分析结论\n\n本次检查的三项基础规则（振动 / IMU 削波、EKF 创新检验、电源）**均未发现异常**。\n\n本报告为辅助判读，不替代人工排查。";

export async function onRequestPost({ request, env, waitUntil }) {
  // 冲刺 2：日志分析对所有用户免费。登录 10 次/天，匿名设备 3 次/天（KV 只用于防滥用）。
  // 会员体系/无限额度是冲刺 3。
  const session = await getSessionUser(request, env);

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
  const day = dateStamp();

  // 配额判定（按日重置）：登录按 uid，匿名按设备 ID（+ IP 日上限防清 Cookie 绕过）
  let identity;
  if (session) {
    identity = { kind: "user", key: session.uid, limit: FREE_DAILY_QUOTA };
  } else {
    const deviceRaw = sanitizeDeviceId(body.deviceId);
    const ipHash = await sha256Hex(clientIp(request));
    identity = {
      kind: "anonymous",
      key: deviceRaw || ipHash,
      ipHash,
      limit: ANONYMOUS_DAILY_QUOTA,
    };
  }

  let usedBefore = 0;
  let ipUsedToday = 0;
  if (kv) {
    if (session) {
      usedBefore = (await listAll(kv, usagePrefix(session.uid, day))).length;
    } else {
      usedBefore = (await listAll(kv, anonUsagePrefix(identity.key, day))).length;
      ipUsedToday = (await listAll(kv, `anip_${identity.ipHash}_${day}_`)).length;
    }
  }

  if (usedBefore >= identity.limit) {
    return jsonResponse(
      {
        error: session
          ? `今日免费分析额度（${identity.limit} 次）已用完，每日重置，会员版即将上线`
          : `匿名免费试用为每日 ${identity.limit} 次，登录可获得 ${FREE_DAILY_QUOTA} 次/天`,
        quota: {
          day,
          used: usedBefore,
          limit: identity.limit,
          anonymous: !session,
          loginLimit: FREE_DAILY_QUOTA,
        },
      },
      429,
    );
  }
  if (!session && ipUsedToday >= ANONYMOUS_IP_DAILY_CAP) {
    return jsonResponse(
      { error: "今日匿名分析次数过多，请明天再试或登录使用" },
      429,
    );
  }

  // 只把必要字段交给 LLM 与落盘，避免用户侧夹带内容（与本地 Finding 结构保持一致）
  const safe = findings.map((f) => ({
    id: f.id,
    severity: f.severity,
    ruleId: f.ruleId,
    tag: f.tag ?? null,
    title: f.title,
    evidence: f.evidence,
    docUrl: f.docUrl ?? null,
    suggestion: f.suggestion ?? null,
  }));

  // 第四层报文契约：统计摘要（含标签/阶段/guard）+ 仅命中的故障库条目
  const summary = {
    durationSec: body.stats?.durationSec ?? null,
    armedDurationSec: body.stats?.armedDurationSec ?? null,
    vehicleType: body.stats?.vehicleType ?? null,
    phases: body.phases ?? [],
    tags: body.tags ?? [],
    guardTags: body.guardTags ?? [],
    checksRun: body.checksRun ?? [],
    checksSkipped: body.checksSkipped ?? [],
    keyStats: body.stats ?? {},
  };

  const userContent = `【日志统计摘要（来自代码预处理）】
${JSON.stringify(summary, null, 2)}

【检查结果 findings】
${JSON.stringify(safe, null, 2)}

【本次匹配的故障知识库片段（检索得到，不是全量库；根因必须从中选取）】
${JSON.stringify(body.matchedFaults ?? [], null, 2)}

请按系统提示的 GJB-841 四段式输出中文 Markdown 报告。不允许引入未提供的故障模式，证据不足直接说明。`;

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

  // 调用成功后才计数；只有登录用户存云端报告，匿名只存客户端 localStorage
  const quota = {
    day,
    used: usedBefore + 1,
    limit: identity.limit,
    anonymous: !session,
    loginLimit: FREE_DAILY_QUOTA,
  };
  if (kv) {
    const now = Date.now();
    const eventId = sanitizeId(body.reportId || crypto.randomUUID());
    if (session) {
      const usageKey = `${usagePrefix(session.uid, day)}${eventId}`;
      const reportKey = `${reportPrefix(session.uid)}${eventId}`;
      const report = {
        id: eventId,
        fileName: String(body.fileName ?? "unknown").slice(0, 300),
        fileSize: Number(body.fileSize ?? 0) || 0,
        durationSec: Number(body.durationSec ?? 0) || undefined,
        platform: String(body.platform ?? "px4"),
        vehicleType: body.stats?.vehicleType ? String(body.stats.vehicleType) : undefined,
        parserVersion: String(body.parserVersion ?? ""),
        findings: safe,
        stats: body.stats && typeof body.stats === "object" ? body.stats : {},
        tags: Array.isArray(body.tags) ? body.tags : [],
        guardTags: Array.isArray(body.guardTags) ? body.guardTags : [],
        phases: Array.isArray(body.phases) ? body.phases : [],
        matchedFaults: Array.isArray(body.matchedFaults) ? body.matchedFaults : [],
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
    } else {
      // 匿名：设备当日唯一事件 + IP 日计数
      waitUntil?.(
        Promise.allSettled([
          kv.put(`${anonUsagePrefix(identity.key, day)}${eventId}`, String(now)),
          kv.put(`anip_${identity.ipHash}_${dateStamp()}_${eventId}`, String(now)),
        ]),
      );
    }
  }

  return jsonResponse({ markdown, reportId: body.reportId, quota });
}
