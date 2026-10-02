import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
    testDir: "./e2e",
    timeout: 480_000,
    expect: { timeout: 10_000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [["list"], ["html", { open: "never" }]],

    use: {
        baseURL: BASE_URL,
        trace: "on-first-retry",
        video: "retain-on-failure",
        // 无 GPU 环境尝试让 WebGL 走 SwiftShader 软渲染（ANGLE on Vulkan-SwiftShader）。
        // 沙箱实测仍可能全部失败（GPU 进程起不来，e2e 已按 WebGL 能力分流断言），
        // 但有 Vulkan loader 的 CI/机器上这段能让 3D 视图走全量断言；对其他测试无副作用。
        launchOptions: {
            args: ["--use-gl=angle", "--use-angle=vulkan", "--enable-features=Vulkan", "--enable-unsafe-swiftshader"],
        },
    },

    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],

    webServer: {
        command: `pnpm exec next dev --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000, // webServer 启动超时（dev 编译一个页面足够）
        cwd: __dirname,
    },
});
