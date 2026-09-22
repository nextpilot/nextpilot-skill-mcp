"use client";

import { Link } from "@/i18n/routing";
import { Code2, ExternalLink, Radar } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { hasSiteVersion, siteVersionLabel, siteVersionTitle } from "@/lib/site-version";

const SOURCE_URL = "https://gitee.com/nextpilot/nextpilot-skill-mcp";

/** external = 外站链接：新标签页打开，标尾带 ExternalLink 小图标 */
type FooterLink = { href: string; label: string; external?: boolean };
type FooterGroup = { title: string; links: FooterLink[] };

/**
 * 站点页脚：分组导航 + 版本徽标。
 *
 * 版本号与日期只从 `lib/site-version.ts` 取（构建期注入），这里不写死任何字面量——
 * 写死的版本号不会报错，只会安静地过期。取不到时按那边的话说"版本未知"，不编一个。
 */
export function SiteFooter() {
    const { t } = useLanguage();

    const groups: FooterGroup[] = [
        {
            title: t("产品", "Product"),
            links: [
                { href: "/analyze", label: t("日志分析", "Log analysis") },
                { href: "/skills", label: t("Skill 技能", "Skill library") },
                { href: "/mcp", label: t("MCP 服务", "MCP servers") },
            ],
        },
        {
            title: t("资源", "Resources"),
            links: [
                { href: "/guide", label: t("使用指南", "Guide") },
                { href: "/guide/rule-catalogue", label: t("规则清单", "Rule catalogue") },
                { href: "/guide/rule-schema", label: t("规则编写参考", "Rule schema") },
            ],
        },
        {
            title: t("社区", "Community"),
            links: [
                // 报告页里还有一个「反馈问题」，那个带着命中的规则与结论条数，是另一回事
                // ——两者都走 /api/issues，别把入口合并掉。
                { href: "/issue", label: t("提交反馈", "Report an issue") },
                { href: "/me", label: t("个人中心", "My account") },
            ],
        },
        {
            title: t("媒体", "Media"),
            // 外站链接：新标签页打开 + 标尾的 ExternalLink 小图标告诉用户"这步会离开本站"。
            // 这三个地址是官方账号入口，不是站内路由，别换成 <Link>（会走客户端路由然后 404）。
            links: [
                {
                    href: "https://ffvf62dgcrpcsf5h87lj12mrgn90rx5.taobao.com/",
                    label: t("淘宝", "Taobao"),
                    external: true,
                },
                { href: "https://www.zhihu.com/people/nextpilot/posts", label: t("知乎", "Zhihu"), external: true },
                { href: "https://space.bilibili.com/1327597550", label: "bilibili", external: true },
            ],
        },
    ];

    // 缺版本信息时如实说"未知"——编一个看起来正常的串，比空着更坏（它会一直过期、且没人发现）
    const versionLabel = hasSiteVersion() ? siteVersionLabel() : t("版本未知", "Version unknown");
    const year = versionLabel.match(/\d{4}/)?.[0] ?? "";

    return (
        <footer className="border-t border-border bg-surface-2">
            <div className="page-shell py-10">
                <div className="grid gap-8 md:grid-cols-[1.5fr_repeat(4,1fr)] md:gap-6">
                    {/* 品牌区 */}
                    <div className="max-w-xs">
                        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold">
                            <Radar className="h-5 w-5 text-primary" />
                            <span>
                                NextPilot <span className="text-primary">Skill</span>
                            </span>
                        </Link>
                        <p className="mt-3 text-sm leading-6 text-muted">
                            {t(
                                "围绕感知 → 决策 → 控制 → 工具链的飞控 AI Skill 与 MCP 社区，内置 PX4 / ArduPilot 确定性日志分析。",
                                "A flight-control AI Skill & MCP hub across perception, decision, control and toolchain, with deterministic PX4 / ArduPilot log analysis built in.",
                            )}
                        </p>
                        {/* 隐私承诺那句原来也写在这里，2026-09-21 挪去了上传卡（用户交日志的地方才是
                它该在的位置），页脚不再重复——措辞见 lib/log-analysis-notes.ts。 */}
                    </div>

                    {/* 导航分组 */}
                    {groups.map((group) => (
                        <nav key={group.title} aria-label={group.title}>
                            <h2 className="text-xs font-semibold tracking-wide text-text">{group.title}</h2>
                            <ul className="mt-3 space-y-2.5">
                                {group.links.map((l) => (
                                    <li key={l.href}>
                                        {l.external ? (
                                            <a
                                                href={l.href}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="group inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-primary"
                                            >
                                                {l.label}
                                                <ExternalLink className="h-3 w-3 text-faint transition-colors group-hover:text-primary" />
                                            </a>
                                        ) : (
                                            <Link
                                                href={l.href}
                                                className="text-sm text-muted transition-colors hover:text-primary"
                                            >
                                                {l.label}
                                            </Link>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    ))}
                </div>

                {/* 底栏：版权 + 版本（免责那句在分析页上传卡上，见 lib/log-analysis-notes.ts） */}
                <div className="mt-9 flex flex-col gap-4 border-t border-border pt-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
                    <p>
                        {year ? `© ${year} ` : "© "}NextPilot Skill · {t("让无人机更智能", "Making aircraft smarter")}
                    </p>

                    <div className="flex flex-wrap items-center gap-3">
                        <a
                            href={SOURCE_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-primary"
                        >
                            <Code2 className="h-4 w-4" />
                            <span>{t("源代码", "Source")}</span>
                        </a>
                        <span className="h-3.5 w-px bg-border" aria-hidden />
                        {/* 版本徽标：版本号 + 日期，悬停给构建提交号。取不到时如实说未知，不编一个。 */}
                        <span
                            className="chip font-medium tabular-nums"
                            title={
                                siteVersionTitle() || t("构建环境未注入版本信息", "Build did not inject version info")
                            }
                        >
                            {versionLabel}
                        </span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
