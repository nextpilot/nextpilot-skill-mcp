// 报错上报的自测：不联网、不起服务，直接验证最容易写错的四件事——
//   1. 指纹是否真的归一化（否则去重形同虚设，一个 bug 刷出几百个 issue）
//   2. 脱敏是否真生效（否则公开的 Gitee 仓库会泄露用户信息）
//   3. 白名单是否真挡住额外字段（前端或第三方可以随便往 payload 里塞东西）
//   4. 超长文本截断后，末尾的关键行是否还在（Python traceback 的异常行在最后）
//
// 末尾十二节（§[9]~§[20]）性质不同：它们不测行为，而是**扫源码防架构回潮**——
//   §[9]  两侧共用的政策只许有一份实现（防止再长出第二份，悄悄分叉）；
//   §[10] 外部 JSON 进内部类型必须过归一、不许 `as` 强转（线上白屏过一次）；
//   §[11] 派生数据（曲线/轨迹）必须按报告身份清理（切了日志还在用上一份的，静默错数据）；
//   §[12] 取数据前必须先让 Worker 装上当前这份日志（共享常驻 Worker 的"装着谁"要能自愈）；
//   §[13] `functions/` 下每个端点都必须在本地 dev 垫片的映射表里（漏一个 = 本地整条静默 404）；
//   §[14] 指南正文只许有一个渲染入口（曾裂成 `GuideMarkdown` / `GuideMdx` 一对近音名 +
//         两份分叉的 `textOf`，`{占位符}` 文档差点被 MDX 解析），且两条路要共用同一份
//         remark 插件——MDX 侧漏了 `remark-gfm`，GFM 表格会静默退化成纯文本（线上 5 张表）；
//   §[15] 组件名跟着家族不变量走（`Log*` = 某一份日志；一次列很多份的用数据模型的词）；
//   §[16] 轨迹取不到时界面要把引擎给的**逐条原因**显示出来（一句概括只对六种原因里的一种，
//         另外五种下它是错的——"空洞"的代价是用户拿不到任何能自己判断的线索）；
//   §[17] 两类条目共用的详情页组件不许带某一类的前缀（`Skill*` 出现在 `/mcp/[slug]` 里就是
//         名字在说谎，而照名字去"修正"会复制出 `Mcp*` 孪生组件，改一边漏一边）；
//   §[18] 站点版本（footer 的「版本 + 日期」）只许有一个读取口：next.config.ts 注入、
//         lib/site-version.ts 读、别人不许再直接读环境变量（issue-bridge 曾经读了两年
//         一个从来没人赋值的变量，上报里的版本恒为空串）；
//   §[19] 指南页左右两栏的宽度都不许写死（写死 `w-48` 时侧栏内部凭空多出 27~54px 死白，
//         写死 `w-56` 时右目录列内空 126px），两道栏间距不许回到 40px，右目录必须在 lg
//         就显示（xl 断点被滚动条吃掉 17px 后踩不准，目录整列消失再留 176px 死白——
//         都是没人会主动去查的静默退化）；
//   §[20] 隐私承诺与免责声明这两句固定文案只有一个出处（lib/log-analysis-notes.ts），
//         且只在上传卡渲染（页脚品牌区与底栏都不再重复——用户交日志的地方才是它们的落点）；
//   §[21] 次数上限不在前端显示（上限以后由后台配置）。曾经同一个 3 次/天在上传卡、
//         AI 解读区、「我的」页各露一次，而后台还没把配置口开出来——前端先替它报一个
//         写死的数字，等于替后台做了个还没做的决定。
// 这几类问题都属于"同一件事有两条路径、只有一条被校验"，本仓库已经因此出过几次事故，
// 光靠人记没用，所以做成机器能拦的守卫。
//
// 跑法：node web/scripts/test-issue-filer.mjs
import { sanitizePayload, fingerprintOf, reportIssue } from "../functions/_lib/issue-filer.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// 脱敏/截断是两侧**共用**的那一份（浏览器侧 lib/issue-bridge.ts 也引它），
// 所以直接对共享模块验证——它错了，两边一起错，这一节必须守住。
import { scrub, SCRUB_RULES } from "../lib/error-policy.js";

let failed = 0;
function check(name, cond, extra = "") {
    if (cond) {
        console.log(`  OK    ${name}`);
    } else {
        failed += 1;
        console.log(`  FAIL  ${name}${extra ? `  → ${extra}` : ""}`);
    }
}

/** web/ 根目录（静态守卫要 readdir / join 时用） */
const WEB = fileURLToPath(new URL("..", import.meta.url));
/**
 * 静态守卫引用的源码路径**必须登记**，不许直接 readFileSync。
 *
 * 由来（2026-09-23 实测）：i18n 给所有页面套了一层 `[locale]`，脚本里写死的
 * `app/skills/[slug]/page.tsx` 之类集体失效；readFileSync 直接抛 ENOENT，脚本在
 * §[17] 就死掉 —— §[18]~§[22] **一条都没跑**，而 CI 只看得见"进程非零退出"，
 * 分不清是"路径坏了"还是"守卫真红了"。这是最坏的一种失败：**守卫失效的同时还伪装成通过**。
 *
 * 所以这两个函数在路径不存在时**登记下来并返回空串**，让那一节的断言自己红（缺什么说清楚），
 * 而不是把后面的节全部带走。末尾 §[23] 汇总"有没有引用到不存在的路径"。
 */
const MISSING_PATHS = [];
/** 读 web/ 下的源码（末尾几节的静态守卫用；路径相对本文件，即 web/scripts/） */
const read = (rel) => {
    const p = fileURLToPath(new URL(rel, import.meta.url));
    if (!existsSync(p)) {
        MISSING_PATHS.push(rel);
        return "";
    }
    return readFileSync(p, "utf8");
};
/** 同上，路径相对 web/ 根（多段用逗号分隔，跟 join 一致） */
const readWeb = (...parts) => {
    const rel = join(...parts);
    if (!existsSync(join(WEB, rel))) {
        MISSING_PATHS.push(rel);
        return "";
    }
    return readFileSync(join(WEB, rel), "utf8");
};
/**
 * 剥掉注释再扫。**静态守卫必须先过这一步**：本仓库的习惯是把"为什么"写进注释，注释里
 * 会原样出现标识符（`node.type === "code"`、`react-markdown`…），裸子串检查于是被注释
 * 喂饱——把真代码删掉它照样绿。2026-09-18 连着踩了两次，才明白该修的是检查方式本身。
 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");

/**
 * 列出 web/ 下所有要看的前端源码，路径相对 web/（`.ts` / `.tsx`）。
 * 末尾几节的"全站扫"守卫共用它——**排除清单只此一份**，否则某个守卫忘了排除 `.next`
 * 就会扫到几千个构建产物里的副本，报一堆假失败，然后被人把守卫注释掉。
 */
