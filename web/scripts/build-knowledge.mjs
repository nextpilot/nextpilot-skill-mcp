/**
 * 知识构建：把 knowledge/px4/ 下工程师维护的经验文件，生成运行时所需的产物。
 *
 * 单一数据源全部在仓库根 knowledge/px4/：
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
import { readdirSync } from "node:fs";
import { parse as parseYaml } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const KN = resolve(webRoot, "../knowledge/px4");

const PY_CHECKS = resolve(KN, "ulog_checks.py");
const PY_DATA = resolve(KN, "ulog_data.py");
const YAML_PATH = resolve(KN, "px4-fault-kb.yaml");
const TOML_PATH = resolve(KN, "px4-thresholds.toml");
const RULES_DIR = resolve(KN, "rules");
const OPERATORS_PY = resolve(KN, "operators.py");
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

/** 日志级内置变量：经验里可直接引用，无需在 compute 声明（与 ulog_checks.py 的 _rule_env 对齐） */
const BUILTIN_VARS = new Set([
  "firmware", "fw_major", "fw_minor", "fw_profile",
  "airframe", "is_rotary_wing", "is_fixed_wing", "is_vtol", "is_rover",
  "duration_s", "armed_s", "phases", "tags", "guard_tags",
]);

/** 从 operators.py 解析算子签名（本文件由我们维护，格式固定；解析不到即构建失败） */
function parseOperatorSignatures(py) {
  const sigs = {};
  const re = /@operator\(\s*"([a-z_]+)"([^)]*)\)/g;
  let m;
  while ((m = re.exec(py))) {
    const name = m[1];
    const rest = m[2] || "";
    const num = (key) => {
      const mm = rest.match(new RegExp(key + "\\s*=\\s*(\\d+)"));
      return mm ? Number(mm[1]) : 1;
    };
    const names = rest.match(/out_names\s*=\s*\[([^\]]*)\]/);
    sigs[name] = {
      in_arity: num("in_arity"),
      out_arity: num("out_arity"),
      out_names: names ? names[1].split(",").map((x) => x.trim().replace(/["']/g, "")).filter(Boolean) : [],
    };
  }
  return sigs;
}

/** 校验并加载 rules/*.yaml；任何不完整都构建失败（杜绝"空洞经验"） */
function loadRules(dir, signatures) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort();
  if (files.length === 0) throw new Error("rules/ 下没有规则文件");
  const rules = [];
  const seen = new Set();
  for (const file of files) {
    const raw = parseYaml(readFileSync(resolve(dir, file), "utf8"));
    const where = `rules/${file}`;
    // 必填项：即使不限也必须显式写 any（隐式豁免正是空洞条目的入口）
    for (const key of ["id", "name", "firmware", "airframe", "compute", "triggers", "emit"]) {
      if (raw[key] === undefined || raw[key] === null || raw[key] === "") {
        throw new Error(`${where}: 缺少必填字段 ${key}`);
      }
    }
    if (seen.has(raw.id)) throw new Error(`${where}: 规则 id 重复 ${raw.id}`);
    seen.add(raw.id);

    const declared = new Set();
    if (!Array.isArray(raw.compute) || raw.compute.length === 0) {
      throw new Error(`${where}: compute 必须是非空数组`);
    }
    for (const node of raw.compute) {
      const sig = signatures[node.op];
      if (!sig) throw new Error(`${where}: 未注册的算子 op=${node.op}`);
      const ins = node.in ?? (node.from !== undefined ? [].concat(node.from) : null);
      const outs = [].concat(node.out ?? []);
      if (!ins || ins.length !== sig.in_arity) {
        throw new Error(`${where}: 算子 ${node.op} 需要 ${sig.in_arity} 个输入，实际 ${ins ? ins.length : 0}`);
      }
      if (outs.length !== sig.out_arity) {
        throw new Error(`${where}: 算子 ${node.op} 需要 ${sig.out_arity} 个输出，实际 ${outs.length}`);
      }
      for (const o of outs) declared.add(o);
    }
    if (!Array.isArray(raw.triggers) || raw.triggers.length === 0) {
      throw new Error(`${where}: triggers 必须是非空数组`);
    }
    for (const t of raw.triggers) {
      if (typeof t.expr !== "string") throw new Error(`${where}: trigger 缺 expr（须为字符串，注意加引号）`);
      if (!["critical", "warning", "info"].includes(t.severity)) {
        throw new Error(`${where}: trigger severity 非法：${t.severity}`);
      }
      if (typeof t.title !== "string") throw new Error(`${where}: trigger 缺 title`);
      if (typeof t.field !== "string") throw new Error(`${where}: trigger 缺 field（evidence.field）`);
      // 表达式里的标识符必须已声明（内置变量或 compute 输出）
      for (const name of t.expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []) {
        if (["and", "or", "not", "True", "False"].includes(name)) continue;
        if (!declared.has(name) && !BUILTIN_VARS.has(name)) {
          throw new Error(`${where}: 表达式引用了未声明的名字 ${name}（expr: ${t.expr}）`);
        }
      }
      // 标题里的占位符同理
      for (const m of t.title.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)(:[^}]*)?\}/g)) {
        if (!declared.has(m[1]) && !BUILTIN_VARS.has(m[1])) {
          throw new Error(`${where}: 标题引用了未声明的名字 ${m[1]}`);
        }
      }
    }
    if (!raw.emit.check) throw new Error(`${where}: emit.check 必填（ran/skipped 用）`);
    rules.push(raw);
  }
  return rules;
}

