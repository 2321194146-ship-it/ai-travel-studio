import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";

// 发起比帅：用诊断分数创建一条 PENDING 战书
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录后再发起比帅" }, { status: 401 });
  const rl = checkRateLimit(`battle-start:${session.user.id}`, 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });

  try {
    const { score, scores, photoUrl } = await request.json();
    const overall = Math.round(Number(score));
    if (!Number.isFinite(overall) || overall < 0 || overall > 100) {
      return NextResponse.json({ error: "分数无效，请先完成 AI 诊断" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "账号已失效，请重新登录" }, { status: 401 });

    const battle = await prisma.battle.create({
      data: {
        initiatorId: user.id,
        initiatorScore: overall,
        initiatorScores: Array.isArray(scores) ? scores.slice(0, 3).map((n) => Math.round(Number(n) || 0)) : null,
        initiatorPhotoUrl: typeof photoUrl === "string" ? photoUrl : null,
        status: "PENDING",
      },
    });
    return NextResponse.json({ data: { battleId: battle.id } }, { status: 201 });
  } catch (error) {
    console.error("[BATTLE_START]", error.message);
    return NextResponse.json({ error: "创建战书失败，请稍后重试" }, { status: 500 });
  }
}