const walkSourceFiles = (root, sub = "", out = []) => {
    for (const e of readdirSync(join(root, sub), { withFileTypes: true })) {
        if (["node_modules", ".next", "content/skills", "content/mcp", "e2e", "playwright-report"].includes(e.name))
            continue;
        const rel = sub ? join(sub, e.name) : e.name;
        if (e.isDirectory()) walkSourceFiles(root, rel, out);
        else if (/\.tsx?$/.test(e.name)) out.push(rel);
    }
    return out;
};

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
    check(
        "未知字段全部丢弃",
        !("fileName" in p) && !("findings" in p) && !("uid" in p) && !("evidence" in p) && !("logHash" in p),
    );
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
        { ISSUE_ENABLED: "1", ISSUE_REPO: "not-a-repo", AUTH_GITEE_TOKEN: "t" },
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
                AUTH_GITEE_TOKEN: "tk",
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
        AUTH_GITEE_TOKEN: "tk",
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
    // 缺字段的报告就一路走到 LogReport 的 `report.findings.filter` 才崩（GeneralInfo 白屏）。
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
        try {
            if (!fs.statSync(abs).isFile()) continue;
        } catch {
            continue;
        }
        const lines = fs.readFileSync(abs, "utf8").split("\n");
        lines.forEach((line, i) => {
            const code = line.trim();
            if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
            const where = `${rel}:${i + 1}`;
            const gated = GATED_TYPES.find((t) => code.includes(`as ${t}`));
            if (gated) gatedCasts.push(`${where} (${gated})`);
            if (BOUNDARY_READS.some((m) => code.includes(m)) && NAMED_CAST.test(code) && !UNTYPED_CAST.test(code)) {
                jsonCasts.push(where);
            }
        });
    }
    check("读边界的 JSON 没有直接强转成具名类型", jsonCasts.length === 0, jsonCasts.join(", "));
    check(`没有绕过归一的具名强转（${GATED_TYPES.join(" / ")}）`, gatedCasts.length === 0, gatedCasts.join(", "));

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

    // 两个"换报告"的入口都必须调它。
    // 取函数体用"到下一个同级声明为止"，不用固定字符窗口——窗口会因为注释变长而失效
    // （2026-09-18 踩过：parseBytes 加了几行注释，检查就掉到窗口外，报了个假的失败）
    for (const [entry, anchor] of [
        ["viewSaved（切报告）", "const viewSaved = useCallback"],
        // 锚点要写成 `= useCallback`：光写 `const parseBytes` 会命中 `parseBytesRef`（声明顺序上它更靠前）
        ["parseBytes（换文件/复解析）", "const parseBytes = useCallback"],
    ]) {
        const at = hook.indexOf(anchor);
        const nextDecl = at >= 0 ? hook.indexOf("\n    const ", at + 1) : -1;
        const body = at >= 0 ? hook.slice(at, nextDecl > at ? nextDecl : at + 3000) : "";
        check(`${entry} 调用了清理`, body.includes("dropOtherReportData("), at < 0 ? "找不到入口" : "");
    }

    // 显示中的报告 id 只许在这两个入口被赋值（第三处 = 有人加了新入口但没清派生数据）
    const idWrites = hook.split(/\n/).filter((l) => /^\s*reportIdRef\.current\s*=/.test(l)).length;
    check("reportIdRef 只在两个换报告入口赋值", idWrites === 2, `实际 ${idWrites} 处`);
}

console.log('\n[12] 取数据前先让 Worker 装上这份日志（共享 Worker 的"装着谁"要能自愈）');
{
    // 背景：Worker 共享且常驻（跨路由存活，见 hooks/useLogAnalyzer.ts 文件头）。它可能正装着
    // **另一份**日志，于是 track/series 请求被 Worker 的闸门挡下，界面只能叫用户"重新选择该 .ulg
    // 文件"——而字节往往就在手里（刚选过的那份、或本机缓存里的）。2026-09-18 用户连着报了三轮
    // "还是这个问题"，就是这么来的：每一步看起来都对，但没有人负责"把这份日志装进 Worker"。
    // 现在这个责任归前端：取数前先 ensureLogLoaded。下面几条把结构钉住。
    const worker = read("../workers/analysis-worker.ts");
    const hook = read("../hooks/useLogAnalyzer.ts");

    // Worker 必须回传"这次装的是哪一份"——前端不许靠"我发过 analyze"推断（analyze 会失败）
    check(
        "worker 的 done 回传了 logId",
        /type:\s*"done",\s*report,\s*manifest,\s*info,\s*logId:\s*msg\.logId/.test(worker),
    );
    const doneAt = worker.indexOf("loadedLogId = msg.logId");
    check("worker 成功之后才记 loadedLogId", doneAt >= 0);

    // "装着谁"是 Worker 的属性，不是页面的属性 → 必须模块级（Hook 内 = 每个页面各记一份会互相撒谎）
    const modScope = hook.slice(0, hook.indexOf("export function useLogAnalyzer()"));
    check("workerLoadedHash 是模块级状态", /^let workerLoadedHash/m.test(modScope));
    check("丢弃 Worker 时一并清掉它", /dropSharedWorker[\s\S]{0,400}workerLoadedHash = null/.test(hook));
    const doneHandler = hook.slice(hook.indexOf('m.type === "done"'), hook.indexOf('m.type === "track"'));
    check(
        "done 里按 worker 回传的 logId 记账（不是靠发过 analyze 推断）",
        doneHandler.includes("m.logId"),
        "没看到 m.logId",
    );

    // 两个取数入口都必须先确保装上；ensureLogLoaded 必须有"手里没字节"的出口
    for (const entry of ["const requestSeries", "const requestTrack"]) {
        const at = hook.indexOf(entry);
        const body = at >= 0 ? hook.slice(at, at + 800) : "";
        check(`${entry} 先确保日志已装载`, body.includes("ensureLogLoaded("), at < 0 ? "找不到入口" : "");
    }
    const ensureAt = hook.indexOf("const ensureLogLoaded");
    // 同 §[11]：取函数体用"到下一个同级声明为止"，不用固定字符窗口（注释一长窗口就失效）
    const ensureNext = ensureAt >= 0 ? hook.indexOf("\n    const ", ensureAt + 1) : -1;
    const ensure = ensureAt >= 0 ? hook.slice(ensureAt, ensureNext > ensureAt ? ensureNext : ensureAt + 3000) : "";
    check("ensureLogLoaded 存在", ensureAt >= 0);
    check("手里没字节就返回 false（不硬编、不拿别的日志凑）", ensure.includes("if (!bytes) return false"));
    check("字节必须与指纹配对（不许拿 A 的字节补 B）", ensure.includes("pendingBytesHashRef.current === hash"));
    check("同一份日志的并发补解析去重", ensure.includes("analyzeInFlight"));

    // 补解析是"页面已经把报告渲染出来之后"才发起的：Pyodide 首次初始化要十几秒，用户完全
    // 可能在这中间回列表打开另一份报告。于是 done 必须**认领自己的结果**——判据用 worker 回传的
    // logId（= 这份数据属于哪份日志），而不是"我发过 analyze"（analyze 会失败，推断出来的
    // "就是它"会让上面这条竞态被误判成正常路径）。少了这一条，页面就会"头部显示 C、结论是 B"，
    // liveAnalysis 还会被记成「C 的 id + B 的 manifest」。
    check(
        "done 只把结果写进它自己要的那份报告（补解析的结果不许盖住已经换过的页面）",
        /if \(logId !== pendingHashRef\.current\) return;/.test(doneHandler),
        "done 里没看到 logId 与当前页面对照",
    );

    // 补解析要沿用**当前显示的报告**那份 AI 解读。用 pendingAiRef（"上次解析那份日志的 priorAi"）
    // 会把这份报告的 AI 报告覆盖成空/别的——而且 done 紧跟着就 persist，落盘一并改掉：
    // 这不是显示问题，是把用户花额度换来的解读**永久删掉**。
    check(
        "补解析沿用当前报告的 AI 解读（aiMarkdownRef，不是 pendingAiRef）",
        ensure.includes("priorAi: aiMarkdownRef.current"),
        "ensureLogLoaded 里的 priorAi 不是 aiMarkdownRef.current",
    );
    check(
        "aiMarkdownRef 跟着 state 走（写漏一处 = AI 报告静默丢失）",
        /aiMarkdownRef\.current = aiMarkdown;/.test(hook),
        "没有把 aiMarkdown 同步进 aiMarkdownRef",
    );

    // 解析失败必须把等待者放行：否则 await 永远挂着，界面卡在"加载中"没有出路
    const errBranch = hook.slice(hook.indexOf('m.type === "error"'), hook.indexOf('m.type === "done"'));
    check("解析失败会结算所有等待者", errBranch.includes("failPendingAnalyze()"));
    const parseFn = hook.slice(hook.indexOf("const parseBytes = useCallback"));
    check(
        "新解析顶掉旧日志时也放行（别的日志的等待者再等不到自己的 done）",
        parseFn.includes("failPendingAnalyze(meta.hash)"),
    );

    // 最后一个没人校验的入口：worker 的 done 直接进 report state。它缺 findings 时
    // GeneralInfo 的 `findings.filter` 会把整页打白——所以 done 必须过归一，而不是塞进去算数。
    check(
        "done 边界过了归一（不许把 worker 的报告直接塞进 state）",
        hook.includes("normalizeWorkerReport(m.report)") &&
            /function normalizeWorkerReport\(raw: unknown\)/.test(hook) &&
            /Array\.isArray\(r\.findings\)/.test(hook),
    );
}

