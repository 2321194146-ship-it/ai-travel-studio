import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { redeemCodeForUser } from "@/lib/entitlements";

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录后再兑换" }, { status: 401 });

  const userLimit = checkRateLimit(`redeem-user:${session.user.id}`, 5, 60_000);
  const ipLimit = checkRateLimit(`redeem-ip:${getClientIp(request)}`, 20, 60_000);
  const retryAfter = Math.max(userLimit.retryAfter || 0, ipLimit.retryAfter || 0);
  if (!userLimit.allowed || !ipLimit.allowed) {
    return NextResponse.json({ error: "操作太频繁，请稍后再试" }, { status: 429, headers: { "Retry-After": String(retryAfter || 60) } });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请输入有效的兑换码" }, { status: 400 });
  }

  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!/^XNM-[A-Z0-9]{5}(-[A-Z0-9]{5}){3}$/.test(code)) {
    return NextResponse.json({ error: "兑换码格式不正确" }, { status: 400 });
  }

  try {
    const result = await redeemCodeForUser(session.user.id, code);
    return NextResponse.json({
      data: {
        plan: { id: result.plan.id, name: result.plan.name, credits: result.plan.credits, membershipDays: result.plan.membershipDays },
        user: result.user,
      },
    });
  } catch (error) {
    const knownFailure = ["卡密不存在", "卡密已使用或已失效", "卡密已过期", "卡密套餐不存在", "该套餐不能通过兑换码兑换"]
      .includes(error?.message);
    if (knownFailure) {
      return NextResponse.json({ error: "兑换失败，请检查兑换码是否正确、是否已使用或已过期" }, { status: 400 });
    }
    console.error("兑换码兑换失败", error?.name || "UnknownError");
    return NextResponse.json({ error: "兑换暂时失败，请稍后重试" }, { status: 500 });
  }
}
