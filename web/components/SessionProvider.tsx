"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

/** 全站会话 Provider；边缘函数 /api/* 自行用 JWE cookie 验签，不依赖这里 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}

export { useSession, signIn, signOut } from "next-auth/react";
