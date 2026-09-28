CREATE TABLE "UserPhoto" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '未分类',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserPhoto_userId_createdAt_idx" ON "UserPhoto"("userId", "createdAt");
ALTER TABLE "UserPhoto" ADD CONSTRAINT "UserPhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
