// GET /api/kv-probe：验证 KV 绑定读写 + 边缘函数外网 fetch（DeepSeek 连通性）。
// 控制台需先开通 KV、创建 namespace（nextpilot_skill_mcp）并绑定到本项目，变量名 NEXTPILOT_KV。
//
// 要带内部密钥（请求头 `x-internal-secret`，值为环境变量 AUTH_EDGE_SECRET，
// 与 /internal/* 同一道门）：
// 探针会枚举 KV 键位，不设防的话，`?prefix=em_` 就成了"任意邮箱是否注册"的公开 oracle
// （em_<sha256(邮箱)> 是用户键），还能摸到 otp_ / use_ 等业务键的布局。
import { getKv, listAll } from "../_lib/kv.js";
import { assertInternal, jsonResponse } from "../_lib/http.js";

const COUNTER_KEY = "kvprobe_count";
const SHAPE_KEY = "kvprobe_shape";

function getBinding(env) {
    return getKv(env);
}

export async function onRequestGet({ request, env }) {
    // 密钥未配置时这里直接 403（fail-closed）：探针是调试工具，不该在裸奔状态下可达
    if (!assertInternal(request, env)) return jsonResponse({ error: "forbidden" }, 403);

    const result = { ok: false, kv: null, deepseek: null };
    const kv = getBinding(env);

    const prefix = new URL(request.url).searchParams.get("prefix") ?? "kvprobe_";
    // 即使过了密钥校验，也只许列 kvprobe_ 自己的键位，探针不需要（也不该能）翻业务键
    if (!prefix.startsWith("kvprobe_")) {
        return jsonResponse({ error: "prefix 只允许 kvprobe_ 前缀（探针只测自己的键位）" }, 400);
    }

    if (!kv) {
        return new Response(JSON.stringify({ ok: false, error: "NEXTPILOT_KV binding not found" }), {
            status: 500,
            headers: { "content-type": "application/json; charset=utf-8" },
        });
    }

    try {
        const before = Number((await kv.get(COUNTER_KEY)) ?? 0);
        const after = before + 1;
        await kv.put(COUNTER_KEY, String(after));
        result.kv = { before, after };
    } catch (err) {
        result.kv = { error: String(err && err.message ? err.message : err) };
    }

    try {
        await kv.put(SHAPE_KEY, JSON.stringify({ t: "probe" }));
        const plain = await kv.get(SHAPE_KEY);
        const asJson = await kv.get(SHAPE_KEY, { type: "json" });
        const listed = await kv.list({ prefix, limit: 10 });
        result.kvApi = {
            getReturns: typeof plain === "string" ? "string" : typeof plain,
            getJsonType: asJson === null ? "null" : typeof asJson,
            listKeys: JSON.stringify(listed).slice(0, 600),
        };
    } catch (err) {
        result.kvApi = { error: String(err && err.message ? err.message : err) };
    }

    try {
        result.listAll = { count: (await listAll(kv, prefix)).length };
    } catch (err) {
        result.listAll = { error: String(err && err.message ? err.message : err) };
    }
    try {
        result.emptyList = await kv.list({ prefix: `anuse_nonexistent_${Date.now()}_`, limit: 256 });
    } catch (err) {
        result.emptyList = { error: String(err && err.message ? err.message : err) };
    }

    try {
        const resp = await fetch("https://api.deepseek.com/models", {
            method: "GET",
            headers: { Authorization: "Bearer probe-invalid-key" },
        });
        result.deepseek = { status: resp.status };
    } catch (err) {
        result.deepseek = { error: String(err && err.message ? err.message : err) };
    }

    result.ok = Boolean(result.kv?.after);
    return new Response(JSON.stringify(result, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" },
    });
}
