import { NextResponse } from "next/server";
import { requireAdmin, toAdminUserSummary, adminUserSelect } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { calculateAdminFunnel, calculateAdminMetrics, shanghaiDayStartUtc } from "@/lib/admin-funnel.mjs";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  // This endpoint is read-only. Expired EPAY orders are counted for the work queue, not modified here.
  const now = new Date();
  const dayStart = shanghaiDayStartUtc(now);
  const expiringAt = new Date(now.getTime() + 7 * 86400000);
  const mature7Before = new Date(now.getTime() - 7 * 86400000);
  const formalUserWhere = {
    createdAtEstimated: false,
    OR: [
      { phone: { not: null } },
      { AND: [{ email: { not: null } }, { NOT: { email: { endsWith: "@guest.local" } } }] },
    ],
  };
  const guestUserWhere = { email: { endsWith: "@guest.local" } };

  const [formalUsers, estimatedUsers, guestUsers, latestGuests] = await Promise.all([
    prisma.user.findMany({ where: formalUserWhere, select: { id: true, email: true, phone: true, createdAt: true, createdAtEstimated: true, name: true, membership: true } }),
    prisma.user.count({ where: { createdAtEstimated: true } }),
    prisma.user.count({ where: guestUserWhere }),
    prisma.user.findMany({ where: { ...guestUserWhere, createdAtEstimated: false }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, phone: true, email: true, name: true, createdAt: true, createdAtEstimated: true, membership: true } }),
  ]);
  const formalIds = formalUsers.map((user) => user.id);
  const matureFormalIds = formalUsers.filter((user) => new Date(user.createdAt).getTime() + 7 * 86400000 <= now.getTime()).map((user) => user.id);
  const latestFormal = formalUsers.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  const [
    users,
    totalOrders,
    generations,
    expiringMemberships,
    recentFailures,
    recentAudit,
    completedGenerations,
    paidMembershipOrders,
    orderRows,
    settlementRows,
    pendingOrderRows,
    userRows,
    circlePending,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.manualOrder.count(),
    prisma.generation.count(),
    prisma.user.count({ where: { membershipExpiresAt: { gt: now, lte: expiringAt } } }),
    prisma.generation.findMany({ where: { status: "failed" }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, userId: true, status: true, modelName: true, provider: true, actualModel: true, failureReason: true, templateName: true, createdAt: true, user: { select: adminUserSelect() } } }),
    prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, action: true, targetType: true, targetId: true, detail: true, createdAt: true, actor: { select: { id: true, name: true, phone: true, email: true } } } }),
    matureFormalIds.length ? prisma.generation.findMany({ where: { userId: { in: matureFormalIds }, status: "completed" }, select: { userId: true, status: true, createdAt: true } }) : Promise.resolve([]),
    formalIds.length ? prisma.manualOrder.findMany({ where: { userId: { in: formalIds }, orderType: "MEMBERSHIP", status: "PAID", paidAt: { lt: now } }, select: { userId: true, paidAt: true, status: true, orderType: true } }) : Promise.resolve([]),
    prisma.manualOrder.findMany({ where: { status: { in: ["PAID", "REFUNDED", "PENDING"] } }, select: { orderType: true, status: true, amount: true, channel: true, createdAt: true, paidAt: true, updatedAt: true } }),
    prisma.siteSettlementRequest.findMany({ where: { status: "PENDING" }, select: { amount: true, status: true } }),
    prisma.manualOrder.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, userId: true, planName: true, amount: true, channel: true, orderType: true, createdAt: true, accountHint: true, user: { select: { phone: true, email: true, name: true } } } }),
    formalIds.length ? prisma.user.findMany({ where: { id: { in: formalIds } }, select: { id: true, phone: true, email: true, name: true } }) : Promise.resolve([]),
    prisma.circlePost.count({ where: { status: "PENDING" } }),
  ]);

  const funnel = calculateAdminFunnel({ users: formalUsers, completedGenerations, paidOrders: paidMembershipOrders, now });
  const metrics = calculateAdminMetrics({ orders: orderRows, settlementRequests: settlementRows, recentFailureSampleCount: recentFailures.length, totalFailedGenerations: await prisma.generation.count({ where: { status: "failed" } }), now });
  const revenueByOrderType = metrics.byType;
  const userMap = new Map(userRows.map((u) => [u.id, u]));
  const pendingOrderPreview = pendingOrderRows.map((order) => {
    const user = order.user || userMap.get(order.userId) || null;
    const phone = user?.phone || null;
    const buyerLabel = phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : user?.email?.endsWith("@guest.local") ? "游客体验" : user?.email || order.accountHint || "未关联账号";
    return { ...order, userLabel: buyerLabel };
  });
  const paidRevenue = (metrics.netMainRevenueCents / 100).toFixed(2);
  const todayMetrics = calculateAdminMetrics({ orders: orderRows.filter((order) => {
    const eventAt = order.status === "REFUNDED" ? new Date(order.updatedAt || order.createdAt) : new Date(order.paidAt || order.createdAt);
    return eventAt >= dayStart && eventAt < now;
  }) });
  const todayRevenue = (todayMetrics.netMainRevenueCents / 100).toFixed(2);
  const todayPaidOrderCount = ["MEMBERSHIP", "SERVICE"].reduce((sum, type) => sum + (todayMetrics.byType[type]?.paidOrders || 0), 0);
  const failureGroups = new Map();
  for (const row of recentFailures) {
    const key = `${row.templateName || row.modelName || "生成任务"}|${row.failureReason || "unknown"}`;
    const existing = failureGroups.get(key);
    if (existing) {
      existing.count += 1;
      if (new Date(row.createdAt) > new Date(existing.createdAt)) existing.createdAt = row.createdAt;
    } else failureGroups.set(key, { ...row, count: 1 });
  }
  const groupedFailures = [...failureGroups.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);
  const officialUsers = formalUsers.length;

  return NextResponse.json({ data: {
    users,
    officialUsers,
    guestUsers,
    estimatedUsers,
    orders: totalOrders,
    pendingOrders: metrics.pending.total,
    paidRevenue,
    generations,
    todayUsers: funnel.today.registered,
    todayRegistered: funnel.today.registered,
    todayGuests: funnel.today.guests,
    registrationFunnel: { today: funnel.today, funnel: { activation7d: funnel.activation7d, paid30d: funnel.paid30d } },
    recentRegistrations: latestFormal,
    recentGuests: latestGuests,
    todayRevenue,
    todayOrders: todayPaidOrderCount,
    revenueByOrderType,
    manualPendingOrders: metrics.pending.manual,
    epayPendingOrders: metrics.pending.online,
    autoExpireEligible: metrics.autoExpireEligible,
    serviceDeliveryPending: await prisma.manualOrder.count({ where: { orderType: "SERVICE", status: "PAID", deliveryStatus: { notIn: ["DELIVERED", "CANCELLED"] } } }),
    platformSettlementPendingCount: metrics.settlement.pendingCount,
    platformSettlementPendingAmount: metrics.settlement.pendingAmount,
    circlePending,
    pendingOrderRows,
    failedGenerations: metrics.failures.total,
    failedGenerationSampleCount: metrics.failures.sampleCount,
    processingGenerations: await prisma.generation.count({ where: { status: "processing" } }),
    expiringMemberships,
    recentFailures: groupedFailures.map((row) => ({ ...row, user: toAdminUserSummary(row.user) })),
    recentAudit,
    generatedAt: now.toISOString(),
    businessTimezone: "Asia/Shanghai",
  } });
}
