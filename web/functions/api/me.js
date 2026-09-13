// GET /api/me —— 返回当前登录用户与本月免费配额使用情况。
import { getKv, listAll, usagePrefix, FREE_MONTHLY_QUOTA, monthStamp } from "../_lib/kv.js";
import { getSessionUser } from "../_lib/auth.js";
import { jsonResponse } from "../_lib/http.js";

export async function onRequestGet({ request, env }) {
  const session = await getSessionUser(request, env);
  if (!session) return jsonResponse({ user: null }, 401);

  const kv = getKv(env);
  let used = 0;
  if (kv) {
    const month = monthStamp();
    const keys = await listAll(kv, usagePrefix(session.uid, month));
    used = keys.length;
  }

  return jsonResponse({
    user: {
      uid: session.uid,
      email: session.email,
      name: session.name,
      plan: session.plan,
    },
    quota: { month: monthStamp(), used, limit: FREE_MONTHLY_QUOTA },
  });
}
