/**
 * `rules/*.yaml` 的**编辑器用 JSON Schema**（给 yaml-language-server 消费）。
 *
 * 为什么要有它：规则的键名、`group` / `airframe` / `severity` 词表都不是随手写的字符串，
 * 拼错要等 `pnpm build:kb` 才报。给编辑器一份 schema，敲键名就有补全、写错当场飘红。
 *
 * ⚠ **这份 schema 是生成出来的，不是手写的** —— 词表全部从 `facts.yaml`、
 * `engine/operators.py`、`engine/providers/api.py` 派生（由 build-knowledge.mjs 调用）。
 * 手抄一份词表等于立刻造出第二份真源：改了 `facts.yaml` 而这里没跟上时，IDE 会**拿着旧
 * 词表去纠正新写法**，那种错误比没有提示更糟。所以它跟其它产物一样走 `writeArtifact`，
 * `--check` 会比对它是否与源一致。
 *
 * 它**不替代**构建期校验，只是把"纯形状"的那部分提前到打字时：
 *   · 能抓：键名拼错（`additionalProperties: false`）、枚举值不在词表里、类型写错
 *   · 抓不了：`compute` 表达式内部的语法 / 算子 / 字段 —— 那些在**字符串里**，
 *     JSON Schema 只看得到"这是个字符串"，仍然只有 `rule-expr.mjs` 查得到
 *
 *
 * ⚠ **enum 只给「构建期本来就强制校验」的词表**（group / severity / airframe）。
 * 反过来——schema 比构建期更严——会在**合法写法**上飘红，而假红比没有提示更糟：
 * 作者会以为自己写错了，去改一个本来对的值。`category` 与 `outputs.check` 就是活例子：
 * 构建期允许它们偏离派生值（px4-cpu-load 的 check 是 `cpu_load` ≠ group `cpu`），
 * 所以这两处只能给 `examples` 提示，不能给 enum。
 *
 * 不依赖任何第三方包（构建脚本只用 Node 内置 + yaml）。
 */
import { SEVERITIES, UNIT_ALIASES } from "./rule-expr.mjs";

/** 排序后去重：产物必须可复现（同样的输入 → 逐字节相同的输出），别依赖对象遍历顺序 */
const uniqSorted = (xs) => [...new Set(xs)].filter((x) => typeof x === "string" && x).sort();

const FW_PATTERN = "^(any|\\s*(>=|<=|==|>|<)?\\s*\\d+(\\.\\d+)?(\\s*,\\s*(>=|<=|==|>|<)?\\s*\\d+(\\.\\d+)?\\s*)*)$";

/** `conditions.topics` 的一项：`vehicle_status` ｜ `vehicle_gps_position || sensor_gps` */
const TOPICS_ITEM_PATTERN = "^[a-z][a-z0-9_]*(\\s*\\|\\|\\s*[a-z][a-z0-9_]*)*$";

/** guard 标签名（与 build-knowledge.mjs 里那处 `/^[a-z0-9_:]+$/i` 同一口径） */
const TAG_PATTERN = "^[a-zA-Z0-9_:]+$";

/**
 * @param {object} args
 * @param {object} args.signatures  算子签名表（`parseOperatorSignatures` 的产物）
 * @param {object} args.facts       facts.yaml 解析结果
 * @param {object} args.airframes   { aliases, valid }（规范名来自 facts.yaml 的 vehicle_types）
 * @param {Set<string>} args.builtinVars  表达式能直接引用的内置变量名
 * @returns {object} JSON Schema（draft-07）
 */
