/**
 * 后台站点设置守卫：机制里没有任何运行时报错，每条规则对应一种「悄悄失效」：
 *   settings-schema          两侧字段表 key/kind 对不上（存了读不到）
 *   settings-footer-props    SiteFooter 是客户端组件读不到 KV，页脚四项要 props 传入
 *   settings-static-metadata 根 layout 要静态 const metadata（generateMetadata 会把整棵路由树
 *                            判动态、首页无法静态化）
 *   settings-render-path     渲染路径不许读 getSiteSettings()（白名单 ALLOWED_RUNTIME_READERS）
 *   settings-static-locale   [locale] 要调 setRequestLocale（不登记则整棵子树动态化）
 *   settings-site-url-fallback SITE_URL 要有非 localhost 兜底（漏配时页面无异常、只有
 *                            sitemap/canonical/og:url 全错）
 *   settings-secret-client   密钥字段名进客户端组件 = 明文进 SSR HTML
 *   settings-secret-wiring   密钥要有消费点
 *
 * 输出契约（被 tools/ci/mutate_guards.py 解析，改格式前先看那边）：失败行 `  FAIL <规则id> -> <详情>`，
 * 规则 id 是稳定契约；总结行用 RESULT:（写成 FAIL 会被当成检查名）；只用 ASCII（Windows 控制台 GBK）。
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { log } from "./lib/log.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const repoRoot = resolve(webRoot, "..");

const NODE_SCHEMA = join(webRoot, "lib", "site-settings.ts");
const EDGE_SCHEMA = join(webRoot, "functions", "_lib", "settings-schema.js");
const FOOTER = join(webRoot, "components", "SiteFooter.tsx");
const ROOT_LAYOUT = join(webRoot, "app", "layout.tsx");
const CHECKLIST = join(repoRoot, "tools", "ci", "checklist.yml");

/** 后台可改的四个页脚项：由服务端以 props 传进客户端组件 */
const FOOTER_PROPS = ["footerCopyright", "footerTagline", "sourceUrl", "icp"];

/** 三个密钥字段的 key（与两侧字段表同源；改名要三处一起改） */
const SECRET_KEYS = ["deepseekApiKey", "smtpPass", "issueToken"];

/** 只声明字段、不算「消费」的文件：把密钥存进 KV 不等于有人读它 */
const DECLARATION_ONLY = ["lib/site-settings.ts", "functions/_lib/settings-schema.js", "functions/_lib/secrets.js"];

/**
 * 允许在运行期读 `getSiteSettings()` 的文件（渲染路径之外的白名单）。
 * 只有纯请求期接口才配进来（不进静态化判定，读 KV 无副作用）；
 * 渲染路径（`app/**` 页面与元数据路由）都不许读，那是首页静态化的命门。
 */
const ALLOWED_RUNTIME_READERS = ["lib/mailer.ts"];

let failures = 0;

function fail(rule, detail) {
    failures++;
    log.err(`  FAIL ${rule} -> ${detail}`);
}

function ok(rule, detail) {
    log.ok(`  ok    ${rule} ${detail}`);
}

function read(relOrAbs) {
    return readFileSync(relOrAbs, "utf8");
}

/** 递归收集源码文件（跳过 node_modules 与点开头的目录） */
function walk(dir, out = []) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const e of entries) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) out.push(p);
    }
    return out;
}

const rel = (p) => p.slice(webRoot.length + 1).replace(/\\/g, "/");

/**
 * 源码里是否出现了某个 key 名。要整词匹配：`includes("deepseekApiKey")` 会把 deepseekApiKeyV2
 * 也算成"有人在读"，而那恰是最典型的坏法（后台字段没改名、消费点改了名，存的是 A 读的是 B，
 * 管理员以为轮换过、实际还在用旧的）。整词匹配才抓得到。
 */
function mentions(src, key) {
    return new RegExp(`\\b${key}\\b`).test(src);
}

/**
 * 去掉注释后再判「有没有真的读运行期设置」。注释里出现 `getSiteSettings()` 是在讲历史，
 * 不是真的在读 KV；不剥的话任何解释性头注都会把规则判红，守卫变成
 * 「不许在注释里提这个名字」的荒谬规定。
 */
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * 从字段表源码里抽出 `[{key, kind}, ...]`。按「对象块」匹配而非按行：`kind` 常与 `key`
 * 不在同一行（字段表为可读性会分行），按行配对必然漏；块内不含嵌套花括号，`\{[^{}]*\}` 足够。
 * 哪天出现嵌套对象，解析出的字段数会变少，settings-schema 以「解析出 N 个字段」的形式红，不会静默通过。
 */
