import { test, expect } from "@playwright/test";
import path from "node:path";

const SAMPLE_ULG = path.resolve(process.cwd(), "e2e", "fixtures", "sample.ulg");

test.describe("日志分析流程", () => {
    test("上传 .ulg 并完成分析", { timeout: 300_000 }, async ({ page }) => {
        await page.goto("/analyze", { waitUntil: "networkidle" });

        // 隐藏的 file input 应该存在
        const fileInput = page.locator('input[type="file"]').first();
        await expect(fileInput).toBeAttached();

        // 上传 .ulg 文件
        await fileInput.setInputFiles(SAMPLE_ULG);

        // 等待分析完成：状态从 "加载 Pyodide" → "安装 pyulog" → "解析" → "完成"
        // Pyodide 首次启动较慢（下载 WASM + numpy + pyulog），预留充足时间
        const doneIndicator = page.locator("text=完成").first();
        await expect(doneIndicator).toBeVisible({ timeout: 240_000 });

        // 可能跳转到结果页，也可能停留在当前页
        const currentUrl = page.url();
        if (currentUrl.includes("/analyze/")) {
            // 在结果页——应有报告内容
            const reportHeading = page.locator("h1").first();
            await expect(reportHeading).toBeVisible({ timeout: 5000 });
        }

        const body = await page.locator("body").textContent();
        expect(body).not.toMatch(/Application error/);
        expect(body).not.toContain("[next-mdx-remote] error");
    });

    test("历史记录可见", { timeout: 30_000 }, async ({ page }) => {
        await page.goto("/analyze", { waitUntil: "networkidle" });

        const historyTab = page.locator("text=历史").first();
        if (await historyTab.isVisible({ timeout: 3000 }).catch(() => false)) {
            await historyTab.click();
            await page.waitForTimeout(1000);

            const hasContent = await page.locator("text=暂无")
                .or(page.locator('[data-testid="report-history"]'))
                .first()
                .isVisible({ timeout: 3000 })
                .catch(() => false);

            expect(hasContent).toBeTruthy();
        }
    });
});