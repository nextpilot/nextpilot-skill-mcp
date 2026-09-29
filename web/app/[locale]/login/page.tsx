import { Suspense } from "react";
import type { Metadata } from "next";
import { makePageMeta } from "@/lib/seo";
import { LoginForm } from "@/components/LoginForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    return makePageMeta({
        title: "登录",
        description: "登录 NextPilot Skill 平台，管理你的飞控日志分析记录。",
        path: "/login",
        locale,
    });
}

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
    const params = await searchParams;
    // 仅允许站内相对路径回跳，避免开放重定向。
    // `//` 开头的协议相对 URL（如 `//evil.com`）也满足 startsWith("/")，浏览器会把它解析成
    // 跳往外站，登录成功后 router.push 直达钓鱼站，要显式排除。
    const callbackUrl =
        typeof params.callbackUrl === "string" &&
        params.callbackUrl.startsWith("/") &&
        !params.callbackUrl.startsWith("//")
            ? params.callbackUrl
            : "/log";

    return (
        <div className="page-shell flex justify-center py-16">
            <Suspense>
                <LoginForm callbackUrl={callbackUrl} />
            </Suspense>
        </div>
    );
}
