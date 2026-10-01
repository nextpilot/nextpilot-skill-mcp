/**
 * rules/*.yaml 的 compute 表达式：构建期解析与校验。产物里存的是作者写的原文，
 * 运行期由 `knowledge/engine/rule_engine.py` 的 `_eval_compute` 用 Python ast 求值，
 * 所以构建期必须自己看得懂这段表达式（「写错的经验根本进不了浏览器」这条不变量）。
 * 这里只校验不降级：不拆节点、不生成运行期产物。
 *
 * 语法（Python 真子集，与 triggers.expr 同一套写法）：
 *   a, b, c = f(x, kw=1)  多左值赋值   pct = frac * 100  算术 + - * / % **
 *   p99 if seg_n > 50 else None  三元   a and b / a or b / not a  逻辑
 *   x in S / x is None  比较   topic.field  裸字段引用
 *   ref("topic[:].field", alias="x", unit="deg")；ref("新名", "旧名") = 候选组取第一个存在的
 *   _try(expr) 容错（内层出错或得 None 时结果为 None）；param("NAME"[, 兜底]) 读飞控参数；算子调用
 *
 * 不依赖第三方包（构建脚本只用 Node 内置 + yaml）。
 */

const PUNCT = [
    "**",
    "<=",
    ">=",
    "==",
    "!=",
    "&",
    "|",
    "(",
    ")",
    "[",
    "]",
    "{",
    "}",
    ",",
    ":",
    "=",
    ".",
    "+",
    "-",
    "*",
    "/",
    "%",
    "<",
    ">",
];
const KEYWORDS = new Set(["and", "or", "not", "in", "is", "if", "else", "True", "False", "None"]);

// Python / Numpy 内置函数：不在 operators.py 注册，也不需要签名，直接按返回标量处理
const KNOWN_BUILTINS = new Set([
    "abs",
    "all",
    "any",
    "bool",
    "dict",
    "enumerate",
    "float",
    "int",
    "len",
    "list",
    "map",
    "max",
    "min",
    "round",
    "set",
    "sorted",
    "str",
    "sum",
    "tuple",
    "zip",
    "np.abs",
    "np.all",
    "np.any",
    "np.arange",
    "np.argmax",
    "np.argmin",
    "np.argsort",
    "np.array",
    "np.clip",
    "np.concatenate",
    "np.cos",
    "np.cross",
    "np.cumsum",
    "np.deg2rad",
    "np.diff",
    "np.dot",
    "np.exp",
    "np.hypot",
    "np.isin",
    "np.log",
    "np.log10",
    "np.max",
    "np.maximum",
    "np.mean",
    "np.median",
    "np.min",
    "np.minimum",
    "np.percentile",
    "np.ptp",
    "np.rad2deg",
    "np.sin",
    "np.sqrt",
    "np.std",
    "np.sum",
    "np.tan",
    "np.unique",
    "np.where",
    "np.zeros",
]);

/** 固件约束串：`any` / 空 / 逗号分隔的版本比较（逗号 = 与）。与 provider.match_version 同一套 */
const FW_ANY = /^\s*any\s*$/;
const FW_SPEC = /^\s*(>=|<=|==|>|<)?\s*\d+(\.\d+)?\s*(,\s*(>=|<=|==|>|<)?\s*\d+(\.\d+)?\s*)*$/;

/** 固件约束串是否合法：规则级 `firmware` 轴与节点级 `when_fw` 共用这一个判据 */
export function isFirmwareSpec(v) {
    return typeof v === "string" && (FW_ANY.test(v) || FW_SPEC.test(v));
}

/** 机架适用范围：`any` ｜ 机架名 ｜ 机架名列表（如 [fixed_wing, unknown]） */
const VEHICLE_NAME = /^[a-z][a-z0-9_]*$/;

export function isVehicleSpec(v) {
    if (typeof v === "string") return v.trim() === "any" || VEHICLE_NAME.test(v.trim());
    return (
        Array.isArray(v) &&
        v.length > 0 &&
        v.every((x) => typeof x === "string" && x.trim() !== "any" && VEHICLE_NAME.test(x.trim()))
    );
}

/**
 * `triggers[].severity` 的合法取值。放这里是为了只有一份真源：构建期校验与编辑器的
 * JSON Schema 都取这份。抄成两份，IDE 会拿旧词表去纠正新写法，比没有提示更糟。
 */
export const SEVERITIES = new Set(["critical", "warning", "info", "guard"]);

/**
 * 日志 topic / 消息名。风格约定属于各个格式（PX4 uORB 小写 snake_case、ArduPilot DataFlash
 * 大写短名如 ATT / GPS），构建期只挡明显出格的字符——拿一族风格去卡另一族，
 * 那一族的规则一条都进不了产物。
 */
const TOPIC_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * `conditions.message` 的一项：`vehicle_status` ｜ `vehicle_gps_position || sensor_gps` ｜ `ATT`。
 * `||` = 其中任意一个在日志里就够（两个都不在才跳过）。返回候选名列表；
 * 这里只拆写法、校验名字，不认识语义。
 */
export function parseTopicReq(v) {
    if (typeof v !== "string") {
        throw new Error(
            `topics 的每一项都必须是字符串（如 vehicle_gps_position || sensor_gps），实际是 ${JSON.stringify(v)}`,
        );
    }
    const names = v.split("||").map((s) => s.trim());
    for (const n of names) {
        if (!TOPIC_NAME.test(n)) {
            throw new Error(
                `topics 项「${v}」写法不对：每一段都要是消息名（字母开头，如 vehicle_gps_position 或 ATT），多个用 || 分隔`,
            );
        }
    }
    if (new Set(names).size !== names.length) {
        throw new Error(`topics 项「${v}」里有重复的 topic`);
    }
    return names;
}

/**
 * 单位词表：`unit=` 能写的规范名，以及 meta/<tag>.json 里那些自由文本（`metres` /
 * `radians` / `us`…）怎么归到规范名上。规范名要与 `knowledge/engine/rule_engine.py`
 * 的 `_UNIT_FACTORS` 键完全一致，构建期比对这两份，对不上直接构建失败。
 */
