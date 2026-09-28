import test from "node:test";
import assert from "node:assert/strict";
import { SERVICE_CATALOG, SERVICE_PLAN_CATALOG } from "../src/lib/service-catalog.js";

test("四项服务目录包含明确内容、价格和交付边界", () => {
  assert.equal(SERVICE_CATALOG.length, 4);
  for (const service of SERVICE_CATALOG) {
    assert.ok(service.title);
    assert.ok(service.short);
    assert.ok(service.audience.length > 0);
    assert.ok(service.deliverables.length > 0);
    assert.ok(service.boundary);
    for (const planId of service.productIds) {
      const plan = SERVICE_PLAN_CATALOG[planId];
      assert.ok(plan);
      assert.equal(plan.orderType, "SERVICE");
      assert.equal(plan.serviceOnly, true);
      assert.equal(plan.credits, 0);
      assert.equal(plan.membershipDays, 0);
    }
  }
});

test("服务 SKU 都是独立的服务商品配置", () => {
  for (const plan of Object.values(SERVICE_PLAN_CATALOG)) {
    assert.equal(plan.orderType, "SERVICE");
    assert.equal(plan.serviceOnly, true);
    assert.match(plan.id, /^(materials|training|consultation|showcase)/);
  }
});

test("服务商品不会意外提供会员或生成次数", () => {
  for (const plan of Object.values(SERVICE_PLAN_CATALOG)) {
    assert.equal(plan.membershipDays, 0);
    assert.equal(plan.credits, 0);
    assert.equal(plan.modelTier, null);
  }
});