console.log("\n[13] functions/ 下的端点在本地 dev 垫片里必须可达（漏一个 = 整条功能在本地静默 404）");
{
    // 本地只有 Next 自身，跑不了 EdgeOne 的 Edge 函数：`/api/*` 与 `/internal/*` 靠
    // next.config.ts 的 afterFiles rewrite 转进 app/edge-dev，再由那里的**一张白名单**
    // 按路径动态 import 处理器。
    //
    // 白名单漏项的失败形态是最难认的一种：不抛错、不进日志、也没有类型错误，就是一个 404——
    // 与"这个功能还没做"长得一模一样。2026-09-18 实际漏了 `api/issues`：它由
    // `lib/issue-bridge.ts:51` 的 `ENDPOINT` 唯一引用，于是本机**所有 `reportError()`
    // 全部静默丢掉**（桥接层按设计吞掉失败），排查缺字段那类问题时等于没有证据。
    // 三个根级探针（ping / kv-probe / issue-probe）同样没接上：它们是"发布前手工验一遍"
    // 的工具，本地访问不了就只能等上线后再发现。
    const route = readWeb("app/edge-dev/[[...path]]/route.ts");
    const config = readWeb("next.config.ts");

    const mapAt = route.indexOf("const handlers:");
    const mapEnd = route.indexOf("\n};", mapAt);
    const mapBody = mapAt >= 0 && mapEnd > mapAt ? route.slice(mapAt, mapEnd) : "";
    check("垫片里有显式处理器映射表", mapBody.length > 0);
    // 键可能带引号（"api/reports/[id]"）也可能不带（ping）
    //
    // 还包含映射表**之后的条件注册**（如 `if (NODE_ENV === "development") { handlers["api/blob"] = ... }`）：
    // 那类端点只在特定环境下可达，但仍必须在垫片里注册，不能算漏项。
    const mapped = new Set([
        ...[...route.matchAll(/^\s*"?([A-Za-z0-9\-_/[\]]+)"?\s*:\s*\(\s*\)\s*=>/gm)].map((m) => m[1]),
        // 条件注册写法：handlers["api/blob"] = () => import(...)
        ...[...route.matchAll(/handlers\["([A-Za-z0-9\-_/[\]]+)"\]\s*=\s*\(\s*\)\s*=>/g)].map((m) => m[1]),
    ]);

    // 端点 = functions/ 目录树里的每个 .js；`_` 开头的（_lib）是共享库，不是端点
    const endpoints = [];
    const walk = (dir, prefix) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            if (e.name.startsWith("_")) continue;
            if (e.isDirectory()) walk(join(dir, e.name), `${prefix}${e.name}/`);
            else if (e.name.endsWith(".js")) endpoints.push(`${prefix}${e.name.slice(0, -3)}`);
        }
    };
    walk(join(WEB, "functions"), "");
    check("扫到了端点清单", endpoints.length > 0, `实际 ${endpoints.length} 个`);

    // `[[default]].js`（EdgeOne 兜底动态路由）不含动态段字面值：它在垫片映射表里
    // 以所在目录的 [id] 代表名出现（如 functions/api/reports/[[default]].js ↔
    // "api/reports/[id]"）。按目录前缀判定映射，避免要求字面键。
    const isMapped = (e) => {
        if (mapped.has(e)) return true;
        if (!e.endsWith("/[[default]]")) return false;
        const prefix = e.slice(0, -"/[[default]]".length);
        return [...mapped].some((k) => k.startsWith(`${prefix}/`));
    };
    const missing = endpoints.filter((e) => !isMapped(e));
    check(
        "functions/ 下每个端点都在垫片映射表里",
        missing.length === 0,
        missing.length ? `未映射：${missing.join(", ")} —— 本地访问会 404` : "",
    );

    // 根级端点（不带 /api、/internal 前缀）还得在 next.config.ts 里有一条显式 rewrite：
    // 那两条通用 rewrite 只覆盖前缀，根级的不会自动被转发
    const missingRewrite = endpoints.filter((e) => !e.includes("/")).filter((e) => !config.includes(`source: "/${e}"`));
    check(
        "根级端点都有显式 rewrite",
        missingRewrite.length === 0,
        missingRewrite.length ? `缺 rewrite：${missingRewrite.join(", ")}` : "",
    );
}

