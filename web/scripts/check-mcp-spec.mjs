/**
 * MCP 条目合规校验：`web/content/mcp/<slug>/` 是否满足 MCP Registry 规范与本站的字段约定。
 *
 * 与 `check-skill-spec.mjs` 是一对，但**规范不同源**，别当成同一套：
 * Skill 走 Agent Skills 规范（SKILL.md，name 是 kebab 且必须等于目录名）；
 * MCP 走 MCP Registry 规范的 `server.json`（name 是反向 DNS `io.github.owner/repo`）。
 * 两条命名规则互斥，所以这两个守卫只能分开写，合成一个必然有一边是错的。
 *
 * 规范依据（2026-09-20 核对）：
 *   - registry.modelcontextprotocol.io 的 server.json schema
 *     必填 `$schema` / `name` / `description` / `version` / `packages[]`
 *     `name` = 反向 DNS，大小写敏感；`description` ≤ 100 字符
 *     `packages[]`：registryType / identifier / version / transport.type（stdio | streamable-http | sse）
 *     可选 repository{url,source} / title / websiteUrl / remotes[]
 *
 * ## 输出契约（被 mutate_guards.py 解析，改格式前先看那边）
 *
 * 失败行必须是 `  FAIL <规则id> -> <详情>`；总结行不许写成 `FAIL <名字>`（会被当成一条
 * 检查名，于是每条变异都误报"牵连"）——用 `RESULT: N 处未过`。只用 ASCII。
 *
 * ## 上游未确认的条目
 *
 * `README.md` frontmatter 写 `upstream_status: "pending"` 的条目允许**暂时没有**
 * `server.json`（本站收录 MSFS 那条时没记 sourceUrl，工具名也对不上任何公开项目，
 * 硬填 manifest 就是编造）。这种条目会被显式打印成 `SKIP` 而不是悄悄放过——
 * 每次校验都看得见"还有几条待补"。
 *
 * 用法（在 web/ 下）：
 *   node scripts/check-mcp-spec.mjs               # 反例自检 + 真目录
 *   node scripts/check-mcp-spec.mjs --self-test   # 只跑反例自检
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const MCP_DIR = join(webRoot, "content", "mcp");

/** 反向 DNS：`io.github.furkanisikay/ardupilot-mcp` */
const NAME_RE = /^[a-z0-9]+(?:\.[a-z0-9-]+)*\/[a-z0-9-]+$/;
const DESC_MAX = 100;
const REQUIRED_FILES = ["README.md", "CHANGELOG.md"];
const REQUIRED_MANIFEST = ["$schema", "name", "description", "version", "packages"];
const REQUIRED_PACKAGE = ["registryType", "identifier", "version", "transport"];
const TRANSPORTS = new Set(["stdio", "streamable-http", "sse", "http"]);
const REQUIRED_README = ["name", "description", "tools", "tags"];
const PENDING = "pending";
const VERSION_HEADING = /^##\s+(\S+)(?:\s*[—–-]\s*(\S+))?\s*$/;

/**
 * 单个 MCP 目录的全部问题。纯函数（不碰文件系统）——反例自检要拿内存里的假目录
 * 走同一套判据，否则自检测的是另一份逻辑，等于没测。
 *
 * @param {{slug: string, files: string[], readme?: string, changelog?: string, serverJson?: object}} input
 * @returns {{rule: string, msg: string, pending?: boolean}[]}
 */
