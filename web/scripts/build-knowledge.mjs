/**
 * 知识构建：把引擎源码（engine/）与人工经验（knowledge/px4/）拼成运行时所需的产物。
 *
 * 单一数据源：
 *   engine/operators.py           算子注册表（通用，不认识具体字段）
 *   engine/rule_engine.py         第一层 pyulog 解析 + 第二层规则/guard 框架（Pyodide 执行）
 *   engine/report_data.py         报告页数据层 helpers（图表/事件/参数）
 *   knowledge/px4/rules/*.yaml    检查经验：阈值与判定条件（工程师最常改这里）
 *   knowledge/px4/px4-fault-kb.yaml  第三层故障知识库
 *   knowledge/px4/llm/*.md        第四层 GJB-841 思考范式（LLM 只做组装）
 *   knowledge/px4/meta/*.json     固件字段与参数字典
 *
 * 本脚本生成（产物提交进仓库，EdgeOne 直接 next build 也能跑）：
 *   web/workers/ulog-check-script.ts   （导出 PY_ULG_CHECKS，内联 KB）
 *   web/workers/ulog-data-script.ts    （导出 PY_ULG_DATA_HELPERS）
 *   web/workers/fault-kb.generated.json
 *   web/lib/knowledge/prompts.generated.js（ESM，供边缘函数 import）
 *   content/guide/knowledge-rules.md     （指南「知识库」分组的规则清单页）
 *
 * 用法（在 web/ 下）：
 *   node scripts/build-knowledge.mjs           生成（= pnpm build:kb）
 *   node scripts/build-knowledge.mjs --check   只比对：产物是否与 knowledge/ 一致（CI 用）
 * 不引入额外依赖；YAML 只解析故障库用到的固定子集，出错即构建失败。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { normalizeCompute, validateComputeList } from "./lib/rule-expr.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const KN = resolve(webRoot, "../knowledge/px4");

const ENGINE = resolve(webRoot, "../engine");   // 确定性引擎源码（浏览器与本地工具共用一份）
const PY_RULE_ENGINE = resolve(ENGINE, "rule_engine.py");        // 框架（与格式无关）
const PY_REPORT_DATA = resolve(ENGINE, "report_data.py");        // 报告数据层（与格式无关）
const PY_PROVIDER_API = resolve(ENGINE, "providers/api.py");     // provider 契约（常量表 + 自检）
// 日志格式适配器：每个文件都实现同一份契约，引擎不认识它们内部
const PROVIDER_DIR = resolve(ENGINE, "providers");
const providerFiles = readdirSync(PROVIDER_DIR)
  .filter((f) => f.endsWith(".py") && f !== "api.py")
  .sort();
if (providerFiles.length === 0) throw new Error("engine/providers/ 下没有任何适配器");
const YAML_PATH = resolve(KN, "px4-fault-kb.yaml");
const FACTS_PATH = resolve(KN, "facts.yaml");   // PX4 的数据：码表 / 文案 / 展示口径 / 规则元数据
const RULES_DIR = resolve(KN, "rules");
const OPERATORS_PY = resolve(ENGINE, "operators.py");
const PROMPT_PATH = resolve(KN, "llm/gjb841-system-prompt.md");
const EMPTY_PATH = resolve(KN, "llm/report-empty.md");
const GUIDES_DIR = resolve(webRoot, "../content/guide");   // 站点内容在仓库根 content/
const PLOT_DIR = resolve(KN, "plot");                    // 结果页曲线预设（纯前端，不经 Pyodide）

const read = (p) => readFileSync(p, "utf8");

/**
 * 产物落盘。`--check` 时只比对不写入：产物是提交进仓库的，所以"改了 knowledge/ 却没重新
 * 生成产物"必须在 CI 里能被发现，而不是等线上跑着旧规则（`pnpm build:kb --check`）。
 */
const CHECK = process.argv.includes("--check");
const drifted = [];
function emit(path, content) {
  if (CHECK) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) drifted.push(relative(webRoot, path));
    return;
  }
  writeFileSync(path, content, "utf8");
}

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

// 框架自己往求值环境里补的名字（不属于 provider，见 providers/api.py 末尾的说明）
const FRAMEWORK_VARS = ["no_data", "has_topic"];

/**
 * 规则表达式能引用的内置变量 = provider 契约的 SEMANTICS + 框架补的两个。
 *
 * **从 engine/providers/api.py 派生，不手抄**：这份名字以前是手维护的副本，
 * 与引擎漂移时表现为"构建期放行、运行期 NameError"——引擎按"数据不足"静默处理，
 * 那条规则从此不出结论，没有任何提示（`no_data` 当初就是这么漏的）。
 */
const BUILTIN_VARS = new Set([...parseProviderApi(read(PY_PROVIDER_API)).semantics,
                              ...FRAMEWORK_VARS]);

