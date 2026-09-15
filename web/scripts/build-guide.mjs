/**
 * 指南的「知识库」分组：把 knowledge/ 下的知识文档生成成 web 的指南页面。
 *
 * 为什么放在构建期而不是手写进 web/content/guide/：
 * 知识文档的单一事实源在仓库根 knowledge/，网页只是它的一个视图。
 * 生成挂在 `pnpm build:kb` 上（dev/build 都会跑），网页永远跟着 rules/*.yaml 走，
 * 不存在"改了规则忘了重生成网页"这种漂移。
 *
 * 产出（产物提交进仓库，EdgeOne 直接 next build 也有得用）：
 *   web/content/guide/knowledge-write-rule.md   ← knowledge/px4/guides/writing-rules.md
 *   web/content/guide/knowledge-rules.md        ← knowledge/px4/rules/*.yaml（现读现算）
 *   knowledge/px4/reference/rules-index.md      ← 同一份规则清单（仓库内的开发文档）
 *
 * 设计文档（`knowledge/px4/CLAUDE.md`）**不发布**：它含实施状态、已知缺口与提交记录，
 * 是给 AI 与维护者的项目上下文，不是给用户的说明。
 *
 * 体裁转换只做三件事：换标题与前言、去掉源文件的 H1（标题由 frontmatter 提供）、
 * 把 knowledge 内部相对链接改成站内路径。正文一字不改。
 * 渲染走 react-markdown（web/components/GuideMarkdown.tsx）——正文里有
 * `{invalid_frac:.0%}`、`meta/<tag>.json` 这类写法，MDX 会当成 JSX 表达式解析。
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const KN = resolve(webRoot, "../knowledge/px4");
const RULES_DIR = resolve(KN, "rules");
const GUIDE_DIR = resolve(webRoot, "content", "guide");
const RULES_INDEX = resolve(KN, "reference", "rules-index.md");

const GROUP = { zh: "知识库", en: "Knowledge base" };

/** knowledge 内部相对链接 → 站内路径（这些页面就是它们的网页形态） */
const LINK_MAP = [
  [/\]\(\.\.\/guides\/writing-rules\.md\)/g, "](/guide/knowledge-write-rule)"],
  [/\]\(\.\.\/reference\/rules-index\.md\)/g, "](/guide/knowledge-rules)"],
];

const CATALOGUE_INTRO = `引擎当前内置的 **{n} 条检查经验**，按执行位置（slot）分组。每条给出：适用条件
（固件 / 机架 / 依赖）、读哪些字段、什么条件触发、产出哪些标签与统计。

判定阈值就写在各自的经验 YAML 里。所有判定都由确定性引擎在浏览器本地完成——LLM 只把结论
翻译成中文报告，不参与任何数值判断。本页在构建时从 \`rules/*.yaml\` 自动生成。`;

const PAGES = [
  {
    out: "knowledge-write-rule.md",
    src: "guides/writing-rules.md",
    order: 11,
    title: "如何编写一条规则",
    titleEn: "Writing a rule",
    description: "从必填字段到数据流节点、触发条件与输出，附算子目录与常见坑。",
    descriptionEn:
      "Required fields, data-flow nodes, triggers and outputs — plus the operator catalogue and pitfalls.",
    intro: `写一条经验的权威参考：字段级定义、数据流（\`compute\`）语义、触发与输出、
内置变量、算子目录，以及构建期会直接拒绝的写法。

想看现有规则清单：[当前有哪些规则](/guide/knowledge-rules)。`,
  },
];

// ─────────────────────────── 规则清单 ───────────────────────────

/** 读取 rules/*.yaml 并记住来源文件名（校验在 build-knowledge.mjs 里已做过一遍） */
function loadRules() {
  const files = readdirSync(RULES_DIR).filter((f) => f.endsWith(".yaml")).sort();
  const rules = [];
  for (const file of files) {
    const parsed = parseYaml(readFileSync(resolve(RULES_DIR, file), "utf8"));
    for (const raw of Array.isArray(parsed) ? parsed : [parsed]) rules.push({ file, raw });
  }
  return { rules, files };
}

/** 尽量贴近 Python 的 `%s`，免得开发文档因为换成 Node 生成而整篇 diff */
function pyRepr(v) {
  if (Array.isArray(v)) return "[" + v.map(pyRepr).join(", ") + "]";
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "object") {
    return "{" + Object.entries(v).map(([k, val]) => `'${k}': ${pyRepr(val)}`).join(", ") + "}";
  }
  return String(v);
}

const listOr = (v, fallback) => (Array.isArray(v) ? v.join(",") : v === undefined || v === null ? fallback : String(v));

