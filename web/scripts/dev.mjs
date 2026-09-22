/**
 * Dev 启动器：一次 `pnpm dev` 同时起「内容热拷贝」与「Next 开发服务器」。
 *
 * 为什么需要它：内容是两段更新的，缺一段就会出现「改了没反应」——
 *   1. Next 自己热更新 `web/` 里的代码；
 *   2. `sync-content.mjs --watch` 把 `docs/guide` / `knowledge/skills` / `knowledge/mcp`
 *      这些**真源**重拷进 `.generated/`，Next 才会看到。
 * 以前第 2 步要另开一个终端手动跑 `pnpm sync:watch`，忘了就以为热更新坏了。
 * 现在两条一起起，Ctrl+C 一起停。
 *
 * 顺序：先跑一次 `sync-content` 与 `build-knowledge`（要等它们成功），再起
 * `sync-content --watch` 与 `next dev`。**Next 必须看到已同步的 `.generated/`**，
 * 所以在空内容上启动会白屏一次再自愈，不如等两秒。
 *
 * 为什么不装 concurrently / npm-run-all：两个子进程 + 一次信号转发不值得多一个依赖，
 * 而依赖一旦在链上，就得跟着锁文件与依赖审计一起维护。
 *
 * 用法（在 web/ 下）：
 *   node scripts/dev.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");

/** 用当前这个 node 可执行文件跑子脚本，避免依赖 PATH 里恰好有对的 node */
const NODE = process.execPath;

const children = [];
let shuttingDown = false;

function run(args, label) {
    // stdio: "inherit" —— 两个子进程的输出都直通终端，不额外加前缀。
    // 加了前缀会打乱 Next 自己的进度条与 sync 的 [sync] 行。
    const child = spawn(NODE, args, { cwd: webRoot, stdio: "inherit" });
    child.on("exit", (code, signal) => {
        if (shuttingDown) return;
        // 任一子进程非正常退出，就整体退出：留着另一半没有意义，
        // 且会让「dev 正在跑」的假象持续下去。
        console.log(`\n[dev] ${label} 退出（code=${code} signal=${signal}），全部停止`);
        shutdown(typeof code === "number" ? code : 1);
    });
    children.push(child);
    return child;
}

function shutdown(exitCode) {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const c of children) {
        if (c.exitCode === null && c.signalCode === null) c.kill();
    }
    // 给子进程一点时间优雅退出（Next 要收尾写 .next），再以原退出码结束
    setTimeout(() => process.exit(exitCode), 300);
}

// Ctrl+C：转发给两个子进程，别让 Next 变成孤儿进程继续占着 3000 端口
for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
        console.log(`\n[dev] 收到 ${sig}，停止…`);
        shutdown(0);
    });
}

// 先同步 + 构建（阻塞直到成功）。失败就直接退出，别让 Next 起在空内容上。
for (const [args, label] of [
    [["scripts/sync-content.mjs"], "首次内容同步"],
    [["scripts/build-knowledge.mjs"], "知识构建"],
]) {
    console.log(`[dev] ${label}…`);
    const r = spawnSync(NODE, args, { cwd: webRoot, stdio: "inherit" });
    if (r.status !== 0) {
        console.error(`[dev] ${label}失败（code=${r.status}），未启动。先修掉上面的报错。`);
        process.exit(r.status ?? 1);
    }
}

run(["scripts/sync-content.mjs", "--watch"], "sync-content --watch");
run(["scripts/build-knowledge.mjs", "--watch"], "build-knowledge --watch");
run(["node_modules/next/dist/bin/next", "dev"], "next dev");
console.log("[dev] 已启动：内容热拷贝 + 知识热重建 + Next 开发服务器（Ctrl+C 一起停）");
