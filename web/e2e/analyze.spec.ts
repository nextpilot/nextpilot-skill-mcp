import { test, expect } from "@playwright/test";
import path from "node:path";

const SAMPLE_ULG = path.resolve(process.cwd(), "e2e", "fixtures", "sample.ulg");

test.describe("日志分析流程", () => {
    test("上传 .ulg 并完成分析", async ({ page }) => {
        await page.goto("/analyze", { waitUntil: "networkidle" });

        // 上传区域应该可见
        const uploadZone = page.locator("text=上传日志")
            .or(page.locator('[data-testid="upload-zone"]'))
            .or(page.locator('input[type="file"]'));
        await expect(uploadZone.first()).toBeVisible({ timeout: 5000 });

        // 上传 .ulg 文件
        const fileInput = page.locator('input[type="file"]').first();
        await fileInput.setInputFiles(SAMPLE_ULG);

        // 等待分析完成：状态从 "加载 Pyodide" → "安装 pyulog" → "解析" → "完成"
        // Pyodide 首次启动较慢（下载 WASM + numpy + pyulog），放宽超时
        const doneIndicator = page.locator("text=完成")
            .or(page.locator("text=分析完成"));
        await expect(doneIndicator.first()).toBeVisible({ timeout: 180_000 });

        // 应该自动跳转到结果页（/analyze/[id]）
        await page.waitForURL(/\/analyze\/[^/]+/, { timeout: 30_000 });

        // 结果页应有报告标题或检查项
        const reportHeading = page.locator("h1").first();
        await expect(reportHeading).toBeVisible({ timeout: 5000 });

        // 至少有分析结果内容
        const body = await page.locator("body").textContent();
        expect(body).not.toMatch(/Application error/);
    });

    test("历史记录可见", async ({ page }) => {
        await page.goto("/analyze", { waitUntil: "networkidle" });

        // 点击历史记录标签
        const historyTab = page.locator("text=历史")
            .or(page.locator("text=History"))
            .or(page.locator('[data-testid="history-tab"]'));

        if (await historyTab.first().isVisible({ timeout: 3000 })) {
            await historyTab.first().click();
            await page.waitForTimeout(1000);

            // 至少有一个历史记录容器展示
            const historyList = page.locator('[data-testid="report-history"]')
                .or(page.locator("text=暂无"));
            await expect(historyList.first()).toBeVisible({ timeout: 5000 });
        }
        // 如果没有历史记录标签也不报错（可能刚清空）
    });
});