/**
 * 站点版本（footer 显示的「版本 + 日期」）的唯一读取口。
 *
 * 真源在构建期、不在运行期：`next.config.ts` 把 `web/package.json` 的 `version` 与构建时
 * git HEAD 的短哈希、提交日期注入下面三个 `NEXT_PUBLIC_APP_*`。全站只有这个文件读它们，
 * 别处再读一次就是第二份口径，两边迟早对不上。
 *
 * 已经有过一次这样的裂缝：`lib/issue-bridge.ts` 一直在读 `NEXT_PUBLIC_APP_VERSION`，
 * 而全仓库从来没有人给它赋值，于是错误上报里的 version 恒为空串（版本那栏直接不打印，
 * 既看不出是哪个版本出的问题，也没人发现它没生效）。现在它改从这里取。
 *
 * 取不到时不补假值：footer 会明说"版本未知"，而不是编一个看起来正常的串。
 */
const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "";
const commit = process.env.NEXT_PUBLIC_APP_COMMIT ?? "";
const updatedAt = process.env.NEXT_PUBLIC_APP_COMMIT_DATE ?? "";

export const SITE_VERSION = { version, commit, updatedAt };

/** 三个值都在（构建期把版本与日期都注入了）才算一份完整的版本信息 */
export function hasSiteVersion(): boolean {
    return Boolean(version && updatedAt);
}

/** footer 徽标上的展示串：`v0.1.0 · 2026-09-21 23:59:26`（精确到秒，一天内多次构建才分得清先后）。缺哪一项就只给另一项，都不缺才拼在一起。 */
export function siteVersionLabel(): string {
    if (version && updatedAt) return `v${version} · ${updatedAt}`;
    if (version) return `v${version}`;
    return updatedAt;
}

/** 悬停提示：把短哈希一并给出（版本号之外唯一能定位到"线上跑的是哪次构建"的信息） */
export function siteVersionTitle(): string {
    return commit ? `构建提交 ${commit}` : "";
}
