import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { consumeEmailOtp, upsertEmailUser, upsertGithubUser } from "@/lib/internal-kv";

/**
 * 冲刺 2 认证（CLAUDE.md 6.1）：
 * - JWT 会话策略，无数据库；边缘函数用同一 AUTH_SECRET 解密（见 functions/_lib/auth.js）
 * - GitHub OAuth + 邮箱验证码（Credentials 承载 OTP 校验）
 * - 用户资料存 EdgeOne KV，经 /internal/* 边缘函数中转
 */
const githubId = process.env.AUTH_GITHUB_ID;
const githubSecret = process.env.AUTH_GITHUB_SECRET;

const providers = [];

// GitHub provider 缺配置时不注册（否则点登录直接抛 Server configuration error）
if (githubId && githubSecret) {
  providers.push(
    GitHub({
      clientId: githubId,
      clientSecret: githubSecret,
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.login ?? profile.name,
          email: profile.email ?? null,
          image: profile.avatar_url,
        };
      },
    }),
  );
}

providers.push(
  Credentials({
    credentials: {
      email: { label: "邮箱", type: "email" },
      code: { label: "验证码", type: "text" },
    },
    async authorize(credentials) {
      const email = String(credentials?.email ?? "").toLowerCase().trim();
      const code = String(credentials?.code ?? "").trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !code) {
        return null;
      }
      const result = await consumeEmailOtp(email, code).catch(() => null);
      if (!result || !result.ok) return null;
      const user = await upsertEmailUser(email).catch(() => null);
      if (!user) return null;
      return { id: user.uid, email: user.email, name: user.name };
    },
  }),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    async jwt({ token, user, account, profile }) {
      // 首次登录把 KV uid 写进 token；GitHub 登录在这里完成用户 upsert
      if (account?.provider === "github") {
        const ghProfile = profile as { id?: number | string; login?: string } | undefined;
        const githubId =
          (user as { id?: string } | undefined)?.id ?? ghProfile?.id ?? account.providerAccountId;
        const record = await upsertGithubUser({
          githubId: String(githubId),
          email: (user as { email?: string | null } | undefined)?.email,
          name: (user as { name?: string | null } | undefined)?.name,
        }).catch(() => null);
        if (record) {
          token.uid = record.uid;
          token.plan = record.plan;
        }
        token.loginType = "github";
      } else if (user) {
        token.uid = user.id;
        token.plan = (user as { plan?: string }).plan ?? "free";
        token.loginType = "email";
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.uid) {
        session.user.id = String(token.uid);
        session.user.plan = typeof token.plan === "string" ? token.plan : "free";
      }
      return session;
    },
  },
});