function parseFields(src, label) {
    const anchor = src.indexOf("export const SETTINGS_FIELDS");
    if (anchor < 0) {
        fail("settings-schema", `${label} 里找不到 SETTINGS_FIELDS，守卫空转`);
        return null;
    }
    const open = src.indexOf("[", anchor);
    let depth = 0;
    let end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === "[") depth++;
        else if (src[i] === "]") {
            depth--;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }
    if (end < 0) {
        fail("settings-schema", `${label} 的 SETTINGS_FIELDS 数组没有闭合，守卫空转`);
        return null;
    }
    const fields = [];
    for (const m of src.slice(open + 1, end).matchAll(/\{[^{}]*\}/g)) {
        const key = m[0].match(/key:\s*"([^"]+)"/);
        const kind = m[0].match(/kind:\s*"([^"]+)"/);
        if (key && kind) fields.push({ key: key[1], kind: kind[1] });
    }
    // 解析出 0 个字段 = 守卫在空转，比"不一致"更糟（不一致至少说明有人在改）
    if (fields.length === 0) {
        fail("settings-schema", `${label} 的 SETTINGS_FIELDS 解析出 0 个字段，守卫空转`);
        return null;
    }
    return fields;
}

// ---- 1. 两侧字段表一致（key、kind、顺序） ----
{
    const node = parseFields(read(NODE_SCHEMA), "lib/site-settings.ts");
    const edge = parseFields(read(EDGE_SCHEMA), "functions/_lib/settings-schema.js");
    if (node && edge) {
        if (node.length !== edge.length) {
            fail(
                "settings-schema",
                `两侧字段数不一致：Node ${node.length} vs 边缘 ${edge.length}（存了读不到或读了没有）`,
            );
        } else {
            const bad = node.find((f, i) => f.key !== edge[i].key || f.kind !== edge[i].kind);
            if (bad) {
                const i = node.indexOf(bad);
                fail(
                    "settings-schema",
                    `第 ${i + 1} 项不一致：Node ${bad.key}/${bad.kind} vs 边缘 ${edge[i].key}/${edge[i].kind}`,
                );
            } else {
                ok("settings-schema", `两侧 ${node.length} 项字段 key/kind 一致`);
            }
        }
    }
}

// ---- 2. 页脚四项走 props，不在客户端组件里写死 ----
{
    const src = read(FOOTER);
    // 只看组件签名的解构，不看全文：interface 里留着名字、签名没接，值照样进不来；全文匹配则注释里出现就算过
    const sig = src.match(/export function SiteFooter\(\{([^}]*)\}/);
    const taken = sig ? sig[1] : "";
    const missing = FOOTER_PROPS.filter((p) => !taken.includes(p));
    const importsConfig = /from\s+"[^"]*site-config"/.test(src);
    if (!sig) {
        fail("settings-footer-props", "SiteFooter 的签名不再解构 props（客户端组件读不到 KV，值只能靠服务端传进来）");
    } else if (missing.length > 0) {
        fail(
            "settings-footer-props",
            `SiteFooter 的 props 少了：${missing.join(",")}（客户端组件读不到 KV，写回去后台就改不动）`,
        );
    } else if (importsConfig) {
        fail("settings-footer-props", "SiteFooter 直接 import 了 site-config：那是构建期地板值，会盖掉后台的覆盖");
    } else {
        ok("settings-footer-props", `页脚 ${FOOTER_PROPS.length} 项均由 props 传入`);
    }

    // 写死的仓库地址是最容易回潮的一种：改托管平台时顺手把链接贴回组件里
    if (/https?:\/\/(gitee|github)\.com\/nextpilot/.test(src)) {
        fail("settings-footer-url", "SiteFooter 里有写死的仓库地址，后台改了链接不生效");
    } else {
        ok("settings-footer-url", "页脚外链没有写死的仓库地址");
    }
}

