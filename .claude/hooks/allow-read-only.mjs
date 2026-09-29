#!/usr/bin/env node
/**
 * PreToolUse(Bash) hook：只读命令自动放行。
 *
 * 命中时输出 {"hookSpecificOutput":{"permissionDecision":"allow"}}，跳过权限提示直接执行；
 * 其余情况（写文件 / 推送 / 删除 / 拿不准）不输出、exit 0，交回正常流程。
 * 注意 hook 给出的 allow 优先级高于 deny 规则（本项目目前没有 deny 规则）。
 * 白名单是纯加法：这里放行不了的，行为与没有本 hook 时完全一致。
 *
 * 判据是「最保守地看，整条命令都是只读」：
 *   1. 先抹掉无害重定向（`>/dev/null`、`2>&1`），它们不改变"是否只读"这个判断；
 *   2. 剩下文本里凡有未加引号的重定向、命令替换（$( ) / 反引号）、后台 `&` → 不放行；
 *   3. 用 `|` `&&` `||` `;` 换行 拆段，每段都得只读（`git log | head` 放行，
 *      `git log | tee f` 因 tee 不在白名单失败）；
 *   4. 程序按白名单；git 再按「只读子命令 + 参数护栏」判断（`git log --output=file`
 *      这类"看着像读、其实会写"的参数被逐个挡下）。
 *
 * 任何内部异常、超时、解析不出 → 一律 exit 0 无输出，退回正常流程，不会误拦。
 */

const READ_ONLY_PROGRAMS = new Set([
    // 文本 / 结构查看
    "ls",
    "cat",
    "head",
    "tail",
    "wc",
    "grep",
    "egrep",
    "fgrep",
    "rg",
    "jq",
    "diff",
    "cmp",
    "comm",
    "cut",
    "tr",
    "uniq",
    "sort",
    "nl",
    "tac",
    "rev",
    "paste",
    "join",
    "fold",
    "expand",
    "column",
    "od",
    "xxd",
    "hexdump",
    "strings",
    // 文件系统只读查询
    "file",
    "stat",
    "du",
    "df",
    "tree",
    "realpath",
    "readlink",
    "basename",
    "dirname",
    "find",
    "which",
    "type",
    // 校验和
    "sha256sum",
    "md5sum",
    "shasum",
    "cksum",
    // 环境 / 时间 / 数值
    "date",
    "echo",
    "printf",
    "pwd",
    "whoami",
    "hostname",
    "uname",
    "nproc",
    "printenv",
    "seq",
    "sleep",
    "true",
    "false",
    "test",
    "expr",
    "bc",
    // 只改 shell 状态
    "cd",
    "pushd",
    "popd",
    // 网络只读探测
    "ping",
    "host",
    "dig",
    "nslookup",
    // 版本控制：子命令另判
    "git",
]);

/** 纯只读的 git 子命令（不需要再看参数） */
const GIT_READ_SUBCOMMANDS = new Set([
    "status",
    "diff",
    "log",
    "show",
    "blame",
    "grep",
    "shortlog",
    "describe",
    "rev-list",
    "rev-parse",
    "ls-files",
    "ls-tree",
    "ls-remote",
    "cat-file",
    "hash-object",
    "name-rev",
    "merge-base",
    "check-ignore",
    "check-attr",
    "check-ref-format",
    "count-objects",
    "show-ref",
    "for-each-ref",
    "var",
    "version",
    "whatchanged",
    "get-tar-commit-id",
    "cherry",
    "annotate",
]);

