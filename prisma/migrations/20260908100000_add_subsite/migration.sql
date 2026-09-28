-- Subsite 表 + ManualOrder 分站归属
-- CREATE TABLE 用 Prisma migrate 生成，本文件为人工迁移时的手工 SQL 备份

-- DropIndex
DROP INDEX IF EXISTS "ManualOrder.subsiteId_idx";

-- CreateTable
CREATE TABLE "Subsite" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "siteName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "epayPid" TEXT NOT NULL,
    "epayKey" TEXT NOT NULL,
    "epayApiUrl" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subsite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subsite_ownerId_key" ON "Subsite"("ownerId");
CREATE UNIQUE INDEX "Subsite_slug_key" ON "Subsite"("slug");

-- AlterTable
ALTER TABLE "ManualOrder" ADD COLUMN "subsiteId" TEXT;
ALTER TABLE "ManualOrder" ADD COLUMN "siteCreditsCost" INTEGER NOT NULL DEFAULT 0;

-- ForeignKey
ALTER TABLE "ManualOrder" ADD CONSTRAINT "ManualOrder_subsiteId_fkey" FOREIGN KEY ("subsiteId") REFERENCES "Subsite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ManualOrder_subsiteId_idx" ON "ManualOrder"("subsiteId");