// ---- 3. 根 layout 的 metadata 要是静态常量（首页静态化的命门） ----
{
    const src = read(ROOT_LAYOUT);
    if (/export\s+(async\s+)?function\s+generateMetadata\b/.test(src)) {
        fail(
            "settings-static-metadata",
            "app/layout.tsx 导出了 generateMetadata：整棵路由树被判为动态渲染，首页无法静态化、CDN 零缓存",
        );
    } else if (!/export\s+const\s+metadata\b/.test(src)) {
        fail("settings-static-metadata", "app/layout.tsx 没有 export const metadata（静态根元数据缺失）");
    } else if (/\bawait\b/.test(stripComments(src))) {
        // 静态 const 里出现 await 说明它其实是个动态取值，静态化又会失效
        fail("settings-static-metadata", "app/layout.tsx 的 metadata 里出现 await，静态导出名不副实");
    } else {
        ok("settings-static-metadata", "根 layout 用静态 const metadata（首页可静态化）");
    }
}

// ---- 3b. 渲染路径不得读运行期设置（任何一处都会把那一页拽回动态渲染） ----
{
    // 渲染路径 = app/** 全部（页面 + sitemap/robots/manifest 等元数据路由）+ lib/seo.ts（元数据工厂），都纳入静态化判定
    const renderPath = [...walk(join(webRoot, "app")), join(webRoot, "lib", "seo.ts")].filter(
        (p) => !ALLOWED_RUNTIME_READERS.includes(rel(p)),
    );
    const hits = renderPath.filter((p) => mentions(stripComments(read(p)), "getSiteSettings")).map(rel);
    if (hits.length > 0) {
        fail(
            "settings-render-path",
            `渲染路径读了 getSiteSettings（会退回动态渲染，首页静态化失效）：${hits.join(",")}`,
        );
    } else {
        ok("settings-render-path", `渲染路径（${renderPath.length} 个文件）没有读运行期设置`);
    }
}