/** 有只读模式也有写模式的子命令：只放行只读参数 */
const GIT_GUARDED = {
    config: (a) =>
        a.length > 0 &&
        a.some((x) =>
            /^(--get|--get-all|--get-regexp|--list|-l|--show-origin|--show-scope|--show-names|--name-only|--null|-z)$/.test(
                x,
            ),
        ),
    branch: (a) =>
        !a.some((x) =>
            /^(-[dDmMcC]|-[uU]$|--set-upstream|--unset-upstream|--edit-description|--delete|--move|--copy|--create-reflog)/.test(
                x,
            ),
        ) &&
        (a.length === 0 || a.includes("--list") || a.every((x) => x.startsWith("-"))),
    // 注意 `git tag` 无参数=列，`git tag v1.0`=建；`-l`/`--list` 是明确的只读模式
    tag: (a) =>
        !a.some((x) => /^(-[adsfmu]|--annotate|--sign|--delete|--force|--message|--file|--edit)/.test(x)) &&
        (a.length === 0 || a.includes("-l") || a.includes("--list") || a.every((x) => x.startsWith("-"))),
    remote: (a) => a.every((x) => x === "-v" || x === "--verbose"),
    stash: (a) => ["list", "show"].includes(a[0]),
    worktree: (a) => a[0] === "list",
    submodule: (a) => ["status", "summary"].includes(a[0]),
    notes: (a) => a.length === 0 || a[0] === "list",
    reflog: (a) => a.length === 0 || a[0] === "show",
    "symbolic-ref": (a) => {
        const rest = a.filter((x) => x !== "-q" && x !== "--short");
        return rest.length === 1;
    },
};

const FIND_WRITE_FLAGS = new Set([
    "-exec",
    "-execdir",
    "-ok",
    "-okdir",
    "-delete",
    "-fls",
    "-fprint",
    "-fprint0",
    "-fprintf",
]);

/** 抹掉无害重定向：写到 /dev/null、以及 fd 复制（2>&1） */
function maskHarmlessRedirects(cmd) {
    return cmd
        .replace(/(?:\d+|&)?>>?\s*\/dev\/null/g, " ")
        .replace(/&>>\s*\/dev\/null/g, " ")
        .replace(/(?:\d+|&)?>>?\s*&\s*\d+/g, " ")
        .replace(/\d*>&\d*/g, " ");
}

/**
 * 按 shell 运算符拆段，同时报告是否出现"不放行"的构造。
 * 引号内的运算符不拆；引号不闭合视为可疑。
 */
function splitSegments(cmd) {
    const segments = [];
    let unsafe = false;
    let cur = "";
    let quote = null;
    let i = 0;
    while (i < cmd.length) {
        const ch = cmd[i];
        if (quote) {
            if (ch === "\\" && quote === '"') {
                cur += ch + (cmd[i + 1] ?? "");
                i += 2;
                continue;
            }
            cur += ch;
            if (ch === quote) quote = null;
            else if (ch === "`" && quote === '"') unsafe = true;
            else if (ch === "$" && cmd[i + 1] === "(" && quote === '"') unsafe = true;
            i += 1;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            cur += ch;
            i += 1;
            continue;
        }
        if (ch === "\\") {
            cur += ch + (cmd[i + 1] ?? "");
            i += 2;
            continue;
        }
        if (ch === "`" || (ch === "$" && cmd[i + 1] === "(") || ch === ">" || ch === "<") {
            unsafe = true;
            cur += ch;
            i += 1;
            continue;
        }
        if (ch === "&") {
            if (cmd[i + 1] === "&") {
                segments.push(cur);
                cur = "";
                i += 2;
                continue;
            }
            unsafe = true; // 后台执行
            cur += ch;
            i += 1;
            continue;
        }
        if (ch === "|") {
            if (cmd[i + 1] === "|") i += 1;
            segments.push(cur);
            cur = "";
            i += 1;
            continue;
        }
        if (ch === ";" || ch === "\n" || ch === "\r") {
            segments.push(cur);
            cur = "";
            i += 1;
            continue;
        }
        cur += ch;
        i += 1;
    }
    if (quote) unsafe = true;
    segments.push(cur);
    return { segments, unsafe };
}

