"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AdminSettingsForm, type SettingFieldView } from "./AdminSettingsForm";

interface DebugInfo {
    hasCookie?: boolean;
    hasSession?: boolean;
    sessionEmail?: string | null;
    isAdminFromJwt?: boolean;
    env_AUTH_ADMIN_EMAILS?: string;
    env_AUTH_SESSION_SECRET?: string;
}

export default function AdminSettingsPage() {
    const { data: session, status } = useSession();
    const [fields, setFields] = useState<SettingFieldView[]>([]);
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [debug, setDebug] = useState<DebugInfo | null>(null);

    useEffect(() => {
        if (status !== "authenticated") return;
        fetch("/api/admin/settings", { cache: "no-store" })
            .then((res) => {
                if (!res.ok) {
                    return res.json().then((body) => {
                        throw { status: res.status, debug: body?.debug };
                    });
                }
                return res.json() as Promise<{
                    settings?: Record<string, string>;
                    fields?: SettingFieldView[];
                }>;
            })
            .then((data) => {
                setSettings(data.settings ?? {});
                setFields(data.fields ?? []);
            })
            .catch((err) => {
                if (err?.debug) {
                    setDebug(err.debug);
                    setError(
                        `边缘函数返回 ${err.status}: isAdminFromJwt=${String(err.debug.isAdminFromJwt)}, hasSession=${String(err.debug.hasSession)}`,
                    );
                } else {
                    setError(err instanceof Error ? err.message : "加载失败");
                }
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
                {debug ? (
                    <pre className="mt-4 rounded border border-red-200 bg-red-50 p-4 text-xs leading-relaxed">
                        {JSON.stringify(debug, null, 2)}
                    </pre>
                ) : null}
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
