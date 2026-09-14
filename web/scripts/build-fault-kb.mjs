/**
 * 构建脚本：把工程师维护的故障知识库 YAML 转成脚本可内联的 JSON。
 *
 * 单一数据源是 engine/src/nextpilot_engine/rules/px4-fault-kb.yaml（工程师编辑它），
 * 本脚本生成 workers/fault-kb.generated.json，ulog-check-script.ts 内联进 Pyodide。
 *
 * 用法（在 web/ 下）：
 *   node scripts/build-fault-kb.mjs
 * 或   pnpm build:kb
 *
 * 不引入额外依赖：用极简 YAML 解析（知识库结构固定）。为稳妥起见优先尝试仓库
 * 已安装的 yaml 包，否则走内置解析。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const YAML_PATH = resolve(webRoot, "../engine/src/nextpilot_engine/rules/px4-fault-kb.yaml");
const OUT_PATH = resolve(webRoot, "workers/fault-kb.generated.json");

/**
 * 极简 YAML 解析：只支持本知识库用到的子集（顶层 key、列表、标量、引号数组、注释）。
 * 结构固定，出错直接抛异常，宁可构建失败也不静默产出错误 KB。
 */
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

    // 新条目  - fault_id: F001
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

    // 列表续项      - xxx
    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && listKey && indent >= 6) {
      item[listKey].push(scalar(listItem[1]));
      continue;
    }

    // key: value（顶层字段）
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

  // 校验
  for (const it of kb) {
    for (const req of ["fault_id", "fault_tag", "trigger_tags", "flight_phase", "risk_level"]) {
      if (it[req] === "" || (Array.isArray(it[req]) && it[req].length === 0 && req !== "fault_tag")) {
        throw new Error(`故障库条目 ${it.fault_id || "?"} 缺少字段 ${req}`);
      }
    }
  }
  return kb;
}

const yamlText = readFileSync(YAML_PATH, "utf8");
const kb = parseFaultKb(yamlText);
if (kb.length === 0) throw new Error("故障知识库解析为 0 条，终止");

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(
  OUT_PATH,
  JSON.stringify({ generatedAt: new Date().toISOString(), entries: kb }, null, 2) + "\n",
  "utf8",
);
console.log(`fault KB: ${kb.length} entries -> ${OUT_PATH.replace(webRoot + "/", "")}`);
