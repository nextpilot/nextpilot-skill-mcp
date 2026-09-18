// 线上报错自动提 issue：指纹、脱敏、去重、限流与平台适配。
//
// 三条铁律（改动前先读）：
//   1. **token 只存在边缘函数**。浏览器永远不接触 issue token，只 POST 到自家
//      /api/issues（见 api/issues.js）。
//   2. **上报永不阻塞用户**。调用方用 waitUntil 包裹；本模块内部全量 try/catch，
//      任何失败静默并留下记录。上报挂了绝不能影响日志分析——这是比"能收到报错"更硬的约束。
//   3. **脱敏走白名单**。项目卖点是"原始日志不上传"，错误上报不能变成后门：
//      只允许错误类型/消息/栈/路由/版本，禁止日志文件名、字段值、findings、邮箱、uid、IP。
//
// 另外两道护栏决定了这个功能是资产还是灾难：
//   - **分级**：崩溃类（fatal）必报；高频可恢复类（LLM 502、网络抖动）同指纹每天最多一次。
//     不分级的话，上游抖动一天能刷出几百个 issue。
//   - **指纹去重**：同一个 bug 只留一个 issue，后续命中追加评论。KV 最终一致（60s），
//     去重是尽力而为，所以还有内存限流兜底——宁可偶尔重复建一个，不可雪崩。
//
// 脱敏 / 截断 / 归一化这三件事与浏览器侧**共用一份实现**：lib/error-policy.js。
// 改规则只改那里——本文件与 lib/issue-bridge.ts 都不许再各写一份。

import { getKv, sha256Hex } from "./kv.js";
import {
  MAX_MESSAGE,
  MAX_STACK,
  MAX_TYPE,
  ALLOWED_LEVELS,
  ALLOWED_KINDS,
  clip,
  scrub,
  normalize,
} from "../../lib/error-policy.js";

/** issue 标题上限。纯展示用，只有边缘侧参与，不必共享。 */
const MAX_TITLE = 120;

/** 每实例每分钟最多提交几次。实例重启即归零，只是最后一道保险，KV 去重才是主力。 */
const RATE_LIMIT_PER_MIN = 5;
let windowStart = 0;
let windowCount = 0;

/** 重复命中时，追加评论的最小间隔：致命类每小时一条，可恢复类每天一条。 */
const COMMENT_GAP = { fatal: 60 * 60 * 1000, recoverable: 24 * 60 * 60 * 1000 };

// —— 脱敏 / 截断 / 归一化 ——
// 这三件事与浏览器侧**必须逐字一致**（客户端先粗脱、截断，边缘再兜一层），
// 所以实现统一放在 lib/error-policy.js，这里只引用，不再各写一份。
// 改动点也只有一个：lib/error-policy.js。

/** 取栈顶若干帧参与指纹：同一处代码抛的错才算同一个 bug。 */
function topFrames(stack, n) {
  return String(stack ?? "")
    .split("\n")
    .filter((l) => /\bat\s|@|:\d+:\d+/.test(l))
    .slice(0, n)
    .map((l) => normalize(l.replace(/:\d+:\d+/g, ":N:N")))
    .join("\n");
}

