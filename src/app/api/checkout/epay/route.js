import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlan, isTenantPlan, isAgentPlan, isServicePlan } from "@/lib/entitlements";
import { epayEnabled, buildSubmitUrl } from "@/lib/services/epay";
import { getSubsiteFromRequest, tenantRequestError } from "@/lib/subsite";
import { SITE_COLLECTION_MODES, siteTenantHost } from "@/lib/subsite-accounting.mjs";
import { resolveSiteOrderContext, reserveSiteFee } from "@/lib/site-order-transactions.js";

// 易支付下单：创建 PENDING 订单，返回收银台跳转地址。
// 租户规则：x-tenant-slug 头存在但分站不存在/已暂停 → 明确拒绝，绝不降级为主站交易。
// 分站客户单（single_*）：AGENT 模式钱直达代理、下单即预扣平台 30% 供货费；PLATFORM 模式钱进平台、记代理 70% 应结。
// 代理充值包：仅分站主人可购，永远走平台主收款，不挂 subsiteId。
export async function POST(req) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "请先登录后再购买" }, { status: 401 });
  }
  // 登录态可能指向已被删除的账号（僵尸会话），先确认用户真实存在再写订单
  const buyer = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!buyer) {
    return NextResponse.json({ error: "账号已失效，请退出后重新登录再购买" }, { status: 401 });
  }

  const tenant = await getSubsiteFromRequest(req);
  const subsite = tenant.subsite;
  const tenantError = tenantRequestError(tenant);
  if (!subsite && !epayEnabled()) {
    return NextResponse.json({ error: "支付通道未配置，请稍后再试" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const plan = getPlan(body.planId);
    if (!plan || !plan.amount) {
      return NextResponse.json({ error: "套餐不存在" }, { status: 400 });
    }
    if (tenantError && (isTenantPlan(plan) || isAgentPlan(plan))) {
      return NextResponse.json(tenantError, { status: tenantError.status });
    }
    const serviceCheckout = body.context === "services";
    if (isServicePlan(plan) && !serviceCheckout) {
      return NextResponse.json({ error: "请从服务中心购买该服务" }, { status: 400 });
    }
    if (serviceCheckout && !isServicePlan(plan)) {
      return NextResponse.json({ error: "该商品不属于服务中心" }, { status: 400 });
    }
    let type = String(body.type || "alipay");
    if (!["alipay", "wxpay", "qqpay"].includes(type)) type = "alipay";

    if (subsite) {
      // 代理充值包：本人专属、平台主收款、不挂 subsiteId（回调按普通充值加代理积分）
      if (isAgentPlan(plan)) {
        if (subsite.ownerId !== userId) {
          return NextResponse.json({ error: "套餐不存在" }, { status: 400 });
        }
        if (!epayEnabled()) {
          return NextResponse.json({ error: "支付通道未配置，请稍后再试" }, { status: 503 });
        }
        const order = await prisma.manualOrder.create({
          data: { userId, channel: "EPAY", planId: plan.id, planName: plan.name, amount: plan.amount, status: "PENDING", orderType: isServicePlan(plan) ? "SERVICE" : plan.agentOnly ? "AGENT_RECHARGE" : "MEMBERSHIP", deliveryStatus: isServicePlan(plan) ? "NOT_STARTED" : "NOT_REQUIRED" },
        });
        const url = buildSubmitUrl({ orderNo: order.id, name: plan.name, moneyYuan: plan.amount / 100, type });
        return NextResponse.json({ url, orderId: order.id });
      }
      if (!isTenantPlan(plan)) {
        return NextResponse.json({ error: "套餐不存在" }, { status: 400 });
      }
      // 分站客户单：冻结收款模式与 70/30 分账快照；AGENT 模式事务内预扣平台份额
      const context = resolveSiteOrderContext(subsite, plan);
      const order = await prisma.$transaction(async (tx) => {
        const created = await tx.manualOrder.create({
          data: {
            userId,
            channel: "EPAY",
            planId: plan.id,
            planName: plan.name,
            amount: plan.amount,
            status: "PENDING",
            orderType: "SITE_ORDER",
            deliveryStatus: "NOT_REQUIRED",
            subsiteId: subsite.id,
            collectionMode: context.collectionMode,
            collectionPid: context.collectionPid,
            platformFeeBps: context.platformFeeBps,
            platformFeeAmount: context.platformFeeAmount,
            agentShareAmount: context.agentShareAmount,
            platformFeeCredits: context.platformFeeCredits,
            siteCreditsCost: context.siteCreditsCost,
            siteLedgerStatus: "NOT_REQUIRED",
          },
        });
        const withOwner = { ...created, subsite: { ownerId: subsite.ownerId } };
        if (context.collectionMode === SITE_COLLECTION_MODES.AGENT) {
          await reserveSiteFee(tx, withOwner);
          return { ...withOwner, siteLedgerStatus: "RESERVED" };
        }
        return withOwner;
      });
      const tenantReturnUrl = `https://${siteTenantHost(subsite.slug)}/?success=true`;
      const url = context.collectionMode === SITE_COLLECTION_MODES.AGENT
        ? buildSubmitUrl({
            orderNo: order.id,
            name: plan.name,
            moneyYuan: plan.amount / 100,
            type,
            overrides: {
              pid: subsite.epayPid,
              key: subsite.epayKey,
              submitUrl: subsite.epayApiUrl,
              notifyUrl: process.env.EPAY_NOTIFY_URL,
              returnUrl: tenantReturnUrl,
            },
          })
        : buildSubmitUrl({
            orderNo: order.id,
            name: plan.name,
            moneyYuan: plan.amount / 100,
            type,
            overrides: { returnUrl: tenantReturnUrl },
          });
      return NextResponse.json({ url, orderId: order.id });
    }

    // 主站：分站专售套餐不对外
    if (isTenantPlan(plan)) {
      return NextResponse.json({ error: "套餐不存在" }, { status: 400 });
    }
    if (isAgentPlan(plan)) {
      // 代理充值包：仅分站主人可购，永远走平台主收款
      const owned = await prisma.subsite.findUnique({ where: { ownerId: userId }, select: { id: true } });
      if (!owned) {
        return NextResponse.json({ error: "套餐不存在" }, { status: 400 });
      }
    }

    const order = await prisma.manualOrder.create({
      data: {
        userId,
        channel: "EPAY",
        planId: plan.id,
        planName: plan.name,
        amount: plan.amount,
        status: "PENDING",
        orderType: isServicePlan(plan) ? "SERVICE" : plan.agentOnly ? "AGENT_RECHARGE" : "MEMBERSHIP",
        deliveryStatus: isServicePlan(plan) ? "NOT_STARTED" : "NOT_REQUIRED",
      },
    });

    const url = buildSubmitUrl({
      orderNo: order.id,
      name: plan.name,
      moneyYuan: plan.amount / 100,
      type,
      overrides: isServicePlan(plan)
        ? { returnUrl: `${new URL(req.url).origin}/services?success=true&orderId=${encodeURIComponent(order.id)}` }
        : {},
    });
    return NextResponse.json({ url, orderId: order.id });
  } catch (err) {
    console.error("[EPAY_CHECKOUT]", err.message);
    return NextResponse.json({ error: err.message === "EPAY_DISABLED" ? "支付通道未配置，请稍后再试" : err.message || "订单创建失败，请稍后重试" }, { status: err.message && !err.message.includes("EPAY_DISABLED") && (err.message.includes("积分") || err.message.includes("收款配置")) ? 400 : 500 });
  }
}
