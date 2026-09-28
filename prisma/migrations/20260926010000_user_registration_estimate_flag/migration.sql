-- 历史 User.createdAt 按最早业务活动回填，不能冒充真实注册时间；标记迁移前已有账号为估算值。
ALTER TABLE "User" ADD COLUMN "createdAtEstimated" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "createdAtEstimated" = true;UPDATE "User" SET "createdAtEstimated" = true;
