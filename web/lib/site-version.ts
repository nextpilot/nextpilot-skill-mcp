/**
 * 站点版本（footer 的「版本 + 日期」）唯一读取口。真源在构建期：next.config.ts 把 web/package.json
 * 的 version 与构建时 git 短哈希、提交日期注入 NEXT_PUBLIC_APP_*，全站只有这里读（别处再读是第二份口径，
 * 曾经 issue-bridge 直读没人赋值的环境变量，version 恒空串）。取不到不补假值：footer 明说"版本未知"。
 */
const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "";
const commit = process.env.NEXT_PUBLIC_APP_COMMIT ?? "";
const updatedAt = process.env.NEXT_PUBLIC_APP_COMMIT_DATE ?? "";

export const SITE_VERSION = { version, commit, updatedAt };

/** 三个值都在（构建期把版本与日期都注入了）才算一份完整的版本信息 */
export function hasSiteVersion(): boolean {
    return Boolean(version && updatedAt);
}

/** footer 徽标上的展示串，形如 `v0.1.0 · 2026-09-21 23:59:26`。时间精确到秒，一天内多次构建才分得清先后。缺哪一项就只给另一项，都不缺才拼在一起。 */
export function siteVersionLabel(): string {
    if (version && updatedAt) return `v${version} · ${updatedAt}`;
    if (version) return `v${version}`;
    return updatedAt;
}

/** 悬停提示：把短哈希一并给出（版本号之外唯一能定位到"线上跑的是哪次构建"的信息） */
export function siteVersionTitle(): string {
    return commit ? `构建提交 ${commit}` : "";
}
