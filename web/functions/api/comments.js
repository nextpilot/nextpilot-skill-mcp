// Skill / MCP 评论（Edge Function，KV 存储）。
//   GET    /api/comments?kind=skill&slug=xxx   列表（匿名可读）
//   POST   /api/comments {kind, slug, content, parentId?}  需登录
//   DELETE /api/comments {kind, slug, id}      仅作者本人
//
// KV 键（仅字母数字下划线）：
//   cmt_{kind}_{slugKey}_{createdMs}_{shortId} = {id, uid, name, content, createdAt, parentId}
//   cmtq_{uid}_{day}_{shortId}                 发评论日计数（防刷）
import {
  getKv,
  listAll,
  sanitizeId,
  sha256Hex,
  dateStamp,
} from "../_lib/kv.js";
import { getSessionUser } from "../_lib/auth.js";
import { jsonResponse, readJson } from "../_lib/http.js";

const KINDS = new Set(["skill", "mcp"]);
const SLUG_RE = /^[a-z0-9-]{1,128}$/;
const MAX_LEN = 1000;
const DAILY_LIMIT = 20;
const MAX_LIST = 200;

const prefixOf = (kind, slugKey) => `cmt_${kind}_${slugKey}_`;

function parseKey(key) {
  const m = key.match(/^cmt_([a-z]+)_(.+)_(\d{13})_([A-Za-z0-9]+)$/);
  if (!m) return null;
  return { kind: m[1], slugKey: m[2], createdMs: Number(m[3]), shortId: m[4] };
}

export async function onRequestGet({ request, env }) {
  const kv = getKv(env);
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "skill";
  const slug = url.searchParams.get("slug") ?? "";
  if (!KINDS.has(kind) || !SLUG_RE.test(slug)) {
    return jsonResponse({ error: "bad kind/slug" }, 400);
  }
  if (!kv) return jsonResponse({ comments: [], total: 0 });

  const keys = await listAll(kv, prefixOf(kind, sanitizeId(slug)));
  const comments = [];
  for (const key of keys.slice(-MAX_LIST)) {
    const c = await kv.get(key, { type: "json" });
    if (c) comments.push(c);
  }
  comments.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

  const session = await getSessionUser(request, env);
  return jsonResponse({ comments, total: comments.length, viewerUid: session?.uid ?? null });
}

export async function onRequestPost({ request, env }) {
  const session = await getSessionUser(request, env);
  if (!session) return jsonResponse({ error: "请先登录后再评论" }, 401);

  const body = await readJson(request);
  const kind = body?.kind;
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const parentId = typeof body?.parentId === "string" ? body.parentId : null;

  if (!KINDS.has(kind) || !SLUG_RE.test(slug)) return jsonResponse({ error: "参数不合法" }, 400);
  if (!content) return jsonResponse({ error: "评论内容不能为空" }, 400);
  if (content.length > MAX_LEN) return jsonResponse({ error: `评论不超过 ${MAX_LEN} 字` }, 400);

  const kv = getKv(env);
  if (!kv) return jsonResponse({ error: "KV 未绑定，暂时无法评论" }, 503);

  const day = dateStamp();
  const usedToday = (await listAll(kv, `cmtq_${session.uid}_${day}_`)).length;
  if (usedToday >= DAILY_LIMIT) {
    return jsonResponse({ error: `今日评论次数已达上限（${DAILY_LIMIT} 条）` }, 429);
  }

  const now = Date.now();
  const shortId = (await sha256Hex(`${session.uid}${now}${content}`)).slice(0, 10);
  const record = {
    id: shortId,
    uid: session.uid,
    name: session.name ?? session.email ?? "飞手",
    content,
    createdAt: new Date(now).toISOString(),
    parentId,
  };
  const key = `${prefixOf(kind, sanitizeId(slug))}${now}_${shortId}`;
  await kv.put(key, JSON.stringify(record));
  await kv.put(`cmtq_${session.uid}_${day}_${shortId}`, String(now));

  return jsonResponse({ ok: true, comment: record });
}

export async function onRequestDelete({ request, env }) {
  const session = await getSessionUser(request, env);
  if (!session) return jsonResponse({ error: "请先登录" }, 401);

  const body = await readJson(request);
  const kind = body?.kind;
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const id = typeof body?.id === "string" ? body.id : "";
  if (!KINDS.has(kind) || !SLUG_RE.test(slug) || !id) {
    return jsonResponse({ error: "参数不合法" }, 400);
  }

  const kv = getKv(env);
  if (!kv) return jsonResponse({ error: "KV 未绑定" }, 503);

  const keys = await listAll(kv, prefixOf(kind, sanitizeId(slug)));
  for (const key of keys) {
    const parsed = parseKey(key);
    if (!parsed || parsed.shortId !== id) continue;
    const c = await kv.get(key, { type: "json" });
    if (!c) continue;
    if (c.uid !== session.uid) return jsonResponse({ error: "只能删除自己的评论" }, 403);
    await kv.delete(key);
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: "评论不存在" }, 404);
}
