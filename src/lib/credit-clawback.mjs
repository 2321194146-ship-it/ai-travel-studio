// 订单退款收回生成次数：从买家余额扣回该订单发放的积分，扣到 0 为保底（已消耗的部分由平台承担，
// 是否全额追讨由管理员在登记退款时人工判断——退款本身是线下人工动作）。
// 纯函数依赖注入 tx，可被 node --test 直接单测。
export async function clawbackCredits(tx, { userId, credits, planName, sourceId, reason }) {
  const amount = Math.max(0, Math.trunc(Number(credits) || 0));
  if (!userId || amount <= 0) return { deducted: 0, skipped: "nothing-to-claw" };
  const user = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
  if (!user) return { deducted: 0, skipped: "user-not-found" };
  const deduct = Math.min(amount, Math.max(0, user.credits));
  if (deduct <= 0) return { deducted: 0, skipped: "zero-balance" };
  const updated = await tx.user.update({
    where: { id: userId },
    data: { credits: { decrement: deduct } },
    select: { credits: true },
  });
  await tx.creditLedger.create({
    data: {
      userId,
      amount: -deduct,
      balance: updated.credits,
      reason: reason || `订单退款收回生成次数 ${planName || ""}`.trim(),
      sourceType: "REFUND_CLAWBACK",
      sourceId,
    },
  });
  return { deducted: deduct };
}
