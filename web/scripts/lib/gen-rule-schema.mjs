/**
 * `rules/*.yaml` 的编辑器用 JSON Schema（给 yaml-language-server 消费）。
 *
 * 生成而非手写：词表全部从 `facts.yaml`、`knowledge/engine/operators.py`、
 * `knowledge/engine/providers/api.py` 派生（由 build-knowledge.mjs 调用）。手抄等于造第二份真源，
 * 源改了这里没跟上时 IDE 会拿旧词表纠正新写法。与其它产物一样走 `writeArtifact`，`--check` 比对。
 * 只把"纯形状"提前到打字时：能抓键名拼错（`additionalProperties: false`）、枚举值不在词表里、
 * 类型写错；抓不了 `compute` 表达式内部（字符串，只有 `rule-expr.mjs` 查得到）。
 *
 * enum 只给构建期本来就强制校验的词表（group / severity / vehicle）。schema 比构建期更严会在合法
 * 写法上飘红，假红比没提示更糟（`category` 允许偏离派生值，只能给 `examples`）。
 * 不依赖任何第三方包（构建脚本只用 Node 内置 + yaml）。
 */
import { SEVERITIES, UNIT_ALIASES } from "./rule-expr.mjs";

/** 排序后去重：产物要可复现（同输入 → 逐字节相同输出），别依赖对象遍历顺序 */
const uniqSorted = (xs) => [...new Set(xs)].filter((x) => typeof x === "string" && x).sort();

const FW_PATTERN = "^(any|\\s*(>=|<=|==|>|<)?\\s*\\d+(\\.\\d+)?(\\s*,\\s*(>=|<=|==|>|<)?\\s*\\d+(\\.\\d+)?\\s*)*)$";

/** `conditions.message` 的一项：`vehicle_status` ｜ `vehicle_gps_position || sensor_gps` */
const TOPICS_ITEM_PATTERN = "^[a-z][a-z0-9_]*(\\s*\\|\\|\\s*[a-z][a-z0-9_]*)*$";

/**
 * @param {object} args
 * @param {object} args.signatures  算子签名表（`parseOperatorSignatures` 的产物）
 * @param {object} args.facts       facts.yaml 解析结果
 * @param {object} args.vehicles   { aliases, valid }（规范名来自 facts.yaml 的 vehicle_types）
 * @param {Set<string>} args.builtinVars  表达式能直接引用的内置变量名
 * @returns {object} JSON Schema（draft-07）
 */
