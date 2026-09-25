/**
 * 知识构建：把引擎源码（knowledge/engine/）与人工经验（knowledge/px4/）拼成运行时所需的产物。
 *
 * 单一数据源：
 *   knowledge/engine/operators.py           算子注册表（通用，不认识具体字段）
 *   knowledge/engine/engine.py              引擎本体：规则/guard 框架 + 报告页数据层（Pyodide 执行）
 *   knowledge/px4/rules/*.yaml    检查经验：阈值与判定条件（工程师最常改这里）
 *   knowledge/px4/px4-fault-kb.yaml  第三层故障知识库
 *   knowledge/llm/*.md            第四层 GJB-841 思考范式（LLM 只做组装，与固件族无关）
 *   knowledge/px4/meta/*.json     固件字段与参数字典
 *
 * 本脚本生成（产物提交进仓库，EdgeOne 直接 next build 也能跑）：
 *   web/workers/analysis-engine.generated.ts   （导出 PY_ULG_ENGINE，内联 KB）
 *   web/workers/fault-kb.generated.json
 *   web/lib/knowledge/prompts.generated.js（ESM，供边缘函数 import）
 *   web/content/guide/rule-catalogue.mdx（指南「开发指南」分组的规则清单页）
 *   web/content/guide/rule-schema.mdx   （指南「开发指南」分组的规则编写参考页）
 *
 * 最后两页落在 content/guide/ 里（与人工写的指南页面同一处，一起入库），
 * 全部入库，`--check` 只比对前 5 个产物。
 *
 * 用法（在 web/ 下）：
 *   node scripts/build-knowledge.mjs           生成（= pnpm build:kb）
 *   node scripts/build-knowledge.mjs --check   只比对：产物是否与 knowledge/ 一致（CI 用）
 *   node scripts/build-knowledge.mjs --watch   写规则/算子时开着：改完存盘即重建（pnpm dev 已带上）
 * 不引入额外依赖；YAML 只解析故障库用到的固定子集，出错即构建失败。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, watch } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { parse as parseYaml, parseAllDocuments } from "yaml";
import {
    normalizeCompute,
    validateComputeList,
    isFirmwareSpec,
    isVehicleSpec,
    parseTopicReq,
    collectRefs,
    normalizeUnit,
    UNIT_ALIASES,
    UNIT_KIND,
    SEVERITIES,
    checkFieldItem,
    splitFieldRef,
} from "./lib/rule-expr.mjs";
import { buildRuleSchema } from "./lib/gen-rule-schema.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
// knowledge/ 根目录：放**与固件族无关**的资产（第四层 LLM 提示词、给人工抄的骨架模板）。
// 它们不属于任何族，所以不放在 KN 下——ards/px4 共用同一份。
const KN_ROOT = resolve(webRoot, "../knowledge");
// ⚠️ `KN` 现在只剩一个用途：PX4 的参数元数据（产物文件名就是 px4-main.json，而 APM 没有
// `meta/main.json` 这种参数快照）。**别再往它下面挂新东西**——其余一切按族走 FAMILIES。
const KN = resolve(KN_ROOT, "px4");

const ENGINE = resolve(webRoot, "../knowledge/engine"); // 确定性引擎源码（浏览器与本地工具共用一份）
const PY_ENGINE = resolve(ENGINE, "engine.py"); // 引擎本体（框架 + 数据层，与格式无关）
const PY_PROVIDER_API = resolve(ENGINE, "providers/api.py"); // provider 契约（常量表 + 自检）
// 日志格式适配器：每个文件都实现同一份契约，引擎不认识它们内部
const PROVIDER_DIR = resolve(ENGINE, "providers");
// `read` 提到这里：下面的 FAMILIES 要读适配器源码（ESM 的 const 不提升，晚定义就是 TDZ 报错）
const read = (p) => readFileSync(p, "utf8");
const providerFiles = readdirSync(PROVIDER_DIR)
    .filter((f) => f.endsWith(".py") && f !== "api.py")
    .sort();
if (providerFiles.length === 0) throw new Error("knowledge/engine/providers/ 下没有任何适配器");

// ---------------- 固件族（family）----------------
// 一族 = knowledge/<族名>/ 下的一整套知识（facts.yaml / rules/ / fault-kb.yaml / plot/）
//      + knowledge/engine/providers/<族名>.py 里那个**同名**适配器。
// **两边同名就是唯一的配对规则**：加一种日志格式 = 加一个目录 + 一个同名适配器，本脚本零改动。
//
// 为什么要有这一层：2026-09 之前这些路径是硬编码的 `knowledge/px4/`，于是
// knowledge/ardupilot/ 那批规则一条都进不了产物——写了、校验了、但永远不会被任何人跑。
// 知识是**按格式分开**的（码表、阈值、group 都是各自那一套），引擎侧同理按 `log_type` 取用
// （见 engine.py 的 `_LOG_TYPE_KNOWLEDGE`）。
const FAMILIES = readdirSync(KN_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    // 没有同名适配器 = 不是一族日志的知识（knowledge/engine、knowledge/llm 都在这儿被滤掉）
    .filter((d) => providerFiles.includes(`${d.name}.py`))
    .filter((d) => existsSync(resolve(KN_ROOT, d.name, "facts.yaml")))
    .map((d) => {
        const dir = resolve(KN_ROOT, d.name);
        // log_type 是这一族在产物里的下标：引擎按它从 `{log_type: ...}` 里挑出该用的那一套
        const m = read(resolve(PROVIDER_DIR, `${d.name}.py`)).match(/^\s+log_type\s*=\s*"([^"]+)"/m);
        if (!m) throw new Error(`knowledge/engine/providers/${d.name}.py 里读不到 log_type（族 ${d.name} 配对失败）`);
        return {
            key: d.name,
            logType: m[1],
            dir,
            factsPath: resolve(dir, "facts.yaml"),
            rulesDir: resolve(dir, "rules"),
            plotDir: resolve(dir, "plot"),
            metaDir: resolve(dir, "meta"),
            faultKbPath: resolve(dir, "fault-kb.yaml"),
        };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
if (FAMILIES.length === 0) throw new Error("knowledge/ 下没有配好对的固件族（要有 facts.yaml 且同名适配器存在）");

const OPERATORS_PY = resolve(ENGINE, "operators.py");
const LLM_DIR = resolve(KN_ROOT, "llm"); // 第四层：LLM 只做翻译与组装（与固件族无关）
const PROMPT_PATH = resolve(LLM_DIR, "gjb841-system-prompt.md");
const EMPTY_PATH = resolve(LLM_DIR, "report-empty.md");
// 指南页目录：人工编写的 guide 页直接放在 web/content/guide/，本脚本再往里生成规则清单页与参考页。
// 写在这里而不是仓库根，是因为部署包只有 web/ 一个目录。
const GUIDES_DIR = resolve(webRoot, "content/guide");
// （曲线预设目录按族给：见 FAMILIES 里的 `plotDir`，没有 plot/ 的族就是没有曲线声明）

/**
 * 产物落盘。`--check` 时只比对不写入：产物是提交进仓库的，所以"改了 knowledge/ 却没重新
 * 生成产物"必须在 CI 里能被发现，而不是等线上跑着旧规则（`pnpm build:kb --check`）。
 */
const CHECK = process.argv.includes("--check");
const drifted = [];
function writeArtifact(path, content) {
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

        const kv = line.match(/^\s{2,}([a-z_]+):\s*(.*)$/);
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

// 框架自己往求值环境里补的名字（不属于 provider，见 providers/api.py 末尾的说明）。
// `no_data` 曾经在这儿——它随 skip 机制一起退役了（compute 失败现在自动记一条 skipped），
// 留着会让引用了它的规则构建期放行、运行期 NameError → 那条规则静默失效。
const FRAMEWORK_VARS = ["has_topic"];

/**
 * 规则表达式能引用的内置变量 = provider 契约的 BUILTIN_VARIABLES + 框架补的两个。
 *
 * **从 knowledge/engine/providers/api.py 派生，不手抄**：这份名字以前是手维护的副本，
 * 与引擎漂移时表现为"构建期放行、运行期 NameError"——引擎按"数据不足"静默处理，
 * 那条规则从此不出结论，没有任何提示（`no_data` 当初就是这么漏的）。
 */
const BUILTIN_VARS = new Set([...parseProviderApi(read(PY_PROVIDER_API)).builtinVariables, ...FRAMEWORK_VARS]);

/** 表达式里允许出现、但不是变量名的关键字/字面量（校验标识符时跳过） */
const EXPR_KEYWORDS = new Set(["and", "or", "not", "in", "is", "True", "False", "None"]);

/** 扫标识符前先去掉字符串字面量（如 'vehicle_status' not in topics 里的 topic 名） */
const stripStrings = (s) =>
    String(s)
        .replace(/'[^']*'/g, " ")
        .replace(/"[^"]*"/g, " ");

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
        // 入参个数可以写成**列表**（如 `in_arity=[1, 4]`）：同一种运算接受两种写法时用
        // （`quat_to_euler` 收一组四列、或收 w/x/y/z 四列）。列表里每个数都是"可以接受的个数"，
        // 构建期逐个放行、别的一律拒绝。
        const arity = (key) => {
            const mm = rest.match(new RegExp(key + "\\s*=\\s*(\\[[^\\]]*\\]|\\d+)"));
            if (!mm) return 1;
            if (!mm[1].startsWith("[")) return Number(mm[1]);
            const list = mm[1]
                .slice(1, -1)
                .split(",")
                .map((x) => Number(x.trim()))
                .filter((x) => Number.isFinite(x));
            if (list.length === 0) throw new Error(`算子 ${name} 的 ${key} 列表是空的`);
            return list;
        };
        const names = rest.match(/out_names\s*=\s*\[([^\]]*)\]/);
        // 紧跟装饰器的 def 的形参名：用来校验**关键字实参名**。
        // node 上的额外键是 `**kw` 直通给算子的，名字写错不会报错、算子会用默认值算出错的结果，
        // 所以必须在这里拦住。形参里的 **kw / * 会被下面的正则过滤掉。
        const dm = /def\s+[A-Za-z_][A-Za-z0-9_]*\s*\(([\s\S]*?)\)\s*:/.exec(py.slice(re.lastIndex));
        const params = dm
            ? dm[1]
                  .split(",")
                  .map((s) => s.trim().split("=")[0].trim())
                  .filter((s) => /^[a-z_][a-z0-9_]*$/.test(s))
            : [];
        sigs[name] = {
            in_arity: arity("in_arity"),
            out_arity: num("out_arity"),
            out_names: names
                ? names[1]
                      .split(",")
                      .map((x) => x.trim().replace(/["']/g, ""))
                      .filter(Boolean)
                : [],
            params,
        };
    }
    return sigs;
}

/**
 * 从 providers/api.py 解析契约的三张常量表（格式固定：`NAME = {` 起、顶层键各占一行）。
 *
 * 为什么在 Node 里用正则而不是"跑一下 Python"：构建期**不执行** knowledge/engine/ 下的代码
 * （只当文本搬运，见 knowledge/engine/README.md），这条约定不能破——所以契约表按固定格式解析，
 * 解析不到就构建失败（同 parseOperatorSignatures 的做法）。
 */
function parseProviderApi(py) {
    const block = (name) => {
        const m = new RegExp(`^${name} = \\{([\\s\\S]*?)^\\}`, "m").exec(py);
        if (!m) throw new Error(`knowledge/engine/providers/api.py 里解析不到 ${name} 常量表`);
        const keys = [...m[1].matchAll(/^\s{4}"([A-Za-z_0-9]+)":/gm)].map((x) => x[1]);
        if (keys.length === 0) throw new Error(`knowledge/engine/providers/api.py 的 ${name} 是空的`);
        return keys;
    };
    const varsBlock = new RegExp(`^BUILTIN_VARIABLES = \\{([\\s\\S]*?)^\\}`, "m").exec(py);
    return {
        required: block("REQUIRED"),
        optional: block("OPTIONAL"),
        builtinVariables: block("BUILTIN_VARIABLES"),
        builtinVarDocs: parseBuiltinVarDocs(varsBlock[1]),
    };
}

/**
 * 解析 `BUILTIN_VARIABLES` 每个条目的 `type` 与 `doc`（指南页 §6.1 要用）。
 *
 * `doc` 允许**隐式字符串拼接**（一句太长折成几行相邻字面量），所以是把条目体内所有
 * 字符串字面量收集起来再拼——不要求 `"doc":` 后面只有一个字面量。
 * 只取 `doc` 之后的字面量：`type` 写在它前面，按出现顺序切一刀即可。
 */
function parseBuiltinVarDocs(body) {
    // 条目有两种写法：一行写完（`"X": {"type": ..., "doc": ...},`）与拆成多行。
    // 所以不能靠"匹配到 `^    },`"来切——那样会把后面的一行式条目整段吞进来。
    // 按**下一个顶层键的起点**切才是稳的：条目边界就是 `/^ {4}"NAME":/m`。
    const heads = [...body.matchAll(/^ {4}"([A-Za-z_0-9]+)":/gm)];
    const out = {};
    heads.forEach((head, i) => {
        const inner = body.slice(head.index, i + 1 < heads.length ? heads[i + 1].index : body.length);
        const name = head[1];
        const type = /"type":\s*"([^"]*)"/.exec(inner)?.[1] ?? "—";
        const docAt = inner.indexOf('"doc":');
        // 只收集引号里的内容：正文带转义引号的情况本表不追求精确，指南页够读就行
        // 第一个字面量是 `"doc"` 这个键名本身，丢掉；后面那些才是正文（可能折成多行拼接）
        const lits = [...inner.slice(docAt).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]);
        const doc = docAt === -1 ? "" : lits.slice(1).join("");
        out[name] = { type, doc };
    });
    if (Object.keys(out).length === 0)
        throw new Error("knowledge/engine/providers/api.py 的 BUILTIN_VARIABLES 解析不出条目");
    return out;
}