function fmtApplicability(raw) {
  const parts = [`firmware ${listOr(raw.firmware, "any")}`, `airframe ${listOr(raw.airframe, "any")}`];
  const req = raw.requires || {};
  if (req.all_of) parts.push("依赖(全部) " + req.all_of.join(", "));
  if (req.any_of) parts.push("依赖(任一) " + req.any_of.join(", "));
  if (raw.not_applicable?.when) parts.push("不适用当 " + raw.not_applicable.when);
  if (raw.silent_when) parts.push("静默当 " + raw.silent_when);
  return parts.join(" ｜ ");
}

function fmtCompute(raw) {
  const lines = [];
  for (const node of raw.compute || []) {
    const ins = node.in ?? (node.from !== undefined ? [].concat(node.from) : []);
    const opts = Object.entries(node)
      .filter(([k]) => !["in", "from", "out", "op", "optional"].includes(k))
      .map(([k, v]) => `${k}=${pyRepr(v)}`);
    const optsTxt = opts.length ? " " + opts.join(", ") : "";
    const outs = [].concat(node.out ?? []);
    lines.push(`- \`${node.op}\`${optsTxt} → **${outs.join(", ")}**`);
    // 嵌套列表（而不是续行缩进）：续行在 HTML 里会与上一行折成同一段，输入列就糊在算子后面
    lines.push(`    - 输入：${ins.map((i) => `\`${i}\``).join(", ")}`);
  }
  return lines.join("\n") || "- （无 compute）";
}

function fmtTriggers(raw) {
  const lines = [];
  for (const t of raw.triggers || []) {
    const bits = [`**${t.severity}**`, `\`${t.expr}\``];
    if (t.threshold !== undefined && t.threshold !== null) bits.push(`阈值 ${t.threshold}`);
    if (t.unit) bits.push(`单位 ${t.unit}`);
    bits.push(`标题「${t.title}」`);
    lines.push("- " + bits.join(" ｜ "));
  }
  for (const g of raw.emit?.guard_tags || []) {
    lines.push(`- guard：当 \`${g.when}\` 时打标签 \`${g.tag}\``);
  }
  return lines.join("\n") || "- （只产 guard 标签，不发 finding）";
}

function fmtEmit(raw) {
  const emit = raw.emit || {};
  const bits = [];
  if (emit.check) bits.push(`check=${emit.check}`);
  if (emit.tag) bits.push(`tag=${emit.tag}`);
  if (emit.stats) {
    bits.push("stats=" + Object.entries(emit.stats).map(([k, v]) => `${k}(round ${v?.round ?? "-"})`).join(", "));
  }
  return bits.join("，") || "—";
}

const SLOT_LABEL = {
  guards_early: "数据质量 guard（最早执行）",
  guards: "数据质量 guard",
};

/** 规则清单正文（开发文档与网页共用；两者的差别只在标题与前言） */
function renderCatalogue(rules) {
  // 按码点比较而非 localeCompare：后者的结果随机器 ICU 语言环境变化，
  // 生成产物必须逐字节可复现（槽位名都是 ASCII，码点序就是稳定序）
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const bySlot = [...rules].sort(
    (a, b) =>
      cmp(String(a.raw.slot ?? ""), String(b.raw.slot ?? "")) ||
      Number(a.raw.order ?? 100000) - Number(b.raw.order ?? 100000),
  );

  const body = [];
  let current = null;
  for (const { file, raw } of bySlot) {
    const slot = raw.slot ?? "";
    if (slot !== current) {
      current = slot;
      body.push(`\n## ${SLOT_LABEL[slot] ?? slot}（slot: \`${slot}\`）\n`);
    }
    body.push(`### ${raw.id} — ${raw.name ?? ""}\n`);
    body.push(`- 文件：\`rules/${file}\` ｜ 位置：slot \`${slot}\` #${raw.order ?? "—"}`);
    body.push(`- 适用：${fmtApplicability(raw)}`);
    body.push(`- 取值：\n${fmtCompute(raw)}`);
    body.push(`- 判定：\n${fmtTriggers(raw)}`);
    body.push(`- 产出：${fmtEmit(raw)}\n`);
  }
  return body.join("\n");
}

