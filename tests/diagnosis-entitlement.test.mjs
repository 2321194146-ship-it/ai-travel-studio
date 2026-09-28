import test from "node:test";
import assert from "node:assert/strict";
import { FREE_DIAGNOSIS_LIMIT, getDiagnosisQuota } from "../src/lib/diagnosis-entitlement.mjs";

test("未付费用户只有累计3次免费诊断", () => {
  assert.equal(FREE_DIAGNOSIS_LIMIT, 3);
  assert.deepEqual(
    getDiagnosisQuota({ membership: "NONE", totalCount: 2, todayCount: 9 }),
    { isMember: false, scope: "lifetime", limit: 3, used: 2, remaining: 1 },
  );
  assert.equal(getDiagnosisQuota({ membership: "NONE", totalCount: 3 }).remaining, 0);
});

test("有有效会员的用户按天获得3次诊断", () => {
  const now = new Date("2026-09-11T00:00:00.000Z");
  assert.deepEqual(
    getDiagnosisQuota({ membership: "HIGH", membershipExpiresAt: "2026-09-30T00:00:00.000Z", totalCount: 50, todayCount: 2, now }),
    { isMember: true, scope: "daily", limit: 3, used: 2, remaining: 1 },
  );
});

test("补充包没有会员有效期，不解锁每日诊断", () => {
  assert.equal(
    getDiagnosisQuota({ membership: "NONE", membershipExpiresAt: null, totalCount: 3, todayCount: 0 }).scope,
    "lifetime",
  );
});

test("会员到期后回到累计免费额度规则", () => {
  const now = new Date("2026-09-11T00:00:00.000Z");
  const quota = getDiagnosisQuota({ membership: "STANDARD", membershipExpiresAt: "2026-09-10T00:00:00.000Z", totalCount: 3, todayCount: 0, now });
  assert.equal(quota.isMember, false);
  assert.equal(quota.remaining, 0);
});