console.log("\n[14] 指南正文只有一个渲染入口（防止再裂成一对近音文件名 + 两份分叉的 textOf）");
{
    // 由来：`GuideMarkdown.tsx` / `GuideMdx.tsx` 曾并排存在，两个名字只差一个字母、
    // 读起来像「基础版 / 升级版」——于是看起来 MDX 那份是超集，可以把另一份删掉。
    // **恰好相反**：`knowledge/px4/` 派生过来的 .md 里有 `{invalid_frac:.0%}`、`meta/<tag>.json`，
    // MDX 会把花括号当 JSX 表达式解析，所以普通 markdown 那份才是不能删的那份。
    //
    // 更要命的是两个文件**各抄了一份 `textOf`**（把标题子节点还原成原始 markdown 文本）。
    // 右侧目录是从原始 markdown 抽标题的（`lib/guide.ts` 的 extractHeadings），两边必须算出
    // 同一个锚点；而两份 textOf 已经分叉——只有普通 markdown 那份会补回反引号，于是
    // `.mdx` 标题里的行内代码会从锚点里消失（`### 用 \`foo\`` 点不动）。当时没发作只是因为
    // 六个 `.mdx` 里恰好没有含内联代码的标题，属于侥幸。
    //
    // 2026-09-18 合并成 GuideBody.tsx，本节把"不许再裂开"钉住。
    const COMP = join(WEB, "components");
    const names = readdirSync(COMP);
    check("GuideBody.tsx 存在", names.includes("GuideBody.tsx"));

    const twins = names.filter((n) => /^Guide(Markdown|Mdx)\.tsx$/.test(n));
    check("旧的孪生名没有回来", twins.length === 0, twins.length ? `又出现了：${twins.join(", ")}` : "");

    // 算标题文本的 textOf 全目录只许有一份：两份就会分叉（这正是原来的缺陷）
    const textOfCount = names
        .filter((n) => n.endsWith(".tsx") || n.endsWith(".ts"))
        .reduce(
            (n, f) =>
                n + (stripComments(readFileSync(join(COMP, f), "utf8")).match(/function\s+textOf\b/g) ?? []).length,
            0,
        );
    check("算标题文本的 textOf 只有一份", textOfCount === 1, `实际 ${textOfCount} 份`);

    const body = stripComments(readFileSync(join(COMP, "GuideBody.tsx"), "utf8"));
    // 两个解析器都得在：删掉普通 markdown 那份正是坏名字诱导的方向。
    // 判据要认**导入语句 + 实际使用**，不能是裸子串——文档注释里也写着 "react-markdown"，
    // 裸子串的检查删掉解析器照样绿（2026-09-18 自证时实测到的假绿）。
    check("导入并使用了普通 markdown 解析器", /from "react-markdown"/.test(body) && body.includes("<ReactMarkdown"));
    check("导入并使用了 MDX 解析器", /from "next-mdx-remote\/rsc"/.test(body) && body.includes("<MDXRemote"));
    check("按 renderer 分发", /renderer === "md"/.test(body));

    // MDX 侧必须真的启用 GFM。`@mdx-js/mdx@3` 的默认管线只有 CommonMark，管道表格属于
    // GFM 扩展——漏传 `remark-gfm` 时整张表会退化成"一段带竖线的普通段落"：不报错、
    // 不抛异常，页面上只是"排版有点怪"（2026-09-19 线上：/guide/rule-schema 的 5 张表
    // 全渲染成了 `| 参数 | 说明 | |------|------| …` 原文）。
    //
    // 判据必须落在 `<MDXRemote` 那个调用**里面**，不能写成"文件里出现过 remarkGfm"：
    // 后者在 `.md` 分支里也成立，把 MDX 侧的插件删空照样绿——正是本文件反复踩的裸子串陷阱。
    const mdxAt = body.indexOf("<MDXRemote");
    const mdxCall = mdxAt < 0 ? "" : body.slice(mdxAt, body.indexOf("/>", mdxAt) + 2);
    check("MDX 调用点找得到（判据有落点）", mdxCall.includes("<MDXRemote"));
    check(
        "MDX 分支启用了 GFM（漏了它表格会静默退化成纯文本）",
        /remarkPlugins/.test(mdxCall) && /remarkGfm|sharedRemarkPlugins/.test(mdxCall),
        "MDXRemote 的调用里没带上 remark-gfm",
    );

    // 同一处的姊妹缺陷：`.md` 侧有 `table: Table` 覆写（横向滚动外框），`.mdx` 侧漏了就会
    // 把十几列的字段表直接撑破窄屏——不会报错，只是"页面上多出一条横向滚动条"。
    const compsAt = body.indexOf("const mdxComponents");
    const mdxComps = compsAt < 0 ? "" : body.slice(compsAt, body.indexOf(";", compsAt) + 1);
    check("MDX 侧也覆写了 table（否则宽表撑破窄屏）", /\btable:\s*Table\b/.test(mdxComps));
    // 1 是**正确性**约束：`H2`/`H3` 渲染的就是 textOf 的返回串，不递归进元素就等于把
    //   标题里的行内代码整段丢掉（老 GuideMdx 的 3 行 stub 正是如此）——id 和显示一起错。
    check(
        "textOf 递归进元素捞出文本（少了它标题会丢内容）",
        body.includes("React.isValidElement(node)") && body.includes("node.props as { children"),
    );
    // 2 只是**显示保真**（让标题渲染出原始 markdown 的 `代码` 记号）。注意它不影响锚点 id：
    //   headingId 把所有非字母数字折叠成 `-`，`` `foreach` `` 与 `foreach` 归一成同一个。
    //   两条分开断言，免得将来有人以为删掉反引号只是"少个记号"而顺手删了上面那条。
    check(
        "textOf 给行内代码补回反引号（显示保真）",
        body.includes('node.type === "code"') && body.includes("${inner}"),
    );

    // 扩展名 → renderer 是"哪个文档走哪条路"的唯一判据；翻了它等于把 knowledge 派生的
    // `.md` 交给 MDX 解析（上面那些 `{占位符}` 立刻变成 JSX 表达式）
    const guide = stripComments(read("../lib/guide.ts"));
    check("lib/guide.ts 仍按扩展名决定 renderer", guide.includes('fileName.endsWith(".mdx") ? "mdx" : "md"'));
}