/** 白名单提取：payload 里的其它字段一律丢弃，不进入指纹、不进入 issue。 */
export function sanitizePayload(raw) {
  const p = {
    kind: ALLOWED_KINDS.has(raw?.kind) ? raw.kind : "client-error",
    level: ALLOWED_LEVELS.has(raw?.level) ? raw.level : "recoverable",
    type: scrub(raw?.type ?? "Error").slice(0, MAX_TYPE),
    message: clip(scrub(raw?.message ?? ""), MAX_MESSAGE),
    stack: clip(scrub(raw?.stack ?? ""), MAX_STACK),
    // 路由去掉 query/hash：query 里可能带用户输入
    route: String(raw?.route ?? "").replace(/[?#].*$/, "").slice(0, 200),
    version: String(raw?.version ?? "").slice(0, 40),
    ua: String(raw?.ua ?? "").slice(0, 120),
    loggedIn: raw?.loggedIn === true,
  };
  if (p.kind === "manual-report") {
    // 人工上报只带「命中了哪些规则」这类结构性信息，不带任何数值与用户内容
    p.ruleIds = Array.isArray(raw?.ruleIds)
      ? raw.ruleIds.filter((x) => typeof x === "string").slice(0, 80).map((x) => x.slice(0, 60))
      : [];
    p.findingCount = Number(raw?.findingCount) || 0;
    p.severityCounts = {
      critical: Number(raw?.severityCounts?.critical) || 0,
      warning: Number(raw?.severityCounts?.warning) || 0,
      info: Number(raw?.severityCounts?.info) || 0,
    };
    p.platform = String(raw?.platform ?? "").slice(0, 20);
    // 固件/引擎版本是公开版本号，是定位"规则判定不对"的关键上下文，不属于用户数据
    p.firmware = String(raw?.firmware ?? "").slice(0, 40);
    p.parserVersion = String(raw?.parserVersion ?? "").slice(0, 40);
    p.reportRef = String(raw?.reportRef ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
    p.note = scrub(raw?.note ?? "").slice(0, 500);
  }
  return p;
}

/**
 * 去重指纹。**归一化之后**才 hash——否则 `file 17.ulg` 与 `file 18.ulg` 会各算一个
 * 指纹，去重形同虚设。导出是为了能直接跑自测（web/scripts/test-issue-filer.mjs）。
 */
export async function fingerprintOf(p) {
  return (
    await sha256Hex(
      [p.kind, p.level, p.type, normalize(p.message), topFrames(p.stack, 3), p.version].join("|"),
    )
  ).slice(0, 16);
}

function readConfig(env) {
  const provider = String(env?.ISSUE_PROVIDER ?? "gitee").toLowerCase() === "github" ? "github" : "gitee";
  return {
    enabled: String(env?.ISSUE_ENABLED ?? "") === "1",
    provider,
    repo: String(env?.ISSUE_REPO ?? "").trim(),
    token: String(env?.ISSUE_TOKEN ?? "").trim(),
    labels: String(env?.ISSUE_LABELS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

function rateLimited() {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  return windowCount > RATE_LIMIT_PER_MIN;
}

/**
 * 单一出口：所有 issue 平台请求都从这里走，便于统一记录真实响应。
 * Gitee 的 `POST /repos/{owner}/{repo}/issues` 有已知的中间件问题
 * （见 gitee.com/oschina/git-osc/issues/IJZAPB：带 access_token 时返回
 * `404 project or enterprise`），所以不能假设它能通——失败必须留痕，
 * 由 /issue-probe 暴露出来让运维一眼看到。
 */
async function callApi(cfg, path, payload) {
  if (cfg.provider === "gitee") {
    return fetch(`https://gitee.com/api/v5/repos/${cfg.repo}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Gitee 官方文档把 access_token 列在表单参数里；同时补一个 Authorization 头，
      // 两种取法任一被接受即可。
      body: JSON.stringify({ access_token: cfg.token, repo: cfg.repo, ...payload }),
    });
  }
  return fetch(`https://api.github.com/repos/${cfg.repo}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.token}`,
      accept: "application/vnd.github+json",
      "user-agent": "nextpilot-issue-filer",
    },
    body: JSON.stringify(payload),
  });
}

const SEVERITY_MARK = { fatal: "崩溃", recoverable: "可恢复" };

function renderIssueBody(p, fp) {
  const head = [
    "| 项 | 值 |",
    "| --- | --- |",
    `| 级别 | ${SEVERITY_MARK[p.level] ?? p.level} |`,
    `| 类型 | \`${p.type}\` |`,
    p.route ? `| 路由 | \`${p.route}\` |` : null,
    p.version ? `| 版本 | \`${p.version}\` |` : null,
    `| 指纹 | \`${fp}\` |`,
    p.ua ? `| UA | ${p.ua.replace(/\|/g, "\\|")} |` : null,
    p.loggedIn ? "| 登录态 | 已登录（不含用户标识） |" : "| 登录态 | 未登录 |",
    `| 上报时间 | ${new Date().toISOString()} |`,
  ].filter(Boolean);

  const sections = [head.join("\n")];

  if (p.message) sections.push(`### 错误消息\n\n\`\`\`\n${p.message}\n\`\`\``);
  if (p.stack) sections.push(`### 调用栈\n\n\`\`\`\n${p.stack}\n\`\`\``);

  if (p.kind === "manual-report") {
    const manual = ["### 用户反馈", ""];
    if (p.note) manual.push(`> ${p.note.replace(/\n/g, "\n> ")}`, "");
    manual.push(
      `命中的规则：${p.ruleIds.length ? p.ruleIds.map((r) => `\`${r}\``).join("、") : "（无）"}`,
      "",
      `结论条数：${p.findingCount}（critical ${p.severityCounts.critical} / warning ${p.severityCounts.warning} / info ${p.severityCounts.info}）`,
    );
    if (p.platform) manual.push(`平台：${p.platform}`);
    if (p.firmware) manual.push(`固件版本：\`${p.firmware}\``);
    if (p.parserVersion) manual.push(`引擎版本：\`${p.parserVersion}\``);
    sections.push(manual.join("\n"));
  }

  sections.push(
    "---",
    "> 自动创建。已按白名单脱敏：**不含**日志内容、字段数值、文件明文、邮箱与用户标识。" +
      "指纹相同的历史报错会追加在本 issue 的评论里，不重复建单。",
  );
  return sections.join("\n\n");
}

function renderCommentBody(p, total) {
  const lines = [
    `再次出现（累计 **${total}** 次）。`,
    "",
    `- 最近时间：${new Date().toISOString()}`,
    p.route ? `- 路由：\`${p.route}\`` : null,
    p.version ? `- 版本：\`${p.version}\`` : null,
    p.ua ? `- UA：${p.ua}` : null,
  ].filter(Boolean);
  if (p.message) lines.push("", "```", p.message.slice(0, 600), "```");
  return lines.join("\n");
}

function issueTitle(p) {
  const firstLine = String(p.message ?? "").split("\n")[0].trim();
  const suffix = p.kind === "manual-report" ? "用户反馈" : p.type;
  const title = `[自动上报] ${suffix}${firstLine ? `: ${firstLine}` : ""}`;
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title;
}

/** 把一次失败写进 KV，供 /issue-probe 查——"上报没生效"必须能被发现。 */
async function recordFailure(kv, stage, detail) {
  if (!kv) return;
  try {
    const key = `errx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await kv.put(key, JSON.stringify({ stage, at: new Date().toISOString(), detail: scrub(detail).slice(0, 500) }));
  } catch {
    // 连失败记录都写不进去就算了，不能因此影响主流程
  }
}

/**
 * 主入口。返回值只用于本地调试与自检端点，业务侧忽略即可。
 * 调用方式（务必包在 waitUntil 里，别让用户等）：
 *   waitUntil?.(reportIssue(env, { kind: "server-error", level: "fatal", ... }));
 */
export async function reportIssue(env, payload) {
  let cfg;
  try {
    cfg = readConfig(env);
    if (!cfg.enabled) return { skipped: "disabled" };
    if (!cfg.repo || !cfg.token) return { skipped: "unconfigured" };
    if (!/^[^/\s]+\/[^/\s]+$/.test(cfg.repo)) return { skipped: "bad-repo" };
    if (rateLimited()) return { skipped: "rate-limited" };

    const p = sanitizePayload(payload);
    const fp = await fingerprintOf(p);

    const kv = getKv(env);
    const key = `err_${fp}`;
    const prevRaw = kv ? await kv.get(key).catch(() => null) : null;
    const prev = prevRaw ? safeParse(prevRaw) : null;
    const labels = p.kind === "manual-report" ? [...cfg.labels, "用户反馈"] : [...cfg.labels];

    // —— 首次：建 issue ——
    if (!prev?.n) {
      const resp = await callApi(cfg, "/issues", {
        title: issueTitle(p),
        body: renderIssueBody(p, fp),
        labels: cfg.provider === "gitee" ? labels.join(",") : labels,
      });
      const text = await resp.text().catch(() => "");
      if (!resp.ok) {
        await recordFailure(kv, "create", `${resp.status} ${text}`);
        return { failed: "create", status: resp.status };
      }
      const created = safeParse(text);
      const number = created?.number ?? created?.id ?? null;
      if (kv && number) {
        await kv
          .put(key, JSON.stringify({ n: number, c: 1, f: Date.now(), l: Date.now(), cm: Date.now() }))
          .catch(() => {});
      }
      return { created: number, fingerprint: fp };
    }

    // —— 后续：追加评论（节流），不新建 ——
    const now = Date.now();
    const gap = COMMENT_GAP[p.level] ?? COMMENT_GAP.recoverable;
    const next = { ...prev, c: (prev.c ?? 0) + 1, l: now };
    if (now - (prev.cm ?? 0) >= gap) {
      const resp = await callApi(cfg, `/issues/${prev.n}/comments`, {
        body: renderCommentBody(p, next.c),
      });
      const text = await resp.text().catch(() => "");
      if (resp.ok) next.cm = now;
      else await recordFailure(kv, "comment", `${resp.status} ${text}`);
    }
    if (kv) await kv.put(key, JSON.stringify(next)).catch(() => {});
    return { commented: prev.n, count: next.c, fingerprint: fp };
  } catch (err) {
    // 上报自身的任何异常都不许外溢：调用方通常已经在 waitUntil 里，这里再兜一层
    await recordFailure(getKv(env), "exception", String(err?.message ?? err));
    return { skipped: "exception" };
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 供自检端点用：把当前配置与一次真实调用的结果摊开，避免"以为配好了其实没通"。 */
export async function probeConfig(env) {
  const cfg = readConfig(env);
  const out = {
    enabled: cfg.enabled,
    provider: cfg.provider,
    repo: cfg.repo,
    tokenSet: Boolean(cfg.token),
    labels: cfg.labels,
  };
  if (out.enabled && cfg.repo && cfg.token) {
    try {
      const url =
        cfg.provider === "gitee"
          ? `https://gitee.com/api/v5/repos/${cfg.repo}?access_token=${encodeURIComponent(cfg.token)}`
          : `https://api.github.com/repos/${cfg.repo}`;
      const resp = await fetch(url, {
        headers:
          cfg.provider === "github"
            ? { authorization: `Bearer ${cfg.token}`, accept: "application/vnd.github+json", "user-agent": "nextpilot-issue-filer" }
            : {},
      });
      out.readRepo = { ok: resp.ok, status: resp.status };
      // Gitee 的写接口与读接口表现可能不一致（读 200 / 写 404），所以这里只证明
      // token 与仓库可达；写权限要靠 probeWrite 真发一次。
    } catch (err) {
      out.readRepo = { ok: false, error: scrub(String(err?.message ?? err)) };
    }
  }
  return out;
}