export const UNIT_ALIASES = {
    // 长度（基准 m）
    m: "m",
    metre: "m",
    metres: "m",
    meter: "m",
    meters: "m",
    mm: "mm",
    millimetre: "mm",
    millimetres: "mm",
    millimeter: "mm",
    millimeters: "mm",
    cm: "cm",
    centimetre: "cm",
    centimetres: "cm",
    centimeter: "cm",
    centimeters: "cm",
    // 角度（基准 rad）。degE7 = 度 × 1e7，PX4 经纬度的老口径
    rad: "rad",
    radian: "rad",
    radians: "rad",
    deg: "deg",
    degree: "deg",
    degrees: "deg",
    dege7: "degE7",
    "deg*1e7": "degE7",
    // 时间（基准 s）
    s: "s",
    sec: "s",
    second: "s",
    seconds: "s",
    ms: "ms",
    millisecond: "ms",
    milliseconds: "ms",
    us: "us",
    microsecond: "us",
    microseconds: "us",
};

/** 单位名（可能是别名）→ 规范名；认不出返回 null */
export function normalizeUnit(u) {
    return (
        UNIT_ALIASES[
            String(u ?? "")
                .trim()
                .toLowerCase()
        ] ?? null
    );
}

/** 规范名 → 量纲族（跨族不能换算，构建期就拦） */
export const UNIT_KIND = {
    m: "len",
    mm: "len",
    cm: "len",
    rad: "angle",
    deg: "angle",
    degE7: "angle",
    s: "time",
    ms: "time",
    us: "time",
};

/** ref() 认识的修饰键 */
const REF_KEYS = new Set(["alias", "unit"]);

/**
 * 字段引用：`topic.field`，两段各自可以带一个下标。
 *   · `topic[:]` / `topic[N]` / `topic[A:B]` / 不写 = 实例写法。`[A:B]` 是闭区间（与 Python 切片
 *     相反）；`[:]` = 所有实例；不写 = 第 0 个实例（要"所有实例"得写 `[:]`）
 *   · `topic.field[N]`：数组字段的元素下标（如 `vehicle_attitude.q[0]`）
 *   · `topic.field[i,j]`：二维下标，i 是行（第几个采样，随时间递进）、j 是列（第几路信号）。
 *     数组字段按"每列一条序列"存，`q[10,2]` = 第 10 个采样、第 2 列
 * 两个下标位置不同、含义不同，别混。
 */
const FIELD_REF =
    /^[A-Za-z][A-Za-z0-9_]*(\[[-]?\d*(?::-?\d*)?\])?\.(?:[A-Za-z][A-Za-z0-9_]*(?:\[\d+(?:,\d+)?\])?\.)*[A-Za-z][A-Za-z0-9_]*(?:\[\d+(?:,\d+)?\])?$/;

/** 拆开字段引用 → {topic, inst, field}（inst 是 int 或 slice；不写 = 第 0 个实例） */
export function splitFieldRef(s) {
    // 大小写都收（与 TOPIC_NAME 同理）：`ATT.timestamp`（APM）与 `vehicle_attitude.timestamp`（PX4）同一件事
    const NAME = "[A-Za-z][A-Za-z0-9_]*";
    const ELEM = "(?:\\[\\d+(?:,\\d+)?\\])?";
    const m = new RegExp(
        `^(${NAME})(?:\\[([-]?\\d*(?::-?\\d*)?)\\])?\\.((?:${NAME}${ELEM}\\.)*${NAME})(?:\\[(\\d+(?:,\\d+)?)\\])?$`,
    ).exec(String(s).trim());
    if (!m) return null;
    return {
        topic: m[1],
        inst: parseInstance(m[2]),
        field: m[3],
        // 数组元素下标原样保留（它是字段名的一部分，取数时按 'field[i]' / 'field[i,j]' 找列）
        fieldIndex: m[4] === undefined ? null : m[4],
    };
}

/** `[2]` → int；`[:]` / `[1:3]` → slice（闭区间，含两端）；不写 → 0（只取第 0 个实例） */
function parseInstance(txt) {
    if (txt === undefined || txt === "") return 0;
    if (txt.includes(":")) {
        const [a, b] = txt.split(":");
        const num = (x) => (x === "" || x === undefined ? null : Number(x));
        return { slice: [num(a), num(b)] };
    }
    return Number(txt);
}

/** 取数的实例说明 → 判定是不是"分组取数"（切片一律按分组给） */
function isGroupInst(inst) {
    return inst !== null && typeof inst === "object" && Array.isArray(inst.slice);
}

function fail(msg, src, pos) {
    const col = (pos ?? 0) + 1;
    const lo = Math.max(0, (pos ?? 0) - 12);
    const near = src.slice(lo, (pos ?? 0) + 12);
    throw new Error(`${msg}（第 ${col} 列，附近：…${near}…）`);
}

// ─────────────────────────── 词法 ───────────────────────────

function tokenize(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (/\s/.test(c)) {
            i++;
            continue;
        }
        if (c === "#") {
            // 行尾注释跳到行尾（YAML 块标量里换行被保留，一条表达式可能跨多行、每行都可能挂注释）
            while (i < src.length && src[i] !== "\n") i++;
            continue;
        }
        if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
            const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
            toks.push({ t: "num", v: Number(m[0]), pos: i });
            i += m[0].length;
            continue;
        }
        if (c === '"' || c === "'") {
            let j = i + 1;
            let out = "";
            while (j < src.length && src[j] !== c) {
                if (src[j] === "\\") {
                    const n = src[j + 1];
                    out += n === "n" ? "\n" : n === "t" ? "\t" : n === "\\" ? "\\" : n === c ? c : n;
                    j += 2;
                } else {
                    out += src[j];
                    j++;
                }
            }
            if (j >= src.length) fail("字符串没有收尾引号", src, i);
            toks.push({ t: "str", v: out, pos: i });
            i = j + 1;
            continue;
        }
        if (/[A-Za-z_]/.test(c)) {
            const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
            toks.push({ t: KEYWORDS.has(m[0]) ? "kw" : "name", v: m[0], pos: i });
            i += m[0].length;
            continue;
        }
        const p = PUNCT.find((x) => src.startsWith(x, i));
        if (!p) fail(`无法识别的字符 ${JSON.stringify(c)}`, src, i);
        toks.push({ t: "punct", v: p, pos: i });
        i += p.length;
    }
    toks.push({ t: "eof", v: "", pos: src.length });
    return toks;
}