/** 校验并加载 rules/*.yaml；任何不完整都构建失败（杜绝"空洞经验"） */
function loadRules(dir, signatures, ruleMeta, vehicles) {
    const files = readdirSync(dir)
        .filter((f) => f.endsWith(".yaml"))
        .sort();
    if (files.length === 0) throw new Error("rules/ 下没有规则文件");
    const rules = [];
    const sources = []; // 与 rules 一一对应的来源文件名（规则清单页要显示）
    const seen = new Set();
    const byGroup = ruleMeta.by_group ?? {};
    const metaDefaults = ruleMeta.defaults ?? {};
    // 同一个 group 的多条规则，派生的 category/doc 必须一致——不一致就逼作者显式写，
    // 而不是静默取第一个（否则"改了派生表、却只有一条规则跟着变"没人会发现）。
    const seenMeta = new Map();

    // 先整读一遍：一个 YAML 可以装多条经验——**顶层数组**与**多个 YAML 文档**（`---` 分隔）
    // 两种写法都收。PX4 多数文件一条；APM 那一批全用多文档。
    // （以前只认单文档：APM 规则一进构建就报 MULTIPLE_DOCS，这也是它们迟迟没接线的副作用之一）
    const loaded = files.map((file) => {
        const docs = parseAllDocuments(readFileSync(resolve(dir, file), "utf8"));
        const items = [];
        for (const doc of docs) {
            if (doc.errors.length > 0) {
                throw new Error(`rules/${file}: YAML 解析失败：${doc.errors[0].message}`);
            }
            const v = doc.toJS();
            if (v === null || v === undefined) continue; // `---` 分隔线留下的空文档
            if (Array.isArray(v)) items.push(...v);
            else items.push(v);
        }
        return { file, items };
    });

    for (const { file, items } of loaded) {
        for (const raw of items) {
            const where = `rules/${file}` + (items.length > 1 ? `#${(raw && raw.id) || "?"}` : "");
            const requiredKeys = ["id", "group", "name", "triggers"];
            for (const key of requiredKeys) {
                if (raw[key] === undefined || raw[key] === null || raw[key] === "") {
                    throw new Error(`${where}: 缺少必填字段 ${key}`);
                }
            }
            if (raw.outputs !== undefined && !Array.isArray(raw.outputs)) {
                throw new Error(`${where}: outputs 必须是对象`);
            }
            // ── 适用范围：一个 conditions 块，六个键都能省（规则与绘图预设共用 normalizeConditions）──
            // 下面归一化成运行期的形态：两个平铺的轴 + 嵌套的 topics。**没有 skip 这个键**
            // （原来那坨 no_data / not has_armed 的判定已退役，理由见 knowledge/px4/CLAUDE.md）。
            // 退役的顶层键：不静默忽略，写错了要当场知道
            for (const [key, hint] of [
                [
                    "skip",
                    '缺 topic 改写进 conditions.topics；no_data / not has_armed 这类改成 conditions.armed（true / false / ">12"），或直接删',
                ],
                [
                    "precheck",
                    "已拆成三块：解锁门槛 → conditions.armed；模式 → conditions.mode；未实现 → conditions.placeholder。其余先决条件请在 compute 里算出来、交给 triggers[].when 判",
                ],
                ["ran_on_success", "ran() 现在统一在 compute 成功之后记（算不出来会记一条「数据不足」），这个字段已删"],
                ["known_legacy", '字段的跨版本差异改用候选组表达：ref("新名", "旧名") 取第一个存在的'],
            ]) {
                if (raw[key] !== undefined) throw new Error(`${where}: ${key} 已移除——${hint}`);
            }
            const cond = normalizeConditions(raw.conditions, where, vehicles);
            delete raw.conditions;
            Object.assign(raw, cond);
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
            if (raw.docurl === undefined && gm.doc !== undefined) raw.docurl = gm.doc;
            // 同 group 的多条规则必须派生出同样的 category/doc
            for (const [field, val] of [
                ["category", raw.category],
                ["docurl", raw.docurl],
            ]) {
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
            if (Array.isArray(raw.compute) && raw.compute.length === 0) {
                throw new Error(`${where}: compute 必须是非空数组`);
            }
            // compute 是一串**字符串表达式**（与 triggers.when / skip.when 同一套 Python 子集）；
            // **算子节点**（旧）。旧写法在这里编译成等价表达式，于是产物里只有一种形态、
            // 也只有一套校验（不写第二套）。运行期由 knowledge/engine/engine.py 的 _eval_compute 求值。
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
            if (!Array.isArray(raw.triggers) || raw.triggers.length === 0) {
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
                if (!t.when && t.when !== undefined) throw new Error(`${where}: trigger 缺 when`);
                // 词表取 rule-expr.mjs 的 SEVERITIES（编辑器 schema 也用这一份，别再抄一份）
                const sevList = Array.isArray(t.severity) ? t.severity : [t.severity || "info"];
                for (const s of sevList) {
                    if (!SEVERITIES.has(s)) {
                        throw new Error(
                            `${where}: trigger severity 非法：${s}（可用：${[...SEVERITIES].join(" / ")}）`,
                        );
                    }
                }
                if (typeof t.description !== "string" && !Array.isArray(t.description))
                    throw new Error(`${where}: trigger 缺 description`);
                if (!t.evidence || typeof t.evidence !== "object")
                    throw new Error(`${where}: trigger 缺 evidence 对象`);
                if (typeof t.evidence.source !== "string") throw new Error(`${where}: trigger.evidence 缺 source`);
                // 表达式里的标识符必须已声明（内置变量 / compute 输出 / foreach 事件键）
                const whenList = Array.isArray(t.when) ? t.when : [t.when || "True"];
                for (const w of whenList) {
                    if (typeof w !== "string") continue;
                    for (const name of stripStrings(w).match(/[A-Za-z_][A-Za-z0-9_]*/g) || []) {
                        if (EXPR_KEYWORDS.has(name)) continue;
                        if (!declared.has(name) && !BUILTIN_VARS.has(name) && !eventKeys.has(name)) {
                            throw new Error(`${where}: 表达式引用了未声明的名字 ${name}（when: ${w}）`);
                        }
                    }
                }
                // evidence.value: expression (variables from compute/env, f-string for formatting)
                const evVal = t.evidence?.value;
                if (evVal !== undefined && typeof evVal !== "string") {
                    throw new Error(`${where}: evidence.value 必须是字符串表达式`);
                }
                if (typeof evVal === "string") {
                    for (const name of stripStrings(evVal).match(/[A-Za-z_][A-Za-z0-9_]*/g) || []) {
                        if (EXPR_KEYWORDS.has(name) || name === "f") continue;
                        if (!declared.has(name) && !BUILTIN_VARS.has(name) && !eventKeys.has(name)) {
                            throw new Error(`${where}: evidence.value 引用了未声明的名字 ${name}`);
                        }
                    }
                }
                // validate template vars in description / evidence.source / suggestion
                const txtPairs = [
                    { vec: t.description, label: "description" },
                    { vec: t.evidence?.source, label: "evidence.source" },
                    { vec: t.suggestion, label: "suggestion" },
                ];
                for (const { vec: txt, label } of txtPairs) {
                    const arr = Array.isArray(txt) ? txt : txt ? [txt] : [];
                    for (const tt of arr) {
                        if (typeof tt !== "string") continue;
                        for (const m of tt.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)(:[^}]*)?\}/g)) {
                            if (!declared.has(m[1]) && !BUILTIN_VARS.has(m[1]) && !eventKeys.has(m[1])) {
                                throw new Error(`${where}: ${label} 引用了未声明的名字 ${m[1]}`);
                            }
                        }
                    }
                }
            }
            rules.push(raw);
            sources.push(file);
        }
    }
    return { rules, sources };
}

// ─────────────────── 指南「开发指南」分组的规则清单 + 规则编写参考 ───────────────────
//
// 把 rules/*.yaml 渲染成 /guide/rule-catalogue 那一页（产物提交进仓库）。
// 把 knowledge/engine/ 源码的算子签名与内置变量渲染成 /guide/rule-schema 那一页（算子目录与内置变量表动态派生）。
// 与引擎产物同源、同一次构建生成：规则/算子改了页面就跟着变，不用谁记得手动同步。
// 清单与参考页只出网站这一份，仓库里不留第二份拷贝（免得两处对不上）。

const GROUP = { zh: "开发指南", en: "For Developers" };

const CATALOGUE_INTRO = `引擎当前内置的 **{n} 条检查经验**，按执行位置（slot，即下面每一节的标题）分组。
每条给出：**适用**（固件 / 机架 / 依赖）、**取值**（读哪些字段、过哪个算子）、**判定**（自上而下
命中第一条即发射）、**产出**（写进报告的 check 名、喂故障库匹配的标签、UI 用的统计）。

判定阈值就写在各自的经验 YAML 里；slot 决定执行顺序（报告里的 F01、F02… 编号按发射顺序生成）。
所有判定都由确定性引擎在浏览器本地完成——LLM 只把结论翻译成中文报告，不参与任何数值判断。
本页在构建时从 \`rules/*.yaml\` 自动生成。`;

const listOr = (v, fallback) => (Array.isArray(v) ? v.join(",") : v === undefined || v === null ? fallback : String(v));

/**
 * `ref(..., unit="deg")` 的**源单位**从哪来：`meta/<tag>.json`（经 `meta/topic-map.yaml`
 * 换字典键），`meta/topic-overrides.yaml` 可补/纠——meta 是生成的，单位常缺失或直接是
 * `.msg` 注释里的自由文本（`metres` / `radians` / `'stop the motors'` 混在一起）。
 *
 * **只收录写了 `unit=` 的引用**涉及的字段：没写的一个都不查，所以 meta 的脏数据卡不住
 * 现有规则。查不到 → **告警**（不是失败）：那条留空，运行期按原样给、不换算。
 * 目标单位（作者写的那个）认不出、或与源单位不同量纲 → 构建失败。
 */
