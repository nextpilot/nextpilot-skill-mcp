// GET /api/issue-probe：报错上报链路的自检探针。只返回配置与状态码，不会回显 token 本身。
//   GET /api/issue-probe          只读探测：配置齐不齐、仓库能不能读到
//   GET /api/issue-probe?write=1  真发一次创建（需要 ISSUE_DEBUG=1）
//
// 要带内部密钥（请求头 `x-internal-secret`，值为 AUTH_EDGE_SECRET，与 /internal/* 同一道门）：只读探测会回显
// 仓库全名 / tokenSet / labels 与最近几条上报失败原文（运维信息），且每次访问都真实外呼 Gitee/GitHub，
// 不设防可被脚本刷成第三方 API 的跳板。
import { getKv, listAll } from "../_lib/kv.js";
import { assertInternal, jsonResponse } from "../_lib/http.js";
import { probeConfig, reportIssue } from "../_lib/issue-filer.js";

export async function onRequestGet({ request, env }) {
    if (!assertInternal(request, env)) return jsonResponse({ error: "forbidden" }, 403);

    const url = new URL(request.url);
    const out = await probeConfig(env);

    const kv = getKv(env);
    if (kv) {
        try {
            const keys = await listAll(kv, "errx_");
            const recent = [];
            for (const key of keys.slice(-5).reverse()) {
                const raw = await kv.get(key).catch(() => null);
                if (!raw) continue;
                try {
                    recent.push(JSON.parse(raw));
                } catch {
                    recent.push({ stage: "unknown", raw: String(raw).slice(0, 200) });
                }
            }
            out.recentFailures = recent;
        } catch {
            out.recentFailures = [];
        }
    }

    if (url.searchParams.get("write") === "1") {
        if (String(env?.ISSUE_DEBUG ?? "") !== "1") {
            out.writeTest = { skipped: "需要先设 ISSUE_DEBUG=1 再访问" };
        } else {
            out.writeTest = await reportIssue(env, {
                kind: "server-error",
                level: "fatal",
                type: "IssueProbeWriteTest",
                message: "[自检] 这是一条由 /api/issue-probe?write=1 触发的测试 issue。",
                stack: "  at probe (issue-probe.js:1:1)",
                route: "/api/issue-probe?write=1",
                version: String(env?.NEXT_PUBLIC_APP_VERSION ?? "dev"),
            });
        }
    }

    return jsonResponse(out);
}