// ─────────────────────────── 语法 ───────────────────────────
//
// 表达式 AST 用普通对象（带 pos，报错时能指到列）：
//   num/str/const/list/dict/name/attr，call{fn,args,kwargs}，
//   bin{op,l,r} / un{op,x} / bool{op,items} / cmp{op,l,r} / tern{cond,yes,no}

function Parser(src, toks) {
    let p = 0;
    const peek = (n = 0) => toks[p + n];
    const at = (t, v) => {
        const k = toks[p];
        return k.t === t && (v === undefined || k.v === v);
    };
    const eat = (t, v) => {
        if (!at(t, v)) fail(`期望 ${v ?? t}，实际是 ${JSON.stringify(peek().v) || "结尾"}`, src, peek().pos);
        return toks[p++];
    };
    const skip = (t, v) => (at(t, v) ? toks[p++] : null);

    // 语句：target (',' target)* '=' expr
    function statement() {
        const targets = [eat("name").v];
        while (skip("punct", ",")) targets.push(eat("name").v);
        eat("punct", "=");
        const value = expr();
        if (!at("eof")) fail(`表达式后面还有多余内容 ${JSON.stringify(peek().v)}`, src, peek().pos);
        return { targets, value };
    }

    function expr() {
        return ternary();
    }

    function ternary() {
        const cond = orExpr();
        if (!at("kw", "if")) return cond;
        const kw = eat("kw", "if");
        const yes = orExpr();
        eat("kw", "else");
        const no = ternary();
        return { k: "tern", cond, yes, no, pos: kw.pos };
    }

    function orExpr() {
        let l = andExpr();
        while (at("kw", "or")) {
            const t = eat("kw", "or");
            l = { k: "bool", op: "or", items: [l, andExpr()], pos: t.pos };
        }
        return l;
    }

    function andExpr() {
        let l = notExpr();
        while (at("kw", "and")) {
            const t = eat("kw", "and");
            l = { k: "bool", op: "and", items: [l, notExpr()], pos: t.pos };
        }
        return l;
    }

    function notExpr() {
        if (at("kw", "not")) {
            const t = eat("kw", "not");
            return { k: "un", op: "not", x: notExpr(), pos: t.pos };
        }
        return comparison();
    }

    function comparison() {
        let l = bitand();
        for (;;) {
            let op;
            const tok = peek();
            if (
                at("punct", "<") ||
                at("punct", "<=") ||
                at("punct", ">") ||
                at("punct", ">=") ||
                at("punct", "==") ||
                at("punct", "!=")
            ) {
                op = eat("punct").v;
            } else if (at("kw", "in")) {
                op = eat("kw", "in").v;
            } else if (at("kw", "not") && peek(1).t === "kw" && peek(1).v === "in") {
                eat("kw", "not");
                eat("kw", "in");
                op = "not in";
            } else if (at("kw", "is")) {
                eat("kw", "is");
                op = skip("kw", "not") ? "is not" : "is";
            } else {
                return l;
            }
            l = { k: "cmp", op, l, r: bitand(), pos: tok.pos };
        }
    }

    // & | （Python 语义，比算术低、比比较低）
    function bitand() {
        let l = arith();
        while (at("punct", "&") || at("punct", "|")) {
            const t = eat("punct");
            l = { k: "bin", op: t.v, l, r: arith(), pos: t.pos };
        }
        return l;
    }

    function arith() {
        let l = term();
        while (at("punct", "+") || at("punct", "-")) {
            const t = eat("punct");
            l = { k: "bin", op: t.v, l, r: term(), pos: t.pos };
        }
        return l;
    }

    function term() {
        let l = unary();
        while (at("punct", "*") || at("punct", "/") || at("punct", "%")) {
            const t = eat("punct");
            l = { k: "bin", op: t.v, l, r: unary(), pos: t.pos };
        }
        return l;
    }

    // 一元负号的优先级低于 **（与 Python 一致：-2**2 == -4，2**-1 合法）
    function unary() {
        if (at("punct", "-") || at("punct", "+")) {
            const t = eat("punct");
            return { k: "un", op: t.v, x: unary(), pos: t.pos };
        }
        return power();
    }

    // ** 右结合
    function power() {
        const l = primary();
        if (at("punct", "**")) {
            const t = eat("punct", "**");
            return { k: "bin", op: "**", l, r: unary(), pos: t.pos };
        }
        return l;
    }

    function primary() {
        // 辅助：下标，name[...] / attr[...] / (...)[...] / [...] 后都可能有
        function subscript(node) {
            eat("punct", "[");
            const items = [];
            if (!at("punct", "]")) {
                for (;;) {
                    // Python slice: `[start:stop]` / `[:stop]` / `[start:]` / `[:]`
                    if (at("punct", ":") || (at("num") && peek(1)?.t === "punct" && peek(1).v === ":")) {
                        const start = at("punct", ":") ? null : expr();
                        eat("punct", ":");
                        const stop = at("punct", "]") || at("punct", ",") ? null : expr();
                        items.push({ k: "slice", start, stop });
                    } else {
                        items.push(expr());
                    }
                    if (!skip("punct", ",")) break;
                    if (at("punct", "]")) break;
                }
            }
            eat("punct", "]");
            return { k: "sub", v: node, slice: items, pos: node.pos };
        }

        const t = peek();
        if (t.t === "num") {
            p++;
            return { k: "num", v: t.v, pos: t.pos };
        }
        if (t.t === "str") {
            p++;
            return { k: "str", v: t.v, pos: t.pos };
        }
        if (t.t === "kw" && ["True", "False", "None"].includes(t.v)) {
            p++;
            return { k: "const", v: t.v === "True" ? true : t.v === "False" ? false : null, pos: t.pos };
        }
        if (t.t === "name") {
            p++;
            if (at("punct", "(")) return call(t);
            if (at("punct", ".")) {
                eat("punct", ".");
                const f = eat("name");
                if (at("punct", "(")) {
                    return call({ v: t.v + "." + f.v, pos: t.pos });
                }
                let node = { k: "attr", topic: t.v, field: f.v, pos: t.pos };
                while (at("punct", "[")) node = subscript(node);
                // 下标后可继续 .field（esc_status.esc[0].esc_rpm）：与下面 name[...] 分支同款循环
                while (at("punct", ".")) {
                    eat("punct", ".");
                    const f2 = eat("name");
                    node = { k: "attr", topic: node, field: f2.v, pos: node.pos };
                    while (at("punct", "[")) node = subscript(node);
                }
                return node;
            }
            if (at("punct", "[")) {
                let node = { k: "name", name: t.v, pos: t.pos };
                while (at("punct", "[")) node = subscript(node);
                // 下标后面可能还有 .xxx（如 estimator_status[:].filter_fault_flags）
                while (at("punct", ".")) {
                    eat("punct", ".");
                    const f = eat("name");
                    node = { k: "attr", topic: node, field: f.v, pos: node.pos };
                    while (at("punct", "[")) node = subscript(node);
                }
                return node;
            }
            return { k: "name", name: t.v, pos: t.pos };
        }
        if (at("punct", "(")) {
            eat("punct", "(");
            let e = expr();
            eat("punct", ")");
            while (at("punct", "[")) e = subscript(e);
            return e;
        }
        if (at("punct", "[")) {
            eat("punct", "[");
            let items = [];
            if (!at("punct", "]")) {
                for (;;) {
                    items.push(expr());
                    if (!skip("punct", ",")) break;
                    if (at("punct", "]")) break; // 允许尾逗号
                }
            }
            eat("punct", "]");
            let node = { k: "list", items, pos: t.pos };
            while (at("punct", "[")) node = subscript(node);
            return node;
        }
        if (at("punct", "{")) {
            eat("punct", "{");
            const entries = [];
            if (!at("punct", "}")) {
                for (;;) {
                    const key = expr();
                    eat("punct", ":");
                    entries.push([key, expr()]);
                    if (!skip("punct", ",")) break;
                    if (at("punct", "}")) break; // 允许尾逗号
                }
            }
            eat("punct", "}");
            return { k: "dict", entries, pos: t.pos };
        }
        fail(`这里需要一个表达式，实际是 ${JSON.stringify(t.v) || "结尾"}`, src, t.pos);
    }

    function call(nameTok) {
        eat("punct", "(");
        const args = [];
        const kwargs = {};
        if (!at("punct", ")")) {
            for (;;) {
                // 关键字实参：NAME '=' expr（'==' 已在词法层区分）
                if (at("name") && peek(1).t === "punct" && peek(1).v === "=") {
                    const key = eat("name").v;
                    eat("punct", "=");
                    if (key in kwargs) fail(`关键字实参 ${key} 重复`, src, peek().pos);
                    kwargs[key] = expr();
                } else {
                    if (Object.keys(kwargs).length) fail("位置实参不能排在关键字实参后面", src, peek().pos);
                    args.push(expr());
                }
                if (!skip("punct", ",")) break;
                if (at("punct", ")")) break; // 允许尾逗号
            }
        }
        eat("punct", ")");
        return { k: "call", fn: nameTok.v, args, kwargs, pos: nameTok.pos };
    }

    // 一串裸表达式：`e, e, e`（预设里的 ydata / style 这类"逗号串"用它）
    function list() {
        const items = [expr()];
        while (skip("punct", ",")) items.push(expr());
        if (!at("eof")) fail(`表达式后面还有多余内容 ${JSON.stringify(peek().v)}`, src, peek().pos);
        return items;
    }

    return { statement, list };
}