const banner = `// ⚠️ 自动生成，请勿手改。源文件在 knowledge/px4/，改完跑 \`pnpm build:kb\`（dev/build 自动执行）。\n`;

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
const operatorsPy = read(OPERATORS_PY);
const signatures = parseOperatorSignatures(operatorsPy);
if (Object.keys(signatures).length === 0) throw new Error("operators.py 里没解析到任何算子签名");
const rules = loadRules(RULES_DIR, signatures);
if (rules.some((r) => !r.compute)) throw new Error("规则缺少 compute");

const checkPy = read(PY_CHECKS);
if (!checkPy.includes("__FAULT_KB__")) {
  throw new Error("ulog_checks.py 必须保留 __FAULT_KB__ 占位符");
}
if (!checkPy.includes("__THRESHOLDS__")) {
  throw new Error("ulog_checks.py 必须保留 __THRESHOLDS__ 占位符");
}
if (!checkPy.includes("__RULES__")) {
  throw new Error("ulog_checks.py 必须保留 __RULES__ 占位符");
}
// 算子定义必须在框架之前执行（框架用它按名字调用）
const pyWithOperators = operatorsPy + "\n" + checkPy;
writeFileSync(
  resolve(outWorkers, "ulog-check-script.ts"),
  banner +
    "import faultKbJson from \"./fault-kb.generated.json\";\n\n" +
    "const thresholds = " +
    thresholdsJson +
    ";\n\n" +
    "const rules = " +
    JSON.stringify(rules) +
    ";\n\n" +
    "export const PY_ULG_CHECKS = String.raw`" +
    toRawTemplate(checkPy) +
    "`\n" +
    '  .replace("__FAULT_KB__", JSON.stringify(faultKbJson.entries))\n' +
    '  .replace("__THRESHOLDS__", JSON.stringify(thresholds))\n' +
    '  .replace("__RULES__", JSON.stringify(rules));\n',
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
  "// ⚠️ 自动生成，源：knowledge/px4/llm/。请勿手改。\n" +
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
  "// ⚠️ 自动生成，源：knowledge/px4/px4-thresholds.toml。请勿手改。\n" +
    "export const PX4_THRESHOLDS = " +
    thresholdsJson +
    ";\n",
  "utf8",
);

console.log(
  `knowledge built: ${kb.length} fault entries, ${rules.length} rules, ` +
    `${Object.keys(signatures).length} operators; ` +
    "ulog-check-script.ts, ulog-data-script.ts, prompts.generated.js, thresholds.generated.js",
);
