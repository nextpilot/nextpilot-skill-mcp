// 冲刺 2 阶段 0 Spike：验证 KV 绑定读写 + 边缘函数外网 fetch（DeepSeek 连通性）。
// 控制台需先开通 KV、创建 namespace（nextpilot_main）并绑定到本项目，变量名 NEXTPILOT_KV。
// 访问 GET /kv-probe 每次计数 +1，并探测 DeepSeek API 的可达性（无 key 时对方返回 401 也算通）。

const COUNTER_KEY = "kvprobe_count";

function getBinding(env) {
  // 官方示例中绑定变量以全局方式注入，同时也可能挂在 env 上，两种都兼容
  return globalThis.NEXTPILOT_KV ?? env?.NEXTPILOT_KV ?? null;
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