/** 解析一条 compute 表达式：`a, b = expr` */
export function parseCompute(src) {
    const text = String(src).trim();
    if (!text) throw new Error("compute 表达式是空的");
    return Parser(text, tokenize(text)).statement();
}

/** 解析一串裸表达式（`a, b, c`），预设里的字段/样式串用它；同一套词法切，ref(...) 里的逗号不会被切错 */
function parseExprList(src) {
    const text = String(src).trim();
    if (!text) throw new Error("表达式串是空的");
    return Parser(text, tokenize(text)).list();
}

// ─────────────────────────── 校验 ───────────────────────────

/** 粗类型：够用来抓「三元两分支一个是列表一个是标量」这类明显错误 */
const T_SCALAR = "scalar";
const T_LIST = "list";
const T_GROUPS = "groups"; // 切片取数（topic[:]）的引用：每实例一组
const T_UNKNOWN = "unknown";

function mergeType(a, b, ctx, pos) {
    if (a === T_UNKNOWN || b === T_UNKNOWN) return T_UNKNOWN;
    if (a !== b) fail(`三元表达式两个分支类型不一致（${a} / ${b}）——Python 里它们必须同类`, ctx.src, pos);
    return a;
}

/** 下降一层：进入子表达式后，_try 不再允许出现（它只在赋值右侧最外层有意义） */
function sub(node, ctx) {
    return infer(node, { ...ctx, tryAllowed: false });
}

// 分组取数（`topic[:]`）是「每实例一组」的列表，只在算子的直接输入位置有意义；
// 参与四则/比较/三元一定是写错了。
function noGroups(type, ctx, node, what) {
    if (type === T_GROUPS) {
        fail(`${what}不能用分组取数（topic[:] 的结果是每实例一组的列表）`, ctx.src, node.pos);
    }
}

