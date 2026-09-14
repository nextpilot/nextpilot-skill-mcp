// 冲刺 2 阶段 0 Spike：验证 KV 绑定读写 + 边缘函数外网 fetch（DeepSeek 连通性）。
// 控制台需先开通 KV、创建 namespace（nextpilot_skill_mcp）并绑定到本项目，变量名 NEXTPILOT_KV。
// 访问 GET /kv-probe 每次计数 +1，并探测 DeepSeek API 的可达性（无 key 时对方返回 401 也算通）。
import { getKv, listAll } from "./_lib/kv.js";

const COUNTER_KEY = "kvprobe_count";
const SHAPE_KEY = "kvprobe_shape";

function getBinding(env) {
  return getKv(env);
}

export async function onRequestGet({ env }) {
  const result = { ok: false, kv: null, deepseek: null };
  const kv = getBinding(env);

  if (!kv) {
    return new Response(
      JSON.stringify({ ok: false, error: "NEXTPILOT_KV binding not found" }),
      { status: 500, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }

  try {
    const before = Number((await kv.get(COUNTER_KEY)) ?? 0);
    const after = before + 1;
    await kv.put(COUNTER_KEY, String(after));
    result.kv = { before, after };
  } catch (err) {
    result.kv = { error: String(err && err.message ? err.message : err) };
  }

  // KV 接口自查：list / get({type:"json"}) 的实际形状。
  // 平台若与官方文档有出入，这里能直接看出（/api/me 的配额计数依赖 list）。
  try {
    await kv.put(SHAPE_KEY, JSON.stringify({ t: "probe" }));
    const plain = await kv.get(SHAPE_KEY);
    const asJson = await kv.get(SHAPE_KEY, { type: "json" });
    const listed = await kv.list({ prefix: "kvprobe_", limit: 10 });
    result.kvApi = {
      getReturns: typeof plain === "string" ? "string" : typeof plain,
      getJsonType: asJson === null ? "null" : typeof asJson,
      listKeys: JSON.stringify(listed).slice(0, 600),
    };
  } catch (err) {
    result.kvApi = { error: String(err && err.message ? err.message : err) };
  }

  // 复现配额计数实际走的调用：listAll 的翻页参数
  try {
    result.listAll = { count: (await listAll(kv, "kvprobe_")).length };
  } catch (err) {
    result.listAll = { error: String(err && err.message ? err.message : err) };
  }
  // 匿名配额的前缀在新设备上是空结果——dump 空结果时 list 的原始返回
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
