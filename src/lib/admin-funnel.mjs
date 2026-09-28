export const FUNNEL_WINDOWS = Object.freeze({ activationDays: 7, paidDays: 30 });
const DAY_MS = 86400000;

export function isGuestUser(user) {
  return Boolean(user?.email && String(user.email).toLowerCase().endsWith("@guest.local"));
}

export function classifyUser(user) {
  return isGuestUser(user) ? "GUEST" : "REGISTERED";
}

export function isRegisteredUser(user) {
  return Boolean(!isGuestUser(user) && (user?.phone || user?.email));
}

export function calculateAdminMetrics({ orders = [], settlementRequests = [], recentFailureSampleCount = 0, totalFailedGenerations = 0, now = new Date() } = {}) {
  const types = ["MEMBERSHIP", "SERVICE", "SITE_ORDER", "AGENT_RECHARGE"];
  const byType = Object.fromEntries(types.map((orderType) => {
    const related = orders.filter((order) => order.orderType === orderType);
    const paidAmount = related.filter((o) => o.status === "PAID").reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
    const refundedAmount = related.filter((o) => o.status === "REFUNDED").reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
    return [orderType, {
      paidAmount,
      refundedAmount,
      netAmount: Math.max(0, paidAmount - refundedAmount),
      paidOrders: related.filter((o) => o.status === "PAID").length,
      refundedOrders: related.filter((o) => o.status === "REFUNDED").length,
    }];
  }));
  const pendingOrders = orders.filter((o) => o.status === "PENDING");
  const autoExpireEligible = pendingOrders.filter((o) => o.channel === "EPAY" && new Date(o.createdAt).getTime() < now.getTime() - 48 * 3600000).length;
  const settlementPending = settlementRequests.filter((r) => r.status === "PENDING");
  return {
    byType,
    netMainRevenueCents: byType.MEMBERSHIP.netAmount + byType.SERVICE.netAmount,
    pending: {
      total: pendingOrders.length,
      online: pendingOrders.filter((o) => o.channel === "EPAY").length,
      manual: pendingOrders.filter((o) => ["APPRECIATION", "WEIDIAN", "MANUAL"].includes(o.channel)).length,
      service: pendingOrders.filter((o) => o.orderType === "SERVICE").length,
    },
    pendingPreviewCount: Math.min(pendingOrders.length, 5),
    autoExpireEligible,
    settlement: {
      pendingCount: settlementPending.length,
      pendingAmount: settlementPending.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    },
    failures: { total: totalFailedGenerations, sampleCount: recentFailureSampleCount },
  };
}

// Convert a business-local calendar date to its UTC instant; do not depend on server timezone.
export function shanghaiDayStartUtc(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00+08:00`);
}

function toMs(value) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function percent(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Pure funnel calculation. Inputs are DB rows:
 * users: { id, email, phone, createdAt, createdAtEstimated }
 * completedGenerations: { userId, status, createdAt }[]
 * paidOrders: { userId, paidAt, status, orderType }[]
 */
export function calculateAdminFunnel({ users = [], completedGenerations = [], completedGenerationUserIds = [], paidOrders = [], now = new Date() } = {}) {
  const nowMs = toMs(now);
  const dayStart = shanghaiDayStartUtc(now);
  const dayStartMs = dayStart.getTime();
  const todayUsers = users.filter((u) => !u.createdAtEstimated && toMs(u.createdAt) >= dayStartMs);
  const todayRegistered = todayUsers.filter(isRegisteredUser);
  const todayGuests = todayUsers.filter(isGuestUser);
  const registeredUsers = users.filter((u) => !u.createdAtEstimated && isRegisteredUser(u));
  const eligible7 = registeredUsers.filter((u) => {
    const created = toMs(u.createdAt);
    return created !== null && created + FUNNEL_WINDOWS.activationDays * DAY_MS <= nowMs;
  });
  const eligible30 = registeredUsers.filter((u) => {
    const created = toMs(u.createdAt);
    return created !== null && created + FUNNEL_WINDOWS.paidDays * DAY_MS <= nowMs;
  });
  const userById = new Map(registeredUsers.map((u) => [u.id, u]));
  const activated7 = eligible7.filter((u) => {
    const created = toMs(u.createdAt);
    return completedGenerations.some((g) => {
      const generatedAt = toMs(g?.createdAt);
      return g?.userId === u.id && g?.status === "completed" && generatedAt !== null && generatedAt >= created && generatedAt < created + FUNNEL_WINDOWS.activationDays * DAY_MS;
    });
  }).length;
  const paidWithinWindow = new Set(
    paidOrders
      .filter((o) => o.status === "PAID" && o.orderType === "MEMBERSHIP" && o.userId && o.paidAt)
      .filter((o) => {
        const paid = toMs(o.paidAt);
        const user = userById.get(o.userId);
        const created = user ? toMs(user.createdAt) : null;
        return paid !== null && created !== null && paid >= created && paid < created + FUNNEL_WINDOWS.paidDays * DAY_MS;
      })
      .map((o) => o.userId),
  );
  const paid30 = eligible30.filter((u) => paidWithinWindow.has(u.id)).length;
  const estimatedUsers = users.filter((u) => u.createdAtEstimated);
  const newest = (a, b) => (toMs(b.createdAt) ?? 0) - (toMs(a.createdAt) ?? 0);
  const recentRegistered = registeredUsers.slice().sort(newest).slice(0, 5);
  const recentGuests = users.filter(isGuestUser).filter((u) => !u.createdAtEstimated).sort(newest).slice(0, 5);

  return {
    timezone: "Asia/Shanghai",
    todayStart: dayStart.toISOString(),
    today: { registered: todayRegistered.length, guests: todayGuests.length },
    totals: { registered: registeredUsers.length, guests: users.filter(isGuestUser).length, estimated: estimatedUsers.length },
    activation7d: { numerator: activated7, denominator: eligible7.length, rate: percent(activated7, eligible7.length), windowDays: FUNNEL_WINDOWS.activationDays },
    paid30d: { numerator: paid30, denominator: eligible30.length, rate: percent(paid30, eligible30.length), windowDays: FUNNEL_WINDOWS.paidDays, orderType: "MEMBERSHIP" },
    recentRegistered,
    recentGuests,
  };
}
