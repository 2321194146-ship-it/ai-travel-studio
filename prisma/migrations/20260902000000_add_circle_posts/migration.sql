-- Circle posts are moderated before publication.
CREATE TABLE "CirclePost" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "content" TEXT NOT NULL,
  "imageUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "isSeed" BOOLEAN NOT NULL DEFAULT false,
  "likes" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CirclePost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CirclePost_status_createdAt_idx" ON "CirclePost"("status", "createdAt");
CREATE INDEX "CirclePost_userId_createdAt_idx" ON "CirclePost"("userId", "createdAt");
ALTER TABLE "CirclePost" ADD CONSTRAINT "CirclePost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
