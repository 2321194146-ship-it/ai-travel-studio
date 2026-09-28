-- 比帅大赛：邀请关系 + 对战记录
ALTER TABLE "User" ADD COLUMN "inviteCode" TEXT;
ALTER TABLE "User" ADD COLUMN "referredById" TEXT;
CREATE UNIQUE INDEX "User_inviteCode_key" ON "User"("inviteCode");
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Battle" (
    "id" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "winnerId" TEXT,
    "loserId" TEXT,
    "initiatorScore" INTEGER NOT NULL,
    "challengerScore" INTEGER,
    "initiatorScores" JSONB,
    "challengerScores" JSONB,
    "initiatorPhotoUrl" TEXT,
    "challengerPhotoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "gapThreshold" BOOLEAN NOT NULL DEFAULT false,
    "tauntLine" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Battle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Battle_initiatorId_idx" ON "Battle"("initiatorId");
CREATE INDEX "Battle_winnerId_idx" ON "Battle"("winnerId");
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_loserId_fkey" FOREIGN KEY ("loserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