function resolveFieldUnits(refs, metaDir) {
    const topicMap = parseYaml(read(resolve(metaDir, "topic-map.yaml"))).topics ?? {};
    const overridePath = resolve(metaDir, "topic-overrides.yaml");
    const overrides = existsSync(overridePath) ? (parseYaml(read(overridePath)).units ?? {}) : {};

    // 逐 tag 读成 {字典键.字段: [原始单位…]}，main 在前（它的口径最新，优先采信）
    const metaUnits = new Map();
    const tags = readdirSync(metaDir)
        .filter((f) => f.endsWith(".json"))
        .sort();
    for (const f of tags) {
        const doc = JSON.parse(read(resolve(metaDir, f)));
        for (const [key, spec] of Object.entries(doc.topics ?? {})) {
            for (const [name, def] of Object.entries(spec.fields ?? {})) {
                if (!def || !def.unit) continue;
                const k = `${key}.${name}`;
                if (!metaUnits.has(k)) metaUnits.set(k, []);
                metaUnits.get(k).push(String(def.unit));
            }
        }
    }

    // "谁要单位、要哪个单位"由调用方收齐（规则从 compute 抽、预设从字段声明与 compute 抽），
    // 这里只认 `{where, fields, unit}` 三样
    const wanted = new Map(); // "topic.field" -> Set(规范目标单位)
    for (const r of refs) {
        if (r.unit === undefined || r.unit === null) continue;
        const dst = normalizeUnit(r.unit);
        if (!dst) {
            throw new Error(
                `${r.where}: unit="${r.unit}" 里那个单位认不出（可用：` +
                    `${[...new Set(Object.values(UNIT_ALIASES))].sort().join(" / ")}）`,
            );
        }
        for (const fld of r.fields) {
            if (!wanted.has(fld)) wanted.set(fld, new Set());
            wanted.get(fld).add(dst);
        }
    }

    const out = {};
    const unknown = [];
    for (const fldRaw of [...wanted.keys()].sort()) {
        // 实例号写在 topic 后（`vehicle_gps_position[-1].lat`）——单位表的键去掉它
        const fld = fldRaw.replace(/\[[^\]]*\]\./, ".");
        const [topic, field] = fld.split(".");
        const dictKey = topicMap[topic] ?? topic;
        const raw_ = overrides[fld] ?? (metaUnits.get(`${dictKey}.${field}`) ?? [])[0];
        const src = normalizeUnit(raw_);
        if (!src) {
            unknown.push(fld);
            continue;
        }
        for (const dst of wanted.get(fldRaw)) {
            if (UNIT_KIND[src] !== UNIT_KIND[dst]) {
                throw new Error(
                    `${fld} 的单位是 ${src}（${UNIT_KIND[src]}），而规则要它输出 ${dst}（${UNIT_KIND[dst]}）` +
                        `——量纲不同不能换算。要改单位请改 meta/topic-overrides.yaml 的 units，` +
                        `或者改 ref(..., unit=) 的期望单位`,
                );
            }
        }
        out[fld] = src;
    }
    if (unknown.length) {
        console.warn(
            `  ! 这些字段在 meta 里查不到单位，unit= 不做换算：${unknown.join("、")}\n` +
                `    补法：在 knowledge/px4/meta/topic-overrides.yaml 的 units 里加一行（字段名 → 真实单位）`,
        );
    }
    return out;
}

/**

/**
 * 机架名归一化：`mc` / `fw` 这类简写换成规范名（表在 facts.yaml 的 `vehicle_aliases`）。
 *
 * 简写只是**书写方便**：产物里只留规范名，所以引擎 `_match_vehicle` 与各适配器都不用
 * 认识别名——"同一个意思只留一种写法"这条在运行时那边成立。
 * 表里没有、又不在合法机架名集合（facts.yaml 的 `vehicle_types` 值 + unknown）里的 → 报错，
 * 不静默放过（写错的机架名会让那条经验**永远不跑**，最难发现的一种坏）。
 */
function normalizeVehicle(spec, vehicles, where) {
    const canon = (name) => {
        const n = String(name).trim();
        if (vehicles.aliases[n]) return vehicles.aliases[n];
        if (vehicles.valid.has(n)) return n;
        throw new Error(
            `${where}: conditions.vehicle 里的「${n}」不认识（可用：${[...vehicles.valid].sort().join(" / ")}；` +
                `简写见 facts.yaml 的 vehicle_aliases）`,
        );
    };
    if (typeof spec === "string") return spec.trim() === "any" ? "any" : canon(spec);
    return spec.map(canon);
}

// ─────────────────────────── 绘图预设（plot/*.yml）───────────────────────────
// 曲线与地图**共用一套声明**：conditions（适用范围，与规则同形）+ 可选的 compute（换算）
// + outputs[]（容器 = 一张图 or 地图，children = 图上的线 / 地图上的轨道）。
// 取数一律走 ref 那套语言（候选组 + unit=），所以"字段换代、改了量纲"在图上与规则里是
// 同一种写法，单位也共用同一张表（resolveFieldUnits）。

/** 图的两种模式；`track` 只出现在 `container: map` 的 child 上 */
const CHART_MODES = new Set(["TimeSeries", "xyplot"]);
/** 线型取值：三个通用叫法（渲染时映射到绘图库的线型；**不自造 `-^` 那种格式串**） */
const LINE_STYLES = new Set(["solid", "dashed", "dotted"]);
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * 与 `ydata` **逐项对齐**的并列键（`label` / `style` / `color`）——必须是 **YAML 列表**。
 *
 * 为什么不用逗号串：这三个都是枚举/普通字符串，让 YAML 自己切既准确又能报到位；
 * 而且颜色是 `#rrggbb`，逗号串形态下**没法写**（YAML 不允许标量以引号开头，`#` 不加引号
 * 又会被当注释，只能绕块标量）。表达式那一列（`ydata`）仍走逗号串——它必须由
 * `parseExprList` 认引号与括号。
 */
function parallelList(raw, n, where, what, check) {
    if (raw === undefined || raw === null) return null;
    if (!Array.isArray(raw)) {
        throw new Error(
            `${where}: ${what} 要写成 YAML 列表，如 ${what}: [甲, 乙]（只有一项也要写 ${what}: [甲]）` +
                `——与 ydata 逐项对应；逗号串那种写法不再认`,
        );
    }
    if (raw.length !== n) {
        throw new Error(`${where}: ${what} 有 ${raw.length} 项、ydata 有 ${n} 项——两者必须一一对应`);
    }
    return raw.map((v, i) => {
        if (typeof v !== "string" || !v.trim()) {
            throw new Error(`${where}: ${what} 第 ${i + 1} 项必须是非空字符串（实际 ${JSON.stringify(v)}）`);
        }
        const s = v.trim();
        if (check) check(s, i);
        return s;
    });
}

/**
 * 一个取数声明（`xdata`、地图的 `lat`…）→ 运行期描述。**单个**必须是字符串。
 *
 * 带 `unit=` 的引用在这里登记进单位表（源单位在 meta/<tag>.json 查，见 resolveFieldUnits）——
 * **在编译处登记**，不靠事后遍历产物猜形状：地图坐标编译后不是同一个形状，遍历会漏。
 */
function compileFieldOne(raw, where, what, declaredVars, refs) {
    if (typeof raw !== "string" || !raw.trim()) {
        throw new Error(`${where}: ${what} 必须是非空的字段声明（如 ref("vehicle_gps_position.eph", unit="m")）`);
    }
    let desc;
    try {
        desc = checkFieldItem(raw, { signatures, builtinVars: BUILTIN_VARS, declaredVars });
    } catch (err) {
        throw new Error(`${where}: ${what}——${err.message}`);
    }
    if (refs && desc.kind === "field" && desc.unit) {
        refs.push({ where, fields: desc.fields, unit: desc.unit });
    }
    return desc;
}

/** 一条线一个取数声明（`ydata`）→ 运行期描述数组。**必须是 YAML 列表**，与 label/style/color 同形。 */
function compileFieldList(raw, where, what, declaredVars, refs) {
    if (!Array.isArray(raw)) {
        throw new Error(
            `${where}: ${what} 要写成 YAML 列表，一行一条线：\n` +
                `    ${what}:\n      - ref("vehicle_gps_position.eph", unit="m")\n      - remaining_pct`,
        );
    }
    if (raw.length === 0) throw new Error(`${where}: ${what} 是空列表（这张图画什么？）`);
    return raw.map((item, i) => {
        if (typeof item !== "string" || !item.trim()) {
            throw new Error(`${where}: ${what} 第 ${i + 1} 项必须是非空字符串（实际 ${JSON.stringify(item)}）`);
        }
        return compileFieldOne(item, `${where} 的 ${what} 第 ${i + 1} 项`, "", declaredVars, refs);
    });
}

/** 一条线没写 label 时的图例名：字段引用用第一个候选的字段名，换算节点的输出用变量名。 */
function defaultLabel(desc) {
    if (desc.kind === "var") return desc.name;
    const parsed = splitFieldRef(desc.fields[0]);
    return parsed ? parsed.field : desc.fields[0];
}

/** 容器级那些可有可无的开关（legend / grid / flipx / flipy / range）。 */
function containerSwitches(out, where) {
    for (const k of ["legend", "grid", "flipx", "flipy"]) {
        if (out[k] !== undefined && typeof out[k] !== "boolean") {
            throw new Error(`${where}: ${k} 只能是 true / false（实际 ${JSON.stringify(out[k])}）`);
        }
    }
    let range = null;
    if (out.range !== undefined) {
        if (
            !Array.isArray(out.range) ||
            ![2, 4].includes(out.range.length) ||
            out.range.some((x) => typeof x !== "number")
        ) {
            throw new Error(`${where}: range 要是两个或四个数字（[x0,x1] 或 [x0,x1,y0,y1]），不写就是自动适配`);
        }
        range = out.range;
    }
    let hlines = null;
    if (out.hlines !== undefined) {
        if (!Array.isArray(out.hlines) || !out.hlines.length) throw new Error(`${where}: hlines 必须是非空数组`);
        hlines = out.hlines.map((h) => {
            if (typeof h.value !== "number" || !h.label) throw new Error(`${where}: hlines 每项要有 value 与 label`);
            if (!["ok", "warning", "critical"].includes(h.level)) {
                throw new Error(`${where}: hlines.level 只能是 ok / warning / critical`);
            }
            return { value: h.value, level: h.level, label: h.label };
        });
    }
    return {
        title: out.title ?? null,
        legend: out.legend !== false,
        grid: out.grid !== false,
        flipx: out.flipx === true,
        flipy: out.flipy === true,
        range,
        hlines,
    };
}

/**
 * `container: axes` → 一张图。**单位一致性在这里卡住**：同一张图里写了 `unit=` 的引用必须
 * 目标单位相同（一图一量纲 —— `eph`(m) 与 `hdop`(无量纲) 画在一个 y 轴上没法读）。
 * `split_by_instance` 要求图上有 `[:]` 的引用（否则拆不出多张图）；反过来，没有 `split_by_instance`
 * 的图不许出现 `[:]`（那会取到一组实例，引擎会报错——不如在这里说清楚）。
 */
