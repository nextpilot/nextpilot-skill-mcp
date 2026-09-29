#!/usr/bin/env node
/**
 * Skill 效果回归测试
 *   node scripts/run-skill-evals.mjs <slug>         # dry-run：只列用例不打分
 *   node scripts/run-skill-evals.mjs                # 列出所有 Skill 的用例概况
 *   node scripts/run-skill-evals.mjs <slug> --run   # 真跑 cases.yaml（需配 LLM API）
 *   node scripts/run-skill-evals.mjs <slug> --e2e   # 跑 evals/e2e.yaml（确定性，无需 API key）
 * check-skill-spec.mjs 只校验格式；SKILL.md 本质是 prompt，改一句话可能让召回率崩掉而格式照样正常。
 * --run 判要素不比对精确输出（自然语言逐字比对必然全红）：must_mention / must_not_mention 正则机械查，
 * judge 交给 LLM-as-judge；--e2e 断言 scripts/ 里确定性工具的行为（查字符串/退出码，可复现、几百毫秒）。
 * 环境变量（--run 时需要）：ANTHROPIC_API_KEY 或 OPENAI_API_KEY / OPENAI_BASE_URL
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { log } from "./lib/log.mjs";

// e2e 用 `python3` 跑脚本，pyulog 装在仓库 .venv 里：把 .venv/bin 提到 PATH 最前，让解释器不取决于谁在跑。
// 没建 .venv 时原样放行（缺 pyulog 会明确报 ImportError，比静默用错解释器好排查）。
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const VENV_BIN = path.join(REPO_ROOT, ".venv", "bin");
const E2E_ENV = { ...process.env };
if (fs.existsSync(path.join(VENV_BIN, "python3"))) {
    E2E_ENV.PATH = VENV_BIN + path.delimiter + (E2E_ENV.PATH ?? "");
}

// 位置参数先滤掉 flag，否则 --e2e 会被当成 skills 目录
const argv = process.argv.slice(2).filter((a) => !a.startsWith("--"));
// 默认相对脚本自身定位，不依赖 cwd；传第二个位置参数可覆盖（想在临时目录里试改过的 skill）
const SKILLS_DIR = path.resolve(argv[1] ?? path.join(import.meta.dirname, "..", "content", "skills"));
const target = argv[0];
const RUN = process.argv.includes("--run");
const E2E = process.argv.includes("--e2e");

// ---------- 极简 YAML 解析（只支持 cases.yaml 用到的子集） ----------
// 不引依赖，让脚本能在任何 CI 里跑；cases.yaml 变复杂就换 js-yaml。
// 关键是区分「块标量」和「块序列」——都是 key 后面什么都不写，只能靠下一行缩进内容判断：
//     judge: | → 块标量（文本）；must_mention: → 块序列（- foo）
function parseCases(text) {
    const lines = text.split("\n").filter((l) => !/^\s*#/.test(l));
    const cases = [];
    let i = 0;

    while (i < lines.length && !/^cases:/.test(lines[i])) i++;
    i++;

    while (i < lines.length) {
        const idLine = lines[i];
        if (/^\S/.test(idLine)) break;

        const m = /^ {2}- id:\s*(.+)$/.exec(idLine);
        if (!m) {
            i++;
            continue;
        }

        const c = { id: m[1].trim() };
        i++;

        while (i < lines.length) {
            const l = lines[i];
            if (/^ {2}- id:/.test(l) || /^\S/.test(l)) break;
            if (!l.trim()) {
                i++;
                continue;
            }

            const fm = /^ {4}([a-z_]+):\s*(.*)$/.exec(l);
            if (!fm) {
                i++;
                continue;
            }
            const [, k, v] = fm;

            // 标量值写在同一行
            if (v) {
                c[k] = k === "expect_trigger" ? /^true$/i.test(v) : v.replace(/^["']|["']$/g, "");
                i++;
                continue;
            }

            // 值在后续行：先看下一个非空行是 "- " 还是文本
            let j = i + 1;
            while (j < lines.length && !lines[j].trim()) j++;

            if (j < lines.length && /^ {6}-\s+/.test(lines[j])) {
                // 块序列
                c[k] = [];
                while (j < lines.length && /^ {6}-\s+/.test(lines[j])) {
                    c[k].push(lines[j].replace(/^ {6}-\s+/, "").replace(/^["']|["']$/g, ""));
                    j++;
                }
            } else {
                // 块标量（含 | 或纯缩进文本）
                const buf = [];
                j = i + 1;
                while (j < lines.length && (/^\s{6,}/.test(lines[j]) || !lines[j].trim())) {
                    buf.push(lines[j].slice(6));
                    j++;
                }
                c[k] = buf.join("\n").trim();
            }
            i = j;
        }

        cases.push(c);
    }
    return cases;
}

// ---------- 机械检查 ----------
function checkMechanical(output, c) {
    const fail = [];
    for (const pat of c.must_mention ?? []) {
        try {
            if (!new RegExp(pat, "i").test(output)) fail.push(`缺少必需要素: ${pat}`);
        } catch {
            fail.push(`must_mention 正则非法: ${pat}`);
        }
    }
    for (const pat of c.must_not_mention ?? []) {
        try {
            if (new RegExp(pat, "i").test(output)) fail.push(`出现了禁止内容: ${pat}`);
        } catch {
            fail.push(`must_not_mention 正则非法: ${pat}`);
        }
    }
    return fail;
}

// ---------- LLM-as-judge ----------
async function callJudge(judgeText, input, output) {
    const prompt = `你是评测员。请根据判据给模型输出打分。

判据：
${judgeText}

---
用户输入：
${input}

---
被测输出：
${output}

---
只返回 JSON，不要其他内容：
{"score": <0-10 的整数>, "reason": "<一句话说明>"}`;

    if (process.env.ANTHROPIC_API_KEY) {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": process.env.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-opus-4-20250514",
                max_tokens: 500,
                messages: [{ role: "user", content: prompt }],
            }),
        });
        const j = await r.json();
        const txt = j.content?.[0]?.text ?? "";
        return JSON.parse(txt.replace(/```json|```/g, "").trim());
    }
    throw new Error("未配置 API：请设置 ANTHROPIC_API_KEY（或自行扩展 OPENAI 分支）");
}

// ---------- 跑被测模型 ----------
async function callTarget(skillPrompt, input) {
    if (process.env.ANTHROPIC_API_KEY) {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": process.env.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 2000,
                system: skillPrompt,
                messages: [{ role: "user", content: input }],
            }),
        });
        const j = await r.json();
        return j.content?.[0]?.text ?? "";
    }
    throw new Error("未配置 API");
}

// ---------- main ----------
function listSkill(slug) {
    const dir = path.join(SKILLS_DIR, slug);
    const p = path.join(dir, "evals", "cases.yaml");
    if (!fs.existsSync(p)) return null;
    return {
        slug,
        cases: parseCases(fs.readFileSync(p, "utf8")),
        skill: fs.readFileSync(path.join(dir, "SKILL.md"), "utf8"),
    };
}

async function runSkill(s) {
    log.info(`\n▶ ${s.slug}  (${s.cases.length} 个用例)\n`);
    if (!RUN) {
        for (const c of s.cases) {
            const tags = [];
            if (c.expect_trigger === false) tags.push(`负例→${c.route_to ?? "不触发"}`);
            if (c.weight > 1) tags.push(`权重×${c.weight}`);
            if (c.judge) tags.push("judge");
            log.info(`  ${c.id}`);
            log.info(`     ${c.desc}`);
            if (tags.length) log.info(`     [${tags.join(" | ")}]`);
        }
        log.info(`\n  dry-run 完毕。加 --run 才真正调用模型。`);
        return { pass: 0, total: 0 };
    }

    let pass = 0;
    const results = [];
    for (const c of s.cases) {
        const out = await callTarget(s.skill, c.input);
        const mech = checkMechanical(out, c);
        let judge = null;
        if (c.judge) {
            try {
                judge = await callJudge(c.judge, c.input, out);
            } catch (e) {
                judge = { score: -1, reason: String(e) };
            }
        }
        const ok = mech.length === 0 && (judge ? judge.score >= 7 : true);
        if (ok) pass++;
        results.push({ id: c.id, ok, mech, judge });
        log.info(`  ${ok ? "✅" : "❌"} ${c.id}`);
        for (const f of mech) log.info(`       ${f}`);
        if (judge) log.info(`       judge: ${judge.score}/10 — ${judge.reason}`);
    }

    const pct = results.length ? Math.round((pass / results.length) * 100) : 0;
    log.info(`\n  通过 ${pass}/${results.length}（${pct}%）`);
    return { pass, total: results.length, pct };
}

// ---------- 端到端：确定性链路，不需要 LLM ----------
function checkE2E(c, stdout, stderr, exit) {
    const fail = [];

    if (c.expect_exit !== undefined && Number(c.expect_exit) !== exit) {
        fail.push(
            `退出码 ${exit}，期望 ${c.expect_exit}` + (stderr.trim() ? ` — ${stderr.trim().split("\n").pop()}` : ""),
        );
    }

    // stdout 层面的正则，和 cases.yaml 复用同一套语义
    fail.push(...checkMechanical(stdout, c));

    const wantsJson = [
        "expect_max_critical",
        "expect_critical_rules",
        "expect_critical_fields",
        "expect_clean_fields",
    ].some((k) => c[k] !== undefined);
    if (!wantsJson) return fail;

    let j;
    try {
        j = JSON.parse(stdout);
    } catch {
        fail.push("stdout 不是合法 JSON");
        return fail;
    }

    const findings = j.findings ?? [];
    const crit = findings.filter((f) => f.severity === "critical");

    if (c.expect_max_critical !== undefined && crit.length > Number(c.expect_max_critical)) {
        fail.push(
            `critical 有 ${crit.length} 条，上限 ${c.expect_max_critical}: ` +
                crit.map((f) => `${f.rule}(${f.field})`).join(", "),
        );
    }

    for (const r of c.expect_critical_rules ?? []) {
        if (!crit.some((f) => f.rule === r)) fail.push(`缺少 critical rule: ${r}`);
    }
    for (const field of c.expect_critical_fields ?? []) {
        if (!crit.some((f) => f.field === field)) fail.push(`缺少 critical field: ${field}`);
    }
    for (const prefix of c.expect_clean_fields ?? []) {
        const hit = findings.filter((f) => f.severity !== "ok" && (f.field ?? "").startsWith(prefix));
        if (hit.length) {
            fail.push(`不该在 ${prefix} 上报警: ` + hit.map((f) => `${f.rule}(${f.field}=${f.value})`).join(", "));
        }
    }
    return fail;
}

async function runE2E(slug) {
    const dir = path.join(SKILLS_DIR, slug);
    const p = path.join(dir, "evals", "e2e.yaml");
    if (!fs.existsSync(p)) return { pass: 0, total: 0 };

    const cases = parseCases(fs.readFileSync(p, "utf8"));
    log.info(`\n▶ ${slug} 端到端  (${cases.length} 个用例)\n`);

    let pass = 0;
    for (const c of cases) {
        let stdout,
            stderr = "",
            exit = 0;
        try {
            stdout = execFileSync(c.run, {
                cwd: dir,
                shell: "/bin/sh",
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
                // e2e.yaml 的 run 写的是 `python3`，哪个 python3 取决于 PATH：pyulog 在仓库 .venv，
                // 不提 PATH 则同一份用例开发者机器全绿、干净 CI 上 ImportError 全红（环境问题，不是脚本坏了）
                env: E2E_ENV,
            });
        } catch (e) {
            exit = e.status ?? -1;
            stdout = e.stdout ?? "";
            stderr = e.stderr ?? "";
        }
        const fail = checkE2E(c, stdout, stderr, exit);
        if (fail.length === 0) pass++;
        log.info(`  ${fail.length ? "❌" : "✅"} ${c.id}`);
        if (c.desc) log.info(`      ${c.desc}`);
        for (const f of fail) log.info(`      ${f}`);
    }
    log.info(`\n  通过 ${pass}/${cases.length}`);
    return { pass, total: cases.length };
}

// ---------- 自检：确认判据真的能抓住失效 ----------
if (process.argv.includes("--selftest")) {
    const demo = {
        id: "selftest",
        must_mention: ["gyro_clipping", "innovation_check_flags"],
        must_not_mention: ["MC_ROLLRATE", "MC_PITCHRATE"],
    };
    const bad = "振动有点大，建议把 MC_ROLLRATE_D 降到 0.002 试试。";
    const ok = "gyro_clipping[0]=1847 说明陀螺仪量程打满，innovation_check_flags=6 是它的下游结果。先解决振动。";

    const fails = checkMechanical(bad, demo);
    const passes = checkMechanical(ok, demo);
    log.info("自检：");
    log.info(`  坏输出应被抓到 ${fails.length} 条 →`, fails.join(" / "));
    log.info(`  好输出应无报错 →`, passes.length === 0 ? "✅ 干净" : `❌ ${passes.join(" / ")}`);
    // 坏输出至少要命中一条（实际是 3：缺 2 个必需要素 + 出现 1 个禁止词）
    const ok1 = fails.length >= 2 && passes.length === 0;
    log.info(ok1 ? "\n✅ 判据有效" : "\n❌ 判据有问题");
    process.exit(ok1 ? 0 : 1);
}

// E2E 是一套独立的核算：不需要模型，当场就能给出通过与否
if (E2E) {
    const slugs = target
        ? [target]
        : fs.readdirSync(SKILLS_DIR).filter((d) => fs.existsSync(path.join(SKILLS_DIR, d, "evals", "e2e.yaml")));
    if (!slugs.length) {
        log.info("没有任何 evals/e2e.yaml");
        process.exit(0);
    }
    let pass = 0,
        n = 0;
    for (const slug of slugs) {
        const r = await runE2E(slug);
        pass += r.pass;
        n += r.total;
    }
    if (n) {
        log.info(`\n合计 ${pass}/${n}`);
        process.exit(pass === n ? 0 : 1);
    }
}

const slugs = target
    ? [target]
    : fs.readdirSync(SKILLS_DIR).filter((d) => fs.existsSync(path.join(SKILLS_DIR, d, "evals", "cases.yaml")));

if (!RUN) {
    const noEval = fs
        .readdirSync(SKILLS_DIR)
        .filter(
            (d) =>
                fs.statSync(path.join(SKILLS_DIR, d)).isDirectory() &&
                !fs.existsSync(path.join(SKILLS_DIR, d, "evals", "cases.yaml")),
        );
    if (slugs.length === 0) log.warn("还没有任何 evals/cases.yaml");
    if (noEval.length) log.warn(`尚未写测试用例: ${noEval.join("、")}`);
}

let total = { pass: 0, total: 0 };
for (const slug of slugs) {
    const s = listSkill(slug);
    if (!s) {
        log.err(`❌ ${slug} 没有 evals/cases.yaml`);
        process.exit(1);
    }
    const r = await runSkill(s);
    total.pass += r.pass;
    total.total += r.total;
}

if (RUN && total.total) {
    log.info(`\n合计 ${total.pass}/${total.total}`);
    process.exit(total.pass === total.total ? 0 : 1);
}
