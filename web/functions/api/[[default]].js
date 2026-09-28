// /api/<任意层级> 的兜底边缘函数。
//
// EdgeOne 边缘函数按目录结构生成路由：精确文件（api/me.js → /api/me）优先，
// 没命中的落到本文件（官方文档：api/[[default]].js 匹配 /api/books/list、/api/1024）。
//
// 用途：接住 `/api/reports/<id>`（报告详情/删除）。该路径需要子目录文件
// （api/reports/[id].js），但线上实测 EdgeOne **不部署与同名文件共存的子目录**
// （api/reports.js 存在时，api/reports/ 整个目录被丢弃），故改由本兜底文件承接：
// 按路径把 /api/reports/<id> 转发给 reports.js 里的同一份逻辑。
import { onRequestGet as reportsGet, onRequestDelete as reportsDelete } from "./reports.js";

export async function onRequestGet(ctx) {
    const segs = new URL(ctx.request.url).pathname.split("/").filter(Boolean);
    // /api/reports/<id> → 交给 reports 的详情分支（其内部按 URL 尾段分流）
    if (segs[0] === "api" && segs[1] === "reports" && segs.length >= 3) {
        return reportsGet(ctx);
    }
    return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
    });
}

export async function onRequestDelete(ctx) {
    const segs = new URL(ctx.request.url).pathname.split("/").filter(Boolean);
    if (segs[0] === "api" && segs[1] === "reports" && segs.length >= 3) {
        return reportsDelete(ctx);
    }
    return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
    });
}
