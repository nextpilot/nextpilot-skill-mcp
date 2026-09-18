// 报错上报的自测：不联网、不起服务，直接验证最容易写错的四件事——
//   1. 指纹是否真的归一化（否则去重形同虚设，一个 bug 刷出几百个 issue）
//   2. 脱敏是否真生效（否则公开的 Gitee 仓库会泄露用户信息）
//   3. 白名单是否真挡住额外字段（前端或第三方可以随便往 payload 里塞东西）
//   4. 超长文本截断后，末尾的关键行是否还在（Python traceback 的异常行在最后）
//
// 末尾三节（§[9] / §[10] / §[11]）性质不同：它们不测行为，而是**扫源码防架构回潮**——
//   §[9]  两侧共用的政策只许有一份实现（防止再长出第二份，悄悄分叉）；
//   §[10] 外部 JSON 进内部类型必须过归一、不许 `as` 强转（线上白屏过一次）；
//   §[11] 派生数据（曲线/轨迹）必须按报告身份清理（切了日志还在用上一份的，静默错数据）。
// 这三类问题都属于"同一件事有两条路径、只有一条被校验"，本仓库已经因此出过几次事故，
// 光靠人记没用，所以做成机器能拦的守卫。
//
// 跑法：node web/scripts/test-issue-filer.mjs
import {
  sanitizePayload,
  fingerprintOf,
  reportIssue,
} from "../functions/_lib/issue-filer.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// 脱敏/截断是两侧**共用**的那一份（浏览器侧 lib/issue-bridge.ts 也引它），
// 所以直接对共享模块验证——它错了，两边一起错，这一节必须守住。
import { scrub, SCRUB_RULES } from "../lib/error-policy.js";