function infer(node, ctx) {
    switch (node.k) {
        case "num":
        case "str":
        case "const":
            return T_SCALAR;
        case "list": {
            node.items.forEach((x) => noGroups(sub(x, ctx), ctx, x, "列表元素"));
            return T_LIST;
        }
        case "dict": {
            // 只当字面量用（算子选项，如 codes={5: "AUTO_RTL"}），不参与任何运算
            node.entries.forEach(([k, v]) => {
                sub(k, ctx);
                sub(v, ctx);
            });
            return T_UNKNOWN;
        }
        case "attr": {
            // 形状校验：topic 与字段都要是小写 snake_case、只有一段点号。
            // 存在性（这个名字在本固件里到底有没有）不在这里查：那是 check_rules_fields.py 的活，
            // 它按「规则 firmware ∩ 引用级 when_fw」圈版本范围去比回归日志实测字段；requires 管 skip 语义，不列举全部 topic。
            if (typeof node.topic === "string") {
                const full = `${node.topic}.${node.field}`;
                if (!FIELD_REF.test(full)) {
                    fail(
                        `字段引用 ${full} 的写法不对：topic 与每段字段都得是小写名字；` +
                            `实例下标只跟在 topic 后（topic[N].field），字段段只许末尾带元素下标（field[i]）或嵌套段各带（esc[0].esc_rpm）`,
                        ctx.src,
                        node.pos,
                    );
                }
            } else {
                // topic 是子表达式（如 estimator_status[:].field 中的 sub 节点）
                sub(node.topic, ctx);
            }
            return T_UNKNOWN;
        }
        case "sub": {
            // 下标：v 是被取对象的表达式，slice 是下标的表达式列表（可为 slice 节点）
            sub(node.v, ctx);
            node.slice.forEach((x) => {
                if (x.k === "slice") {
                    if (x.start) sub(x.start, ctx);
                    if (x.stop) sub(x.stop, ctx);
                } else {
                    sub(x, ctx);
                }
            });
            return T_UNKNOWN;
        }
        case "name":
            return ctx.types.get(node.name) ?? T_UNKNOWN;
        case "un": {
            if (node.op !== "not") noGroups(sub(node.x, ctx), ctx, node, "一元运算");
            else sub(node.x, ctx);
            return T_SCALAR;
        }
        case "bin": {
            noGroups(sub(node.l, ctx), ctx, node.l, "四则运算");
            noGroups(sub(node.r, ctx), ctx, node.r, "四则运算");
            return T_UNKNOWN;
        }
        case "cmp": {
            noGroups(sub(node.l, ctx), ctx, node.l, "比较运算");
            noGroups(sub(node.r, ctx), ctx, node.r, "比较运算");
            return T_SCALAR;
        }
        case "bool": {
            // `_try(...) or []` 的语义是求值失败兜底；`or` 第一个操作数要能被 `_try` 包住，`and`/`not` 同理
            node.items.forEach((x) => {
                const isTry = x.k === "call" && x.fn === "_try";
                noGroups(isTry ? infer(x, { ...ctx, tryAllowed: true }) : sub(x, ctx), ctx, x, "逻辑运算");
            });
            return T_UNKNOWN;
        }
        case "tern": {
            const a = sub(node.yes, ctx);
            noGroups(a, ctx, node.yes, "三元表达式的分支");
            const b = sub(node.no, ctx);
            noGroups(b, ctx, node.no, "三元表达式的分支");
            return mergeType(a, b, ctx, node.pos);
        }
        case "call":
            return inferCall(node, ctx);
        default:
            fail(`内部错误：未知的表达式节点 ${node.k}`, ctx.src, node.pos);
    }
}

function inferCall(node, ctx) {
    const { fn, args, kwargs } = node;

    if (fn === "_ref") return checkRef(node, ctx);

    if (fn === "has_topic") {
        // 引擎内置框架调用：只接受一个字符串字面量
        if (args.length !== 1 || Object.keys(kwargs).length || args[0].k !== "str") {
            fail("has_topic() 只接受一个字符串字面量，如 has_topic('cpuload')", ctx.src, node.pos);
        }
        return T_SCALAR;
    }

    if (fn === "log_ok") {
        // 引擎内置框架调用：无参，返回 bool
        if (args.length !== 0 || Object.keys(kwargs).length) {
            fail("log_ok() 不接受参数", ctx.src, node.pos);
        }
        return T_SCALAR;
    }

    if (fn === "_cfg") {
        // 读飞控参数：引擎内置（provider 的 CFG 字典），不查算子表。第一参是参数名字面量，
        // 第二参可选，是缺失时的兜底值（字面量）。
        if (args.length < 1 || args.length > 2 || args[0].k !== "str") {
            fail("_cfg() 的第一个参数必须是参数名字面量，如 _cfg('ARMING_CHECK')", ctx.src, node.pos);
        }
        if (args.length === 2 && !["num", "str", "bool"].includes(args[1].k)) {
            fail("_cfg() 的兜底值必须是字面量，如 _cfg('RNGFND_TYPE', 0.0)", ctx.src, node.pos);
        }
        if (Object.keys(kwargs).length) fail("_cfg() 不接受关键字参数", ctx.src, node.pos);
        return T_SCALAR;
    }

    if (fn === "_try") {
        if (!ctx.tryAllowed) fail("_try() 只能出现在赋值右侧的最外层（它的语义是求值器层面的）", ctx.src, node.pos);
        if (args.length !== 1 || Object.keys(kwargs).length) fail("_try() 只接受一个参数", ctx.src, node.pos);
        // _try(...) 包住的算子仍算「顶层调用」：老节点 optional: true + 多输出就编译成这个形态
        infer(args[0], { ...ctx, tryAllowed: false, topCall: args[0] });
        return T_UNKNOWN;
    }

    // Python / Numpy 内置：不是 operators.py 注册的，也不需要签名
    if (KNOWN_BUILTINS.has(fn)) return T_SCALAR;

    const sig = ctx.signatures[fn];
    if (!sig) {
        fail(`未注册的算子 ${fn}（算子表在 knowledge/engine/operators.py，名字必须完全一致）`, ctx.src, node.pos);
    }
    if (sig.out_arity > 1 && node !== ctx.topCall) {
        fail(
            `算子 ${fn} 有 ${sig.out_arity} 个输出，不能嵌在表达式中间（值是元组，语言里没有下标）` +
                `——请先写一行 \`${sig.out_names.join(", ") || "多个名字"} = ${fn}(...)\` 再引用`,
            ctx.src,
            node.pos,
        );
    }

    // 入参分两类：形参表的前 in_arity 个是输入（任意表达式，按位置或名字给），其余是命名选项
    // （如 codes= / min_mean= / p=，只能字面量，运行期 `**` 直通给算子）。
    // `in_arity` 可以是列表（同一算子的两种写法，如 quat_to_euler 收一组或收四列）
    const params = sig.params ?? [];
    const arities = Array.isArray(sig.in_arity) ? sig.in_arity : [sig.in_arity];
    const maxIn = Math.max(...arities);
    const needTxt = arities.join(" 或 ");
    const isInputName = (k) => params.indexOf(k) >= 0 && params.indexOf(k) < maxIn;

    for (const [k, v] of Object.entries(kwargs)) {
        if (isInputName(k)) {
            infer(v, ctx); // 输入：与位置实参同等对待
            continue;
        }
        if (params.length && !params.includes(k)) {
            // 名字要在算子形参里：写错会被 **kw 吞掉，算子用默认值静默算出错的结果
            fail(
                `算子 ${fn} 没有名为 ${k} 的参数（可用：${params.join(" / ")}）` +
                    `——写错名字不会报错，算子会用默认值静默算出错的结果`,
                ctx.src,
                v.pos,
            );
        }
        // 一元正负号作用在数字字面量上仍是字面量（`-1.0` 在 Python 里也是），不放行则"取负"只能在规则里绕道
        const bare = v.k === "un" && (v.op === "-" || v.op === "+") ? v.x : v;
        if (!["num", "str", "const", "list", "dict"].includes(bare.k)) {
            fail(`算子 ${fn} 的选项 ${k}= 只能是字面量（数字/字符串/布尔/None/列表/字典）`, ctx.src, v.pos);
        }
    }

    if (params.length === 0) {
        // 形参没解析出来（operators.py 里格式变了才会发生）：退回"位置实参个数 = in_arity"
        if (!arities.includes(args.length)) {
            fail(`算子 ${fn} 需要 ${needTxt} 个输入，实际给了 ${args.length} 个`, ctx.src, node.pos);
        }
    } else {
        // 输入要给齐（位置或按名字都行），且不能重复给
        const covered = new Set();
        args.forEach((_, i) => {
            if (i < params.length) covered.add(params[i]);
        });
        for (const k of Object.keys(kwargs)) if (isInputName(k)) covered.add(k);
        if (!arities.includes(covered.size)) {
            fail(
                `算子 ${fn} 需要 ${needTxt} 个输入（${params.slice(0, maxIn).join(", ")}），` +
                    `实际给了 ${covered.size} 个`,
                ctx.src,
                node.pos,
            );
        }
    }

    // 位置实参递归校验（分组取数在这里是合法的：算子的直接输入就是它的用武之地）
    for (const a of args) infer(a, ctx);
    return T_UNKNOWN;
}

