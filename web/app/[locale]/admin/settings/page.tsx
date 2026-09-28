"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AdminSettingsForm, type SettingFieldView } from "./AdminSettingsForm";

/** 读边界归一：网络响应先按 unknown 收，再逐字段收敛（不直接 as 具名类型，见 CI §[10]）。 */
function normalizeSettingsPayload(raw: unknown): { settings: Record<string, string>; fields: SettingFieldView[] } {
    const obj = (raw ?? {}) as Record<string, unknown>;
    const settings: Record<string, string> = {};
    if (obj.settings && typeof obj.settings === "object") {
        for (const [k, v] of Object.entries(obj.settings as Record<string, unknown>)) {
            if (typeof v === "string") settings[k] = v;
        }
    }
    const fields = Array.isArray(obj.fields) ? (obj.fields as SettingFieldView[]) : [];
    return { settings, fields };
}

export default function AdminSettingsPage() {
    const { data: session, status } = useSession();
    const [fields, setFields] = useState<SettingFieldView[]>([]);
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (status !== "authenticated") return;
        fetch("/api/admin/settings", { cache: "no-store" })
            .then((res) => {
                if (res.status === 404) {
                    setError("无权限访问");
                    return null;
                }
                if (!res.ok) throw new Error(`${res.status}`);
                return res.json() as unknown;
            })
            .then((data) => {
                if (!data) return;
                const parsed = normalizeSettingsPayload(data);
                setSettings(parsed.settings);
                setFields(parsed.fields);
            })
            .catch((err) => {
                setError(err instanceof Error ? err.message : "加载失败");
            })
            .finally(() => setLoading(false));
    }, [status]);

    if (status === "loading") {
        return (
            <div className="page-shell py-10">
                <p className="text-sm text-muted">加载中…</p>
            </div>
        );
    }

    if (status !== "authenticated") {
        return (
            <div className="page-shell py-10">
                <p className="text-sm text-muted">请先登录。</p>
            </div>
        );
    }

    if (!session?.user?.isAdmin) {
        return null;
    }

    if (loading) {
        return (
            <div className="page-shell py-10">
                <p className="text-sm text-muted">加载设置…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="page-shell py-10">
                <p className="text-sm text-red-500">加载设置失败：{error}</p>
            </div>
        );
    }

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
