/**
 * Skill 目录合规校验：web/content/skills/<slug>/ 是否满足 Agent Skills 规范（依据 agentskills.io、
 * support.claude.com、anthropics/skills，口径冲突取严：name 1-64 小写字母数字连字符且与父目录一致、
 * description ≤200 且要说清何时用、metadata string→string、顶层字段白名单、正文 <500 行、保留字禁用）。
 * 转换脚本跑完就删了原 .mdx，之后没人再审查，这道校验就是唯一背书。
 * 输出契约（mutate_guards.py 解析，改格式前先看那边）：失败行 `  FAIL <规则id> -> <详情>`，
 * 规则 id 是稳定契约；总结行用 `RESULT: N 处未过`（写成 FAIL 会被当成检查名）；只用 ASCII（Windows 控制台 GBK）。
 * 内置反例自检（--self-test，默认也跑）：每条规则配一个故意违规的内存反例断言它真的会红——防守卫恒绿。
 * 用法（web/ 下）：node scripts/check-skill-spec.mjs [--self-test]
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

import { log } from "./lib/log.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const SKILLS_DIR = join(webRoot, "content", "skills");

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = ["claude", "anthropic"];
const ALLOWED_TOP_LEVEL = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);
const REQUIRED_FILES = ["SKILL.md", "README.md", "CHANGELOG.md"];
const REQUIRED_META = ["display_name", "category", "platforms", "tags"];
const DESC_MAX = 200;

/**
 * 分类白名单从 `lib/constants.ts` 的 CATEGORIES 现读，不另存一份——存了就是第二份真源，
 * 加分类时只改一处会静默漏掉另一处。
 */
function readCategories() {
    const src = readFileSync(join(webRoot, "lib", "constants.ts"), "utf8");
    const block = /export const CATEGORIES = \[([\s\S]*?)\n\] as const;/.exec(src);
    const keys = block ? [...block[1].matchAll(/key:\s*"([^"]+)"/g)].map((m) => m[1]) : [];
    if (keys.length === 0) {
        throw new Error(
            "没从 lib/constants.ts 的 CATEGORIES 里读到任何 key：数组结构变了？本守卫的正则要跟着改（不能静默放行）",
        );
    }
    return keys;
}

/**
 * 单个 Skill 目录的全部问题。纯函数（不碰文件系统）：反例自检要拿内存里的假目录走同一套判据，
 * 否则自检测的是另一份逻辑，等于没测。
 * @param {{slug: string, files: string[], raw?: string, changelog?: string, cases?: string,
 *          knownSlugs?: string[], categories: string[]}} input
 * @returns {{rule: string, msg: string}[]}
 */