export function buildRuleSchema({ signatures, facts, airframes, builtinVars }) {
    const groupOrder = Array.isArray(facts.group_order) ? facts.group_order.slice() : [];
    const byGroup = facts.rule_meta?.by_group ?? {};
    const categories = uniqSorted(Object.values(byGroup).map((g) => g?.category));
    // 机架合法值 = 规范名（含 unknown）+ 简写（mc / fw）+ any
    const airframesAll = uniqSorted([...(airframes.valid ?? []), ...Object.keys(airframes.aliases ?? {}), "any"]);

    const computeDesc = [
        "取值表达式：自上而下求值，输出的名字供后面与 triggers 引用。",
        "写法是 Python 的一个真子集（完整语法见 /guide/rule-schema）：",
        "  a, b = f(x, kw=1) / pct = frac * 100 / x if c else y / a and b / not a",
        '字段引用：topic.field（裸写）或 ref("topic[:].field", alias="x", unit="deg")；',
        '  ref("新名", "旧名") 是候选组，运行期取第一个存在的。',
        "⚠ 表达式**内部**（算子名、字段是否存在、单位换算）JSON Schema 查不了，由构建期校验。",
    ].join("\n");

    return {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "PX4 检查经验（knowledge/px4/rules/*.yaml）",
        description:
            "⚠ 自动生成，请勿手改 —— 源：facts.yaml / engine/operators.py / engine/providers/api.py。" +
            "改完跑 `cd web && pnpm build:kb`。\n" +
            "字段级权威参考见站内 /guide/rule-schema；可抄的骨架见 knowledge/px4/rules-template.yml。",
        type: "object",
        // 身份三件套是所有经验都必填的
        required: ["id", "group", "name"],
        // 关掉它是这份 schema 最大的收益之一：键名拼错会当场飘红，而不是等构建
        additionalProperties: false,
        properties: {
            id: { type: "string", description: "finding.ruleId，全局唯一；故障库与报告都引用它" },
            name: { type: "string", description: "报告里显示的名字" },
            group: {
                type: "string",
                enum: groupOrder,
                description:
                    "执行分组，决定执行顺序与 finding 编号。必须已登记在 facts.yaml 的 group_order 与 rule_meta.by_group",
            },
            order: { type: "integer", description: "同 group 内的次序（缺省 100000，再按 id 兜底）" },
            // **构建期不强制** category 的取值（它只强制"同 group 派生出来的一致"），
            // 所以这里也不设 enum —— schema 一旦比构建期更严，就会在合法写法上飘红。
            // 下面这条判据对所有词表都成立：**enum 只给构建期本身就强制校验的那些**。
            category: {
                type: "string",
                examples: categories,
                description:
                    "分类（UI 分组用）。缺省从 facts.yaml 的 rule_meta.by_group 按 group 派生；" +
                    "要写新取值请先在 facts.yaml 登记（schema 会跟着更新）",
            },
            version: { type: "string", description: "经验自身版本" },
            status: { type: "string" },
            license: { type: "string" },
            author: { type: "object", additionalProperties: true },
            doc: { type: "string", description: "官方文档链接 → finding.docUrl。缺省按 group 从 rule_meta 派生" },
            conditions: {
                type: "object",
                description: "适用范围，整块可省（省 = 什么都适用）。任一键不满足都会记一条 skipped 并带自动文案",
                additionalProperties: false,
                properties: {
                    firmware: {
                        type: "string",
                        pattern: FW_PATTERN,
                        examples: ["any", ">=1.15", "<1.15", ">=1.14,<1.15"],
                        description: '固件：any（缺省）/ ">=1.15" / "<1.15" / ">=1.14,<1.15"（逗号 = 与）',
                    },
                    airframe: {
                        description: "机架：any（缺省）/ 机架名 / 机架名列表。简写 mc、fw 也认",
                        oneOf: [
                            { type: "string", enum: airframesAll },
                            { type: "array", items: { type: "string", enum: airframesAll } },
                        ],
                    },
                    topics: {
                        type: "array",
                        items: { type: "string", pattern: TOPICS_ITEM_PATTERN },
                        description:
                            "数据依赖：日志里得有这些 topic，缺了记一条 skipped。项内 `||` = 任意一个在就够，项间 = 都要有",
                    },
                    precheck: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "先决条件：命中任意一条就不跑本条。在 compute **之前**求值 → 只认内置变量与 has_topic()",
                    },
                },
            },
            ran_when: { type: "string", description: "算出来了、但还不算「跑过」时的条件（如机动段样本不足）" },
            compute: {
                type: "array",
                items: { type: "string", description: computeDesc },
                description: "取值：一串表达式，自上而下求值。guard 类经验不写这一项",
            },
            outputs: {
                type: "object",
                additionalProperties: false,
                properties: {
                    // 同样**不设 enum**：缺省是 group，但允许显式例外（px4-cpu-load 的 check 就是
                    // `cpu_load` ≠ group `cpu`，构建期只打印一句提示、不拦）。设 enum 会当场假红
                    check: {
                        type: "string",
                        examples: groupOrder,
                        description: "ran / skipped 用的 check 名；缺省 = group，写别的就是显式例外",
                    },
                    tag: {
                        type: ["string", "null"],
                        description: "喂故障库匹配的异常标签（trigger 没写 tag 时回退到它）",
                    },
                    stats: {
                        type: "object",
                        description: "写进报告「关键数据」的统计。键是展示名，var 是 compute 里的变量名",
                        additionalProperties: {
                            type: "object",
                            required: ["var"],
                            additionalProperties: false,
                            properties: {
                                var: { type: "string" },
                                round: { type: "integer" },
                            },
                        },
                    },
                    guard_tags: {
                        type: "array",
                        description: "条件性数据质量标签：不依赖是否发出 finding，算出来就带上",
                        items: {
                            type: "object",
                            required: ["when", "tag"],
                            additionalProperties: false,
                            properties: {
                                when: { type: "string" },
                                tag: { type: "string", pattern: TAG_PATTERN },
                            },
                        },
                    },
                },
            },
            triggers: {
                type: "array",
                description: "判定：自上而下，命中第一条即发一条 finding",
                items: {
                    type: "object",
                    required: ["when", "severity", "title", "field"],
                    additionalProperties: false,
                    properties: {
                        when: { type: "string", description: "触发条件表达式（与 compute 同一套语法）" },
                        severity: { type: "string", enum: uniqSorted([...SEVERITIES]) },
                        title: { type: "string", description: "结论标题，可用 {变量} 占位" },
                        field: { type: "string", description: "证据字段（evidence.field）" },
                        value: { type: "string", description: '证据值，表达式（f-string 管格式化），如 f"{n:.3f}"' },
                        threshold: { type: ["number", "string"], description: "阈值（evidence.threshold）" },
                        unit: { type: "string", description: "单位（evidence.unit）" },
                        tag: {
                            type: ["string", "null"],
                            description: "本条 finding 的标签（缺省 = outputs.tag；写 null = 不产标签）",
                        },
                        suggestion: { type: "string", description: "结论建议，也可用 {变量} 占位" },
                        evidence_extra: {
                            type: "object",
                            description: "额外证据：{evidence 键: 变量名}",
                            additionalProperties: true,
                        },
                    },
                },
            },
            foreach: {
                description: "事件类经验：一次事件一条 finding。compute 里用事件算子产出列表，再按它展开",
                oneOf: [
                    { type: "string", description: "事件列表的变量名" },
                    {
                        type: "object",
                        required: ["var"],
                        additionalProperties: false,
                        properties: {
                            var: { type: "string", description: "事件列表的变量名（必须是 compute 的输出）" },
                            keys: {
                                type: "array",
                                items: { type: "string" },
                                description: "事件 dict 的键（如 t_s / name），供构建期校验占位符",
                            },
                        },
                    },
                ],
            },
        },
        // guard 类经验只打数据质量标签、不发 finding，因此没有 compute / triggers。
        // 两个分支各说各的形态，比"全可省"更能提示漏写了什么
        anyOf: [
            { required: ["compute", "triggers"], title: "普通经验：要取值也要判定" },
            {
                required: ["outputs"],
                title: "guard 类经验：只打数据质量标签，不发 finding",
                properties: { outputs: { required: ["guard_tags"] } },
            },
        ],
        // 机器可读的派生词表（`x-` 前缀是 JSON Schema 允许的自定义字段）。
        // 编辑器不消费，但脚本与其它工具可以查，省得再去解析 engine/ 源码
        "x-operators": uniqSorted(Object.keys(signatures ?? {})),
        "x-units": uniqSorted(Object.keys(UNIT_ALIASES)),
        "x-builtin-vars": uniqSorted([...(builtinVars ?? [])]),
    };
}
