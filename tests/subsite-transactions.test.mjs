import test from "node:test";
import assert from "node:assert/strict";
import {
  reserveSiteFee,
  releaseSiteFee,
  settleSiteOrderOnPaid,
  reverseSiteOrderOnRefund,
} from "../src/lib/site-order-transactions.js";

// 极简事务桩：模拟 Prisma tx 的关键调用，验证账务动作的幂等与记账路径。
function makeTx({ ownerCredits = 1000 } = {}) {
  const calls = { userUpdate: [], ledger: [], orderUpdate: [], updateMany: [] };
  let credits = ownerCredits;
  const tx = {
    user: {
      update: async ({ where, data, select }) => {
        if (data.credits?.decrement) credits -= data.credits.decrement;
        if (data.credits?.increment) credits += data.credits.increment;
        calls.userUpdate.push({ id: where.id, credits });
        return { credits };
      },
      updateMany: async ({ where, data }) => {
        calls.updateMany.push(where);
        if ((where.credits?.gte ?? 0) > credits) return { count: 0 };
        if (data.credits?.decrement) credits -= data.credits.decrement;
        return { count: 1 };
      },
      findUnique: async () => ({ credits }),
    },
    creditLedger: { create: async ({ data }) => { calls.ledger.push(data); return data; } },
    manualOrder: { update: async ({ where, data }) => { calls.orderUpdate.push({ id: where.id, data }); return data; } },
  };
  return { tx, calls, getCredits: () => credits };
}

function makeOrder(overrides = {}) {
  return {
    id: "order-1",
    planName: "AI写真·单张标准",
    orderType: "SITE_ORDER",
    subsiteId: "sub-1",
    collectionMode: "AGENT",
    platformFeeCredits: 9,
    siteLedgerStatus: "NOT_REQUIRED",
    siteCreditsReservedAt: null,
    siteCreditsReleasedAt: null,
    settlementStatus: "NOT_REQUIRED",
    settlementAmount: null,
    subsite: { ownerId: "owner-1" },
    ...overrides,
  };
}

test("AGENT 预扣：扣平台份额积分、写流水、订单转 RESERVED", async () => {
  const { tx, calls, getCredits } = makeTx({ ownerCredits: 1000 });
  await reserveSiteFee(tx, makeOrder());
  assert.equal(getCredits(), 1000 - 9);
  assert.equal(calls.updateMany.length, 1); // 余额条件扣减（不足即失败）
  assert.equal(calls.ledger.length, 1);
  assert.equal(calls.ledger[0].amount, -9);
  assert.equal(calls.ledger[0].sourceType, "SITE_ORDER_RESERVE");
  assert.equal(calls.orderUpdate[0].data.siteLedgerStatus, "RESERVED");
});

test("AGENT 预扣：余额不足抛错且不写流水", async () => {
  const { tx, calls } = makeTx({ ownerCredits: 5 });
  await assert.rejects(() => reserveSiteFee(tx, makeOrder()), /积分余额不足/);
  assert.equal(calls.ledger.length, 0);
  assert.equal(calls.orderUpdate.length, 0);
});

test("AGENT 预扣幂等：RESERVED 状态重复调用不再扣", async () => {
  const { tx, calls } = makeTx({ ownerCredits: 1000 });
  await reserveSiteFee(tx, makeOrder({ siteLedgerStatus: "RESERVED" }));
  assert.equal(calls.ledger.length, 0);
  assert.equal(calls.userUpdate.length, 0);
});

test("AGENT 支付确认：RESERVED 转 CHARGED，不再二次扣款", async () => {
  const { tx, calls } = makeTx();
  const order = makeOrder({ siteLedgerStatus: "RESERVED" });
  await settleSiteOrderOnPaid(tx, order);
  assert.equal(calls.orderUpdate[0].data.siteLedgerStatus, "CHARGED");
  assert.equal(calls.ledger.length, 0);
});

test("AGENT 支付确认：无预扣记录时先补扣再 CHARGED（人工确认兜底）", async () => {
  const { tx, calls, getCredits } = makeTx({ ownerCredits: 1000 });
  await settleSiteOrderOnPaid(tx, makeOrder());
  assert.equal(getCredits(), 991);
  assert.equal(calls.ledger[0].sourceType, "SITE_ORDER_RESERVE");
  assert.equal(calls.orderUpdate.at(-1).data.siteLedgerStatus, "CHARGED");
});

test("AGENT 取消：RESERVED 释放预扣", async () => {
  const { tx, calls, getCredits } = makeTx({ ownerCredits: 991 });
  await releaseSiteFee(tx, makeOrder({ siteLedgerStatus: "RESERVED" }));
  assert.equal(getCredits(), 1000);
  assert.equal(calls.ledger[0].sourceType, "SITE_ORDER_RELEASE");
  assert.equal(calls.orderUpdate[0].data.siteLedgerStatus, "RELEASED");
});

test("PLATFORM 支付确认：不扣代理积分，记待结算与 70% 应结", async () => {
  const { tx, calls } = makeTx();
  const order = makeOrder({ collectionMode: "PLATFORM", platformFeeCredits: 0, agentShareAmount: 2093, subsite: { ownerId: "owner-1" } });
  await settleSiteOrderOnPaid(tx, order);
  assert.equal(calls.ledger.length, 0); // 平台代收不扣代理积分
  assert.equal(calls.orderUpdate[0].data.siteLedgerStatus, "PLATFORM_DUE");
  assert.equal(calls.orderUpdate[0].data.settlementStatus, "PENDING");
  assert.equal(calls.orderUpdate[0].data.settlementAmount, 2093);
});

test("PLATFORM 退款：待结算关闭为冲正", async () => {
  const { tx, calls } = makeTx();
  const order = makeOrder({ collectionMode: "PLATFORM", platformFeeCredits: 0, agentShareAmount: 2093, settlementStatus: "PENDING", settlementAmount: 2093 });
  await reverseSiteOrderOnRefund(tx, order);
  assert.equal(calls.orderUpdate[0].data.siteLedgerStatus, "REVERSED");
  assert.equal(calls.orderUpdate[0].data.settlementStatus, "NOT_REQUIRED");
});

test("PLATFORM 已结算退款：拒绝自动冲正，必须人工处理", async () => {
  const { tx, calls } = makeTx();
  const order = makeOrder({ collectionMode: "PLATFORM", platformFeeCredits: 0, settlementStatus: "SETTLED", settlementAmount: 2093 });
  await assert.rejects(() => reverseSiteOrderOnRefund(tx, order), /已结算/);
  assert.equal(calls.orderUpdate.length, 0);
});

test("AGENT CHARGED 退款：冲回平台份额并转 REVERSED", async () => {
  const { tx, calls, getCredits } = makeTx({ ownerCredits: 991 });
  await reverseSiteOrderOnRefund(tx, makeOrder({ siteLedgerStatus: "CHARGED" }));
  assert.equal(getCredits(), 1000);
  assert.equal(calls.ledger[0].sourceType, "SITE_ORDER_REVERSAL");
  assert.equal(calls.orderUpdate[0].data.siteLedgerStatus, "REVERSED");
});

test("RELEASED 状态拒绝确认收款（防止取消后又被标记支付）", async () => {
  const { tx, calls } = makeTx();
  await assert.rejects(() => settleSiteOrderOnPaid(tx, makeOrder({ siteLedgerStatus: "RELEASED" })), /供货状态异常/);
  assert.equal(calls.orderUpdate.length, 0);
});
