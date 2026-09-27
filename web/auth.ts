import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { consumeEmailOtp, upsertEmailUser, upsertGithubUser } from "@/lib/internal-kv";

/**
 * 冲刺 2 认证（CLAUDE.md 6.1）：
 * - JWT 会话策略，无数据库；边缘函数用同一 AUTH_SESSION_SECRET 解密（见 functions/_lib/auth.js）
 * - GitHub OAuth + 邮箱验证码（Credentials 承载 OTP 校验）
 * - 用户资料存 EdgeOne KV，经 /internal/* 边缘函数中转
 */
const githubId = process.env.AUTH_GITHUB_ID;
const githubSecret = process.env.AUTH_GITHUB_SECRET;

/**
 * 后台（/admin/settings）管理员白名单。
 *
 * 没配 AUTH_ADMIN_EMAILS 时任何人都不算管理员——宁可后台进不去，也不能让
 * "没配 = 全放行"这种默认成立。邮箱比对大小写不敏感，逗号分隔。
 */
function isAdminEmail(email: string): boolean {
    const list = (process.env.AUTH_ADMIN_EMAILS ?? "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    return list.includes(email);
}

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
            const email = String(credentials?.email ?? "")
                .toLowerCase()
                .trim();
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
    secret: process.env.AUTH_SESSION_SECRET,
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
                    // GitHub 个人设置里邮箱可能为私密，OAuth profile 拿不到；
                    // 但 KV upsert 时如果能从之前的登录记录里取回邮箱，就写回 token，
                    // 否则管理员白名单依赖 email 就会永远判 false。
                    if (record.email) token.email = record.email;
                }
                token.loginType = "github";
            } else if (user) {
                token.uid = user.id;
                token.plan = (user as { plan?: string }).plan ?? "free";
                token.loginType = "email";
            }
            // 管理员身份每次刷新 token 时重算：AUTH_ADMIN_EMAILS 改了，老会话下一次刷新即生效，
            // 不用逼用户重新登录。GitHub 登录可能拿不到邮箱，那就不是管理员。
            const email = (typeof token.email === "string" ? token.email : (user?.email ?? "")).toLowerCase().trim();
            token.isAdmin = email ? isAdminEmail(email) : false;
            return token;
        },
        async session({ session, token }) {
            if (token?.uid) {
                session.user.id = String(token.uid);
                session.user.plan = typeof token.plan === "string" ? token.plan : "free";
            }
            // 登录方式跟着 JWT 走（/me 页展示「GitHub 登录 / 邮箱登录」用）
            const loginType = token?.loginType;
            if (loginType === "email" || loginType === "github") {
                session.user.loginType = loginType;
            }
            session.user.isAdmin = token.isAdmin === true;
            return session;
        },
    },
});
