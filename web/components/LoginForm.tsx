"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Mail, Radar } from "lucide-react";

// GitHub 官方标志路径（与 SiteHeader 中同源）
function GithubIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
    );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [sending, setSending] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(0);
    const [githubEnabled, setGithubEnabled] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        fetch("/api/auth/providers")
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => setGithubEnabled(Boolean(d?.github)))
            .catch(() => {});
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const startCountdown = useCallback(() => {
        setCountdown(RESEND_SECONDS);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setCountdown((n) => {
                if (n <= 1 && timerRef.current) {
                    clearInterval(timerRef.current);
                    return 0;
                }
                return n - 1;
            });
        }, 1000);
    }, []);

    async function requestCode() {
        setError(null);
        if (!EMAIL_RE.test(email)) {
            setError("请输入正确的邮箱地址");
            return;
        }
        setSending(true);
        try {
            const resp = await fetch("/api/auth/otp/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            const data = await resp.json().catch(() => null);
            if (!resp.ok || !data?.ok) {
                setError(data?.error ?? "验证码发送失败");
                return;
            }
            setInfo("验证码已发送，请查收邮箱（10 分钟内有效）");
            startCountdown();
        } catch {
            setError("网络异常，请稍后再试");
        } finally {
            setSending(false);
        }
    }

    async function submitEmailLogin(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (!EMAIL_RE.test(email) || code.trim().length !== 6) {
            setError("请输入邮箱和 6 位验证码");
            return;
        }
        setSubmitting(true);
        try {
            const result = await signIn("credentials", {
                email,
                code: code.trim(),
                redirect: false,
            });
            if (result?.error) {
                setError("验证码错误或已过期，请重新获取");
                return;
            }
            router.push(callbackUrl || "/analyze");
            router.refresh();
        } catch {
            setError("登录失败，请稍后再试");
        } finally {
            setSubmitting(false);
        }
    }

    function loginGithub() {
        void signIn("github", { callbackUrl: callbackUrl || "/analyze" });
    }

    return (
        <div className="w-full max-w-sm">
            <div className="mb-6 flex flex-col items-center gap-2 text-center">
                <Radar className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-semibold">登录 NextPilot</h1>
                <p className="text-sm text-muted">登录后每日可生成 10 次 AI 日志报告，历史同步云端保留 7 天</p>
            </div>

            {githubEnabled && (
                <>
                    <button type="button" onClick={loginGithub} className="btn-ghost w-full py-2.5">
                        <GithubIcon className="h-5 w-5" />
                        使用 GitHub 登录
                    </button>

                    <div className="my-5 flex items-center gap-3 text-xs text-muted">
                        <span className="h-px flex-1 bg-border" />
                        或使用邮箱验证码
                        <span className="h-px flex-1 bg-border" />
                    </div>
                </>
            )}

            <form onSubmit={submitEmailLogin} className="space-y-3">
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="邮箱地址"
                    autoComplete="email"
                    className="input"
                />
                <div className="flex gap-2">
                    <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                        placeholder="6 位验证码"
                        autoComplete="one-time-code"
                        className="input"
                    />
                    <button
                        type="button"
                        onClick={requestCode}
                        disabled={sending || countdown > 0}
                        className="btn-ghost shrink-0 py-2.5"
                    >
                        {countdown > 0 ? `${countdown}s` : sending ? "发送中…" : "获取验证码"}
                    </button>
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}
                {info && !error && <p className="text-sm text-primary">{info}</p>}

                <button type="submit" disabled={submitting} className="btn-primary w-full py-2.5">
                    <Mail className="h-4 w-4" />
                    {submitting ? "登录中…" : "登录 / 注册"}
                </button>
            </form>

            <p className="mt-5 text-center text-xs text-muted">未注册的邮箱验证通过后自动创建账号</p>
        </div>
    );
}