/** 表达式里允许出现、但不是变量名的关键字/字面量（校验标识符时跳过） */
const EXPR_KEYWORDS = new Set([
  "and", "or", "not", "in", "is", "True", "False", "None",
]);

/** 扫标识符前先去掉字符串字面量（如 'vehicle_status' not in topics 里的 topic 名） */
const stripStrings = (s) =>
  String(s).replace(/'[^']*'/g, " ").replace(/"[^"]*"/g, " ");

/** 这条表达式只能引用内置变量（用于 compute 之前求值的场合：适用范围轴、skip 条件） */
function checkBuiltinOnly(expr, where, what) {
  for (const name of stripStrings(expr).match(/[A-Za-z_][A-Za-z0-9_]*/g) || []) {
    if (EXPR_KEYWORDS.has(name)) continue;
    if (!BUILTIN_VARS.has(name)) {
      throw new Error(
        `${where}: ${what} 引用了非内置变量 ${name}——它在 compute 之前求值，拿不到 compute 的输出`,
      );
    }
  }
}

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
    // 紧跟装饰器的 def 的形参名：用来校验**关键字实参名**。
    // node 上的额外键是 `**kw` 直通给算子的，名字写错不会报错、算子会用默认值算出错的结果，
    // 所以必须在这里拦住。形参里的 **kw / * 会被下面的正则过滤掉。
    const dm = /def\s+[A-Za-z_][A-Za-z0-9_]*\s*\(([\s\S]*?)\)\s*:/.exec(py.slice(re.lastIndex));
    const params = dm
      ? dm[1].split(",").map((s) => s.trim().split("=")[0].trim())
          .filter((s) => /^[a-z_][a-z0-9_]*$/.test(s))
      : [];
    sigs[name] = {
      in_arity: num("in_arity"),
      out_arity: num("out_arity"),
      out_names: names ? names[1].split(",").map((x) => x.trim().replace(/["']/g, "")).filter(Boolean) : [],
      params,
    };
  }
  return sigs;
}

/**
 * 从 providers/api.py 解析契约的三张常量表（格式固定：`NAME = {` 起、顶层键各占一行）。
 *
 * 为什么在 Node 里用正则而不是"跑一下 Python"：构建期**不执行** engine/ 下的代码
 * （只当文本搬运，见 engine/README.md），这条约定不能破——所以契约表按固定格式解析，
 * 解析不到就构建失败（同 parseOperatorSignatures 的做法）。
 */
function parseProviderApi(py) {
  const block = (name) => {
    const m = new RegExp(`^${name} = \\{([\\s\\S]*?)^\\}`, "m").exec(py);
    if (!m) throw new Error(`engine/providers/api.py 里解析不到 ${name} 常量表`);
    const keys = [...m[1].matchAll(/^\s{4}"([a-z_0-9]+)":/gm)].map((x) => x[1]);
    if (keys.length === 0) throw new Error(`engine/providers/api.py 的 ${name} 是空的`);
    return keys;
  };
  return {
    required: block("REQUIRED"),
    optional: block("OPTIONAL"),
    semantics: block("SEMANTICS"),
  };
}

/** 校验并加载 rules/*.yaml；任何不完整都构建失败（杜绝"空洞经验"） */
function loadRules(dir, signatures, ruleMeta) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort();
  if (files.length === 0) throw new Error("rules/ 下没有规则文件");
  const rules = [];
  const sources = [];   // 与 rules 一一对应的来源文件名（规则清单页要显示）
  const seen = new Set();
  const byGroup = ruleMeta.by_group ?? {};
  const metaDefaults = ruleMeta.defaults ?? {};
  // 同一个 group 的多条规则，派生的 category/doc 必须一致——不一致就逼作者显式写，
  // 而不是静默取第一个（否则"改了派生表、却只有一条规则跟着变"没人会发现）。
  const seenMeta = new Map();

  // 先整读一遍：一个 YAML 可以装多条经验（顶层写成数组），一般情况下仍是一条经验一个文件
  const loaded = files.map((file) => {
    const p = parseYaml(readFileSync(resolve(dir, file), "utf8"));
    return { file, items: Array.isArray(p) ? p : [p] };
  });

  for (const { file, items } of loaded) {
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
    // 必填项：即使不限也必须显式写 any（隐式豁免正是空洞条目的入口）。
    // 不含 emit——check / doc 现在都是派生的，没有 tag/stats 的规则确实没什么可声明。
    const requiredKeys = isGuardRule
      ? ["id", "group", "name", "firmware", "airframe"]
      : ["id", "group", "name", "firmware", "airframe", "compute", "triggers"];
    if (!isGuardRule === false) { /* noop：保持下面结构简单 */ }
    for (const key of requiredKeys) {
      if (raw[key] === undefined || raw[key] === null || raw[key] === "") {
        throw new Error(`${where}: 缺少必填字段 ${key}`);
      }
    }
    if (raw.emit !== undefined && (typeof raw.emit !== "object" || raw.emit === null || Array.isArray(raw.emit))) {
      throw new Error(`${where}: emit 必须是对象`);
    }
    // 适用范围两轴与 skip 都是**表达式**（与 compute / triggers 同一套语法，不再是
    // "any" / ">=1.15" 这类自造小语言）。它们在 compute **之前**求值，所以只认得内置变量。
    for (const axis of ["firmware", "airframe"]) {
      if (typeof raw[axis] !== "string" || !raw[axis].trim()) {
        throw new Error(`${where}: ${axis} 必须是表达式字符串（不限就写 "True"）`);
      }
    }
    if (raw.skip !== undefined) {
      if (!Array.isArray(raw.skip)) {
        throw new Error(`${where}: skip 必须是数组：[{when: 表达式, reason: 文案?}, …]`);
      }
      for (const s of raw.skip) {
        if (!s || typeof s.when !== "string" || !s.when.trim()) {
          throw new Error(`${where}: skip 每一项都要有 when（Python 表达式）`);
        }
        if (s.reason !== undefined && typeof s.reason !== "string") {
          throw new Error(`${where}: skip 的 reason 必须是字符串（不写该键 = 静默跳过）`);
        }
        for (const k of Object.keys(s)) {
          if (!["when", "reason"].includes(k)) {
            throw new Error(`${where}: skip 项里有未知键 ${k}（可用：when / reason）`);
          }
        }
        checkBuiltinOnly(s.when, where, `skip 条件「${s.when}」`);
      }
    }
    for (const axis of ["firmware", "airframe"]) {
      checkBuiltinOnly(raw[axis], where, `${axis}「${raw[axis]}」`);
    }
    if (seen.has(raw.id)) throw new Error(`${where}: 规则 id 重复 ${raw.id}`);
    seen.add(raw.id);

    // ── 从 facts.yaml 的 rule_meta 派生那些"每条规则各写一遍纯属重复"的字段 ──
    // 身份块：规则里写了就以规则里的为准（个别规则确实会偏离默认）
    for (const [k, v] of Object.entries(metaDefaults)) {
      if (raw[k] === undefined) raw[k] = v;
    }
    if (byGroup[raw.group] === undefined) {
      throw new Error(
        `${where}: group「${raw.group}」未登记在 knowledge/px4/facts.yaml 的 rule_meta.by_group`,
      );
    }
    const gm = byGroup[raw.group];
    if (raw.category === undefined) raw.category = gm.category;
    // emit.check 缺省 = group；guard 类经验不填（它本来就不记 ran/skipped）
    raw.emit = raw.emit ?? {};
    if (raw.emit.check === undefined && !isGuardRule) raw.emit.check = raw.group;
    if (raw.emit.check !== undefined && raw.emit.check !== raw.group) {
      // 允许例外，但要说一声——免得例外悄悄变多
      console.log(`  · ${raw.id}: emit.check「${raw.emit.check}」与 group「${raw.group}」不同（显式例外）`);
    }
    if (raw.emit.doc === undefined && gm.doc !== undefined) raw.emit.doc = gm.doc;
    // 同 group 的多条规则必须派生出同样的 category/doc
    for (const [field, val] of [["category", raw.category], ["emit.doc", raw.emit.doc]]) {
      const prev = seenMeta.get(`${raw.group} ${field}`);
      if (prev !== undefined && prev !== val) {
        throw new Error(
          `${where}: group「${raw.group}」里 ${field} 与同组其它规则不一致` +
            `（${JSON.stringify(prev)} vs ${JSON.stringify(val)}）——要么统一 facts.yaml 的 rule_meta，` +
            `要么在本规则里显式写死`,
        );
      }
      seenMeta.set(`${raw.group} ${field}`, val);
    }

    const declared = new Set();
    if (!isGuardRule && (!Array.isArray(raw.compute) || raw.compute.length === 0)) {
      throw new Error(`${where}: compute 必须是非空数组`);
    }
    // compute 是一串**字符串表达式**（与 triggers.when / skip.when 同一套 Python 子集）；
    // **算子节点**（旧）。旧写法在这里编译成等价表达式，于是产物里只有一种形态、
    // 也只有一套校验（不写第二套）。运行期由 engine/rule_engine.py 的 _eval_compute 求值。
    const compute = (raw.compute ?? []).map((item) => normalizeCompute(item, where));
    if (compute.length > 0) {
      let types;
      try {
        types = validateComputeList(compute, { signatures, builtinVars: BUILTIN_VARS });
      } catch (err) {
        throw new Error(`${where}: ${err.message}`);
      }
      for (const name of types.keys()) declared.add(name);
    }
    raw.compute = compute;
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
      if (typeof t.when !== "string") throw new Error(`${where}: trigger 缺 when（须为字符串，注意加引号）`);
      if (!["critical", "warning", "info"].includes(t.severity)) {
        throw new Error(`${where}: trigger severity 非法：${t.severity}`);
      }
      if (typeof t.title !== "string") throw new Error(`${where}: trigger 缺 title`);
      if (typeof t.field !== "string") throw new Error(`${where}: trigger 缺 field（evidence.field）`);
      // 表达式里的标识符必须已声明（内置变量 / compute 输出 / foreach 事件键）
      for (const name of stripStrings(t.when).match(/[A-Za-z_][A-Za-z0-9_]*/g) || []) {
        if (EXPR_KEYWORDS.has(name)) continue;
        if (!declared.has(name) && !BUILTIN_VARS.has(name) && !eventKeys.has(name)) {
          throw new Error(`${where}: 表达式引用了未声明的名字 ${name}（when: ${t.when}）`);
        }
      }
      // 证据值是一个**表达式**（与 when 同一套语法）：写变量得原值、写 f"{x:.3f}" 得
      // 格式化后的串、写常量就得到常量。名字必须是已声明的。
      if (t.value !== undefined && typeof t.value !== "string") {
        throw new Error(`${where}: trigger 的 value 必须是字符串表达式（如 value: p99_stat）`);
      }
      if (typeof t.value === "string") {
        for (const name of stripStrings(t.value).match(/[A-Za-z_][A-Za-z0-9_]*/g) || []) {
          if (EXPR_KEYWORDS.has(name) || name === "f") continue;   // f"..." 的 f 前缀
          if (!declared.has(name) && !BUILTIN_VARS.has(name) && !eventKeys.has(name)) {
            throw new Error(`${where}: value 引用了未声明的名字 ${name}（value: ${t.value}）`);
          }
        }
      }
      // 标题里的占位符同理
      for (const m of t.title.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)(:[^}]*)?\}/g)) {
        if (!declared.has(m[1]) && !BUILTIN_VARS.has(m[1]) && !eventKeys.has(m[1])) {
          throw new Error(`${where}: 标题引用了未声明的名字 ${m[1]}`);
        }
      }
      // 证据文案/建议里的占位符同样校验（value 的 f-string 与 suggestion 都允许模板）
      for (const txt of [t.value, t.suggestion, t.field]) {
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
    sources.push(file);
    }
  }
  return { rules, sources };
}