function checkRef(node, ctx) {
    const { args, kwargs } = node;
    if (args.length < 1) fail("ref() 至少要给一个字段名", ctx.src, node.pos);
    // 位置参数可给多个：按顺序取第一个在日志里存在的（同义改名候选组）；
    // 实例写法写在字段名里（`topic[2].field` / `topic[:].field`），候选组要同实例。
    const given = new Set();
    const instForms = new Set();
    let inst = 0;
    args.forEach((a, i) => {
        if (a.k !== "str") {
            fail(
                'ref() 的每个位置参数都必须是字段名字符串，如 ref("vehicle_imu_status[:].accel_clipping")',
                ctx.src,
                a.pos,
            );
        }
        const parsed = splitFieldRef(a.v);
        if (!parsed) {
            fail(
                `ref() 的字段名必须是 topic.field 形式（实例写在 topic 后：topic[2].field / topic[:].field），` +
                    `实际是 ${JSON.stringify(a.v)}`,
                ctx.src,
                a.pos,
            );
        }
        if (given.has(a.v)) fail(`ref() 的候选里有重复的字段名 ${a.v}`, ctx.src, a.pos);
        given.add(a.v);
        instForms.add(JSON.stringify(parsed.inst));
        if (i === 0) inst = parsed.inst;
    });
    if (instForms.size > 1) {
        fail("ref() 候选组里的实例写法不一致（要么都写 [N]/[:]，要么都不写）", ctx.src, node.pos);
    }
    for (const [k, v] of Object.entries(kwargs)) {
        if (!REF_KEYS.has(k)) {
            fail(
                `ref() 不认识修饰键 ${k}（可用：${[...REF_KEYS].join(" / ")}；` +
                    `要指定实例请写进字段名：ref("topic[2].field")，[:] = 所有实例）`,
                ctx.src,
                v.pos,
            );
        }
        if (k === "alias") {
            const ok = v.k === "str" || (v.k === "list" && v.items.every((x) => x.k === "str"));
            if (!ok) fail("ref(..., alias=) 必须是字符串或字符串列表", ctx.src, v.pos);
        } else if (k === "unit") {
            if (v.k !== "str" || !v.v.trim()) {
                fail(
                    'ref(..., unit=) 必须是单位名字符串（如 "deg" / "m"），表示**期望输出的单位**；不写就是不换算',
                    ctx.src,
                    v.pos,
                );
            }
        }
    }
    return isGroupInst(inst) ? T_GROUPS : T_UNKNOWN;
}

/** 剥掉最外层的 _try(...)（多输出算子写在 _try 里时，它仍是「顶层调用」） */
function unwrapTry(node) {
    if (node?.k === "call" && node.fn === "_try" && node.args.length === 1 && Object.keys(node.kwargs).length === 0) {
        return node.args[0];
    }
    return node;
}

/** 只有"日志里写了 ver_sw_release"时才有值的固件版本号；老日志上它们是 None */
const FW_VERSION_VARS = new Set(["FW_MAJOR"]);

/**
 * 固件版本号要先判 None 才能做大小比较：`ver_sw_release` 只有较新的 PX4 才写进日志，老日志上
 * `FW_MINOR` 是 None，`None >= 15` 在 Python 里抛异常 → 整条规则被判"算不出来"→ 静默失效。
 * 所以 `a if FW_MINOR >= 15 else b` 构建期就拦下，逼你补上
 * `a if (FW_MINOR is None or FW_MINOR >= 15) else b`
 * （"版本未知当作新版"与引擎 `_match_firmware` 口径一致；ref(..., when_fw=) 由引擎内部处理）。
 */
function checkFirmwareGuards(root, ctx) {
    const ordered = new Map(); // 变量 -> 第一次做大小比较的位置
    const guarded = new Set(); // 明判过 is None / is not None 的变量

    (function walk(n) {
        if (!n || typeof n !== "object") return;
        if (Array.isArray(n)) {
            n.forEach(walk);
            return;
        }
        if (n.k === "cmp") {
            if (["<", "<=", ">", ">="].includes(n.op)) {
                for (const side of [n.l, n.r]) {
                    if (side?.k === "name" && FW_VERSION_VARS.has(side.name) && !ordered.has(side.name)) {
                        ordered.set(side.name, n.pos);
                    }
                }
            }
            if (n.op === "is" || n.op === "is not") {
                for (const [x, y] of [
                    [n.l, n.r],
                    [n.r, n.l],
                ]) {
                    const isNone = y?.k === "const" && y.v === null;
                    if (x?.k === "name" && FW_VERSION_VARS.has(x.name) && isNone) guarded.add(x.name);
                }
            }
        }
        for (const [k, v] of Object.entries(n)) {
            if (k === "pos" || k === "k") continue;
            walk(v);
        }
    })(root);

    for (const [name, pos] of ordered) {
        if (guarded.has(name)) continue;
        fail(
            `${name} 与数字做了大小比较，但没先判它是不是 None。` +
                `老固件（日志里没写 ver_sw_release）的 ${name} 就是 None，\`None >= N\` 会抛异常、` +
                `**整条规则静默失效**（不报错也不出结论）。请补上另一半：` +
                `\`${name} is None or ${name} >= N\`；或改用 ref(..., when_fw=">=N") 由引擎处理这档`,
            ctx.src,
            pos,
        );
    }
}

