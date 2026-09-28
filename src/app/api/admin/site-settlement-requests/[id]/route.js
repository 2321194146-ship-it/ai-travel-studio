import { NextResponse } from "next/server";
import { requireAdmin, writeAdminLog } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

// 管理员确认已打款：把申请转 PAID，并把它覆盖的分站订单全部标记 SETTLED（幂等）。
// 打款本身是线下动作（扫码转账），系统只做记录与审计。
export async function PATCH(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body.action || "MARK_PAID";
    if (action !== "MARK_PAID") return NextResponse.json({ error: "未知操作" }, { status: 400 });
    const note = String(body.note || "").slice(0, 500) || null;

    const result = await prisma.$transaction(async (tx) => {
      const req = await tx.siteSettlementRequest.findUnique({ where: { id } });
      if (!req) throw new Error("打款申请不存在");
      if (req.status !== "PENDING") throw new Error("该申请已处理过");
      const orderIds = Array.isArray(req.orderIds) ? req.orderIds.map(String) : [];
      const settled = await tx.manualOrder.updateMany({
        where: { id: { in: orderIds }, status: "PAID", settlementStatus: "PENDING" },
        data: {
          settlementStatus: "SETTLED",
          settlementAmount: orderIds.length === 1 ? req.amount : undefined,
          settledAt: new Date(),
          settledById: auth.user.id,
        },
      });
      const updated = await tx.siteSettlementRequest.update({
        where: { id },
        data: { status: "PAID", paidAt: new Date(), paidById: auth.user.id, note: note || req.note },
      });
      await writeAdminLog(tx, auth.user.id, "SITE_SETTLEMENT_PAID", "SITE_SETTLEMENT_REQUEST", id, {
        subsiteId: req.subsiteId,
        amount: req.amount,
        orderCount: req.orderCount,
        ordersSettled: settled.count,
        note,
      });
      return { updated, ordersSettled: settled.count };
    });

    return NextResponse.json({ data: { id: result.updated.id, status: result.updated.status, paidAt: result.updated.paidAt, ordersSettled: result.ordersSettled } });
  } catch (error) {
    return NextResponse.json({ error: error.message || "登记打款失败" }, { status: 400 });
  }
}
