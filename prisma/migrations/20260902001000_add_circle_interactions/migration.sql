CREATE TABLE "CircleComment" (
  "id" TEXT NOT NULL, "postId" TEXT NOT NULL, "userId" TEXT, "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CircleComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CircleComment_postId_status_createdAt_idx" ON "CircleComment"("postId", "status", "createdAt");
ALTER TABLE "CircleComment" ADD CONSTRAINT "CircleComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CirclePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleComment" ADD CONSTRAINT "CircleComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "CircleLike" (
  "id" TEXT NOT NULL, "postId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "CircleLike_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CircleLike_postId_userId_key" ON "CircleLike"("postId", "userId");
CREATE INDEX "CircleLike_userId_createdAt_idx" ON "CircleLike"("userId", "createdAt");
ALTER TABLE "CircleLike" ADD CONSTRAINT "CircleLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CirclePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleLike" ADD CONSTRAINT "CircleLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