// ─────────────────── 指南「知识库」分组的规则清单页 ───────────────────
//
// 把 rules/*.yaml 渲染成 /guide/knowledge-rules 那一页（产物提交进仓库）。
// 与引擎产物同源、同一次构建生成：规则改了页面就跟着变，不用谁记得手动同步。
// 清单只出网站这一份，仓库里不留第二份拷贝（免得两处对不上）；同分组的
// 「如何编写一条规则」是手维护页面（content/guide/knowledge-write-rule.md），本脚本不碰。

const GROUP = { zh: "知识库", en: "Knowledge base" };

const CATALOGUE_INTRO = `引擎当前内置的 **{n} 条检查经验**，按执行位置（slot，即下面每一节的标题）分组。
每条给出：**适用**（固件 / 机架 / 依赖）、**取值**（读哪些字段、过哪个算子）、**判定**（自上而下
命中第一条即发射）、**产出**（写进报告的 check 名、喂故障库匹配的标签、UI 用的统计）。

判定阈值就写在各自的经验 YAML 里；slot 决定执行顺序（报告里的 F01、F02… 编号按发射顺序生成）。
所有判定都由确定性引擎在浏览器本地完成——LLM 只把结论翻译成中文报告，不参与任何数值判断。
本页在构建时从 \`rules/*.yaml\` 自动生成。`;