export function collectProblems(input) {
    const { files } = input;
    const out = [];
    const fail = (rule, msg) => out.push({ rule, msg });

    for (const file of REQUIRED_FILES) {
        if (!files.includes(file)) fail("files/required", `缺少 ${file}`);
    }
    if (!files.includes("README.md") || !files.includes("CHANGELOG.md")) return out;

    const readme = input.readme ?? "";
    const data = matter(readme).data || {};

    for (const key of REQUIRED_README) {
        const v = data[key];
        if (v == null || String(v).trim() === "") fail("readme/required-fields", `README frontmatter 缺 ${key}`);
    }

    const heads = (input.changelog ?? "").split("\n").filter((l) => VERSION_HEADING.test(l));
    if (heads.length === 0) {
        fail(
            "changelog/parseable",
            "CHANGELOG.md 里没有 `## <版本>` 条目：version / updatedAt 从这里推导，推不出就是空",
        );
    }
    const latestVersion = heads.length ? VERSION_HEADING.exec(heads[0])[1] : "";

    const status = data.upstream_status == null ? "" : String(data.upstream_status).trim();
    if (status && status !== PENDING) {
        fail(
            "upstream-status/known",
            `upstream_status "${status}" 不是已知值（只有 "${PENDING}"）；拼错会让「缺 server.json」被静默放过`,
        );
    }
    const isPending = status === PENDING;

    if (!input.serverJson) {
        if (!isPending) {
            out.push({
                rule: "server-json/required",
                msg: '缺 server.json；上游确实还没核实就在 README frontmatter 写 upstream_status: "pending"',
            });
        }
        // pending 条目没有 manifest，传输方式只能退回 README 的过渡值——那就必须有，否则站点没得显示
        if (!data.transport) {
            fail(
                "transport/needed-when-pending",
                "没有 server.json 时 README frontmatter 必须写 transport（站点要显示传输方式）",
            );
        }
        return out;
    }

    // 有了 manifest 之后，README 里再写一份 transport 就是两份会分叉的真源
    if (data.transport != null) {
        fail(
            "transport/single-source",
            "README frontmatter 与 server.json 同时写了 transport：传输方式只以 server.json 的 packages[].transport 为真源",
        );
    }

    const m = input.serverJson;
    for (const key of REQUIRED_MANIFEST) {
        if (m[key] === undefined) fail("server-json/fields", `server.json 缺必填字段 ${key}`);
    }

    const name = m.name == null ? "" : String(m.name);
    if (name && !NAME_RE.test(name)) {
        fail("server-json/name-format", `name "${name}" 不是反向 DNS（应为 io.github.<owner>/<repo> 之类）`);
    }

    const desc = m.description == null ? "" : String(m.description);
    if (desc.length > DESC_MAX) {
        fail(
            "server-json/description-length",
            `description ${desc.length} 字符，超过 ${DESC_MAX}（MCP Registry 上限）`,
        );
    }

    if (m.version != null && latestVersion && String(m.version) !== latestVersion) {
        fail(
            "server-json/version-matches-changelog",
            `server.json 的 version "${m.version}" 与 CHANGELOG 最新一条 "${latestVersion}" 不一致：版本历史的真源是 CHANGELOG.md`,
        );
    }

    const packages = m.packages;
    if (!Array.isArray(packages) || packages.length === 0) {
        fail("server-json/packages", "packages 必须是非空数组（MCP Registry 靠它知道怎么装）");
    } else {
        packages.forEach((p, i) => {
            if (!p || typeof p !== "object") {
                fail("server-json/packages", `packages[${i}] 不是对象`);
                return;
            }
            for (const key of REQUIRED_PACKAGE) {
                if (p[key] === undefined) fail("server-json/packages", `packages[${i}] 缺 ${key}`);
            }
            const type = p.transport && p.transport.type;
            if (type && !TRANSPORTS.has(String(type))) {
                fail(
                    "server-json/packages",
                    `packages[${i}].transport.type "${type}" 不在已知取值里（${[...TRANSPORTS].join(" / ")}）`,
                );
            }
        });
    }

    // 没核实就别填：占位符混进 manifest，客户端照着装会装到一个不存在的包
    const flat = JSON.stringify(m);
    for (const marker of ["TODO", "__", "待补", "unknown"]) {
        if (flat.includes(marker)) {
            fail(
                "server-json/no-placeholder",
                `server.json 含占位标记 "${marker}"：没核实就先标 upstream_status: "pending"，不要填假值`,
            );
        }
    }

    return out;
}

// ---------------------------------------------------------------------------
// 反例自检：每条规则一个**故意违规**的假目录，断言它真会红。
//
// 存在的唯一理由是防「守卫恒绿」。真目录数量少且多数合法，任何一条判据被写反都表现为
// 空输出 + exit 0，只有反例会失声。
// ---------------------------------------------------------------------------