/** 去引号的简单分词（够用即可：只拿来认程序名与参数） */
function tokenize(seg) {
    const out = [];
    let cur = "";
    let quote = null;
    let has = false;
    for (let i = 0; i < seg.length; i += 1) {
        const ch = seg[i];
        if (quote) {
            if (ch === quote) quote = null;
            else if (ch === "\\" && quote === '"') cur += seg[(i += 1)] ?? "";
            else cur += ch;
            has = true;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            has = true;
            continue;
        }
        if (ch === "\\") {
            cur += seg[(i += 1)] ?? "";
            has = true;
            continue;
        }
        if (ch === " " || ch === "\t") {
            if (has) {
                out.push(cur);
                cur = "";
                has = false;
            }
            continue;
        }
        cur += ch;
        has = true;
    }
    if (has) out.push(cur);
    return out;
}

function gitReadOnly(args) {
    let i = 0;
    // 跳过 git 的全局选项，找到子命令
    while (i < args.length) {
        const a = args[i];
        if (a === "-C" || a === "-c" || a === "--git-dir" || a === "--work-tree" || a === "--namespace") {
            i += 2;
            continue;
        }
        if (
            /^(-C|-c|--git-dir=|--work-tree=|--namespace=)/.test(a) ||
            a === "--no-pager" ||
            a === "--no-optional-locks" ||
            a === "--bare" ||
            a === "--literal-pathspecs"
        ) {
            i += 1;
            continue;
        }
        break;
    }
    const sub = args[i];
    const rest = args.slice(i + 1);
    if (!sub) return false;
    if (sub === "--version" || sub === "--help" || sub === "-v") return true;
    // `--output=<file>` 让 log/diff 这类读命令也写文件，单独挡下
    if (rest.some((x) => x.startsWith("--output"))) return false;
    if (sub === "hash-object" && rest.some((x) => x === "-w" || x === "--stdin")) return false;
    if (GIT_READ_SUBCOMMANDS.has(sub)) return true;
    const guard = GIT_GUARDED[sub];
    return guard ? guard(rest) : false;
}

function segmentIsReadOnly(tokens) {
    let t = tokens;
    // 跳过无害前缀：timeout 30 <cmd>
    if (t[0] === "timeout") {
        t = t.slice(1);
        while (t.length && /^\d+(\.\d+)?[smhd]?$/.test(t[0])) t = t.slice(1);
        if (!t.length) return false;
    }
    const prog = (t[0] ?? "").split("/").pop();
    const args = t.slice(1);
    if (!READ_ONLY_PROGRAMS.has(prog)) return false;
    if (prog === "git") return gitReadOnly(args);
    if (prog === "find") return !args.some((a) => FIND_WRITE_FLAGS.has(a) || /^-f(print|ls)/.test(a));
    if (prog === "sort") return !args.some((a) => a === "-o" || /^(-o.|--output)/.test(a));
    if (prog === "date") return !args.some((a) => a === "-s" || a.startsWith("--set"));
    if (prog === "rg") return !args.some((a) => a === "--pre" || a.startsWith("--pre="));
    return true;
}

function classify(cmd) {
    const { segments, unsafe } = splitSegments(maskHarmlessRedirects(cmd));
    if (unsafe) return false;
    let seen = 0;
    for (const seg of segments) {
        const tokens = tokenize(seg);
        if (!tokens.length) continue;
        seen += 1;
        if (!segmentIsReadOnly(tokens)) return false;
    }
    return seen > 0;
}

function allow(reason) {
    process.stdout.write(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "allow",
                permissionDecisionReason: reason,
            },
        }),
    );
    process.exit(0);
}

async function main() {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    let input;
    try {
        input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        process.exit(0);
    }
    if (input?.tool_name !== "Bash") process.exit(0);
    const cmd = input?.tool_input?.command;
    if (typeof cmd !== "string" || !cmd.trim()) process.exit(0);
    if (classify(cmd)) allow("只读命令：自动放行（.claude/hooks/allow-read-only.mjs）");
    process.exit(0);
}

main().catch(() => process.exit(0));
