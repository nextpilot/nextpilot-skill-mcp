"use client";

import { useState } from "react";
import { AlertCircle, Check, Loader2, Save } from "lucide-react";

/**
 * 后台站点设置表单。
 *
 * 字段是服务端按 `lib/site-settings.ts` 的字段表传进来的，这里不认得任何具体配置项，
 * 加一项配置不用改这个组件。
 *
 * 保存走 POST /api/admin/settings（边缘函数直接写 KV）。用 POST 不是 PUT：
 * 本地 edge-dev 垫片只把 GET/POST/DELETE 映射到 onRequest*，PUT 会静默走不通。
 */

export interface SettingFieldView {
    key: string;
    label: string;
    kind: "text" | "textarea" | "domain" | "url" | "secret";
    /** secret 专用：服务端给的尾 4 位（如 `****3f9a`），完整值不回显 */
    masked?: string;
    optional?: boolean;
    /** 改了影响搜索收录/分享链接，保存前弹一次确认 */
    confirm?: boolean;
}

interface SaveError {
    field: string;
    message: string;
}

/** 与服务端同一套规则：只留尾 4 位。前端也要算一次，保存成功后输入框里不能留着明文 */
function maskSecret(value: string): string {
    if (!value) return "";
    return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

export function AdminSettingsForm({
    fields,
    initial,
}: {
    fields: SettingFieldView[];
    initial: Record<string, string>;
}) {
    // baseline = "上次保存时的样子"，用来算 diff。props 的 initial 只是初始值：
    // 保存成功后要就地更新它，否则下一次提交会把没变的字段又报成改动。
    const [baseline, setBaseline] = useState<Record<string, string>>(initial);
    const [values, setValues] = useState<Record<string, string>>(initial);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<SaveError[]>([]);
    const [savedKeys, setSavedKeys] = useState<string[] | null>(null);
    const [noop, setNoop] = useState(false);

    async function submit(event: React.FormEvent) {
        event.preventDefault();

        const risky = fields.find((field) => field.confirm && values[field.key] !== baseline[field.key]);
        if (risky && !window.confirm(`确认修改「${risky.label}」？\n\n改了之后搜索收录与分享链接都会跟着走。`)) {
            return;
        }

        // 只提交改动过的字段。
        // 全量提交会把"当前默认值"一起固化进 KV：管理员只改备案号，siteName 的默认值也被
        // 写死在库里，之后改 site-config.ts 的代码默认值就再也不生效了（"改了代码没反应"
        // 这种问题看代码看不出来）。initial 是压平后的当前生效值，跟它不一样的就是改动。
        const changed: Record<string, string> = {};
        for (const field of fields) {
            const next = values[field.key] ?? "";
            if (next !== (baseline[field.key] ?? "")) changed[field.key] = next;
        }
        if (Object.keys(changed).length === 0) {
            setNoop(true);
            setErrors([]);
            setSavedKeys(null);
            return;
        }

        setSaving(true);
        setErrors([]);
        setSavedKeys(null);
        setNoop(false);
        try {
            const resp = await fetch("/api/admin/settings", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ settings: changed }),
                cache: "no-store",
            });
            const data = (await resp.json().catch(() => null)) as {
                ok?: boolean;
                errors?: SaveError[];
                changed?: string[];
            } | null;
            if (!resp.ok || !data?.ok) {
                setErrors(
                    Array.isArray(data?.errors) && data.errors.length > 0
                        ? data.errors
                        : [{ field: "", message: `保存失败（HTTP ${resp.status}）` }],
                );
                return;
            }
            setSavedKeys(data.changed ?? []);

            // 保存成功后把密钥输入框里的明文换回尾 4 位：屏幕上的明文最容易被
            // 截图带走的东西，而它此刻已经落库、不再需要留在输入框里。
            const saved = { ...values };
            for (const field of fields) {
                if (field.kind === "secret") saved[field.key] = maskSecret(saved[field.key] ?? "");
            }
            setValues(saved);
            setBaseline(saved);
        } catch {
            setErrors([{ field: "", message: "保存失败：请求没能发出去" }]);
        } finally {
            setSaving(false);
        }
    }

    const errorOf = (key: string) => errors.find((item) => item.field === key)?.message;
    const globalError = errors.find((item) => !item.field)?.message;

    return (
        <form onSubmit={submit} className="space-y-4">
            {fields.map((field) => {
                const message = errorOf(field.key);
                const shared = "input w-full";
                return (
                    <label key={field.key} className="block">
                        <span className="mb-1.5 block text-sm font-medium">
                            {field.label}
                            {field.optional ? <span className="ml-1 text-xs text-faint">（可选）</span> : null}
                        </span>
                        {field.kind === "textarea" ? (
                            <textarea
                                value={values[field.key] ?? ""}
                                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                                rows={3}
                                className={`${shared} resize-y`}
                            />
                        ) : (
                            <input
                                type={
                                    field.kind === "secret"
                                        ? "password"
                                        : field.kind === "domain" || field.kind === "url"
                                          ? "url"
                                          : "text"
                                }
                                value={values[field.key] ?? ""}
                                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                                className={shared}
                                // 密钥不让浏览器记住、不让密码管理器弹窗填回一个假值
                                autoComplete={field.kind === "secret" ? "new-password" : undefined}
                                placeholder={field.kind === "secret" ? "留空 = 不改动" : undefined}
                            />
                        )}
                        {/* 密钥的提示与别的不一样：这里说的是"清空 = 删掉覆盖、用回环境变量"，
                            不是"用回默认值"。密钥的下一层是环境变量，没有代码里的默认值。 */}
                        {field.kind === "secret" ? (
                            <span className="mt-1 block text-xs text-faint">
                                {baseline[field.key]
                                    ? `已配置（${baseline[field.key]}，完整值不回显）；清空并保存 = 删掉覆盖、用回环境变量`
                                    : "未配置；填了就覆盖环境变量（留空 = 不改动）"}
                            </span>
                        ) : (
                            /* 留空就是"用回默认值"：后台清空一项 = 删掉 KV 覆盖，不是存空串 */
                            <span className="mt-1 block text-xs text-faint">
                                {field.optional ? "留空则不显示 / 用回默认值" : "留空则用回默认值"}
                            </span>
                        )}
                        {message ? <span className="mt-1 block text-xs text-red-500">{message}</span> : null}
                    </label>
                );
            })}

            {globalError ? (
                <p className="flex items-start gap-2 text-sm text-red-500">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {globalError}
                </p>
            ) : null}

            {noop ? (
                <p className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-muted">
                    没有需要保存的改动。
                </p>
            ) : null}

            {savedKeys ? (
                <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                        已保存{savedKeys.length > 0 ? `（改动 ${savedKeys.length} 项）` : ""}。 最迟 60
                        秒后全站生效——不是没生效，是缓存到期才换。
                    </span>
                </p>
            ) : null}

            <button type="submit" disabled={saving} className="btn-primary py-2.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "保存中…" : "保存"}
            </button>
        </form>
    );
}
