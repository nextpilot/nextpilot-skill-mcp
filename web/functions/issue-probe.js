// GET /issue-probe —— 报错上报链路的自检探针。
//
// 与根级的 /ping、/kv-probe 同类：部署后访问一次，确认"配好了"和"真能通"是两件事。
// 只返回配置与状态码，**从不回显 token 本身**。
//
//   GET /issue-probe            只读探测：配置齐不齐、仓库能不能读到
//   GET /issue-probe?write=1    真发一次创建（需要 ISSUE_DEBUG=1）
//
// 为什么要有 write 档：Gitee 的 `POST /repos/{owner}/{repo}/issues` 与同路径的 GET
// 表现可能不一致（gitee.com/oschina/git-osc/issues/IJZAPB 报告带 access_token 的 POST
// 一律返回 `404 project or enterprise`，而 GET 全部正常）。只读探测通，不代表能写。
//
// write 档走的是正常上报路径（同一指纹、同一去重），所以反复自检只会建**一个** issue，
// 之后都是追加评论，不会污染列表。
import { getKv, listAll } from "./_lib/kv.js";
import { jsonResponse } from "./_lib/http.js";
import { probeConfig, reportIssue } from "./_lib/issue-filer.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const out = await probeConfig(env);

  // 最近的上报失败：errx_{毫秒}_{随机}，同长度毫秒前缀的字典序即时间序，取尾部即可
  const kv = getKv(env);
  if (kv) {
    try {
      const keys = await listAll(kv, "errx_");
      const recent = [];
      for (const key of keys.slice(-5).reverse()) {
        const raw = await kv.get(key).catch(() => null);
        if (!raw) continue;
        try {
          recent.push(JSON.parse(raw));
        } catch {
          recent.push({ stage: "unknown", raw: String(raw).slice(0, 200) });
        }
      }
      out.recentFailures = recent;
    } catch {
      out.recentFailures = [];
    }
  }

  if (url.searchParams.get("write") === "1") {
    if (String(env?.ISSUE_DEBUG ?? "") !== "1") {
      out.writeTest = { skipped: "需要先设 ISSUE_DEBUG=1 再访问" };
    } else {
      out.writeTest = await reportIssue(env, {
        kind: "server-error",
        level: "fatal",
        type: "SelfCheck",
        message: "上报链路自检（来自 /issue-probe）",
        stack: "at /issue-probe",
        route: "/issue-probe",
        version: "probe",
      });
    }
  }

  return jsonResponse(out);
}
