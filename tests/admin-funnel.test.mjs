import test from "node:test";
import assert from "node:assert/strict";
import { calculateAdminFunnel, classifyUser, isGuestUser, shanghaiDayStartUtc } from "../src/lib/admin-funnel.mjs";

const now = new Date("2026-09-26T06:00:00.000Z"); // 上海 14:00

test("账号分类：guest.local 单列，其余非空身份字段为正式账户", () => {
  assert.equal(classifyUser({ email: "guest_abc@guest.local" }), "GUEST");
  assert.equal(isGuestUser({ email: "GUEST_ABC@GUEST.LOCAL" }), true);
  assert.equal(classifyUser({ phone: "13800000000", email: null }), "REGISTERED");
  assert.equal(classifyUser({ email: "u@example.com" }), "REGISTERED");
  assert.equal(classifyUser({ phone: null, email: null }), "REGISTERED");
});

test("上海时区日界线按 UTC+8 计算", () => {
  assert.equal(shanghaiDayStartUtc(now).toISOString(), "2026-09-25T16:00:00.000Z");
  const beforeMidnightShanghai = new Date("2026-09-25T15:59:59.999Z");
  const afterMidnightShanghai = new Date("2026-09-25T16:00:00.000Z");
  assert.equal(shanghaiDayStartUtc(beforeMidnightShanghai).toISOString(), "2026-09-24T16:00:00.000Z");
  assert.equal(shanghaiDayStartUtc(afterMidnightShanghai).toISOString(), "2026-09-25T16:00:00.000Z");
});

test("今日正式注册与游客新增分开，历史估算时间排除", () => {
  const result = calculateAdminFunnel({
    now,
    users: [
      { id: "today-phone", phone: "13800000000", createdAt: "2026-09-26T01:00:00Z", createdAtEstimated: false },
      { id: "today-guest", email: "guest_1@guest.local", createdAt: "2026-09-26T02:00:00Z", createdAtEstimated: false },
      { id: "history-estimated", phone: "13900000000", createdAt: "2026-09-26T03:00:00Z", createdAtEstimated: true },
      { id: "yesterday", phone: "13700000000", createdAt: "2026-09-25T15:59:59Z", createdAtEstimated: false },
    ],
  });
  assert.deepEqual(result.today, { registered: 1, guests: 1 });
  assert.deepEqual(result.totals, { registered: 2, guests: 1, estimated: 1 });
});

test("7 日激活：只统计注册后 7 天窗内的 completed 生成并按用户去重", () => {
  const users = [
    { id: "eligible", phone: "1", createdAt: "2026-09-10T00:00:00Z", createdAtEstimated: false },
    { id: "not-yet", phone: "2", createdAt: "2026-09-22T00:00:00Z", createdAtEstimated: false },
    { id: "guest", email: "guest_x@guest.local", createdAt: "2026-09-10T00:00:00Z", createdAtEstimated: false },
    { id: "estimated", phone: "3", createdAt: "2026-09-10T00:00:00Z", createdAtEstimated: true },
  ];
  const result = calculateAdminFunnel({
    users,
    now,
    completedGenerations: [
      { userId: "eligible", status: "completed", createdAt: "2026-09-12T00:00:00Z" },
      { userId: "eligible", status: "completed", createdAt: "2026-09-13T00:00:00Z" },
      { userId: "eligible", status: "failed", createdAt: "2026-09-12T00:00:00Z" },
      { userId: "eligible", status: "completed", createdAt: "2026-09-18T00:00:00Z" },
      { userId: "estimated", status: "completed", createdAt: "2026-09-12T00:00:00Z" },
    ],
  });
  assert.equal(result.activation7d.numerator, 1);
  assert.equal(result.activation7d.denominator, 1);
  assert.equal(result.activation7d.rate, 100);
});

test("30 日付费：仅正式用户的会员单窗口内有效 PAID，退款/服务/分站/代理单排除", () => {
  const users = [
    { id: "paid-user", phone: "1", createdAt: "2026-08-01T00:00:00Z", createdAtEstimated: false },
    { id: "no-pay", phone: "2", createdAt: "2026-08-01T00:00:00Z", createdAtEstimated: false },
    { id: "recent-user", phone: "3", createdAt: "2026-09-01T00:00:00Z", createdAtEstimated: false },
    { id: "old-estimate", phone: "4", createdAt: "2026-08-01T00:00:00Z", createdAtEstimated: true },
    { id: "orphan", phone: null, email: null, createdAt: "2026-08-01T00:00:00Z", createdAtEstimated: false },
  ];
  const paidOrders = [
    { userId: "paid-user", orderType: "MEMBERSHIP", status: "PAID", paidAt: "2026-08-10T00:00:00Z" },
    { userId: "paid-user", orderType: "MEMBERSHIP", status: "PAID", paidAt: "2026-08-12T00:00:00Z" },
    { userId: "paid-user", orderType: "MEMBERSHIP", status: "REFUNDED", paidAt: "2026-08-15T00:00:00Z" },
    { userId: "no-pay", orderType: "SERVICE", status: "PAID", paidAt: "2026-08-10T00:00:00Z" },
    { userId: "no-pay", orderType: "SITE_ORDER", status: "PAID", paidAt: "2026-08-10T00:00:00Z" },
    { userId: "no-pay", orderType: "AGENT_RECHARGE", status: "PAID", paidAt: "2026-08-10T00:00:00Z" },
    { userId: "no-pay", orderType: "MEMBERSHIP", status: "PAID", paidAt: "2026-09-05T00:00:00Z" },
    { userId: "old-estimate", orderType: "MEMBERSHIP", status: "PAID", paidAt: "2026-08-10T00:00:00Z" },
    { userId: "orphan", orderType: "MEMBERSHIP", status: "PAID", paidAt: "2026-08-10T00:00:00Z" },
  ];
  const result = calculateAdminFunnel({ users, paidOrders, now });
  assert.equal(result.paid30d.numerator, 1);
  assert.equal(result.paid30d.denominator, 2);
  assert.equal(result.paid30d.rate, 50);
});

test("样本分母为零时比率为 null，而不是伪造 0%", () => {
  const result = calculateAdminFunnel({ now, users: [] });
  assert.equal(result.activation7d.rate, null);
  assert.equal(result.paid30d.rate, null);
});
