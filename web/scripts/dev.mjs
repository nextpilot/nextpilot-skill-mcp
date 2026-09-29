/**
 * Dev 启动器：一次 `pnpm dev` 同时起「知识热重建」与「Next 开发服务器」。
 * 知识库是编译型内容，缺这段就会「改了规则没反应」：Next 热更新 web/ 的代码，
 * `build-knowledge.mjs --watch` 重编译 knowledge/（产物是入库的 generated 文件），Next 才看得到。
 * 站点内容（guide/skills/mcp）真源就在 web/content/ 下、运行期直接读盘，不需要拷贝。
 * 不装 concurrently / npm-run-all：两个子进程 + 一次信号转发不值得多一个要跟着锁文件维护的依赖。
 * 用法（web/ 下）：node scripts/dev.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");

/** 用当前这个 node 可执行文件跑子脚本，避免依赖 PATH 里恰好有对的 node */
const NODE = process.execPath;
const DEV_PORT = parseInt(process.env.PORT, 10) || 3000;

const children = [];
let shuttingDown = false;

function run(args, label) {
    // stdio: "inherit" 让两个子进程输出直通终端，不加前缀（加了会打乱 Next 的进度条与 [sync] 行）
    const child = spawn(NODE, args, { cwd: webRoot, stdio: "inherit" });
    child.on("exit", (code, signal) => {
        if (shuttingDown) return;
        // 任一子进程非正常退出就整体退出：留着另一半没意义，还会让「dev 正在跑」的假象持续
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

/** 检测 DEV_PORT 是否被占用：Windows 上尝试杀掉占用进程，非 Windows 直接报错退出 */
function checkPort(port) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", (err) => {
            if (err.code !== "EADDRINUSE") return reject(err);
            server.close();

            if (process.platform !== "win32") {
                console.error(`\n[dev] 端口 ${port} 被占用，请手动释放后重试（如 lsof -ti:${port} | xargs kill）。`);
                process.exit(1);
            }

            // Windows：用 netstat 查 PID
            const netstat = spawnSync("netstat", ["-ano"], { stdio: "pipe" });
            const lines = netstat.stdout.toString().split("\n");
            const re = new RegExp(`:${port}\\s+.*LISTENING\\s+(\\d+)`);
            let pid = null;
            for (const line of lines) {
                const m = line.match(re);
                if (m) {
                    pid = m[1];
                    break;
                }
            }

            if (!pid) {
                console.error(`\n[dev] 端口 ${port} 被占用但未查到进程，可能是系统保留端口。`);
                process.exit(1);
            }

            console.log(`[dev] 端口 ${port} 被 PID ${pid} 占用，尝试清理…`);
            const kill = spawnSync("taskkill", ["/PID", pid, "/F"], {
                stdio: "pipe",
            });
            if (kill.status !== 0) {
                const errMsg = kill.stderr.toString().trim();
                console.error(`\n[dev] 清理 PID ${pid} 失败：${errMsg}\n请手动执行 taskkill /PID ${pid} /F 后重试。`);
                process.exit(1);
            }
            console.log(`[dev] PID ${pid} 已终止，继续启动。`);
            resolve();
        });
        server.once("listening", () => {
            server.close();
            resolve();
        });
        server.listen(port);
    });
}

// Ctrl+C：转发给两个子进程，别让 Next 变成孤儿进程继续占着端口
for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
        console.log(`\n[dev] 收到 ${sig}，停止…`);
        shutdown(0);
    });
}

// 先构建（阻塞直到成功）。失败就直接退出，别让 Next 起在陈旧知识库上。
for (const [args, label] of [[["scripts/build-knowledge.mjs"], "知识构建"]]) {
    console.log(`[dev] ${label}…`);
    const r = spawnSync(NODE, args, { cwd: webRoot, stdio: "inherit" });
    if (r.status !== 0) {
        console.error(`[dev] ${label}失败（code=${r.status}），未启动。先修掉上面的报错。`);
        process.exit(r.status ?? 1);
    }
}

// 启动前检测端口占用：Windows 上 Ctrl+C 后 Next.js 容易残留为孤儿进程；
// net.createServer 试端口比解析 netstat 轻量，占用就 taskkill 清理。
await checkPort(DEV_PORT);

run(["scripts/build-knowledge.mjs", "--watch"], "build-knowledge --watch");
run(["node_modules/next/dist/bin/next", "dev"], "next dev");
console.log("[dev] 已启动：知识热重建 + Next 开发服务器（Ctrl+C 一起停）");

// 预热首页：Turbopack 懒编译，第一个请求才走编译器。等 Next 就绪后自动 GET / 预热，
// 用户打开浏览器时首页已是热的。试 3 次，间隔 2s → 4s → 6s，任一次成功就停。
let warmAttempt = 0;
const warmMaxAttempts = 3;
const warm = async () => {
    while (warmAttempt < warmMaxAttempts) {
        warmAttempt++;
        await new Promise((r) => setTimeout(r, warmAttempt * 2000));
        try {
            const res = await fetch(`http://localhost:${DEV_PORT}/`);
            if (res.ok) {
                console.log("[dev] 预热完成（首页已编译）");
                return;
            }
        } catch {
            // Next 可能还没完全就绪，等下一轮
        }
    }
    console.log("[dev] 预热跳过（超时，手动打开首页即可）");
};
warm();
