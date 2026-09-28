import { NextResponse } from "next/server";
import { requireAdmin, writeAdminLog } from "@/lib/admin";
import { getPlan, isServicePlan } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const status = params.get("status")?.trim();
  const orderType = params.get("orderType")?.trim();
  const deliveryStatus = params.get("deliveryStatus")?.trim();
  const q = params.get("q")?.trim();
  const where = {
    ...(status ? { status } : {}),
    ...(orderType ? { orderType } : {}),
    ...(deliveryStatus ? { deliveryStatus } : {}),
    ...(q
      ? {
          OR: [
            { id: { contains: q, mode: "insensitive" } },
            { planId: { contains: q, mode: "insensitive" } },
            { planName: { contains: q, mode: "insensitive" } },
            { accountHint: { contains: q, mode: "insensitive" } },
            { note: { contains: q, mode: "insensitive" } },
            { user: { is: { phone: { contains: q } } } },
            { user: { is: { email: { contains: q, mode: "insensitive" } } } },
            { user: { is: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const orders = await prisma.manualOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { id: true, phone: true, name: true, email: true } } },
  });
  return NextResponse.json({ data: orders });
}

export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const plan = getPlan(body.planId);
    if (!plan) return NextResponse.json({ error: "套餐不存在" }, { status: 400 });
    const order = await prisma.manualOrder.create({
      data: {
        userId: body.userId || null,
        channel: ["APPRECIATION", "WEIDIAN", "MANUAL"].includes(body.channel) ? body.channel : "MANUAL",
        planId: plan.id,
        planName: plan.name,
        amount: Math.max(0, Number(body.amount) || plan.amount),
        accountHint: body.accountHint ? String(body.accountHint).slice(0, 120) : null,
        note: body.note ? String(body.note).slice(0, 2000) : null,
        orderType: isServicePlan(plan) ? "SERVICE" : plan.agentOnly ? "AGENT_RECHARGE" : "MEMBERSHIP",
        deliveryStatus: isServicePlan(plan) ? "NOT_STARTED" : "NOT_REQUIRED",
      },
    });
    await writeAdminLog(prisma, auth.user.id, "CREATE_ORDER", "MANUAL_ORDER", order.id, { channel: order.channel, planId: plan.id });
    return NextResponse.json({ data: order }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "创建订单失败" }, { status: 400 });
  }
}
