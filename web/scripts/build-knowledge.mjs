/**
 * 知识构建：把 knowledge/ulog/ 下工程师维护的经验文件，生成运行时所需的产物。
 *
 * 单一数据源全部在仓库根 knowledge/ulog/：
 *   px4/ulog_checks.py        第一层 pyulog 解析 + 第二层规则/guard（Pyodide 执行）
 *   px4/ulog_data.py          报告页数据层 helpers（图表/事件/参数）
 *   px4/px4-fault-kb.yaml     第三层故障知识库（工程师只编辑这个）
 *   llm/gjb841-system-prompt.md  第四层 GJB-841 思考范式（LLM 只做组装）
 *
 * 本脚本生成（产物提交进仓库，EdgeOne 直接 next build 也能跑）：
 *   web/workers/ulog-check-script.ts   （导出 PY_ULG_CHECKS，内联 KB）
 *   web/workers/ulog-data-script.ts    （导出 PY_ULG_DATA_HELPERS）
 *   web/workers/fault-kb.generated.json
 *   web/lib/knowledge/prompts.generated.js（ESM，供边缘函数 import）
 *
 * 用法（在 web/ 下）：node scripts/build-knowledge.mjs | pnpm build:kb
 * 不引入额外依赖；YAML 只解析故障库用到的固定子集，出错即构建失败。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const KN = resolve(webRoot, "../knowledge/ulog");

const PY_CHECKS = resolve(KN, "px4/ulog_checks.py");
const PY_DATA = resolve(KN, "px4/ulog_data.py");
const YAML_PATH = resolve(KN, "px4/px4-fault-kb.yaml");
const TOML_PATH = resolve(KN, "px4/px4-thresholds.toml");
const PROMPT_PATH = resolve(KN, "llm/gjb841-system-prompt.md");
const EMPTY_PATH = resolve(KN, "llm/report-empty.md");

const read = (p) => readFileSync(p, "utf8");

/** 极简 YAML 解析：只支持本故障库用到的子集，结构固定，宁可构建失败也不静默产出错 KB */
function parseFaultKb(text) {
  const lines = text.split(/\r?\n/);
  const kb = [];
  let item = null;
  let listKey = null;

  const scalar = (raw) => {
    let v = raw.trim();
    if (v === "[]") return [];
    if (v === "") return "";
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1);
    }
    if (/^-?\d+$/.test(v)) return Number(v);
    return v;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (/^fault_knowledge_base:\s*$/.test(line)) continue;

    const itemHead = line.match(/^\s*-\s+fault_id:\s*(.+)$/);
    if (itemHead) {
      item = {
        fault_id: "",
        fault_tag: "",
        trigger_tags: [],
        flight_phase: [],
        exclude_tags: [],
        possible_root_cause: [],
        troubleshooting_steps: [],
        risk_level: "",
      };
      kb.push(item);
      item.fault_id = scalar(itemHead[1]);
      listKey = null;
      continue;
    }

    if (!item) continue;
    const indent = line.length - line.trimStart().length;

    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && listKey && indent >= 6) {
      item[listKey].push(scalar(listItem[1]));
      continue;
    }

    const kv = line.match(/^\s{2,4}([a-z_]+):\s*(.*)$/);
    if (kv) {
      const [, key, valRaw] = kv;
      if (key === "possible_root_cause" || key === "troubleshooting_steps") {
        item[key] = [];
        listKey = key;
        if (valRaw.trim()) item[key].push(scalar(valRaw.replace(/^-\s*/, "")));
      } else if (key === "trigger_tags" || key === "flight_phase" || key === "exclude_tags") {
        listKey = null;
        const inline = valRaw.trim();
        if (inline.startsWith("[")) {
          item[key] = inline
            .slice(1, -1)
            .split(",")
            .map((s) => scalar(s))
            .filter(Boolean);
        } else {
          item[key] = [];
        }
      } else {
        listKey = null;
        item[key] = scalar(valRaw);
      }
    }
  }

  for (const it of kb) {
    for (const req of ["fault_id", "fault_tag", "trigger_tags", "flight_phase", "risk_level"]) {
      if (it[req] === "" || (Array.isArray(it[req]) && it[req].length === 0 && req !== "fault_tag")) {
        throw new Error(`故障库条目 ${it.fault_id || "?"} 缺少字段 ${req}`);
      }
    }
  }
  return kb;
}

/** 极简 TOML 读取器：仅支持本阈值文件用到的子集——[group]、key = 数字/字符串/
 *  行内数组、# 注释。结构固定，未知语法直接抛错（宁可构建失败也不静默吞阈值）。 */