/** 尽量贴近 Python 的 `%s`，免得清单文本因为换成 Node 生成而整篇 diff */
function pyRepr(v) {
  if (Array.isArray(v)) return "[" + v.map(pyRepr).join(", ") + "]";
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "object") {
    return "{" + Object.entries(v).map(([k, val]) => `'${k}': ${pyRepr(val)}`).join(", ") + "}";
  }
  return String(v);
}

const listOr = (v, fallback) =>
  Array.isArray(v) ? v.join(",") : v === undefined || v === null ? fallback : String(v);

function fmtApplicability(raw) {
  const parts = [];
  // 适用范围两轴现在是表达式（不限写 "True"）
  if (raw.firmware !== "True") parts.push("固件 " + raw.firmware);
  if (raw.airframe !== "True") parts.push("机架 " + raw.airframe);
  // skip 列表：写了 reason 的记一条 skipped，不写 reason 的静默跳过
  for (const s of raw.skip ?? []) {
    parts.push((s.reason ? "不适用当 " : "静默当 ") + s.when);
  }
  return parts.join(" ｜ ") || "总是适用";
}

function fmtCompute(raw) {
  const lines = [];
  for (const expr of raw.compute || []) {
    lines.push(`- \`${expr}\``);
  }
  return lines.join("\n") || "- （无 compute）";
}

