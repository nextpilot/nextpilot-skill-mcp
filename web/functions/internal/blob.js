// GET/POST/DELETE /internal/blob —— EdgeOne Blob 存储管理（本地工具通过此端点操作）。
//
// 鉴权：必须携带 `x-internal-secret`，值与 AUTH_EDGE_SECRET 一致。
//
// 操作：
//   GET  ?store=X&key=Y           下载 blob 原始字节
//   GET  ?store=X&key=Y&type=json 以 JSON 类型读取
//   GET  ?store=X&prefix=Y        列出匹配前缀的 key（含子目录）
//   GET  ?store=X&stores=1        列出所有命名空间
//   POST ?store=X&key=Y           上传，body 为文件原始字节
//   POST ?store=X&key=Y&json=1    上传 JSON 对象（自动序列化）
//   DELETE ?store=X&key=Y         删除
//
// 可选参数：
//   consistency=strong            强一致性读取/列举
//   onlyIfNew=1                   仅在 Key 不存在时写入（条件写入）
//
// 依赖：@edgeone/pages-blob（EdgeOne Pages 边缘运行时内置）

import { getStore, listStores } from "@edgeone/pages-blob";
import { assertInternal } from "../_lib/http.js";

export async function onRequest({ request, env }) {
    if (!assertInternal(request, env)) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
            status: 403,
            headers: { "content-type": "application/json; charset=utf-8" },
        });
    }

    const url = new URL(request.url);
    const storeName = url.searchParams.get("store");
    const key = url.searchParams.get("key");
    const method = request.method.toUpperCase();
    const consistency = url.searchParams.get("consistency") === "strong" ? "strong" : "eventual";

    // ---- 列出命名空间 ----
    if (method === "GET" && url.searchParams.has("stores")) {
        try {
            const result = await listStores({ consistency });
            return new Response(JSON.stringify(result), {
                headers: { "content-type": "application/json; charset=utf-8" },
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: String(err && err.message ? err.message : err) }), {
                status: 500,
                headers: { "content-type": "application/json; charset=utf-8" },
            });
        }
    }

    if (!storeName) {
        return new Response(JSON.stringify({ error: "missing store" }), {
            status: 400,
            headers: { "content-type": "application/json; charset=utf-8" },
        });
    }

    const store = getStore(storeName);

    try {
        // ---- 下载 ----
        if (method === "GET" && key) {
            const readType = url.searchParams.get("type") || "arrayBuffer";
            const value = await store.get(key, { type: readType, consistency });
            if (value === null || value === undefined) {
                return new Response(JSON.stringify({ error: "not found" }), {
                    status: 404,
                    headers: { "content-type": "application/json; charset=utf-8" },
                });
            }
            // JSON 类型直接返回
            if (readType === "json") {
                return new Response(JSON.stringify(value), {
                    headers: { "content-type": "application/json; charset=utf-8" },
                });
            }
            // 字节流返回原始二进制
            const body = typeof value === "string" ? new TextEncoder().encode(value) : value;
            const contentType = key.endsWith(".wasm")
                ? "application/wasm"
                : key.endsWith(".whl") || key.endsWith(".zip")
                  ? "application/octet-stream"
                  : key.endsWith(".js")
                    ? "application/javascript"
                    : key.endsWith(".json")
                      ? "application/json"
                      : "application/octet-stream";
            return new Response(body, {
                headers: {
                    "content-type": contentType,
                    "cache-control": "public, max-age=31536000, immutable",
                },
            });
        }

        // ---- 列举（按前缀） ----
        if (method === "GET" && (url.searchParams.has("prefix") || url.searchParams.has("list"))) {
            const prefix = url.searchParams.get("prefix") || undefined;
            const result = await store.list({ prefix, directories: true, consistency });
            return new Response(JSON.stringify(result), {
                headers: { "content-type": "application/json; charset=utf-8" },
            });
        }

        // ---- 上传 ----
        if (method === "POST") {
            if (!key) {
                return new Response(JSON.stringify({ error: "missing key" }), {
                    status: 400,
                    headers: { "content-type": "application/json; charset=utf-8" },
                });
            }

            const setOptions = {};
            if (url.searchParams.get("onlyIfNew") === "1") {
                setOptions.onlyIfNew = true;
            }

            // JSON 模式
            if (url.searchParams.get("json") === "1") {
                const data = await request.json();
                await store.setJSON(key, data, setOptions);
                return new Response(JSON.stringify({ ok: true, key, type: "json" }), {
                    headers: { "content-type": "application/json; charset=utf-8" },
                });
            }

            // 二进制模式
            const buf = await request.arrayBuffer();
            await store.set(key, buf, setOptions);
            return new Response(JSON.stringify({ ok: true, key, size: buf.byteLength }), {
                headers: { "content-type": "application/json; charset=utf-8" },
            });
        }

        // ---- 删除 ----
        if (method === "DELETE") {
            if (!key) {
                return new Response(JSON.stringify({ error: "missing key" }), {
                    status: 400,
                    headers: { "content-type": "application/json; charset=utf-8" },
                });
            }
            await store.delete(key);
            return new Response(JSON.stringify({ ok: true, deleted: key }), {
                headers: { "content-type": "application/json; charset=utf-8" },
            });
        }

        return new Response(JSON.stringify({ error: "unsupported method" }), {
            status: 405,
            headers: { "content-type": "application/json; charset=utf-8" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: String(err && err.message ? err.message : err) }), {
            status: 500,
            headers: { "content-type": "application/json; charset=utf-8" },
        });
    }
}
