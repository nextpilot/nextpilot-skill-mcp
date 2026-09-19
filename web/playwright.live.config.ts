import { defineConfig, devices } from "@playwright/test";

// 针对**已部署**站点跑 E2E：不启动本地 dev server，直接打 SMOKE_BASE_URL。
//
// 用途（见 .github/workflows/deploy.yml）：
//   1. 部署后「全套 E2E」—— 验证线上构建产物的端到端质量（含真实上传 .ulg → Pyodide 解析 → 显示）；
//   2. 升级部署后冒烟（替代原来只 curl /ping 的弱冒烟）——
//      `playwright test --config playwright.live.config.ts --grep '@smoke'`。
//
// 与默认 playwright.config.ts 的唯一区别：baseURL 取自环境变量、且**不**启动 webServer。
const BASE_URL = process.env.SMOKE_BASE_URL;
if (!BASE_URL) {
    throw new Error("SMOKE_BASE_URL 必须设置（部署后冒烟目标站点，如 https://skill.nextpilot.org）");
}

export default defineConfig({
    testDir: "./e2e",
    timeout: 300_000,
    expect: { timeout: 15_000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: BASE_URL,
        trace: "on-first-retry",
        video: "retain-on-failure",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    // 关键：没有 webServer —— 打的是线上站点本身
});
