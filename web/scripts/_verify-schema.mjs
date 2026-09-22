// 一次性验证：生成的编辑器 schema 会不会**误报**现有规则（additionalProperties: false 最容易踩）。
// 不引入 ajv，只断言这份 schema 里会引发"假红"的那几类（键名白名单、枚举、必填、anyOf 分支）。
import { parse } from "yaml";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const KN = resolve(here, "../../knowledge/px4"); // 本脚本在 web/scripts/ 下：上两级才是仓库根
const schema = JSON.parse(readFileSync(resolve(KN, "rules-editor-schema.generated.json"), "utf8"));
const props = schema.properties;

const problems = [];
let rules = 0;
let files = 0;

const bad = (where, msg) => problems.push(`${where}: ${msg}`);
// enum 只给"构建期本来就强制校验"的字段；没设 enum 的字段不做取值断言
const inEnum = (p, v) => !p?.enum || p.enum.includes(v);

for (const f of readdirSync(resolve(KN, "rules"))
    .filter((x) => x.endsWith(".yaml"))
    .sort()) {
    files++;
    const doc = parse(readFileSync(resolve(KN, "rules", f), "utf8"));
    for (const r of Array.isArray(doc) ? doc : [doc]) {
        rules++;
        const where = `${f}#${r?.id ?? "?"}`;

        for (const k of Object.keys(r ?? {})) {
            if (!(k in props)) bad(where, `顶层键「${k}」不在 schema 里 → 会被 IDE 判非法`);
        }
        for (const k of schema.required) {
            if (r?.[k] === undefined || r[k] === null || r[k] === "") bad(where, `缺必填「${k}」`);
        }
        if (r?.group !== undefined && !props.group.enum.includes(r.group)) {
            bad(where, `group「${r.group}」不在 enum`);
        }
        if (r?.category !== undefined && !inEnum(props.category, r.category)) {
            bad(where, `category「${r.category}」不在 enum`);
        }

        if (r?.conditions) {
            for (const k of Object.keys(r.conditions)) {
                if (!(k in props.conditions.properties)) bad(where, `conditions.${k} 不在 schema 里`);
            }
            const af = r.conditions.airframe;
            if (af !== undefined) {
                const list = Array.isArray(af) ? af : [af];
                for (const v of list) {
                    if (!props.conditions.properties.airframe.oneOf[0].enum.includes(v)) {
                        bad(where, `airframe「${v}」不在 enum`);
                    }
                }
            }
        }

        if (r?.outputs) {
            for (const k of Object.keys(r.outputs)) {
                if (!(k in props.outputs.properties)) bad(where, `outputs.${k} 不在 schema 里`);
            }
            if (r.outputs.check !== undefined && !inEnum(props.outputs.properties.check, r.outputs.check)) {
                bad(where, `outputs.check「${r.outputs.check}」不在 enum`);
            }
        }

        for (const t of r?.triggers ?? []) {
            for (const k of Object.keys(t)) {
                if (!(k in props.triggers.items.properties)) bad(where, `trigger 键「${k}」不在 schema 里`);
            }
            for (const k of props.triggers.items.required) {
                if (t[k] === undefined) bad(where, `trigger 缺必填「${k}」`);
            }
            if (t.severity !== undefined && !props.triggers.items.properties.severity.enum.includes(t.severity)) {
                bad(where, `severity「${t.severity}」不在 enum`);
            }
        }

        // anyOf 至少要命中一个分支，否则整条规则飘红
        const branchA = Boolean(r?.compute) && Boolean(r?.triggers);
        const branchB = Boolean(r?.outputs?.guard_tags);
        if (!branchA && !branchB) bad(where, "anyOf 两个分支都没命中（既非普通经验也非 guard）");
    }
}

const lines = [
    `检查 ${files} 个文件 / ${rules} 条经验`,
    ...(problems.length ? problems : ["OK 现有规则全部符合 schema（无误报）"]),
];
console.log(lines.join("\n"));
