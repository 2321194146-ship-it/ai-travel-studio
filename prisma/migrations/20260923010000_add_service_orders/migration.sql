ALTER TABLE "ManualOrder"
  ADD COLUMN "orderType" TEXT NOT NULL DEFAULT 'MEMBERSHIP',
  ADD COLUMN "deliveryStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "paymentTradeNo" TEXT,
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "nextFollowUpAt" TIMESTAMP(3);

CREATE INDEX "ManualOrder_orderType_idx" ON "ManualOrder"("orderType");
CREATE INDEX "ManualOrder_deliveryStatus_idx" ON "ManualOrder"("deliveryStatus");

UPDATE "ManualOrder"
SET "orderType" = CASE
  WHEN "subsiteId" IS NOT NULL OR "planId" LIKE 'single_%' THEN 'SITE_ORDER'
  WHEN "planId" LIKE 'agent_pack_%' THEN 'AGENT_RECHARGE'
  WHEN "planId" IN ('trial', 'high', 'flagship', 'refill') THEN 'MEMBERSHIP'
  ELSE 'SERVICE'
END,
"deliveryStatus" = CASE
  WHEN "planId" IN ('trial', 'high', 'flagship', 'refill') OR "subsiteId" IS NOT NULL OR "planId" LIKE 'single_%' OR "planId" LIKE 'agent_pack_%' THEN 'NOT_REQUIRED'
  WHEN "status" = 'PAID' THEN 'NOT_STARTED'
  WHEN "status" IN ('CANCELLED', 'REFUNDED') THEN 'CANCELLED'
  ELSE 'NOT_STARTED'
END;
