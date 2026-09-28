import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 分站中心：代理本人查看自己的分站信息、积分余额、分站订单
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const subsite = await prisma.subsite.findUnique({ where: { ownerId: userId } });
  if (!subsite) return NextResponse.json({ error: "非分站代理" }, { status: 404 });

  const [creditsAgg, orders, paidStats, pendingStats, latestRequest] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { credits: true } }),
    prisma.manualOrder.findMany({
      where: { subsiteId: subsite.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, planName: true, amount: true, status: true, createdAt: true, accountHint: true, paymentTradeNo: true, siteCreditsCost: true, collectionMode: true, settlementStatus: true, settlementAmount: true },
    }),
    // 收入汇总：已支付的分站客户单
    prisma.manualOrder.aggregate({
      where: { subsiteId: subsite.id, orderType: "SITE_ORDER", status: "PAID" },
      _count: { _all: true },
      _sum: { amount: true, agentShareAmount: true },
    }),
    // 平台代收：代理 70% 待人工打款的金额
    prisma.manualOrder.aggregate({
      where: { subsiteId: subsite.id, orderType: "SITE_ORDER", status: "PAID", settlementStatus: "PENDING" },
      _count: { _all: true },
      _sum: { settlementAmount: true, agentShareAmount: true },
    }),
    // 最近一条打款申请（进行中或最近完成）
    prisma.siteSettlementRequest.findFirst({
      where: { subsiteId: subsite.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, amount: true, orderCount: true, status: true, collectQrUrl: true, note: true, createdAt: true, paidAt: true },
    }),
  ]);

  const paidOrders = paidStats._count._all || 0;
  const salesTotal = paidStats._sum.amount || 0;
  const agentShareTotal = paidStats._sum.agentShareAmount || 0;
  const pendingCount = pendingStats._count._all || 0;
  // 待结算金额优先用已冻结的 70% 份额；历史单没有快照时无法推算，按 0 处理并在结算登记时补
  const pendingAmount = pendingStats._sum.settlementAmount ?? pendingStats._sum.agentShareAmount ?? 0;

  return NextResponse.json({
    data: {
      subsite: {
        slug: subsite.slug,
        siteName: subsite.siteName,
        status: subsite.status,
        siteUrl: `${subsite.slug}.face.shuqizhisou.cc`,
        payMode: subsite.epayPid ? "own" : "platform",
      },
      credits: creditsAgg?.credits ?? 0,
      income: { paidOrders, salesTotal, agentShareTotal, pendingCount, pendingAmount },
      settlementRequest: latestRequest ? {
        id: latestRequest.id,
        amount: latestRequest.amount,
        orderCount: latestRequest.orderCount,
        status: latestRequest.status,
        collectQrUrl: latestRequest.collectQrUrl,
        note: latestRequest.note,
        createdAt: latestRequest.createdAt,
        paidAt: latestRequest.paidAt,
      } : null,
      orders: orders.map((o) => ({
        id: o.id,
        planName: o.planName,
        amount: o.amount,
        status: o.status,
        createdAt: o.createdAt,
        buyerTail: o.accountHint || null,
        tradeTail: o.paymentTradeNo ? o.paymentTradeNo.slice(-6) : null,
        platformFeeCredits: o.siteCreditsCost ?? 0,
        settlementStatus: o.settlementStatus,
        settlementAmount: o.settlementAmount,
      })),
    },
  });
}
