/**
 * 一次性把 `knowledge/skills/*.mdx` 转成 Claude / Agent Skills 规范的目录：
 *
 *   knowledge/skills/<slug>/
 *     SKILL.md       给 AI 看：YAML frontmatter（name + description）+ 指令正文
 *     README.md      给人看：站点「概述」Tab
 *     CHANGELOG.md   给人看：站点「版本历史」Tab（版本历史的唯一真源）
 *
 * 规范依据（2026-09-20 核对）：
 *   - https://agentskills.io/specification （anthropics/skills 仓库 README 指向的规范站）
 *   - https://github.com/anthropics/skills （Anthropic 官方技能仓库，实际文件全为 SKILL.md）
 *   - https://support.claude.com/en/articles/12512198-creating-custom-skills
 *
 * 两处口径冲突，一律取严：   - name：规范站要求「必须与父目录名一致 + 仅小写字母数字与连字符」；support 文档只说
 *     「human-friendly ≤64」。取严 → name = 目录名（kebab），中文展示名挪到
 *     metadata.display_name。两边都过。
 *   - description：support 文档 ≤200 字符，规范站 ≤1024。取严 → ≤200（见 check-skill-spec.mjs）。
 *
 * 用法（在 web/ 下）：
 *   node scripts/migrate-skills-to-spec.mjs           预演，只打印不落盘
 *   node scripts/migrate-skills-to-spec.mjs --apply   真正写入并删除原 .mdx
 *   node scripts/migrate-skills-to-spec.mjs --apply --force   目标已存在也覆盖
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const SKILLS_DIR = join(repoRoot, "knowledge", "skills");

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

/**
 * 「何时使用」与触发词：机器拼不出，是领域知识，只能人工维护在这里。
 * description = 原描述 + 何时使用 + 触发词，总长必须 ≤200 字符（见上）。
 */
const WHEN = {
    "aerial-object-detection": {
        when: "当用户要在航拍画面里自动框选目标、统计人车数量，或做搜救与巡检时使用。",
        triggers: ["航拍检测", "目标检测", "找人", "数车", "巡检", "YOLO"],
    },
    "flow-language-control": {
        when: "当用户想用一句自然语言驱动无人机做精细相对运动，或要设计语言到控制原语的映射时使用。",
        triggers: ["语言控制", "语音控机", "环绕我飞", "穿过拱门", "原子动作", "Flow 范式"],
    },
    "ibvs-visual-servoing": {
        when: "当用户在 GPS 拒止环境做对准、跟踪或精准降落，需要用图像特征误差直接生成速度指令时使用。",
        triggers: ["视觉伺服", "IBVS", "室内飞行", "无 GPS", "AprilTag", "精准降落"],
    },
    "llm-px4-autonomous-navigation": {
        when: "当用户要让 LLM 或 VLM 充当无人机操作员做自主导航决策，并经安全约束层下发给 PX4 时使用。",
        triggers: ["自主导航", "drone operator", "LLM 决策", "VLM 导航", "MAVSDK", "ROS 2"],
    },
    "nl-mission-planning": {
        when: "当用户用口语描述作业目标，需要自动拆解成带航点、航高、相机动作与返航条件的飞行计划时使用。",
        triggers: ["任务规划", "航点规划", "自然语言指令", "巡田", "航线生成"],
    },
    "pid-autotune-assistant": {
        when: "当用户要根据阶跃响应日志为多旋翼或固定翼的姿态环、速率环推荐并迭代 PID 参数时使用。",
        triggers: ["PID 调参", "增益整定", "阶跃响应", "超调", "振荡", "系统辨识"],
    },
    "px4-ulog-analyzer": {
        when: "当用户提供 PX4 .ulg 飞行日志，要定位炸机或异常飞行的原因（振动、EKF、电源、GPS）时使用。",
        triggers: ["ULog", ".ulg", "日志分析", "炸机分析", "PX4 日志", "EKF 创新"],
    },
    "vlm-scene-understanding": {
        when: "当用户想让无人机用自然语言描述现场，或回答开放式视觉问题（如田里有没有人）时使用。",
        triggers: ["视觉语言模型", "VLM", "场景描述", "视觉问答", "Qwen-VL", "LLaVA"],
    },
};

