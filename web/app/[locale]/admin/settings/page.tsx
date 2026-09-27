import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SETTINGS_FIELDS, getSiteSettingsForDisplay } from "@/lib/site-settings";
import { AdminSettingsForm, type SettingFieldView } from "./AdminSettingsForm";

/**
 * 后台站点设置（/admin/settings）。
 *
 * 安全口径：非管理员一律 404——不提示"你没权限"，不暴露后台入口存在。
 * 判定依据是会话里的 `isAdmin`（auth.ts 的 jwt 回调比对 AUTH_ADMIN_EMAILS），
 * 每次刷新 token 重算，改白名单不用逼用户重新登录。
 *
 * 表单字段来自 `SETTINGS_FIELDS`，加一项配置只改那张表；这里只是把它和当前值传给表单。
 */
export const metadata: Metadata = {
    title: "站点设置",
    // 后台不进搜索：既没内容价值，也不该让外人顺着收录找到入口
    robots: { index: false, follow: false },
};

export default async function AdminSettingsPage() {
    const session = await auth();
    if (!session?.user?.isAdmin) notFound();

    // 用脱敏版：这个对象要当 props 传给客户端表单组件，明文密钥会被序列化进页面 HTML
    const settings = await getSiteSettingsForDisplay();
    const fields: SettingFieldView[] = SETTINGS_FIELDS.map((field) => ({
        key: field.key,
        label: field.label,
        kind: field.kind,
        optional: "optional" in field ? field.optional : undefined,
        confirm: "confirm" in field ? field.confirm : undefined,
    }));

    return (
        <div className="page-shell py-10">
            <Breadcrumbs items={[{ label: "我的" }, { label: "站点设置" }]} />
            <h1 className="text-[24px] font-semibold tracking-[-0.02em]">站点设置</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                这里改的是运行期设置，保存在 KV 里，优先于环境变量和代码里的默认值。清掉某一项就回落到默认值。
            </p>
            <div className="card mt-6 max-w-2xl p-5">
                <AdminSettingsForm fields={fields} initial={settings} />
            </div>
        </div>
    );
}
