import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyNotifyParams } from "@/lib/services/epay";
import { getPlan, grantPlanToUser, isServicePlan } from "@/lib/entitlements";
import { grantInvitePaymentReward } from "@/lib/invite";
import { settleSiteOrderOnPaid } from "@/lib/site-order-transactions.js";

// 易支付支付成功回调（GET，统一进主站）。
// 幂等发货：PENDING → PAID 行级抢占，重复/并发回调只有一个事务真正发货。
// 分站订单按订单上的收款快照验签（AGENT 用代理密钥、PLATFORM 用平台密钥），
// 并校验回调 pid 与订单冻结商户一致，避免跨商户误认。
export async function GET(req) {
  const searchParams = new URL(req.url).searchParams;

  try {
    // 先按商户单号查订单，决定用哪把密钥验签：分站订单按快照模式选密钥，平台订单用 env 密钥
    const orderLite = await prisma.manualOrder.findUnique({
      where: { id: String(searchParams.get("out_trade_no") || "") },
      select: { subsiteId: true, collectionMode: true, collectionPid: true },
    });
    let subsite = null;
    if (orderLite?.subsiteId) {
      subsite = await prisma.subsite.findUnique({
        where: { id: orderLite.subsiteId },
        select: { ownerId: true, epayPid: true, epayKey: true },
      });
      if (!subsite) return new NextResponse("fail", { status: 400 });
    }

    let params;
    try {
      params = verifyNotifyParams(searchParams, subsite?.epayKey || undefined);
    } catch {
      return new NextResponse("fail", { status: 400 });
    }
    if (!params) return new NextResponse("fail", { status: 400 });

    // 商户归属校验：分站 AGENT 订单必须命中代理 PID；PLATFORM/主站订单必须命中平台 PID
    const platformPid = String(process.env.EPAY_PID || "");
    const callbackPid = String(params.pid || "");
    if (subsite && orderLite.collectionMode === "AGENT") {
      if (!subsite.epayPid || callbackPid !== subsite.epayPid) return new NextResponse("fail", { status: 400 });
    } else if (platformPid && callbackPid !== platformPid) {
      return new NextResponse("fail", { status: 400 });
    }

    if (String(params.trade_status || "") !== "TRADE_SUCCESS") {
      // 非成功状态（如过期）直接确认，避免网关反复重试
      return new NextResponse("success");
    }

    const outTradeNo = String(params.out_trade_no || "");
    const order = await prisma.manualOrder.findUnique({ where: { id: outTradeNo } });
    if (!order || !order.userId) return new NextResponse("fail", { status: 400 });

    // 金额必须与订单一致（易支付 money 单位为元，订单金额单位为分）
    if (Math.round(Number(params.money) * 100) !== order.amount) {
      return new NextResponse("fail", { status: 400 });
    }
    const plan = getPlan(order.planId);
    if (!plan) return new NextResponse("fail", { status: 400 });

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.manualOrder.updateMany({
        where: { id: order.id, status: "PENDING" },
        data: {
          status: "PAID",
          paidAt: new Date(),
          paymentTradeNo: params.trade_no || null,
          deliveryStatus: isServicePlan(plan) ? "NOT_STARTED" : order.deliveryStatus,
        },
      });
      if (claimed.count === 0) return; // 已处理，重放回调直接跳过
      if (isServicePlan(plan)) return;
      await grantPlanToUser(tx, order.userId, plan, "PAYMENT", order.id);
      // 分站订单统一结算：AGENT 记 CHARGED（下单已预扣平台 30%），PLATFORM 记待人工结算
      if (order.subsiteId) {
        const fresh = await tx.manualOrder.findUnique({ where: { id: order.id }, include: { subsite: { select: { ownerId: true } } } });
        await settleSiteOrderOnPaid(tx, { ...fresh, subsite: fresh?.subsite });
      }
      // 比帅邀请奖励：同一事务内给邀请人加分，保证账本一致
      await grantInvitePaymentReward(tx, order.userId, order.planId, order.id);
    });

    return new NextResponse("success");
  } catch (err) {
    console.error("[EPAY_NOTIFY]", err.message);
    // 返回 fail 让网关稍后重试（事务已回滚，不会重复发货）
    return new NextResponse("fail", { status: 500 });
  }
}