const GOOD_README = `---
name: "示例"
description: "做一件事"
tools: ["a", "b"]
tags: ["x"]
transport: stdio
readOnly: true
---

# 示例
`;

const PENDING_README = `---
name: "示例"
description: "做一件事"
tools: ["a", "b"]
tags: ["x"]
transport: stdio
upstream_status: "pending"
---

# 示例
`;

const GOOD_CHANGELOG = "# 版本历史\n\n## 1.0.0 — 2026-06-14\n\n- 首发\n";

const GOOD_MANIFEST = {
    $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    name: "io.github.example/demo",
    description: "Does a thing for demo purposes.",
    version: "1.0.0",
    repository: { url: "https://github.com/example/demo", source: "github" },
    packages: [{ registryType: "pypi", identifier: "demo", version: "1.0.0", transport: { type: "stdio" } }],
};

const COUNTEREXAMPLES = [
    {
        rule: "files/required",
        why: "少一份 CHANGELOG.md",
        input: { files: ["README.md"] },
    },
    {
        rule: "readme/required-fields",
        why: "README frontmatter 少了 tools",
        input: {
            files: REQUIRED_FILES,
            readme: `---\nname: "x"\ndescription: "y"\ntags: ["z"]\ntransport: stdio\n---\n# x\n`,
            changelog: GOOD_CHANGELOG,
        },
    },
    {
        rule: "changelog/parseable",
        why: "CHANGELOG.md 里没有 `## <版本>` 条目",
        input: { files: REQUIRED_FILES, readme: PENDING_README, changelog: "# 版本历史\n\n还没写。\n" },
    },
    {
        rule: "upstream-status/known",
        why: "upstream_status 拼成了 pendng —— 拼错会让缺 server.json 被静默放过",
        input: {
            files: REQUIRED_FILES,
            readme: `---\nname: "x"\ndescription: "y"\ntools: ["a"]\ntags: ["z"]\ntransport: stdio\nupstream_status: "pendng"\n---\n# x\n`,
            changelog: GOOD_CHANGELOG,
        },
    },
    {
        rule: "server-json/required",
        why: "没有标 pending 却缺 server.json",
        input: { files: REQUIRED_FILES, readme: GOOD_README, changelog: GOOD_CHANGELOG },
    },
    {
        rule: "transport/needed-when-pending",
        why: "pending 条目连 README 里的过渡 transport 都没写，站点就没得显示",
        input: {
            files: REQUIRED_FILES,
            readme: `---\nname: "x"\ndescription: "y"\ntools: ["a"]\ntags: ["z"]\nupstream_status: "pending"\n---\n# x\n`,
            changelog: GOOD_CHANGELOG,
        },
    },
    {
        rule: "transport/single-source",
        why: "有 server.json 了，README 里还留着一份 transport（两份会分叉）",
        input: {
            files: REQUIRED_FILES,
            readme: GOOD_README,
            changelog: GOOD_CHANGELOG,
            serverJson: GOOD_MANIFEST,
        },
    },
    {
        rule: "server-json/fields",
        why: "server.json 少了必填的 packages",
        input: {
            files: REQUIRED_FILES,
            readme: GOOD_README.replace("transport: stdio\n", ""),
            changelog: GOOD_CHANGELOG,
            serverJson: { ...GOOD_MANIFEST, packages: undefined },
        },
    },
    {
        rule: "server-json/name-format",
        why: "name 写成了 kebab 而不是反向 DNS —— 照抄 Skill 那套最容易犯的错",
        input: {
            files: REQUIRED_FILES,
            readme: GOOD_README.replace("transport: stdio\n", ""),
            changelog: GOOD_CHANGELOG,
            serverJson: { ...GOOD_MANIFEST, name: "ardupilot-mcp" },
        },
    },
    {
        rule: "server-json/description-length",
        why: `description 超过 ${DESC_MAX} 字符`,
        input: {
            files: REQUIRED_FILES,
            readme: GOOD_README.replace("transport: stdio\n", ""),
            changelog: GOOD_CHANGELOG,
            serverJson: { ...GOOD_MANIFEST, description: "x".repeat(DESC_MAX + 10) },
        },
    },
    {
        rule: "server-json/version-matches-changelog",
        why: "server.json 的 version 与 CHANGELOG 最新一条不一致（版本历史的真源是 CHANGELOG）",
        input: {
            files: REQUIRED_FILES,
            readme: GOOD_README.replace("transport: stdio\n", ""),
            changelog: GOOD_CHANGELOG,
            serverJson: { ...GOOD_MANIFEST, version: "9.9.9" },
        },
    },
    {
        rule: "server-json/packages",
        why: "packages[0] 缺 transport",
        input: {
            files: REQUIRED_FILES,
            readme: GOOD_README.replace("transport: stdio\n", ""),
            changelog: GOOD_CHANGELOG,
            serverJson: {
                ...GOOD_MANIFEST,
                packages: [{ registryType: "pypi", identifier: "demo", version: "1.0.0" }],
            },
        },
    },
    {
        rule: "server-json/no-placeholder",
        why: "manifest 里留着 TODO —— 客户端照着装会装到一个不存在的包",
        input: {
            files: REQUIRED_FILES,
            readme: GOOD_README.replace("transport: stdio\n", ""),
            changelog: GOOD_CHANGELOG,
            serverJson: {
                ...GOOD_MANIFEST,
                packages: [
                    { registryType: "pypi", identifier: "TODO", version: "1.0.0", transport: { type: "stdio" } },
                ],
            },
        },
    },
];

