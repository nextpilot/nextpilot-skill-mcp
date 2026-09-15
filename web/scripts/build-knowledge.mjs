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
  "duration_s", "armed_s", "phases", "tags", "guard_tags", "armed_intervals",
  "t0_us", "has_armed", "topics", "messages", "restart_detected", "dropout_ms",
]);

/** 表达式里允许出现、但不是变量名的关键字/字面量（校验标识符时跳过） */
const EXPR_KEYWORDS = new Set([
  "and", "or", "not", "in", "is", "True", "False", "None",
]);

/** 扫标识符前先去掉字符串字面量（如 'vehicle_status' not in topics 里的 topic 名） */
const stripStrings = (s) =>
  String(s).replace(/'[^']*'/g, " ").replace(/"[^"]*"/g, " ");

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
    const parsed = parseYaml(readFileSync(resolve(dir, file), "utf8"));
    // 一个 YAML 可以装多条经验（顶层写成数组）；一般情况下仍是一条经验一个文件
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const raw of items) {
    const where = `rules/${file}` + (items.length > 1 ? `#${(raw && raw.id) || "?"}` : "");
    // guards 类经验（只产 guard 标签、不发 finding）没有 compute/triggers/check，
    // 它的“实质”在 emit.guard_tags 的条件里；其余经验仍要求完整六件套。
    // 注意：普通经验也可以用 emit.guard_tags（如陀螺零偏的温度跨度标签），
    // 所以“是不是 guard 类经验”要看有没有 compute/triggers，而不是有没有 guard_tags。
    const guardTags = raw.emit?.guard_tags;
    const hasCompute = Array.isArray(raw.compute) && raw.compute.length > 0;
    const hasTriggers = Array.isArray(raw.triggers) && raw.triggers.length > 0;
    const isGuardRule = Array.isArray(guardTags) && guardTags.length > 0 && !hasCompute && !hasTriggers;
    // 必填项：即使不限也必须显式写 any（隐式豁免正是空洞条目的入口）
    const requiredKeys = isGuardRule
      ? ["id", "slot", "name", "firmware", "airframe", "emit"]
      : ["id", "slot", "name", "firmware", "airframe", "compute", "triggers", "emit"];
    for (const key of requiredKeys) {
      if (raw[key] === undefined || raw[key] === null || raw[key] === "") {
        throw new Error(`${where}: 缺少必填字段 ${key}`);
      }
    }
    if (seen.has(raw.id)) throw new Error(`${where}: 规则 id 重复 ${raw.id}`);
    seen.add(raw.id);

    const declared = new Set();
    if (!isGuardRule && (!Array.isArray(raw.compute) || raw.compute.length === 0)) {
      throw new Error(`${where}: compute 必须是非空数组`);
    }
    for (const node of raw.compute || []) {
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
    // emit.guard_tags：数据质量标签的产生条件（普通经验也会用，如陀螺零偏的温度跨度）。
    // 条件里的名字必须是内置变量或 compute 输出，避免写错变量名却默默不打标签。
    if (Array.isArray(guardTags)) {
      for (const g of guardTags) {
        if (typeof g.when !== "string" || !g.tag) {
          throw new Error(`${where}: emit.guard_tags 每项都要有 when 与 tag`);
        }
        for (const name of stripStrings(g.when).match(/[A-Za-z_][A-Za-z0-9_]*/g) || []) {
          if (EXPR_KEYWORDS.has(name)) continue;
          if (!declared.has(name) && !BUILTIN_VARS.has(name)) {
            throw new Error(`${where}: guard_tags 条件引用了未声明的名字 ${name}`);
          }
        }
        if (!/^[a-z0-9_:]+$/i.test(String(g.tag))) {
          throw new Error(`${where}: guard 标签名不合法 ${g.tag}`);
        }
      }
    }
    if (!isGuardRule && (!Array.isArray(raw.triggers) || raw.triggers.length === 0)) {
      throw new Error(`${where}: triggers 必须是非空数组`);
    }
    // foreach：把「事件列表」展开成多条 finding。事件 dict 的键（如 t_s / name）
    // 会叠加进模板环境，因此必须显式声明 keys，才能继续做占位符校验。
    const eventKeys = new Set();
    if (raw.foreach) {
      const fe = typeof raw.foreach === "string" ? { var: raw.foreach } : raw.foreach;
      if (!fe.var) throw new Error(`${where}: foreach 需要 var（事件列表的变量名）`);
      if (!declared.has(fe.var)) {
        throw new Error(`${where}: foreach 引用的 ${fe.var} 不是 compute 的输出`);
      }
      for (const k of fe.keys || []) eventKeys.add(k);
    }
    for (const t of raw.triggers || []) {
      if (typeof t.expr !== "string") throw new Error(`${where}: trigger 缺 expr（须为字符串，注意加引号）`);
      if (!["critical", "warning", "info"].includes(t.severity)) {
        throw new Error(`${where}: trigger severity 非法：${t.severity}`);
      }
      if (typeof t.title !== "string") throw new Error(`${where}: trigger 缺 title`);
      if (typeof t.field !== "string") throw new Error(`${where}: trigger 缺 field（evidence.field）`);
      // 表达式里的标识符必须已声明（内置变量 / compute 输出 / foreach 事件键）
      for (const name of stripStrings(t.expr).match(/[A-Za-z_][A-Za-z0-9_]*/g) || []) {
        if (EXPR_KEYWORDS.has(name)) continue;
        if (!declared.has(name) && !BUILTIN_VARS.has(name) && !eventKeys.has(name)) {
          throw new Error(`${where}: 表达式引用了未声明的名字 ${name}（expr: ${t.expr}）`);
        }
      }
      // 标题里的占位符同理
      for (const m of t.title.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)(:[^}]*)?\}/g)) {
        if (!declared.has(m[1]) && !BUILTIN_VARS.has(m[1]) && !eventKeys.has(m[1])) {
          throw new Error(`${where}: 标题引用了未声明的名字 ${m[1]}`);
        }
      }
      // 证据值/建议里的占位符同样校验（证据文案与 suggestion 也允许模板）
      for (const txt of [t.value_text, t.suggestion, t.field]) {
        if (typeof txt !== "string") continue;
        for (const m of txt.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)(:[^}]*)?\}/g)) {
          if (!declared.has(m[1]) && !BUILTIN_VARS.has(m[1]) && !eventKeys.has(m[1])) {
            throw new Error(`${where}: 文案引用了未声明的名字 ${m[1]}`);
          }
        }
      }
    }
    if (!isGuardRule && !raw.emit.check) {
      throw new Error(`${where}: emit.check 必填（ran/skipped 用）`);
    }
    rules.push(raw);
    }
  }
  return rules;
}