console.log("\n[15] 组件名跟着家族不变量走（`Log*` = 某一份日志；一次列很多份的用数据模型的词）");
{
    // 由来：两个名字各错一半，错的方向恰好相反（2026-09-18）。
    //  · `AnalyzeReport.tsx`（841 行，六个 `Log*` tab 组件的**父壳**）挂的是**路由**的词——
    //    `Analyze` 已经被 `app/analyze/` + `Analyze*Client` + `useLogAnalyzer` 占着，
    //    读者看不出这个共享组件在 `Log*` 家族里占哪一格。
    //  · `HistoryList.tsx`（列 `SavedReport` / `HistoryItem`，含云端报告）一个词根都没有，
    //    看不出它的数据来自 `lib/report-history.ts`。
    // 两个都改成跟着家族/数据模型走：`LogReport.tsx` / `ReportHistoryList.tsx`。
    //
    // 关键在于 `Log*` 家族的**定义**：它指"渲染**某一份**日志的分析结果"，**不是**
    // "手里有日志字节"（从历史打开时字节可能已被淘汰，子组件各自处理了那条路）。
    // 所以单份的挂 `Log`、集合类不挂——`LogHistoryList` 那种写法是在承诺"日志在这"，
    // 而那张表里恰恰经常没有（`REPORT_DATA_KEEP` 淘汰字节、`source: "cloud"` 来自别的设备）。
    const COMP = join(WEB, "components");
    const names = readdirSync(COMP);

    check("LogReport.tsx 存在", names.includes("LogReport.tsx"));
    check("AnalyzeReport.tsx 没有回来", !names.includes("AnalyzeReport.tsx"));
    check("ReportHistoryList.tsx 存在", names.includes("ReportHistoryList.tsx"));
    check("HistoryList.tsx 没有回来", !names.includes("HistoryList.tsx"));

    // 比"文件叫什么"更实质的一条：父壳引的子组件必须都在 `Log*` 家族里。
    // 将来新加一个 tab 组件时用了别的词根（`MetricsPanel.tsx` 之类），当场被拦——
    // 否则家族会一格一格被拆散，而每个单看都"挺合理"。
    const shell = stripComments(readFileSync(join(COMP, "LogReport.tsx"), "utf8"));
    const kids = [...shell.matchAll(/from "\.\/([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
    check("LogReport 引到了子组件", kids.length >= 6, `实际 ${kids.length} 个`);
    const odd = kids.filter((n) => !/^Log[A-Z]/.test(n));
    check("LogReport 的子组件全带 Log 词根", odd.length === 0, odd.length ? `不带 Log 词根：${odd.join(", ")}` : "");

    // 反方向也要拦：报告历史列表不许被"顺手统一进 Log 家族"——它列的是能比日志活得久的记录
    const logNamedList = names.filter((n) => /^LogHistory/.test(n));
    check("报告历史列表没被挂上 Log 词根", logNamedList.length === 0, logNamedList.join(", "));
}

console.log("\n[16] 轨迹取不到要说清缺什么（不许再退回一句空洞的概括）");
{
    // 用户的原话："这段日志里没有可用的定位轨迹 直接告诉用户缺少什么字段，不要这么空洞的提示"。
    // 空洞只是表象：那句概括只对应六种原因里的一种（缺 topic / 缺字段 / 字段改名 / 有采样但
    // 全程没定位 / 采样数对不上 / 没 timestamp），另外五种下它是**错的**。
    // 引擎侧那半（返回体必须带 errorReasons）由 tools/engine/check_engine_pyodide.py 动态核；
    // 这里管界面这半——失败分支真的填、列表真的渲染、切了日志清空。
    // 只留 `tsc` **看不见**的那几条：`TrackData` 的字段声明、state 声明、setter 调用，少一环
    // tsc 都会当场报错，再给它们配守卫就是"恒绿的守卫"（§6.6 那条"守卫自己也要被校验"——
    // 第一次写就有一条被另外两条**蕴含**，变异怎么打都不红）。真正会静默退化的是**行为**：
    // 填了不渲染、渲染了不在失败分支填、切了日志不清空、引擎违约时拿一句谎话顶上。
    const map = stripComments(readWeb("components", "LogFlightMap.tsx"));
    check("失败分支收下引擎给的全部原因", /setErrorReasons\(\s*track\.errorReasons/.test(map));
    check("界面把逐条原因渲染成列表", /errorReasons\.map\(/.test(map));
    check("重新取数时清空上一轮的原因", /setErrorReasons\(\[\]\)/.test(map));
    // 引擎违约（有 error 却不给原因）时不许伪装成"日志里没有轨迹"——那会让解析器缺陷
    // 看起来像用户的数据问题，用户既不会反馈、我们也永远不知道
    check("引擎没给原因时明说是解析器缺陷", /引擎没有返回任何轨道，也没给出原因/.test(map));
}

console.log("\n[17] 两类条目共用的详情页组件不许带某一类的前缀（Skill* / Mcp* 都在说谎）");
{
    // 背景：`/skills/[slug]` 与 `/mcp/[slug]` 共用一组详情页组件。它们原名叫 SkillContentTabs /
    // SkillSidebar / SkillComments / SkillHeaderMeta —— 而导航里「Skill 技能」与「MCP 服务」是
    // **并列**的两类内容，MCP 页面用 `Skill*` 组件，名字就在说谎。
    //
    // 说谎的代价不是观感：下一个人看见 `SkillSidebar` 出现在 MCP 页面，合理的"修正"是复制一份
    // `McpSidebar`——于是长出一对只差前缀的孪生组件，改一边漏一边（本仓库栽过五次的就是这个形状）。
    // 所以共用组件统一走中立家族 `Entry*`（"收录条目"是两类共有的上位词），类间差异全走参数。
    //
    // 判据只看 import，且必须 `stripComments`：注释里会原样出现这些标识符，裸扫会被注释喂饱。
    const imports = (rel) =>
        [...stripComments(readWeb(rel)).matchAll(/from "@\/components\/([A-Za-z0-9_]+)"/g)].map((m) => m[1]);

    const skillDeps = imports("app/[locale]/skills/[slug]/page.tsx");
    const mcpDeps = imports("app/[locale]/mcp/[slug]/page.tsx");
    const shared = skillDeps.filter((n) => mcpDeps.includes(n));

    // 先判"共用集合非空"：若哪天两个页面被彻底拆开，下面两条会变成空集上的恒真判定，
    // 那时该删掉的是这两条规则本身，而不是让它们继续绿着。
    check("两个详情页确实共用组件（判据自身不能是空的）", shared.length >= 4, `实际 ${shared.length} 个`);
    const prefixed = shared.filter((n) => /^(Skill|Mcp)/.test(n));
    check(
        "共用组件不带 Skill / Mcp 前缀",
        prefixed.length === 0,
        prefixed.length ? `带类前缀：${prefixed.join(", ")}` : "",
    );
    const mcpSkill = mcpDeps.filter((n) => /^Skill/.test(n));
    check(
        "MCP 详情页不引用 Skill* 组件",
        mcpSkill.length === 0,
        mcpSkill.length ? `引用了：${mcpSkill.join(", ")}` : "",
    );
}

console.log("\n[18] 站点版本只有一个读取口（footer 的「版本 + 日期」不许各处各读一次）");
{
    // 由来：footer 要显示站点版本与日期。两样都在**构建期**由 `next.config.ts` 注入
    // `NEXT_PUBLIC_APP_*`（版本号来自 web/package.json，日期与短哈希来自构建时的 git HEAD）。
    // 风险形态与 §[9] / §[10] 同源——同一件事有两条路径，只有一条接得上真源。
    // 仓库里已经有过一次现成的裂缝：`lib/issue-bridge.ts` 一直在读 `NEXT_PUBLIC_APP_VERSION`，
    // 而全仓库从来没人给它赋值，于是错误上报里的 version **恒为空串**（版本那栏直接不打印，
    // "哪个版本出的问题"永远查不到，而且它不报错，谁也没发现）。
    //
    // 这里守的是三件事：注入方真的注入了三个值、只有一个文件读它们、footer 取到并且渲染出来。
    // 少任何一条，footer 上的版本号都会变成"看起来一直正常、其实早就过期"的那类错。
    const config = stripComments(readWeb("next.config.ts"));
    const footer = stripComments(readWeb("components", "SiteFooter.tsx"));
    const versionMod = stripComments(read("../lib/site-version.ts"));

    // 注入方：三个键一个都不能少（少了就在静默退化成"版本未知"，而没人会去查为什么）
    for (const key of ["NEXT_PUBLIC_APP_VERSION", "NEXT_PUBLIC_APP_COMMIT", "NEXT_PUBLIC_APP_COMMIT_DATE"]) {
        check(`next.config.ts 注入了 ${key}`, config.includes(`${key}:`));
    }
    // 注入的值必须真的被读走（next.config 里写了、但没人读 = 白写）
    check("读取口在 lib/site-version.ts", versionMod.includes("process.env.NEXT_PUBLIC_APP_VERSION"));
    // 提交时间精确到秒：只到天的日期在一天内多次构建时分不清谁新谁旧（2026-09-21 要求）
    check("提交时间精确到秒（format-local 带时分秒）", config.includes("%Y-%m-%d %H:%M:%S"));

    // 全站扫：除注入方与唯一读取口，不许再有第三处直接读 NEXT_PUBLIC_APP_*。
    // 已剥注释——说明文字里原样出现的变量名不会把这条喂成恒绿。
    const allowed = new Set(["next.config.ts", join("lib", "site-version.ts")]);
    const offenders = [];
    const walk = (dir) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            if (["node_modules", ".next", "content/skills", "content/mcp", "e2e", "playwright-report"].includes(e.name))
                continue;
            const p = join(dir, e.name);
            if (e.isDirectory()) {
                walk(p);
            } else if (/\.tsx?$/.test(e.name)) {
                const rel = p.slice(WEB.length).replace(/^[\\/]/, "");
                if (allowed.has(rel)) continue;
                if (stripComments(readFileSync(p, "utf8")).includes("NEXT_PUBLIC_APP_")) offenders.push(rel);
            }
        }
    };
    walk(WEB);
    check(
        "别处不许直接读 NEXT_PUBLIC_APP_*（读取口只许有一个）",
        offenders.length === 0,
        offenders.length ? `第三处读取：${offenders.join(", ")}` : "",
    );

    // 消费方：footer 必须从那一个口子取，并且真的显示出来（取了不渲染 = 用户看到的仍是空）
    check("footer 从唯一读取口取版本", footer.includes('from "@/lib/site-version"'));
    check("footer 把版本串渲染出来", footer.includes("{versionLabel}"));
}

console.log("\n[19] 指南页栏宽跟随内容、栏间距不许回到 40px");
{
    // 由来：指南页三栏（左导航 / 正文 / 右本页目录）挤在 page-shell 的 1120px 内容宽里。
    // 原先左导航写死 `w-48`(192px)，而实测中文条目最宽 124px、英文 151px——侧栏**内部**
    // 就空出 27~54px，再叠上 40px 间距，中文下「侧栏文字右边缘 → 正文左边缘」量到 94px。
    // 同时两道各 40px 的间距 + 224px 右目录，把正文从 max-w-3xl(768px) 压到只有 624px。
    //
    // 这类错不报错、不白屏，只会"看起来有点空"，属于没人会主动去查的静默退化，
    // 所以做成机器能拦的守卫：宽度必须跟内容走，且上下限都要有兜底。
    const sidebar = stripComments(readWeb("components", "GuideSidebar.tsx"));
    const layout = stripComments(read("../app/[locale]/guide/layout.tsx"));
    const article = stripComments(readWeb("components", "GuideArticle.tsx"));
    const outlineSrc = stripComments(readWeb("components", "GuideOutline.tsx"));

    // 只取那个 `<aside>` 自己的类名，别把注释/其他元素的类名混进来
    const asideCls = (/<aside className="([^"]*)"/.exec(sidebar)?.[1] ?? "").split(/\s+/);
    check("侧栏宽度跟导航文字走（w-max，不许写死）", asideCls.includes("w-max"));
    check(
        "侧栏宽度有上限兜底（max-w-*，条目名变长时不许挤正文）",
        asideCls.some((c) => /^max-w-/.test(c)),
    );
    check(
        "侧栏宽度有下限兜底（min-w-*，条目名再短也留出可点宽度）",
        asideCls.some((c) => /^min-w-/.test(c)),
    );

    // 右目录同一套规矩。血泪数字：写死 `w-56` 时目录文字只占 ~85px，列内右侧常年空 126px；
    // 断点写 xl(1280) 在真实浏览器踩不准——1280 的窗口扣掉滚动条只剩 ~1263，目录整列消失，
    // 1152/1200/1240/1263 视口下正文右缘到内容区右缘全部量出 176px 死白（2026-09-22 用户圈的就是它）。
    const outlineAside = (/<aside className="([^"]*)"/.exec(outlineSrc)?.[1] ?? "").split(/\s+/);
    check("右目录宽度跟标题文字走（w-max，不许写死）", outlineAside.includes("w-max"));
    check(
        "右目录有上限兜底（max-w-*，标题变长时不许挤正文）",
        outlineAside.some((c) => /^max-w-/.test(c)),
    );
    check(
        "右目录有下限兜底（min-w-*，边线和最短标题也有存在感）",
        outlineAside.some((c) => /^min-w-/.test(c)),
    );
    check(
        "右目录从 lg 就显示（xl 断点在真实浏览器踩不准，目录消失会留 176px 死白）",
        outlineAside.includes("lg:block") && !outlineAside.includes("xl:block"),
    );

    // 两道栏间距：各 40px 会把正文从 768px 上限压到 624px
    const outerRow = /<div className="([^"]*lg:flex-row[^"]*)"/.exec(layout)?.[1] ?? "";
    check("侧栏与正文的间距收到 lg:gap-8", outerRow.includes("lg:gap-8") && !outerRow.includes("lg:gap-10"));

    const innerRow = /<div className="([^"]*min-w-0[^"]*)"/.exec(article)?.[1] ?? "";
    check("正文与右目录的间距收到 gap-8", innerRow.includes("gap-8") && !innerRow.includes("gap-10"));
}

