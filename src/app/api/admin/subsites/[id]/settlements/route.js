import { NextResponse } from "next/server";
import { requireAdmin, writeAdminLog } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

// 平台代收人工结算：
// GET ?subsiteId=xxx&status=PENDING → 列出该分站待结算/已结算订单明细
// PATCH { orderId, settlementAmount, note?, action: "SETTLE" } → 管理员登记应结金额并确认已结
// 金额必须为非负整数（分）；操作全部写审计。
export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const subsiteId = params.get("subsiteId")?.trim();
  if (!subsiteId) return NextResponse.json({ error: "缺少 subsiteId" }, { status: 400 });
  const status = params.get("status")?.trim() || "PENDING";
  if (!["PENDING", "SETTLED", "ALL"].includes(status)) return NextResponse.json({ error: "结算状态不正确" }, { status: 400 });
  const orders = await prisma.manualOrder.findMany({
    where: { subsiteId, orderType: "SITE_ORDER", status: "PAID", ...(status === "ALL" ? {} : { settlementStatus: status }) },
    orderBy: { paidAt: "desc" },
    take: 50,
    select: { id: true, planName: true, amount: true, agentShareAmount: true, settlementStatus: true, settlementAmount: true, settlementNote: true, settledAt: true, paidAt: true, paymentTradeNo: true, user: { select: { phone: true } } },
  });
  return NextResponse.json({
    data: orders.map((o) => ({
      id: o.id,
      planName: o.planName,
      amount: o.amount,
      agentShareAmount: o.agentShareAmount,
      settlementStatus: o.settlementStatus,
      settlementAmount: o.settlementAmount,
      settlementNote: o.settlementNote,
      settledAt: o.settledAt,
      paidAt: o.paidAt,
      tradeTail: o.paymentTradeNo ? o.paymentTradeNo.slice(-6) : null,
      buyerTail: o.user?.phone ? `****${o.user.phone.slice(-4)}` : null,
    })),
  });
}

export async function PATCH(request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const orderId = String(body.orderId || "").trim();
    const amount = Math.trunc(Number(body.settlementAmount));
    if (!orderId) return NextResponse.json({ error: "缺少订单 ID" }, { status: 400 });
    if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: "应结金额需为非负整数（分）" }, { status: 400 });
    const note = String(body.note || "").slice(0, 500) || null;
    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.manualOrder.findUnique({ where: { id: orderId }, select: { id: true, subsiteId: true, orderType: true, status: true, collectionMode: true, settlementStatus: true, agentShareAmount: true } });
      if (!order) throw new Error("订单不存在");
      if (order.orderType !== "SITE_ORDER" || order.collectionMode !== "PLATFORM") throw new Error("只有平台代收的分站订单支持人工结算");
      if (order.status !== "PAID") throw new Error("只有已支付订单可以登记结算");
      if (order.settlementStatus === "SETTLED") throw new Error("该订单已登记结算");
      const next = await tx.manualOrder.update({
        where: { id: orderId },
        data: { settlementStatus: "SETTLED", settlementAmount: amount, settlementNote: note, settledAt: new Date(), settledById: auth.user.id },
      });
      await writeAdminLog(tx, auth.user.id, "SITE_ORDER_SETTLED", "MANUAL_ORDER", orderId, { subsiteId: order.subsiteId, amount, note, suggested: order.agentShareAmount });
      return next;
    });
    return NextResponse.json({ data: { id: updated.id, settlementStatus: updated.settlementStatus, settlementAmount: updated.settlementAmount } });
  } catch (error) {
    return NextResponse.json({ error: error.message || "登记结算失败" }, { status: 400 });
  }
}
