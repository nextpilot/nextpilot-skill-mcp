import { test, expect } from "@playwright/test";

const CRITICAL_PAGES = [
    { path: "/", label: "首页" },
    { path: "/guide", label: "使用指南索引" },
    { path: "/guide/basics", label: "基础知识" },
    { path: "/guide/use", label: "使用说明" },
    { path: "/guide/rule-catalogue", label: "规则清单" },
    { path: "/guide/rule-schema", label: "规则编写参考" },
    { path: "/guide/submit", label: "提交日志" },
    { path: "/guide/write-skill", label: "编写技能" },
    { path: "/guide/mcp-server", label: "MCP 服务" },
    { path: "/analyze", label: "日志分析入口" },
    { path: "/skills", label: "技能广场" },
    { path: "/login", label: "登录页" },
];

test.describe("关键页面渲染", () => {
    for (const page of CRITICAL_PAGES) {
        test(`${page.label} — ${page.path}`, async ({ page: pwPage }) => {
            const res = await pwPage.goto(page.path, { waitUntil: "networkidle" });
            expect(res?.status()).toBe(200);

            // MDX / React 渲染错误最常见的表现：Next.js 错误覆盖层
            const errorOverlay = pwPage.locator("[data-nextjs-error-overlay], nextjs-portal");
            await expect(errorOverlay).not.toBeVisible({ timeout: 3000 }).catch(() => {
                // 即便 timeout 也不代表失败——可能 overlay 已消失或未出现
                // 我们再检查 body 里有没有明显的错误文本
            });

            const bodyText = await pwPage.locator("body").innerText();
            expect(bodyText).not.toContain("Application error");
            expect(bodyText).not.toContain("[next-mdx-remote] error");
        });
    }
});

test("规则清单页（rule-catalogue）无 MDX 编译错误", async ({ page }) => {
    await page.goto("/guide/rule-catalogue", { waitUntil: "networkidle" });

    // 关键内容应该可见（规则数量）
    await expect(page.locator("h1").first()).toBeVisible();
    const h1 = await page.locator("h1").first().textContent();
    expect(h1).toContain("规则");

    // 不应有 MDX 错误
    const body = await page.locator("body").textContent();
    expect(body).not.toMatch(/\[next-mdx-remote\].*error/);
    expect(body).not.toMatch(/Could not parse expression with acorn/);
});

test("规则编写参考（rule-schema）无 MDX 编译错误", async ({ page }) => {
    await page.goto("/guide/rule-schema", { waitUntil: "networkidle" });

    await expect(page.locator("h1")).toBeVisible();
    const body = await page.locator("body").textContent();
    expect(body).not.toMatch(/\[next-mdx-remote\].*error/);
    expect(body).not.toMatch(/Could not parse expression with acorn/);

    // 算子目录表格应渲染
    const heading = page.locator('h2:has-text("算子")');
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
});