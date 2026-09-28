ALTER TABLE "ManualOrder"
  ADD COLUMN "collectionMode" TEXT,
  ADD COLUMN "collectionPid" TEXT,
  ADD COLUMN "siteCreditsReservedAt" TIMESTAMP(3),
  ADD COLUMN "siteCreditsReleasedAt" TIMESTAMP(3),
  ADD COLUMN "settlementStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "settlementAmount" INTEGER,
  ADD COLUMN "settlementNote" TEXT,
  ADD COLUMN "settledAt" TIMESTAMP(3),
  ADD COLUMN "settledById" TEXT,
  ADD COLUMN "platformFeeBps" INTEGER,
  ADD COLUMN "platformFeeAmount" INTEGER,
  ADD COLUMN "agentShareAmount" INTEGER,
  ADD COLUMN "platformFeeCredits" INTEGER,
  ADD COLUMN "siteLedgerStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED';

-- Historical orders get only inferable collection mode; do not invent a 70/30 snapshot for old orders.
UPDATE "ManualOrder" o
SET "collectionMode" = CASE WHEN s."epayPid" IS NULL THEN 'PLATFORM' ELSE 'AGENT' END,
    "collectionPid" = s."epayPid",
    "settlementStatus" = CASE WHEN s."epayPid" IS NULL AND o."status" = 'PAID' THEN 'PENDING' ELSE 'NOT_REQUIRED' END,
    "siteLedgerStatus" = CASE WHEN o."status" = 'REFUNDED' THEN 'REVERSED' ELSE 'NOT_REQUIRED' END
FROM "Subsite" s
WHERE o."subsiteId" = s."id" AND o."orderType" = 'SITE_ORDER';

CREATE INDEX "ManualOrder_collectionMode_status_idx" ON "ManualOrder"("collectionMode", "status");
CREATE INDEX "ManualOrder_settlementStatus_idx" ON "ManualOrder"("settlementStatus");
CREATE INDEX "ManualOrder_siteLedgerStatus_idx" ON "ManualOrder"("siteLedgerStatus");
