// POST /api/issues：浏览器端错误上报的唯一入口（只接收与限流，判定在 _lib/issue-filer.js）。
//
// 命名（改名前先读）：这条链三个文件共用 `issue` 词根、各占一个角色词，读成"谁采、谁收、谁建单"：
// lib/issue-bridge.ts（采集）→ api/issues.js（入口，本文件）→ _lib/issue-filer.js（建单）。
// 文件名即路由。
//
// 不让浏览器直接调 issue API：那等于把 issue token 发给全世界（开 DevTools 就能拿到写权限），
// 所以浏览器只 POST 到这里，token 始终留在边缘函数。
//
// 这个端点公开（未登录用户也要能报错），因此：按 IP 日限流超了直接 429，不给 KV 被刷的机会；
// 限制请求体大小；立刻返回 202，真正的去重与提交放进 waitUntil，不让用户等。
import { getKv, listAll, sha256Hex, dateStamp, clientIp } from "../_lib/kv.js";
import { jsonResponse, readJson } from "../_lib/http.js";
import { reportIssue } from "../_lib/issue-filer.js";

/** 每 IP 每日最多接收阈值。正常用户一天不会报这么多，超了多半是脚本。 */
const DAILY_CAP_PER_IP = 20;
/** 请求体上限：栈已经由 issue-filer 截到 4KB，这里再挡一道超大 body。 */
const MAX_BODY_BYTES = 64 * 1024;

export async function onRequestPost({ request, env, waitUntil }) {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) {
        return jsonResponse({ ok: false, error: "payload too large" }, 413);
    }

    const body = await readJson(request);
    if (!body || typeof body !== "object") {
        return jsonResponse({ ok: false, error: "请求体不是合法 JSON" }, 400);
    }

    const kv = getKv(env);
    if (kv) {
        const ipHash = await sha256Hex(clientIp(request));
        const day = dateStamp();
        const prefix = `errrl_${ipHash}_${day}_`;
        // 平台坑：kv.list 无匹配时返回体里没有 keys 字段，统一走 listAll
        const used = (await listAll(kv, prefix)).length;
        if (used >= DAILY_CAP_PER_IP) {
            return jsonResponse({ ok: false, error: "今日上报次数已达上限" }, 429);
        }
        waitUntil?.(kv.put(`${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, "1"));
    }

    // 去重与提交都在边缘侧完成。默认走 waitUntil 不阻塞响应；配了 ISSUE_DEBUG=1 时同步等待并回显结果
    const pending = reportIssue(env, { ...body, kind: body.kind ?? "client-error" }).catch(() => ({
        skipped: "exception",
    }));
    if (String(env?.ISSUE_DEBUG ?? "") === "1") {
        return jsonResponse({ ok: true, result: await pending }, 202);
    }
    waitUntil?.(pending);
    return jsonResponse({ ok: true }, 202);
}

export function onRequestGet() {
    return jsonResponse({ ok: false, error: "请用 POST 上报，或访问 /issue-probe 自检配置" }, 405);
}
