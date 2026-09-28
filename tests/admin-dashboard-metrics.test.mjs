import test from "node:test";
import assert from "node:assert/strict";
import { calculateAdminFunnel, calculateAdminMetrics, shanghaiDayStartUtc } from "../src/lib/admin-funnel.mjs";

const now = new Date("2026-09-26T06:00:00.000Z");

const users = [
  { id: "phone-1", phone: "13800000000", createdAt: "2026-08-01T00:00:00Z", createdAtEstimated: false },
  { id: "phone-2", phone: "13900000000", createdAt: "2026-08-01T00:00:00Z", createdAtEstimated: false },
  { id: "guest-1", email: "guest_a@guest.local", createdAt: "2026-08-01T00:00:00Z", createdAtEstimated: false },
];

test("admin metrics: 主站净收入仅会员/服务，退款冲减，同型订单汇总", () => {
  const result = calculateAdminMetrics({
    orders: [
      { orderType: "MEMBERSHIP", status: "PAID", amount: 990 },
      { orderType: "MEMBERSHIP", status: "REFUNDED", amount: 1990 },
      { orderType: "SERVICE", status: "PAID", amount: 29900 },
      { orderType: "SITE_ORDER", status: "PAID", amount: 2990 },
      { orderType: "AGENT_RECHARGE", status: "PAID", amount: 20000 },
    ],
  });
  assert.equal(result.netMainRevenueCents, 29900);
  assert.equal(result.byType.MEMBERSHIP.netAmount, 0);
  assert.equal(result.byType.SERVICE.netAmount, 29900);
  assert.equal(result.byType.SITE_ORDER.paidAmount, 2990);
  assert.equal(result.byType.AGENT_RECHARGE.paidAmount, 20000);
});

test("admin metrics: pending totals partition by channel and orderType without double count", () => {
  const result = calculateAdminMetrics({
    orders: [
      { status: "PENDING", channel: "EPAY", orderType: "MEMBERSHIP", amount: 990 },
      { status: "PENDING", channel: "APPRECIATION", orderType: "MEMBERSHIP", amount: 1990 },
      { status: "PENDING", channel: "EPAY", orderType: "SERVICE", amount: 29900 },
      { status: "PAID", channel: "EPAY", orderType: "MEMBERSHIP", amount: 990 },
    ],
  });
  assert.deepEqual(result.pending, { total: 3, online: 2, manual: 1, service: 1 });
});

test("admin metrics: 展示列表记录数与全量待办数分开返回", () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ id: String(i), status: "PENDING", channel: "EPAY", orderType: "MEMBERSHIP" }));
  const result = calculateAdminMetrics({ orders: rows });
  assert.equal(result.pending.total, 8);
  assert.equal(result.pendingPreviewCount, 5);
});

test("admin metrics: 48小时 auto-expire 只包括旧 EPAY，不包括人工核款", () => {
  const result = calculateAdminMetrics({
    orders: [
      { status: "PENDING", channel: "EPAY", orderType: "MEMBERSHIP", createdAt: new Date(now.getTime() - 49 * 3600000) },
      { status: "PENDING", channel: "EPAY", orderType: "SERVICE", createdAt: new Date(now.getTime() - 47 * 3600000) },
      { status: "PENDING", channel: "MANUAL", orderType: "MEMBERSHIP", createdAt: new Date(now.getTime() - 90 * 86400000) },
    ],
    now,
  });
  assert.equal(result.autoExpireEligible, 1);
});

test("admin metrics: 待打款金额与计数独立，不混入客户实收", () => {
  const result = calculateAdminMetrics({
    settlementRequests: [
      { status: "PENDING", amount: 2093 },
      { status: "PENDING", amount: 2793 },
      { status: "PAID", amount: 1000 },
    ],
  });
  assert.deepEqual(result.settlement, { pendingCount: 2, pendingAmount: 4886 });
});

test("admin metrics: 近期失败列表的样本范围明确，不冒充全历史失败数", () => {
  const result = calculateAdminMetrics({ recentFailureSampleCount: 30, totalFailedGenerations: 129 });
  assert.deepEqual(result.failures, { total: 129, sampleCount: 30 });
});

test("admin funnel: 历史估算时间用户与游客不计入正式 cohort", () => {
  const result = calculateAdminFunnel({ users: [
    users[0], users[1], users[2],
    { id: "estimated", phone: "13700000000", createdAt: "2026-08-01T00:00:00Z", createdAtEstimated: true },
  ], now });
  assert.equal(result.totals.registered, 2);
  assert.equal(result.totals.guests, 1);
  assert.equal(result.totals.estimated, 1);
});

test("admin funnel: 上海自然日边界精确采用 UTC+8", () => {
  assert.equal(shanghaiDayStartUtc(new Date("2026-09-26T15:59:59.999Z")).toISOString(), "2026-09-25T16:00:00.000Z");
  assert.equal(shanghaiDayStartUtc(new Date("2026-09-26T16:00:00.000Z")).toISOString(), "2026-09-26T16:00:00.000Z");
});
