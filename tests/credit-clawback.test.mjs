import test from "node:test";
import assert from "node:assert/strict";
import { clawbackCredits } from "../src/lib/credit-clawback.mjs";

function makeTx({ ownerCredits = 100 } = {}) {
  const calls = { ledger: [] };
  let credits = ownerCredits;
  const tx = {
    user: {
      findUnique: async () => ({ credits }),
      update: async ({ data }) => {
        if (data.credits?.decrement) credits -= data.credits.decrement;
        return { credits };
      },
    },
    creditLedger: { create: async ({ data }) => { calls.ledger.push(data); return data; } },
  };
  return { tx, calls, getCredits: () => credits };
}

test("退款收回：按订单发放次数全额扣回并写流水", async () => {
  const { tx, calls, getCredits } = makeTx({ ownerCredits: 116 });
  const r = await clawbackCredits(tx, { userId: "u1", credits: 8, planName: "体验卡", sourceId: "o1" });
  assert.equal(r.deducted, 8);
  assert.equal(getCredits(), 108);
  assert.equal(calls.ledger[0].amount, -8);
  assert.equal(calls.ledger[0].sourceType, "REFUND_CLAWBACK");
});

test("退款收回：余额不足时只扣到 0，不产生负数", async () => {
  const { tx, calls, getCredits } = makeTx({ ownerCredits: 3 });
  const r = await clawbackCredits(tx, { userId: "u1", credits: 90, planName: "旗舰精修卡", sourceId: "o2" });
  assert.equal(r.deducted, 3);
  assert.equal(getCredits(), 0);
  assert.equal(calls.ledger[0].amount, -3);
});

test("退款收回：余额为 0 或无次数可扣时空转不写流水", async () => {
  const { tx, calls } = makeTx({ ownerCredits: 0 });
  const r = await clawbackCredits(tx, { userId: "u1", credits: 8, planName: "体验卡", sourceId: "o3" });
  assert.equal(r.deducted, 0);
  assert.equal(r.skipped, "zero-balance");
  assert.equal(calls.ledger.length, 0);
});

test("退款收回：次数为 0 或缺用户时空转", async () => {
  const { tx, calls } = makeTx();
  const r1 = await clawbackCredits(tx, { userId: "u1", credits: 0, planName: "x", sourceId: "o4" });
  assert.equal(r1.skipped, "nothing-to-claw");
  const r2 = await clawbackCredits(tx, { userId: "", credits: 8, planName: "x", sourceId: "o5" });
  assert.equal(r2.skipped, "nothing-to-claw");
  assert.equal(calls.ledger.length, 0);
});
