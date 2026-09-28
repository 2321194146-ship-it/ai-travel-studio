import { NextResponse } from "next/server";
import { requireAdmin, writeAdminLog } from "@/lib/admin";
import { getPlan, isServicePlan } from "@/lib/entitlements";
import { settleSiteOrderOnPaid, reverseSiteOrderOnRefund, releaseSiteFee } from "@/lib/site-order-transactions.js";
import { clawbackCredits } from "@/lib/credit-clawback.mjs";
import { prisma } from "@/lib/prisma";

const DELIVERY_STATUSES = new Set([
  "NOT_REQUIRED",
  "NOT_STARTED",
  "WAITING_CUSTOMER",
  "IN_PROGRESS",
  "DELIVERED",
  "CANCELLED",
]);

export async function PATCH(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const { id } = await params;
    const nextStatus = body.status ? String(body.status).toUpperCase() : null;
    const requestedDelivery = body.deliveryStatus == null ? null : String(body.deliveryStatus).toUpperCase();
    if (nextStatus && !["PAID", "CANCELLED", "REFUNDED"].includes(nextStatus)) {
      return NextResponse.json({ error: "订单状态不正确" }, { status: 400 });
    }
    if (requestedDelivery && !DELIVERY_STATUSES.has(requestedDelivery)) {
      return NextResponse.json({ error: "交付状态不正确" }, { status: 400 });
    }
    if (!nextStatus && !requestedDelivery && body.note === undefined && body.nextFollowUpAt === undefined) {
      return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.manualOrder.findUnique({ where: { id } });
      if (!order) throw new Error("订单不存在");
      const plan = getPlan(order.planId);
      if (!plan) throw new Error("套餐不存在");
      const serviceOrder = order.orderType === "SERVICE" || isServicePlan(plan);
      const before = {
        status: order.status,
        deliveryStatus: order.deliveryStatus,
        note: order.note,
        nextFollowUpAt: order.nextFollowUpAt,
      };
      const data = {};

      if (nextStatus && nextStatus !== order.status) {
        if (nextStatus === "PAID" && !serviceOrder && !order.userId) throw new Error("订单还未绑定用户");
        if (nextStatus === "REFUNDED" && order.status !== "PAID") throw new Error("只有已支付订单可以登记退款");
        if (nextStatus === "REFUNDED" && !body.refundConfirmed) {
          throw new Error("请在网关/线下完成退款后，携带 refundConfirmed=true 再登记");
        }
        if (nextStatus === "PAID" && order.orderType === "SITE_ORDER" && body.refundConfirmed) {
          throw new Error("分站订单不能在退款状态下再确认收款");
        }
        data.status = nextStatus;
        if (nextStatus === "PAID") data.paidAt = order.paidAt || new Date();
        if (nextStatus === "PAID" && serviceOrder && order.deliveryStatus === "NOT_REQUIRED") data.deliveryStatus = "NOT_STARTED";
      }
      if (requestedDelivery) {
        if (!serviceOrder) throw new Error("只有服务订单可以更新交付状态");
        data.deliveryStatus = requestedDelivery;
        if (requestedDelivery === "DELIVERED") data.deliveredAt = order.deliveredAt || new Date();
        if (requestedDelivery !== "DELIVERED") data.deliveredAt = null;
      }
      if (body.note !== undefined) data.note = body.note == null ? null : String(body.note).slice(0, 2000);
      if (body.nextFollowUpAt !== undefined) {
        data.nextFollowUpAt = body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null;
        if (data.nextFollowUpAt && Number.isNaN(data.nextFollowUpAt.getTime())) throw new Error("跟进时间不正确");
      }
      if (!Object.keys(data).length) return order;

      const result = await tx.manualOrder.update({ where: { id: order.id }, data });
      if (nextStatus && nextStatus !== order.status) {
        if (nextStatus === "PAID" && order.status !== "PAID" && !serviceOrder) {
          await grantPlanToUser(tx, order.userId, plan, "MANUAL_ORDER", order.id);
          // 分站订单与网关回调共用同一结算：AGENT 记 CHARGED（下单已预扣 30%），PLATFORM 记待人工结算
          if (order.subsiteId) {
            const fresh = await tx.manualOrder.findUnique({ where: { id: order.id }, include: { subsite: { select: { ownerId: true } } } });
            await settleSiteOrderOnPaid(tx, fresh);
          }
        }
        if (nextStatus === "REFUNDED" && order.status === "PAID") {
          // 退款收回：扣回该订单发放给买家的生成次数（余额不足扣到 0 为止；服务单无次数不涉及）
          if (!serviceOrder && order.userId) {
            await clawbackCredits(tx, { userId: order.userId, credits: plan.credits, planName: plan.name, sourceId: order.id });
          }
          // 退款冲正：回补代理预扣的平台份额/关闭待结算
          if (order.subsiteId) {
            const fresh = await tx.manualOrder.findUnique({ where: { id: order.id }, include: { subsite: { select: { ownerId: true } } } });
            await reverseSiteOrderOnRefund(tx, fresh);
          }
        }
        if (nextStatus === "CANCELLED" && order.status === "PENDING" && order.subsiteId) {
          // 未支付取消：释放下单时预扣的平台供货费
          const fresh = await tx.manualOrder.findUnique({ where: { id: order.id }, include: { subsite: { select: { ownerId: true } } } });
          await releaseSiteFee(tx, fresh, "分站订单人工取消");
        }
        await writeAdminLog(tx, auth.user.id, `ORDER_${nextStatus}`, "MANUAL_ORDER", order.id, { userId: order.userId, orderType: order.orderType, refundConfirmed: Boolean(body.refundConfirmed) });
      }
      if (requestedDelivery || body.note !== undefined || body.nextFollowUpAt !== undefined) {
        await writeAdminLog(tx, auth.user.id, "ORDER_DELIVERY_UPDATED", "MANUAL_ORDER", order.id, {
          before,
          after: {
            status: result.status,
            deliveryStatus: result.deliveryStatus,
            note: result.note,
            nextFollowUpAt: result.nextFollowUpAt,
          },
        });
      }
      return result;
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json({ error: error.message || "更新订单失败" }, { status: 400 });
  }
}
