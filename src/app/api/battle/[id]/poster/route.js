import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scoreTitle } from "@/lib/battle.mjs";
import { composeBattlePoster } from "@/lib/battle-poster";
import { publicLineUrl } from "@/lib/public-line";

const STYLES = new Set(["war-boxing", "war-gentleman", "war-street", "win", "lose"]);

// 比帅海报：战书（发起人视角）与胜负（结算后）。公开可看——比分本来就是发出去让人看的。
export async function GET(request, { params }) {
  const { id } = await params;
  const url = new URL(request.url);
  const style = url.searchParams.get("style") || "war-boxing";
  if (!STYLES.has(style)) return NextResponse.json({ error: "未知海报样式" }, { status: 400 });

  const battle = await prisma.battle.findUnique({ where: { id } });
  if (!battle) return NextResponse.json({ error: "战书不存在" }, { status: 404 });

  const initiator = await prisma.user.findUnique({ where: { id: battle.initiatorId }, select: { inviteCode: true } });
  const cta = publicLineUrl(`/?battle=${battle.id}${initiator?.inviteCode ? `&ref=${initiator.inviteCode}` : ""}`);

  try {
    let buf;
    if (style === "win" || style === "lose") {
      if (battle.status !== "FINISHED") return NextResponse.json({ error: "对决尚未结算" }, { status: 409 });
      const initiatorWin = battle.winnerId === battle.initiatorId;
      const winnerPhoto = initiatorWin ? battle.initiatorPhotoUrl : battle.challengerPhotoUrl;
      const loserPhoto = initiatorWin ? battle.challengerPhotoUrl : battle.initiatorPhotoUrl;
      buf = await composeBattlePoster(style, {
        gap: Math.abs(battle.initiatorScore - (battle.challengerScore || 0)),
        tauntLine: battle.tauntLine || "AI 说你输在发际线管理",
        photoUrl: winnerPhoto,
        photoUrl2: loserPhoto,
        ctaUrl: cta,
      });
    } else {
      const scores = Array.isArray(battle.initiatorScores) && battle.initiatorScores.length === 3
        ? battle.initiatorScores
        : [battle.initiatorScore, battle.initiatorScore, battle.initiatorScore];
      buf = await composeBattlePoster(style, {
        scores,
        title: scoreTitle(battle.initiatorScore),
        photoUrl: battle.initiatorPhotoUrl,
        ctaUrl: cta,
      });
    }
    return new NextResponse(buf, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": battle.status === "FINISHED" ? "public, max-age=86400" : "public, max-age=300" },
    });
  } catch (error) {
    console.error("[BATTLE_POSTER]", error.message);
    return NextResponse.json({ error: "海报生成失败" }, { status: 500 });
  }
}