// ---- 3c. next-intl 静态化开关：setRequestLocale 要与 generateStaticParams 成对 ----
// next-intl 默认从请求头取 locale；不登记就整棵子树动态化——构建照样过、页面照样开，
// 只是 `○/●` 悄悄变回 `ƒ`，CI 里没人看得出来。
// 判据要看调用（`setRequestLocale(...)`）不能只看名字：删掉调用忘了删 import 也不报错，只匹配名字会判绿。
{
    const localeRoot = join(webRoot, "app", "[locale]");
    const targets = [join(localeRoot, "layout.tsx"), join(localeRoot, "page.tsx")];
    const hasCall = (src) => /(^|[^.\w])setRequestLocale\s*\(/.test(stripComments(src));
    const missing = targets.filter((p) => !hasCall(read(p))).map(rel);
    if (missing.length > 0) {
        fail(
            "settings-static-locale",
            `next-intl 未登记 locale（缺 setRequestLocale(...) 调用，页面会退回动态渲染）：${missing.join(",")}`,
        );
    } else {
        ok("settings-static-locale", "[locale] 的 layout 与 page 都调用了 setRequestLocale");
    }
}

// ---- 3d. SITE_URL 要有生产兜底（不能落到 localhost） ----
// `SITE_URL` 是唯一「默认值 ≠ 线上值」的字段：其余字段默认值恰好就是想要的线上值，漏配看不出来；
// SITE_URL 一漏配就变 localhost:3000，页面毫无异常，只有 sitemap / robots / canonical / og:url /
// JSON-LD 域名全错，等于主动提交死链。判据：SITE_URL 的表达式里要出现非 localhost 的生产兜底。
{
    const src = read(join(webRoot, "lib", "site-config.ts"));
    const m = src.match(/export\s+const\s+SITE_URL\s*=\s*([\s\S]*?);/);
    if (!m) {
        fail("settings-site-url-fallback", "lib/site-config.ts 找不到 SITE_URL 定义，守卫空转");
    } else if (!/NODE_ENV\s*===\s*"production"/.test(m[1])) {
        fail(
            "settings-site-url-fallback",
            "SITE_URL 缺少生产兜底：漏配 NEXT_PUBLIC_SITE_URL 时会落到 localhost:3000，" +
                "而页面毫无异常（只有 sitemap/robots/canonical/og:url 全错）",
        );
    } else if (!/https:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(m[1].replace(/localhost:\d+/g, ""))) {
        fail("settings-site-url-fallback", "SITE_URL 的生产兜底不是合法域名（应形如 https://skill.nextpilot.org）");
    } else {
        ok("settings-site-url-fallback", "SITE_URL 有生产兜底（漏配环境变量不会落到 localhost）");
    }
}

// ---- 3e. 环境变量文件里的站点域名变量名要带 NEXT_PUBLIC_ 前缀 ----
// 代码读的是 `process.env.NEXT_PUBLIC_SITE_URL`。在 .env 里写成裸名 `SITE_URL=x` 会是孤儿变量：
// 看着"配了"代码却读不到，落到默认值，又是一个"改了没反应"的静默失败。
{
    const envFiles = [".env.local", ".env.example", ".env"];
    const problems = [];
    for (const f of envFiles) {
        let src;
        try {
            src = read(join(webRoot, f));
        } catch {
            continue; // 文件不存在是正常的
        }
        for (const line of src.split("\n")) {
            // 只看「未注释的、键名以 SITE_URL 结尾但不带 NEXT_PUBLIC_ 前缀」的赋值行
            if (/^\s*#/.test(line)) continue;
            const m = line.match(/^\s*([A-Z_]*SITE_URL[A-Z_]*)\s*=/);
            if (m && m[1] !== "NEXT_PUBLIC_SITE_URL") {
                problems.push(`${f}: ${m[1]}`);
            }
        }
    }
    if (problems.length > 0) {
        fail(
            "settings-env-var-name",
            `环境变量文件名写错（代码读的是 NEXT_PUBLIC_SITE_URL，其余是没人读的孤儿变量）：${problems.join(", ")}`,
        );
    } else {
        ok("settings-env-var-name", "环境变量文件里的站点域名变量名都带 NEXT_PUBLIC_ 前缀");
    }
}

// ---- 4. 密钥字段名不得出现在客户端组件里 ----
{
    const clients = [...walk(join(webRoot, "components")), ...walk(join(webRoot, "app"))].filter((p) =>
        read(p).includes('"use client"'),
    );
    if (clients.length === 0) {
        fail("settings-secret-client", "一个客户端组件都没扫到，守卫空转");
    } else {
        const hits = [];
        for (const p of clients) {
            const src = read(p);
            const found = SECRET_KEYS.filter((k) => mentions(src, k));
            if (found.length > 0) hits.push(`${rel(p)}: ${found.join(",")}`);
        }
        if (hits.length > 0) {
            fail(
                "settings-secret-client",
                `客户端组件里出现了密钥字段名（明文会被序列化进 SSR HTML）：${hits.join(" | ")}`,
            );
        } else {
            ok("settings-secret-client", `${clients.length} 个客户端组件里没有密钥字段名`);
        }
    }
}

// ---- 5. 三个密钥各有消费点在读（存了没人读 = 轮换静默失效） ----
{
    const candidates = [
        ...walk(join(webRoot, "lib")),
        ...walk(join(webRoot, "functions")),
        ...walk(join(webRoot, "app")),
    ].filter((p) => !DECLARATION_ONLY.includes(rel(p)));
    const texts = candidates.map((p) => ({ p, text: read(p) }));
    const orphans = SECRET_KEYS.filter((k) => !texts.some((t) => mentions(t.text, k)));
    if (orphans.length > 0) {
        fail("settings-secret-wiring", `这些密钥没有任何消费点在读它（后台改了不生效）：${orphans.join(",")}`);
    } else {
        ok("settings-secret-wiring", `三个密钥都有消费点（${candidates.length} 个候选文件里找到）`);
    }
}

// ---- 6. 门还在：这份检查要挂在统一入口上 ----
// check_all.py 只按清单转发：checklist.yml 里没这一步，上面全部照跑也没人执行。
{
    if (!read(CHECKLIST).includes('- id: "check-site-settings"')) {
        fail("settings-wiring", "这道门挂在统一入口上（checklist.yml 里没有 check-site-settings）");
    } else {
        ok("settings-wiring", "checklist.yml 里挂着 check-site-settings");
    }
}

log.info(`RESULT: ${failures === 0 ? "站点设置守卫全部通过" : `${failures} 条未通过`}`);
process.exit(failures ? 1 : 0);