console.log("\n[20] 两句固定文案只有一个出处（措辞不许各写各的）");
{
    // 由来：「日志只在本地解析」的隐私承诺原来写在页脚品牌区，而用户真正交出日志的上传卡上
    // 只有另一句近似措辞（"检查在本地浏览器完成…"）——同一件事两份文案，各自演化。
    // 现在两句（隐私承诺 + 免责声明）收进 lib/log-analysis-notes.ts，且只在上传卡渲染
    // （2026-09-21 用户拍板：页脚的品牌区与底栏都不再重复这两句）。
    // 这里守三件事：出处里两句都在、上传卡真的从出处取并渲染、全站任何别的文件不许手写
    // 这两句的字面量（否则下次有人往别的页面贴，措辞又会各长各的）。
    const notes = stripComments(read("../lib/log-analysis-notes.ts"));
    const upload = stripComments(readWeb("app", "[locale]", "analyze", "AnalyzeEntryClient.tsx"));

    const zhPrivacy = "日志在浏览器本地解析，原始文件不上传";
    const zhDisclaimer = "分析结果为辅助判读，不能完全替代人工排查";

    check("唯一出处里定义了隐私承诺", notes.includes("export const LOG_PRIVACY_NOTE") && notes.includes(zhPrivacy));
    check(
        "唯一出处里定义了免责声明",
        notes.includes("export const ANALYSIS_DISCLAIMER") && notes.includes(zhDisclaimer),
    );
    check("上传区从唯一出处取文案", upload.includes('from "@/lib/log-analysis-notes"'));
    check(
        "上传区把两句话都渲染出来",
        upload.includes("LOG_PRIVACY_NOTE.zh") && upload.includes("ANALYSIS_DISCLAIMER.zh"),
    );

    // 全站扫：除唯一出处本体，不许任何文件手写这两句的字面量。已剥注释——说明文字里
    // 原样出现这两句不会把这条喂成恒绿（本节注释就刻意用了转述而非原文）。
    const literals = [zhPrivacy, zhDisclaimer];
    const notesRel = join("lib", "log-analysis-notes.ts");
    const offenders = [];
    for (const rel of walkSourceFiles(WEB)) {
        if (rel === notesRel) continue;
        const src = stripComments(readFileSync(join(WEB, rel), "utf8"));
        if (literals.some((s) => src.includes(s))) offenders.push(rel);
    }
    check(
        "别处不许手写这两句的字面量（措辞只许改一处）",
        offenders.length === 0,
        offenders.length ? `手写副本：${offenders.join(", ")}` : "",
    );
}