function compileAxes(out, where, declaredVars, refs) {
    const switches = containerSwitches(out, where);
    if (typeof out.ylabel !== "string" || !out.ylabel.trim()) {
        throw new Error(`${where}: container: axes 必须有 ylabel（这张图的 y 轴标签，如 m / deg / %）`);
    }
    if (!Array.isArray(out.children) || out.children.length === 0) {
        throw new Error(`${where}: children 必须是非空数组（这张图画哪几条线）`);
    }
    const perInstance = out.split_by_instance === true;
    const children = out.children.map((child, ci) => {
        const cwhere = `${where} 第 ${ci + 1} 条 child`;
        if (!CHART_MODES.has(child.mode)) {
            throw new Error(`${cwhere}: mode 只能是 TimeSeries / xyplot（实际 ${JSON.stringify(child.mode)}）`);
        }
        const ydata = compileFieldList(child.ydata, cwhere, "ydata", declaredVars, refs);
        const labels = parallelList(child.label, ydata.length, cwhere, "label") ?? ydata.map(defaultLabel);
        const styles =
            parallelList(child.style, ydata.length, cwhere, "style", (v, i) => {
                if (!LINE_STYLES.has(v)) {
                    throw new Error(
                        `${cwhere}: style 第 ${i + 1} 项 ${JSON.stringify(v)} 不是合法线型` +
                            `（可用：${[...LINE_STYLES].join(" / ")}）`,
                    );
                }
            }) ?? [];
        const colors =
            parallelList(child.color, ydata.length, cwhere, "color", (v, i) => {
                if (!COLOR_RE.test(v))
                    throw new Error(`${cwhere}: color 第 ${i + 1} 项 ${JSON.stringify(v)} 要是 #rrggbb`);
            }) ?? [];
        const xdata =
            child.xdata === undefined ? null : compileFieldOne(child.xdata, cwhere, "xdata", declaredVars, refs);
        if (child.mode === "xyplot" && !xdata) throw new Error(`${cwhere}: mode: xyplot 必须写 xdata`);
        return { mode: child.mode, xdata, ydata, labels, styles, colors };
    });

    const units = new Set();
    let grouped = 0;
    for (const c of children) {
        for (const d of c.ydata) {
            if (d.unit) units.add(d.unit);
            if (d.kind === "field" && d.fields.some((f) => typeof (splitFieldRef(f) ?? {}).inst !== "number"))
                grouped++;
        }
    }
    if (units.size > 1) {
        throw new Error(
            `${where}: 同一张图里出现了不同单位的曲线（${[...units].join(" / ")}）——一张图只画一个量纲，` +
                `拆成两张图，或者去掉不需要换算的那条线的 unit=`,
        );
    }
    if (perInstance && grouped === 0) {
        throw new Error(
            `${where}: 写了 split_by_instance 但没有任何引用取"所有实例"——那条线要写成 ref("topic[:].field")`,
        );
    }
    if (!perInstance && grouped > 0) {
        throw new Error(
            `${where}: 有引用取到了"所有实例"（[:] 或不写实例），这样画不出图——` +
                `要么给容器加 split_by_instance: true（每实例一张图），要么在引用里写死第几个实例`,
        );
    }
    return {
        container: "axes",
        ...switches,
        split_by_instance: perInstance,
        ylabel: out.ylabel.trim(),
        xlabel: out.xlabel ?? "秒（相对日志开始）",
        children,
    };
}

/**
 * `container: map` → 轨迹声明（进 `facts.track`，由 provider 在引擎侧取数、换算、抽稀）。
 * 三个坐标都必须写明实例：同一条轨道的时间戳与 `fix_type` 得跟坐标来自同一个 topic 的
 * 同一个实例，否则三路采样率不同、画出来是错的。
 */
function compileMap(out, where, declaredVars, refs) {
    const switches = containerSwitches(out, where);
    if (!Array.isArray(out.children) || out.children.length === 0) {
        throw new Error(`${where}: children 必须是非空数组（地图上画哪几条轨道）`);
    }
    const children = out.children.map((child, ci) => {
        const cwhere = `${where} 第 ${ci + 1} 条轨道`;
        if (child.mode !== "track") throw new Error(`${cwhere}: 地图上的 mode 只能是 track`);
        const maxPoints = child.max_points === undefined ? 1500 : Number(child.max_points);
        if (!Number.isFinite(maxPoints) || maxPoints < 2) {
            throw new Error(`${cwhere}: max_points 要是 ≥ 2 的数字（抽稀到多少点）`);
        }
        const coords = {};
        for (const axis of ["lat", "lon", "alt"]) {
            const desc = compileFieldOne(child[axis], cwhere, axis, declaredVars, refs);
            if (desc.kind !== "field") {
                throw new Error(`${cwhere}: ${axis} 必须是字段引用（地图坐标不支持换算节点的输出）`);
            }
            for (const f of desc.fields) {
                const parsed = splitFieldRef(f);
                if (!parsed) throw new Error(`${cwhere}: ${axis} 的 ${JSON.stringify(f)} 不是 topic.field 形式`);
                if (typeof parsed.inst !== "number") {
                    throw new Error(
                        `${cwhere}: ${axis} 的候选 ${f} 没写明实例——地图坐标要指定第几个实例` +
                            `（如 sensor_gps[0].latitude_deg；两条轨道各画一个实例时才有理由写别的 N）`,
                    );
                }
            }
            coords[axis] = { cands: desc.fields, unit: desc.unit ?? null };
        }
        // 候选顺序即优先级；provider 拿它去同一 topic 上取起始 UTC（与坐标同一口径）
        const topics = [];
        for (const f of coords.lat.cands) {
            const parsed = splitFieldRef(f);
            if (!topics.some(([t, i]) => t === parsed.topic && i === parsed.inst))
                topics.push([parsed.topic, parsed.inst]);
        }
        return {
            label: child.label ?? splitFieldRef(coords.lat.cands[0]).topic,
            max_points: maxPoints,
            lat: coords.lat,
            lon: coords.lon,
            alt: coords.alt,
            topics,
        };
    });
    return { container: "map", title: switches.title ?? "轨迹", legend: switches.legend, children };
}

/**
 * 把预设的适用范围（`conditions`）附到地图声明上（它会进 `facts.track`）。
 *
 * 地图与曲线**共用同一份声明**，但判据在两头：曲线在前端按 `conditions.topics` 判适用性
 * （`web/lib/chart-presets.ts` 的 `presetApplies`），地图的判据在引擎侧
 * （`knowledge/engine/providers/px4.py` 的 `get_flight_track`）。`facts.track` 以前只带 `children`，
 * 于是引擎**看不到这句声明**，取不到坐标时只能笼统报"声明里的坐标候选都不在日志里"——
 * 而真相常常是"这份日志根本没有 `sensor_gps` / `vehicle_gps_position`"。带上声明之后，
 * 引擎就能复用 `engine._missing_topics` 说清缺哪个 topic（**文案只在那里生成一处**）。
 *
 * 只认 `topics`：固件 / 机架 / 先决条件这三个轴，引擎的地图路径没有求值器（规则的闸门是
 * 内联在 `_run_rules` 里的）。写了非默认值就在**构建期**报错，别让它在运行期悄悄不生效。
 */
function withMapConditions(map, conditions, where) {
    const unsupported = ["firmware", "vehicle"].filter((k) => conditions[k] && conditions[k] !== "any");
    unsupported.push(...["mode", "armed", "placeholder"].filter((k) => conditions[k] !== undefined));
    if (unsupported.length) {
        throw new Error(
            `${where}: 地图预设的 conditions 只支持 topics（引擎侧的地图路径没接 ${unsupported.join(" / ")}）——` +
                `要按固件 / 机架 / 模式 / 解锁收紧，得先在 get_flight_track 里接上同一个闸门`,
        );
    }
    return { ...map, conditions: { topics: conditions.message ?? [] } };
}

/** 一份预设 → `{plot, map, refs}`（plot 进前端产物，map 进 facts.track）。 */
function compilePreset(spec, where, vehicles) {
    for (const key of ["id", "title", "description", "outputs"]) {
        if (spec[key] === undefined || spec[key] === null || spec[key] === "") {
            throw new Error(`${where}: 缺少必填字段 ${key}`);
        }
    }
    if (spec.order !== undefined && !Number.isFinite(Number(spec.order))) {
        throw new Error(`${where}: order 必须是数字`);
    }
    const conditions = normalizeConditions(spec.conditions, where, vehicles);
    rejectEngineOnlyConditions(conditions, where, "绘图预设");
    const compute = (spec.compute ?? []).map((s) => String(s).trim());
    let declaredVars = new Set();
    if (compute.length) {
        try {
            // 与规则的 compute **同一个校验器**：左值个数对得上算子、引用的名字已声明、算子已注册
            declaredVars = new Set(validateComputeList(compute, { signatures, builtinVars: BUILTIN_VARS }).keys());
        } catch (err) {
            throw new Error(`${where}: compute ${err.message}`);
        }
    }
    if (!Array.isArray(spec.outputs) || spec.outputs.length === 0) {
        throw new Error(`${where}: outputs 必须是非空数组`);
    }
    let map = null;
    const refs = [];
    const outputs = spec.outputs.map((out, oi) => {
        const owhere = `${where} 第 ${oi + 1} 个 container`;
        if (out.container === "axes") return compileAxes(out, owhere, declaredVars, refs);
        if (out.container === "map") {
            if (map) throw new Error(`${where}: 一份预设里最多一个 container: map`);
            map = compileMap(out, owhere, declaredVars, refs);
            return map;
        }
        throw new Error(`${owhere}: container 只能是 axes / map（实际 ${JSON.stringify(out.container)}）`);
    });
    const plot = {
        id: spec.id,
        title: spec.title,
        description: spec.description,
        order: Number(spec.order ?? 999),
        conditions,
        compute,
        outputs,
    };
    // 换算节点里的 ref(..., unit=) 也要进单位表（与规则同一套）
    for (const stmt of compute) {
        for (const r of collectRefs(stmt)) refs.push({ where: `${where} 的 compute`, ...r });
    }
    return { plot, map, refs };
}

/** plot/ 下所有预设 → `{plots, mapSpec, refs}`。`*-template.yml` 是给人抄的骨架，不加载。 */
function loadPresets(dir, vehicles) {
    const files = readdirSync(dir)
        .filter((f) => f.endsWith(".yml") && !f.endsWith("-template.yml"))
        .sort();
    if (files.length === 0) throw new Error("knowledge/px4/plot/ 下没有预设文件");
    const plots = [];
    const refs = [];
    const seen = new Set();
    let mapSpec = null;
    for (const file of files) {
        const where = `plot/${file}`;
        const { plot, map, refs: r } = compilePreset(parseYaml(read(resolve(dir, file))), where, vehicles);
        if (seen.has(plot.id)) throw new Error(`${where}: 预设 id 重复 ${plot.id}`);
        seen.add(plot.id);
        if (map) {
            // 地图是报告页的常驻区，只有一块地方：多个预设各声明一份 map，谁都画不了
            if (mapSpec) throw new Error(`${where}: 已经有一份预设声明了 container: map（全局只能一个）`);
            mapSpec = withMapConditions(map, plot.conditions, where);
        }
        plots.push(plot);
        refs.push(...r);
    }
    plots.sort((a, b) => a.order - b.order);
    return { plots, mapSpec, refs };
}

/**
 * 适用范围（`conditions`）→ 运行期形态。**规则与绘图预设共用这一处**（别造第三种方言）：
 *
 *   firmware  固件约束串（any / ">=1.15" / ">=1.14,<1.15"），由 provider.match_version 解释
 *   vehicle  any / 机架名 / 机架名列表；简写（mc / fw）在这里换成规范名
 *   topics    日志里得有这些 topic，缺了记一条 skipped；项内 `||` = 任意一个存在即可
 *   mode      与 topics **同形**，但比的是「日志里出现过哪些飞行模式」（MODES_PRESENT）
 *   armed     解锁：any（缺省）/ true / false / ">12"（对 ARMED_S 求值的门槛，秒）
 *   placeholder  这条经验还没实现，引擎跳过并把这句当原因显示（占位专用）
 *
 * 后三个**只有规则这边用得上**：绘图预设的 conditions 由前端按 topics 判适用性，
 * 拿不到 MODES_PRESENT / ARMED_S，写了会在运行期悄悄不生效——所以预设侧直接拦掉。
 *
 * 没写的键**省略掉**——产物里不留空壳。退役的顶层键（skip / ran_on_success / known_legacy）
 * 由调用方各自拦（规则那边有历史包袱，预设那边写了直接报错）。
 */