/** 原 mdx 的小节名 → SKILL.md 的 AI 视角小节名。未命中的保持原名。 */
const SECTION_MAP = {
    解决什么问题: "背景",
    核心逻辑: "工作流",
    "System Prompt 要点": "工作流",
    使用建议: "注意事项",
};

const CATEGORY_LABEL = {
    perception: "感知",
    decision: "决策与规划",
    control: "控制",
    toolchain: "系统与工具链",
};

/** YAML 双引号标量：JSON 转义在 YAML 里同样合法，避免中文引号 / 冒号把解析搞坏 */
function yamlStr(v) {
    return JSON.stringify(String(v));
}

/** metadata 规范只允许 string→string，列表与数字都要转成字符串 */
function asMetaList(arr) {
    return Array.isArray(arr) ? arr.join(", ") : "";
}

function splitSections(body) {
    const parts = [];
    let cur = null;
    for (const line of body.split("\n")) {
        const m = /^##\s+(.*\S)\s*$/.exec(line);
        if (m) {
            cur = { title: m[1], lines: [] };
            parts.push(cur);
        } else if (cur) {
            cur.lines.push(line);
        }
    }
    return parts
        .map((s) => ({ ...s, text: s.lines.join("\n").replace(/^\n+|\n+$/g, "") }))
        .filter((s) => s.text.length > 0);
}

function buildSkillMd(slug, data, body) {
    const meta = WHEN[slug];
    if (!meta) throw new Error(`WHEN 表里缺 ${slug}：先补上「何时使用」与触发词再跑`);

    const base = String(data.description ?? "").replace(/[。；;\s]+$/, "");
    const description = `${base}。${meta.when}触发词：${meta.triggers.join("、")}。`;
    const displayName = String(data.name ?? slug);

    const md = Object.fromEntries(Object.entries(data.metadata ?? {}));
    const front = ["---", `name: ${slug}`, `description: ${yamlStr(description)}`];
    if (data.license) front.push(`license: ${yamlStr(data.license)}`);
    front.push("metadata:");
    front.push(`  display_name: ${yamlStr(displayName)}`);
    front.push(`  icon: ${yamlStr(data.icon ?? "")}`);
    front.push(`  category: ${yamlStr(data.category ?? "")}`);
    front.push(`  platforms: ${yamlStr(asMetaList(data.platforms))}`);
    front.push(`  models: ${yamlStr(asMetaList(data.models))}`);
    front.push(`  tags: ${yamlStr(asMetaList(data.tags))}`);
    front.push(`  clients: ${yamlStr(asMetaList(data.clients))}`);
    // 以下三项**不是 Skill 的内容**，是社区指标与编辑位；KV 就位后从这里删掉，改由 KV 提供
    // （站点已按「种子值 + KV 增量」合并：applyDeltas / useLeaderboard）。留在这里只是过渡，
    // 届时不占 SKILL.md，也不会出现「文件里一份、KV 里一份」的两套真源。
    front.push(`  seed_rating: ${yamlStr(data.rating ?? 0)}`);
    front.push(`  seed_downloads: ${yamlStr(data.downloads ?? 0)}`);
    front.push(`  featured: ${yamlStr(Boolean(data.featured))}`);
    if (data.sourceUrl) front.push(`  source_url: ${yamlStr(data.sourceUrl)}`);
    if (data.paperUrl) front.push(`  paper_url: ${yamlStr(data.paperUrl)}`);
    for (const [k, v] of Object.entries(md)) front.push(`  ${k}: ${yamlStr(v)}`);
    front.push("---");

    const out = [`# ${displayName}`, "", "## 何时使用", "", meta.when, "", ...meta.triggers.map((t) => `- ${t}`), ""];

    for (const s of splitSections(body)) {
        out.push(`## ${SECTION_MAP[s.title] ?? s.title}`, "", s.text, "");
    }

    const refs = [];
    if (data.paperUrl) refs.push(`- 论文：${data.paperUrl}`);
    if (data.sourceUrl) refs.push(`- 来源：${data.sourceUrl}`);
    if (refs.length) out.push("## 参考", "", ...refs, "");

    return `${front.join("\n")}\n\n${out
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trimEnd()}\n`;
}