export function buildRuleSchema({ signatures, facts, vehicles, builtinVars }) {
    const groupOrder = Array.isArray(facts.group_order) ? facts.group_order.slice() : [];
    const byGroup = facts.rule_meta?.by_group ?? {};
    const categories = uniqSorted(Object.values(byGroup).map((g) => g?.category));
    // 机架合法值 = 规范名（含 unknown）+ 简写（mc / fw）+ any
    const vehiclesAll = uniqSorted([...(vehicles.valid ?? []), ...Object.keys(vehicles.aliases ?? {}), "any"]);

    const computeDesc = [
        "取值表达式：自上而下求值，输出的名字供后面与 triggers 引用。",
        "写法是 Python 的一个真子集（完整语法见 /guide/rule-schema）：",
        "  a, b = f(x, kw=1) / pct = frac * 100 / x if c else y / a and b / not a",
        '字段引用：topic.field（裸写）或 _ref("topic[:].field", alias="x", unit="deg")；',
        '  _ref("新名", "旧名") 是候选组，运行期取第一个存在的。',
        "⚠ 表达式**内部**（算子名、字段是否存在、单位换算）JSON Schema 查不了，由构建期校验。",
    ].join("\n");

    return {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "PX4 检查经验（knowledge/px4/rules/*.yaml）",
        description:
            "⚠ 自动生成，请勿手改 —— 源：facts.yaml / knowledge/engine/operators.py / knowledge/engine/providers/api.py。" +
            "改完跑 `pnpm web:build:kb`。\n" +
            "字段级权威参考见站内 /guide/rule-schema；可抄的骨架见 knowledge/rules-template.yml。",
        type: "object",
        // 身份三件套是所有经验都要填的
        required: ["id", "group", "name"],
        // 关掉它收益很大：键名拼错当场飘红，而不是等构建
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
            tag: { type: "string", description: "规则级异常标签，trigger 未写 label 时回退到此" },
            docurl: { type: "string", description: "规则级文档链接，evidence 未写 docurl 时回退到此" },
            order: { type: "integer", description: "同 group 内的次序（缺省 100000，再按 id 兜底）" },
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
            condition: {
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
                    vehicle: {
                        description: "机架：any（缺省）/ 机架名 / 机架名列表。简写 mc、fw 也认",
                        oneOf: [
                            { type: "string", enum: vehiclesAll },
                            { type: "array", items: { type: "string", enum: vehiclesAll } },
                        ],
                    },
                    topics: {
                        type: "array",
                        items: { type: "string", pattern: TOPICS_ITEM_PATTERN },
                        description:
                            "数据依赖：日志里得有这些 topic，缺了记一条 skipped。项内 `||` = 任意一个在就够，项间 = 都要有",
                    },
                    mode: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "模式：与 `topics` **同形**——项内 `||` = 任一出现过即可，项间 = 都要出现过。匹配的是「日志里出现过」（MODES_PRESENT），不是「当前处于」",
                    },
                    armed: {
                        description:
                            '解锁：any（缺省，不限）/ true（必须有解锁段）/ false（必须全程未解锁）/ ">12"（解锁总时长 ARMED_S 的门槛，秒）。判据算不出来就跳过',
                        oneOf: [
                            {
                                type: "string",
                                pattern: "^(any|true|false|[<>=!]=?\\s*\\d+(\\.\\d+)?|\\d+(\\.\\d+)?)$",
                            },
                            { type: "boolean" },
                            { type: "number" },
                        ],
                    },
                    placeholder: {
                        description:
                            "这条经验**还没实现**：引擎跳过并把这句原样当作原因显示。占位专用，别拿它写判据（2026-09 取代原先塞进 precheck 的字符串 hack）",
                        oneOf: [{ type: "string" }, { type: "boolean" }],
                    },
                },
            },
            ran_when: { type: "string", description: "算出来了、但还不算「跑过」时的条件（如机动段样本不足）" },
            compute: {
                type: "array",
                items: { type: "string", description: computeDesc },
                description: "取值：一串表达式，自上而下求值",
            },
            output: {
                type: "array",
                description: "指标输出（纯数据，写入 metrics）。多条 = 多个指标",
                items: {
                    type: "object",
                    required: ["name", "value"],
                    additionalProperties: false,
                    properties: {
                        name: { type: "string", description: "指标名（metrics 的键）" },
                        value: { type: "string", description: "compute 里的变量名" },
                        description: { type: "string", description: "指标说明（可用 {变量} 占位）" },
                        unit: { type: "string", description: "单位" },
                    },
                },
            },
            trigger: {
                type: "array",
                description: "判定：各大组之间**全部执行**，同组内的 when[] 短路（命中第一条即停）",
                items: {
                    type: "object",
                    required: ["when", "severity", "description"],
                    additionalProperties: false,
                    properties: {
                        when: {
                            description: "触发条件（可单值可数组；数组内短路求值）。缺省 = True",
                            oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
                        },
                        severity: {
                            description: "严重等级（可单值可数组，长度 >1 时一一对应 when[]）。guard = 数据质量标签",
                            oneOf: [
                                { type: "string", enum: uniqSorted([...SEVERITIES, "guard"]) },
                                {
                                    type: "array",
                                    items: { type: "string", enum: uniqSorted([...SEVERITIES, "guard"]) },
                                },
                            ],
                        },
                        label: {
                            description: "本条 finding 的标签（缺省 = 规则级 tag；写 null = 不产标签）",
                            oneOf: [
                                { type: "string" },
                                { type: ["string", "null"] },
                                { type: "array", items: { type: "string" } },
                            ],
                        },
                        description: {
                            description: "结论描述，可用 {变量} 占位。可单值可数组",
                            oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
                        },
                        suggestion: {
                            description: "建议文本，可用 {变量} 占位。可单值可数组",
                            oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
                        },
                        evidence: {
                            type: "object",
                            description: "结构化证据",
                            additionalProperties: false,
                            properties: {
                                source: {
                                    type: "string",
                                    description: "证据来源说明（如 topic.field），可用 {变量} 占位",
                                },
                                value: { type: "string", description: "证据值表达式（如 vibe_mean 或 f'{x:.2f}'）" },
                                threshold: {
                                    description: "阈值（可单值或数组对应 when[]）",
                                    oneOf: [
                                        { type: ["number", "string"] },
                                        { type: "array", items: { type: ["number", "string"] } },
                                    ],
                                },
                                unit: { type: "string", description: "单位" },
                                docurl: { type: "string", description: "证据级文档链接（覆盖规则级 docurl）" },
                            },
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
        // guard 类经验通过 triggers.severity: guard 表达，与普通经验同一形态
        anyOf: [{ required: ["trigger"], title: "所有经验都要有 trigger" }],
        // 机器可读的派生词表（`x-` 是 JSON Schema 允许的自定义前缀）。编辑器不消费，
        // 但脚本与其它工具可以查，省得再解析 knowledge/engine/ 源码
        "x-operators": uniqSorted(Object.keys(signatures ?? {})),
        "x-units": uniqSorted(Object.keys(UNIT_ALIASES)),
        "x-builtin-vars": uniqSorted([...(builtinVars ?? [])]),
    };
}
