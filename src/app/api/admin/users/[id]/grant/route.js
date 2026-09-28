import { NextResponse } from "next/server";
import { requireAdmin, writeAdminLog } from "@/lib/admin";
import { getPlan, grantPlanToUser, isServicePlan } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

export async function POST(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const body = await request.json();
    const plan = getPlan(body.planId);
    if (!plan || isServicePlan(plan)) return NextResponse.json({ error: "服务商品请通过服务订单交付，不能直接开通权益" }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, credits: true, membership: true } });
    if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    await prisma.$transaction(async (tx) => {
      await grantPlanToUser(tx, id, plan, "MANUAL", auth.user.id);
      await writeAdminLog(tx, auth.user.id, "GRANT_ENTITLEMENT", "USER", id, { planId: plan.id });
    });
    return NextResponse.json({ success: true, planId: plan.id });
  } catch (error) {
    return NextResponse.json({ error: error.message || "开通失败" }, { status: 400 });
  }
}
