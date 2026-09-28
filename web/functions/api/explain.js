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
import { reportIssue } from "../_lib/issue-filer.js";
import { getSecret } from "../_lib/secrets.js";
// 思考范式与空结论文案的单一事实源在 knowledge/llm/，由 build-knowledge.mjs 生成
import {
    GJB841_SYSTEM_PROMPT as SYSTEM_PROMPT,
    EMPTY_FINDINGS_MARKDOWN,
} from "../../lib/knowledge/prompts.generated.js";

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

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

    // 本地联调：显式开启 LLM_MOCK=1（或 key 填 mock）时，用模板报告替代真实调用，
    // 让配额/限流/报告落盘等链路可在没有 API key 的情况下完整验证。
    // 后台（KV）优先于环境变量：轮换密钥不必再动控制台 + 重新部署
    const apiKey = await getSecret(env, "deepseekApiKey", "DEEPSEEK_API_KEY");
    const mockMode = env?.LLM_MOCK === "1" || apiKey === "mock";
    if (!apiKey && !mockMode) {
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
        return jsonResponse({ error: "今日匿名分析次数过多，请明天再试或登录使用" }, 429);
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

    // 第四层报文契约：事实（机型/固件/时长/阶段）+ 关键数字 + 标签/guard + 仅命中的故障库条目
    const facts = body.facts && typeof body.facts === "object" ? body.facts : {};
    const metrics = Array.isArray(body.metrics) ? body.metrics : [];
    const summary = {
        durationSec: facts.durationSec ?? null,
        armedDurationSec: facts.armedDurationSec ?? null,
        vehicleType: facts.vehicleType ?? null,
        firmware: facts.firmware ?? null,
        firmwareProfile: facts.firmwareProfile ?? null,
        hardware: facts.hardware ?? null,
        phases: facts.phases ?? [],
        dropoutTotalMs: facts.dropoutTotalMs ?? null,
        tags: body.tags ?? [],
        guardTags: body.guardTags ?? [],
        checksRun: body.checksRun ?? [],
        checksSkipped: body.checksSkipped ?? [],
        keyMetrics: metrics,
    };

    const userContent = `【日志事实与关键数据（来自确定性引擎）】
${JSON.stringify(summary, null, 2)}

【检查结果 findings】
${JSON.stringify(safe, null, 2)}

【本次匹配的故障知识库片段（检索得到，不是全量库；根因必须从中选取）】
${JSON.stringify(body.matchedFaults ?? [], null, 2)}

请按系统提示的 GJB-841 四段式输出中文 Markdown 报告。不允许引入未提供的故障模式，证据不足直接说明。`;

    let markdown;
    if (!apiKey) {
        // 模拟报告：结构与真实 GJB-841 输出一致，但明确标注为本地模拟
        markdown = [
            "## 故障现象描述",
            `本次日志（${body.fileName ?? "unknown"}，机型 ${facts.vehicleType ?? "未知"}，` +
                `固件 ${facts.firmware ?? "未知"}）确定性引擎共给出 ${findings.length} 条检查结果。`,
            "",
            "## 数据依据",
            ...findings
                .slice(0, 5)
                .map(
                    (f) =>
                        `- [${f.severity}] ${f.title}：${f.evidence?.field ?? ""} = ${f.evidence?.value ?? ""}` +
                        (f.evidence?.threshold != null ? `（阈值 ${f.evidence.threshold}）` : ""),
                ),
            "",
            "## 初步原因分析",
            ...((body.matchedFaults ?? []).length
                ? body.matchedFaults.map(
                      (m) => `- ${m.faultId}（风险${m.riskLevel}）：${(m.possibleRootCause ?? [])[0] ?? ""}`,
                  )
                : ["未命中故障知识库条目，不做根因推断。"]),
            "",
            "## 排查与验证建议",
            ...((body.matchedFaults ?? []).flatMap((m) =>
                (m.troubleshootingSteps ?? []).slice(0, 2).map((t) => `- ${t}`),
            ).length
                ? (body.matchedFaults ?? []).flatMap((m) =>
                      (m.troubleshootingSteps ?? []).slice(0, 2).map((t) => `- ${t}`),
                  )
                : ["按 findings 中的字段逐项复核。"]),
            "",
            "> ⚠ 本报告由**本地模拟模式**（LLM_MOCK）生成，用于联调配额与链路，不是真实模型输出。",
            "",
            "本报告为辅助判读，不替代人工排查。",
        ].join("\n");
    } else
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
                // 上游抖动属高频可恢复错误：只报状态码，绝不把上游响应体（detail 里可能夹带
                // 本次请求的 findings，等同用户数据）带进公开 issue
                waitUntil?.(
                    reportIssue(env, {
                        kind: "server-error",
                        level: "recoverable",
                        type: "LLMUpstreamError",
                        message: `DeepSeek 返回 ${resp.status}`,
                        route: "/api/explain",
                    }),
                );
                return jsonResponse({ error: `LLM 服务异常（${resp.status}）`, detail }, 502);
            }
            const data = await resp.json();
            markdown = data?.choices?.[0]?.message?.content?.trim();
            if (!markdown) {
                waitUntil?.(
                    reportIssue(env, {
                        kind: "server-error",
                        level: "recoverable",
                        type: "LLMEmptyResponse",
                        message: "DeepSeek 返回空内容",
                        route: "/api/explain",
                    }),
                );
                return jsonResponse({ error: "LLM 返回为空" }, 502);
            }
        } catch (err) {
            waitUntil?.(
                reportIssue(env, {
                    kind: "server-error",
                    level: "recoverable",
                    type: "LLMFetchFailed",
                    message: String(err?.message ?? err),
                    stack: err?.stack ?? "",
                    route: "/api/explain",
                }),
            );
            return jsonResponse({ error: "调用 LLM 失败", detail: String(err?.message ?? err) }, 502);
        }
    if (mockMode)
        markdown = `> ⚠ 本地模拟报告（LLM_MOCK）

${markdown}`;

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
        const reportId = sanitizeId(body.reportId || crypto.randomUUID());
        // 配额事件键必须每次调用唯一：同一份报告重复生成（历史里再点生成）也要计一次，
        // 否则可以通过复用 reportId 绕过额度。报告记录仍按 reportId 覆盖。
        const eventId = `${now}_${Math.random().toString(36).slice(2, 8)}`;
        if (session) {
            const usageKey = `${usagePrefix(session.uid, day)}${eventId}`;
            const reportKey = `${reportPrefix(session.uid)}${reportId}`;
            const report = {
                id: reportId,
                fileName: String(body.fileName ?? "unknown").slice(0, 300),
                fileSize: Number(body.fileSize ?? 0) || 0,
                durationSec: Number(facts.durationSec ?? 0) || undefined,
                platform: String(body.platform ?? "px4"),
                vehicleType: facts.vehicleType ? String(facts.vehicleType) : undefined,
                parserVersion: String(body.parserVersion ?? ""),
                // 日志内容指纹：同一份日志重复上传时前端据此直接载入结论，不再解析
                logHash: typeof body.logHash === "string" ? body.logHash.slice(0, 128) : undefined,
                findings: safe,
                // 事实层两块照原样存（durationSec/vehicleType 上面另存一份平的，供列表接口直接读）
                facts,
                metrics,
                tags: Array.isArray(body.tags) ? body.tags : [],
                guardTags: Array.isArray(body.guardTags) ? body.guardTags : [],
                matchedFaults: Array.isArray(body.matchedFaults) ? body.matchedFaults : [],
                aiMarkdown: markdown,
                analyzedAt: new Date(now).toISOString(),
                expiresAt: now + REPORT_TTL_MS,
            };
            waitUntil?.(Promise.allSettled([kv.put(usageKey, String(now)), kv.put(reportKey, JSON.stringify(report))]));
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

// GET 不拦截就会穿透回源（opennext 不应用 rewrites），落到 [locale] 得 404 HTML、
// 还会被 EdgeOne CDN 缓存约 5 分钟（2026-09-28 线上实测）。照 issues.js 的模式
// 显式 405，让请求在边缘层被接住。
export function onRequestGet() {
    return jsonResponse({ ok: false, error: "请用 POST 上送 findings" }, 405);
}
