-- 平台代收分站的打款申请：代理提交收款码，管理员线下扫码后标记已打款
CREATE TABLE "SiteSettlementRequest" (
    "id" TEXT NOT NULL,
    "subsiteId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "orderIds" JSONB NOT NULL,
    "collectQrUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSettlementRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SiteSettlementRequest_status_createdAt_idx" ON "SiteSettlementRequest"("status", "createdAt");
CREATE INDEX "SiteSettlementRequest_subsiteId_status_idx" ON "SiteSettlementRequest"("subsiteId", "status");

ALTER TABLE "SiteSettlementRequest" ADD CONSTRAINT "SiteSettlementRequest_subsiteId_fkey" FOREIGN KEY ("subsiteId") REFERENCES "Subsite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
