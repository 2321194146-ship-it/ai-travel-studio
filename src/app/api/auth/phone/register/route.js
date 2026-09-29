import { prisma } from "@/lib/prisma";
import { hashPassword, normalizePhone } from "@/lib/password";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { attachReferralOnRegister } from "@/lib/invite";
import { generateInviteCode } from "@/lib/battle.mjs";

// 注册赠送：够生成 1 张标准 1K 成片，让新用户先体验一次
const SIGNUP_CREDITS = 2;

export async function POST(request) {
  try {
    const body = await request.json();
    const phone = normalizePhone(body.phone);
    if (!phone) return Response.json({ error: "请输入正确的11位手机号" }, { status: 400 });
    // IP 维度限流：换手机号也绕不过（每 IP 每小时 5 次注册尝试）
    const ipAttempt = checkRateLimit(`reg-ip:${getClientIp(request)}`, 5, 3600_000);
    if (!ipAttempt.allowed) return Response.json({ error: "注册过于频繁，请稍后再试" }, { status: 429, headers: { "Retry-After": String(ipAttempt.retryAfter) } });
    const attempt = checkRateLimit(`phone-register:${phone}`, 3, 60 * 60_000);
    if (!attempt.allowed) return Response.json({ error: "注册尝试过于频繁，请稍后再试" }, { status: 429, headers: { "Retry-After": String(attempt.retryAfter) } });
    if (typeof body.password !== "string" || body.password.length < 8) {
      return Response.json({ error: "密码至少需要8位" }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) return Response.json({ error: "该手机号已注册，请直接登录" }, { status: 409 });
    const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim().toUpperCase() : "";
    if (inviteCode) {
      const referrer = await prisma.user.findUnique({ where: { inviteCode }, select: { id: true } });
      if (!referrer) return Response.json({ error: "邀请码不存在，请核对后重试（可不填）" }, { status: 400 });
    }
    const user = await prisma.$transaction(async (tx) => {
      let myCode = generateInviteCode();
      // 碰撞重试
      for (let i = 0; i < 5; i += 1) {
        const clash = await tx.user.findUnique({ where: { inviteCode: myCode }, select: { id: true } });
        if (!clash) break;
        myCode = generateInviteCode();
      }
      const created = await tx.user.create({
        data: { phone, name: `用户${phone.slice(-4)}`, passwordHash: hashPassword(body.password), credits: SIGNUP_CREDITS, inviteCode: myCode },
        select: { id: true, phone: true, name: true },
      });
      await tx.creditLedger.create({
        data: {
          userId: created.id,
          amount: SIGNUP_CREDITS,
          balance: SIGNUP_CREDITS,
          reason: "注册赠送",
          sourceType: "SIGNUP_BONUS",
          sourceId: created.id,
        },
      });
      return created;
    });
    // 邀请归属 + 被邀请人注册奖励（独立事务，失败不阻断注册）
    await attachReferralOnRegister(user.id, inviteCode).catch((err) => console.error("referral attach failed", err.message));
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    console.error("phone register failed", error);
    return Response.json({ error: "注册失败，请稍后再试" }, { status: 500 });
  }
}