console.log("\n[21] 次数上限不在前端显示（上限由后台配置，前端不许先报一个写死的数）");
{
    // 由来：匿名/登录用户"每天能白嫖几次 AI 解读"这件事，前端三处各露一次——
    //   上传卡「匿名试用 3/3 次」、AI 解读区「今日免费 10 次，剩余 N 次」、
    //   「我的」页一条额度进度条。三处都从同一份取数（/api/me 的 quota）来，但**默认值**
    //   各写各的（3 / 10），后台上限一改就三处不一致。
    // 2026-09-21 用户拍板：次数上限以后由后台配置，前端一处都不许显示。
    //
    // 守两层，缺一层都拦不住回潮：
    //   ① 那几句**专属**次数文案的字面量在全站删干净了（"次/天"、"匿名试用"、"今日免费"…）。
    //      这些词只服务于"报次数"，正常文案里不会出现，可以硬查。
    //   ② 直接扫**写了 quota 的文件**里还有没有数字对（`/ ${…limit}`）或进度条（`width: ${…used…}%`），
    //      再钉住消费 quota 的文件清单。为什么不能只查 `used`/`limit`/`quota` 这些词：
    //      hooks/useLogAnalyzer.ts 的数据层**有意保留** quota（后台配好后 UI 直接取用），
    //      词级扫描会连数据层一起误伤——那就只能注释掉守卫，等于没有守卫。
    // 想看"原本长什么样"：`git show HEAD:web/<文件>`。
    const CN_QUOTA_COPY = ["匿名试用", "次/天", "今日免费", "今日 AI 解读额度", "额度信息暂不可用"];
    const renderedQuota = []; // 还在把 quota 渲染成数字/进度条的地方
    const quotaConsumers = []; // 碰了 quota 这个标识符的文件（清单要与此精确一致）
    for (const rel of walkSourceFiles(WEB)) {
        const src = stripComments(readFileSync(join(WEB, rel), "utf8"));
        if (/quota/i.test(src)) quotaConsumers.push(rel);
        const left = CN_QUOTA_COPY.filter((w) => src.includes(w));
        // `/ 10 次`、`/ ${q.limit} 次`：一条把上限印成数字的斜杠对
        const slashPair = /\/\s*[\w.?()[\]]{0,24}limit[\w.?()[\]]{0,8}\s*次/i.test(src);
        // `width: ${…used…}%`：额度进度条
        const progressBar = /width:\s*`?\$\{[^}]*used[^}]*\}[^`]*%/.test(src);
        const reasons = [];
        if (left.length) reasons.push(`文案：${left.join("、")}`);
        if (slashPair) reasons.push("数字对：/ …limit 次");
        if (progressBar) reasons.push("进度条：width … used%");
        // hooks/useLogAnalyzer.ts 是**取数层**：它自己既不渲染也不写次数文案，只把
        // /api/me、explain 响应的 quota 存进 state。它命中上面任何一条都是误报，
        // 说明判据写歪了——所以这里只跳过它的"渲染类"判据，文案判据照查。
        const dataLayer = rel.endsWith(join("hooks", "useLogAnalyzer.ts"));
        if (dataLayer && (slashPair || progressBar)) {
            reasons.splice(reasons.indexOf("数字对：/ …limit 次"), 1);
            reasons.splice(reasons.indexOf("进度条：width … used%"), 1);
        }
        if (reasons.length) renderedQuota.push(`${rel}（${reasons.join("；")}）`);
    }
    check("全站没有把额度渲染成数字/进度条的地方", renderedQuota.length === 0, renderedQuota.join("，"));

    // 清单与实现精确一致：多一个文件 = 有新的界面在显示次数（回潮）；
    // 少一个文件不报错（撤掉显示本来就该变少），但**取数层不许被删**——
    // 它是后台配好上限之后唯一不用返工的地方。
    const EXPECTED = [
        join("app", "analyze", "[id]", "AnalyzeResultClient.tsx"),
        join("app", "analyze", "AnalyzeEntryClient.tsx"),
        join("app", "me", "MeClient.tsx"),
        join("components", "LogReport.tsx"),
        join("hooks", "useLogAnalyzer.ts"),
    ];
    const unexpected = quotaConsumers.filter((r) => !EXPECTED.includes(r));
    check("没有新的文件在消费 quota（回潮信号）", unexpected.length === 0, unexpected.join(", "));
    check(
        "取数层仍然保留 quota（后台配好上限后 UI 直接取用）",
        quotaConsumers.includes(join("hooks", "useLogAnalyzer.ts")),
        "hooks/useLogAnalyzer.ts 已不再碰 quota",
    );
}