function fmtTriggers(raw) {
  const lines = [];
  for (const t of raw.triggers || []) {
    const bits = [`**${t.severity}**`, `\`${t.when}\``];
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

function renderCatalogue(rules, sources) {
  // 按码点比较而非 localeCompare：后者的结果随机器 ICU 语言环境变化，
  // 生成产物必须逐字节可复现（group 名都是 ASCII，码点序就是稳定序）
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const bySlot = rules
    .map((raw, i) => ({ file: sources[i], raw }))
    .sort(
      (a, b) =>
        cmp(String(a.raw.group ?? ""), String(b.raw.group ?? "")) ||
        Number(a.raw.order ?? 100000) - Number(b.raw.order ?? 100000),
    );

  const body = [];
  let current = null;
  for (const { file, raw } of bySlot) {
    const slot = raw.group ?? "";
    if (slot !== current) {
      current = slot;
      body.push(`\n## ${SLOT_LABEL[slot] ?? slot}（group: \`${slot}\`）\n`);
    }
    body.push(`### ${raw.id} — ${raw.name ?? ""}\n`);
    body.push(`- 文件：\`rules/${file}\` ｜ 位置：group \`${slot}\` #${raw.order ?? "—"}`);
    body.push(`- 适用：${fmtApplicability(raw)}`);
    body.push(`- 取值：\n${fmtCompute(raw)}`);
    body.push(`- 判定：\n${fmtTriggers(raw)}`);
    body.push(`- 产出：${fmtEmit(raw)}\n`);
  }
  return body.join("\n");
}

function catalogueFrontmatter({ title, titleEn, description, descriptionEn, order }) {
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

/** 规则清单页的完整内容（清单只出网站这一份，仓库里不留第二份拷贝） */
function renderCataloguePage(rules, sources) {
  return (
    catalogueFrontmatter({
      title: "当前有哪些规则",
      titleEn: "Rule catalogue",
      description: "全部检查经验的清单：各自读什么字段、什么条件触发、产出什么标签。",
      descriptionEn: "Every built-in check — the fields it reads, the condition that fires it, and the tags it emits.",
      order: 12,
    }) +
    `${CATALOGUE_INTRO.replace("{n}", String(rules.length))}\n\n---\n${renderCatalogue(rules, sources)}`
  );
}

const banner = `// ⚠️ 自动生成，请勿手改。源文件在 engine/ 与 knowledge/px4/，改完跑 \`pnpm build:kb\`（dev/build 自动执行）。\n`;

// 1) 故障库 JSON
const kb = parseFaultKb(read(YAML_PATH));
if (kb.length === 0) throw new Error("故障知识库解析为 0 条，终止");

const outWorkers = resolve(webRoot, "workers");
mkdirSync(outWorkers, { recursive: true });
emit(
  resolve(outWorkers, "fault-kb.generated.json"),
  // 不写 generatedAt：时间戳会让产物每次构建都产生 diff（而它没有任何消费者），
  // 产物应当可复现 —— 同样的 knowledge/ 输入必须得到逐字节相同的输出。
  JSON.stringify({ entries: kb }, null, 2) + "\n",
);

// 2) 检查脚本 .ts：内联 KB 与阈值，替换两个占位符
const operatorsPy = read(OPERATORS_PY);
const signatures = parseOperatorSignatures(operatorsPy);
if (Object.keys(signatures).length === 0) throw new Error("operators.py 里没解析到任何算子签名");
// facts.yaml 要在规则校验**之前**读：规则的 category / doc / 身份块默认值都在 rule_meta 里
const facts = parseYaml(read(FACTS_PATH));
// plot/track.yml 的取数声明并进 facts：**它的消费者是 provider**（轨迹在引擎侧取数、换算、
// 抽稀），而它按"要画什么、从哪几列画"归在 plot/ 下——曲线预设进前端，这一份进 Python。
// 两者都是纯数据，差别只在消费者，构建期在这里合流。见 knowledge/px4/plot/track.yml 的说明。
const plotTrack = parseYaml(read(resolve(PLOT_DIR, "track.yml"))).track;
if (!plotTrack || !plotTrack.topic) {
  throw new Error("knowledge/px4/plot/track.yml 缺少 track.topic");
}
facts.track = plotTrack;
const { rules, sources } = loadRules(RULES_DIR, signatures, facts.rule_meta ?? {});
// guards 类经验没有 compute（其判定在 emit.guard_tags），逐条校验已在 loadRules 里做

const ruleEnginePy = read(PY_RULE_ENGINE);
if (!ruleEnginePy.includes("__FAULT_KB__")) {
  throw new Error("ulog_checks.py 必须保留 __FAULT_KB__ 占位符");
}
if (!ruleEnginePy.includes("__RULES__")) {
  throw new Error("rule_engine.py 必须保留 __RULES__ 占位符");
}
if (!ruleEnginePy.includes("__FACTS__")) {
  throw new Error("rule_engine.py 必须保留 __FACTS__ 占位符");
}
// facts.yaml：那一种格式的数据（码表 / 文案 / 展示口径 / 规则元数据）。
// 键名是引擎与 provider 约定的，缺一个就构建失败（宁可构建失败，也不要在浏览器里
// 跑到某个码表是空的才发现）。取数逻辑不在这里——它在 engine/providers/<格式>.py。
for (const key of ["group_order", "log_levels", "vehicle_types",
                   "nav_state_names", "nav_state_groups", "sys_info_keys", "ulog_msg_types",
                   "info_key_docs", "rule_meta"]) {
  if (facts[key] === undefined) throw new Error(`facts.yaml 缺少 ${key}`);
}
for (const [k, v] of Object.entries(facts.info_key_docs)) {
  if (typeof v?.name !== "string" || typeof v?.desc !== "string") {
    throw new Error(`facts.yaml 的 info_key_docs.${k} 必须是 {name, desc} 两个字符串`);
  }
}
for (const t of facts.ulog_msg_types) {
  // 一条消息类型的单字母码是引擎按字节流统计出来的键，缺了就会静默少一行
  if (typeof t?.code !== "string" || t.code.length !== 1) {
    throw new Error(`facts.yaml 的 ulog_msg_types 每项都要有单字母 code：${JSON.stringify(t)}`);
  }
}
// metrics：概览指标的展示清单（key/label/unit + 可选的兜底取数）
const metricKeys = new Set();
for (const m of facts.metrics ?? []) {
  if (!m?.key) throw new Error("facts.yaml 的 metrics 每项都要有 key");
  if (metricKeys.has(m.key)) throw new Error(`facts.yaml 的 metrics 键重复：${m.key}`);
  metricKeys.add(m.key);
  if (m.op !== undefined) {
    if (!signatures[m.op]) throw new Error(`facts.yaml 的 metric ${m.key} 引用了未注册的算子 ${m.op}`);
    if (!m.topic) throw new Error(`facts.yaml 的 metric ${m.key} 有 op 就必须给 topic`);
    if (m.field === undefined && m.fields === undefined) {
      throw new Error(`facts.yaml 的 metric ${m.key} 有 op 就必须给 field/fields`);
    }
    if (m.pick !== undefined && !(signatures[m.op].out_names ?? []).includes(m.pick)) {
      throw new Error(`facts.yaml 的 metric ${m.key} 的 pick=${m.pick} 不在 ${m.op} 的输出里`);
    }
  }
}
if (!Array.isArray(facts.group_order) || facts.group_order.length === 0) {
  throw new Error("facts.yaml 的 group_order 不能为空");
}

// 经验声明的 group 必须已登记在 facts.yaml 的 group_order 里——否则那条经验**永远不会被执行**
// （引擎按 group_order 逐个 group 跑），且失败是静默的。宁可构建失败。
const knownGroups = new Set(facts.group_order);
for (const r of rules) {
  if (!knownGroups.has(r.group)) {
    throw new Error(`规则 ${r.id} 的 group「${r.group}」未登记在 knowledge/px4/facts.yaml 的 group_order`);
  }
}
// ---------------- provider 契约：构建期查"漏写" ----------------
// 契约的事实源是 engine/providers/api.py 的两张常量表。这里查每个适配器是否**定义了**
// 契约要求的能力、semantics() 的字典字面量键是否齐全。
// 查不了运行时行为（类型、失败语义）——那两道在引擎的运行期自检与
// tools/calibrate/check_provider.py 里，三道合起来才是完整的一道关。
const providerApi = parseProviderApi(read(PY_PROVIDER_API));
for (const f of providerFiles) {
  const src = read(resolve(PROVIDER_DIR, f));
  const where = `engine/providers/${f}`;
  if (!/^class\s+\w+/m.test(src)) throw new Error(`${where}: 里没有定义适配器类`);
  for (const name of providerApi.required) {
    const ok = name === "fmt"
      ? /^\s+fmt\s*=/m.test(src)
      : new RegExp(`^\\s+def ${name}\\(`, "m").test(src);
    if (!ok) {
      throw new Error(`${where}: 缺少契约要求的能力 ${name}（见 engine/providers/api.py 的 REQUIRED）`);
    }
  }
  // semantics() 必须给出契约里列的每一个内置变量——少一个，引用它的规则会**静默**算不出数据
  const body = src.slice(src.indexOf("def semantics("));
  const cut = body.indexOf("\n    def ", 10);
  const sem = cut === -1 ? body : body.slice(0, cut);
  for (const key of providerApi.semantics) {
    if (!sem.includes(`"${key}"`)) {
      throw new Error(`${where}: semantics() 缺少内置变量 ${key}（见 api.py 的 SEMANTICS）`);
    }
  }
}
// 拼接顺序即执行顺序：算子注册表 → provider 契约 → 各格式适配器 → 框架 → 数据层
const pyWithOperators = [
  operatorsPy,
  read(PY_PROVIDER_API),
  ...providerFiles.map((f) => read(resolve(PROVIDER_DIR, f))),
  ruleEnginePy,
].join("\n");
emit(
  resolve(outWorkers, "ulog-check-script.ts"),
  banner +
    "import faultKbJson from \"./fault-kb.generated.json\";\n\n" +
    "const rules = " +
    JSON.stringify(rules) +
    ";\n" +
    // facts 也必须在此声明：下面的 .replace 链在模块加载时求值，缺声明就是 ReferenceError
    "const facts = " +
    JSON.stringify(facts) +
    ";\n\n" +
    "export const PY_ULG_CHECKS = String.raw`" +
    toRawTemplate(pyWithOperators) +
    "`\n" +
    '  .replace("__FAULT_KB__", JSON.stringify(faultKbJson.entries))\n' +
    '  .replace("__RULES__", JSON.stringify(rules))\n' +
    '  .replace("__FACTS__", JSON.stringify(facts));\n',
);

// 3) 数据层 .ts
const reportDataPy = read(PY_REPORT_DATA);
emit(
  resolve(outWorkers, "ulog-data-script.ts"),
  banner +
    "export const PY_ULG_DATA_HELPERS = String.raw`" +
    toRawTemplate(reportDataPy) +
    "`;\n",
);

// 4) LLM 提示词与空结论文案（边缘函数是 .js，直接生成 ESM）
const prompt = read(PROMPT_PATH).replace(/\s+$/, "\n");
const emptyMd = read(EMPTY_PATH).trim();
const outLib = resolve(webRoot, "lib/knowledge");
mkdirSync(outLib, { recursive: true });
emit(
  resolve(outLib, "prompts.generated.js"),
  "// ⚠️ 自动生成，源：knowledge/px4/llm/。请勿手改。\n" +
    "export const GJB841_SYSTEM_PROMPT = " +
    JSON.stringify(prompt) +
    ";\n" +
    "export const EMPTY_FINDINGS_MARKDOWN = " +
    JSON.stringify(emptyMd) +
    ";\n",
);

// 4.5) 结果页曲线预设：knowledge/px4/plot/*.yml → web/lib/knowledge/plots.generated.ts
// 与引擎产物不同，这一份是**纯前端**渲染用（不进 Pyodide），所以单独生成一个 ESM 文件。
const plotFiles = readdirSync(PLOT_DIR).filter((f) => f.endsWith(".yml")).sort();
// track.yml 是**取数声明**（provider 读，见上面并进 facts 的那段），不是曲线预设——它没有 panels，
// 进不了下面的预设校验。其余文件才是预设。两者都留在 plotFiles 里参与派生版本的哈希。
const presetFiles = plotFiles.filter((f) => f !== "track.yml");
if (presetFiles.length === 0) throw new Error("knowledge/px4/plot/ 下没有曲线预设文件");
const plots = presetFiles.map((file) => {
  const spec = parseYaml(read(resolve(PLOT_DIR, file)));
  const where = `plot/${file}`;
  for (const key of ["id", "title", "description", "panels"]) {
    if (spec[key] === undefined) throw new Error(`${where}: 缺少必填字段 ${key}`);
  }
  if (!Array.isArray(spec.panels) || spec.panels.length === 0) {
    throw new Error(`${where}: panels 必须是非空数组`);
  }
  for (const panel of spec.panels) {
    if (!panel.title || !panel.yLabel) throw new Error(`${where}: panel 缺少 title / yLabel`);
    if (!panel.topic && !panel.topics) throw new Error(`${where}: panel 需要 topic 或 topics`);
    if (!Array.isArray(panel.fields) || panel.fields.length === 0) {
      throw new Error(`${where}: panel 的 fields 不能为空`);
    }
    if (panel.instance !== undefined && !["first", "all"].includes(panel.instance)) {
      throw new Error(`${where}: panel.instance 只能是 first / all`);
    }
    // op：预处理算子（图上要先换算时用）。名字必须能在 engine/operators.py 里找到，
    // 否则运行期才报错——这里先拦住。
    if (panel.op !== undefined) {
      if (!panel.op?.name) throw new Error(`${where}: panel.op 需要 name`);
      if (!signatures[panel.op.name]) {
        throw new Error(`${where}: panel.op 引用了未注册的算子 ${panel.op.name}`);
      }
    }
    for (const h of panel.hlines ?? []) {
      if (typeof h.value !== "number" || !h.label) throw new Error(`${where}: hlines 每项要有 value 与 label`);
      if (!["ok", "warning", "critical"].includes(h.level)) {
        throw new Error(`${where}: hlines.level 只能是 ok / warning / critical`);
      }
    }
  }
  return { order: Number(spec.order ?? 999), ...spec };
});
plots.sort((a, b) => a.order - b.order);
const seenPlotIds = new Set();
for (const p of plots) {
  if (seenPlotIds.has(p.id)) throw new Error(`plot 的 id 重复：${p.id}`);
  seenPlotIds.add(p.id);
}
emit(
  resolve(webRoot, "lib/knowledge/plots.generated.ts"),
  banner +
    "// 源：knowledge/px4/plot/*.yml（改图请改那边）\n" +
    "export const PLOT_PRESETS = " +
    JSON.stringify(plots.map(({ order, ...rest }) => rest), null, 2) +
    " as const;\n",
);

// 4.6) 派生数据版本：**内容哈希**，不是手写常量——改了数据层就会出现新值，
//      浏览器据此判断"这份存档的 info/曲线/轨迹是不是旧引擎生成的"，是就重解析一次。
//      覆盖范围只放"决定派生数据形状"的源：data 层 Python、事实层 Python、facts.yaml、曲线预设；
//      规则（rules/*.yaml）不在其内——那影响的是结论文本，不该因为改个阈值就让所有历史重算。
//      rule_engine.py 在列：它产出的 facts / findings **同样随报告一起归档**，口径一变
//      （如 2026-09-16 那次软件版本串）老存档也得跟着刷一次，否则只能靠用户重新上传。
const versionSources = [
  ["engine/report_data.py", PY_REPORT_DATA],
  ["engine/rule_engine.py", PY_RULE_ENGINE],
  ["engine/providers/api.py", PY_PROVIDER_API],
  ...providerFiles.map((f) => [`engine/providers/${f}`, resolve(PROVIDER_DIR, f)]),
  ["knowledge/px4/facts.yaml", FACTS_PATH],
  ...plotFiles.map((f) => [`knowledge/px4/plot/${f}`, resolve(PLOT_DIR, f)]),
];
const derivedVersion = createHash("sha256");
for (const [label, file] of versionSources) {
  derivedVersion.update(label).update("\0").update(read(file)).update("\0");
}
const derivedVersionHex = derivedVersion.digest("hex").slice(0, 12);
emit(
  resolve(webRoot, "lib/knowledge/derived-version.generated.ts"),
  banner +
    "// 源：engine/{report_data,rule_engine}.py + engine/providers/*.py + " +
    "knowledge/px4/{facts.yaml,plot/*.yml} 的内容哈希\n" +
    "// 用途：存档里的派生数据（info / 曲线 / 轨迹）带的版本，与这里不一致就重新解析一次。\n" +
    "export const DERIVED_DATA_VERSION = " +
    JSON.stringify(derivedVersionHex) +
    ";\n",
);

// 4.7) 飞控参数的范围与说明：knowledge/px4/meta/<tag>.json 的 parameters → 前端**按需拉取**的静态 JSON
//      为什么放 public 而不是内联进 Pyodide：这份字典与具体日志无关，内联等于每份日志都要
//      连它一起下载；放静态文件则浏览器缓存一次、只在打开「飞控参数」tab 时才要。
//      只发 [min, max, desc] 三样（表格要的就是这三列），2656 条约 175 KB、gzip 33 KB。
//      注意：目前只有 main 分支有参数元数据（PX4 release tag 不产出 parameters.json），
//      所以老固件的日志只能拿这份"最新的"当参考——界面要如实说明来源。
const PARAM_META = resolve(KN, "meta/main.json");
const paramMeta = JSON.parse(read(PARAM_META)).parameters ?? {};
const paramCompact = {};
for (const [name, v] of Object.entries(paramMeta)) {
  const min = typeof v?.min === "number" ? v.min : null;
  const max = typeof v?.max === "number" ? v.max : null;
  const desc = typeof v?.desc === "string" ? v.desc : "";
  if (min === null && max === null && !desc) continue;
  paramCompact[name] = [min, max, desc];
}
if (!CHECK) mkdirSync(resolve(webRoot, "public/params"), { recursive: true });
emit(
  resolve(webRoot, "public/params/px4-main.json"),
  JSON.stringify({
    source: "PX4 参数元数据（main 分支快照；release tag 不产出 parameters.json）",
    count: Object.keys(paramCompact).length,
    params: paramCompact,
  }) + "\n",
);

// 5) 指南的「知识库」分组：规则清单页（规则改了页面就跟着变，不用谁记得手动同步）
if (!CHECK) mkdirSync(GUIDES_DIR, { recursive: true });
emit(resolve(GUIDES_DIR, "knowledge-rules.md"), renderCataloguePage(rules, sources));

if (CHECK) {
  if (drifted.length > 0) {
    console.error("CHECK FAIL: 以下产物与 knowledge/ 不一致，重跑 pnpm build:kb\n  " + drifted.join("\n  "));
    process.exitCode = 1;
  } else {
    console.log("OK 全部产物与 knowledge/ 一致");
  }
} else {
  console.log(
    `knowledge built: ${kb.length} fault entries, ${rules.length} rules, ` +
      `${Object.keys(signatures).length} operators; ` +
      "ulog-check-script.ts, ulog-data-script.ts, prompts.generated.js",
  );
  console.log("guide built: knowledge-rules.md");
}
