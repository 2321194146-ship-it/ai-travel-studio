import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getPlan, isServicePlan } from "@/lib/entitlements";
import { checkRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  // 限流：防止批量创建垃圾订单干扰人工审核
  const rl = checkRateLimit(`order:${session.user.id}`, 5, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "操作过于频繁，请稍后再试" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  try {
    const { planId } = await request.json();
    const plan = getPlan(planId);
    // 分站专售与代理充值套餐不走赞赏通道（分站单由分站收款，充值由分站中心收款）
    if (!plan || plan.tenantOnly || plan.agentOnly) return NextResponse.json({ error: "套餐不存在" }, { status: 400 });
    if (isServicePlan(plan)) return NextResponse.json({ error: "请从服务中心购买该服务" }, { status: 400 });
    const order = await prisma.manualOrder.create({
      data: {
        userId: session.user.id,
        channel: "APPRECIATION",
        planId: plan.id,
        planName: plan.name,
        amount: plan.amount,
        note: "个人支付宝收款，付款后由后台人工确认",
      },
    });
    return NextResponse.json({
      data: order,
      qrUrl: process.env.NEXT_PUBLIC_ALIPAY_QR_URL || "",
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "创建订单失败" }, { status: 400 });
  }
}