console.log("\n[22] 地图左上角三个图标是一条按钮，高度色带贴着它往下铺（不留空档）");
{
    // 由来：复位按钮最早是**另一个** L.Control（position topleft + controlOrder 1000），
    // 排到缩放条下面。但 Leaflet 的 CSS 给**每个** .leaflet-control 都加了 margin-top 10px，
    // 两组之间必然留一道空档；而且两个 .leaflet-bar 各有 1px 边框，就算把 margin 抹掉，
    // 贴在一起也是 2px 双线。用户看到的就是"缩小按钮和复位图标之间一大块空白"。
    // 只有 append 进**同一个** .leaflet-bar 才会共享一条边框、由 .leaflet-bar a 的
    // border-bottom 自动分隔。
    //
    // 连带：按钮列底边因此上移（118 → 104），色带的 top-[110px] 是量出来的、跟着这个
    // 形态走。**只写 bottom-0 不写 top 就没有上边界** —— 2026-09-23 实测过：top-[124px]
    // 没进 CSS 时容器被内容高度挤成 2px，整条色带看不见。
    //
    // 为什么只能静态锁写法、锁不住 104 这个数：那是浏览器布局的结果，要验就得起服务跑
    // Playwright（分钟级），进不了秒级检查。这里锁住的是"会不会回潮成两个 bar"，
    // 以及"色带有没有上下边界"——这两条一旦回潮，现象和这次完全一样。
    const src = stripComments(read("../components/LogFlightMap.tsx"));
    // 色带容器的 className：靠 top-[…px] 这个特征值从全组件的 className 里认出来
    const barCls = [...src.matchAll(/className="([^"]+)"/g)].map((m) => m[1]).find((c) => /top-\[\d+px\]/.test(c));

    check(
        "复位按钮不另起 .leaflet-bar（另起就与缩放条留 10px 空档 + 2px 双边框）",
        !src.includes('L.DomUtil.create("div", "leaflet-bar leaflet-control")'),
        "又出现了手工建的 leaflet-bar 容器：三个图标会裂成两组",
    );
    check(
        "复位按钮挂在缩放条里（zoomControl 取容器后 appendChild）",
        // 窗口给到 1200：getContainer() 与 appendChild 之间夹着按钮的 svg 字符串与事件绑定，
        // 400 装不下（第一版就是卡在这儿，判据写窄了会假红）。
        src.includes("zoomControl") && /getContainer\(\)[\s\S]{0,1200}appendChild\(/.test(src),
        "没找到「取缩放条容器 → appendChild」这条链，复位按钮大概率又变成独立控件了",
    );
    // 三个按钮必须横排：竖排时它们吃掉 ~94px 高，色带只能从 104 往下铺。
    // 这条锁的是"横排"这个事实，不是某个像素值（像素值得起浏览器量，进不了秒级检查）。
    check(
        "按钮行是横排的（给缩放条设了 display:flex，分隔线改成 border-right）",
        /display\s*=\s*"flex"/.test(src) && src.includes("borderRight"),
        "没找到「横排 + border-right」：按钮会回到竖排，色带顶端跟着下移 60px 左右",
    );
    check(
        "高度色带同时写了 top-[…px] 与 bottom-0（缺 top 就没有上边界，会被挤成 2px）",
        !!barCls && barCls.includes("bottom-0"),
        barCls ? `色带 className 缺 bottom-0：${barCls}` : "找不到带 top-[…px] 的色带容器",
    );
    check(
        "高度色带与按钮行左对齐、不挡地图操作（left-2.5 + pointer-events-none）",
        !!barCls && barCls.includes("left-2.5") && barCls.includes("pointer-events-none"),
        barCls ? `色带 className 不满足：${barCls}` : "找不到带 top-[…px] 的色带容器",
    );
    // 标签必须挂在色带**右侧**（left-full）：压在条上会盖住渐变，而条只有 12px 宽。
    const labelCls = [...src.matchAll(/className="([^"]+)"/g)].map((m) => m[1]).filter((c) => c.includes("left-full"));
    check(
        "两个高度标签挂在色带右侧（left-full，不遮渐变）",
        labelCls.length === 2 && labelCls.every((c) => c.includes("whitespace-nowrap")),
        `命中的标签 className ${labelCls.length} 个：${labelCls.join(" | ")}`,
    );
}

console.log("\n[23] 静态守卫引用的源码路径都存在（路径失效不许把后面整段带走）");
{
    // 见文件头 read / readWeb 的说明：这些路径是写死在脚本里的，路由一改就集体失效，
    // 而失效的表现曾经是"抛 ENOENT 把后面所有节带走"——既没红在该红的地方，也让人
    // 分不清是"路径坏了"还是"守卫真红了"。
    //
    // 这一节是**兜底汇总**：read / readWeb 已经保证坏路径只让那一节自己红，这里再把
    // "到底哪几个路径不存在"单独说清楚，免得表现为若干节同时红、根因却只有一个。
    //
    // 想证明它会红：把 read / readWeb 里任一路径改成一个不存在的文件名再跑本脚本。
    check(
        "静态守卫引用的路径都指向真实文件",
        MISSING_PATHS.length === 0,
        MISSING_PATHS.length ? `不存在的路径：${[...new Set(MISSING_PATHS)].join("、")}` : "",
    );
}

console.log(failed === 0 ? "\n=== issue-filer 测试全部通过 ===" : `\n=== ${failed} 项失败 ===`);
process.exit(failed === 0 ? 0 : 1);
