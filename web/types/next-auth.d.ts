import type { DefaultSession } from "next-auth";

// 会话/JWT 中追加平台自定义字段（uid、套餐、登录方式）
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      plan: string;
    } & DefaultSession["user"];
  }

  interface User {
    plan?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    plan?: string;
    loginType?: "email" | "github";
  }
}
