import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateInviteCode, INVITE_REWARDS } from "@/lib/battle.mjs";

// 邀请中心数据：我的邀请码（懒生成，兼容老用户）、邀请人数、累计奖励、最近邀请列表
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  let user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, inviteCode: true },
  });
  if (!user) return NextResponse.json({ error: "账号已失效，请重新登录" }, { status: 401 });

  if (!user.inviteCode) {
    // 老用户补发邀请码
    for (let i = 0; i < 5; i += 1) {
      try {
        const code = generateInviteCode();
        user = await prisma.user.update({ where: { id: user.id }, data: { inviteCode: code }, select: { id: true, inviteCode: true } });
        break;
      } catch (err) {
        if (i === 4) return NextResponse.json({ error: "邀请码生成失败，请稍后再试" }, { status: 500 });
      }
    }
  }

  const [referredCount, rewardSum, recentReferrals] = await Promise.all([
    prisma.user.count({ where: { referredById: user.id } }),
    prisma.creditLedger.aggregate({ where: { userId: user.id, sourceType: { in: ["INVITE_REWARD", "INVITE_BONUS"] } }, _sum: { amount: true } }),
    // User 表没有 createdAt；cuid 按时间有序，倒序取 id 即为最新
    prisma.user.findMany({
      where: { referredById: user.id },
      select: { id: true, name: true, phone: true },
      orderBy: { id: "desc" },
      take: 10,
    }),
  ]);

  return NextResponse.json({
    data: {
      inviteCode: user.inviteCode,
      referredCount,
      totalReward: rewardSum._sum.amount || 0,
      registerBonus: INVITE_REWARDS.REGISTER_BONUS_INVITEE,
      paymentRewards: INVITE_REWARDS.PAYMENT,
      recentReferrals: recentReferrals.map((item) => ({
        name: item.name,
        phoneTail: item.phone ? `****${item.phone.slice(-4)}` : "",
      })),
    },
  });
}