function selfTest() {
    const notRed = [];
    for (const cx of COUNTEREXAMPLES) {
        const problems = collectProblems({ slug: "demo", ...cx.input });
        if (!problems.some((p) => p.rule === cx.rule)) notRed.push(cx.rule);
    }
    if (notRed.length > 0) {
        console.error(
            `  FAIL self-test/guards-fired -> ${notRed.length} 条规则对反例无反应（守卫恒绿）：${notRed.join(", ")}`,
        );
        return 1;
    }
    console.log(`OK 反例自检：${COUNTEREXAMPLES.length} 条规则每条都会被自己的反例打红`);
    return 0;
}

function main() {
    const categories = process.argv.includes("--self-test");
    if (categories) {
        process.exitCode = selfTest();
        return;
    }

    let code = selfTest();

    if (!existsSync(MCP_DIR)) {
        console.error(`  FAIL mcp/missing-dir -> 内容源不存在：${MCP_DIR}`);
        process.exitCode = 1;
        return;
    }
    const slugs = readdirSync(MCP_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    if (slugs.length === 0) {
        console.error("  FAIL mcp/empty -> web/content/mcp/ 下没有任何 MCP 目录");
        process.exitCode = 1;
        return;
    }

    const problems = [];
    const pending = [];
    for (const slug of slugs) {
        const dir = join(MCP_DIR, slug);
        const files = REQUIRED_FILES.filter((f) => existsSync(join(dir, f)));
        const readme = files.includes("README.md") ? readFileSync(join(dir, "README.md"), "utf8") : "";
        const changelog = files.includes("CHANGELOG.md") ? readFileSync(join(dir, "CHANGELOG.md"), "utf8") : undefined;
        const manifestPath = join(dir, "server.json");
        const serverJson = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : undefined;
        for (const p of collectProblems({ slug, files, readme, changelog, serverJson })) {
            problems.push({ slug, ...p });
        }
        if (!serverJson && matter(readme).data?.upstream_status === PENDING) pending.push(slug);
    }

    // 待补不是"通过"，是**挂在明处的一次例外**：每次校验都列出来，免得长成永久状态
    for (const slug of pending) {
        console.log(
            `SKIP ${slug} 上游未确认（upstream_status: "pending"），暂缺 server.json —— 核实后补上并删掉该字段`,
        );
    }

    if (problems.length) {
        console.error(`MCP 规范校验失败（${slugs.length} 个目录下 ${problems.length} 处问题）：`);
        for (const p of problems) console.error(`  FAIL ${p.rule} -> [${p.slug}] ${p.msg}`);
        console.error(`RESULT: ${problems.length} 处未过`);
        process.exitCode = 1;
        return;
    }
    console.log(`MCP 规范校验通过：${slugs.length} 个目录（其中 ${pending.length} 个待补 server.json）`);
    if (code !== 0) process.exitCode = code;
}

main();
