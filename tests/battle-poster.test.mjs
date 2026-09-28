import test from "node:test";
import assert from "node:assert/strict";

test("battle.mjs：称号分档与奖励映射", async () => {
  const { scoreTitle, paymentRewardFor, pickTauntLine, CRUSH_GAP } = await import("../src/lib/battle.mjs");
  assert.equal(scoreTitle(95), "校级门面担当");
  assert.equal(scoreTitle(85), "街区刘德华");
  assert.equal(scoreTitle(75), "潜力股男一号");
  assert.equal(scoreTitle(65), "朴素老实人");
  assert.equal(scoreTitle(30), "神秘卧底");
  assert.equal(paymentRewardFor("trial"), 3);
  assert.equal(paymentRewardFor("high"), 10);
  assert.equal(paymentRewardFor("flagship"), 20);
  assert.equal(paymentRewardFor("refill"), 5);
  assert.equal(paymentRewardFor("nope"), 0);
  assert.ok(pickTauntLine().length > 5);
  assert.equal(CRUSH_GAP, 20);
});

test("battle.mjs：邀请码格式", async () => {
  const { generateInviteCode } = await import("../src/lib/battle.mjs");
  const code = generateInviteCode();
  assert.match(code, /^[23456789A-HJ-NP-Z]{8}$/);
});
