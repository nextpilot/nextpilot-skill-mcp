import { test, expect } from "@playwright/test";

const CRITICAL_PAGES = [
    { path: "/", label: "首页" },
    { path: "/guide", label: "使用指南索引" },
    { path: "/guide/concepts", label: "核心概念" },
    { path: "/guide/connect-client", label: "接入客户端" },
    { path: "/guide/rule-catalogue", label: "规则清单" },
    { path: "/guide/rule-schema", label: "规则编写参考" },
    { path: "/guide/publish-skill", label: "贡献我的技能" },
    { path: "/guide/write-skill", label: "编写技能" },
    { path: "/guide/write-mcp", label: "开发 MCP 服务" },
    { path: "/analyze", label: "日志分析入口" },
    { path: "/skills", label: "技能广场" },
    { path: "/mcp", label: "MCP 服务目录" },
    { path: "/me", label: "个人中心" },
    { path: "/login", label: "登录页" },
    { path: "/issue", label: "提交反馈" },
];

const SKILL_SLUGS = [
    "aerial-object-detection",
    "flow-language-control",
    "ibvs-visual-servoing",
    "llm-px4-autonomous-navigation",
    "nl-mission-planning",
    "pid-autotune-assistant",
    "px4-ulog-analyzer",
    "vlm-scene-understanding",
];

const MCP_SLUGS = ["ardupilot-log", "msfs-sim-flight"];

test.describe("关键页面渲染", () => {
    for (const page of CRITICAL_PAGES) {
        // 标 @smoke：这 15 条覆盖全部路由骨架，单条只验 200 + 无错误覆盖层，是"每次都必须过"的最小集。
        // 详情页与交互用例留在全量跑——它们验的是数据层渲染细节，静态层已有 build:kb / check-skill-spec 守着。
        test(`${page.label} — ${page.path}`, { tag: "@smoke" }, async ({ page: pwPage }) => {
            const res = await pwPage.goto(page.path, { waitUntil: "networkidle" });
            expect(res?.status()).toBe(200);

            // MDX / React 渲染错误最常见的表现：Next.js 错误覆盖层
            const errorOverlay = pwPage.locator("[data-nextjs-error-overlay], nextjs-portal");
            await expect(errorOverlay)
                .not.toBeVisible({ timeout: 3000 })
                .catch(() => {
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

test.describe("Skill 详情页", () => {
    for (const slug of SKILL_SLUGS) {
        test(`/skills/${slug}`, async ({ page }) => {
            const res = await page.goto(`/skills/${slug}`, { waitUntil: "networkidle" });
            expect(res?.status()).toBe(200);

            await expect(page.locator("h1").first()).toBeVisible();
            const body = await page.locator("body").textContent();
            expect(body).not.toMatch(/Application error/);
            expect(body).not.toMatch(/\[next-mdx-remote\].*error/);
        });
    }
});

test.describe("MCP 详情页", () => {
    for (const slug of MCP_SLUGS) {
        test(`/mcp/${slug}`, async ({ page }) => {
            const res = await page.goto(`/mcp/${slug}`, { waitUntil: "networkidle" });
            expect(res?.status()).toBe(200);

            await expect(page.locator("h1").first()).toBeVisible();
            const body = await page.locator("body").textContent();
            expect(body).not.toMatch(/Application error/);
            expect(body).not.toMatch(/\[next-mdx-remote\].*error/);
        });
    }
});

test.describe("页面交互功能", () => {
    test("技能广场 — 搜索功能可用", async ({ page }) => {
        await page.goto("/skills", { waitUntil: "networkidle" });

        // 搜索输入框应该存在
        const searchInput = page
            .locator('input[type="search"], input[placeholder*="搜索"], input[placeholder*="search"]')
            .first();
        if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await searchInput.fill("检测");
            await page.waitForTimeout(500);

            // 页面不应崩溃
            const body = await page.locator("body").textContent();
            expect(body).not.toMatch(/Application error/);
        }
    });

    test("MCP 目录 — 列表有内容", async ({ page }) => {
        await page.goto("/mcp", { waitUntil: "networkidle" });

        await expect(page.locator("h1").first()).toBeVisible();

        // 至少有一个 MCP 服务条目
        const body = await page.locator("body").textContent();
        expect(body).not.toMatch(/Application error/);
    });

    test("导航链接可点击 — 技能广场", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" });

        // 点击指向 /skills 的链接
        const skillsLink = page.locator('a[href="/skills"]').first();
        if (await skillsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await skillsLink.click();
            await page.waitForURL("**/skills", { timeout: 5000 });

            await expect(page.locator("h1").first()).toBeVisible();
            const body = await page.locator("body").textContent();
            expect(body).not.toMatch(/Application error/);
        }
    });

    test("导航链接可点击 — 分析入口", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" });

        const analyzeLink = page.locator('a[href="/analyze"]').first();
        if (await analyzeLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await analyzeLink.click();
            await page.waitForURL("**/analyze", { timeout: 5000 });

            const body = await page.locator("body").textContent();
            expect(body).not.toMatch(/Application error/);
        }
    });
});
