/**
 * 指南 MDX 可编译守卫：`web/content/guide/*.mdx` 每一份都要过 @mdx-js/mdx 的编译。
 *
 * 为什么必须有它：这些文件由 next-mdx-remote 在**请求期**编译——`next build` 不碰它们的
 * 正文，markdownlint 只管写法风格，`build:kb --check` 只比对生成产物与知识源是否一致。
 * 于是正文里混进一个裸 `{`（知识源描述带 `{invalid_frac:.0%}` 这类格式占位符）会一路
 * 绿到用户打开页面才 500——2026-09-26 实际发生过，转义入口是 build-knowledge.mjs 的
 * `escMdxText`，手写页则用反斜杠 `\{` 或挪进反引号。
 *
 * 管线对齐：只挂 remark-gfm，与 GuideBody 的 MDX 侧 `sharedRemarkPlugins` 一致；
 * @mdx-js/mdx 从 **next-mdx-remote 的依赖闭包**里解析——生产用哪份这里就用哪份，
 * 不写死 node_modules/.pnpm 的版本路径（store 里同时躺着 3.0.1 与 3.1.1 两份）。
 *
 * ## 输出契约（被 tools/ci/mutate_guards.py 解析，改格式前先看那边）
 *
 * 失败行必须是 `  FAIL <规则id> -> <详情>`：自证机按 `<规则id>` 判「**恰好**这一条红」，
 * 规则 id 是稳定契约。总结行不许写成 `FAIL <名字>`（会被当成一条检查名，变异自证报
 * "牵连"）——用 `RESULT:`。只用 ASCII 符号（Windows 控制台默认 GBK，`✗ ✓` 会崩）。
 *
 * ## 内置反例自检（--self-test 只跑自检；默认自检 + 真目录一起跑）
 *
 * 防守卫恒绿：编译一个**故意带裸 `{`** 的反例，断言它真的被拒收；再编译一个反斜杠
 * 转义的正例，断言没被误杀。真目录全绿时，只有反例能证明这条守卫还活着。
 */
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const GUIDE_DIR = join(webRoot, "content", "guide");
const RULE_COMPILE = "mdx-compile";
const RULE_COVERAGE = "mdx-coverage";

const webRequire = createRequire(join(webRoot, "package.json"));
const { compile } = createRequire(webRequire.resolve("next-mdx-remote/package.json"))("@mdx-js/mdx");
const remarkGfmMod = webRequire("remark-gfm");
const remarkGfm = remarkGfmMod.default ?? remarkGfmMod;

/** 编译一段 mdx；返回 null = 通过，否则 { pos, message }。 */
async function compileSource(src) {
    try {
        await compile(src, { remarkPlugins: [remarkGfm] });
        return null;
    } catch (e) {
        const pos = e.position ? `${e.position.start.line}:${e.position.start.column}` : "?";
        return { pos, message: String(e.message).split("\n")[0] };
    }
}

let failures = 0;

// ---- 反例自检：守卫自己的「会红」证明，与真目录无关 ----
const BAD = "描述里有 {invalid_frac:.0%} 样本";
const GOOD = "描述里有 \\{invalid_frac:.0%\\} 样本";
if ((await compileSource(BAD)) === null) {
    console.log("  FAIL self-test -> 裸花括号反例没有被拒收，守卫恒绿");
    failures++;
} else {
    console.log("  ok    self-test 反例确实被拒收");
}
if ((await compileSource(GOOD)) !== null) {
    console.log("  FAIL self-test -> 反斜杠转义的正例被误杀");
    failures++;
}

// ---- 门还在：这份检查必须挂在统一入口上（先例：guard_apm_parser_version / guard_engine_names）----
// check_all.py 只按清单转发：checklist.yml 里没这一步，上面全部照跑也永远没人执行。
const CHECKLIST = resolve(webRoot, "..", "tools", "ci", "checklist.yml");
if (!readFileSync(CHECKLIST, "utf8").includes('- id: "check-guide-mdx"')) {
    console.log("  FAIL mdx-wiring -> 这道门挂在统一入口上（checklist.yml 里没有 check-guide-mdx）");
    failures++;
}

// ---- 真目录：content/guide/*.mdx 逐个编译 ----
if (!process.argv.includes("--self-test")) {
    const files = readdirSync(GUIDE_DIR)
        .filter((f) => f.endsWith(".mdx"))
        .sort();
    if (files.length === 0) {
        console.log(`  FAIL ${RULE_COVERAGE} -> content/guide 里一个 .mdx 都没有，守卫空转`);
        failures++;
    }
    let okCount = 0;
    for (const f of files) {
        const err = await compileSource(readFileSync(join(GUIDE_DIR, f), "utf8"));
        if (err === null) {
            okCount++;
            continue;
        }
        failures++;
        console.log(`  FAIL ${RULE_COMPILE} -> content/guide/${f}:${err.pos} ${err.message}`);
        console.log("         生成器注入的自由文本要过 escMdxText；手写页用反斜杠转义或挪进反引号");
    }
    console.log(`RESULT: ${okCount}/${files.length} 份 guide mdx 编译通过`);
}

process.exit(failures ? 1 : 0);
