-- 用户补注册时间字段；历史用户按"最早一条活动记录"回填（流水/生成/订单/诊断/照片），
-- 全无活动的账号回填为各表最早时间不可得，保留默认值 now() 之前的兜底：平台首单时间。
ALTER TABLE "User" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now();

UPDATE "User" u
SET "createdAt" = LEAST(
  COALESCE((SELECT MIN(l."createdAt") FROM "CreditLedger" l WHERE l."userId" = u.id), '2999-12-31'::timestamp),
  COALESCE((SELECT MIN(g."createdAt") FROM "Generation" g WHERE g."userId" = u.id), '2999-12-31'::timestamp),
  COALESCE((SELECT MIN(o."createdAt") FROM "ManualOrder" o WHERE o."userId" = u.id), '2999-12-31'::timestamp),
  COALESCE((SELECT MIN(d."createdAt") FROM "Diagnose" d WHERE d."userId" = u.id), '2999-12-31'::timestamp),
  COALESCE((SELECT MIN(p."createdAt") FROM "UserPhoto" p WHERE p."userId" = u.id), '2999-12-31'::timestamp)
)
WHERE LEAST(
  COALESCE((SELECT MIN(l."createdAt") FROM "CreditLedger" l WHERE l."userId" = u.id), '2999-12-31'::timestamp),
  COALESCE((SELECT MIN(g."createdAt") FROM "Generation" g WHERE g."userId" = u.id), '2999-12-31'::timestamp),
  COALESCE((SELECT MIN(o."createdAt") FROM "ManualOrder" o WHERE o."userId" = u.id), '2999-12-31'::timestamp),
  COALESCE((SELECT MIN(d."createdAt") FROM "Diagnose" d WHERE d."userId" = u.id), '2999-12-31'::timestamp),
  COALESCE((SELECT MIN(p."createdAt") FROM "UserPhoto" p WHERE p."userId" = u.id), '2999-12-31'::timestamp)
) < '2999-12-31'::timestamp;

-- 全无活动记录的账号（如圈子形象号）：用全平台最早活动时间兜底，避免显示成"今天注册"
UPDATE "User" u
SET "createdAt" = (SELECT MIN("createdAt") FROM "CreditLedger")
WHERE u."createdAt" > now() - interval '1 minute'
  AND NOT EXISTS (SELECT 1 FROM "CreditLedger" l WHERE l."userId" = u.id)
  AND NOT EXISTS (SELECT 1 FROM "Generation" g WHERE g."userId" = u.id)
  AND NOT EXISTS (SELECT 1 FROM "ManualOrder" o WHERE o."userId" = u.id)
  AND NOT EXISTS (SELECT 1 FROM "Diagnose" d WHERE d."userId" = u.id)
  AND NOT EXISTS (SELECT 1 FROM "UserPhoto" p WHERE p."userId" = u.id);

CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
