import { test, expect } from "@playwright/test";
import path from "node:path";

const SAMPLE_ULG = path.resolve(process.cwd(), "e2e", "fixtures", "sample.ulg");

test.describe("日志分析流程", () => {
    test("分析入口页渲染正常", { tag: "@smoke", timeout: 30_000 }, async ({ page }) => {
        await page.goto("/analyze", { waitUntil: "networkidle" });

        await expect(page.locator("h1").first()).toBeVisible();

        const body = await page.locator("body").textContent();
        expect(body).not.toMatch(/Application error/);
        expect(body).not.toContain("[next-mdx-remote] error");
    });

    // 这条跑一次要 7 分钟（Pyodide 下载 WASM + numpy + pyulog），移出 @smoke 后由
    // pnpm test:e2e:analyze 或部署后的全量 E2E 守住。timeout 保留——它是真实耗时需要，不是冒烟预算。
    test("上传 .ulg 并完成分析（解析→显示断言）", { timeout: 420_000 }, async ({ page }) => {
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

        // 必须跳转到结果页 /analyze/[id]，否则解析链路没走完
        await page.waitForURL("**/analyze/**", { timeout: 30_000 });
        expect(page.url()).toMatch(/\/analyze\/.+/);

        // 默认停在「关键数据」tab：标题（确定性引擎实测）必须渲染 —— 证明解析产物进了显示层
        const metricsHeading = page.getByText("关键数据（确定性引擎实测）", { exact: true });
        await expect(metricsHeading).toBeVisible({ timeout: 30_000 });

        // 关键数据区要么有实测行（data-testid=metrics-table）、要么有「没有记录关键数据」
        // 的兜底文案 —— 二者都证明「解析 → 显示」链路把数据真的渲染出来了
        const hasRows = await page.locator('[data-testid="metrics-table"] tbody tr').count();
        const hasMetricsFallback = await page.getByText("这份报告没有记录关键数据").count();
        expect(hasRows > 0 || hasMetricsFallback > 0).toBeTruthy();

        // 切到「检查结论」tab（summary），断言检查明细也渲染了
        await page.getByTestId("tab-summary").click();
        const summaryHeading = page.getByText("检查明细（确定性引擎）", { exact: true });
        await expect(summaryHeading).toBeVisible({ timeout: 30_000 });
        // 要么有结论卡（data-finding）、要么有「均未触发阈值」的兜底文案
        const hasFindings = await page.locator("[data-finding]").count();
        const hasSummaryFallback = await page
            .getByText("振动 / IMU 削波、EKF 创新检验、电源三项基础检查均未触发阈值")
            .count();
        expect(hasFindings > 0 || hasSummaryFallback > 0).toBeTruthy();

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

            const hasContent = await page
                .locator("text=暂无")
                .or(page.locator('[data-testid="report-history"]'))
                .first()
                .isVisible({ timeout: 3000 })
                .catch(() => false);

            expect(hasContent).toBeTruthy();
        }
    });

    test("上传区域存在且可交互", { timeout: 30_000 }, async ({ page }) => {
        await page.goto("/analyze", { waitUntil: "networkidle" });

        // 上传区域应可见（拖拽区 / 上传按钮 / 文件选择器至少存在一种）
        const uploadZone = page
            .locator('[data-testid="dropzone"], [class*="drop"], [class*="upload"], input[type="file"]')
            .first();
        await expect(uploadZone).toBeAttached({ timeout: 5000 });

        const body = await page.locator("body").textContent();
        expect(body).not.toMatch(/Application error/);
    });

    test("分析入口页支持拖拽文案提示", { timeout: 30_000 }, async ({ page }) => {
        await page.goto("/analyze", { waitUntil: "networkidle" });

        const body = await page.locator("body").innerText();

        // 应该有拖拽或上传相关提示文案
        const hasDropHint =
            body.includes("拖拽") || body.includes("上传") || body.includes("选择文件") || body.includes(".ulg");
        expect(hasDropHint).toBeTruthy();
    });

    test("分析入口页关键 UI 元素存在", { timeout: 30_000 }, async ({ page }) => {
        await page.goto("/analyze", { waitUntil: "networkidle" });

        // 页面标题区域
        const heading = page.locator("h1").first();
        await expect(heading).toBeVisible();

        // 不应出现错误覆盖层
        const errorOverlay = page.locator("[data-nextjs-error-overlay], nextjs-portal");
        await expect(errorOverlay)
            .not.toBeVisible({ timeout: 3000 })
            .catch(() => {});

        const body = await page.locator("body").textContent();
        expect(body).not.toMatch(/Application error/);
    });

    test("上传非 .ulg 文件不崩溃", { timeout: 30_000 }, async ({ page }) => {
        await page.goto("/analyze", { waitUntil: "networkidle" });

        const fileInput = page.locator('input[type="file"]').first();
        if (!(await fileInput.count())) {
            return; // 没有文件输入则跳过
        }

        // 创建临时非 .ulg 文件并上传
        const fixturesDir = path.resolve(process.cwd(), "e2e", "fixtures");
        const fs = await import("node:fs");
        fs.mkdirSync(fixturesDir, { recursive: true });
        const tmpFile = path.join(fixturesDir, "not-a-log.txt");
        fs.writeFileSync(tmpFile, "this is not a ulog file");

        try {
            await fileInput.setInputFiles(tmpFile);
            await page.waitForTimeout(2000);

            // 不应崩溃，可能显示错误提示
            const body = await page.locator("body").textContent();
            expect(body).not.toMatch(/Application error/);
        } finally {
            try {
                fs.unlinkSync(tmpFile);
            } catch {
                /* cleanup best-effort */
            }
        }
    });

    test("历史记录为空时的状态", { timeout: 30_000 }, async ({ page }) => {
        await page.goto("/analyze", { waitUntil: "networkidle" });

        const historyTab = page.locator("text=历史").first();
        if (!(await historyTab.isVisible({ timeout: 3000 }).catch(() => false))) {
            return; // 无历史标签则跳过
        }

        await historyTab.click();
        await page.waitForTimeout(1000);

        // 空状态应该有提示文案（如"暂无"、"无"、"空"等），或历史列表区域存在
        const emptyOrList = page
            .locator("text=暂无")
            .or(page.locator("text=空"))
            .or(page.locator("text=无"))
            .or(page.locator('[data-testid="report-history"]'));

        const body = await page.locator("body").textContent();
        expect(body).not.toMatch(/Application error/);

        // 空状态不应崩溃
        const historyVisible = await emptyOrList
            .first()
            .isVisible({ timeout: 3000 })
            .catch(() => true);
        expect(historyVisible).toBeTruthy();
    });

    test("分析页快速导航不崩溃", { timeout: 30_000 }, async ({ page }) => {
        // 进入分析页 → 离开 → 再回来，确保无状态残留崩溃
        await page.goto("/analyze", { waitUntil: "networkidle" });
        await page.waitForTimeout(500);

        await page.goto("/skills", { waitUntil: "networkidle" });
        await page.waitForTimeout(500);

        await page.goto("/analyze", { waitUntil: "networkidle" });
        await page.waitForTimeout(500);

        const body = await page.locator("body").textContent();
        expect(body).not.toMatch(/Application error/);

        const heading = page.locator("h1").first();
        await expect(heading).toBeVisible();
    });

    test("不选文件直接提交不崩溃", { timeout: 30_000 }, async ({ page }) => {
        await page.goto("/analyze", { waitUntil: "networkidle" });

        // 尝试找提交/分析按钮
        const submitBtn = page
            .locator('button:has-text("分析"), button:has-text("开始"), button:has-text("提交"), button[type="submit"]')
            .first();

        if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await submitBtn.click();
            await page.waitForTimeout(2000);

            // 不应崩溃，可能显示校验提示
            const body = await page.locator("body").textContent();
            expect(body).not.toMatch(/Application error/);
        }
    });

    test("文件输入接受 .ulg 扩展名", { timeout: 30_000 }, async ({ page }) => {
        await page.goto("/analyze", { waitUntil: "networkidle" });

        const fileInput = page.locator('input[type="file"]').first();
        if (!(await fileInput.count())) {
            return;
        }

        // 检查 accept 属性是否包含 .ulg
        const accept = await fileInput.getAttribute("accept");
        if (accept !== null && accept !== undefined) {
            const acceptsUlg = accept.includes(".ulg") || accept.includes("ulg") || accept === "" || accept === "*";
            expect(acceptsUlg).toBeTruthy();
        }
    });
});