function catalogueHeader({ nRules, nFiles, nOps }) {
  return `# PX4 \`.ulg\` 检查经验索引

> ⚠️ 本文件由 \`pnpm build:kb\`（web/scripts/build-guide.mjs）从 \`rules/*.yaml\` 汇总生成，请勿手改；
> 改经验请直接改 \`rules/<名字>.yaml\`，然后重跑该命令。
>
> 当前共 **${nRules} 条经验**（${nFiles} 个 YAML 文件），算子 ${nOps} 个。
> 判定阈值**就在各自经验文件里**（原先集中在 px4-thresholds.toml，已退场）。
>
> 铁律（CLAUDE.md 4.1）：所有数值判断只发生在确定性引擎；LLM 只翻译，不改数值。

## 怎么读这张表

- **slot** 决定执行位置：finding 的 \`id\`（F01、F02…）按发射顺序生成，所以 slot 必须与
  它所替换的原过程式检查位置一致；同一 slot 内按 \`order\` 排序。
- **取值** 是 \`compute\` 数据流（\`topic.field\` 或前序输出 → 算子）；字段名与阈值都写在经验里，
  算子本身不认识具体 topic。
- **判定** 自上而下命中第一条即发射；\`expr\` 走 AST 白名单求值（不用 eval）。
- **产出** 里的 check 名用于 \`checksRun\`/\`checksSkipped\`；tag 喂给故障知识库匹配。

---

`;
}

// ─────────────────────────── 体裁转换 ───────────────────────────

/**
 * 源文档 → 网页正文：
 * - 丢掉 H1（标题由 frontmatter 提供）与其后的前言（网页用自己写的前言）
 * - 删掉 HTML 注释行（写经验时用 `<!-- BEGIN -->` 标生成块，网页上会变成可见的怪符号）
 * - knowledge 内部相对链接改写成站内路径
 * 正文其余部分原样保留。
 */
function toWebBody(markdown, intro) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => /^##\s/.test(l));
  const tail = start >= 0 ? lines.slice(start) : lines;

  const out = [];
  let inFence = false;
  const leftovers = [];
  for (const line of tail) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && /^\s*<!--.*-->\s*$/.test(line)) continue;
    let l = inFence ? line : line.replace(/<!--.*?-->/g, "");
    if (!inFence) {
      for (const [re, to] of LINK_MAP) l = l.replace(re, to);
      // 知识库内部还有没映射过来的相对链接：网页上是死链，报出来（不静默）
      const dead = l.match(/\]\((\.\.?\/[^)]*)\)/g);
      if (dead) leftovers.push(...dead);
    }
    out.push(l);
  }
  if (leftovers.length > 0) {
    console.warn(`  ⚠ 未映射的相对链接（网页上会 404）：${[...new Set(leftovers)].join(" ")}`);
  }
  return `${intro}\n\n${out.join("\n").trim()}\n`;
}

function frontmatter({ title, titleEn, description, descriptionEn, order }) {
  return [
    "---",
    `title: ${title}`,
    `titleEn: ${titleEn}`,
    `description: ${description}`,
    `descriptionEn: ${descriptionEn}`,
    `group: ${GROUP.zh}`,
    `groupEn: ${GROUP.en}`,
    `order: ${order}`,
    "---",
    "",
  ].join("\n");
}

// ─────────────────────────── 主流程 ───────────────────────────

export function buildGuide() {
  mkdirSync(GUIDE_DIR, { recursive: true });

  // 1) 手写知识文档 → 网页
  const written = [];
  for (const page of PAGES) {
    const body = toWebBody(readFileSync(resolve(KN, page.src), "utf8"), page.intro);
    writeFileSync(resolve(GUIDE_DIR, page.out), frontmatter(page) + body, "utf8");
    written.push(page.out);
  }

  // 2) 规则清单：开发文档与网页同一份正文，两个壳
  const { rules, files } = loadRules();
  const nOps = readFileSync(resolve(KN, "operators.py"), "utf8")
    .split("\n")
    .filter((l) => l.startsWith("@operator(")).length;
  const counts = { nRules: rules.length, nFiles: files.length, nOps };
  const body = renderCatalogue(rules);

  writeFileSync(
    RULES_INDEX,
    catalogueHeader(counts) + body,
    "utf8",
  );

  const cataloguePage = {
    out: "knowledge-rules.md",
    order: 12,
    title: "当前有哪些规则",
    titleEn: "Rule catalogue",
    description: "全部检查经验的清单：各自读什么字段、什么条件触发、产出什么标签。",
    descriptionEn: "Every built-in check — the fields it reads, the condition that fires it, and the tags it emits.",
  };
  writeFileSync(
    resolve(GUIDE_DIR, cataloguePage.out),
    frontmatter(cataloguePage) +
      `${CATALOGUE_INTRO.replace("{n}", String(rules.length))}\n\n---\n${body}`,
    "utf8",
  );
  written.push(cataloguePage.out);

  return { pages: written, ...counts };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = buildGuide();
  console.log(
    `guide built: ${r.pages.join(", ")}；规则清单 ${r.nRules} 条 / ${r.nFiles} 个文件 / ${r.nOps} 个算子`,
  );
}