/**
 * 校验一条 compute 表达式。
 * @param {string} src   表达式原文；@param {object} ctx { signatures, builtinVars, declaredVars }
 * @returns {{targets: string[], value: object, type: string}}
 */
export function validateCompute(src, ctx) {
    const text = String(src).trim();
    const { targets, value } = parseCompute(text);
    const eff = unwrapTry(value);
    const state = {
        src: text,
        signatures: ctx.signatures,
        // 类型表跨语句共享：前面赋值的变量的粗类型，后面能用来抓明显的不一致
        types: ctx.types ?? new Map(),
        topCall: eff,
        tryAllowed: true,
    };

    const seen = new Set();
    for (const t of targets) {
        if (t.startsWith("__")) fail(`变量名 ${t} 以 __ 开头（保留给引擎内部）`, text, 0);
        if (seen.has(t)) fail(`变量名 ${t} 在同一条表达式里重复`, text, 0);
        if (ctx.signatures[t]) fail(`变量名 ${t} 与算子重名，两者会互相遮挡`, text, 0);
        if (ctx.builtinVars?.has(t)) fail(`变量名 ${t} 与内置变量重名，两者会互相遮挡`, text, 0);
        seen.add(t);
    }

    const rhsType = infer(value, state);
    checkFirmwareGuards(value, state);

    // 左值个数要与右侧算子的输出数一致
    if (eff.k === "call") {
        const sig = ctx.signatures[eff.fn];
        if (sig) {
            if (sig.out_arity !== targets.length) {
                fail(
                    `算子 ${eff.fn} 有 ${sig.out_arity} 个输出，左边给了 ${targets.length} 个变量` +
                        (sig.out_arity > 1
                            ? `（应写成 ${sig.out_names.join(", ") || "多个名字"} = ${eff.fn}(...)）`
                            : ""),
                    text,
                    eff.pos,
                );
            }
        } else if (eff.fn === "_ref" && targets.length !== 1) {
            fail("ref() 只产出一个值，左边只能有一个变量", text, eff.pos);
        }
    } else if (targets.length !== 1) {
        fail("只有算子调用能同时给多个变量赋值，这里有多个左值而右边不是算子调用", text, value.pos);
    }

    return { targets, value, type: rhsType };
}

/**
 * 校验一串 compute（按顺序，后面的能用前面赋值的变量）。
 * @returns {Map<string,string>} 本规则所有变量的粗类型
 */
export function validateComputeList(list, ctx) {
    const types = new Map();
    const declared = new Set();
    list.forEach((src, i) => {
        const where = `第 ${i + 1} 条 compute`;
        let r;
        try {
            r = validateCompute(src, { ...ctx, declaredVars: declared, types });
        } catch (err) {
            throw new Error(`${where}：${err.message}`);
        }
        // 引用的裸名字要在本条之前已经赋值（字段引用是 attr 节点，不在其列）
        for (const name of collectNames(r.value)) {
            // _ref / _try 是语法层，has_topic / _cfg / log_ok 是引擎注入的函数，都不是变量
            if (
                ctx.signatures[name] ||
                ["_ref", "_try", "has_topic", "_cfg", "log_ok"].includes(name) ||
                KNOWN_BUILTINS.has(name)
            )
                continue;
            if (!declared.has(name) && !ctx.builtinVars?.has(name) && !/^[A-Z][A-Z0-9_]*$/.test(name)) {
                throw new Error(
                    `${where}：引用了未声明的名字 ${name}` + `（要么在本条之前用赋值声明，要么是内置变量）`,
                );
            }
        }
        for (const t of r.targets) {
            declared.add(t);
            types.set(t, r.type);
        }
    });
    return types;
}

/**
 * 抽出表达式里的字段引用（`ref(...)` 与裸写的 `topic.field`），供构建期做字段级查表
 * （目前是 `unit=` 的源单位解析）。返回 `[{fields: ["topic.field", …], instance?, alias?, when_fw?, unit?}, …]`，
 * 一条 ref 一项，`fields` 是它的候选组（按书写顺序）。
 */
export function collectRefs(src) {
    const { value } = parseCompute(String(src).trim());
    const out = [];
    (function walk(n) {
        if (!n || typeof n !== "object") return;
        if (Array.isArray(n)) {
            n.forEach(walk);
            return;
        }
        if (n.k === "call" && n.fn === "_ref") {
            const item = { fields: n.args.filter((a) => a.k === "str").map((a) => a.v) };
            for (const [k, v] of Object.entries(n.kwargs)) {
                if (v.k === "str" || v.k === "num" || v.k === "const") item[k] = v.v;
                else if (k === "alias") item.alias = v.k === "list" ? v.items.map((x) => x.v) : v.v;
            }
            if (item.fields.length) out.push(item);
        } else if (n.k === "attr" && typeof n.topic === "string") {
            out.push({ fields: [`${n.topic}.${n.field}`] });
        }
        for (const [k, v] of Object.entries(n)) {
            if (k === "pos" || k === "k") continue;
            walk(v);
        }
    })(value);
    return out;
}

/**
 * 预设（`plot/*.yml`）里的一个取数声明串 → 结构化描述。只认三种形态
 * （图上要算术请写进预设的 `compute` 节点，别在这里藏表达式）：
 * 裸字段引用 `topic.field`（要实例 / 单位 / 候选组就得包 ref）、
 * `ref("新名", "旧名", unit="deg")`（与规则同一套候选组与单位语法）、
 * `compute` 里赋过值的变量名。一项就是一条线：多条写成 YAML 列表，别塞逗号（逗号串已退役）。
 *
 * @param {object} opts { signatures, builtinVars, declaredVars }
 * @returns {{kind:"field",fields:string[],unit?:string,alias?:string[]}|{kind:"var",name:string}}
 */
