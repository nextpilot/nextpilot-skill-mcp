/**
 * 指南 MDX 可编译守卫：web/content/guide/*.mdx 每份都要过 @mdx-js/mdx 编译。
 * next-mdx-remote 在请求期编译，next build 不碰正文、markdownlint 只管风格，于是正文里一个裸 `{`
 * （知识源描述带 `{invalid_frac:.0%}` 这类占位符）会一路绿到用户打开页面才 500；转义入口是
 * build-knowledge.mjs 的 `escMdxText`，手写页用 `\{` 或挪进反引号。
 * 管线只挂 remark-gfm，与 GuideBody 的 MDX 侧 sharedRemarkPlugins 一致；@mdx-js/mdx 从
 * next-mdx-remote 的依赖闭包解析（不写死版本路径，store 里同时躺着 3.0.1 与 3.1.1）。
 * 输出契约（mutate_guards.py 解析）：失败行 `  FAIL <规则id> -> <详情>`，规则 id 是稳定契约；
 * 总结行用 `RESULT:`；只用 ASCII（Windows 控制台 GBK）。
 * 内置反例自检（--self-test 只跑自检）：编译故意带裸 `{` 的反例断言被拒收、反斜杠转义的正例断言没被误杀。
 */
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { log } from "./lib/log.mjs";

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
    log.err("  FAIL self-test -> 裸花括号反例没有被拒收，守卫恒绿");
    failures++;
} else {
    log.ok("  ok    self-test 反例确实被拒收");
}
if ((await compileSource(GOOD)) !== null) {
    log.err("  FAIL self-test -> 反斜杠转义的正例被误杀");
    failures++;
}

// ---- 门还在：这份检查必须挂在统一入口上。check_all.py 只按清单转发，checklist.yml 里没这步就没人执行 ----
const CHECKLIST = resolve(webRoot, "..", "tools", "ci", "checklist.yml");
if (!readFileSync(CHECKLIST, "utf8").includes('- id: "check-guide-mdx"')) {
    log.err("  FAIL mdx-wiring -> 这道门挂在统一入口上（checklist.yml 里没有 check-guide-mdx）");
    failures++;
}

// ---- 真目录：content/guide/*.mdx 逐个编译 ----
if (!process.argv.includes("--self-test")) {
    const files = readdirSync(GUIDE_DIR)
        .filter((f) => f.endsWith(".mdx"))
        .sort();
    if (files.length === 0) {
        log.err(`  FAIL ${RULE_COVERAGE} -> content/guide 里一个 .mdx 都没有，守卫空转`);
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
        log.err(`  FAIL ${RULE_COMPILE} -> content/guide/${f}:${err.pos} ${err.message}`);
        log.err("         生成器注入的自由文本要过 escMdxText；手写页用反斜杠转义或挪进反引号");
    }
    log.info(`RESULT: ${okCount}/${files.length} 份 guide mdx 编译通过`);
}

process.exit(failures ? 1 : 0);