function normalizeConditions(raw, where, vehicles) {
    const cond = raw ?? {};
    if (typeof cond !== "object" || cond === null || Array.isArray(cond)) {
        throw new Error(
            `${where}: conditions 必须是对象（可用键：firmware / vehicle / message / mode / armed / placeholder）`,
        );
    }
    for (const k of Object.keys(cond)) {
        if (!["firmware", "vehicle", "message", "mode", "armed", "placeholder"].includes(k)) {
            throw new Error(
                `${where}: conditions 里有未知键 ${k}（可用：firmware / vehicle / message / mode / armed / placeholder）`,
            );
        }
    }
    if (cond.firmware !== undefined && !isFirmwareSpec(cond.firmware)) {
        throw new Error(
            `${where}: conditions.firmware 必须是固件约束串（any / ">=1.15" / "<1.15" / ">=1.14,<1.15"），` +
                `实际是 ${JSON.stringify(cond.firmware)}`,
        );
    }
    if (cond.vehicle !== undefined && !isVehicleSpec(cond.vehicle)) {
        throw new Error(
            `${where}: conditions.vehicle 必须是 any / 机架名 / 机架名列表（如 [fixed_wing, unknown]），` +
                `实际是 ${JSON.stringify(cond.vehicle)}`,
        );
    }
    if (cond.message !== undefined && !Array.isArray(cond.message)) {
        throw new Error(`${where}: conditions.message 必须是数组（每项一个 topic，多个候选用 || 分隔）`);
    }
    if (Array.isArray(cond.message) && cond.message.length === 0) {
        throw new Error(`${where}: conditions.message 是空数组（没有依赖就整个删掉）`);
    }
    const topics = (cond.message ?? []).map((t) => {
        try {
            return parseTopicReq(t);
        } catch (err) {
            throw new Error(`${where}: ${err.message}`);
        }
    });
    const mode = parseModeSpec(cond.mode, where);
    const armed = parseArmedSpec(cond.armed, where);
    const placeholder = parsePlaceholderSpec(cond.placeholder, where);
    const out = {
        firmware: cond.firmware ?? "any",
        vehicle: normalizeVehicle(cond.vehicle ?? "any", vehicles, where),
    };
    if (topics.length) out.message = topics;
    if (mode.length) out.mode = mode;
    if (armed !== undefined) out.armed = armed;
    if (placeholder !== undefined) out.placeholder = placeholder;
    return out;
}

/**
 * `conditions.mode` → 候选组的数组，与 `topics` 同形（项内 `||` = 任一，项间 = 都要）。
 * 校验只做形状：模式名是日志原文（APM 的 `AUTO` / `LOITER`，PX4 也是字符串），
 * 不做码表比对——码表是 facts 的事，且老固件总有表外的模式名。
 */
function parseModeSpec(spec, where) {
    if (spec === undefined) return [];
    if (!Array.isArray(spec) || spec.length === 0) {
        throw new Error(`${where}: conditions.mode 必须是非空数组（每项一个模式，多个候选用 || 分隔）`);
    }
    return spec.map((m) => {
        if (typeof m !== "string" || !m.trim()) {
            throw new Error(`${where}: conditions.mode 的每一项都要是非空字符串`);
        }
        const parts = m.split("||").map((s) => s.trim());
        if (parts.length !== parts.filter(Boolean).length) {
            throw new Error(`${where}: conditions.mode 项「${m}」的 || 两边不能为空`);
        }
        for (const p of parts) {
            if (!/^[A-Za-z0-9_]+$/.test(p)) {
                throw new Error(
                    `${where}: conditions.mode 项「${m}」里的「${p}」不是合法模式名（只允许字母数字下划线）`,
                );
            }
        }
        return parts;
    });
}

/** `conditions.armed` → any / 布尔 / 数字 / 带比较符的门槛串。原值透传，运行期解释。 */
function parseArmedSpec(spec, where) {
    if (spec === undefined) return undefined;
    const ok =
        spec === true ||
        spec === false ||
        (typeof spec === "number" && Number.isFinite(spec)) ||
        (typeof spec === "string" && /^(any|true|false|[<>=!]=?\s*\d+(\.\d+)?|\d+(\.\d+)?)$/.test(spec.trim()));
    if (!ok) {
        throw new Error(
            `${where}: conditions.armed 只能是 any / true / false / 数字 / 带比较符的门槛（如 ">12"），实际是 ${JSON.stringify(spec)}`,
        );
    }
    return typeof spec === "string" ? spec.trim() : spec;
}

/** `conditions.placeholder` → 非空字符串或 true。 */
function parsePlaceholderSpec(spec, where) {
    if (spec === undefined) return undefined;
    if (spec === true) return true;
    if (typeof spec === "string" && spec.trim()) return spec.trim();
    throw new Error(`${where}: conditions.placeholder 只能是一句原因文案（字符串）或 true`);
}

/** 绘图预设用不了的那几个轴（引擎侧才有的闸门），写了要在构建期拦住而不是运行期静默。 */
function rejectEngineOnlyConditions(conditions, where, what) {
    const bad = ["mode", "armed", "placeholder"].filter((k) => conditions[k] !== undefined);
    if (bad.length) {
        throw new Error(
            `${where}: ${what} 的 conditions 用不了 ${bad.join(" / ")}（前端只按 topics 判适用性，` +
                `拿不到 MODES_PRESENT / ARMED_S；这三个轴是规则专用的）`,
        );
    }
}

function fmtApplicability(raw) {
    const parts = [];
    // conditions 的三个键（不限就整个省掉）：固件 / 机架 / 依赖的 topic
    if (raw.firmware !== "any") parts.push("固件 " + raw.firmware);
    if (raw.vehicle !== "any") parts.push("机架 " + listOr(raw.vehicle, ""));
    for (const cand of raw.topics ?? []) parts.push("需要 " + cand.join(" 或 "));
    for (const w of raw.precheck ?? []) parts.push("不跑当 " + w);
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
        const sevs = Array.isArray(t.severity) ? t.severity.join("/") : t.severity;
        const whens = Array.isArray(t.when) ? t.when.join(", ") : t.when || "True";
        const descs = Array.isArray(t.description) ? t.description.join(" / ") : t.description;
        const thr = t.evidence?.threshold;
        const thrs = Array.isArray(thr) ? thr.join(" / ") : thr;
        const bits = [`**${sevs}**`, `\`${whens}\``];
        if (thrs !== undefined && thrs !== null) bits.push(`threshold ${thrs}`);
        if (t.evidence?.unit) bits.push(`unit ${t.evidence.unit}`);
        bits.push(`description "${descs}"`);
        if (t.label) bits.push(`label=${t.label}`);
        lines.push("- " + bits.join(" | "));
    }
    return lines.join("\n") || "-";
}

function fmtOutputs(raw) {
    const outputs = raw.outputs || [];
    const bits = [];
    for (const o of outputs) {
        if (o.name) bits.push(`${o.name}=${o.value}`);
    }
    if (raw.tag) bits.push(`tag=${raw.tag}`);
    return bits.join(", ") || "-";
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
        body.push(`- 产出：${fmtOutputs(raw)}\n`);
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
            title: "现在规则清单",
            titleEn: "Rule catalogue",
            description: "全部检查经验的清单：各自读什么字段、什么条件触发、产出什么标签。",
            descriptionEn:
                "Every built-in check — the fields it reads, the condition that fires it, and the tags it emits.",
            order: 12,
        }) + `${CATALOGUE_INTRO.replace("{n}", String(rules.length))}\n\n---\n${renderCatalogue(rules, sources)}`
    );
}

