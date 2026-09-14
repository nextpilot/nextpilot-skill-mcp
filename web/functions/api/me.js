// GET /api/me —— 当前身份与今日配额（登录用户与匿名设备都可访问）。
// 登录：按 uid 计 10 次/天；匿名：按请求头 x-device-id（localStorage 随机 ID）3 次/天，
// 服务端再叠加 IP 日上限防清 Cookie 绕过。每日重置。
import {
  getKv,
  listAll,
  usagePrefix,
  anonUsagePrefix,
  sanitizeDeviceId,
  dateStamp,
  FREE_DAILY_QUOTA,
  ANONYMOUS_DAILY_QUOTA,
} from "../_lib/kv.js";
import { getSessionUser } from "../_lib/auth.js";
import { jsonResponse } from "../_lib/http.js";

export async function onRequestGet({ request, env }) {
  const session = await getSessionUser(request, env);
  const kv = getKv(env);
  const day = dateStamp();

  if (session) {
    let used = 0;
    if (kv) used = (await listAll(kv, usagePrefix(session.uid, day))).length;
    return jsonResponse({
      user: {
        uid: session.uid,
        email: session.email,
        name: session.name,
        plan: session.plan,
      },
      quota: {
        day,
        used,
        limit: FREE_DAILY_QUOTA,
        anonymous: false,
        loginLimit: FREE_DAILY_QUOTA,
      },
    });
  }

  const deviceRaw = sanitizeDeviceId(request.headers.get("x-device-id") ?? "");
  let used = 0;
  if (kv && deviceRaw) {
    used = (await listAll(kv, anonUsagePrefix(deviceRaw, day))).length;
  }
  return jsonResponse({
    user: null,
    quota: {
      day,
      used,
      limit: ANONYMOUS_DAILY_QUOTA,
      anonymous: true,
      loginLimit: FREE_DAILY_QUOTA,
    },
  });
}