const banner = `// ⚠️ 自动生成，请勿手改。源文件在 knowledge/px4/，改完跑 \`pnpm build:kb\`（dev/build 自动执行）。\n`;

// 1) 故障库 JSON
const kb = parseFaultKb(read(YAML_PATH));
if (kb.length === 0) throw new Error("故障知识库解析为 0 条，终止");

const outWorkers = resolve(webRoot, "workers");
mkdirSync(outWorkers, { recursive: true });
writeFileSync(
  resolve(outWorkers, "fault-kb.generated.json"),
  // 不写 generatedAt：时间戳会让产物每次构建都产生 diff（而它没有任何消费者），
  // 产物应当可复现 —— 同样的 knowledge/ 输入必须得到逐字节相同的输出。
  JSON.stringify({ entries: kb }, null, 2) + "\n",
  "utf8",
);

// 2) 检查脚本 .ts：内联 KB 与阈值，替换两个占位符
const operatorsPy = read(OPERATORS_PY);
const signatures = parseOperatorSignatures(operatorsPy);
if (Object.keys(signatures).length === 0) throw new Error("operators.py 里没解析到任何算子签名");
const rules = loadRules(RULES_DIR, signatures);
// guards 类经验没有 compute（其判定在 emit.guard_tags），逐条校验已在 loadRules 里做

const checkPy = read(PY_CHECKS);
if (!checkPy.includes("__FAULT_KB__")) {
  throw new Error("ulog_checks.py 必须保留 __FAULT_KB__ 占位符");
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
    "const rules = " +
    JSON.stringify(rules) +
    ";\n\n" +
    "export const PY_ULG_CHECKS = String.raw`" +
    toRawTemplate(pyWithOperators) +
    "`\n" +
    '  .replace("__FAULT_KB__", JSON.stringify(faultKbJson.entries))\n' +
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

console.log(
  `knowledge built: ${kb.length} fault entries, ${rules.length} rules, ` +
    `${Object.keys(signatures).length} operators; ` +
    "ulog-check-script.ts, ulog-data-script.ts, prompts.generated.js",
);