export function collectProblems(input) {
    const { slug, files, categories } = input;
    const out = [];
    const fail = (rule, msg) => out.push({ rule, msg });

    for (const file of REQUIRED_FILES) {
        if (!files.includes(file)) fail("files/required", `缺少 ${file}`);
    }

    const raw = input.raw ?? "";
    let data;
    try {
        data = matter(raw).data || {};
    } catch (e) {
        fail("frontmatter/parse", `SKILL.md frontmatter 解析失败：${e.message}`);
        return out;
    }

    const name = data.name == null ? "" : String(data.name);
    if (!name) fail("name/required", "frontmatter 缺 name");
    if (name.length > 64) fail("name/length", `name ${name.length} 字符，超过 64 上限`);
    if (name && !NAME_RE.test(name)) {
        fail("name/charset", `name "${name}" 不合规：只允许小写字母数字与单个连字符，且不以连字符开头结尾`);
    }
    if (name && name !== slug) fail("name/matches-dir", `name "${name}" 与目录名 "${slug}" 不一致（规范强制）`);
    for (const w of RESERVED) {
        if (name.toLowerCase().includes(w)) fail("name/reserved", `name 含保留字 "${w}"`);
    }

    const desc = data.description == null ? "" : String(data.description);
    if (!desc) fail("description/required", "frontmatter 缺 description");
    if (desc.length > DESC_MAX) {
        fail(
            "description/length",
            `description ${desc.length} 字符，超过 ${DESC_MAX}（support.claude.com 的上限；规范站是 1024）`,
        );
    }
    if (desc && !/(何时|当|when)/i.test(desc)) {
        fail("description/when", "description 看不出「什么时候用」：规范要求同时写清做什么与何时用");
    }

    for (const key of Object.keys(data)) {
        if (!ALLOWED_TOP_LEVEL.has(key)) {
            fail("frontmatter/top-level", `顶层字段 "${key}" 不是规范字段（站点字段请收进 metadata）`);
        }
    }

    const meta = data.metadata;
    if (!meta || typeof meta !== "object") {
        fail("metadata/required", "缺 metadata（display_name / category 等站点字段放这里）");
    } else {
        for (const [k, v] of Object.entries(meta)) {
            if (typeof v !== "string") {
                fail(
                    "metadata/strings",
                    `metadata.${k} 是 ${typeof v}，规范要求 string→string（列表与数字都写成字符串）`,
                );
            }
        }
        for (const k of REQUIRED_META) {
            if (!String(meta[k] ?? "").trim()) fail("metadata/required-fields", `metadata 缺 ${k}`);
        }
        if (meta.category && !categories.includes(String(meta.category))) {
            fail("metadata/category", `metadata.category "${meta.category}" 不在 lib/constants.ts 的 CATEGORIES 里`);
        }
    }

    const lines = raw.split("\n").length;
    if (lines > 500) fail("skillmd/lines", `SKILL.md ${lines} 行，超过规范建议的 500 行`);

    if (input.changelog !== undefined) {
        const heads = input.changelog.split("\n").filter((l) => /^##\s+\S+/.test(l));
        if (heads.length === 0) {
            fail(
                "changelog/parseable",
                "CHANGELOG.md 里没有 `## <版本>` 条目：version / updatedAt 从这里推导，推不出就是空",
            );
        }
    }

    // 交叉引用：cases.yaml 的 route_to 指向的 Skill 必须存在（改名时最易漏，断言过期没人想到是断言的问题）。
    // 用正则而不是解析 YAML：只要拿到那几行值，不值得为它拉整套结构进来。
    const cases = input.cases ?? "";
    const known = input.knownSlugs;
    if (cases && known && known.length > 0) {
        for (const m of cases.matchAll(/^\s*route_to:\s*([A-Za-z0-9-]+)\s*$/gm)) {
            if (!known.includes(m[1])) {
                fail("refs/unknown-route", `evals/cases.yaml 的 route_to 指向 "${m[1]}"，skills/ 下没有这份`);
            }
        }
    }

    return out;
}

// ---------------------------------------------------------------------------
// 反例自检：每条规则一个故意违规的假目录，断言它真的会红。
// 唯一目的是防「守卫恒绿」：真目录全绿时，判据写反（阈值错、正则反、门被删）表现为
// 空输出 + exit 0，CI 一路放行，直到有人手改 Skill 才暴露——那时已分不清守卫坏还是内容坏。
// ---------------------------------------------------------------------------

const GOOD_META = `  display_name: "示例"
  icon: "x"
  category: "perception"
  platforms: "通用"
  tags: "示例"
  seed_rating: "4.0"
  seed_downloads: "0"
  featured: "false"`;

// 两条要改 metadata 某一项的反例得整段另写：在 GOOD_META 后追加同名键会造成 YAML 重复键
// （直接抛错走到 frontmatter/parse），自检测的是"解析失败"而不是目标规则，恒绿换了个藏法。
const META_NUMBER_VALUE = `  display_name: "示例"
  icon: "x"
  category: "perception"
  platforms: "通用"
  tags: "示例"
  seed_rating: "4.0"
  seed_downloads: 1280
  featured: "false"`;

const META_BAD_CATEGORY = `  display_name: "示例"
  icon: "x"
  category: "不存在的分类"
  platforms: "通用"
  tags: "示例"
  seed_rating: "4.0"
  seed_downloads: "0"
  featured: "false"`;

const COUNTEREXAMPLES = [
    {
        rule: "files/required",
        why: "少一份 CHANGELOG.md 也要被抓（三份文件是站点 Tab 的数据源）",
        input: { files: ["SKILL.md", "README.md"] },
    },
    {
        rule: "name/required",
        why: "frontmatter 里没有 name",
        input: { files: REQUIRED_FILES, raw: `---\ndescription: "做什么。当用户要用时使用。"\n---\n# x\n` },
    },
    {
        rule: "name/length",
        why: "name 超过 64 字符",
        input: {
            files: REQUIRED_FILES,
            raw: `---\nname: ${"a".repeat(70)}\ndescription: "做什么。当用户要用时使用。"\n---\n# x\n`,
        },
    },
    {
        rule: "name/charset",
        why: "name 用了下划线（规范只允许小写字母数字与连字符）",
        input: {
            files: REQUIRED_FILES,
            raw: `---\nname: aerial_object_detection\ndescription: "做什么。当用户要用时使用。"\n---\n# x\n`,
        },
    },
    {
        rule: "name/matches-dir",
        why: "name 合法但不等于目录名——规范强制两者一致，手改时最容易踩",
        input: {
            files: REQUIRED_FILES,
            raw: `---\nname: other-slug\ndescription: "做什么。当用户要用时使用。"\n---\n# x\n`,
        },
    },
    {
        rule: "name/reserved",
        why: "name 含保留字 anthropic",
        input: {
            files: REQUIRED_FILES,
            raw: `---\nname: anthropic-helper\ndescription: "做什么。当用户要用时使用。"\n---\n# x\n`,
        },
    },
    {
        rule: "description/required",
        why: "frontmatter 里没有 description",
        input: { files: REQUIRED_FILES, raw: `---\nname: demo\n---\n# x\n` },
    },
    {
        rule: "description/length",
        why: `description 超过 ${DESC_MAX} 字符`,
        input: {
            files: REQUIRED_FILES,
            raw: `---\nname: demo\ndescription: "做什么。当用户要用时使用。${"填".repeat(DESC_MAX)}"\n---\n# x\n`,
        },
    },
    {
        rule: "description/when",
        why: "description 只说做什么、没说什么时候用（规范两样都要）",
        input: { files: REQUIRED_FILES, raw: `---\nname: demo\ndescription: "做一件很厉害的事情。"\n---\n# x\n` },
    },
    {
        rule: "frontmatter/top-level",
        why: "站点字段（rating）写在了顶层而不是 metadata 里",
        input: {
            files: REQUIRED_FILES,
            raw: `---\nname: demo\ndescription: "做什么。当用户要用时使用。"\nrating: 4.5\nmetadata:\n${GOOD_META}\n---\n# x\n`,
        },
    },
    {
        rule: "metadata/required",
        why: "整个 metadata 段缺失",
        input: { files: REQUIRED_FILES, raw: `---\nname: demo\ndescription: "做什么。当用户要用时使用。"\n---\n# x\n` },
    },
    {
        rule: "metadata/strings",
        why: "metadata 的值写成了数字（规范要求 string→string）",
        input: {
            files: REQUIRED_FILES,
            raw: `---\nname: demo\ndescription: "做什么。当用户要用时使用。"\nmetadata:\n${META_NUMBER_VALUE}\n---\n# x\n`,
        },
    },
    {
        rule: "metadata/required-fields",
        why: "metadata 少了 tags（站点列表页要用）",
        input: {
            files: REQUIRED_FILES,
            raw: `---\nname: demo\ndescription: "做什么。当用户要用时使用。"\nmetadata:\n  display_name: "示例"\n  category: "perception"\n  platforms: "通用"\n---\n# x\n`,
        },
    },
    {
        rule: "metadata/category",
        why: "category 不在 lib/constants.ts 的白名单里（写了就没人能筛到它）",
        input: {
            files: REQUIRED_FILES,
            raw: `---\nname: demo\ndescription: "做什么。当用户要用时使用。"\nmetadata:\n${META_BAD_CATEGORY}\n---\n# x\n`,
        },
    },
    {
        rule: "skillmd/lines",
        why: "SKILL.md 超过 500 行（规范建议上限，超了会挤掉上下文）",
        input: {
            files: REQUIRED_FILES,
            raw: `---\nname: demo\ndescription: "做什么。当用户要用时使用。"\n---\n${"# 行\n".repeat(520)}`,
        },
    },
    {
        rule: "changelog/parseable",
        why: "CHANGELOG.md 里没有 `## <版本>` 条目——version / updatedAt 会从这里推导",
        input: {
            files: REQUIRED_FILES,
            raw: `---\nname: demo\ndescription: "做什么。当用户要用时使用。"\nmetadata:\n${GOOD_META}\n---\n# x\n`,
            changelog: "# 版本历史\n\n还没写过。\n",
        },
    },
    {
        rule: "refs/unknown-route",
        why: "cases.yaml 的 route_to 指向一份不存在的 Skill（改名时目录改了、引用没改）",
        input: {
            files: REQUIRED_FILES,
            raw: `---\nname: demo\ndescription: "做什么。当用户要用时使用。"\nmetadata:\n${GOOD_META}\n---\n# x\n`,
            cases: "cases:\n  - id: x\n    route_to: px4-not-a-real-skill\n",
            knownSlugs: ["demo", "px4-uorb-messaging"],
        },
    },
];

function selfTest(categories) {
    const notRed = [];
    for (const cx of COUNTEREXAMPLES) {
        const problems = collectProblems({ slug: "demo", categories, ...cx.input });
        if (!problems.some((p) => p.rule === cx.rule)) {
            notRed.push(cx.rule);
        }
    }
    if (notRed.length > 0) {
        // 这一条走的是同一套 collectProblems，所以到不了这里本身就说明门被删了或判据写反了
        log.err(
            `  FAIL self-test/guards-fired -> ${notRed.length} 条规则对反例无反应（守卫恒绿）：${notRed.join(", ")}`,
        );
        return 1;
    }
    log.ok(`OK 反例自检：${COUNTEREXAMPLES.length} 条规则每条都会被自己的反例打红`);
    return 0;
}

function main() {
    const selfTestOnly = process.argv.includes("--self-test");
    const categories = readCategories();

    if (selfTestOnly) {
        process.exitCode = selfTest(categories);
        return;
    }

    let code = selfTest(categories);

    if (!existsSync(SKILLS_DIR)) {
        log.err(`  FAIL skills/missing-dir -> 内容源不存在：${SKILLS_DIR}`);
        process.exitCode = 1;
        return;
    }
    const slugs = readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

    if (slugs.length === 0) {
        log.err("  FAIL skills/empty -> web/content/skills/ 下没有任何 Skill 目录");
        process.exitCode = 1;
        return;
    }

    const problems = [];
    for (const slug of slugs) {
        const dir = join(SKILLS_DIR, slug);
        const files = REQUIRED_FILES.filter((f) => existsSync(join(dir, f)));
        const raw = files.includes("SKILL.md") ? readFileSync(join(dir, "SKILL.md"), "utf8") : "";
        const changelog = files.includes("CHANGELOG.md") ? readFileSync(join(dir, "CHANGELOG.md"), "utf8") : undefined;
        const casesPath = join(dir, "evals", "cases.yaml");
        const cases = existsSync(casesPath) ? readFileSync(casesPath, "utf8") : undefined;
        // knownSlugs 传全量目录名：route_to 指向的目标必须真的存在
        for (const p of collectProblems({ slug, files, raw, changelog, cases, knownSlugs: slugs, categories })) {
            problems.push({ slug, ...p });
        }
    }

    if (problems.length) {
        log.err(`Skill 规范校验失败（${slugs.length} 个目录下 ${problems.length} 处问题）：`);
        for (const p of problems) log.err(`  FAIL ${p.rule} -> [${p.slug}] ${p.msg}`);
        log.err(`RESULT: ${problems.length} 处未过`);
        process.exitCode = 1;
        return;
    }
    log.ok(`Skill 规范校验通过：${slugs.length} 个目录，分类白名单 ${categories.length} 项`);
    if (code !== 0) process.exitCode = code;
}

main();
