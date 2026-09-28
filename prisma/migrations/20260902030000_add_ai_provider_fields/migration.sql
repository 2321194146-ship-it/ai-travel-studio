-- 统一 AI 服务层：记录实际供应商、实际模型与失败原因（均不含 API Key）
-- AlterTable
ALTER TABLE "Generation" ADD COLUMN "provider" TEXT;
ALTER TABLE "Generation" ADD COLUMN "actualModel" TEXT;
ALTER TABLE "Generation" ADD COLUMN "failureReason" TEXT;