let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${extra ? `  → ${extra}` : ""}`);
  }
}

/** 读 web/ 下的源码（末尾几节的静态守卫用；路径相对本文件，即 web/scripts/） */
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

console.log("\n[1] 指纹归一化（决定去重成不成立）");
{
  const a = await fingerprintOf(
    sanitizePayload({
      level: "fatal",
      type: "ParseError",
      message: "failed to parse file 17.ulg at 2026-09-18T10:00:00Z",
    }),
  );
  const b = await fingerprintOf(
    sanitizePayload({
      level: "fatal",
      type: "ParseError",
      message: "failed to parse file 18.ulg at 2026-09-18T11:22:33Z",
    }),
  );
  const c = await fingerprintOf(
    sanitizePayload({ level: "fatal", type: "ParseError", message: "entirely different failure" }),
  );
  const d = await fingerprintOf(
    sanitizePayload({ level: "recoverable", type: "ParseError", message: "entirely different failure" }),
  );
  check("同型错误、不同文件名与时间 → 同指纹", a === b, `${a} vs ${b}`);
  check("不同错误 → 不同指纹", a !== c);
  check("只差级别 → 不同指纹", c !== d);
}

console.log("\n[2] 脱敏（决定公开 issue 会不会泄露用户信息）");
{
  const s = scrub(
    "mail zhang@example.com jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijk " +
      "win C:\\Users\\zhangfuyu\\logs\\flight.ulg nix /home/zhangfuyu/flight.ulg " +
      "ip 192.168.1.10 hash 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b",
  );
  check("邮箱", !s.includes("zhang@example.com"), s);
  check("JWT", !s.includes("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0"), s);
  check("Windows 用户目录（含用户名）", !s.includes("zhangfuyu"), s);
  check("内网 IP", !s.includes("192.168.1.10"), s);
  check("长 hex（可能是密钥/指纹）", !s.includes("9f86d081884c7d65"), s);

  // 客户端先脱 + 边缘再脱 —— 这条链要求 scrub 幂等，否则第二遍会把第一遍的
  // 占位符再加工一次，两侧对同一份输入的结果就分道扬镳（JWT 变半截 hex 那类）。
  check("二次脱敏幂等（客户端先脱 + 边缘再脱 = 只脱一次）", scrub(s) === s, scrub(s).slice(0, 160));
  check("JWT 在整条链里保持 jwt 占位符（没被宽泛的长 hex 规则先咬掉）", s.includes("<jwt>"), s);
}

// 幂等的**结构证明**：任何一条规则的替换产物，都不该被（含它自己在内的）任何规则
// 再匹配一次。这条成立，"客户端先脱 + 边缘再脱"就恒等于"只脱一次"，
// 而不是只对上面那一条样例成立。
{
  const unstable = [];
  for (const [, rep] of SCRUB_RULES) {
    for (const [re] of SCRUB_RULES) {
      re.lastIndex = 0;
      if (re.test(rep)) unstable.push(`${rep} 又被 ${String(re)} 匹配`);
    }
  }
  check("替换产物不再被任何规则匹配（结构性幂等）", unstable.length === 0, unstable.join("; "));
}

console.log("\n[3] 白名单（决定第三方能不能往 issue 里塞东西）");
{
  const p = sanitizePayload({
    kind: "client-error",
    level: "fatal",
    type: "Error",
    message: "boom",
    // 下面这些都必须被丢掉
    fileName: "secret-flight.ulg",
    findings: [{ value: 42 }],
    evidence: { field: "x", value: 1 },
    uid: "u123",
    email: "a@b.com",
    logHash: "9f86d081884c7d65",
  });
  check("未知字段全部丢弃", !("fileName" in p) && !("findings" in p) && !("uid" in p) && !("evidence" in p) && !("logHash" in p));
  check("白名单字段保留", p.type === "Error" && p.message === "boom" && p.level === "fatal");
  check("非法 level 兜底为 recoverable", sanitizePayload({ level: "whatever" }).level === "recoverable");
  check("非法 kind 兜底为 client-error", sanitizePayload({ kind: "evil" }).kind === "client-error");
}

console.log("\n[4] 超长文本截断（Python traceback 的关键行在末尾）");
{
  const tail = "NameError: name '__FACTS__' is not defined";
  const p = sanitizePayload({ message: `${"z".repeat(3000)}\n${tail}` });
  check("末尾的关键行被保留", p.message.includes("NameError"), `长度 ${p.message.length}`);
  check("截断处有标记", p.message.includes("已截断"), `长度 ${p.message.length}`);
  check("总长受控", p.message.length < 1200, `长度 ${p.message.length}`);
}

console.log("\n[5] 未配置时完全 no-op（本地开发不该往库里写东西）");
{
  const r1 = await reportIssue({}, { level: "fatal", type: "X", message: "y" });
  check("未开 ISSUE_ENABLED → disabled", r1.skipped === "disabled", JSON.stringify(r1));
  const r2 = await reportIssue({ ISSUE_ENABLED: "1" }, { level: "fatal", type: "X", message: "y" });
  check("开了但缺 repo/token → unconfigured", r2.skipped === "unconfigured", JSON.stringify(r2));
  const r3 = await reportIssue(
    { ISSUE_ENABLED: "1", ISSUE_REPO: "not-a-repo", ISSUE_TOKEN: "t" },
    { level: "fatal", type: "X", message: "y" },
  );
  check("repo 格式不对 → bad-repo", r3.skipped === "bad-repo", JSON.stringify(r3));
}

console.log("\n[6] 建单链路（stub fetch，不联网）");
{
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ number: 42 }), { status: 201 });
  };
  try {
    const r = await reportIssue(
      {
        ISSUE_ENABLED: "1",
        ISSUE_PROVIDER: "gitee",
        ISSUE_REPO: "nextpilot/nextpilot-skill-mcp",
        ISSUE_TOKEN: "tk",
        ISSUE_LABELS: "auto-report",
      },
      {
        kind: "client-error",
        level: "fatal",
        type: "ParseError",
        message: "boom",
        stack: "at x.js:1:1",
        route: "/analyze",
        fileName: "secret-flight.ulg",
      },
    );
    check("首次命中 → 建 issue 并带回 issue 号", r.created === 42, JSON.stringify(r));
    check(
      "URL 打到 Gitee 的 issues 端点",
      calls[0]?.url === "https://gitee.com/api/v5/repos/nextpilot/nextpilot-skill-mcp/issues",
      calls[0]?.url,
    );
    const body = JSON.parse(calls[0].init.body);
    check(
      "body 带 access_token 与 repo",
      body.access_token === "tk" && body.repo === "nextpilot/nextpilot-skill-mcp",
    );
    check("标题带 [自动上报] 前缀", String(body.title).startsWith("[自动上报]"), body.title);
    check(
      "labels 以逗号串传（Gitee 要字符串，GitHub 要数组）",
      typeof body.labels === "string" && body.labels.includes("auto-report"),
      body.labels,
    );
    check("issue 正文里没有混进 fileName", !body.body.includes("secret-flight"), body.body);
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log("\n[7] 去重与评论节流（stub fetch + 假 KV）");
{
  const store = new Map();
  const fakeKv = {
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => {
      store.set(k, String(v));
    },
    list: async () => ({ keys: [], complete: true }),
  };
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ number: 77 }), { status: 201 });
  };
  const env = {
    ISSUE_ENABLED: "1",
    ISSUE_PROVIDER: "gitee",
    ISSUE_REPO: "a/b",
    ISSUE_TOKEN: "tk",
    NEXTPILOT_KV: fakeKv,
  };
  const payload = {
    kind: "client-error",
    level: "fatal",
    type: "ParseError",
    message: "same bug",
    stack: "at x.js:1:1",
  };
  try {
    const r1 = await reportIssue(env, payload);
    check("第一次：建 issue", r1.created === 77 && calls.length === 1, JSON.stringify(r1));

    const r2 = await reportIssue(env, payload);
    check(
      "第二次：同指纹，不新建也不刷评论（节流窗内）",
      r2.commented === 77 && calls.length === 1,
      JSON.stringify(r2),
    );
    check("累计计数递增", r2.count === 2, JSON.stringify(r2));

    // 把上次评论时间推到 2 小时前，模拟节流窗过期
    const key = [...store.keys()].find((k) => k.startsWith("err_"));
    const rec = JSON.parse(store.get(key));
    rec.cm = Date.now() - 2 * 3600 * 1000;
    store.set(key, JSON.stringify(rec));

    const r3 = await reportIssue(env, payload);
    check(
      "节流过期后：追加评论到同一个 issue（不是新建）",
      calls.length === 2 && calls[1].url === "https://gitee.com/api/v5/repos/a/b/issues/77/comments",
      `${JSON.stringify(r3)} / ${calls[1]?.url}`,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log("\n[8] 人工上报 payload");
{
  const p = sanitizePayload({
    kind: "manual-report",
    ruleIds: ["vibration-high", "ekf-innovation"],
    findingCount: 3,
    severityCounts: { critical: 1, warning: 2, info: 0 },
    note: "振动结论与实飞现象不符",
    platform: "PX4",
    firmware: "e82c4e1a1f8e",
  });
  check("规则 id 保留", p.ruleIds.length === 2, JSON.stringify(p.ruleIds));
  check("固件版本保留（定位判定问题的关键上下文）", p.firmware === "e82c4e1a1f8e", p.firmware);
  check(
    "severityCounts 归一化",
    p.severityCounts.critical === 1 && p.severityCounts.warning === 2 && p.severityCounts.info === 0,
  );
  check("kind 识别为 manual-report", p.kind === "manual-report");
}

console.log("\n[9] 两侧共用同一份政策（防止再长出第二份实现）");
{
  const browserSrc = read("../lib/issue-bridge.ts");
  const edgeSrc = read("../functions/_lib/issue-filer.js");

  // 这些字面量只许活在 lib/error-policy.js 里。谁再抄一份脱敏/截断实现进来，
  // 这里立刻红 —— "两份实现悄悄分叉"唯一能被机器抓住的地方就在这里。
  const markers = ["（已截断", "<jwt>", "<email>", "<home>", "<ip>", "0xH"];
  for (const [name, src] of [
    ["浏览器侧 lib/issue-bridge.ts", browserSrc],
    ["边缘侧 functions/_lib/issue-filer.js", edgeSrc],
  ]) {
    const dup = markers.filter((m) => src.includes(m));
    check(`${name} 没有自带一份实现`, dup.length === 0, dup.join(", "));
  }
  check("浏览器侧引用共享政策", browserSrc.includes('from "./error-policy.js"'));
  check("边缘侧引用共享政策", edgeSrc.includes('"../../lib/error-policy.js"'));
}

console.log("\n[10] 外部数据的读取边界（网络响应与存档一律过归一，不许强转）");
{
  const fs = await import("node:fs");
  const nodePath = await import("node:path");
  const webDir = fileURLToPath(new URL("..", import.meta.url));

  // 背景（线上真炸过）：SavedReport 有一半来自**外部 JSON**——
  //   · 索引库里的老记录（早期版本没有 findings 字段，还有从 localStorage 迁移来的）
  //   · /api/reports/:id 取回的云端 KV 记录（TTL 7 天，里面可能是任意历史版本写的）
  // 这些 JSON 到了前端，TypeScript 一点用都没有。以前靠 `as SavedReport` 强转接住，
  // 缺字段的报告就一路走到 AnalyzeReport 的 `report.findings.filter` 才崩（GeneralInfo 白屏）。
  // 同一个坑在 lib/community-stats.ts（`(await resp.json()) as RatingStats`）和
  // lib/internal-kv.ts（`r.user as InternalUser`）各有一份。规则写在 CLAUDE.md §6.5，
  // 这里把它变成机器能查的两条：
  //   ① **读边界的同一行**不许出现 `as <具名类型>`。读边界的标记见 BOUNDARY_READS。
  //      漏网形态：`const r = await callInternal(...)` 之后再过一行 `r.user as InternalUser` ——
  //      那种靠 ② 兜。
  //   ② **有唯一闸门的内部形状**（GATED_TYPES），任何位置的 `as <类型>` 都违规。
  //      新增一条链时把类型名加进这张表；没进表的形状只能靠 ① 抓，能不能抓到取决于写法。
  // `as unknown` / `as Record<…>` 放行，但它们只该活在归一函数内部。
  // 已知局限：两条都按**行**匹配，把 `as` 换行写就查不出来——那是刻意绕过，不是手滑。
  const UNTYPED_CAST = /as\s+(?:Record\s*<|unknown\b|any\b)/;
  const NAMED_CAST = /\bas\s+[A-Za-z_$][\w$]*/;
  const BOUNDARY_READS = [".json()", "callInternal("];
  const GATED_TYPES = ["SavedReport", "InternalUser"];
  const jsonCasts = [];
  const gatedCasts = [];
  for (const rel of fs.readdirSync(webDir, { recursive: true })) {
    if (!/\.(ts|tsx)$/.test(rel)) continue;
    if (rel.includes("node_modules") || rel.includes(".next")) continue;
    const abs = nodePath.join(webDir, rel);
    let isFile = false;
    try {
      isFile = fs.statSync(abs).isFile();
    } catch {
      continue;
    }
    if (!isFile) continue;
    const lines = fs.readFileSync(abs, "utf8").split("\n");
    lines.forEach((line, i) => {
      const code = line.trim();
      if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
      const where = `${rel}:${i + 1}`;
      const gated = GATED_TYPES.find((t) => code.includes(`as ${t}`));
      if (gated) gatedCasts.push(`${where} (${gated})`);
      if (
        BOUNDARY_READS.some((m) => code.includes(m)) &&
        NAMED_CAST.test(code) &&
        !UNTYPED_CAST.test(code)
      ) {
        jsonCasts.push(where);
      }
    });
  }
  check("读边界的 JSON 没有直接强转成具名类型", jsonCasts.length === 0, jsonCasts.join(", "));
  check(
    `没有绕过归一的具名强转（${GATED_TYPES.join(" / ")}）`,
    gatedCasts.length === 0,
    gatedCasts.join(", "),
  );

  // 存档：归一必须存在、被导出（外部入口要用它）、且唯一入口真的调了它
  const storeSrc = read("../lib/report-history.ts");
  check("归一对 findings 有数组兜底", /findings:\s*Array\.isArray\(/.test(storeSrc));
  check("归一已导出（外部入口要用它）", storeSrc.includes("export function normalizeSavedReport("));
  check("归一入参是无类型的 unknown（不是 Partial）", /normalizeSavedReport\(raw: unknown\)/.test(storeSrc));

  const hookSrc = read("../hooks/useLogAnalyzer.ts");
  const at = hookSrc.indexOf("const openSaved");
  const body = at >= 0 ? hookSrc.slice(at, at + 1200) : "";
  check("openSaved 入口调用了归一", body.includes("normalizeSavedReport("));

  // 社区指标（/api/favorite、/api/rating、/api/download/track）：三个归一名各要"定义了 + 有人用"
  const communitySrc = read("../lib/community-stats.ts");
  for (const fn of ["normalizeFavoriteStats", "normalizeRatingStats", "normalizeLeaderboard"]) {
    const n = communitySrc.split(fn).length - 1;
    check(`${fn} 已定义且被调用`, n >= 2, `出现 ${n} 次`);
  }

  // 内部接口（Node SSR ↔ 边缘函数，分开部署 → 同一套办法）
  const internalSrc = read("../lib/internal-kv.ts");
  for (const fn of ["normalizeInternalUser", "normalizeOtpRequest", "normalizeOtpConsume"]) {
    const n = internalSrc.split(fn).length - 1;
    check(`${fn} 已定义且被调用`, n >= 2, `出现 ${n} 次`);
  }
  // 通用形状判断不许各写一份（§6.5 末段）
  check(
    "边界工具收在 lib/json-boundary.ts",
    read("../lib/json-boundary.ts").includes("export function asRecord(") &&
      communitySrc.includes('from "./json-boundary"') &&
      internalSrc.includes('from "./json-boundary"'),
  );
}

console.log("\n[11] 派生数据必须按报告身份清理（切了日志就不许再用上一份的曲线/轨迹）");
{
  // 曲线的键是 `presetId#面板序号`——**与日志无关**（预设是静态的），所以 state 里的
  // storedPlots 一旦跨报告存活，LogCharts 会直接命中上一份的序列画出来：图形完全正常、
  // 数据是别人的。轨迹更直白，画出来就是另一份日志的航线。工具轨迹地图那条链上，
  // 「工作区里装着哪份日志」由 worker 的 logId 比对兜住（见 §logNotLoadedReason）；
  // 这里是**前端这一半**：切报告时必须把上一份的派生数据丢掉。
  const hook = read("../hooks/useLogAnalyzer.ts");

  // 清理由唯一的函数负责，两个 state 都要清到
  const helperAt = hook.indexOf("const dropOtherReportData");
  const helper = helperAt >= 0 ? hook.slice(helperAt, helperAt + 600) : "";
  check("清理函数存在（dropOtherReportData）", helperAt >= 0);
  check("清理函数清掉了曲线", helper.includes("setStoredPlots(null)"));
  check("清理函数清掉了轨迹", helper.includes("setStoredTrack(null)"));
  check("清理函数按报告 id 判据（同一份就地复解析时不清）", helper.includes("reportIdRef.current === nextId"));

  // 两个"换报告"的入口都必须调它
  for (const [entry, anchor] of [
    ["viewSaved（切报告）", "const viewSaved"],
    ["parseBytes（换文件/复解析）", "const parseBytes"],
  ]) {
    const at = hook.indexOf(anchor);
    const body = at >= 0 ? hook.slice(at, at + 1400) : "";
    check(`${entry} 调用了清理`, body.includes("dropOtherReportData("), at < 0 ? "找不到入口" : "");
  }

  // 显示中的报告 id 只许在这两个入口被赋值（第三处 = 有人加了新入口但没清派生数据）
  const idWrites = hook.split(/\n/).filter((l) => /^\s*reportIdRef\.current\s*=/.test(l)).length;
  check("reportIdRef 只在两个换报告入口赋值", idWrites === 2, `实际 ${idWrites} 处`);
}

console.log(failed === 0 ? "\n全部通过\n" : `\n${failed} 项失败\n`);
process.exit(failed === 0 ? 0 : 1);