function parseSimpleToml(text) {
  const root = {};
  let group = root;
  const coerce = (raw) => {
    let v = raw.trim();
    if (v.startsWith("[") && v.endsWith("]")) {
      const inner = v.slice(1, -1).trim();
      if (inner === "") return [];
      return inner.split(",").map((x) => coerce(x));
    }
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      return v.slice(1, -1);
    }
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if (v === "true") return true;
    if (v === "false") return false;
    throw new Error(`TOML 含不支持的标量写法：${v}`);
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/(^|[^"'])#.*$/, "$1").trim(); // 去整行/行尾注释（不处理引号内#，够用）
    if (!line) continue;
    const g = line.match(/^\[([A-Za-z0-9_]+)\]$/);
    if (g) {
      group = root[g[1]] ??= {};
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!kv) throw new Error(`TOML 无法解析行：${rawLine}`);
    group[kv[1]] = coerce(kv[2]);
  }
  return root;
}

/**
 * 把文本包进 TS String.raw 模板。raw 模板里反斜杠按字面保留（正合 Python 转义），
 * 所以只须转义反引号与 ${ 起始，绝不能转义反斜杠（否则 \\n 会变成 \\\\n）。
 */
function toRawTemplate(text) {
  return text.replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

const banner = `// ⚠️ 自动生成，请勿手改。源文件在 knowledge/ulog/，改完跑 \`pnpm build:kb\`（dev/build 自动执行）。\n`;

// 1) 故障库 JSON
const kb = parseFaultKb(read(YAML_PATH));
if (kb.length === 0) throw new Error("故障知识库解析为 0 条，终止");

// 1b) 阈值 TOML → JSON
const thresholds = parseSimpleToml(read(TOML_PATH));
const requiredGroups = ["guard", "vibration", "ekf", "power", "cpu", "gps", "mode"];
for (const g of requiredGroups) {
  if (!thresholds[g] || Object.keys(thresholds[g]).length === 0) {
    throw new Error(`阈值文件缺少分组 [${g}]`);
  }
}
const thresholdsJson = JSON.stringify(thresholds);

const outWorkers = resolve(webRoot, "workers");
mkdirSync(outWorkers, { recursive: true });
writeFileSync(
  resolve(outWorkers, "fault-kb.generated.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), entries: kb }, null, 2) + "\n",
  "utf8",
);

// 2) 检查脚本 .ts：内联 KB 与阈值，替换两个占位符
const checkPy = read(PY_CHECKS);
if (!checkPy.includes("__FAULT_KB__")) {
  throw new Error("ulog_checks.py 必须保留 __FAULT_KB__ 占位符");
}
if (!checkPy.includes("__THRESHOLDS__")) {
  throw new Error("ulog_checks.py 必须保留 __THRESHOLDS__ 占位符");
}
writeFileSync(
  resolve(outWorkers, "ulog-check-script.ts"),
  banner +
    "import faultKbJson from \"./fault-kb.generated.json\";\n\n" +
    "const thresholds = " +
    thresholdsJson +
    ";\n\n" +
    "export const PY_ULG_CHECKS = String.raw`" +
    toRawTemplate(checkPy) +
    "`\n" +
    '  .replace("__FAULT_KB__", JSON.stringify(faultKbJson.entries))\n' +
    '  .replace("__THRESHOLDS__", JSON.stringify(thresholds));\n',
  "utf8",
);

// 3) 数据层 .ts
const dataPy = read(PY_DATA);
writeFileSync(
  resolve(outWorkers, "ulog-data-script.ts"),
  banner +
    "export const PY_ULG_DATA_HELPERS = String.raw`" +
    toRawTemplate(dataPy) +
    "`;\n",
  "utf8",
);

// 4) LLM 提示词与空结论文案（边缘函数是 .js，直接生成 ESM）
const prompt = read(PROMPT_PATH).replace(/\s+$/, "\n");
const emptyMd = read(EMPTY_PATH).trim();
const outLib = resolve(webRoot, "lib/knowledge");
mkdirSync(outLib, { recursive: true });
writeFileSync(
  resolve(outLib, "prompts.generated.js"),
  "// ⚠️ 自动生成，源：knowledge/ulog/llm/。请勿手改。\n" +
    "export const GJB841_SYSTEM_PROMPT = " +
    JSON.stringify(prompt) +
    ";\n" +
    "export const EMPTY_FINDINGS_MARKDOWN = " +
    JSON.stringify(emptyMd) +
    ";\n",
  "utf8",
);

// 4b) 阈值 ESM（供将来服务端 / MCP 复用同一份数值）
writeFileSync(
  resolve(outLib, "thresholds.generated.js"),
  "// ⚠️ 自动生成，源：knowledge/ulog/px4/px4-thresholds.toml。请勿手改。\n" +
    "export const PX4_THRESHOLDS = " +
    thresholdsJson +
    ";\n",
  "utf8",
);

console.log(
  `knowledge built: ${kb.length} fault entries; ` +
    "ulog-check-script.ts, ulog-data-script.ts, prompts.generated.js, thresholds.generated.js",
);
