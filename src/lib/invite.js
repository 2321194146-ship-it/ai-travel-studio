import { prisma } from "@/lib/prisma";
import { paymentRewardFor, INVITE_REWARDS } from "@/lib/battle.mjs";

// 事务内调用：给邀请人发付费奖励（单层邀请，只有直属邀请人拿奖励）
export async function grantInvitePaymentReward(tx, userId, planId, orderId) {
  const reward = paymentRewardFor(planId);
  if (!reward) return null;
  const referrerId = (await tx.user.findUnique({ where: { id: userId }, select: { referredById: true } }))?.referredById;
  if (!referrerId) return null;
  const referrer = await tx.user.update({
    where: { id: referrerId },
    data: { credits: { increment: reward } },
    select: { id: true, credits: true },
  });
  await tx.creditLedger.create({
    data: {
      userId: referrerId,
      amount: reward,
      balance: referrer.credits,
      reason: "兄弟比帅邀请奖励",
      sourceType: "INVITE_REWARD",
      sourceId: orderId,
    },
  });
  return referrer;
}

// 注册归属 + 双方注册奖励（被邀请人多 4 次）。邮箱/手机注册后调用一次。
export async function attachReferralOnRegister(userId, inviteCode) {
  if (!inviteCode) return null;
  const code = String(inviteCode).trim().toUpperCase();
  return prisma.$transaction(async (tx) => {
    const referrer = await tx.user.findUnique({ where: { inviteCode: code }, select: { id: true } });
    if (!referrer || referrer.id === userId) return null;
    const target = await tx.user.findUnique({ where: { id: userId }, select: { referredById: true, credits: true } });
    if (!target || target.referredById) return null; // 只认第一次，不覆盖
    const bonus = INVITE_REWARDS.REGISTER_BONUS_INVITEE;
    const updated = await tx.user.update({
      where: { id: userId },
      data: { referredById: referrer.id, credits: { increment: bonus } },
      select: { id: true, credits: true },
    });
    await tx.creditLedger.create({
      data: {
        userId,
        amount: bonus,
        balance: updated.credits,
        reason: "兄弟邀请注册奖励",
        sourceType: "INVITE_BONUS",
        sourceId: referrer.id,
      },
    });
    return { referrerId: referrer.id, bonus };
  });
}