// ---------- 算子目录：从 knowledge/engine/operators.py 的 @operator 装饰器与注释中提取 ----------
function parseOperatorSections(py) {
    const sections = [];
    const re = /^# [-]{3,}\s*(.+?)\s*[-]{3,}\s*$/gm;
    let m;
    while ((m = re.exec(py))) sections.push({ title: m[1].trim(), pos: m.index });
    const order = [];
    for (let i = 0; i < sections.length; i++) {
        const start = sections[i].pos;
        const end = i + 1 < sections.length ? sections[i + 1].pos : py.length;
        const block = py.slice(start, end);
        const names = [...block.matchAll(/@operator\(\s*"([a-z_0-9]+)"/g)].map((m2) => m2[1]);
        if (names.length > 0) order.push(...names);
    }
    const sectionOf = {};
    for (const s of sections) {
        const start = s.pos;
        const end = sections.indexOf(s) + 1 < sections.length ? sections[sections.indexOf(s) + 1].pos : py.length;
        const block = py.slice(start, end);
        const names = [...block.matchAll(/@operator\(\s*"([a-z_0-9]+)"/g)].map((m2) => m2[1]);
        for (const n of names) sectionOf[n] = s.title;
    }
    return { sections, order, sectionOf };
}

function operatorCatalog(py, sigs) {
    const { sectionOf, order } = parseOperatorSections(py);
    const grouped = {};
    const re = /@operator\(\s*"([a-z_0-9]+)"(\s*,\s*(default|inplace)\s*=\s*(True|False))?\)/g;
    let m;
    while ((m = re.exec(py))) {
        const name = m[1];
        if (!sigs[name]) continue;
        const sig = sigs[name];
        const sec = sectionOf[name] || "其他";
        if (!grouped[sec]) grouped[sec] = [];
        grouped[sec].push({ name, sig, default: m[3] === "default", inplace: m[4] === "True" });
    }
    const lines = [];
    for (const sec of Object.keys(grouped).sort((a, b) => {
        const ia = order.indexOf(grouped[a][0]?.name ?? "");
        const ib = order.indexOf(grouped[b][0]?.name ?? "");
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    })) {
        lines.push(`#### ${sec}`, "");
        lines.push("| 算子 | 输入 | 输出 | 说明 |");
        lines.push("|------|------|------|------|");
        for (const { name, sig } of grouped[sec]) {
            const ins = (sig.in_names ?? sig.in_display ?? []).map((n) => `\`${n}\``).join(" / ");
            const outs = (sig.out_names ?? sig.out_display ?? []).map((n) => `\`${n}\``).join(" / ");
            const desc = sig.desc ?? "";
            lines.push(`| \`${name}\` | ${ins || "—"} | ${outs || "—"} | ${desc} |`);
        }
        lines.push("");
    }
    return lines.join("\n");
}

function builtinTable(api) {
    const vars = api?.builtinVarDocs ?? {};
    const keys = Object.keys(vars);
    if (keys.length === 0) return "";
    // 单元格里出现 `|` 会撑破表格（`int|None` 这种类型就带一个），一律转义
    const cell = (s) => String(s).replace(/\|/g, "\\|");
    const lines = ["| 变量 | 类型 | 说明 |", "|------|------|------|"];
    for (const k of keys) {
        lines.push(`| \`${k}\` | ${cell(vars[k].type)} | ${cell(vars[k].doc)} |`);
    }
    return lines.join("\n") + "\n";
}

/** 规则 schema 参考页：字段/算子/内置变量完整参考，算子目录与内置变量表从 knowledge/engine/ 源码动态派生 */
function renderSchemaPage(catalogueCount, providerApi) {
    const CAT = `\`knowledge/engine/operators.py\` 与 \`knowledge/engine/providers/api.py\``;
    return (
        catalogueFrontmatter({
            title: "规则编写参考",
            titleEn: "Rule schema reference",
            description: "从必填字段到数据流表达式、触发条件与输出，附算子目录与常见坑。",
            descriptionEn:
                "Required fields, data-flow expressions, triggers and outputs — plus the operator catalogue and pitfalls.",
            order: 11,
        }) +
        `写一条经验的权威参考：字段级定义、数据流（\`compute\`）语义、触发与输出、内置变量、
算子目录，以及构建期会直接拒绝的写法。内部设计（动机、实施状态与已知缺口）见仓库里各族的
\`CLAUDE.md\`（\`knowledge/px4/\` 与 \`knowledge/ardupilot/\`）；现有规则清单：[规则目录](/guide/rule-catalogue)。

> **本页由构建期 \`build-knowledge.mjs\` 自动生成**：正文是模板（随代码规范变动时更新此处），
> 算子目录与内置变量表从 ${CAT} 动态派生。
> 单一事实源是各固件族的 \`knowledge/<族>/rules/*.yaml\`；改完算子或内置变量后重跑 \`pnpm build:kb\`（dev/build 自动执行）。

## 0. 一条经验怎么跑起来

\`\`\`
rules/<经验>.yaml        ──┐
facts.yaml（码表/文案/    ──┤ 构建期校验（字段/算子/表达式/文案、group 是否登记、
  展示口径/group 顺序）    ──┤  facts 键是否齐全、provider 有没有漏实现契约）
knowledge/engine/operators.py      ──┤                                    ── 产物内联进 Python
  ↓                         │                                         ↓
knowledge/engine/engine.py  ← ──┘                                  运行时只读产物
  └─ 逐行（\`next_rule()\`）跑检查经验                             （不读源 yaml）
     └─ \`provider.read_timeseries(...)\` 取原始浮点序列
        └─ 交给 \`compute\` 算子做流式计算
           └─ 计算结果进入模板 → 标签/分数/描述性文案
\`\`\`

## 1. 必需字段

| 字段 | 说明 |
|------|------|
| \`id\` | 唯一标识（字符串）。建议用描述性命名，如 \`navigator-consistency\`。 |
| \`group\` | 所属分组（字符串）。必须在 \`knowledge/px4/facts.yaml\` 的 \`group_order\` 里登记，否则引擎直接跳过。 |
| \`slot\` | 执行位置（字符串）。决定了这条经验在哪个阶段跑——不同阶段能读的原始数据不同，详见下一节。 |
| \`compute\` | 数据流表达式（**多行的 YAML 字符串块**，写法见 §3）。 |
| \`condition\` | 触发条件（字符串，Python 表达式）。\`True\` 表示总是触发。 |
| \`triggers\` | 需要哪些原始 Topic（列表）。引擎据此决定取哪些数据；[\`facts.yaml\` 的 topic 白名单](/knowledge/px4/facts#topic) 里找不到的 topic 不能用。 |

### 额外注意
- \`title\` / \`suggestion\` / \`value_text\`：Python \`str.format_map\` 模板占位符。\`{name}\` 引用 \`compute\` 里声明的名字或内置变量。用到的名跨两个 docstring 时—致即可；不—致的启动自检会报错。
- \`tags\`：**构建期检查**——每个值必须在 \`facts.yaml\` 的 \`tags\` 里登记并给出中英文文案。只有 \`severity\` 不算 tags（单独字段）。
- \`brief\` / \`detail\`：可选的结论分档说明，分别对应短和长的场景（比如界面卡片 vs 报告）。占位符同样来自 \`compute\` 输出；如果填了 \`detail\` 则建议把关键数值也放进去。
- \`display\`：前端展示选项。见继续下的「\`display\` 可设项」表格。

## 2. \`slot\`（执行位置）

不同 slot 可用的原始 Topic 和上下文不同。具体去 \`knowledge/engine/engine.py\` 找对应的 \`_run_slot_*\` 函数；该函数会列出哪些 provider 方法会在该阶段被调用，也就等于告诉你这段经验能读到什么数据。

SLOT 表见 YAML 构建产物或浏览器控制台——这里不手写。

## 3. \`compute\`（数据流表达式）

经验的数据流由一组管道组成，每个管道定义一个名字、一个算子与参数，输出一个值。多个管道可用——每条输出一个值，最后在 \`title\`/tags/\`suggestion\`/brief/detail 里用这个名引用。
**注意：目前只支持单管道（一个键值对）。**

### 3.1 写法

\`\`\`yaml
compute:
  <任意名字>:
    op: <算子名>
    ...   # 算子的参数
\`\`\`

- 名字是你自己起的（供后面的模板引用）。
- 算子名必须来自下面的算子目录；参数是固定的，写错了**构建期会直接报错**。
- 名字*开头*不要用 \`_\`——那是引擎保留的名字（如自动用的 \`_level_id\` 变换）。

### 3.2 上下文：哪些东西可以直接写进表达式

三个来源都能直接用（不需要在 \`compute\` 里声明）。声明计算的结果可以被后面引用。

**内置变量**：\`provider.builtin_variables()\` 返回的一切。当前实现的完整清单见 §6.1。

**槽位级上下文**：\`slot\` 决定了 provider 传进来的每个槽位级上下文子集，详见各自 Provider 的文档。

**自身形参**：算子的 \`inputs:\` 列表里的名字，引用写成表达式张量（\`_expr\`）格式。

### 3.3 类型：每一条表达式都是一个流

> 即同一 Topic 的一个 RollingWindow（滑动窗口）或历史全量，取决于算子参数。

所有算子都工作在时间序列上。输入是同一个 Topic 的一个窗口或历史全量，输出也是一个**窗口或全量结果**——不是单个标量。最后 \`title\`/\`suggestion\` 里通过模板（\`{avg:.1f}\`），引擎自动取最新值并格式化。

### 3.4 字段级参数

| 参数 | 说明 |
|------|------|
| \`topic\` | ULog 主题名，必需。 |
| \`field\` | 要读的字段名（单字段）。 |
| \`fields\` | 多字段输入时的字段名列表——例如差值算子 \`sub\`、检查一致的 \`consistency\`。 |
| \`fps\` | 想要的重采样率（Hz）。大多数 ULog 是乱拍点，不重采没法做逐点算。 |
| \`window\` | 窗口秒数。 |
| \`pick\` | 算子有多个输出时选哪一个（名字和算子 \`out_names\` 对得上才算通过）。 |
| \`pick_t\` | 跟 \`pick\` 类似但要的是「到达某阈值*过程中*\`pick\` 输出序列的百分比/时间」——如首次掉下 50\\% 的时刻；不支持混合类型输出。 |
| \`threshold\` | 用户手写的阈值（数值）。 |
| \`unit\` | 输出单位（字符串；必须跟 knowledge/engine/units.py 的规范名一致）。 |

## 4. 算子

内部实现与签名见 \`knowledge/engine/operators.py\`。

### 4.1 算子目录

` +
        operatorCatalog(operatorsPy, signatures) +
        `

## 5. triggers 与 outputs

### 5.1 \`triggers\`

- **数组**。每一项是一个 ULog Topic 名（字符串）。
- 列举需要哪些 Topic 的原始数据；引擎据此决定取哪些。
- Topic 必须在 \`facts.yaml\` 的 \`building-topics\` 或 ULog 格式内存块表里存在；构造不存在的 Topic 会导致构建失败。

### 5.2 \`outputs\`

类型：
- **\`tags\`（必填）**：字符串列表。每个值必须在 \`facts.yaml\` → \`tags\` 字典的键里出现（中文+英文文案）。
- **\`severity\`（可选）**：字符串 \`info\` / \`warning\` / \`error\` / \`critical\`。缺省 \`warning\`。
- **\`suggestion\`（推荐）**：诊断建议文案。模板占位符同样来自 \`compute\` 输出或内置变量。

## 6. 可用变量（内置 + 模板）

### 6.1 内置变量（直接引用，无需在 compute 声明）

` +
        builtinTable(providerApi) +
        `
框架另外往求值环境里注入**两个调用**，它们不是变量、也不在算子表里：

| 调用                            | 能写在哪             | 作用                                                                     |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| \`has_topic('TOPIC')\`          | \`compute\` / \`when\` | 这个 topic 在不在日志里                                                  |
| \`param('NAME', default=None)\` | **只有** \`compute\`  | 读飞控参数（查上面的 \`PARAMS\`）。缺这个参数就返回 \`default\`，不抛异常 |

\`param\` 只能在 \`compute\` 里取成变量再拿去 \`when\` 比——直接写
\`when: "param('ARMING_CHECK') == 0"\` 是**非法**的（\`when\` 的白名单只放行 \`has_topic\`）。
"没这个参数"与"参数等于 0"是两件事：前者要写 \`default\`，如 \`param('RNGFND_TYPE', 0.0)\`。

### 6.2 模板占位符

\`title\` / \`field\` / \`suggestion\` / \`value_text\` 都走 Python \`str.format_map\`，
因此可以写 \`{cpu_max:.0%}\`、\`{p99:.1f}\`、\`{names}\`。**只有声明过的名字（compute 输出、
内置变量、上下文变量）才能在模板里用**；没声明直接写 \`{xxx}\` 引擎会在启动自检时报错。

### 6.3 模板里的格式说明

Python \`str.format_map\` 支持的格式：

| 格式 | 示例 |
|------|------|
| 浮点精度 | \`{value:.2f}\` |
| 百分数 | \`{ratio:.1%}\` |
| 逗号分隔千位 | \`{number:,}\` |
| 科学计数 | \`{large:.2e}\` |
| 时间（秒→人类可读） | \`duration\`（引擎会转换） 或 \`{total_s:.1f}\` |
| 默认（repr） | \`{}\` |

## 7. \`compute\` 调试：日志与图

### 7.1 快速看日志

写 \`display: {log: true}\`，跑日志就能在浏览器控制台看到计算出的值。

### 7.2 画曲线图

写 \`display: {plots: ["avg"]}\`，引擎自动把每个阶段的曲线图写进 HTML。适合本地跑看形状。
格式／布局／多图配置见 \`knowledge/px4/plot/README.md\`。

## 8. 构建期拒绝的写法（常见坑）

| 问题 | 构建期报错 |
|------|-----------|
| \`group\` 未在 \`facts.yaml\` 的 \`group_order\` 里登记 | \`group『xxx』未登记\` |
| \`tags\` 值在 \`facts.yaml\` 的 tags 字典里找不到 | \`tag『xxx』不在 facts 里\` |
| \`trigger\` 用的 Topic 不在 \`facts.yaml\` 白名单里 | \`topic『xxx』不在允许列表里\` |
| 算子名拼写错误 | \`未知的算子名『xxx』\` |
| 算子参数缺失或多余 | \`缺少必填参数\` / \`有多余参数\` |
| \`compute\` 写了多管道（不止一个键值对） | \`每条经验只允许一个 compute 键值对\` |
| compute 名以 \`_\` 开头 | \`compute 名不能以 _ 开头——那是引擎保留名\` |
| 键名大小写错误（如 \`Title\` 写成 \`title\`） | \`不认识的键名『xxx』\` |

> **以上全部在 \`tools/ci/check_all.py\` 和 web 构建期（\`pnpm build\`）执行**。

## 9. \`display\` 可设项

| 键 | 类型 | 说明 |
|----|------|------|
| \`log\` | bool | 在浏览器或终端里打印计算中间结果 |
| \`plots\` | string[] | 输出线条的图列表（广播） |
| \`hidden\` | bool | 在界面上静默隐藏这条 |

更多关于图——\`knowledge/px4/plot/README.md\` 有 YAML 和图骨架。

## 10. 内部细节补充

### 10.1 表达式、占位符，还有 \`__builtins__\`

三种来源都能直接用（不需要在 \`compute\` 里声明）：
- **内置变量**：§6.1
- **槽位上下文**：各 \`slot\` 的上下文 dict
- **expr 内部变量**：算子 \`inputs\` 的列

占位符写法是 \`{name}\`，应用到 \`title\`、tags/\`suggestion\`、brief/detail 模板里。

**绕不过去的点**：模版里不要直接写 \`{__builtins__}\`——那是个很大的字典，用得好能切进引擎，用不好就会炸。构建期会直接拒绝模板里有 \`__builtins__\`。

### 10.2 图形的实现细节

- 图的 YAML 描述在 \`knowledge/px4/plot/*.yml\`
- 模板骨架在 \`knowledge/plot-template.yml\`
- 图的输出单位转换（\`unit=\`）在引擎侧做，前端只画线
- 图上的换算（\`compute\` 节点、\`unit=\`）一律在引擎侧做，前端只画——"前端不写数学"。

细节见 \`knowledge/px4/plot/README.md\`（骨架可抄 \`plot-template.yml\`）。
`
    );
}

const banner = `// ⚠️ 自动生成，请勿手改。源文件在 knowledge/（按固件族分目录）与 knowledge/engine/，改完跑 \`pnpm build:kb\`（dev/build 自动执行）。\n`;

// 整份构建按顺序写在一个函数里（`--watch` 要复用它重建）。下面这两个是**唯一**被深层函数读到的值：
// `signatures` 被 compileFieldOne / compilePreset 读，`operatorsPy` 被 renderSchemaPage 读。
// 它们必须声明在模块级而不是 build() 里——放进 build() 就成了函数的自由变量，运行时报
// "xxx is not defined"。新增这种跨层读取的值时，照这里的样子提上来。
let signatures;
let operatorsPy;

/**
 * 跑一次完整构建。写成函数是为了给 `--watch` 复用同一段逻辑：
 * 不能靠重新 import 本模块来重建——那样每改一次就多一层模块状态。
 */
function build() {
    operatorsPy = read(OPERATORS_PY);
    signatures = parseOperatorSignatures(operatorsPy);
    if (Object.keys(signatures).length === 0) throw new Error("operators.py 里没解析到任何算子签名");
    const enginePy = read(PY_ENGINE);

    // ---- 每一族各自编译一遍：规则 / 数据 / 故障库 / 单位表 ----
    // 四样东西都是**按 log_type 分开**的（见 FAMILIES 的注释）。产物里它们长成
    // `{log_type: ...}`，引擎按文件头认出格式后取下标（engine.py 的 _LOG_TYPE_KNOWLEDGE）。
    const rulesByLogType = {};
    const factsByLogType = {};
    const fieldUnitsByLogType = {};
    const kbByLogType = {};
    // 合并视图只给**跨族**的产物用（规则清单页、编辑器 schema、总数打印）
    const allRules = [];
    const allSources = {};
    const allVehicles = new Set(["unknown"]);
    const allGroups = new Set();
    const plotFilesByFamily = {};
    const plotsByLogType = {};

    for (const fam of FAMILIES) {
        // 1) 故障库：族里没有 fault-kb.yaml 就是**空库**（第三层检索可选），不是错误
        kbByLogType[fam.logType] = existsSync(fam.faultKbPath) ? parseFaultKb(read(fam.faultKbPath)) : [];

        // 2) facts.yaml 要在规则校验**之前**读：规则的 category / doc / 身份块默认值都在 rule_meta 里
        const facts = parseYaml(read(fam.factsPath));
        const vehicles = {
            // 简写 → 规范名（facts.yaml 里的人工数据）；合法名 = vehicle_types 的值 + unknown
            aliases: facts.vehicle_aliases ?? {},
            valid: new Set([...Object.values(facts.vehicle_types ?? {}).map(String), "unknown"]),
        };
        for (const v of vehicles.valid) allVehicles.add(String(v));
        const { rules, sources } = loadRules(fam.rulesDir, signatures, facts.rule_meta ?? {}, vehicles);
        // guards via triggers[].severity: guard, validated in loadRules already

        // 3) 绘图预设（plot/*.yml）—— 曲线与地图**同一套声明**。编译结果两处消费：
        //    · 曲线与布局 → plots.generated.ts（前端）
        //    · `container: map` 那一份 → facts.track（provider 在引擎侧取数、换算、抽稀）
        //    族里没有 plot/ 就是没有曲线声明（APM 目前如此）：**不报错**，产一份空的。
        const hasPlots = existsSync(fam.plotDir);
        const {
            plots,
            mapSpec,
            refs: plotRefs,
        } = hasPlots ? loadPresets(fam.plotDir, vehicles) : { plots: [], mapSpec: null, refs: [] };
        plotFilesByFamily[fam.key] = hasPlots
            ? readdirSync(fam.plotDir)
                  .filter((f) => f.endsWith(".yml"))
                  .sort()
            : [];
        facts.track = mapSpec ?? {};
        // 单位表：规则与预设里所有写了 `unit=` 的引用一起查（源单位在 meta/<tag>.json，见
        // resolveFieldUnits）。**没有 meta/ 目录的族不换算**（APM：单位声明在 FMTU 里、没核对过）
        const ruleRefs = rules.flatMap((r) =>
            (r.compute ?? []).flatMap((expr) => collectRefs(expr).map((x) => ({ where: r.id, ...x }))),
        );
        const fieldUnits = existsSync(fam.metaDir) ? resolveFieldUnits([...ruleRefs, ...plotRefs], fam.metaDir) : {};

        rulesByLogType[fam.logType] = rules;
        factsByLogType[fam.logType] = facts;
        fieldUnitsByLogType[fam.logType] = fieldUnits;
        allRules.push(...rules);
        Object.assign(allSources, sources);
        for (const g of facts.group_order ?? []) allGroups.add(g);

        // ---------------- facts.yaml 的形状校验（按族）----------------
        // 必填键分两类，这不是偷懒而是**各族的知识本来就不一样全**：
        //   · 通用（每族都要）：group_order / vehicle_types / rule_meta —— 引擎机制直接靠它们
        //     （group_order 决定执行顺序、rule_meta 给规则派生身份、vehicle_types 校验机架约束）
        //   · 格式专有（**给了才查形状**）：nav_state_* / ulog_msg_types / info_key_docs /
        //     sys_info_keys / log_levels 全是 PX4 的 ULog 码表，APM 一份都没有。
        //     一刀切必填的后果是"要么照抄一遍假码表、要么进不了产物"，两条路都是编造。
        for (const key of ["group_order", "vehicle_types", "rule_meta"]) {
            if (facts[key] === undefined) throw new Error(`knowledge/${fam.key}/facts.yaml 缺少 ${key}`);
        }
        if (facts.info_key_docs !== undefined) {
            for (const [k, v] of Object.entries(facts.info_key_docs)) {
                if (typeof v?.name !== "string" || typeof v?.desc !== "string") {
                    throw new Error(`knowledge/${fam.key}/facts.yaml 的 info_key_docs.${k} 必须是 {name, desc}`);
                }
            }
        }
        if (facts.ulog_msg_types !== undefined) {
            for (const t of facts.ulog_msg_types) {
                // 一条消息类型的单字母码是引擎按字节流统计出来的键，缺了就会静默少一行
                if (typeof t?.code !== "string" || t.code.length !== 1) {
                    throw new Error(
                        `knowledge/${fam.key}/facts.yaml 的 ulog_msg_types 每项都要有单字母 code：${JSON.stringify(t)}`,
                    );
                }
            }
        }
        // metrics：概览指标的展示清单（key/label/unit + 可选的兜底取数）
        const metricKeys = new Set();
        for (const m of facts.metrics ?? []) {
            if (!m?.key) throw new Error(`knowledge/${fam.key}/facts.yaml 的 metrics 每项都要有 key`);
            if (metricKeys.has(m.key)) throw new Error(`knowledge/${fam.key}/facts.yaml 的 metrics 键重复：${m.key}`);
            metricKeys.add(m.key);
            if (m.op !== undefined) {
                if (!signatures[m.op]) throw new Error(`metrics ${m.key} 引用了未注册的算子 ${m.op}`);
                if (!m.topic) throw new Error(`metrics ${m.key} 有 op 就必须给 topic`);
                if (m.field === undefined && m.fields === undefined) {
                    throw new Error(`metrics ${m.key} 有 op 就必须给 field/fields`);
                }
                if (m.pick !== undefined && !(signatures[m.op].out_names ?? []).includes(m.pick)) {
                    throw new Error(`metrics ${m.key} 的 pick=${m.pick} 不在 ${m.op} 的输出里`);
                }
            }
        }
        if (!Array.isArray(facts.group_order) || facts.group_order.length === 0) {
            throw new Error(`knowledge/${fam.key}/facts.yaml 的 group_order 不能为空`);
        }
        // 经验声明的 group 必须已登记在本族的 group_order 里——否则那条经验**永远不会被执行**
        // （引擎按 group_order 逐个 group 跑），且失败是静默的。宁可构建失败。
        const knownGroups = new Set(facts.group_order);
        for (const r of rules) {
            if (!knownGroups.has(r.group)) {
                throw new Error(
                    `规则 ${r.id} 的 group「${r.group}」未登记在 knowledge/${fam.key}/facts.yaml 的 group_order`,
                );
            }
        }
        // 曲线**按族**存（APM 没有 plot/ 就是空数组），但**适用性不看族**：
        // 一张图出不出由它自己的 `conditions.topics` 与这份日志的 manifest 决定，
        // 而 topic 名本身就是各格式的命名空间（vehicle_attitude 不会出现在 .bin 里）。
        plotsByLogType[fam.logType] = plots.map(({ order: _order, ...rest }) => rest);
    }

    if (Object.values(kbByLogType).every((x) => x.length === 0)) throw new Error("故障知识库解析为 0 条，终止");
    const outWorkers = resolve(webRoot, "workers");
    mkdirSync(outWorkers, { recursive: true });
    writeArtifact(
        resolve(outWorkers, "fault-kb.generated.json"),
        // 不写 generatedAt：时间戳会让产物每次构建都产生 diff（而它没有任何消费者），
        // 产物应当可复现 —— 同样的 knowledge/ 输入必须得到逐字节相同的输出。
        // entries 按 log_type 分组：引擎只取这一份日志那一族的条目。
        JSON.stringify({ entries: kbByLogType }, null, 2) + "\n",
    );
    // 单位词表在两边各有一份（构建期管"别名 → 规范名"，运行期管"规范名 → 换算因子"），
    // 规范名必须一模一样。各改各的会静默换算出错数，所以在这里比一次。
    {
        const pyUnits = enginePy.slice(enginePy.indexOf("_UNIT_FACTORS"));
        const names = [...pyUnits.matchAll(/^\s{4}"([a-z0-9]+)":\s*\(/gm)].map((m) => m[1]);
        const js = Object.keys(UNIT_KIND).map((x) => x.toLowerCase());
        const missing = js.filter((u) => !names.includes(u));
        const extra = names.filter((u) => !js.includes(u));
        if (missing.length || extra.length) {
            throw new Error(
                `knowledge/engine/engine.py 的 _UNIT_FACTORS 与 web/scripts/lib/rule-expr.mjs 的 UNIT_KIND 对不上` +
                    `（规则侧多：${missing.join(",") || "无"}；引擎侧多：${extra.join(",") || "无"}）`,
            );
        }
    }
    // （各族 facts.yaml 的形状校验与 group 登记检查在族循环里做完了——它们是按族的）
    // ---------------- provider 契约：构建期查"漏写" ----------------
    // 契约的事实源是 knowledge/engine/providers/api.py 的两张常量表。这里查每个适配器是否**定义了**
    // 契约要求的能力、builtin_variables() 的字典字面量键是否齐全。
    // 查不了运行时行为（类型、失败语义）——那两道在引擎的运行期自检与
    // tools/engine/guard-px4log-provider.py 里，三道合起来才是完整的一道关。
    const providerApi = parseProviderApi(read(PY_PROVIDER_API));
    for (const f of providerFiles) {
        const src = read(resolve(PROVIDER_DIR, f));
        const where = `knowledge/engine/providers/${f}`;
        if (!/^class\s+\w+/m.test(src)) throw new Error(`${where}: 里没有定义适配器类`);
        for (const name of providerApi.required) {
            const ok =
                name === "log_type" ? /^\s+log_type\s*=/m.test(src) : new RegExp(`^\\s+def ${name}\\(`, "m").test(src);
            if (!ok) {
                throw new Error(
                    `${where}: 缺少契约要求的能力 ${name}（见 knowledge/engine/providers/api.py 的 REQUIRED）`,
                );
            }
        }
        // builtin_variables() 必须给出契约里列的每一个内置变量——少一个，引用它的规则会**静默**算不出数据
        const body = src.slice(src.indexOf("def builtin_variables("));
        const cut = body.indexOf("\n    def ", 10);
        const sem = cut === -1 ? body : body.slice(0, cut);
        for (const key of providerApi.builtinVariables) {
            if (!sem.includes(`"${key}"`)) {
                throw new Error(`${where}: builtin_variables() 缺少内置变量 ${key}（见 api.py 的 BUILTIN_VARIABLES）`);
            }
        }
    }
    // 拼接顺序即执行顺序：算子注册表 → provider 契约 → 各格式适配器 → 框架 → 数据层
    const pyWithOperators = [
        operatorsPy,
        read(PY_PROVIDER_API),
        ...providerFiles.map((f) => read(resolve(PROVIDER_DIR, f))),
        enginePy,
    ].join("\n");

    // 四个占位符在拼接后的 Python 里**必须恰好出现一次**。
    // 产物用的是 JS 的 `.replace()`——**只换第一处**：多出来的那一处（往往只是某段注释里提了一句
    // `__FACTS__`）会把真正的赋值挡在替换范围之外，浏览器里报 `NameError: name '__FACTS__' is not
    // defined`、整份日志都解析不了；而本地回归与 Python 的 `str.replace` 都是全换 → 本地全绿、线上打不开。
    // 2026-09-17 就是这么挂的（provider 注释里提到占位符），所以这里按"恰好一次"卡住，不按"存在"。
    for (const ph of ["__FAULT_KB__", "__RULES__", "__FACTS__", "__FIELD_UNITS__"]) {
        const n = pyWithOperators.split(ph).length - 1;
        if (n === 0) throw new Error(`knowledge/engine/ 里必须保留 ${ph} 占位符（见 engine.py）`);
        if (n > 1) {
            throw new Error(
                `${ph} 在拼接后的 Python 里出现了 ${n} 次，必须恰好 1 次：` +
                    "产物的 .replace() 只换第一处，多出来的那处会让真正的赋值留在原地、浏览器直接报 NameError。" +
                    "把注释里提到它的地方改个说法即可。",
            );
        }
    }
    writeArtifact(
        resolve(outWorkers, "analysis-engine.generated.ts"),
        banner +
            'import faultKbJson from "./fault-kb.generated.json";\n\n' +
            // 四样知识**都按 log_type 分组**：引擎按文件头认出格式后取自己那一套
            // （见 engine.py 的 _LOG_TYPE_KNOWLEDGE）。名字不换，形状从"一份"变成"按族一份"。
            "const rules = " +
            JSON.stringify(rulesByLogType) +
            ";\n" +
            // facts 也必须在此声明：下面的 .replace 链在模块加载时求值，缺声明就是 ReferenceError
            "const facts = " +
            JSON.stringify(factsByLogType) +
            ";\n\n" +
            // 字段单位表：只含写了 unit= 的引用涉及的字段；本地回归脚本也从这一行取（与 rules 同款）
            "const fieldUnits = " +
            JSON.stringify(fieldUnitsByLogType) +
            ";\n\n" +
            "export const PY_ULG_ENGINE = String.raw`" +
            toRawTemplate(pyWithOperators) +
            "`\n" +
            '  .replace("__FAULT_KB__", JSON.stringify(faultKbJson.entries))\n' +
            '  .replace("__RULES__", JSON.stringify(rules))\n' +
            '  .replace("__FACTS__", JSON.stringify(facts))\n' +
            '  .replace("__FIELD_UNITS__", JSON.stringify(fieldUnits));\n',
    );

    // 3) LLM 提示词与空结论文案（边缘函数是 .js，直接生成 ESM）
    const prompt = read(PROMPT_PATH).replace(/\s+$/, "\n");
    const emptyMd = read(EMPTY_PATH).trim();
    const outLib = resolve(webRoot, "lib/knowledge");
    mkdirSync(outLib, { recursive: true });
    writeArtifact(
        resolve(outLib, "prompts.generated.js"),
        "// ⚠️ 自动生成，源：knowledge/llm/。请勿手改。\n" +
            "export const GJB841_SYSTEM_PROMPT = " +
            JSON.stringify(prompt) +
            ";\n" +
            "export const EMPTY_FINDINGS_MARKDOWN = " +
            JSON.stringify(emptyMd) +
            ";\n",
    );

    // 4.5) 绘图预设 → web/lib/knowledge/plots.generated.ts
    // 与引擎产物不同，这一份是**纯前端**渲染用（不进 Pyodide），所以单独生成一个 ESM 文件。
    // 内容已在上面编译并校验过（loadPresets）：这里只负责写出来。
    // **按 log_type 分组**（与 rules / facts 同款）：没有 plot/ 的族给空数组，
    // 而不是拿别人的图来凑——那会在 APM 日志上画出 PX4 的曲线。
    writeArtifact(
        resolve(webRoot, "lib/knowledge/plots.generated.ts"),
        banner +
            "// 源：knowledge/<族>/plot/*.yml（改图请改那边）\n" +
            "export const PLOT_PRESETS = " +
            JSON.stringify(plotsByLogType, null, 2) +
            " as const;\n",
    );

    // 4.6) 派生数据版本：**内容哈希**，不是手写常量——改了数据层就会出现新值，
    //      浏览器据此判断"这份存档的 info/曲线/轨迹是不是旧引擎生成的"，是就重解析一次。
    //      覆盖范围只放"决定派生数据形状"的源：data 层 Python、事实层 Python、facts.yaml、曲线预设；
    //      规则（rules/*.yaml）不在其内——那影响的是结论文本，不该因为改个阈值就让所有历史重算。
    //      engine.py 在列：它产出的 facts / findings **同样随报告一起归档**，口径一变
    //      （如 2026-09-16 那次软件版本串）老存档也得跟着刷一次，否则只能靠用户重新上传。
    const versionSources = [
        ["knowledge/engine/engine.py", PY_ENGINE],
        ["knowledge/engine/providers/api.py", PY_PROVIDER_API],
        ...providerFiles.map((f) => [`knowledge/engine/providers/${f}`, resolve(PROVIDER_DIR, f)]),
        // **每一族**的 facts.yaml 与曲线预设都在内：派生数据的形状是各族各一份的
        ...FAMILIES.flatMap((fam) => [
            [`knowledge/${fam.key}/facts.yaml`, fam.factsPath],
            ...plotFilesByFamily[fam.key].map((f) => [`knowledge/${fam.key}/plot/${f}`, resolve(fam.plotDir, f)]),
        ]),
    ];
    const derivedVersion = createHash("sha256");
    for (const [label, file] of versionSources) {
        derivedVersion.update(label).update("\0").update(read(file)).update("\0");
    }
    const derivedVersionHex = derivedVersion.digest("hex").slice(0, 12);
    writeArtifact(
        resolve(webRoot, "lib/knowledge/derived-version.generated.ts"),
        banner +
            "// 源：knowledge/engine/engine.py + knowledge/engine/providers/*.py + " +
            "knowledge/<族>/{facts.yaml,plot/*.yml} 的内容哈希\n" +
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
    writeArtifact(
        resolve(webRoot, "public/params/px4-main.json"),
        JSON.stringify({
            source: "PX4 参数元数据（main 分支快照；release tag 不产出 parameters.json）",
            count: Object.keys(paramCompact).length,
            params: paramCompact,
        }) + "\n",
    );

    // 4.8) rules/*.yaml 的**编辑器 schema**（yaml-language-server 消费，配 .vscode/settings.json）
    //      词表全部从 facts.yaml / knowledge/engine/ 派生（见 lib/gen-rule-schema.mjs）——手抄一份就多一个
    //      真源：改了 facts.yaml 而这里没跟上时，IDE 会拿旧词表去纠正新写法，比没提示更糟。
    //      与别的产物一样走 writeArtifact：`--check` 会比对它与源是否一致。
    writeArtifact(
        // 落在 knowledge/ 根（不是族目录）：它是「规则的形状」，与固件族无关；
        // 顺带不再污染 px4/ —— 「产物落在源目录里」那条历史尾巴就此了结。
        // 词表取**各族的并集**（group / 机型名各族不同）：schema 只做提示，漏提示无所谓、
        // 错提示会让人改错，所以宁宽。真正拦人的判据在各族 facts.yaml 的构建期校验里。
        resolve(KN_ROOT, "rules-editor-schema.generated.json"),
        JSON.stringify(
            buildRuleSchema({
                signatures,
                // 排序只为产物可复现（Set 的迭代顺序取决于插入顺序，各族顺序一变就 diff）
                facts: { group_order: [...allGroups].sort(), vehicle_types: {} },
                vehicles: { aliases: {}, valid: allVehicles },
                builtinVars: BUILTIN_VARS,
            }),
            null,
            2,
        ) + "\n",
    );

    // 5) 指南的「开发指南」分组：规则清单 + 规则编写参考（改规则/算子/内置变量后自动跟上，不用谁记得手动同步）
    if (!CHECK) {
        mkdirSync(GUIDES_DIR, { recursive: true });
        // 规则清单是**跨族**的（各族规则混在一起按 group 展示），所以传合并后的那一份
        writeFileSync(resolve(GUIDES_DIR, "rule-catalogue.mdx"), renderCataloguePage(allRules, allSources), "utf8");
        writeFileSync(resolve(GUIDES_DIR, "rule-schema.mdx"), renderSchemaPage(allRules.length, providerApi), "utf8");
    }

    if (CHECK) {
        if (drifted.length > 0) {
            console.error("FAIL 以下产物与 knowledge/ 不一致，重跑 pnpm build:kb");
            for (const d of drifted) console.error(`  · ${d}`);
            process.exitCode = 1;
        } else {
            console.log("OK 全部产物与 knowledge/ 一致");
        }
    } else {
        const kbTotal = Object.values(kbByLogType).reduce((n, x) => n + x.length, 0);
        const perFamily = FAMILIES.map((f) => `${f.key} ${rulesByLogType[f.logType].length}`).join(" + ");
        console.log(
            `knowledge built: ${kbTotal} fault entries, ${allRules.length} rules（${perFamily}）, ` +
                `${Object.keys(signatures).length} operators; ` +
                "ulog-check-script.ts, prompts.generated.js",
        );
        console.log("guide built: rule-catalogue.md, rule-schema.md");
    }
}

// --check 与 --watch 互斥：前者只比对不写盘，后者靠写盘驱动 Next 热更新
if (CHECK && process.argv.includes("--watch")) {
    throw new Error("--check 只比对不写盘，与 --watch 无意义：两者不要同时用");
}

if (!process.argv.includes("--watch")) {
    build();
} else {
    // 监听**真源**目录。这里只列真源所在的子目录，不监听 ENGINE / KN 的顶层——
    // 顶层有真源文件（facts.yaml / fault-kb.yaml）也有产物，监听顶层会让「写产物」
    // 触发「再构建」，自己喂自己、无限重建（所以回调里还要按名字滤掉 *.generated.*）。
    // 注：`rules-editor-schema.generated.json` 2026-09 已挪出族目录，现在写在
    // knowledge/ 根；KN_ROOT 不在监听表里，这一路不会再自触发。
    // **每一族**的规则 / 曲线 / 元数据目录都要监听（APM 改规则也得触发重建）
    const WATCH_DIRS = [
        ...FAMILIES.flatMap((f) => [f.rulesDir, f.plotDir, f.metaDir]).filter((d) => existsSync(d)),
        LLM_DIR,
        resolve(ENGINE, "providers"),
        resolve(webRoot, "scripts/lib"), // 算子签名校验、规则表达式、schema 生成器
    ];
    // 真源是"文件"而不是"目录"的那几个（facts.yaml / fault-kb.yaml / *.py 顶层）
    // 只能靠监听父目录拿到事件，所以在回调里按名字过滤掉产物。
    const WATCH_DIR_LOOSE = [...FAMILIES.map((f) => f.dir), ENGINE];
    const GENERATED_IN_SOURCE = /\.generated\.(json|ts|js)$/;

    let timer = null;
    let running = false;
    let dirty = false;
    const rebuild = () => {
        if (running) {
            dirty = true; // 构建期间又变了：这次跑完再补一次，别丢变更
            return;
        }
        running = true;
        try {
            build();
        } catch (err) {
            // 写 YAML 到一半必然语法错。挂着继续挂着，改对了下一次变更会重建。
            console.error(`[kb] 构建失败：${err.message}`);
        } finally {
            running = false;
        }
        if (dirty) {
            dirty = false;
            rebuild();
        }
    };
    const schedule = (dir) => (_event, filename) => {
        // 顶层目录里的产物改名/写入会一路走到这里，必须拦掉，否则就是自触发死循环
        if (dir && filename && GENERATED_IN_SOURCE.test(String(filename))) return;
        // 编辑器保存与「先清后拷」的 sync-content 都会在毫秒内连发多次事件，防抖到 200ms
        clearTimeout(timer);
        timer = setTimeout(rebuild, 200);
    };
    for (const d of WATCH_DIRS) watch(d, { recursive: true }, schedule(d));
    for (const d of WATCH_DIR_LOOSE) watch(d, { recursive: true }, schedule(d));
    console.log("watching " + [...WATCH_DIRS, ...WATCH_DIR_LOOSE].map((d) => relative(webRoot, d)).join(" ") + " …");
    build();
}
