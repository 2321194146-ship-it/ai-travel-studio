import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { SERVICE_PLAN_CATALOG } from "@/lib/service-catalog";

export const PLAN_CATALOG = Object.freeze({
  trial: { id: "trial", name: "体验卡", credits: 8, membershipDays: 30, amount: 990, modelTier: "standard" },
  high: { id: "high", name: "高清生成卡", credits: 36, membershipDays: 30, amount: 3990, modelTier: "high" },
  flagship: { id: "flagship", name: "旗舰精修卡", credits: 90, membershipDays: 60, amount: 9900, modelTier: "flagship" },
  refill: { id: "refill", name: "次数补充包", credits: 15, membershipDays: 0, amount: 1990, modelTier: null },
  // 分站专售：单张写真 SKU，货款进代理商户，发货时同扣代理积分
  single_std: { id: "single_std", name: "AI写真·单张标准", credits: 2, membershipDays: 0, amount: 2990, modelTier: null, tenantOnly: true },
  single_hd: { id: "single_hd", name: "AI写真·单张高清", credits: 4, membershipDays: 0, amount: 3990, modelTier: null, tenantOnly: true },
  single_flag: { id: "single_flag", name: "AI写真·单张旗舰", credits: 6, membershipDays: 0, amount: 6990, modelTier: null, tenantOnly: true },
  // 代理充值包：仅分站主人可购，永远走平台主收款
  agent_pack_200: { id: "agent_pack_200", name: "算力充值·200积分", credits: 200, membershipDays: 0, amount: 20000, modelTier: null, agentOnly: true },
  agent_pack_500: { id: "agent_pack_500", name: "算力充值·500积分", credits: 500, membershipDays: 0, amount: 50000, modelTier: null, agentOnly: true },
  ...SERVICE_PLAN_CATALOG,
});

const TIER_RANK = { NONE: 0, STANDARD: 1, HIGH: 2, FLAGSHIP: 3 };
const PLAN_TIER = { trial: "STANDARD", high: "HIGH", flagship: "FLAGSHIP" };

// 新买卡的档位只升不降：有效期内的现有档位比新卡档位高时，保留现有档位。
// 补充包（无 membershipDays）不改档位。
export function nextMembershipTier(currentMembership, currentExpiresAt, planId) {
  const planTier = PLAN_TIER[planId] || null;
  if (!planTier) return currentMembership || "NONE";
  const current = currentMembership || "NONE";
  const currentActive = currentExpiresAt && new Date(currentExpiresAt).getTime() > Date.now();
  const currentRank = currentActive ? TIER_RANK[current] || 0 : 0;
  return TIER_RANK[planTier] >= currentRank ? planTier : current;
}

export function getPlan(planId) {
  return PLAN_CATALOG[String(planId || "")];
}

// 套餐可见性：tenantOnly 只在分站卖；agentOnly 只有分站主人能在主站买
export function isTenantPlan(plan) {
  return Boolean(plan?.tenantOnly);
}

export function isAgentPlan(plan) {
  return Boolean(plan?.agentOnly);
}

export function isServicePlan(plan) {
  return Boolean(plan?.serviceOnly || plan?.orderType === "SERVICE");
}

// 主站公开充值列表：服务商品单独在服务中心展示
export function getPublicPlans() {
  return Object.values(PLAN_CATALOG).filter((plan) => !plan.tenantOnly && !plan.agentOnly && !isServicePlan(plan));
}

export function createRedeemCode() {
  const raw = crypto.randomBytes(10).toString("hex").toUpperCase();
  return `XNM-${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15)}`;
}

export function hashRedeemCode(code) {
  return crypto.createHash("sha256").update(String(code).trim().toUpperCase()).digest("hex");
}

export async function grantPlanToUser(tx, userId, plan, sourceType, sourceId) {
  const now = new Date();
  const user = await tx.user.findUnique({ where: { id: userId }, select: { credits: true, membershipExpiresAt: true } });
  if (!user) throw new Error("User not found");

  const nextExpiry = plan.membershipDays > 0
    ? new Date(Math.max(user.membershipExpiresAt?.getTime() || 0, now.getTime()) + plan.membershipDays * 86400000)
    : user.membershipExpiresAt;
  const nextMembership = plan.membershipDays > 0
    ? nextMembershipTier(user.membership, user.membershipExpiresAt, plan.id)
    : user.membership;
  const nextCredits = user.credits + plan.credits;
  const updated = await tx.user.update({
    where: { id: userId },
    data: {
      credits: plan.credits ? { increment: plan.credits } : undefined,
      membership: plan.membershipDays > 0 ? nextMembership : undefined,
      membershipExpiresAt: nextExpiry,
    },
    select: { id: true, credits: true, membership: true, membershipExpiresAt: true },
  });
  if (plan.credits) {
    await tx.creditLedger.create({ data: { userId, amount: plan.credits, balance: nextCredits, reason: plan.name, sourceType, sourceId } });
  }
  return updated;
}

export async function redeemCodeForUser(userId, code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!/^XNM-[A-Z0-9]{5}(-[A-Z0-9]{5}){3}$/.test(normalized)) throw new Error("卡密格式不正确");
  const result = await prisma.$transaction(async (tx) => {
    const redeem = await tx.redeemCode.findUnique({ where: { codeHash: hashRedeemCode(normalized) } });
    if (!redeem) throw new Error("卡密不存在");
    if (redeem.status !== "ACTIVE") throw new Error("卡密已使用或已失效");
    const now = new Date();
    if (redeem.expiresAt && redeem.expiresAt <= now) {
      await tx.redeemCode.updateMany({ where: { id: redeem.id, status: "ACTIVE" }, data: { status: "EXPIRED" } });
      return { error: "卡密已过期" };
    }
    const plan = getPlan(redeem.planId);
    if (!plan) throw new Error("卡密套餐不存在");
    if (!getPublicPlans().some((publicPlan) => publicPlan.id === plan.id) || isServicePlan(plan)) {
      throw new Error("该套餐不能通过兑换码兑换");
    }

    // Compare-and-set claims the code once; concurrent submissions cannot both grant benefits.
    const claimed = await tx.redeemCode.updateMany({
      where: {
        id: redeem.id,
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      data: { status: "REDEEMED", redeemedAt: now, redeemedById: userId },
    });
    if (claimed.count !== 1) {
      const latest = await tx.redeemCode.findUnique({ where: { id: redeem.id }, select: { status: true, expiresAt: true } });
      if (latest?.status === "ACTIVE" && latest.expiresAt && latest.expiresAt <= now) {
        await tx.redeemCode.updateMany({ where: { id: redeem.id, status: "ACTIVE" }, data: { status: "EXPIRED" } });
        return { error: "卡密已过期" };
      }
      return { error: "卡密已使用或已失效" };
    }
    const user = await grantPlanToUser(tx, userId, plan, "REDEEM", redeem.id);
    return { plan, user };
  });
  if (result.error) throw new Error(result.error);
  return result;
}