function buildReadme(slug, data, body) {
    const displayName = String(data.name ?? slug);
    const rows = [
        ["分类", CATEGORY_LABEL[data.category] ?? data.category],
        ["适用平台", asMetaList(data.platforms)],
        ["依赖模型", asMetaList(data.models)],
        ["适用客户端", asMetaList(data.clients)],
    ];
    if (data.license) rows.push(["许可证", data.license]);
    if (data.paperUrl) rows.push(["论文", data.paperUrl]);
    if (data.sourceUrl) rows.push(["来源", data.sourceUrl]);

    const table = ["| 项 | 值 |", "| --- | --- |", ...rows.filter((r) => r[1]).map(([k, v]) => `| ${k} | ${v} |`)];

    return [
        `# ${displayName}`,
        "",
        `> ${data.description}`,
        "",
        ...table,
        "",
        body.trim(),
        "",
        "---",
        "",
        "本页内容来自本 Skill 的 `README.md`，AI 可读的指令原文见 `SKILL.md`，版本历史见 `CHANGELOG.md`。",
        "",
    ].join("\n");
}

function buildChangelog(data) {
    const entries = Array.isArray(data.changelog) ? data.changelog : [];
    const list = entries.length
        ? entries
        : [{ version: String(data.version ?? "1.0.0"), date: String(data.updatedAt ?? ""), notes: ["首次收录"] }];

    const out = ["# 版本历史", ""];
    for (const e of list) {
        out.push(`## ${e.version}${e.date ? ` — ${e.date}` : ""}`, "");
        for (const n of e.notes ?? []) out.push(`- ${n}`);
        out.push("");
    }
    return (
        out
            .join("\n")
            .replace(/\n{3,}/g, "\n\n")
            .trimEnd() + "\n"
    );
}

function main() {
    const files = readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".mdx"));
    if (files.length === 0) {
        console.log("没有待转换的 .mdx（已转换过？）");
        return;
    }

    const problems = [];
    for (const file of files) {
        const slug = file.replace(/\.mdx$/, "");
        const raw = readFileSync(join(SKILLS_DIR, file), "utf8");
        const { data, content } = matter(raw);
        const dir = join(SKILLS_DIR, slug);

        const skillMd = buildSkillMd(slug, data, content);
        const readme = buildReadme(slug, data, content);
        const changelog = buildChangelog(data);

        const desc = /^description: (.*)$/m.exec(skillMd)?.[1] ?? "";
        const descText = JSON.parse(desc);
        if (descText.length > 200) {
            problems.push(`${slug}: description ${descText.length} 字符，超过 200 上限`);
        }

        console.log(`\n=== ${slug} ===`);
        console.log(`  description (${descText.length} 字符): ${descText}`);
        console.log(
            `  SKILL.md ${skillMd.split("\n").length} 行 / README.md ${readme.split("\n").length} 行 / CHANGELOG.md ${changelog.split("\n").length} 行`,
        );

        if (existsSync(dir) && !FORCE) {
            console.log(`  跳过：${dir} 已存在（--force 覆盖）`);
            continue;
        }
        if (APPLY) {
            rmSync(dir, { recursive: true, force: true });
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, "SKILL.md"), skillMd, "utf8");
            writeFileSync(join(dir, "README.md"), readme, "utf8");
            writeFileSync(join(dir, "CHANGELOG.md"), changelog, "utf8");
            rmSync(join(SKILLS_DIR, file));
            console.log("  已写入并删除原 .mdx");
        } else {
            console.log("  [预演] 未落盘");
        }
    }

    if (problems.length) {
        console.error("\n以下 skill 不合规，已中止：");
        for (const p of problems) console.error(`  - ${p}`);
        process.exitCode = 1;
        return;
    }
    console.log(APPLY ? `\n完成：转换 ${files.length} 个 skill` : "\n预演通过，加 --apply 落盘");
}

main();
