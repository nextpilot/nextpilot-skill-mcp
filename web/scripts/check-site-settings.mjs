/**
 * 后台站点设置守卫：这套「三层取值 + 字段表驱动」的机制里，**没有任何一处会在运行时报错**。
 *
 * 每条规则各自对应一种「不报错、只是悄悄失效」的回归：
 *
 * - `settings-schema`：字段表在 Node 侧（`lib/site-settings.ts`）与边缘侧
 *   （`functions/_lib/settings-schema.js`）各有一份。边缘按自己那份校验落库，Node 按自己
 *   那份回落渲染，两侧 key 或 kind 对不上就是「后台存进去了、前台读不出来」——
 *   API 回 ok、页面也不报错，只有管理员改了没反应。
 * - `settings-footer-props`：页脚四项（版权行 / 品牌介绍 / 源码链接 / 备案号）必须 props 传入。
 *   `SiteFooter` 是客户端组件，读不到 KV；一旦有人把值写回组件里（或 import `site-config`
 *   自己取），后台改完页脚永远不变，而代码看着完全正常。
 * - `settings-metadata`：根 layout 必须用 `generateMetadata()` 读运行期设置。退回
 *   `export const metadata` 的话站点标题/描述就烙死在构建产物里（`NEXT_PUBLIC_*` 也是同理），
 *   后台改名再也不生效——构建照样过，只是改不动。
 * - `settings-secret-client`：密钥字段名不得出现在任何客户端组件里。字段名进了客户端组件，
 *   意味着那份明文正被序列化进 SSR 的 HTML（查看源代码即可拿走）。
 * - `settings-secret-wiring`：三个密钥各自必须至少有一个消费点在读它。后台存了却没人读 =
 *   管理员以为换了密钥，实际还在用旧的那份——同样是静默的。
 *
 * ## 输出契约（被 tools/ci/mutate_guards.py 解析，改格式前先看那边）
 *
 * 失败行必须是 `  FAIL <规则id> -> <详情>`：自证机按 `<规则id>` 判「**恰好**这一条红」，
 * 规则 id 是稳定契约。总结行不许写成 `FAIL <名字>`（会被当成一条检查名，变异自证报
 * "牵连"）——用 `RESULT:`。只用 ASCII 符号（Windows 控制台默认 GBK，`✗ ✓` 会崩）。
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const repoRoot = resolve(webRoot, "..");

const NODE_SCHEMA = join(webRoot, "lib", "site-settings.ts");
const EDGE_SCHEMA = join(webRoot, "functions", "_lib", "settings-schema.js");
const FOOTER = join(webRoot, "components", "SiteFooter.tsx");
const ROOT_LAYOUT = join(webRoot, "app", "layout.tsx");
const CHECKLIST = join(repoRoot, "tools", "ci", "checklist.yml");

/** 后台可改的四个页脚项：必须由服务端以 props 传进客户端组件 */
const FOOTER_PROPS = ["footerCopyright", "footerTagline", "sourceUrl", "icp"];

/** 三个密钥字段的 key（与两侧字段表同源；改名要三处一起改） */
const SECRET_KEYS = ["deepseekApiKey", "smtpPass", "issueToken"];

/** 只声明字段、不算「消费」的文件：把密钥存进 KV 不等于有人读它 */
const DECLARATION_ONLY = ["lib/site-settings.ts", "functions/_lib/settings-schema.js", "functions/_lib/secrets.js"];

let failures = 0;

function fail(rule, detail) {
    failures++;
    console.log(`  FAIL ${rule} -> ${detail}`);
}

function ok(rule, detail) {
    console.log(`  ok    ${rule} ${detail}`);
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
 * 源码里是否出现了某个 key 名。
 *
 * 必须**整词匹配**：`includes("deepseekApiKey")` 会把 `deepseekApiKeyV2` 也算成"有人在读"，
 * 而那恰恰是最典型的坏法——后台字段没改名、消费点改了名，于是存的是 A、读的是 B，
 * 管理员以为轮换过了，实际还在用旧的那份。整词匹配才抓得到。
 */
function mentions(src, key) {
    return new RegExp(`\\b${key}\\b`).test(src);
}

/**
 * 从字段表源码里抽出 `[{key, kind}, ...]`。
 *
 * 按「对象块」匹配而不是按行：`kind` 常常和 `key` 不在同一行（字段表为了可读性会分行），
 * 按行配对必然漏。块内不含嵌套花括号，所以 `\{[^{}]*\}` 足够——**若哪天字段表里出现嵌套
 * 对象，这里解析出的字段数会变少**，`settings-schema` 会以「解析出 N 个字段」的形式红，
 * 不会静默通过。
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
    // 只看**组件签名的解构**，不看全文：interface 里留着名字、签名里没接，值照样进不来。
    // 反过来全文匹配的话，任何一个名字只要在注释里出现过就算过——守卫会安静地绿着。
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

// ---- 3. 根 layout 的 metadata 走运行期设置 ----
{
    const src = read(ROOT_LAYOUT);
    if (/export\s+const\s+metadata\b/.test(src)) {
        fail("settings-metadata", "app/layout.tsx 用了 export const metadata：标题与描述被烙进构建产物，后台改不动");
    } else if (!src.includes("generateMetadata")) {
        fail("settings-metadata", "app/layout.tsx 没有 generateMetadata，读不到运行期设置");
    } else if (!src.includes("getSiteSettings")) {
        fail("settings-metadata", "app/layout.tsx 的 generateMetadata 没有读 getSiteSettings()");
    } else {
        ok("settings-metadata", "根 layout 的 metadata 走 generateMetadata + getSiteSettings");
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

// ---- 6. 门还在：这份检查必须挂在统一入口上 ----
// check_all.py 只按清单转发：checklist.yml 里没这一步，上面全部照跑也永远没人执行。
{
    if (!read(CHECKLIST).includes('- id: "check-site-settings"')) {
        fail("settings-wiring", "这道门挂在统一入口上（checklist.yml 里没有 check-site-settings）");
    } else {
        ok("settings-wiring", "checklist.yml 里挂着 check-site-settings");
    }
}

console.log(`RESULT: ${failures === 0 ? "站点设置守卫全部通过" : `${failures} 条未通过`}`);
process.exit(failures ? 1 : 0);