export function checkFieldItem(src, opts = {}) {
    const text = String(src).trim();
    const nodes = parseExprList(text);
    if (nodes.length !== 1) {
        throw new Error(
            `一项只能写一个取数声明（实际写了 ${nodes.length} 个）——` +
                "多条线请写成 YAML 列表，一行一项（或 [甲, 乙]）",
        );
    }
    const node = nodes[0];
    if (node.k === "attr") {
        // topic 前缀是 name / sub(name)[inst] / 嵌套 attr（esc_status.esc[0].esc_rpm）的递归链：
        // 中间段是数组字段（可带自己的元素下标），重建出完整引用串交给 FIELD_REF 校验
        const prefix = collectRefPrefix(node.topic);
        if (prefix) {
            const full = `${prefix}.${node.field}`;
            if (!FIELD_REF.test(full)) {
                fail(`不是合法的字段引用：${full}（topic[实例].字段[下标]，中间段可带元素下标）`, text, node.pos);
            }
            return { kind: "field", fields: [full] };
        }
    }
    if (node.k === "call" && node.fn === "_ref") {
        // 复用规则那套 ref 校验（位置实参要是字符串、候选组实例写法一致、修饰键只有 alias/unit）
        checkRef(node, {
            src: text,
            signatures: opts.signatures ?? {},
            builtinVars: opts.builtinVars,
            types: new Map(),
            topCall: node,
            tryAllowed: false,
        });
        const out = { kind: "field", fields: node.args.map((a) => a.v) };
        if (node.kwargs.unit) out.unit = node.kwargs.unit.v;
        if (node.kwargs.alias) {
            out.alias =
                node.kwargs.alias.k === "list" ? node.kwargs.alias.items.map((x) => x.v) : [node.kwargs.alias.v];
        }
        return out;
    }
    if (node.k === "name") {
        if (!opts.declaredVars?.has(node.name)) {
            fail(
                `引用了没有赋值的名字 ${node.name}——图上要算新量请写在预设的 compute 节点里` +
                    "（写法与规则的 compute 相同）",
                text,
                node.pos,
            );
        }
        return { kind: "var", name: node.name };
    }
    // 下标节点：字段引用末尾再下元素下标（vehicle_torque_setpoint[1].xyz[0] 的 [0]、
    // actuator_outputs[1].output[0]）。v 是 attr 节点，整条链完整重建——此前这里把
    // 实例下标与元素下标全丢了（既有的静默取数错误，actuator-controls 的候选线踩过）。
    if (node.k === "sub" && node.v?.k === "attr") {
        const full = collectRefPrefix(node);
        if (full) {
            if (!FIELD_REF.test(full)) {
                fail(`不是合法的字段引用：${full}（topic[实例].字段[下标]，中间段可带元素下标）`, text, node.pos);
            }
            return { kind: "field", fields: [full] };
        }
    }
    fail(
        `只能是字段引用（topic.field，或 ref("a.b", "c.d", unit="deg")）或 compute 里赋过值的变量名；` +
            "算术与函数调用请写进 compute 节点",
        text,
        node.pos,
    );
}

/** 从 name / sub / attr 的嵌套链重建完整引用串：
 *  `name("esc_status")` → "esc_status"；`sub(attr(...), [0])` → 前缀 + "[0]"；
 *  `attr(topic=..., field="esc")` → 前缀 + ".esc"。链里出现其它表达式 → null。
 *  （各级下标与中间字段段都保留，checkFieldItem 拿它拼取数串；重建后过 FIELD_REF 校验。） */
function collectRefPrefix(node) {
    if (!node) return null;
    // name.field 路径里 attr.topic 直接存的是字符串（{ k: "attr", topic: "esc_status", ... }）
    if (typeof node === "string") return node;
    if (node.k === "name") return node.name;
    if (node.k === "sub") {
        const base = collectRefPrefix(node.v);
        if (base == null) return null;
        return `${base}${reconstructInstSuffix(node.slice)}`;
    }
    if (node.k === "attr") {
        const base = collectRefPrefix(node.topic);
        if (base == null) return null;
        return `${base}.${node.field}`;
    }
    return null;
}

/** 把 slice 节点数组重建为下标字符串，如 [slice(start=null,stop=null)] → "[:]" */
function reconstructInstSuffix(slices) {
    return slices
        .map((s) => {
            if (s.k === "slice") {
                const start = s.start != null ? String(s.start) : "";
                const stop = s.stop != null ? String(s.stop) : "";
                return `[${start}:${stop}]`;
            }
            if (s.k === "num") return `[${s.v}]`;
            return `[${s.v}]`;
        })
        .join("");
}

/** 收集表达式里引用到的裸变量名（不含字段引用的 topic、不含算子名） */
function collectNames(node, out = new Set()) {
    if (!node || typeof node !== "object") return out;
    if (Array.isArray(node)) {
        node.forEach((x) => collectNames(x, out));
        return out;
    }
    if (node.k === "name") {
        out.add(node.name);
        return out;
    }
    if (node.k === "call") out.add(node.fn);
    // sub 节点的 v 如果是裸 name，那是 topic 名（如 estimator_status[:]），不收集
    if (node.k === "sub" && node.v?.k === "name") {
        node.slice.forEach((x) => collectNames(x, out));
        return out;
    }
    for (const [k, v] of Object.entries(node)) {
        if (k === "pos" || k === "k" || k === "fn") continue;
        collectNames(v, out);
    }
    return out;
}
// ─────────────────────────── 入口 ───────────────────────────

/**
 * compute 的每一项都得是字符串表达式。早先还支持"算子节点"写法（`- {out: x, from: a.b, op: max}`），
 * 由构建期编译成等价表达式；全部规则迁移完后删掉那条路——同一个意思只留一种写法，
 * 两套并存的代价是读者要同时认两套，收益只是迁移期的过渡便利。
 */
export function normalizeCompute(raw, where) {
    if (typeof raw !== "string") {
        throw new Error(
            `${where}: compute 的每一项都必须是字符串表达式（写法见指南的「如何编写知识规则」§4）。` +
                `算子节点写法已移除——\`- {out: x, from: a.b, op: max}\` 请改写成 \`- x = max(a.b)\`；` +
                `取数修饰写在 ref(...) 上：\`- y = f(ref("a.b[:]"))\``,
        );
    }
    const text = raw.trim();
    if (!text) throw new Error(`${where}: compute 表达式是空的`);
    return text;
}
