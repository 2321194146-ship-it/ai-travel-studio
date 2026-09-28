import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import { normalizePhone, verifyPassword } from "./password";
import { checkRateLimit } from "./rateLimit";

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    CredentialsProvider({
      id: "phone-password",
      name: "手机号密码",
      credentials: {
        phone: { label: "手机号", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        const phone = normalizePhone(credentials?.phone);
        if (!phone || typeof credentials?.password !== "string") return null;
        const attempt = checkRateLimit(`phone-login:${phone}`, 8, 15 * 60_000);
        if (!attempt.allowed) throw new Error("登录尝试过于频繁，请稍后再试");
        const dbUser = await prisma.user.findUnique({ where: { phone } });
        if (!dbUser?.passwordHash || !verifyPassword(credentials.password, dbUser.passwordHash)) return null;
        if (process.env.ADMIN_PHONE === phone && dbUser.role !== "ADMIN") {
          await prisma.user.update({ where: { id: dbUser.id }, data: { role: "ADMIN" } });
          dbUser.role = "ADMIN";
        }
        return {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          image: dbUser.image || null,
          credits: dbUser.credits,
          role: dbUser.role,
          phone: dbUser.phone,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.credits = user.credits;
        token.role = user.role || "USER";
        token.phone = user.phone || null;
        token.membership = user.membership || "NONE";
        token.membershipExpiresAt = user.membershipExpiresAt || null;
      }
      if (trigger === "update" && session) {
        if (session.credits !== undefined) token.credits = session.credits;
      }
      const userId = token.id || token.sub;
      if (userId) {
        token.id = userId;
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { credits: true, role: true, phone: true, membership: true, membershipExpiresAt: true },
          });
          if (dbUser) {
            token.credits = dbUser.credits;
            token.role = dbUser.role;
            token.phone = dbUser.phone;
            token.membership = dbUser.membership;
            token.membershipExpiresAt = dbUser.membershipExpiresAt;
          } else {
            // 账号已被删除：标记失效，session 回调会让登录态作废，避免僵尸会话拿着不存在的用户 ID 写库
            token.accountMissing = true;
          }
        } catch (err) {}
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.accountMissing) {
        // 官方推荐的强制登出模式：抛错后客户端会话回到未登录态
        throw new Error("账号已失效，请重新登录");
      }
      if (session.user && token) {
        session.user.id = token.id || token.sub;
        session.user.credits = token.credits;
        session.user.role = token.role || "USER";
        session.user.phone = token.phone || null;
        session.user.membership = token.membership || "NONE";
        session.user.membershipExpiresAt = token.membershipExpiresAt || null;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
};
