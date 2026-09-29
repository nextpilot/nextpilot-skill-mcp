// POST /internal/settings/get：Node 侧 SSR 读取站点设置（持 AUTH_EDGE_SECRET 调用）。
//
// 为什么要绕这一层：KV 只能在边缘运行时访问，Next 的 Node 侧（generateMetadata / RSC）
// 拿不到绑定，只能同源 fetch 进来。返回 null 不等于出错，那是"后台还没存过"，
// 调用方会回落到 site-config.ts 的静态默认值。
import { getKv } from "../../_lib/kv.js";
import { jsonResponse, assertInternal } from "../../_lib/http.js";
import { SETTINGS_KEY } from "../../_lib/settings-schema.js";

export async function onRequestPost({ request, env }) {
    if (!assertInternal(request, env)) return jsonResponse({ error: "forbidden" }, 403);

    const kv = getKv(env);
    if (!kv) return jsonResponse({ settings: null, reason: "kv-missing" }, 200);

    const raw = await kv.get(SETTINGS_KEY, { type: "json" }).catch(() => null);
    return jsonResponse({ settings: raw && typeof raw === "object" ? raw : null });
}
