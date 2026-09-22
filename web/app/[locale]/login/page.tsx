import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = {
    title: "登录 · NextPilot Skill",
};

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
    const params = await searchParams;
    // 仅允许站内相对路径回跳，避免开放重定向
    const callbackUrl =
        typeof params.callbackUrl === "string" && params.callbackUrl.startsWith("/") ? params.callbackUrl : "/analyze";

    return (
        <div className="page-shell flex justify-center py-16">
            <Suspense>
                <LoginForm callbackUrl={callbackUrl} />
            </Suspense>
        </div>
    );
}
