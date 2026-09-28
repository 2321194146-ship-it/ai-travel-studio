import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scoreTitle, pickTauntLine, CRUSH_GAP, CRUSH_LINE } from "@/lib/battle.mjs";

// 应战结果：任何人可查看战书与结算（分享出去的落地页要能读）
export async function GET(request, { params }) {
  const { id } = await params;
  const battle = await prisma.battle.findUnique({
    where: { id },
    include: {
      initiator: { select: { name: true, phone: true, image: true } },
    },
  });
  if (!battle) return NextResponse.json({ error: "战书不存在或已过期" }, { status: 404 });

  const session = await getServerSession(authOptions);
  const viewerId = session?.user?.id || null;
  // 隐私：只暴露尾号
  const maskName = (user) => (user ? `${(user.name || "帅哥").slice(0, 6)}(${user.phone ? `****${user.phone.slice(-4)}` : "兄弟"})` : "神秘对手");

  const payload = {
    id: battle.id,
    status: battle.status,
    initiator: maskName(battle.initiator),
    initiatorScore: battle.initiatorScore,
    initiatorPhotoUrl: battle.initiatorPhotoUrl,
    challengerPhotoUrl: battle.challengerPhotoUrl,
    initiatorTitle: scoreTitle(battle.initiatorScore),
    createdAt: battle.createdAt,
    isMine: viewerId === battle.initiatorId,
  };

  if (battle.status === "FINISHED") {
    payload.challengerScore = battle.challengerScore;
    payload.initiatorScores = battle.initiatorScores || null;
    payload.challengerScores = battle.challengerScores || null;
    payload.winnerSide = battle.winnerId === battle.initiatorId ? "initiator" : "challenger";
    payload.gap = Math.abs(battle.initiatorScore - battle.challengerScore);
    payload.crush = battle.gapThreshold;
    payload.crushLine = battle.gapThreshold ? CRUSH_LINE : null;
    payload.tauntLine = battle.tauntLine;
  }
  return NextResponse.json({ data: payload });
}

// 应战结算：应战方提交自己的诊断分数，锁定胜负
export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录后再应战" }, { status: 401 });

  try {
    const { id } = await params;
    const { score, scores, photoUrl } = await request.json();
    const challengerScore = Math.round(Number(score));
    if (!Number.isFinite(challengerScore) || challengerScore < 0 || challengerScore > 100) {
      return NextResponse.json({ error: "分数无效，请先完成 AI 诊断" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 行级抢占：只能结算一次
      const claimed = await tx.battle.updateMany({
        where: { id, status: "PENDING", initiatorId: { not: session.user.id } },
        data: { status: "FINISHED", challengerScore, challengerScores: Array.isArray(scores) ? scores.slice(0, 3).map((n) => Math.round(Number(n) || 0)) : null, challengerPhotoUrl: typeof photoUrl === "string" ? photoUrl : null, finishedAt: new Date() },
      });
      if (claimed.count === 0) return null;
      const battle = await tx.battle.findUnique({ where: { id } });
      const gap = Math.abs(battle.initiatorScore - challengerScore);
      const winnerId = battle.initiatorScore >= challengerScore ? battle.initiatorId : session.user.id;
      const loserId = battle.initiatorScore >= challengerScore ? session.user.id : battle.initiatorId;
      const updated = await tx.battle.update({
        where: { id },
        data: {
          winnerId,
          loserId,
          gapThreshold: gap >= CRUSH_GAP,
          tauntLine: pickTauntLine(),
        },
      });
      return updated;
    });

    if (!result) return NextResponse.json({ error: "这场对决已经结算，或这是你自己发的战书" }, { status: 409 });
    return NextResponse.json({ data: { battleId: result.id, status: "FINISHED" } });
  } catch (error) {
    console.error("[BATTLE_ACCEPT]", error.message);
    return NextResponse.json({ error: "应战失败，请稍后重试" }, { status: 500 });
  }
}
