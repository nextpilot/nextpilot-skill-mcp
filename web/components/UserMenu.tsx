"use client";

import { Link, usePathname } from "@/i18n/routing";
import { useSession, signOut } from "next-auth/react";
import { LogIn, LogOut } from "lucide-react";

export function UserMenu() {
    const { data: session, status } = useSession();
    const pathname = usePathname();

    if (status === "loading") {
        return <span className="h-8 w-16 animate-pulse rounded-lg bg-surface-2" aria-hidden />;
    }

    if (!session?.user) {
        return (
            <Link
                href={`/login?callbackUrl=${encodeURIComponent(pathname || "/log")}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
                <LogIn className="h-4 w-4" />
                登录
            </Link>
        );
    }

    const name = session.user.name || session.user.email || "飞手";
    return (
        <span className="flex items-center gap-1.5">
            {/* 头像与昵称整体链到「我的」页（账号信息 / 额度 / 云端报告） */}
            <Link
                href="/me"
                className="flex items-center gap-1.5 rounded-lg px-1 py-0.5 transition-colors hover:bg-surface-2"
                title="个人中心"
                aria-label="个人中心"
            >
                <span
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold"
                    title={session.user.email ?? name}
                    aria-hidden
                >
                    {name.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-[120px] truncate text-sm text-muted sm:inline">{name}</span>
            </Link>
            <button
                type="button"
                onClick={() => void signOut({ redirectTo: "/" })}
                className="icon-link"
                title="退出登录"
                aria-label="退出登录"
            >
                <LogOut className="h-[18px] w-[18px]" />
            </button>
        </span>
    );
}
