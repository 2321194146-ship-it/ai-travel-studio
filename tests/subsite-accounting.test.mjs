import test from "node:test";
import assert from "node:assert/strict";
import {
  SITE_COLLECTION_MODES,
  SITE_PLATFORM_FEE_BPS,
  calculateSiteSplit,
  siteCollectionMode,
  siteTenantHost,
  isValidSiteHost,
  canRequestSettlement,
} from "../src/lib/subsite-accounting.mjs";

test("结算申请资格：仅平台代收、有待结金额、无进行中申请", () => {
  assert.deepEqual(canRequestSettlement({ payMode: "PLATFORM", pendingAmount: 2093, hasPendingRequest: false }), { ok: true, amount: 2093 });
  assert.equal(canRequestSettlement({ payMode: "AGENT", pendingAmount: 2093, hasPendingRequest: false }).ok, false);
  assert.equal(canRequestSettlement({ payMode: "PLATFORM", pendingAmount: 0, hasPendingRequest: false }).ok, false);
  assert.equal(canRequestSettlement({ payMode: "PLATFORM", pendingAmount: 2093, hasPendingRequest: true }).ok, false);
  // 小数金额会被取整为分
  assert.equal(canRequestSettlement({ payMode: "PLATFORM", pendingAmount: "2093.7", hasPendingRequest: false }).amount, 2093);
});

test("分站分账：按实付金额 70/30，平台份额折算供货扣分向上取整", () => {
  // ¥29.90 = 2990 分 → 平台 897 分、代理 2093 分；897 分 → 8.97 → 扣 9 分
  assert.deepEqual(calculateSiteSplit(2990), {
    platformFeeBps: 3000,
    platformFeeAmount: 897,
    agentShareAmount: 2093,
    platformFeeCredits: 9,
  });
  // ¥39.90 = 3990 分 → 平台 1197 分、代理 2793 分；扣 12 分
  const hd = calculateSiteSplit(3990);
  assert.equal(hd.platformFeeAmount, 1197);
  assert.equal(hd.agentShareAmount, 2793);
  assert.equal(hd.platformFeeCredits, 12);
  // ¥69.90 = 6990 分 → 平台 2097 分、代理 4893 分；扣 21 分
  const flag = calculateSiteSplit(6990);
  assert.equal(flag.platformFeeAmount, 2097);
  assert.equal(flag.agentShareAmount, 4893);
  assert.equal(flag.platformFeeCredits, 21);
  // 平台 + 代理 = 实付，分账不丢钱
  for (const amount of [2990, 3990, 6990, 1, 999999]) {
    const s = calculateSiteSplit(amount);
    assert.equal(s.platformFeeAmount + s.agentShareAmount, amount);
  }
  // 边界：0 元与非正常费率
  assert.equal(calculateSiteSplit(0).platformFeeCredits, 0);
  assert.equal(calculateSiteSplit(10000, 0).platformFeeAmount, 0);
  assert.equal(calculateSiteSplit(10000, 10000).agentShareAmount, 0);
  assert.equal(SITE_PLATFORM_FEE_BPS, 3000);
});

test("分站收款模式：三件齐全为自有商户，全空为平台代收，部分填写必须报配置错误", () => {
  assert.equal(siteCollectionMode({ epayPid: "P", epayKey: "K", epayApiUrl: "https://pay.example.com" }), SITE_COLLECTION_MODES.AGENT);
  assert.equal(siteCollectionMode({ epayPid: "", epayKey: "", epayApiUrl: "" }), SITE_COLLECTION_MODES.PLATFORM);
  assert.equal(siteCollectionMode({ epayPid: "P", epayKey: "", epayApiUrl: "" }), null);
  assert.equal(siteCollectionMode({ epayPid: "", epayKey: "K", epayApiUrl: "https://pay.example.com" }), null);
  assert.equal(siteCollectionMode({}), SITE_COLLECTION_MODES.PLATFORM);
  assert.equal(siteCollectionMode(null), null);
  // undefined 同样无配置可判定
  assert.equal(siteCollectionMode(undefined), null);
});

test("分站域名：统一为主域前缀形式", () => {
  assert.equal(siteTenantHost("Demo"), "demo.face.shuqizhisou.cc");
  assert.ok(isValidSiteHost("demo.face.shuqizhisou.cc", "demo"));
  assert.ok(isValidSiteHost("DEMO.FACE.SHUQIZHISOU.CC", "demo"));
  assert.equal(isValidSiteHost("demo.pages.dev", "demo"), false);
  assert.equal(isValidSiteHost("evil.face.shuqizhisou.cc", "demo"), false);
  assert.equal(isValidSiteHost("", "demo"), false);
});
